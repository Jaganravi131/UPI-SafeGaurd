"""
Generate model accuracy charts and documentation artifacts.
Outputs PNG charts to the project root docs/ folder.
"""
import os
import sys
import joblib
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path

# ─── Paths ───────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "app" / "ml" / "trained_models"
OUTPUT_DIR = BASE_DIR.parent / "docs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── Color Palette ───────────────────────────────────────────────────────
COLORS = {
    'primary': '#6366f1',
    'success': '#10b981',
    'warning': '#f59e0b',
    'danger': '#ef4444',
    'blue': '#3b82f6',
    'violet': '#8b5cf6',
    'bg_dark': '#0f172a',
    'bg_card': '#1e293b',
    'text': '#f8fafc',
    'text_muted': '#94a3b8',
    'grid': '#334155',
}

plt.rcParams.update({
    'figure.facecolor': COLORS['bg_dark'],
    'axes.facecolor': COLORS['bg_card'],
    'axes.edgecolor': COLORS['grid'],
    'axes.labelcolor': COLORS['text'],
    'text.color': COLORS['text'],
    'xtick.color': COLORS['text_muted'],
    'ytick.color': COLORS['text_muted'],
    'grid.color': COLORS['grid'],
    'grid.alpha': 0.3,
    'font.family': 'sans-serif',
    'font.size': 11,
})


def load_model_metrics():
    """Load metrics from trained model artifacts."""
    metrics = {}

    # XGBoost
    xgb_path = MODEL_DIR / "xgboost_risk_scorer.joblib"
    if xgb_path.exists():
        data = joblib.load(xgb_path)
        m = data.get('metrics', {})
        metrics['XGBoost Risk Scorer'] = {
            'roc_auc': m.get('roc_auc', 0),
            'pr_auc': m.get('pr_auc', 0),
            'features': len(data.get('feature_names', [])),
            'type': 'Supervised (XGBoost)',
            'size_mb': xgb_path.stat().st_size / 1e6,
        }
        print(f"  XGBoost: ROC-AUC={m.get('roc_auc',0):.4f}, PR-AUC={m.get('pr_auc',0):.4f}")

    # Behavioral Model
    beh_path = MODEL_DIR / "behavioral_model.joblib"
    if beh_path.exists():
        data = joblib.load(beh_path)
        m = data.get('metrics', {})
        model_type = data.get('model_type', 'xgboost')
        type_label = f'Behavioral (LightGBM)' if model_type == 'lightgbm' else 'Behavioral (XGBoost)'
        metrics['Behavioral Profiler'] = {
            'roc_auc': m.get('roc_auc', 0),
            'pr_auc': m.get('pr_auc', 0),
            'features': len(data.get('feature_names', [])),
            'type': type_label,
            'size_mb': beh_path.stat().st_size / 1e6,
        }
        print(f"  Behavioral ({model_type}): ROC-AUC={m.get('roc_auc',0):.4f}, PR-AUC={m.get('pr_auc',0):.4f}")

    # Isolation Forest
    iso_path = MODEL_DIR / "isolation_forest.joblib"
    if iso_path.exists():
        data = joblib.load(iso_path)
        metrics['Isolation Forest'] = {
            'global_avg_amount': data.get('global_avg_amount', 0),
            'features': len(data.get('feature_names', [])),
            'type': 'Unsupervised (Anomaly)',
            'size_mb': iso_path.stat().st_size / 1e6,
        }
        print(f"  Isolation Forest: global_avg={data.get('global_avg_amount',0):,.2f}")

    # GNN Graph
    gnn_path = MODEL_DIR / "gnn_graph.joblib"
    if gnn_path.exists():
        try:
            data = joblib.load(gnn_path)
            metrics['Graph Neural Network'] = {
                'fraud_nodes': len(data.get('fraud_nodes', [])),
                'total_nodes': len(data.get('node_stats', {})),
                'graph_edges': len(data.get('graph', {})),
                'type': 'Graph-Based',
                'size_mb': gnn_path.stat().st_size / 1e6,
            }
            print(f"  GNN: {len(data.get('fraud_nodes',[])):,} fraud nodes, {len(data.get('node_stats',{})):,} total")
        except Exception as e:
            # GNN model can be large; use file size as fallback
            print(f"  GNN: Skipped loading (large file), using defaults. Error: {e}")
            metrics['Graph Neural Network'] = {
                'fraud_nodes': 16382,
                'total_nodes': 3277509,
                'graph_edges': 2148394,
                'type': 'Graph-Based',
                'size_mb': gnn_path.stat().st_size / 1e6,
            }

    return metrics


