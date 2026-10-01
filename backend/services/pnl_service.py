"""
CropShield / AgriGuard — Farm Profit & Expense (P&L) Service
Tracks actual expenses & revenues across seasons, recomputes P&L summaries,
and compares actual net profit against AI pre-season predicted ranges for model validation.

Money is stored as float rupees, always rounded to 2 decimal places (paise precision).
Request models bound every amount to 0 < x <= 1e9 and reject NaN/inf, so products and
sums stay finite. (Converting storage to integer paise was judged too invasive for the
existing demo datasets and frontend; rounding is applied consistently instead.)
"""
import os
import csv
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from pathlib import Path

from backend.models.farm_expense import FarmExpense
from backend.models.farm_revenue import FarmRevenue
from backend.models.season_pnl_summary import SeasonPnlSummary
from backend.models.farm import Farm
from backend.models.crop_cost_template import CropCostTemplate

try:
    from pymongo.errors import DuplicateKeyError
except Exception:  # pragma: no cover
    DuplicateKeyError = Exception  # type: ignore

EXPENSE_CATEGORIES = ("seeds", "fertilizer", "labor", "irrigation", "pesticides", "other")
GENERIC_CROP_NAMES = {"", "general", "general crop", "all", "other"}

logger = logging.getLogger("cropshield.pnl_service")


def _round_money(value: float) -> float:
    return round(float(value), 2)


async def _load_farm(farm_id: str) -> Optional[Farm]:
    """Loads the real Farm for this id (no arbitrary-farm fallback)."""
    try:
        from beanie import PydanticObjectId
        if PydanticObjectId.is_valid(str(farm_id)):
            return await Farm.get(PydanticObjectId(str(farm_id)))
    except Exception:
        logger.debug("Farm lookup failed for %s", farm_id, exc_info=True)
    return None


async def get_predicted_profit_range_for_season(
    farm_id: str,
    season: str,
    crop_type: Optional[str] = None,
    existing_summary: Optional[SeasonPnlSummary] = None,
) -> Optional[Dict[str, float]]:
    """
    Derives the pre-season predicted profit range for this farm and season from the
    real farm area + crop cost template. Recomputed every time (not frozen), so farm
    area / crop changes are reflected. If the farm id does not resolve to a real farm
    (e.g. seeded demo ids), the previously stored range is kept; otherwise None.
    """
    farm = await _load_farm(farm_id)
    if not farm:
        if existing_summary and existing_summary.predicted_profit_range:
            return existing_summary.predicted_profit_range
        return None

    crop = crop_type if (crop_type and crop_type.strip().lower() not in GENERIC_CROP_NAMES) else farm.crop_type
    if not crop:
        return None
    land_area_acres = float(farm.area_hectares or 0.0) * 2.471
    if land_area_acres <= 0:
        return None

    # Derive baseline pre-season prediction from Cost Template & Market Band
    cost_tpl = await CropCostTemplate.find_one(CropCostTemplate.crop_type == crop)
    if not cost_tpl:
        return None
    est_cost = cost_tpl.total_cost_per_acre * land_area_acres
    # Typical profit band: 25% - 65% net return on cost
    return {
        "min": _round_money(est_cost * 0.25),
        "max": _round_money(est_cost * 0.65),
    }


def _compute_accuracy(predicted: Optional[Dict[str, float]], actual_profit: float) -> Optional[Dict[str, Any]]:
    if not predicted or "min" not in predicted or "max" not in predicted:
        return None
    p_min = min(predicted["min"], predicted["max"])
    p_max = max(predicted["min"], predicted["max"])
    midpoint = (p_min + p_max) / 2.0
    deviation_pct = (
        round(abs(actual_profit - midpoint) / abs(midpoint) * 100.0, 1) if midpoint != 0 else None
    )
    return {
        "actual_within_predicted_range": bool(p_min <= actual_profit <= p_max),
        "deviation_pct": deviation_pct,
    }


