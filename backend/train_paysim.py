"""Deprecated PaySim entry point.

Use ``train_models.py`` to produce the versioned XGBoost risk artifact. This
module intentionally does not create a fake trained model.
"""
from __future__ import annotations

def main() -> None:
    raise RuntimeError(
        "This compatibility entry point no longer creates a fake model. "
        "Run train_models.py with a PaySim dataset to train risk_model.joblib."
    )


if __name__ == "__main__":
    main()
