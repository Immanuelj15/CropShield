"""
CropShield / AgriGuard — Farm Profit & Expense (P&L) API Router
Handles real farmer expenses, crop revenues, seasonal P&L calculation,
and AI prediction accuracy validation.
"""
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Depends, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from backend.models.farm_expense import FarmExpense
from backend.models.farm_revenue import FarmRevenue
from backend.models.season_pnl_summary import SeasonPnlSummary
from backend.services.pnl_service import (
    log_expense,
    log_revenue,
    recompute_pnl_summary,
    get_aggregated_prediction_accuracy,
    seed_pnl_demo_data,
)
from backend.utils.auth_utils import get_optional_current_user

router = APIRouter(tags=["Farm Profit & Expense Tracker"])

RECEIPT_UPLOAD_DIR = Path("uploads") / "receipts"
RECEIPT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class CreateExpenseRequest(BaseModel):
    farm_id: str = Field(..., example="DEMO-FARM-0001")
    season: str = Field("Kharif 2026", example="Kharif 2026")
    crop_type: Optional[str] = Field("Cotton", example="Cotton")
    category: str = Field(..., example="fertilizer")  # seeds | fertilizer | labor | irrigation | pesticides | other
    amount: float = Field(..., gt=0, example=4500.0)
    date: str = Field(default_factory=lambda: datetime.utcnow().strftime("%Y-%m-%d"), example="2026-09-24")
    notes: Optional[str] = Field("", example="Purchased urea and micronutrients at local cooperative")
    receipt_photo_url: Optional[str] = Field(None)
    district: Optional[str] = Field(None)


class CreateRevenueRequest(BaseModel):
    farm_id: str = Field(..., example="DEMO-FARM-0001")
    season: str = Field("Kharif 2026", example="Kharif 2026")
    crop_type: Optional[str] = Field("Cotton", example="Cotton")
    quantity_sold_kg: float = Field(..., gt=0, example=1200.0)
    price_per_kg: float = Field(..., gt=0, example=65.5)
    sale_date: str = Field(default_factory=lambda: datetime.utcnow().strftime("%Y-%m-%d"), example="2026-09-24")
    buyer_or_mandi: Optional[str] = Field("Kovilpatti Regulated Mandi", example="Kovilpatti Regulated Mandi")
    district: Optional[str] = Field(None)


def serialize_doc(doc) -> dict:
    if not doc:
        return {}
    d = jsonable_encoder(doc)
    d["id"] = str(getattr(doc, "id", ""))
    d["_id"] = str(getattr(doc, "id", ""))
    return d


# ── 1. Expenses Endpoints ─────────────────────────────────────

@router.post("/expenses", status_code=status.HTTP_201_CREATED, summary="Log a farm expense")
async def create_expense_endpoint(payload: CreateExpenseRequest):
    """
    Logs an expense transaction and triggers automatic seasonal P&L re-computation.
    """
    try:
        expense = await log_expense(payload.farm_id, payload.dict())
        return {
            "status": "success",
            "message": "Expense logged successfully.",
            "expense": serialize_doc(expense),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to log expense: {str(e)}")


@router.get("/expenses/{farm_id}", summary="Get expenses for a farm")
async def get_expenses_endpoint(
    farm_id: str,
    season: Optional[str] = Query(None, description="Filter by season (e.g. 'Kharif 2026')"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(100, ge=1, le=500)
):
    """Returns chronologically sorted expense logs for the target farm and season."""
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


@router.post("/expenses/receipt-upload", summary="Upload receipt photograph")
async def upload_receipt_endpoint(file: UploadFile = File(...)):
    """Uploads a receipt image and returns a static URL for attaching to an expense."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".pdf"]:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP or PDF files supported.")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_name = f"receipt_{timestamp}_{Path(file.filename or 'img').stem}{ext}"
    dest = RECEIPT_UPLOAD_DIR / safe_name

    with open(dest, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "status": "success",
        "url": f"/uploads/receipts/{safe_name}",
        "filename": safe_name,
    }


@router.delete("/expenses/{expense_id}", summary="Delete an expense")
async def delete_expense_endpoint(expense_id: str):
    """Deletes an expense and recomputes the seasonal summary."""
    try:
        from beanie import PydanticObjectId
        exp = await FarmExpense.get(PydanticObjectId(expense_id)) if PydanticObjectId.is_valid(expense_id) else None
        if not exp:
            exp = await FarmExpense.find_one({"expense_id": expense_id})
        if not exp:
            raise HTTPException(status_code=404, detail="Expense not found.")

        farm_id = exp.farm_id
        season = exp.season
        crop_type = exp.crop_type
        await exp.delete()
        await recompute_pnl_summary(farm_id, season, crop_type=crop_type)
        return {"status": "success", "message": "Expense deleted and P&L updated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 2. Revenue Endpoints ──────────────────────────────────────

@router.post("/revenue", status_code=status.HTTP_201_CREATED, summary="Log crop sale revenue")
async def create_revenue_endpoint(payload: CreateRevenueRequest):
    """
    Logs actual crop harvest sales / mandi revenue and recalculates actual profit.
    """
    try:
        revenue = await log_revenue(payload.farm_id, payload.dict())
        return {
            "status": "success",
            "message": "Harvest revenue logged successfully.",
            "revenue": serialize_doc(revenue),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to log revenue: {str(e)}")


@router.get("/revenue/{farm_id}", summary="Get revenues for a farm")
async def get_revenues_endpoint(
    farm_id: str,
    season: Optional[str] = Query(None, description="Filter by season"),
    limit: int = Query(100, ge=1, le=500)
):
    """Returns chronological sale revenue logs for the farm."""
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
    season: Optional[str] = Query("Kharif 2026", description="Season to query")
):
    """
    Returns the SeasonPnlSummary for the specified farm and season.
    If not already computed, runs a real-time aggregation across logged expenses & revenues.
    """
    summary = await SeasonPnlSummary.find_one(
        SeasonPnlSummary.farm_id == str(farm_id),
        SeasonPnlSummary.season == season
    )
    if not summary:
        # Recompute on the fly
        summary = await recompute_pnl_summary(farm_id, season)

    return serialize_doc(summary)


@router.get("/admin/prediction-accuracy", summary="Aggregated AI Prediction Accuracy Dashboard")
async def get_admin_prediction_accuracy_endpoint():
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
async def seed_demo_data_endpoint():
    """Seeds 10,000-row demo expenses, revenues, and P&L benchmarks from local CSV files."""
    results = await seed_pnl_demo_data()
    return {
        "status": "success",
        "message": "Demo P&L datasets seeded successfully.",
        "results": results,
    }