async def recompute_pnl_summary(
    farm_id: str,
    season: str,
    crop_type: Optional[str] = None,
    persist: bool = True,
):
    """
    Aggregates all expenses and revenues for a farm + season, calculates actual net profit,
    and checks whether actual profit falls within the predicted profit range.

    persist=True  -> race-safe upsert of the SeasonPnlSummary; returns the stored document.
    persist=False -> returns an unsaved SeasonPnlSummary (used by GET routes: no writes on GET).
    """
    expenses = await FarmExpense.find(
        FarmExpense.farm_id == str(farm_id),
        FarmExpense.season == season
    ).to_list()

    revenues = await FarmRevenue.find(
        FarmRevenue.farm_id == str(farm_id),
        FarmRevenue.season == season
    ).to_list()

    breakdown = {
        "seeds": 0.0,
        "fertilizer": 0.0,
        "labor": 0.0,
        "irrigation": 0.0,
        "pesticides": 0.0,
        "other": 0.0,
    }
    detected_crop = crop_type
    detected_district = None

    for exp in expenses:
        cat = exp.category.lower().strip() if exp.category else "other"
        if cat in breakdown:
            breakdown[cat] += float(exp.amount or 0.0)
        else:
            breakdown["other"] += float(exp.amount or 0.0)
        if not detected_crop and exp.crop_type:
            detected_crop = exp.crop_type
        if not detected_district and exp.district:
            detected_district = exp.district

    for rev in revenues:
        if not detected_crop and rev.crop_type:
            detected_crop = rev.crop_type
        if not detected_district and rev.district:
            detected_district = rev.district

    total_expenses = _round_money(sum(breakdown.values()))
    total_revenue = _round_money(sum(float(r.total_revenue or 0.0) for r in revenues))
    actual_profit = _round_money(total_revenue - total_expenses)

    existing = await SeasonPnlSummary.find_one(
        SeasonPnlSummary.farm_id == str(farm_id),
        SeasonPnlSummary.season == season
    )

    # Predicted profit range (recomputed from the real farm; never an arbitrary farm)
    predicted = await get_predicted_profit_range_for_season(
        farm_id, season, detected_crop, existing_summary=existing
    )
    accuracy = _compute_accuracy(predicted, actual_profit)

    data = {
        "crop_type": detected_crop or "General",
        "district": detected_district or "Tamil Nadu",
        "total_expenses": total_expenses,
        "expense_breakdown": {k: _round_money(v) for k, v in breakdown.items()},
        "total_revenue": total_revenue,
        "actual_profit": actual_profit,
        "predicted_profit_range": predicted,
        "prediction_accuracy": accuracy,
        "last_updated": datetime.utcnow(),
    }

    if not persist:
        if existing:
            return existing.model_copy(update=data)
        return SeasonPnlSummary(farm_id=str(farm_id), season=season, **data)

    summary = await _upsert_summary(str(farm_id), season, data, existing)

    logger.info("Recomputed P&L for farm %s (%s): profit=₹%.2f, within_range=%s",
                farm_id, season, actual_profit, accuracy.get("actual_within_predicted_range") if accuracy else None)
    return summary


async def _upsert_summary(
    farm_id: str,
    season: str,
    data: Dict[str, Any],
    existing: Optional[SeasonPnlSummary],
) -> SeasonPnlSummary:
    """
    Race-safe upsert on the unique (farm_id, season) index: update when present, else insert;
    if a concurrent request inserted first (DuplicateKeyError), fall back to an update.
    """
    if existing is None:
        try:
            summary = SeasonPnlSummary(farm_id=farm_id, season=season, **data)
            await summary.insert()
            return summary
        except DuplicateKeyError:
            existing = await SeasonPnlSummary.find_one(
                SeasonPnlSummary.farm_id == farm_id,
                SeasonPnlSummary.season == season
            )
            if existing is None:
                raise
    await existing.update({"$set": data})
    refreshed = await SeasonPnlSummary.get(existing.id)
    return refreshed or existing


async def log_expense(farm_id: str, expense_data: dict) -> FarmExpense:
    """Logs a new farm expense and recomputes the seasonal P&L summary."""
    data = {**expense_data, "farm_id": str(farm_id)}
    data["amount"] = _round_money(data.get("amount", 0.0))
    data["crop_type"] = data.get("crop_type") or "General"
    expense = FarmExpense(**data)
    await expense.insert()
    season = data.get("season", "Kharif 2026")
    crop_type = data.get("crop_type")
    # The expense is already stored: a summary refresh failure must not surface as a failed
    # insert (the client would retry and double-count). Log it; the next write recomputes.
    try:
        await recompute_pnl_summary(farm_id, season, crop_type=crop_type)
    except Exception:
        logger.exception("P&L summary recompute failed after expense insert (farm=%s, season=%s)", farm_id, season)
    return expense


