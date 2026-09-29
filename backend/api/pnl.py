"""
CropShield / AgriGuard — Farm Profit & Expense (P&L) API Router
Handles real farmer expenses, crop revenues, seasonal P&L calculation,
and AI prediction accuracy validation.

All routes require authentication. Farm-scoped routes require ownership of the farm
(admins may access any farm, including the seeded non-ObjectId demo farm ids).
"""
import logging
import re
import uuid
from datetime import date as date_type, datetime
from pathlib import Path
from typing import Optional, Literal

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Depends, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, field_validator

from backend.models.farm_expense import FarmExpense
from backend.models.farm_revenue import FarmRevenue
from backend.models.season_pnl_summary import SeasonPnlSummary
from backend.models.user import User as MongoUser
from backend.services.pnl_service import (
    log_expense,
    log_revenue,
    recompute_pnl_summary,
    get_aggregated_prediction_accuracy,
    seed_pnl_demo_data,
)
from backend.utils.auth_utils import require_roles, get_owned_farm
from backend.utils.uploads import save_upload_file

logger = logging.getLogger("cropshield.pnl_api")

router = APIRouter(tags=["Farm Profit & Expense Tracker"])

RECEIPT_UPLOAD_DIR = Path("uploads") / "receipts"
RECEIPT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RECEIPT_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
RECEIPT_URL_RE = re.compile(r"^/uploads/receipts/[A-Za-z0-9_\-]+\.(jpg|jpeg|png|webp|pdf)$", re.IGNORECASE)

MAX_AMOUNT = 1e9
ExpenseCategory = Literal["seeds", "fertilizer", "labor", "irrigation", "pesticides", "other"]
FARMER_ROLES = ["farmer", "admin"]


def _default_crop(v: Optional[str]) -> str:
    v = (v or "").strip()
    return v or "General"


class CreateExpenseRequest(BaseModel):
    farm_id: str = Field(..., max_length=64, example="66f0c0ffee0000000000abcd")
    season: str = Field("Kharif 2026", min_length=1, max_length=40, example="Kharif 2026")
    crop_type: Optional[str] = Field("General", max_length=100, example="Cotton")
    category: ExpenseCategory = Field(..., example="fertilizer")
    amount: float = Field(..., gt=0, le=MAX_AMOUNT, allow_inf_nan=False, example=4500.0)
    date: date_type = Field(default_factory=lambda: datetime.utcnow().date(), example="2026-09-24")
    notes: Optional[str] = Field("", max_length=2000, example="Purchased urea and micronutrients at local cooperative")
    receipt_photo_url: Optional[str] = Field(None, max_length=300)
    district: Optional[str] = Field(None, max_length=100)

    @field_validator("category", mode="before")
    @classmethod
    def _normalize_category(cls, v):
        return v.strip().lower() if isinstance(v, str) else v

    @field_validator("crop_type", mode="after")
    @classmethod
    def _crop_default(cls, v):
        return _default_crop(v)

    @field_validator("receipt_photo_url", mode="after")
    @classmethod
    def _check_receipt_url(cls, v):
        if v is None or v == "":
            return None
        if not RECEIPT_URL_RE.match(v):
            raise ValueError("receipt_photo_url must be a /uploads/receipts/<file> URL returned by the upload endpoint.")
        return v


class CreateRevenueRequest(BaseModel):
    farm_id: str = Field(..., max_length=64, example="66f0c0ffee0000000000abcd")
    season: str = Field("Kharif 2026", min_length=1, max_length=40, example="Kharif 2026")
    crop_type: Optional[str] = Field("General", max_length=100, example="Cotton")
    quantity_sold_kg: float = Field(..., gt=0, le=MAX_AMOUNT, allow_inf_nan=False, example=1200.0)
    price_per_kg: float = Field(..., gt=0, le=MAX_AMOUNT, allow_inf_nan=False, example=65.5)
    sale_date: date_type = Field(default_factory=lambda: datetime.utcnow().date(), example="2026-09-24")
    buyer_or_mandi: Optional[str] = Field("Kovilpatti Regulated Mandi", max_length=200, example="Kovilpatti Regulated Mandi")
    district: Optional[str] = Field(None, max_length=100)

    @field_validator("crop_type", mode="after")
    @classmethod
    def _crop_default(cls, v):
        return _default_crop(v)


