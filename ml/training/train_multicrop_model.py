"""
DEPRECATED — the old multi-crop trainer used a synthetic CSV
(now in ml/data/legacy_synthetic/) whose feature names did not match live
inference. It is kept as a shim so existing commands still work: it runs the
real-data pipeline in ml/training/train_model.py.
"""

from ml.training.train_model import train

if __name__ == "__main__":
    train()
