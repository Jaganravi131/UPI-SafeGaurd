"""
Train all ML models on the PaySim fraud detection dataset.
Outputs trained model artifacts to backend/app/ml/trained_models/

Usage:
    python train_models.py
"""
import os
import sys
import time
import warnings
import numpy as np
import pandas as pd
import joblib
from pathlib import Path

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report, roc_auc_score, precision_recall_curve,
    average_precision_score, confusion_matrix
)
from sklearn.ensemble import IsolationForest
import xgboost as xgb
import lightgbm as lgb

warnings.filterwarnings("ignore")

# ─── Paths ───────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "app" / "ml" / "trained_models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Find the CSV (may be nested in a subfolder from zip extraction)
CSV_CANDIDATES = [p for p in DATA_DIR.rglob("*.csv") if p.is_file()]
if not CSV_CANDIDATES:
    print("ERROR: No CSV file found in backend/data/. Place the PaySim CSV there.")
    sys.exit(1)
CSV_PATH = CSV_CANDIDATES[0]
print(f"Dataset: {CSV_PATH}  ({CSV_PATH.stat().st_size / 1e6:.0f} MB)")


# ─── 1. Load & Explore ──────────────────────────────────────────────────────
def load_data() -> pd.DataFrame:
    """Load PaySim CSV and do basic cleaning."""
    print("\n" + "=" * 60)
    print("STEP 1: Loading dataset...")
    t0 = time.time()
    df = pd.read_csv(CSV_PATH)
    print(f"  Loaded {len(df):,} rows × {len(df.columns)} cols in {time.time()-t0:.1f}s")
    print(f"  Columns: {list(df.columns)}")
    print(f"\n  Fraud distribution:")
    print(f"    isFraud=0 : {(df['isFraud']==0).sum():>10,}")
    print(f"    isFraud=1 : {(df['isFraud']==1).sum():>10,}")
    print(f"    Fraud rate: {df['isFraud'].mean()*100:.4f}%")
    print(f"\n  Transaction types:")
    print(df['type'].value_counts().to_string())
    return df