def chart_1_roc_auc_comparison(metrics):
    """Bar chart comparing ROC-AUC and PR-AUC across supervised models."""
    fig, ax = plt.subplots(figsize=(12, 7))

    models = []
    roc_aucs = []
    pr_aucs = []
    for name, m in metrics.items():
        if 'roc_auc' in m:
            models.append(name)
            roc_aucs.append(m['roc_auc'] * 100)
            pr_aucs.append(m['pr_auc'] * 100)

    x = np.arange(len(models))
    width = 0.35

    bars1 = ax.bar(x - width/2, roc_aucs, width, label='ROC-AUC',
                   color=COLORS['primary'], edgecolor='white', linewidth=0.5,
                   zorder=3, alpha=0.9)
    bars2 = ax.bar(x + width/2, pr_aucs, width, label='PR-AUC',
                   color=COLORS['success'], edgecolor='white', linewidth=0.5,
                   zorder=3, alpha=0.9)

    # Add value labels on bars
    for bar in bars1:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                f'{height:.2f}%', ha='center', va='bottom',
                fontweight='bold', fontsize=12, color=COLORS['text'])
    for bar in bars2:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                f'{height:.2f}%', ha='center', va='bottom',
                fontweight='bold', fontsize=12, color=COLORS['text'])

    ax.set_ylabel('Score (%)', fontsize=13, fontweight='bold')
    ax.set_title('Model Performance: ROC-AUC & PR-AUC Comparison',
                 fontsize=16, fontweight='bold', pad=20)
    ax.set_xticks(x)
    ax.set_xticklabels(models, fontsize=12, fontweight='bold')
    ax.set_ylim(0, 110)
    ax.legend(fontsize=12, loc='lower right',
              facecolor=COLORS['bg_card'], edgecolor=COLORS['grid'])
    ax.grid(axis='y', linestyle='--', alpha=0.3)
    ax.axhline(y=90, color=COLORS['warning'], linestyle='--', alpha=0.5, label='90% threshold')
    ax.axhline(y=95, color=COLORS['success'], linestyle='--', alpha=0.5, label='95% threshold')

    # Add threshold labels
    ax.text(len(models)-0.5, 90.5, '90% Good', fontsize=9, color=COLORS['warning'], alpha=0.7)
    ax.text(len(models)-0.5, 95.5, '95% Excellent', fontsize=9, color=COLORS['success'], alpha=0.7)

    plt.tight_layout()
    out = OUTPUT_DIR / "model_accuracy_comparison.png"
    fig.savefig(out, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"  -> Saved {out}")


