"""Compatibility wrapper for the PaySim training entry point.

The repository currently does not ship the PaySim CSV, so this script materializes
the deterministic RiskEngine artifact used by the rebuilt backend. If a PaySim CSV
is later added, the script can be extended to train against it without changing the
runtime contract.
"""
from __future__ import annotations

from pathlib import Path

import joblib

from app.ml.risk_engine import RiskEngine


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    model_dir = base_dir / "app" / "ml" / "trained_models"
    model_dir.mkdir(parents=True, exist_ok=True)

    artifact_path = model_dir / "risk_engine.joblib"
    joblib.dump(RiskEngine(), artifact_path)
    print(f"Saved deterministic RiskEngine artifact to {artifact_path}")


if __name__ == "__main__":
    main()