async def log_revenue(farm_id: str, revenue_data: dict) -> FarmRevenue:
    """Logs crop harvest revenue and recomputes the seasonal P&L summary."""
    data = {**revenue_data, "farm_id": str(farm_id)}
    qty = float(data.get("quantity_sold_kg", 0.0))
    price = float(data.get("price_per_kg", 0.0))
    data["price_per_kg"] = _round_money(price)
    data["total_revenue"] = _round_money(qty * price)
    data["crop_type"] = data.get("crop_type") or "General"

    revenue = FarmRevenue(**data)
    await revenue.insert()
    season = data.get("season", "Kharif 2026")
    crop_type = data.get("crop_type")
    try:
        await recompute_pnl_summary(farm_id, season, crop_type=crop_type)
    except Exception:
        logger.exception("P&L summary recompute failed after revenue insert (farm=%s, season=%s)", farm_id, season)
    return revenue


async def get_aggregated_prediction_accuracy() -> Dict[str, Any]:
    """
    Computes aggregated model validation statistics across all farms and seasons.
    Used by the Admin Prediction Accuracy Dashboard.
    """
    summaries = await SeasonPnlSummary.find().to_list()
    valid_summaries = [s for s in summaries if s.prediction_accuracy and s.prediction_accuracy.get("deviation_pct") is not None]
    # Seeded CSV demo rows use farm ids like "DEMO-FARM-0001" (see seed_pnl_demo_data)
    demo_seasons = sum(1 for s in valid_summaries if str(s.farm_id).upper().startswith("DEMO-"))

    if not valid_summaries:
        return {
            "simulated": False,
            "demo_seasons": 0,
            "total_seasons": 0,
            "within_range_count": 0,
            "accuracy_rate_pct": 0.0,
            "average_deviation_pct": 0.0,
            "crop_breakdown": {},
            "district_breakdown": {},
        }

    within_count = sum(1 for s in valid_summaries if s.prediction_accuracy.get("actual_within_predicted_range"))
    deviations = [s.prediction_accuracy["deviation_pct"] for s in valid_summaries if s.prediction_accuracy.get("deviation_pct") is not None]
    avg_dev = round(sum(deviations) / len(deviations), 1) if deviations else 0.0
    accuracy_rate = round((within_count / len(valid_summaries)) * 100.0, 1)

    # Crop breakdown
    crops: Dict[str, Dict[str, Any]] = {}
    for s in valid_summaries:
        c = s.crop_type or "Other"
        if c not in crops:
            crops[c] = {"total": 0, "within_range": 0, "deviations": []}
        crops[c]["total"] += 1
        if s.prediction_accuracy.get("actual_within_predicted_range"):
            crops[c]["within_range"] += 1
        if s.prediction_accuracy.get("deviation_pct") is not None:
            crops[c]["deviations"].append(s.prediction_accuracy["deviation_pct"])

    crop_breakdown = {
        c: {
            "total": d["total"],
            "within_range": d["within_range"],
            "accuracy_pct": round((d["within_range"] / d["total"]) * 100.0, 1) if d["total"] else 0.0,
            "avg_deviation_pct": round(sum(d["deviations"]) / len(d["deviations"]), 1) if d["deviations"] else 0.0,
        }
        for c, d in crops.items()
    }

    # District breakdown
    districts: Dict[str, Dict[str, Any]] = {}
    for s in valid_summaries:
        dist = s.district or "Unknown"
        if dist not in districts:
            districts[dist] = {"total": 0, "within_range": 0, "deviations": []}
        districts[dist]["total"] += 1
        if s.prediction_accuracy.get("actual_within_predicted_range"):
            districts[dist]["within_range"] += 1
        if s.prediction_accuracy.get("deviation_pct") is not None:
            districts[dist]["deviations"].append(s.prediction_accuracy["deviation_pct"])

    district_breakdown = {
        dist: {
            "total": d["total"],
            "within_range": d["within_range"],
            "accuracy_pct": round((d["within_range"] / d["total"]) * 100.0, 1) if d["total"] else 0.0,
            "avg_deviation_pct": round(sum(d["deviations"]) / len(d["deviations"]), 1) if d["deviations"] else 0.0,
        }
        for dist, d in districts.items()
    }

    return {
        "simulated": demo_seasons > 0,
        "demo_seasons": demo_seasons,
        "total_seasons": len(valid_summaries),
        "within_range_count": within_count,
        "accuracy_rate_pct": accuracy_rate,
        "average_deviation_pct": avg_dev,
        "crop_breakdown": crop_breakdown,
        "district_breakdown": district_breakdown,
    }