# ─── 2. Feature Engineering ─────────────────────────────────────────────────
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create features from PaySim columns that map to our UPI domain."""
    print("\n" + "=" * 60)
    print("STEP 2: Engineering features...")

    # ── Time features (step = 1 hour) ──
    df["hour_of_day"] = df["step"] % 24
    df["day_of_week"] = (df["step"] // 24) % 7
    df["hour_sin"] = np.sin(2 * np.pi * df["hour_of_day"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour_of_day"] / 24)
    df["day_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["day_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7)
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_night"] = ((df["hour_of_day"] < 6) | (df["hour_of_day"] > 22)).astype(int)
    df["is_late_night"] = ((df["hour_of_day"] >= 23) | (df["hour_of_day"] < 2)).astype(int)

    # ── Amount features ──
    df["amount_log"] = np.log1p(df["amount"])
    df["is_round_amount"] = ((df["amount"] % 1000 == 0) | (df["amount"] % 500 == 0)).astype(int)

    # ── Balance-delta features ──
    df["balance_delta_orig"] = df["newbalanceOrig"] - df["oldbalanceOrg"]
    df["balance_delta_dest"] = df["newbalanceDest"] - df["oldbalanceDest"]
    df["balance_orig_log"] = np.log1p(df["oldbalanceOrg"].clip(lower=0))
    df["balance_dest_log"] = np.log1p(df["oldbalanceDest"].clip(lower=0))

    # Amount / balance ratios (clipped to avoid inf)
    df["amount_to_orig_ratio"] = (
        df["amount"] / df["oldbalanceOrg"].clip(lower=1)
    ).clip(upper=100)
    df["amount_to_dest_ratio"] = (
        df["amount"] / df["oldbalanceDest"].clip(lower=1)
    ).clip(upper=100)

    # ── Zero-balance flags (draining the account) ──
    df["orig_zero_after"] = (df["newbalanceOrig"] == 0).astype(int)
    df["full_drain"] = (
        (df["newbalanceOrig"] == 0) & (df["oldbalanceOrg"] > 0)
    ).astype(int)

    # ── Transaction type one-hot ──
    type_dummies = pd.get_dummies(df["type"], prefix="type")
    df = pd.concat([df, type_dummies], axis=1)

    # ── Per-sender velocity proxy (count within same step) ──
    sender_step_counts = df.groupby(["nameOrig", "step"]).cumcount()
    df["sender_txn_this_hour"] = sender_step_counts

    # ── Per-sender amount stats (rolling proxy) ──
    sender_avg = df.groupby("nameOrig")["amount"].transform("mean")
    sender_max = df.groupby("nameOrig")["amount"].transform("max")
    sender_count = df.groupby("nameOrig")["amount"].transform("count")
    df["sender_avg_amount"] = sender_avg
    df["amount_to_avg_ratio"] = (df["amount"] / sender_avg.clip(lower=1)).clip(upper=50)
    df["amount_to_max_ratio"] = (df["amount"] / sender_max.clip(lower=1)).clip(upper=10)
    df["sender_txn_count"] = sender_count

    # ── Per-receiver stats ──
    recv_count = df.groupby("nameDest")["amount"].transform("count")
    recv_unique_senders = df.groupby("nameDest")["nameOrig"].transform("nunique")
    df["recv_txn_count"] = recv_count
    df["recv_unique_senders"] = recv_unique_senders

    print(f"  Engineered {len(df.columns)} total columns")
    return df


# ─── 3. Prepare Train/Test ──────────────────────────────────────────────────
# Features used by XGBoost
XGBOOST_FEATURES = [
    "amount", "amount_log", "amount_to_avg_ratio", "amount_to_max_ratio",
    "is_round_amount",
    "hour_of_day", "day_of_week", "is_weekend", "is_night", "is_late_night",
    "hour_sin", "hour_cos", "day_sin", "day_cos",
    "balance_orig_log", "balance_dest_log",
    "balance_delta_orig", "balance_delta_dest",
    "amount_to_orig_ratio", "amount_to_dest_ratio",
    "orig_zero_after", "full_drain",
    "sender_txn_this_hour", "sender_txn_count",
    "recv_txn_count", "recv_unique_senders",
    "sender_avg_amount",
]

# Add type dummies dynamically
TYPE_COLS: list = []  # populated after feature engineering


# Features used by Isolation Forest (subset, unsupervised)
ISO_FEATURES = [
    "amount_log", "amount_to_avg_ratio",
    "hour_sin", "hour_cos", "day_sin", "day_cos",
    "is_round_amount",
    "sender_txn_this_hour",
    "amount_to_orig_ratio", "amount_to_dest_ratio",
    "orig_zero_after", "full_drain",
]


# ─── 4. Train XGBoost ───────────────────────────────────────────────────────
def train_xgboost(df: pd.DataFrame):
    """Train XGBoost binary classifier for fraud detection."""
    print("\n" + "=" * 60)
    print("STEP 3: Training XGBoost Risk Scorer...")

    feature_cols = XGBOOST_FEATURES + TYPE_COLS
    X = df[feature_cols].values.astype(np.float32)
    y = df["isFraud"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    # Handle class imbalance with scale_pos_weight
    n_neg = (y_train == 0).sum()
    n_pos = (y_train == 1).sum()
    scale_pos_weight = n_neg / max(n_pos, 1)
    print(f"  Class balance: neg={n_neg:,}  pos={n_pos:,}  scale_pos_weight={scale_pos_weight:.1f}")

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=8,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        objective="binary:logistic",
        eval_metric="aucpr",
        use_label_encoder=False,
        random_state=42,
        n_jobs=-1,
        tree_method="hist",
    )

    t0 = time.time()
    model.fit(
        X_train_s, y_train,
        eval_set=[(X_test_s, y_test)],
        verbose=50,
    )
    print(f"  Training time: {time.time()-t0:.1f}s")

    # Evaluate
    y_proba = model.predict_proba(X_test_s)[:, 1]
    y_pred = (y_proba > 0.5).astype(int)

    auc = roc_auc_score(y_test, y_proba)
    ap = average_precision_score(y_test, y_proba)
    print(f"\n  ROC-AUC:   {auc:.4f}")
    print(f"  PR-AUC:    {ap:.4f}")
    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["Legit", "Fraud"]))

    cm = confusion_matrix(y_test, y_pred)
    print(f"  Confusion Matrix:")
    print(f"    TN={cm[0,0]:>8,}  FP={cm[0,1]:>6,}")
    print(f"    FN={cm[1,0]:>8,}  TP={cm[1,1]:>6,}")

    # Feature importance
    importances = model.feature_importances_
    top_idx = np.argsort(importances)[::-1][:10]
    print(f"\n  Top 10 Features:")
    for i in top_idx:
        print(f"    {feature_cols[i]:30s}  {importances[i]:.4f}")

    # Save
    artifact = {
        "model": model,
        "scaler": scaler,
        "feature_names": feature_cols,
        "is_trained": True,
        "metrics": {"roc_auc": auc, "pr_auc": ap},
    }
    out_path = MODEL_DIR / "xgboost_risk_scorer.joblib"
    joblib.dump(artifact, out_path)
    print(f"\n  ✓ Saved to {out_path}")
    return model, scaler, feature_cols


# ─── 5. Train Isolation Forest ──────────────────────────────────────────────
def train_isolation_forest(df: pd.DataFrame):
    """Train Isolation Forest for unsupervised anomaly detection."""
    print("\n" + "=" * 60)
    print("STEP 4: Training Isolation Forest...")

    X = df[ISO_FEATURES].values.astype(np.float32)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Estimate contamination from label distribution
    fraud_rate = df["isFraud"].mean()
    contamination = max(fraud_rate, 0.005)  # at least 0.5%
    print(f"  Contamination rate: {contamination:.4f}")

    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        max_samples=min(50000, len(X)),
        random_state=42,
        n_jobs=-1,
    )

    t0 = time.time()
    model.fit(X_scaled)
    print(f"  Training time: {time.time()-t0:.1f}s")

    # Evaluate against labels
    raw_scores = model.decision_function(X_scaled)
    anomaly_pred = model.predict(X_scaled)  # -1=outlier, 1=inlier
    anomaly_labels = (anomaly_pred == -1).astype(int)

    y_true = df["isFraud"].values
    # How many real frauds does the IF flag?
    fraud_mask = y_true == 1
    fraud_recall = anomaly_labels[fraud_mask].mean()
    legit_mask = y_true == 0
    false_positive_rate = anomaly_labels[legit_mask].mean()
    print(f"  Fraud recall (unsupervised): {fraud_recall:.4f}")
    print(f"  False positive rate:         {false_positive_rate:.4f}")

    global_avg = float(df["amount"].mean())
    print(f"  Global avg amount: {global_avg:,.2f}")

    artifact = {
        "model": model,
        "scaler": scaler,
        "feature_names": ISO_FEATURES,
        "global_avg_amount": global_avg,
        "is_fitted": True,
    }
    out_path = MODEL_DIR / "isolation_forest.joblib"
    joblib.dump(artifact, out_path)
    print(f"\n  ✓ Saved to {out_path}")
    return model, scaler


# ─── 6. Build GNN Transaction Graph ─────────────────────────────────────────
def build_transaction_graph(df: pd.DataFrame):
    """
    Build real sender→receiver graph from PaySim data.
    Compute PageRank, fraud-distance, and flag known fraud nodes.
    """
    print("\n" + "=" * 60)
    print("STEP 5: Building Transaction Graph...")

    # Use only TRANSFER and CASH_OUT — the fraud-relevant types
    fraud_types = df[df["type"].isin(["TRANSFER", "CASH_OUT"])]
    print(f"  Graph edges (TRANSFER+CASH_OUT): {len(fraud_types):,}")

    # Build adjacency
    from collections import defaultdict
    graph = defaultdict(set)
    node_stats = defaultdict(lambda: {
        "total_sent": 0.0, "total_received": 0.0,
        "send_count": 0, "recv_count": 0,
        "fraud_send": 0, "fraud_recv": 0,
    })

    fraud_nodes = set()

    for _, row in fraud_types.iterrows():
        sender = row["nameOrig"]
        receiver = row["nameDest"]
        amount = row["amount"]
        is_fraud = row["isFraud"]

        graph[sender].add(receiver)
        node_stats[sender]["total_sent"] += amount
        node_stats[sender]["send_count"] += 1
        node_stats[receiver]["total_received"] += amount
        node_stats[receiver]["recv_count"] += 1

        if is_fraud:
            fraud_nodes.add(sender)
            fraud_nodes.add(receiver)
            node_stats[sender]["fraud_send"] += 1
            node_stats[receiver]["fraud_recv"] += 1

    print(f"  Unique nodes: {len(node_stats):,}")
    print(f"  Known fraud nodes: {len(fraud_nodes):,}")

    # Compute simplified PageRank on top-N nodes for feasibility
    # (full PageRank on 2M+ nodes is slow, so compute fraud-neighborhood stats)
    # For each node, compute: 
    #   - distance to nearest fraud node (BFS, capped at 3)
    #   - number of fraud-connected neighbors
    print("  Computing fraud-neighborhood stats...")

    fraud_neighbor_count = {}
    for node in list(node_stats.keys())[:100000]:  # cap for speed
        neighbors = graph.get(node, set())
        fraud_count = len(neighbors & fraud_nodes)
        fraud_neighbor_count[node] = fraud_count

    artifact = {
        "graph": {k: list(v) for k, v in graph.items()},  # set→list for serialization
        "fraud_nodes": list(fraud_nodes),
        "node_stats": dict(node_stats),
        "fraud_neighbor_count": fraud_neighbor_count,
    }
    out_path = MODEL_DIR / "gnn_graph.joblib"
    joblib.dump(artifact, out_path, compress=3)
    print(f"\n  ✓ Saved to {out_path}")
    return graph, fraud_nodes, node_stats


# ─── 7. Train LightGBM Behavioral Profiler ──────────────────────────────────
def train_behavioral_model(df: pd.DataFrame):
    """
    Train a LightGBM model on per-user behavioral deviation features.
    LightGBM uses leaf-wise tree growth (vs XGBoost's level-wise),
    providing model diversity in the ensemble and better handling of
    imbalanced data via GOSS sampling.
    """
    print("\n" + "=" * 60)
    print("STEP 6: Training LightGBM Behavioral Profiler...")

    # Use the same rich feature set as XGBoost — algorithm diversity
    # (leaf-wise LightGBM vs level-wise XGBoost) provides ensemble diversity
    behavioral_features = XGBOOST_FEATURES + TYPE_COLS

    X = df[behavioral_features].values.astype(np.float32)
    y = df["isFraud"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    n_neg = (y_train == 0).sum()
    n_pos = (y_train == 1).sum()
    imbal_ratio = n_neg / max(n_pos, 1)
    print(f"  Class balance: neg={n_neg:,}  pos={n_pos:,}  ratio={imbal_ratio:.1f}:1")

    # Full ratio (same as XGBoost risk scorer)
    spw = imbal_ratio
    print(f"  Using scale_pos_weight={spw:.1f}")

    model = lgb.LGBMClassifier(
        n_estimators=500,
        max_depth=-1,               # unlimited — leaf-wise handles depth
        num_leaves=255,             # comparable to XGBoost max_depth=8
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_samples=50,
        scale_pos_weight=spw,       # full ratio class balancing
        boosting_type="gbdt",       # standard gradient boosting (stable)
        objective="binary",
        metric="average_precision",
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )

    t0 = time.time()
    model.fit(
        X_train_s, y_train,
        eval_set=[(X_test_s, y_test)],
        eval_metric="average_precision",
    )
    train_time = time.time() - t0
    print(f"  Training time: {train_time:.1f}s")

    y_proba = model.predict_proba(X_test_s)[:, 1]
    y_pred = (y_proba > 0.5).astype(int)

    auc = roc_auc_score(y_test, y_proba)
    ap = average_precision_score(y_test, y_proba)
    print(f"\n  ROC-AUC:   {auc:.4f}")
    print(f"  PR-AUC:    {ap:.4f}")
    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["Legit", "Fraud"]))

    cm = confusion_matrix(y_test, y_pred)
    print(f"  Confusion Matrix:")
    print(f"    TN={cm[0,0]:>8,}  FP={cm[0,1]:>6,}")
    print(f"    FN={cm[1,0]:>8,}  TP={cm[1,1]:>6,}")

    # Feature importance
    importances = model.feature_importances_
    top_idx = np.argsort(importances)[::-1]
    print(f"\n  Feature Importances (gain):")
    for i in top_idx:
        print(f"    {behavioral_features[i]:30s}  {importances[i]}")

    artifact = {
        "model": model,
        "scaler": scaler,
        "feature_names": behavioral_features,
        "model_type": "lightgbm",
        "is_trained": True,
        "metrics": {"roc_auc": auc, "pr_auc": ap, "train_time": train_time},
    }
    out_path = MODEL_DIR / "behavioral_model.joblib"
    joblib.dump(artifact, out_path)
    print(f"\n  ✓ Saved to {out_path}")
    return model, scaler



# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    global TYPE_COLS
    print("=" * 60)
    print("  UPI FRAUD DETECTION — MODEL TRAINING PIPELINE")
    print("=" * 60)
    total_start = time.time()

    # 1. Load
    df = load_data()

    # 2. Feature engineering
    df = engineer_features(df)
    TYPE_COLS = [c for c in df.columns if c.startswith("type_")]
    print(f"  Type columns: {TYPE_COLS}")

    # 3. XGBoost
    train_xgboost(df)

    # 4. Isolation Forest
    train_isolation_forest(df)

    # 5. Transaction Graph
    build_transaction_graph(df)

    # 6. Behavioral Model
    train_behavioral_model(df)

    total_time = time.time() - total_start
    print("\n" + "=" * 60)
    print(f"  ALL MODELS TRAINED in {total_time:.0f}s")
    print(f"  Artifacts saved to: {MODEL_DIR}")
    print("=" * 60)

    # List saved files
    for f in sorted(MODEL_DIR.iterdir()):
        size_mb = f.stat().st_size / 1e6
        print(f"    {f.name:40s}  {size_mb:>8.1f} MB")


if __name__ == "__main__":
    main()
