"""
AgriGuard AI — Leaf Disease Scan & Pathology Diagnosis API
Accepts leaf image upload, validates payload, runs inference via DiseaseDetector singleton,
persists records to Beanie MongoDB, and returns organic/chemical treatment advisories.
"""

import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException, status
from beanie import PydanticObjectId

from backend.models.disease_detection import DiseaseDetection as MongoDiseaseDetection
from backend.models.farm import Farm as MongoFarm
from backend.models.user import User as MongoUser
from backend.services.disease_service import disease_detector
from backend.utils.auth_utils import get_current_user, get_optional_current_user

router = APIRouter(tags=["Crop Disease Vision Scan"])

# Ensure uploads directory exists
UPLOAD_DIR = Path("uploads/disease_images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "application/octet-stream"}


@router.post("/disease/detect")
async def detect_crop_disease(
    file: UploadFile = File(...),
    crop_hint: Optional[str] = Form("Cotton"),
    current_user: Optional[MongoUser] = Depends(get_optional_current_user)
):
    """
    Leaf image diagnosis endpoint:
    1. Validates file format and size (max 10MB).
    2. Stores image in uploads/disease_images/.
    3. Runs PyTorch ResNet18 transfer-learning inference via DiseaseDetector singleton.
    4. Persists record in MongoDB (disease_detections collection).
    5. Returns predicted class, top-k alternatives, confidence, and actionable management steps.
    """
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMPTY_FILE", "message": "No leaf image file uploaded."}
        )

    # 1. Validate file extension
    ext = Path(file.filename or "image.jpg").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_FILE_TYPE",
                "message": f"Unsupported file extension '{ext}'. Please upload JPG, PNG, or WebP."
            }
        )

    # 2. Validate MIME type if provided
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_MIME_TYPE",
                "message": f"Invalid content type '{file.content_type}'. Must be an image."
            }
        )

    # 3. Stream & check size limit
    saved_filename = f"{uuid.uuid4().hex}{ext}"
    saved_path = UPLOAD_DIR / saved_filename

    try:
        size = 0
        with open(saved_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                size += len(chunk)
                if size > MAX_FILE_SIZE_BYTES:
                    buffer.close()
                    saved_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail={"code": "FILE_TOO_LARGE", "message": "Uploaded file exceeds 10MB limit."}
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        saved_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "STORAGE_ERROR", "message": f"Could not save uploaded image: {str(e)}"}
        )

    # 4. Run PyTorch Disease Detection Inference
    try:
        result = disease_detector.predict(
            image_path=str(saved_path),
            top_k=3,
            crop_hint=crop_hint
        )
    except Exception as inf_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INFERENCE_ERROR", "message": f"Disease classification failed: {str(inf_err)}"}
        )

    # 5. Persist to MongoDB Beanie
    farm_id = getattr(current_user, "farm_id", None)
    user_id = getattr(current_user, "id", None)

    if not farm_id and current_user:
        user_farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id)
        if user_farm:
            farm_id = user_farm.id

    relative_image_url = f"/uploads/disease_images/{saved_filename}"

    try:
        doc = MongoDiseaseDetection(
            farm_id=farm_id,
            user_id=user_id,
            image_url=relative_image_url,
            predicted_class=result["predicted_class"],
            confidence=result["confidence"],
            top_k=result["top_k"],
            model_name=result["model_name"],
            created_at=datetime.utcnow()
        )
        await doc.insert()
        detection_id = str(doc.id)
    except Exception as db_err:
        detection_id = "pending_save"

    # 6. Return response to frontend
    return {
        "status": "success",
        "detection_id": detection_id,
        "predicted_class": result["predicted_class"],
        "confidence": result["confidence"],
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
        "advisory_summary": (
            f"Diagnosed {result['disease_name']} on {result['crop']} with "
            f"{round(result['confidence']*100, 1)}% confidence. Follow prescribed organic or chemical treatment."
        )
    }


@router.get("/disease/recent")
async def get_recent_disease_scans(
    limit: int = 10,
    current_user: Optional[MongoUser] = Depends(get_current_user)
):
    """Returns recent disease detection scans for the current farmer or platform."""
    query = {}
    if current_user and current_user.role == "farmer":
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
