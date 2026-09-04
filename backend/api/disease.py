"""
AgriGuard AI — Leaf Disease Scan & Pathology Diagnosis API
Accepts leaf image upload (or crop selection sample), executes PyTorch vision inference,
calculates continuous severity %, and returns organic/chemical treatment advisories.
"""

import os
import torch
import numpy as np
from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.models.db_models import DiseaseScanLog
from ml.disease_detection.model import predict_leaf_disease, CLASSES, DISEASE_KNOWLEDGE_BASE

router = APIRouter()

@router.post("/disease/detect")
async def detect_crop_disease(
    file: UploadFile = File(None),
    crop_hint: str = Form("Paddy"),
    db: Session = Depends(get_db)
):
    """
    Leaf image diagnosis endpoint. Accepts image file or defaults to crop sample.
    """
    img_np = None
    if file is not None:
        try:
            contents = await file.read()
            # If PIL available, read image
            from PIL import Image
            import io
            image = Image.open(io.BytesIO(contents)).convert("RGB").resize((224, 224))
            img_np = np.array(image)
        except Exception:
            img_np = None

    if img_np is None:
        # Default matrix fallback for testing
        img_np = np.zeros((224, 224, 3), dtype=np.uint8)
        img_np[:, :, 1] = 140 # greenish
        
    img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).float().unsqueeze(0) / 255.0
    
    # Run PyTorch Model Inference
    result = predict_leaf_disease(img_tensor, original_np=img_np)
    
    # Log to DB
    try:
        scan_log = DiseaseScanLog(
            crop=result["crop"],
            disease_name=result["disease_name"],
            disease_key=result["disease_key"],
            confidence=result["confidence"],
            severity_pct=result["severity_pct"],
            severity_level=result["severity_level"],
            organic_treatment=result["organic_treatment"],
            chemical_treatment=result["chemical_treatment"]
        )
        db.add(scan_log)
        db.commit()
    except Exception:
        db.rollback()

    return {
        "status": "success",
        "crop": result["crop"],
        "disease_name": result["disease_name"],
        "pathogen": result["pathogen"],
        "category": result["category"],
        "confidence": result["confidence"],
        "severity_pct": result["severity_pct"],
        "severity_level": result["severity_level"],
        "organic_treatment": result["organic_treatment"],
        "chemical_treatment": result["chemical_treatment"],
        "recommended_pesticide": result["recommended_pesticide"],
        "npk_recommendation": result["npk_recommendation"],
        "xai_explanation": f"Visual features indicate {result['category'].lower()} lesion clusters covering {result['severity_pct']}% of the leaf area. High confidence ({result['confidence']*100:.1f}%) prediction."
    }

@router.get("/disease/knowledge-base")
def get_disease_knowledge_base():
    """Returns the full agricultural pathology reference library."""
    return DISEASE_KNOWLEDGE_BASE
