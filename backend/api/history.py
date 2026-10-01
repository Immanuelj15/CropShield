"""
CropShield — Warning History API (v2)
GET /api/v1/history — paginated pest_warning_logs
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_, false

from backend.db.database import get_db
from backend.models.schemas import WarningHistoryResponse, WarningHistoryItem
from backend.models.db_models import PestWarningLog
from backend.utils.auth_utils import get_current_user

# Legacy SQLite warning logs carry no owner column, so a farmer's rows are matched by their
# farms' coordinates (~1 km box). Staff (agronomist/admin) see the platform-wide log.
_COORD_TOLERANCE_DEG = 0.01

router = APIRouter()


@router.get(
    "/history",
    response_model=WarningHistoryResponse,
    summary="Today's Warning History",
)
async def get_history(
    location: Optional[str] = Query(None),
    crop:     Optional[str] = Query(None),
    limit:    int = Query(50, ge=1, le=200),
    offset:   int = Query(0,  ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return paginated history of today's-warning predictions (own farms only for farmers)."""
    q = db.query(PestWarningLog)
    if current_user.role not in ("agronomist", "admin"):
        from backend.models.farm import Farm
        farms = await Farm.find(Farm.owner_id == current_user.id).to_list()
        boxes = []
        for farm in farms:
            coords = (farm.location or {}).get("coordinates") or []
            if len(coords) != 2:
                continue
            lon, lat = float(coords[0]), float(coords[1])
            boxes.append(and_(
                PestWarningLog.latitude.between(lat - _COORD_TOLERANCE_DEG, lat + _COORD_TOLERANCE_DEG),
                PestWarningLog.longitude.between(lon - _COORD_TOLERANCE_DEG, lon + _COORD_TOLERANCE_DEG),
            ))
        q = q.filter(or_(*boxes) if boxes else false())
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