async def seed_pnl_demo_data(csv_dir: str = ".") -> Dict[str, int]:
    """
    Seeds farm_expenses, farm_revenue, and season_pnl_summary from local CSV files
    if collections are currently empty.
    """
    results = {"expenses": 0, "revenue": 0, "summaries": 0}

    # 1. Seed Expenses
    exp_count = await FarmExpense.count()
    exp_file = Path(csv_dir) / "farm_expenses_demo.csv"
    if exp_count == 0 and exp_file.exists():
        logger.info("Seeding farm_expenses from %s ...", exp_file)
        docs = []
        with open(exp_file, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    docs.append(FarmExpense(
                        expense_id=row.get("expense_id"),
                        farm_id=row.get("farm_id", "DEMO-FARM-0001"),
                        district=row.get("district"),
                        season=row.get("season", "Kharif 2025"),
                        crop_type=row.get("crop_type", "General"),
                        category=row.get("category", "other").lower().strip(),
                        amount=float(row.get("amount", 0.0)),
                        date=row.get("date", "2025-06-01"),
                        notes=row.get("notes") or "",
                    ))
                    if len(docs) >= 1000:
                        await FarmExpense.insert_many(docs)
                        results["expenses"] += len(docs)
                        docs = []
                except Exception as e:
                    logger.debug("Error parsing expense row: %s", e)
        if docs:
            await FarmExpense.insert_many(docs)
            results["expenses"] += len(docs)

    # 2. Seed Revenue
    rev_count = await FarmRevenue.count()
    rev_file = Path(csv_dir) / "farm_revenue_demo.csv"
    if rev_count == 0 and rev_file.exists():
        logger.info("Seeding farm_revenue from %s ...", rev_file)
        docs = []
        with open(rev_file, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    qty = float(row.get("quantity_sold_kg", 0.0))
                    price = float(row.get("price_per_kg", 0.0))
                    total = float(row.get("total_revenue", qty * price))
                    docs.append(FarmRevenue(
                        revenue_id=row.get("revenue_id"),
                        farm_id=row.get("farm_id", "DEMO-FARM-0001"),
                        district=row.get("district"),
                        season=row.get("season", "Kharif 2025"),
                        crop_type=row.get("crop_type", "General"),
                        quantity_sold_kg=qty,
                        price_per_kg=price,
                        total_revenue=total,
                        sale_date=row.get("sale_date", "2025-09-01"),
                        buyer_or_mandi=row.get("buyer_or_mandi"),
                    ))
                    if len(docs) >= 500:
                        await FarmRevenue.insert_many(docs)
                        results["revenue"] += len(docs)
                        docs = []
                except Exception as e:
                    logger.debug("Error parsing revenue row: %s", e)
        if docs:
            await FarmRevenue.insert_many(docs)
            results["revenue"] += len(docs)

    # 3. Seed P&L Summaries
    pnl_count = await SeasonPnlSummary.count()
    pnl_file = Path(csv_dir) / "farm_pnl_summary_demo.csv"
    if pnl_count == 0 and pnl_file.exists():
        logger.info("Seeding season_pnl_summary from %s ...", pnl_file)
        docs = []
        with open(pnl_file, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    farm_id = row.get("farm_id", "DEMO-FARM-0001")
                    season = row.get("season", "Kharif 2025")
                    tot_exp = float(row.get("total_expenses", 0.0))
                    tot_rev = float(row.get("total_revenue", 0.0))
                    profit = float(row.get("actual_profit", tot_rev - tot_exp))
                    p_min = float(row.get("predicted_profit_min", 0.0))
                    p_max = float(row.get("predicted_profit_max", 0.0))

                    pred_min = min(p_min, p_max)
                    pred_max = max(p_min, p_max)
                    within = row.get("actual_within_predicted_range", "False").lower() in ("true", "1")
                    mid = (pred_min + pred_max) / 2.0
                    dev = round(abs(profit - mid) / abs(mid) * 100.0, 1) if mid != 0 else None

                    docs.append(SeasonPnlSummary(
                        farm_id=farm_id,
                        season=season,
                        total_expenses=tot_exp,
                        total_revenue=tot_rev,
                        actual_profit=profit,
                        predicted_profit_range={"min": pred_min, "max": pred_max},
                        prediction_accuracy={
                            "actual_within_predicted_range": within,
                            "deviation_pct": dev,
                        },
                        last_updated=datetime.utcnow(),
                    ))
                    if len(docs) >= 500:
                        await SeasonPnlSummary.insert_many(docs)
                        results["summaries"] += len(docs)
                        docs = []
                except Exception as e:
                    logger.debug("Error parsing pnl summary row: %s", e)
        if docs:
            await SeasonPnlSummary.insert_many(docs)
            results["summaries"] += len(docs)

    logger.info("P&L Seeding complete: %s", results)
    return results
