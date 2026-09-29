"""
CropShield / AgriGuard — AI Farm Activity Planner API
Orchestrates seasonal timeline: Smart Irrigation, Fertilizer, Pest Monitoring, Harvest,
and Sustainable Farming Advisor recommendations.

All farm routes require authentication + farm ownership (admins: any farm;
agronomists: read-only). The manual reminder trigger is admin-only.
"""
import logging
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from backend.models.user import User as MongoUser
from backend.services.activity_planner_service import (
    generate_activity_plan,
    get_active_activity_plan,
    mark_activity_completed,
)
from backend.jobs.activity_reminder_job import run_activity_reminder_job
from backend.utils.auth_utils import require_roles, get_owned_farm

logger = logging.getLogger("cropshield.activity_planner_api")

router = APIRouter()


class GeneratePlanRequest(BaseModel):
    farm_id: str = Field(..., max_length=64, description="Target farm plot ID")
    crop_type: Optional[str] = Field(None, max_length=100, description="Crop name (defaults to farm's crop_type)")
    sowing_date: Optional[date_type] = Field(None, description="Sowing date in YYYY-MM-DD format (defaults to today)")


# NOTE: declared before the /activity-planner/{farm_id} routes.
@router.post("/activity-planner/run-reminders-now")
async def trigger_reminders_on_demand(
    current_user: MongoUser = Depends(require_roles(["admin"])),
):
    """
    Admin-only trigger to run the daily activity reminder and smart farming alert job immediately.
    Reminders are idempotent per activity per day. Returns 409 if a run is already in progress.
    """
    try:
        result = await run_activity_reminder_job()
    except Exception:
        logger.exception("Reminder job execution failed")
        raise HTTPException(status_code=500, detail="Reminder job execution failed.")
    if isinstance(result, dict) and result.get("status") == "skipped":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("message") or "An activity reminder run is already in progress. Try again shortly.",
        )
    return {"status": "success", "result": result}


@router.post("/activity-planner/generate")
async def create_activity_plan(
    payload: GeneratePlanRequest,
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"])),
):
    """
    Generates a full-season chronological activity plan for the farm:
    - Weekly irrigation checkpoints spanning FAO-56 growth stages
    - Fertilizer splits based on crop nutrient requirements
    - Pest surveillance scans (reusing daily risk pipeline)
    - Target harvest date
    - Sustainable farming tips
    """
    farm = await get_owned_farm(payload.farm_id, current_user)
    try:
        plan = await generate_activity_plan(
            farm_id=str(farm.id),
            crop_type=payload.crop_type,
            sowing_date_input=payload.sowing_date.isoformat() if payload.sowing_date else None,
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        logger.exception("Failed to generate activity plan for farm %s", farm.id)
        raise HTTPException(status_code=500, detail="Failed to generate activity plan.")
    data = jsonable_encoder(plan)
    data["id"] = str(plan.id)
    data["farm_id"] = str(plan.farm_id)
    return data


@router.get("/activity-planner/{farm_id}")
async def get_activity_plan(
    farm_id: str,
    current_user: MongoUser = Depends(require_roles(["farmer", "agronomist", "admin"])),
):
    """
    Retrieves the currently active Farm Activity Plan with dynamically updated statuses
    ('upcoming', 'due_today', 'overdue', 'completed').
    """
    farm = await get_owned_farm(farm_id, current_user, allow_staff_read=True)
    try:
        plan = await get_active_activity_plan(str(farm.id))
    except Exception:
        logger.exception("Error retrieving plan for farm %s", farm.id)
        raise HTTPException(status_code=500, detail="Error retrieving plan.")
    if not plan:
        return {"active": False, "message": "No active activity plan found for this farm."}
    data = jsonable_encoder(plan)
    data["id"] = str(getattr(plan, "id", None) or data.get("id") or data.get("_id") or "")
    data["farm_id"] = str(getattr(plan, "farm_id", None) or data.get("farm_id") or farm.id)
    return {"active": True, "plan": data}


@router.post("/activity-planner/{farm_id}/activities/{activity_id}/complete")
async def complete_activity(
    farm_id: str,
    activity_id: str,
    current_user: MongoUser = Depends(require_roles(["farmer", "admin"])),
):
    """
    Marks a scheduled activity as completed on the active timeline.
    Records completion timestamp for compliance and farmer behavior analytics.
    """
    farm = await get_owned_farm(farm_id, current_user)
    try:
        return await mark_activity_completed(str(farm.id), activity_id[:100])
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception:
        logger.exception("Failed to mark activity %s completed", activity_id)
        raise HTTPException(status_code=500, detail="Failed to mark activity completed.")