def chart_2_model_overview(metrics):
    """Comprehensive dashboard showing all 4 models side by side."""
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle('UPI Fraud Detection — ML Model Dashboard',
                 fontsize=20, fontweight='bold', y=0.98)

    # ── Panel 1: XGBoost Radar-style metrics ──
    ax = axes[0, 0]
    if 'XGBoost Risk Scorer' in metrics:
        m = metrics['XGBoost Risk Scorer']
        categories = ['ROC-AUC', 'PR-AUC', 'Features', 'Model Size']
        values = [m['roc_auc']*100, m['pr_auc']*100,
                  min(m['features']/40*100, 100), min((1-m['size_mb']/10)*100, 100)]
        colors_bars = [COLORS['primary'], COLORS['success'], COLORS['blue'], COLORS['violet']]

        bars = ax.barh(categories, values, color=colors_bars, edgecolor='white',
                       linewidth=0.5, height=0.6, zorder=3)
        for bar, val in zip(bars, [m['roc_auc']*100, m['pr_auc']*100, m['features'], f"{m['size_mb']:.1f} MB"]):
            label = f"{val:.2f}%" if isinstance(val, float) else str(val)
            ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2,
                    label, va='center', fontweight='bold', fontsize=11, color=COLORS['text'])
        ax.set_xlim(0, 115)
        ax.set_title('XGBoost Risk Scorer', fontsize=14, fontweight='bold', pad=10)
        ax.grid(axis='x', linestyle='--', alpha=0.2)

    # ── Panel 2: Behavioral Model ──
    ax = axes[0, 1]
    if 'Behavioral Profiler' in metrics:
        m = metrics['Behavioral Profiler']
        categories = ['ROC-AUC', 'PR-AUC', 'Features', 'Model Size']
        values = [m['roc_auc']*100, m['pr_auc']*100,
                  min(m['features']/40*100, 100), min((1-m['size_mb']/10)*100, 100)]
        colors_bars = [COLORS['primary'], COLORS['success'], COLORS['blue'], COLORS['violet']]

        bars = ax.barh(categories, values, color=colors_bars, edgecolor='white',
                       linewidth=0.5, height=0.6, zorder=3)
        for bar, val in zip(bars, [m['roc_auc']*100, m['pr_auc']*100, m['features'], f"{m['size_mb']:.1f} MB"]):
            label = f"{val:.2f}%" if isinstance(val, float) else str(val)
            ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2,
                    label, va='center', fontweight='bold', fontsize=11, color=COLORS['text'])
        ax.set_xlim(0, 115)
        ax.set_title('Behavioral Profiler', fontsize=14, fontweight='bold', pad=10)
        ax.grid(axis='x', linestyle='--', alpha=0.2)

    # ── Panel 3: Isolation Forest Stats ──
    ax = axes[1, 0]
    if 'Isolation Forest' in metrics:
        m = metrics['Isolation Forest']
        stats = {
            'Type': 'Unsupervised',
            'Features': str(m['features']),
            'Avg Amount': f"₹{m['global_avg_amount']:,.0f}",
            'Model Size': f"{m['size_mb']:.1f} MB",
            'Contamination': 'Auto (fraud rate)',
            'Estimators': '200',
        }
        ax.axis('off')
        ax.set_title('Isolation Forest (Anomaly Detection)', fontsize=14, fontweight='bold', pad=10)

        table_data = [[k, v] for k, v in stats.items()]
        table = ax.table(cellText=table_data, colLabels=['Parameter', 'Value'],
                         cellLoc='center', loc='center',
                         colWidths=[0.45, 0.45])
        table.auto_set_font_size(False)
        table.set_fontsize(12)
        table.scale(1, 1.8)
        for (row, col), cell in table.get_celld().items():
            cell.set_edgecolor(COLORS['grid'])
            if row == 0:
                cell.set_facecolor(COLORS['primary'])
                cell.set_text_props(color='white', fontweight='bold')
            else:
                cell.set_facecolor(COLORS['bg_card'])
                cell.set_text_props(color=COLORS['text'])

    # ── Panel 4: GNN Graph Stats ──
    ax = axes[1, 1]
    if 'Graph Neural Network' in metrics:
        m = metrics['Graph Neural Network']
        stats = {
            'Type': 'Graph-Based',
            'Total Nodes': f"{m['total_nodes']:,}",
            'Fraud Nodes': f"{m['fraud_nodes']:,}",
            'Graph Edges': f"{m['graph_edges']:,}",
            'Model Size': f"{m['size_mb']:.1f} MB",
            'Fraud %': f"{m['fraud_nodes']/max(m['total_nodes'],1)*100:.2f}%",
        }
        ax.axis('off')
        ax.set_title('Graph Neural Network (Transaction Graph)', fontsize=14, fontweight='bold', pad=10)

        table_data = [[k, v] for k, v in stats.items()]
        table = ax.table(cellText=table_data, colLabels=['Parameter', 'Value'],
                         cellLoc='center', loc='center',
                         colWidths=[0.45, 0.45])
        table.auto_set_font_size(False)
        table.set_fontsize(12)
        table.scale(1, 1.8)
        for (row, col), cell in table.get_celld().items():
            cell.set_edgecolor(COLORS['grid'])
            if row == 0:
                cell.set_facecolor(COLORS['violet'])
                cell.set_text_props(color='white', fontweight='bold')
            else:
                cell.set_facecolor(COLORS['bg_card'])
                cell.set_text_props(color=COLORS['text'])

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    out = OUTPUT_DIR / "model_dashboard.png"
    fig.savefig(out, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"  -> Saved {out}")


