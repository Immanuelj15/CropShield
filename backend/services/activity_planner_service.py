"""
CropShield / AgriGuard — AI Farm Activity Planner Service
Orchestrates full-season crop management by unifying:
1. Smart Irrigation schedules (FAO-56 growth stages & Kc checkpoints)
2. Fertilizer application schedules (ICAR/TNAU basal & top dressings)
3. Pest surveillance checkpoints (reusing existing daily risk pipeline)
4. Harvesting timeline windows
5. Sustainable farming advisor tips (crop rotation & moisture conservation)
"""
import uuid
import logging
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List
from beanie import PydanticObjectId

from backend.models.farm import Farm
from backend.models.crop_water_coefficient import CropWaterCoefficient
from backend.models.crop_nutrient_requirement import CropNutrientRequirement
from backend.models.farm_activity_plan import FarmActivityPlan

logger = logging.getLogger("cropshield.activity_planner")


def parse_date(d: Any) -> date:
    """Safely converts string or date object to date."""
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    try:
        return datetime.strptime(str(d).split("T")[0], "%Y-%m-%d").date()
    except Exception:
        return date.today()


def generate_sustainable_farming_tips(
    farm: Farm,
    crop_type: str,
    total_water_need: float,
) -> List[Dict[str, Any]]:
    """
    Generates tailored agronomic sustainability recommendations:
    1. Crop rotation advisory based on farm.crop_history
    2. Evaporation reduction & moisture conservation tips
    """
    tips = []

    # 1. Crop Rotation & Soil Health
    history = getattr(farm, "crop_history", []) or []
    same_recent_count = sum(
        1 for h in history[-3:]
        if h.get("crop_type", "").strip().lower() == crop_type.strip().lower()
    )

    if same_recent_count >= 1:
        tips.append({
            "tip_type": "rotation",
            "title": "Crop Rotation Advisory",
            "message": (
                f"You have cultivated {crop_type} in recent seasons. "
                "Mono-cropping depletes specific root-zone nutrients and builds up soil-borne pathogen spores. "
                "Consider inter-cropping with cowpea/blackgram, or planning a nitrogen-fixing legume for the next cycle."
            ),
            "priority": "High",
        })
    else:
        tips.append({
            "tip_type": "rotation",
            "title": "Soil Biodiversity Benefit",
            "message": (
                f"Good rotational discipline! Introducing {crop_type} into your plot rotation "
                "assists in breaking local pest reproductive cycles and improves subterranean organic matter."
            ),
            "priority": "Low",
        })

    # 2. Moisture Conservation & Efficient Irrigation
    if crop_type in ["Rice", "Sugarcane", "Banana"]:
        tips.append({
            "tip_type": "water_saving",
            "title": "AWD / Irrigation Efficiency Tip",
            "message": (
                f"{crop_type} has high hydraulic demand. Adopting Alternate Wetting and Drying (AWD) "
                "or furrow-compacted irrigation can save up to 28% water without penalizing grain yield."
            ),
            "priority": "Medium",
        })
    else:
        tips.append({
            "tip_type": "water_saving",
            "title": "Mulching & Surface Evaporation Shield",
            "message": (
                "Spreading organic biomass mulch (paddy straw or dried sugarcane leaves) at 3-5 tons/acre "
                "drops daytime soil surface temperatures by 4-6°C and reduces evaporative water loss by 35%."
            ),
            "priority": "Medium",
        })

    # 3. Micro-Climate Drip Timing
    tips.append({
        "tip_type": "timing",
        "title": "Early Morning Irrigation Rule",
        "message": (
            "Schedule pump operations between 5:30 AM and 8:00 AM. "
            "Midday irrigation suffers up to 25% instantaneous aerial drift and evaporation losses."
        ),
        "priority": "Low",
    })

    return tips


