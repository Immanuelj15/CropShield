"""
CropShield / AgriGuard — Disease Detection Inference Service
Wraps PyTorch ResNet18 transfer-learning classifier trained on PlantVillage.
Loads weights ONCE at startup as a singleton, exposing fast .predict() for API handlers.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from PIL import Image

import torch
import torch.nn as nn
from torchvision import transforms, models

logger = logging.getLogger("cropshield.disease")

ROOT_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT_DIR / "saved_models" / "disease_detection"
IMAGE_SIZE = 224
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

# Agricultural Management Knowledge Base for PlantVillage / TNAU Classes
PATHOLOGY_KNOWLEDGE = {
    "Cotton___Bacterial_blight": {
        "crop": "Cotton",
        "disease_name": "Bacterial Blight (Angular Leaf Spot)",
        "pathogen": "Xanthomonas citri pv. malvacearum (Bacterial)",
        "severity_level": "High",
        "organic_treatment": "Foliar spray of Pseudomonas fluorescens @ 10g/L or 2% Neem oil at early onset.",
        "chemical_treatment": "Spray Copper Oxychloride 50% WP @ 2.5 g/L mixed with Streptomycin sulphate 100 ppm.",
        "prevention": "Acid-delinting of cotton seeds before sowing; avoid overhead sprinkler irrigation."
    },
    "Tomato___Late_blight": {
        "crop": "Tomato",
        "disease_name": "Late Blight",
        "pathogen": "Phytophthora infestans (Oomycete / Fungal)",
        "severity_level": "High",
        "organic_treatment": "Apply Trichoderma viride bio-fungicide @ 5g/L and improve plot drainage.",
        "chemical_treatment": "Spray Metalaxyl + Mancozeb @ 2 g/L or Dimethomorph @ 1 g/L at 10-day intervals.",
        "prevention": "Destroy infected cull piles; maintain wide row spacing to decrease canopy moisture."
    },
    "Tomato___Early_blight": {
        "crop": "Tomato",
        "disease_name": "Early Blight (Target Spot)",
        "pathogen": "Alternaria solani (Fungal)",
        "severity_level": "Medium",
        "organic_treatment": "Spray Panchagavya 3% or Bacillus subtilis @ 5ml/L at first appearance of concentric rings.",
        "chemical_treatment": "Spray Mancozeb 75% WP @ 2g/L or Chlorothalonil @ 2g/L.",
        "prevention": "Mulching to prevent soil splashing onto bottom leaves; remove lower senescent foliage."
    },
    "Potato___Early_blight": {
        "crop": "Potato",
        "disease_name": "Early Blight",
        "pathogen": "Alternaria solani (Fungal)",
        "severity_level": "Medium",
        "organic_treatment": "Apply copper hydroxide @ 2g/L with surfactant; ensure balanced potash fertilization.",
        "chemical_treatment": "Spray Azoxystrobin 23% SC @ 1 ml/L or Mancozeb @ 2.5 g/L.",
        "prevention": "Crop rotation with non-solanaceous crops; harvest after tuber skin matures."
    },
    "Potato___Late_blight": {
        "crop": "Potato",
        "disease_name": "Late Blight",
        "pathogen": "Phytophthora infestans (Fungal)",
        "severity_level": "High",
        "organic_treatment": "Spray Bordeaux mixture 1% or Copper oxychloride @ 2.5 g/L.",
        "chemical_treatment": "Foliar spray of Cymoxanil 8% + Mancozeb 64% WP @ 2 g/L.",
        "prevention": "Plant certified disease-free seed tubers; earth-up ridges thoroughly to protect tubers."
    },
    "Corn_(maize)___Common_rust_": {
        "crop": "Corn (Maize)",
        "disease_name": "Common Rust",
        "pathogen": "Puccinia sorghi (Fungal)",
        "severity_level": "Medium",
        "organic_treatment": "Spray wettable sulfur 80% WP @ 3 g/L.",
        "chemical_treatment": "Spray Mancozeb @ 2g/L or Azoxystrobin @ 1ml/L at tassel initiation.",
        "prevention": "Plant resistant hybrids; eliminate alternate host weed species (Oxalis spp.)."
    },
    "Rice___Blast": {
        "crop": "Rice",
        "disease_name": "Rice Blast (Pyricularia oryzae)",
        "pathogen": "Magnaporthe oryzae (Fungal)",
        "severity_level": "High",
        "organic_treatment": "Foliar spray of Pseudomonas fluorescens (Pf1) @ 2.5 kg/ha in 500L water.",
        "chemical_treatment": "Spray Tricyclazole 75% WP @ 0.6 g/L or Isoprothiolane 40% EC @ 1.5 ml/L.",
        "prevention": "Avoid excessive basal nitrogen; maintain thin water layer during tillering."
    }
}


class DiseaseDetector:
    """
    Production Disease Detection Service.
    Loads ResNet18 transfer-learning weights once at process startup.
    Reports model_available=False (no fabricated diagnosis) if the weights file is absent.
    """
    def __init__(self, model_dir: Path = MODEL_DIR, backbone: str = "resnet18"):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_dir = Path(model_dir)
        self.backbone = backbone
        self.class_names: List[str] = []
        self.model: Optional[nn.Module] = None
        self.has_weights: bool = False

        # Load class names
        class_file = self.model_dir / "class_names.json"
        if class_file.exists():
            try:
                with open(class_file) as f:
                    self.class_names = json.load(f)
            except Exception as e:
                logger.error(f"Error reading {class_file}: {e}")

        if not self.class_names:
            self.class_names = list(PATHOLOGY_KNOWLEDGE.keys()) + [
                "Tomato___healthy", "Cotton___healthy", "Rice___healthy"
            ]

        # Build transforms
        self.transform = transforms.Compose([
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ])

        # Attempt to load trained checkpoint
        weights_file = self.model_dir / "best_model.pt"
        if weights_file.exists():
            try:
                self.model = self._build_model(backbone, len(self.class_names))
                state_dict = torch.load(weights_file, map_location=self.device, weights_only=True)
                self.model.load_state_dict(state_dict)
                self.model.to(self.device)
                self.model.eval()
                self.has_weights = True
                logger.info(f"Loaded trained {backbone} checkpoint from {weights_file}")
            except Exception as e:
                logger.error(f"Could not load {weights_file} ({e}); disease model unavailable.")
        else:
            logger.warning(f"No checkpoint found at {weights_file}; disease model unavailable.")

    @staticmethod
    def _build_model(backbone: str, num_classes: int) -> nn.Module:
        if backbone == "resnet18":
            model = models.resnet18(weights=None)
            model.fc = nn.Linear(model.fc.in_features, num_classes)
        elif backbone == "efficientnet_b0":
            model = models.efficientnet_b0(weights=None)
            model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
        else:
            raise ValueError(f"Unsupported backbone: {backbone}")
        return model

    @staticmethod
    def _crop_of(class_name: str) -> str:
        return class_name.split("___")[0].replace("_", " ").strip().lower()

    def _unavailable(self, crop_hint: Optional[str], message: str) -> Dict[str, Any]:
        """Contract item 7: no class, no confidence, no treatment when the model can't answer."""
        return {
            "model_available": False,
            "is_heuristic": True,
            "predicted_class": None,
            "confidence": None,
            "top_k": [],
            "crop": crop_hint,
            "disease_name": None,
            "pathogen": None,
            "severity_level": None,
            "organic_treatment": None,
            "chemical_treatment": None,
            "prevention": None,
            "model_name": None,
            "message": message,
        }

    def predict(self, image_path: str, top_k: int = 3, crop_hint: Optional[str] = None) -> Dict[str, Any]:
        """
        Runs inference on an uploaded leaf image.
        When the trained weights are absent, returns model_available=False with
        confidence None and no treatment (never a placeholder diagnosis).
        Predictions are restricted to classes of `crop_hint` when given; if the
        model has no classes for that crop, the model is reported unavailable for it.
        """
        img_path = Path(image_path)
        if not img_path.exists():
            raise FileNotFoundError(f"Image not found at {image_path}")

        if not (self.has_weights and self.model is not None):
            return self._unavailable(
                crop_hint,
                "Leaf-disease model is not available on this server (trained weights not installed). "
                "No diagnosis was made; please consult an agronomist.",
            )

        allowed = list(range(len(self.class_names)))
        if crop_hint:
            hint = crop_hint.strip().lower()
            allowed = [i for i, c in enumerate(self.class_names) if self._crop_of(c) == hint]
            if not allowed:
                return self._unavailable(
                    crop_hint,
                    f"The leaf-disease model was not trained on {crop_hint}; no diagnosis was made.",
                )

        image = Image.open(img_path).convert("RGB")
        with torch.no_grad():
            x = self.transform(image).unsqueeze(0).to(self.device)
            logits = self.model(x)[0]
            idx_t = torch.tensor(allowed, device=logits.device)
            probs = torch.softmax(logits[idx_t], dim=0)  # renormalised over the crop's classes
            k = min(top_k, len(allowed))
            top_probs, top_pos = torch.topk(probs, k=k)
            top_k_results = [
                {"class": self.class_names[allowed[pos]], "confidence": round(prob.item(), 4)}
                for prob, pos in zip(top_probs, top_pos.tolist())
            ]

        primary_class = top_k_results[0]["class"]
        confidence = top_k_results[0]["confidence"]
        is_healthy = "healthy" in primary_class.lower()
        info = PATHOLOGY_KNOWLEDGE.get(primary_class)
        message = None
        if info is None:
            # No verified management advice for this class: do not invent a treatment.
            info = {
                "crop": primary_class.split("___")[0].replace("_", " "),
                "disease_name": primary_class.split("___")[-1].replace("_", " "),
                "pathogen": None,
                "severity_level": "Low" if is_healthy else None,
                "organic_treatment": None,
                "chemical_treatment": None,
                "prevention": None,
            }
            if not is_healthy:
                message = "No verified treatment advice for this class; please consult an agronomist."

        return {
            "model_available": True,
            "is_heuristic": False,
            "is_healthy": is_healthy,
            "predicted_class": primary_class,
            "confidence": confidence,
            "top_k": top_k_results,
            "crop": info.get("crop"),
            "disease_name": info.get("disease_name"),
            "pathogen": info.get("pathogen"),
            "severity_level": info.get("severity_level"),
            "organic_treatment": info.get("organic_treatment"),
            "chemical_treatment": info.get("chemical_treatment"),
            "prevention": info.get("prevention"),
            "model_name": f"{self.backbone}_plantvillage_v1",
            "message": message,
        }


# Module-level singleton instance (loaded ONCE at process startup)
disease_detector = DiseaseDetector()