def serialize_doc(doc) -> dict:
    if not doc:
        return {}
    d = jsonable_encoder(doc)
    d["id"] = str(getattr(doc, "id", "") or "")
    d["_id"] = d["id"]
    return d


async def _authorize_farm(farm_id: str, user: MongoUser):
    """
    Ownership check for P&L routes. Returns the Farm, or None for an admin accessing a
    seeded demo farm id (non-ObjectId, e.g. 'DEMO-FARM-0001'). Raises 404/403 otherwise.
    """
    from beanie import PydanticObjectId
    if user.role == "admin" and not PydanticObjectId.is_valid(str(farm_id)):
        return None
    return await get_owned_farm(farm_id, user)


async def _pnl_record_exists(farm_id: str) -> bool:
    return bool(
        await FarmExpense.find_one(FarmExpense.farm_id == str(farm_id))
        or await FarmRevenue.find_one(FarmRevenue.farm_id == str(farm_id))
        or await SeasonPnlSummary.find_one(SeasonPnlSummary.farm_id == str(farm_id))
    )


# ── 1. Expenses Endpoints ─────────────────────────────────────

@router.post("/expenses", status_code=status.HTTP_201_CREATED, summary="Log a farm expense")
async def create_expense_endpoint(
    payload: CreateExpenseRequest,
    current_user: MongoUser = Depends(require_roles(FARMER_ROLES)),
):
    """
    Logs an expense transaction and triggers automatic seasonal P&L re-computation.
    """
    farm = await _authorize_farm(payload.farm_id, current_user)
    data = payload.model_dump()
    data["date"] = payload.date.isoformat()
    if farm and not data.get("district"):
        data["district"] = farm.district
    try:
        expense = await log_expense(payload.farm_id, data)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to log expense for farm %s", payload.farm_id)
        raise HTTPException(status_code=500, detail="Failed to log expense.")
    return {
        "status": "success",
        "message": "Expense logged successfully.",
        "expense": serialize_doc(expense),
    }


@router.post("/expenses/receipt-upload", summary="Upload receipt photograph")
async def upload_receipt_endpoint(
    file: UploadFile = File(...),
    current_user: MongoUser = Depends(require_roles(FARMER_ROLES)),
):
    """Uploads a receipt image/PDF (max 10 MB) and returns a static URL for attaching to an expense."""
    saved_name = await save_upload_file(file, RECEIPT_UPLOAD_DIR, RECEIPT_ALLOWED_EXTENSIONS)
    return {
        "status": "success",
        "url": f"/uploads/receipts/{saved_name}",
        "filename": saved_name,
    }


@router.get("/expenses/{farm_id}", summary="Get expenses for a farm")
async def get_expenses_endpoint(
    farm_id: str,
    season: Optional[str] = Query(None, max_length=40, description="Filter by season (e.g. 'Kharif 2026')"),
    category: Optional[str] = Query(None, max_length=40, description="Filter by category"),
    limit: int = Query(100, ge=1, le=500),
    current_user: MongoUser = Depends(require_roles(FARMER_ROLES)),
):
    """Returns chronologically sorted expense logs for the target farm and season."""
    await _authorize_farm(farm_id, current_user)
    query = {"farm_id": str(farm_id)}
    if season:
        query["season"] = season
    if category:
        query["category"] = category.lower().strip()

    expenses = await FarmExpense.find(query).sort(-FarmExpense.date).limit(limit).to_list()
    return {
        "farm_id": farm_id,
        "count": len(expenses),
        "expenses": [serialize_doc(e) for e in expenses],
    }


@router.delete("/expenses/{expense_id}", summary="Delete an expense")
async def delete_expense_endpoint(
    expense_id: str,
    current_user: MongoUser = Depends(require_roles(FARMER_ROLES)),
):
    """Deletes an expense (owner of its farm or admin) and recomputes the seasonal summary."""
    from beanie import PydanticObjectId
    exp = None
    if PydanticObjectId.is_valid(expense_id):
        exp = await FarmExpense.get(PydanticObjectId(expense_id))
    if not exp:
        exp = await FarmExpense.find_one({"expense_id": expense_id})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found.")

    await _authorize_farm(exp.farm_id, current_user)

    farm_id, season, crop_type = exp.farm_id, exp.season, exp.crop_type
    await exp.delete()
    try:
        await recompute_pnl_summary(farm_id, season, crop_type=crop_type)
    except Exception:
        logger.exception("P&L recompute failed after deleting expense %s", expense_id)
    return {"status": "success", "message": "Expense deleted and P&L updated."}


