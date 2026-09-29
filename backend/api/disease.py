"""
AgriGuard AI — Leaf Disease Scan & Pathology Diagnosis API
Accepts leaf image upload, validates payload, runs inference via DiseaseDetector singleton,
persists records to Beanie MongoDB, and returns organic/chemical treatment advisories.

Contract item 7: when no trained model is available the response carries
`model_available: false`, `is_heuristic: true`, `confidence: null`, no treatment,
and a `message` — the heuristic placeholder class is never presented as a diagnosis.
"""

import asyncio
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException, Query, status

from backend.models.disease_detection import DiseaseDetection as MongoDiseaseDetection
from backend.models.user import User as MongoUser
from backend.services.disease_service import disease_detector
from backend.utils.auth_utils import get_current_user, resolve_user_farm
from backend.utils.uploads import save_upload_file

logger = logging.getLogger("cropshield.disease_api")

router = APIRouter(tags=["Crop Disease Vision Scan"])

# Ensure uploads directory exists
UPLOAD_DIR = Path("uploads/disease_images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "application/octet-stream"}

MODEL_UNAVAILABLE_MESSAGE = (
    "The leaf disease model is not available on this server, so no diagnosis can be made. "
    "Please consult your local agronomist or try again later."
)


@router.post("/disease/detect")
async def detect_crop_disease(
    file: UploadFile = File(...),
    crop_hint: Optional[str] = Form("Cotton"),
    farm_id: Optional[str] = Form(None),
    current_user: MongoUser = Depends(get_current_user)
):
    """
    Leaf image diagnosis endpoint:
    1. Validates file format and size (max 10MB).
    2. Stores image in uploads/disease_images/ under a uuid name.
    3. Runs PyTorch inference via DiseaseDetector singleton (in a worker thread).
    4. Persists record in MongoDB (only for real model predictions).
    5. Returns predicted class, top-k alternatives, confidence, and actionable management steps.
    """
    # 0. Farm attribution (must be owned when given; else the caller's own farm)
    farm = await resolve_user_farm(farm_id, current_user)

    # 1. Validate MIME type if provided
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_MIME_TYPE",
                "message": f"Invalid content type '{file.content_type}'. Must be an image."
            }
        )

    # 2. Validate extension + stream to disk with 10 MB cap
    saved_filename = await save_upload_file(file, UPLOAD_DIR, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES)
    saved_path = UPLOAD_DIR / saved_filename

    # 3. Run PyTorch Disease Detection Inference off the event loop
    try:
        result = await asyncio.to_thread(
            disease_detector.predict,
            image_path=str(saved_path),
            top_k=3,
            crop_hint=crop_hint,
        )
    except Exception:
        logger.exception("Disease classification failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INFERENCE_ERROR", "message": "Disease classification failed."}
        )

    if "model_available" in result:
        model_available = bool(result.get("model_available"))
    else:
        model_available = bool(getattr(disease_detector, "has_weights", False))
    is_heuristic = bool(result.get("is_heuristic", not model_available))
    relative_image_url = f"/uploads/disease_images/{saved_filename}"

    if not model_available:
        return {
            "status": "model_unavailable",
            "detection_id": None,
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
            "image_url": relative_image_url,
            "model_name": result.get("model_name"),
            "message": result.get("message") or MODEL_UNAVAILABLE_MESSAGE,
            "advisory_summary": None,
        }

    # 4. Persist to MongoDB Beanie
    detection_id = None
    try:
        doc = MongoDiseaseDetection(
            farm_id=farm.id if farm else None,
            user_id=current_user.id,
            image_url=relative_image_url,
            predicted_class=result["predicted_class"],
            confidence=result["confidence"],
            top_k=result["top_k"],
            model_name=result["model_name"],
            created_at=datetime.utcnow()
        )
        await doc.insert()
        detection_id = str(doc.id)
    except Exception:
        logger.exception("Failed to persist disease detection")

    confidence = result.get("confidence")
    # 5. Return response to frontend
    return {
        "status": "success",
        "detection_id": detection_id,
        "model_available": True,
        "is_heuristic": is_heuristic,
        "predicted_class": result["predicted_class"],
        "confidence": confidence,
        "top_k": result["top_k"],
        "crop": result["crop"],
        "disease_name": result["disease_name"],
        "pathogen": result["pathogen"],
        "severity_level": result["severity_level"],
        "organic_treatment": result["organic_treatment"],
        "chemical_treatment": result["chemical_treatment"],
        "prevention": result["prevention"],
        "image_url": relative_image_url,
        "model_name": result["model_name"],
        "message": result.get("message"),
        "advisory_summary": (
            f"Diagnosed {result['disease_name']} on {result['crop']} with "
            f"{round(confidence * 100, 1)}% confidence. Follow prescribed organic or chemical treatment."
            if confidence is not None else None
        ),
    }


@router.get("/disease/recent")
async def get_recent_disease_scans(
    limit: int = Query(10, ge=1, le=100),
    current_user: MongoUser = Depends(get_current_user)
):
    """Returns recent disease detection scans for the current farmer (staff see platform-wide)."""
    query = {}
    if current_user.role == "farmer":
        query["user_id"] = current_user.id

    docs = await MongoDiseaseDetection.find(query).sort(-MongoDiseaseDetection.created_at).limit(limit).to_list()
    return [
        {
            "id": str(d.id),
            "image_url": d.image_url,
            "predicted_class": d.predicted_class,
            "confidence": d.confidence,
            "top_k": d.top_k,
            "model_name": d.model_name,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in docs
    ]
