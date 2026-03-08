"""Standalone script to train LightGBM behavioral profiler on PaySim dataset.

Uses the full 32-feature set (same as XGBoost risk scorer) — algorithm diversity
(leaf-wise LightGBM vs level-wise XGBoost) provides enough ensemble diversity.
Hyperparams tuned: gbdt boosting, sqrt(imbalance_ratio) for scale_pos_weight.
"""
import time, numpy as np, pandas as pd, joblib, lightgbm as lgb
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, average_precision_score, classification_report, confusion_matrix
import warnings
warnings.filterwarnings('ignore')

MODEL_DIR = Path('app/ml/trained_models')
csv_path = Path(r'data\PS_20174392719_1491204439457_log.csv\PS_20174392719_1491204439457_log.csv')

print(f'Loading dataset from {csv_path}...')
df = pd.read_csv(csv_path)
print(f'Loaded {len(df):,} rows, {df["isFraud"].sum():,} fraud')

# ─── Full feature engineering (same as train_models.py) ───
df["hour_of_day"] = df["step"] % 24
df["day_of_week"] = (df["step"] // 24) % 7
df["hour_sin"] = np.sin(2 * np.pi * df["hour_of_day"] / 24)
df["hour_cos"] = np.cos(2 * np.pi * df["hour_of_day"] / 24)
df["day_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7)
df["day_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7)
df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
df["is_night"] = ((df["hour_of_day"] < 6) | (df["hour_of_day"] > 22)).astype(int)
df["is_late_night"] = ((df["hour_of_day"] >= 23) | (df["hour_of_day"] < 2)).astype(int)

df["amount_log"] = np.log1p(df["amount"])
df["is_round_amount"] = ((df["amount"] % 1000 == 0) | (df["amount"] % 500 == 0)).astype(int)

df["balance_delta_orig"] = df["newbalanceOrig"] - df["oldbalanceOrg"]
df["balance_delta_dest"] = df["newbalanceDest"] - df["oldbalanceDest"]
df["balance_orig_log"] = np.log1p(df["oldbalanceOrg"].clip(lower=0))
df["balance_dest_log"] = np.log1p(df["oldbalanceDest"].clip(lower=0))

df["amount_to_orig_ratio"] = (df["amount"] / df["oldbalanceOrg"].clip(lower=1)).clip(upper=100)
df["amount_to_dest_ratio"] = (df["amount"] / df["oldbalanceDest"].clip(lower=1)).clip(upper=100)

df["orig_zero_after"] = (df["newbalanceOrig"] == 0).astype(int)
df["full_drain"] = ((df["newbalanceOrig"] == 0) & (df["oldbalanceOrg"] > 0)).astype(int)

type_dummies = pd.get_dummies(df["type"], prefix="type")
df = pd.concat([df, type_dummies], axis=1)
TYPE_COLS = [c for c in df.columns if c.startswith("type_")]

df["sender_txn_this_hour"] = df.groupby(["nameOrig", "step"]).cumcount()
sender_avg = df.groupby("nameOrig")["amount"].transform("mean")
sender_max = df.groupby("nameOrig")["amount"].transform("max")
sender_count = df.groupby("nameOrig")["amount"].transform("count")
df["sender_avg_amount"] = sender_avg
df["amount_to_avg_ratio"] = (df["amount"] / sender_avg.clip(lower=1)).clip(upper=50)
df["amount_to_max_ratio"] = (df["amount"] / sender_max.clip(lower=1)).clip(upper=10)
df["sender_txn_count"] = sender_count

recv_count = df.groupby("nameDest")["amount"].transform("count")
recv_unique_senders = df.groupby("nameDest")["nameOrig"].transform("nunique")
df["recv_txn_count"] = recv_count
df["recv_unique_senders"] = recv_unique_senders
print(f'Features engineered ({len(df.columns)} total columns)')

# ─── Feature list (same as XGBoost + type dummies) ───
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
feats = XGBOOST_FEATURES + TYPE_COLS
print(f'Using {len(feats)} features')

X = df[feats].values.astype(np.float32)
y = df['isFraud'].values

X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
sc = StandardScaler()
X_tr_s = sc.fit_transform(X_tr)
X_te_s = sc.transform(X_te)

n_neg = (y_tr == 0).sum()
n_pos = (y_tr == 1).sum()
imbal_ratio = n_neg / max(n_pos, 1)
spw = imbal_ratio  # full ratio (same as XGBoost risk scorer)
print(f'Train: {len(X_tr):,}, Test: {len(X_te):,}, Positive (fraud): {n_pos:,}')
print(f'Imbalance ratio: {imbal_ratio:.1f}:1, scale_pos_weight: {spw:.1f}')

# Train LightGBM (gbdt boosting, full class-weight ratio)
model = lgb.LGBMClassifier(
    n_estimators=500,
    max_depth=-1,
    num_leaves=255,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    min_child_samples=50,
    scale_pos_weight=spw,
    boosting_type='gbdt',
    objective='binary',
    metric='average_precision',
    random_state=42,
    n_jobs=-1,
    verbose=-1
)

t0 = time.time()
model.fit(X_tr_s, y_tr, eval_set=[(X_te_s, y_te)], eval_metric='average_precision')
train_time = time.time() - t0
print(f'Training completed in {train_time:.1f}s')

# Evaluate
yp = model.predict_proba(X_te_s)[:, 1]
yd = (yp > 0.5).astype(int)
auc = roc_auc_score(y_te, yp)
ap = average_precision_score(y_te, yp)

print(f'\n=== LightGBM Behavioral Profiler Results ===')
print(f'ROC-AUC: {auc:.4f}')
print(f'PR-AUC:  {ap:.4f}')
print(classification_report(y_te, yd, target_names=['Legit', 'Fraud']))

cm = confusion_matrix(y_te, yd)
print(f'Confusion Matrix:')
print(f'  TN={cm[0, 0]:>8,}  FP={cm[0, 1]:>6,}')
print(f'  FN={cm[1, 0]:>8,}  TP={cm[1, 1]:>6,}')

print(f'\nFeature Importance (top 15):')
top_idx = np.argsort(model.feature_importances_)[::-1][:15]
for i in top_idx:
    print(f'  {feats[i]:30s} {model.feature_importances_[i]}')

# Save artifact
artifact = {
    'model': model,
    'scaler': sc,
    'feature_names': feats,
    'model_type': 'lightgbm',
    'is_trained': True,
    'metrics': {
        'roc_auc': auc,
        'pr_auc': ap,
        'train_time': train_time
    }
}
out_path = MODEL_DIR / 'behavioral_model.joblib'
joblib.dump(artifact, out_path)
sz = out_path.stat().st_size / 1e6
print(f'\nSaved to {out_path} ({sz:.1f} MB)')
print('Done!')