async def generate_activity_plan(
    farm_id: str,
    crop_type: Optional[str] = None,
    sowing_date_input: Optional[Any] = None,
) -> FarmActivityPlan:
    """
    Generates a full-season, chronological activity timeline for a farm plot:
    - Weekly irrigation checkpoints spanning FAO-56 growth stages
    - Fertilizer splits based on crop nutrient requirements
    - Pest surveillance scans (reusing daily risk pipeline)
    - Target harvest date
    - Sustainable farming tips
    """
    farm_obj_id = PydanticObjectId(farm_id) if PydanticObjectId.is_valid(farm_id) else farm_id
    farm = await Farm.get(farm_obj_id)
    if not farm:
        raise ValueError(f"Farm not found with id: {farm_id}")

    crop = crop_type or getattr(farm, "crop_type", "Cotton") or "Cotton"
    sowing_dt = parse_date(sowing_date_input or date.today())
    today = date.today()

    # Deactivate existing active plans for this farm
    existing_plans = await FarmActivityPlan.find(
        FarmActivityPlan.farm_id == farm.id,
        FarmActivityPlan.is_active == True,
    ).to_list()
    for p in existing_plans:
        p.is_active = False
        await p.save()

    # 1. Fetch Water Coefficients & Growth Stages
    water_coef = await CropWaterCoefficient.find_one(CropWaterCoefficient.crop_type == crop)
    if not water_coef:
        water_coef = await CropWaterCoefficient.find_one(
            {"crop_type": {"$regex": f"^{crop}$", "$options": "i"}}
        )

    growth_stages = water_coef.growth_stages if water_coef and water_coef.growth_stages else [
        {"stage_name": "Initial", "duration_days": 25, "kc": 0.40},
        {"stage_name": "Development", "duration_days": 35, "kc": 0.75},
        {"stage_name": "Mid-season", "duration_days": 45, "kc": 1.15},
        {"stage_name": "Late-season", "duration_days": 25, "kc": 0.65},
    ]

    # 2. Fetch Nutrient Requirements
    nutrient_req = await CropNutrientRequirement.find_one(CropNutrientRequirement.crop_type == crop)
    if not nutrient_req:
        nutrient_req = await CropNutrientRequirement.find_one(
            {"crop_type": {"$regex": f"^{crop}$", "$options": "i"}}
        )

    splits = nutrient_req.application_split if nutrient_req else [
        {"stage": "Basal (at sowing)", "n_pct": 50, "p_pct": 100, "k_pct": 50, "days_after_sowing": 0},
        {"stage": "Top Dressing", "n_pct": 50, "p_pct": 0, "k_pct": 50, "days_after_sowing": 35},
    ]

    timeline: List[Dict[str, Any]] = []

    # 3. Schedule Irrigation Checkpoints (Weekly through each growth stage)
    current_dt = sowing_dt
    for stage_idx, stage in enumerate(growth_stages):
        stage_name = stage.get("stage_name", f"Stage {stage_idx + 1}")
        duration = stage.get("duration_days", 30)
        kc = stage.get("kc", 0.8)
        stage_end = current_dt + timedelta(days=duration)

        check_dt = current_dt
        while check_dt < stage_end:
            act_id = f"irrig_{check_dt.strftime('%Y%m%d')}_{stage_idx}"
            status = "due_today" if check_dt == today else ("overdue" if check_dt < today else "upcoming")
            timeline.append({
                "activity_id": act_id,
                "activity_type": "irrigation",
                "title": f"Irrigation Check: {stage_name}",
                "scheduled_date": check_dt.isoformat(),
                "details": {
                    "growth_stage": stage_name,
                    "kc": kc,
                    "target_frequency": "Every 7 days",
                    "note": f"Maintain field capacity for {crop} during {stage_name} (Kc = {kc}).",
                },
                "status": status,
                "completed_at": None,
            })
            check_dt += timedelta(days=7)

        current_dt = stage_end

    harvest_date = current_dt

    # 4. Schedule Fertilizer Applications
    for split_idx, split in enumerate(splits):
        das = split.get("days_after_sowing", 0)
        fert_date = sowing_dt + timedelta(days=das)
        act_id = f"fert_{fert_date.strftime('%Y%m%d')}_{split_idx}"
        status = "due_today" if fert_date == today else ("overdue" if fert_date < today else "upcoming")
        stage_label = split.get("stage", f"Application {split_idx + 1}")
        
        timeline.append({
            "activity_id": act_id,
            "activity_type": "fertilizer",
            "title": f"Fertilizer: {stage_label}",
            "scheduled_date": fert_date.isoformat(),
            "details": {
                "stage": stage_label,
                "days_after_sowing": das,
                "n_pct": split.get("n_pct", 0),
                "p_pct": split.get("p_pct", 0),
                "k_pct": split.get("k_pct", 0),
                "note": f"Apply required split dose ({split.get('n_pct', 0)}% N, {split.get('p_pct', 0)}% P, {split.get('k_pct', 0)}% K).",
            },
            "status": status,
            "completed_at": None,
        })

    # 5. Schedule Pest & Disease Surveillance Checkpoints (reusing risk pipeline)
    # Checkpoint 1: Day 14 (Early seedling emergence inspection)
    p1_date = sowing_dt + timedelta(days=14)
    timeline.append({
        "activity_id": f"pest_{p1_date.strftime('%Y%m%d')}_1",
        "activity_type": "pest_check",
        "title": "Seedling Pest Surveillance",
        "scheduled_date": p1_date.isoformat(),
        "details": {
            "checkpoint": "Initial emergence scan",
            "action": "Check lower leaf surfaces for sucking pests and seedling damping-off.",
            "pipeline_link": "/farmer/today",
        },
        "status": "due_today" if p1_date == today else ("overdue" if p1_date < today else "upcoming"),
        "completed_at": None,
    })

    # Checkpoint 2: Mid-Vegetative phase (around Day 45)
    p2_date = sowing_dt + timedelta(days=45)
    if p2_date < harvest_date:
        timeline.append({
            "activity_id": f"pest_{p2_date.strftime('%Y%m%d')}_2",
            "activity_type": "pest_check",
            "title": "Vegetative Health & Disease Scan",
            "scheduled_date": p2_date.isoformat(),
            "details": {
                "checkpoint": "Vegetative canopy check",
                "action": "Upload leaf photos to AgriGuard AI vision detector if foliar lesions appear.",
                "pipeline_link": "/farmer/scan",
            },
            "status": "due_today" if p2_date == today else ("overdue" if p2_date < today else "upcoming"),
            "completed_at": None,
        })

    # Checkpoint 3: Flowering / Fruiting phase (around Day 75)
    p3_date = sowing_dt + timedelta(days=75)
    if p3_date < harvest_date:
        timeline.append({
            "activity_id": f"pest_{p3_date.strftime('%Y%m%d')}_3",
            "activity_type": "pest_check",
            "title": "Reproductive Phase Pest Scan",
            "scheduled_date": p3_date.isoformat(),
            "details": {
                "checkpoint": "Bollworm / fruit borer surveillance",
                "action": "Install pheromone traps and inspect floral buds.",
                "pipeline_link": "/farmer/today",
            },
            "status": "due_today" if p3_date == today else ("overdue" if p3_date < today else "upcoming"),
            "completed_at": None,
        })

    # 6. Schedule Harvest Checkpoint
    timeline.append({
        "activity_id": f"harvest_{harvest_date.strftime('%Y%m%d')}",
        "activity_type": "harvest",
        "title": "Target Physiological Harvest Window",
        "scheduled_date": harvest_date.isoformat(),
        "details": {
            "note": f"Expected maturity reached for {crop}. Check mandi prices for optimal marketing window.",
            "pipeline_link": "/farmer/crop-recommendation",
        },
        "status": "due_today" if harvest_date == today else ("overdue" if harvest_date < today else "upcoming"),
        "completed_at": None,
    })

    # Sort timeline by scheduled_date
    timeline.sort(key=lambda item: item["scheduled_date"])

    # Determine current growth stage today
    elapsed_days = max(0, (today - sowing_dt).days)
    cum = 0
    cur_stage_name = "Initial"
    for st in growth_stages:
        cum += st.get("duration_days", 30)
        if elapsed_days <= cum:
            cur_stage_name = st.get("stage_name", "Initial")
            break
    if elapsed_days > cum:
        cur_stage_name = "Late-season (Maturity)"

    # Generate sustainable farming tips
    tips = generate_sustainable_farming_tips(farm, crop, total_water_need=35.0)

    # Persist activity plan
    plan = FarmActivityPlan(
        farm_id=farm.id,
        crop_type=crop,
        sowing_date=sowing_dt.isoformat(),
        estimated_harvest_date=harvest_date.isoformat(),
        current_stage=cur_stage_name,
        is_active=True,
        timeline=timeline,
        tips=tips,
        generated_at=datetime.utcnow(),
        last_updated=datetime.utcnow(),
    )
    await plan.insert()
    logger.info("Generated active activity plan for farm %s with %d timeline events.", farm.id, len(timeline))
    return plan