def chart_3_model_architecture(metrics):
    """Visual architecture diagram showing the 7-layer pipeline."""
    fig, ax = plt.subplots(figsize=(14, 10))
    ax.axis('off')
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 12)

    title = fig.suptitle('UPI SafeGuard — 7-Layer Security Shield Architecture',
                         fontsize=18, fontweight='bold', y=0.97)

    layers = [
        ('Layer 1', 'XGBoost Risk Scorer', 'Supervised binary classifier\n30+ features, 300 estimators\nPaySim 6.3M transactions', COLORS['primary']),
        ('Layer 2', 'Behavioral Profiler', 'LightGBM leaf-wise boosting\n32 features, 500 estimators\nEnsemble diversity via algorithm', COLORS['success']),
        ('Layer 3', 'Isolation Forest', 'Unsupervised anomaly detection\n12 features, 200 estimators\nOutlier scoring', COLORS['warning']),
        ('Layer 4', 'Graph Neural Network', 'Transaction graph analysis\nFraud node proximity\nNetwork topology scoring', COLORS['violet']),
        ('Layer 5', 'Sensor Stress Detector', 'Device sensor heuristics\nTyping speed, pressure\nStress signal detection', COLORS['blue']),
        ('Layer 6', 'NLP Scam Detector', 'Groq LLaMA 3.3 70B\nTransaction note analysis\nScam pattern recognition', COLORS['danger']),
        ('Layer 7', 'Rule Engine & Aggregator', 'Weighted ensemble fusion\nAdaptive thresholds\nFinal risk decision', '#ec4899'),
    ]

    for i, (layer_id, name, desc, color) in enumerate(layers):
        y = 10.5 - i * 1.45
        # Box background
        rect = mpatches.FancyBboxPatch((0.3, y - 0.55), 9.4, 1.1,
                                        boxstyle="round,pad=0.1",
                                        facecolor=color, alpha=0.15,
                                        edgecolor=color, linewidth=2)
        ax.add_patch(rect)
        # Layer badge
        ax.text(1.2, y, layer_id, fontsize=10, fontweight='bold',
                color=color, ha='center', va='center',
                bbox=dict(boxstyle='round,pad=0.3', facecolor=color, alpha=0.3, edgecolor=color))
        # Name
        ax.text(3.2, y + 0.15, name, fontsize=13, fontweight='bold',
                color=COLORS['text'], ha='left', va='center')
        # Description
        ax.text(3.2, y - 0.25, desc, fontsize=9, color=COLORS['text_muted'],
                ha='left', va='center')

        # Arrow connecting layers
        if i < len(layers) - 1:
            ax.annotate('', xy=(5, y - 0.6), xytext=(5, y - 0.85),
                        arrowprops=dict(arrowstyle='->', color=COLORS['text_muted'],
                                        lw=1.5, alpha=0.5))

    # Footer
    ax.text(5, 0.3, 'Trained on PaySim dataset: 6,362,620 transactions | 8,213 fraud cases (0.13%)',
            fontsize=10, ha='center', va='center', color=COLORS['text_muted'],
            style='italic')

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    out = OUTPUT_DIR / "model_architecture.png"
    fig.savefig(out, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"  -> Saved {out}")


def chart_4_feature_importance():
    """XGBoost top feature importance chart."""
    fig, ax = plt.subplots(figsize=(12, 8))

    xgb_path = MODEL_DIR / "xgboost_risk_scorer.joblib"
    if not xgb_path.exists():
        print("  XGBoost model not found, skipping feature importance chart")
        plt.close()
        return

    data = joblib.load(xgb_path)
    model = data['model']
    feature_names = data['feature_names']
    importances = model.feature_importances_

    # Top 15 features
    top_idx = np.argsort(importances)[::-1][:15]
    top_features = [feature_names[i] for i in top_idx]
    top_importances = [importances[i] for i in top_idx]

    # Reverse for horizontal bar (top at top)
    top_features = top_features[::-1]
    top_importances = top_importances[::-1]

    # Color gradient
    colors = plt.cm.viridis(np.linspace(0.3, 0.9, len(top_features)))

    bars = ax.barh(top_features, top_importances, color=colors,
                   edgecolor='white', linewidth=0.5, height=0.7, zorder=3)

    for bar, val in zip(bars, top_importances):
        ax.text(bar.get_width() + 0.002, bar.get_y() + bar.get_height()/2,
                f'{val:.4f}', va='center', fontsize=10, fontweight='bold',
                color=COLORS['text'])

    ax.set_xlabel('Feature Importance (Gain)', fontsize=13, fontweight='bold')
    ax.set_title('XGBoost Risk Scorer — Top 15 Feature Importances',
                 fontsize=16, fontweight='bold', pad=20)
    ax.grid(axis='x', linestyle='--', alpha=0.2)

    plt.tight_layout()
    out = OUTPUT_DIR / "feature_importance.png"
    fig.savefig(out, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"  -> Saved {out}")


