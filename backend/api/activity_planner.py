"""
CropShield / AgriGuard — AI Farm Activity Planner API
Orchestrates seasonal timeline: Smart Irrigation, Fertilizer, Pest Monitoring, Harvest,
and Sustainable Farming Advisor recommendations.
"""
from fastapi import APIRouter, HTTPException, Body
from fastapi.encoders import jsonable_encoder
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from backend.services.activity_planner_service import (
    generate_activity_plan,
    get_active_activity_plan,
    mark_activity_completed,
)
from backend.jobs.activity_reminder_job import run_activity_reminder_job

router = APIRouter()


class GeneratePlanRequest(BaseModel):
    farm_id: str = Field(..., description="Target farm plot ID")
    crop_type: Optional[str] = Field(None, description="Crop name (defaults to farm's crop_type)")
    sowing_date: Optional[str] = Field(None, description="Sowing date in YYYY-MM-DD format (defaults to today)")


@router.post("/activity-planner/generate")
async def create_activity_plan(payload: GeneratePlanRequest):
    """
    Generates a full-season chronological activity plan for the farm:
    - Weekly irrigation checkpoints spanning FAO-56 growth stages
    - Fertilizer splits based on crop nutrient requirements
    - Pest surveillance scans (reusing daily risk pipeline)
    - Target harvest date
    - Sustainable farming tips
    """
    try:
        plan = await generate_activity_plan(
            farm_id=payload.farm_id,
            crop_type=payload.crop_type,
            sowing_date_input=payload.sowing_date,
        )
        data = jsonable_encoder(plan)
        data["id"] = str(plan.id)
        data["farm_id"] = str(plan.farm_id)
        return data
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate activity plan: {str(e)}")


@router.get("/activity-planner/{farm_id}")
async def get_activity_plan(farm_id: str):
    """
    Retrieves the currently active Farm Activity Plan with dynamically updated statuses
    ('upcoming', 'due_today', 'overdue', 'completed').
    """
    try:
        plan = await get_active_activity_plan(farm_id)
        if not plan:
            return {"active": False, "message": "No active activity plan found for this farm."}
        data = jsonable_encoder(plan)
        data["id"] = str(plan.id)
        data["farm_id"] = str(plan.farm_id)
        return {"active": True, "plan": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving plan: {str(e)}")


@router.post("/activity-planner/{farm_id}/activities/{activity_id}/complete")
async def complete_activity(farm_id: str, activity_id: str):
    """
    Marks a scheduled activity as completed on the active timeline.
    Records completion timestamp for compliance and farmer behavior analytics.
    """
    try:
        return await mark_activity_completed(farm_id, activity_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark completed: {str(e)}")


@router.post("/activity-planner/run-reminders-now")
async def trigger_reminders_on_demand():
    """
    Admin / developer trigger to run the daily activity reminder and smart farming alert job immediately.
    """
    try:
        result = await run_activity_reminder_job()
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reminder job execution failed: {str(e)}")