async def get_active_activity_plan(farm_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves active plan and refreshes item statuses against today's date."""
    farm_obj_id = PydanticObjectId(farm_id) if PydanticObjectId.is_valid(farm_id) else farm_id
    plan = await FarmActivityPlan.find_one(
        FarmActivityPlan.farm_id == farm_obj_id,
        FarmActivityPlan.is_active == True,
    )
    if not plan:
        return None

    today = date.today()
    updated = False
    for item in plan.timeline:
        if item.get("status") != "completed":
            item_dt = parse_date(item.get("scheduled_date"))
            new_status = "due_today" if item_dt == today else ("overdue" if item_dt < today else "upcoming")
            if item.get("status") != new_status:
                item["status"] = new_status
                updated = True

    if updated:
        plan.last_updated = datetime.utcnow()
        await plan.save()

    # Convert to clean dict response
    data = plan.dict()
    data["id"] = str(plan.id)
    data["farm_id"] = str(plan.farm_id)
    return data


async def mark_activity_completed(farm_id: str, activity_id: str) -> Dict[str, Any]:
    """Marks an activity as completed on the active plan."""
    farm_obj_id = PydanticObjectId(farm_id) if PydanticObjectId.is_valid(farm_id) else farm_id
    plan = await FarmActivityPlan.find_one(
        FarmActivityPlan.farm_id == farm_obj_id,
        FarmActivityPlan.is_active == True,
    )
    if not plan:
        raise ValueError("No active farm activity plan found for this farm.")

    found = False
    for item in plan.timeline:
        if item.get("activity_id") == activity_id:
            item["status"] = "completed"
            item["completed_at"] = datetime.utcnow().isoformat()
            found = True
            break

    if not found:
        raise ValueError(f"Activity with id '{activity_id}' not found in timeline.")

    plan.last_updated = datetime.utcnow()
    await plan.save()

    completed_count = sum(1 for a in plan.timeline if a.get("status") == "completed")
    total_count = len(plan.timeline)

    return {
        "success": True,
        "activity_id": activity_id,
        "completed_count": completed_count,
        "total_activities": total_count,
        "progress_pct": round((completed_count / max(1, total_count)) * 100, 1),
    }