# ── 2. Revenue Endpoints ──────────────────────────────────────

@router.post("/revenue", status_code=status.HTTP_201_CREATED, summary="Log crop sale revenue")
async def create_revenue_endpoint(
    payload: CreateRevenueRequest,
    current_user: MongoUser = Depends(require_roles(FARMER_ROLES)),
):
    """
    Logs actual crop harvest sales / mandi revenue and recalculates actual profit.
    """
    farm = await _authorize_farm(payload.farm_id, current_user)
    data = payload.model_dump()
    data["sale_date"] = payload.sale_date.isoformat()
    if farm and not data.get("district"):
        data["district"] = farm.district
    try:
        revenue = await log_revenue(payload.farm_id, data)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to log revenue for farm %s", payload.farm_id)
        raise HTTPException(status_code=500, detail="Failed to log revenue.")
    return {
        "status": "success",
        "message": "Harvest revenue logged successfully.",
        "revenue": serialize_doc(revenue),
    }


@router.get("/revenue/{farm_id}", summary="Get revenues for a farm")
async def get_revenues_endpoint(
    farm_id: str,
    season: Optional[str] = Query(None, max_length=40, description="Filter by season"),
    limit: int = Query(100, ge=1, le=500),
    current_user: MongoUser = Depends(require_roles(FARMER_ROLES)),
):
    """Returns chronological sale revenue logs for the farm."""
    await _authorize_farm(farm_id, current_user)
    query = {"farm_id": str(farm_id)}
    if season:
        query["season"] = season

    revenues = await FarmRevenue.find(query).sort(-FarmRevenue.sale_date).limit(limit).to_list()
    return {
        "farm_id": farm_id,
        "count": len(revenues),
        "revenues": [serialize_doc(r) for r in revenues],
    }


# ── 3. Farm P&L Summary & Accuracy Endpoints ─────────────────

@router.get("/farm-pnl/{farm_id}", summary="Get seasonal P&L summary and prediction accuracy")
async def get_farm_pnl_endpoint(
    farm_id: str,
    season: Optional[str] = Query("Kharif 2026", max_length=40, description="Season to query"),
    current_user: MongoUser = Depends(require_roles(FARMER_ROLES)),
):
    """
    Returns the SeasonPnlSummary for the specified farm and season.
    If not already stored, computes it on the fly from logged expenses & revenues
    WITHOUT persisting (no writes on GET). Unknown farm -> 404.
    """
    farm = await _authorize_farm(farm_id, current_user)
    if farm is None and not await _pnl_record_exists(farm_id):
        raise HTTPException(status_code=404, detail="Farm not found.")

    summary = await SeasonPnlSummary.find_one(
        SeasonPnlSummary.farm_id == str(farm_id),
        SeasonPnlSummary.season == season
    )
    if not summary:
        summary = await recompute_pnl_summary(farm_id, season, persist=False)

    return serialize_doc(summary)


@router.get("/admin/prediction-accuracy", summary="Aggregated AI Prediction Accuracy Dashboard")
async def get_admin_prediction_accuracy_endpoint(
    current_user: MongoUser = Depends(require_roles(["admin"])),
):
    """
    Aggregates predicted-vs-actual accuracy across all registered farms and seasons.
    Used for objective evaluation of the pre-season AI profit prediction engine.
    """
    stats = await get_aggregated_prediction_accuracy()
    return {
        "status": "success",
        "timestamp": datetime.utcnow().isoformat(),
        **stats,
    }


@router.post("/pnl/seed-demo-data", summary="Seed PnL demo datasets from CSV")
async def seed_demo_data_endpoint(
    current_user: MongoUser = Depends(require_roles(["admin"])),
):
    """Admin only: seeds 10,000-row demo expenses, revenues, and P&L benchmarks from local CSV files."""
    results = await seed_pnl_demo_data()
    return {
        "status": "success",
        "message": "Demo P&L datasets seeded successfully.",
        "results": results,
        "simulated": True,
    }
