"""
CropShield — Warning History API (v2)
GET /api/v1/history — paginated pest_warning_logs
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.db.database import get_db
from backend.models.schemas import WarningHistoryResponse, WarningHistoryItem
from backend.models.db_models import PestWarningLog

router = APIRouter()


@router.get(
    "/history",
    response_model=WarningHistoryResponse,
    summary="Today's Warning History",
)
def get_history(
    location: Optional[str] = Query(None),
    crop:     Optional[str] = Query(None),
    limit:    int = Query(50, ge=1, le=200),
    offset:   int = Query(0,  ge=0),
    db: Session = Depends(get_db),
):
    """Return paginated history of today's-warning predictions."""
    q = db.query(PestWarningLog)
    if location:
        q = q.filter(PestWarningLog.location.ilike(f"%{location}%"))
    if crop:
        q = q.filter(PestWarningLog.crop.ilike(f"%{crop}%"))

    total = q.count()
    items = q.order_by(desc(PestWarningLog.created_at)).offset(offset).limit(limit).all()

    return WarningHistoryResponse(
        total=total,
        items=[
            WarningHistoryItem(
                id=p.id,
                warning_date=p.warning_date,
                location=p.location,
                crop=p.crop,
                climate_zone=p.climate_zone.value if p.climate_zone else None,
                risk_score=p.risk_score,
                risk_level=p.risk_level.value if p.risk_level else "Low",
                is_warning=p.risk_level.value in ("Medium","High") if p.risk_level else False,
            )
            for p in items
        ],
    )
