"""
disease_route_example.py
---------------------------
Shows exactly how to wire DiseaseDetector into your FastAPI backend
(backend/api/disease.py) so POST /api/v1/disease/detect works end-to-end.

Loads the model ONCE at startup (module-level singleton / lifespan),
persists the diagnosis to Beanie MongoDB, and returns the classification response.
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from pathlib import Path
import shutil
import uuid
import datetime
from typing import Optional

from backend.services.inference_disease_detection import DiseaseDetector
from backend.utils.auth_utils import get_current_user
from backend.models.user import User as MongoUser
from backend.models.disease_detection import DiseaseDetection as MongoDiseaseDetection
from backend.models.farm import Farm as MongoFarm

router = APIRouter(prefix="/api/v1/disease", tags=["disease"])

# Load once, at import time / app startup — NOT inside the request handler
detector = DiseaseDetector(backbone="resnet18")

UPLOAD_DIR = Path("uploads/disease_images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/detect")
async def detect_disease(
    file: UploadFile = File(...),
    current_user: Optional[MongoUser] = Depends(get_current_user),
):
    # 1. Validate file
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    ext = Path(file.filename or "image.jpg").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Invalid image extension")

    # 2. Save the uploaded image
    saved_name = f"{uuid.uuid4().hex}{ext}"
    saved_path = UPLOAD_DIR / saved_name
    with open(saved_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 3. Run inference via singleton
    result = detector.predict(str(saved_path), top_k=3)

    # 4. Persist to MongoDB Beanie
    farm_id = getattr(current_user, "farm_id", None)
    user_id = getattr(current_user, "id", None)
    if not farm_id and current_user:
        user_farm = await MongoFarm.find_one(MongoFarm.owner_id == current_user.id)
        if user_farm:
            farm_id = user_farm.id

    doc = MongoDiseaseDetection(
        farm_id=farm_id,
        user_id=user_id,
        image_url=f"/uploads/disease_images/{saved_name}",
        predicted_class=result["predicted_class"],
        confidence=result["confidence"],
        top_k=result["top_k"],
        model_name=result.get("model_name", "resnet18_plantvillage_v1"),
        created_at=datetime.datetime.utcnow(),
    )
    await doc.insert()

    # 5. Return to frontend
    return {
        "predicted_class": result["predicted_class"],
        "confidence": result["confidence"],
        "top_k": result["top_k"],
        "image_url": f"/uploads/disease_images/{saved_name}",
        "detection_id": str(doc.id),
    }
