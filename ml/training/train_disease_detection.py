"""
train_disease_detection.py
----------------------------
Trains a leaf-disease image classifier via transfer learning (ResNet18 or
EfficientNet-B0, pretrained on ImageNet) on the PlantVillage dataset, with
PlantDoc as an optional fine-tuning set for real-world robustness.

Expected data layout (standard torchvision ImageFolder format):
    data/plantvillage/
        Tomato___Late_blight/
            img1.jpg
            img2.jpg
        Tomato___healthy/
            img1.jpg
        Potato___Early_blight/
            ...

Usage:
    pip install torch torchvision scikit-learn matplotlib seaborn tqdm pillow
    python train_disease_detection.py --data_dir data/plantvillage --backbone resnet18 --epochs 15
"""

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms, models
from sklearn.metrics import classification_report, confusion_matrix, f1_score

ROOT_DIR = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT_DIR / "saved_models" / "disease_detection"
OUT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = 224
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def build_transforms():
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(IMAGE_SIZE, scale=(0.8, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return train_tf, eval_tf


def build_model(backbone: str, num_classes: int):
    if backbone == "resnet18":
        model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        in_features = model.fc.in_features
        model.fc = nn.Linear(in_features, num_classes)
    elif backbone == "efficientnet_b0":
        model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        in_features = model.classifier[1].in_features
        model.classifier[1] = nn.Linear(in_features, num_classes)
    else:
        raise ValueError(f"Unsupported backbone: {backbone}")
    return model


def freeze_backbone(model, backbone: str, freeze: bool):
    """Freeze all layers except final classifier head for initial warmup epochs."""
    for name, param in model.named_parameters():
        if backbone == "resnet18":
            param.requires_grad = not freeze or name.startswith("fc.")
        else:
            param.requires_grad = not freeze or name.startswith("classifier.")


def train_one_epoch(model, loader, optimizer, criterion, device):
    model.train()
    running_loss, correct, total = 0.0, 0, 0
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        preds = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)
    return running_loss / max(total, 1), correct / max(total, 1)


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    running_loss, all_preds, all_labels = 0.0, [], []
    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        outputs = model(images)
        loss = criterion(outputs, labels)
        running_loss += loss.item() * images.size(0)
        preds = outputs.argmax(dim=1)
        all_preds.extend(preds.cpu().tolist())
        all_labels.extend(labels.cpu().tolist())
    avg_loss = running_loss / max(len(loader.dataset), 1)
    f1 = f1_score(all_labels, all_preds, average="weighted", zero_division=0)
    return avg_loss, f1, all_labels, all_preds


def main():
    parser = argparse.ArgumentParser(description="AgriGuard PyTorch Leaf Disease Transfer Learning")
    parser.add_argument("--data_dir", required=True, help="path to ImageFolder-structured dataset")
    parser.add_argument("--backbone", default="resnet18", choices=["resnet18", "efficientnet_b0"])
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--freeze_epochs", type=int, default=3, help="epochs with backbone frozen")
    parser.add_argument("--val_split", type=float, default=0.15)
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using compute device: {device}")

    train_tf, eval_tf = build_transforms()

    full_dataset = datasets.ImageFolder(args.data_dir, transform=train_tf)
    class_names = full_dataset.classes
    num_classes = len(class_names)
    print(f"Discovered {len(full_dataset)} images across {num_classes} classes.")

    val_size = int(len(full_dataset) * args.val_split)
    train_size = len(full_dataset) - val_size
    train_ds, val_ds = random_split(
        full_dataset, [train_size, val_size], generator=torch.Generator().manual_seed(42)
    )
    val_ds.dataset.transform = eval_tf

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=2)

    model = build_model(args.backbone, num_classes).to(device)
    criterion = nn.CrossEntropyLoss()

    best_f1 = 0.0
    history = []

    for epoch in range(args.epochs):
        freeze = epoch < args.freeze_epochs
        freeze_backbone(model, args.backbone, freeze)
        trainable_params = [p for p in model.parameters() if p.requires_grad]
        optimizer = torch.optim.Adam(trainable_params, lr=args.lr if freeze else args.lr / 10)

        t0 = time.time()
        train_loss, train_acc = train_one_epoch(model, train_loader, optimizer, criterion, device)
        val_loss, val_f1, y_true, y_pred = evaluate(model, val_loader, criterion, device)
        elapsed = time.time() - t0

        mode = "frozen-backbone" if freeze else "fine-tuning"
        print(
            f"Epoch {epoch+1}/{args.epochs} [{mode}] "
            f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"val_loss={val_loss:.4f} val_f1={val_f1:.4f} ({elapsed:.1f}s)"
        )

        history.append({
            "epoch": epoch + 1,
            "mode": mode,
            "train_loss": train_loss,
            "train_acc": train_acc,
            "val_loss": val_loss,
            "val_f1": val_f1,
        })

        if val_f1 > best_f1:
            best_f1 = val_f1
            torch.save(model.state_dict(), OUT_DIR / "best_model.pt")
            print(f"  -> new best model checkpoint saved (val_f1={val_f1:.4f})")

    # Final evaluation on best checkpoint
    if (OUT_DIR / "best_model.pt").exists():
        model.load_state_dict(torch.load(OUT_DIR / "best_model.pt"))
    _, _, y_true, y_pred = evaluate(model, val_loader, criterion, device)
    report = classification_report(y_true, y_pred, target_names=class_names, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_true, y_pred)

    with open(OUT_DIR / "class_names.json", "w") as f:
        json.dump(class_names, f, indent=2)
    with open(OUT_DIR / "training_history.json", "w") as f:
        json.dump(history, f, indent=2)
    with open(OUT_DIR / "final_metrics.json", "w") as f:
        json.dump({
            "classification_report": report,
            "confusion_matrix": cm.tolist(),
            "backbone": args.backbone,
            "best_val_f1": best_f1,
            "num_classes": num_classes,
        }, f, indent=2)

    print(f"\nTraining completed. Best val weighted F1: {best_f1:.4f}")
    print(f"Artifacts saved to {OUT_DIR}/")


if __name__ == "__main__":
    main()