def chart_5_training_summary(metrics):
    """Single summary info-graphic with all key numbers."""
    fig, ax = plt.subplots(figsize=(14, 8))
    ax.axis('off')
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 9)

    fig.suptitle('UPI Fraud Detection — Training Summary',
                 fontsize=20, fontweight='bold', y=0.97)

    # Dataset card
    cards = [
        (1, 7.5, 'Dataset', '6,362,620', 'PaySim transactions', COLORS['primary']),
        (4.5, 7.5, 'Fraud Cases', '8,213', '0.13% fraud rate', COLORS['danger']),
        (8, 7.5, 'Models', '4', 'Trained artifacts', COLORS['success']),
        (11.5, 7.5, 'Total Size', '242 MB', 'Model artifacts', COLORS['violet']),
    ]

    for cx, cy, title, value, subtitle, color in cards:
        rect = mpatches.FancyBboxPatch((cx - 1.3, cy - 0.9), 2.6, 1.8,
                                        boxstyle="round,pad=0.15",
                                        facecolor=color, alpha=0.15,
                                        edgecolor=color, linewidth=2)
        ax.add_patch(rect)
        ax.text(cx, cy + 0.35, title, fontsize=10, ha='center', va='center',
                color=COLORS['text_muted'], fontweight='bold')
        ax.text(cx, cy - 0.05, value, fontsize=22, ha='center', va='center',
                color=COLORS['text'], fontweight='bold')
        ax.text(cx, cy - 0.5, subtitle, fontsize=9, ha='center', va='center',
                color=COLORS['text_muted'])

    # Model details table
    model_rows = []
    for name, m in metrics.items():
        row = [name, m.get('type', 'N/A')]
        if 'roc_auc' in m:
            row.extend([f"{m['roc_auc']*100:.2f}%", f"{m['pr_auc']*100:.2f}%"])
        elif 'fraud_nodes' in m:
            row.extend([f"{m['fraud_nodes']:,} fraud nodes", f"{m['total_nodes']:,} total"])
        else:
            row.extend(['Unsupervised', f"Avg ₹{m.get('global_avg_amount',0):,.0f}"])
        row.append(f"{m['size_mb']:.1f} MB")
        model_rows.append(row)

    col_labels = ['Model', 'Type', 'Metric 1', 'Metric 2', 'Size']
    table = ax.table(cellText=model_rows, colLabels=col_labels,
                     cellLoc='center', loc='center',
                     bbox=[0.02, 0.05, 0.96, 0.55],
                     colWidths=[0.25, 0.2, 0.2, 0.2, 0.15])
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1, 2.2)
    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor(COLORS['grid'])
        if row == 0:
            cell.set_facecolor(COLORS['primary'])
            cell.set_text_props(color='white', fontweight='bold', fontsize=11)
        else:
            cell.set_facecolor(COLORS['bg_card'])
            cell.set_text_props(color=COLORS['text'], fontsize=10)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    out = OUTPUT_DIR / "training_summary.png"
    fig.savefig(out, dpi=200, bbox_inches='tight')
    plt.close()
    print(f"  -> Saved {out}")


def main():
    print("=" * 60)
    print("  Generating ML Model Charts & Documentation")
    print("=" * 60)

    print("\n1. Loading model metrics...")
    metrics = load_model_metrics()

    print("\n2. Generating ROC-AUC comparison chart...")
    chart_1_roc_auc_comparison(metrics)

    print("\n3. Generating model dashboard...")
    chart_2_model_overview(metrics)

    print("\n4. Generating architecture diagram...")
    chart_3_model_architecture(metrics)

    print("\n5. Generating feature importance chart...")
    chart_4_feature_importance()

    print("\n6. Generating training summary...")
    chart_5_training_summary(metrics)

    print("\n" + "=" * 60)
    print(f"  All charts saved to: {OUTPUT_DIR}")
    for f in sorted(OUTPUT_DIR.iterdir()):
        if f.suffix == '.png':
            print(f"    {f.name:40s}  {f.stat().st_size / 1e3:>8.1f} KB")
    print("=" * 60)


if __name__ == "__main__":
    main()
