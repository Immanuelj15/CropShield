"""
CropShield / AgriGuard — Soil Health Analyzer API Router
Provides endpoints to:
1. Generate preliminary soil health reports with real uncertainty quantiles from boundary polygon.
2. Upload verified laboratory soil test reports (multipart PDF/image + manual quantitative measurements).
3. Retrieve effective soil data (preferring lab-verified over preliminary).
4. View soil health history for a farm.
5. Seed demo dataset from `soil_health_preliminary_reports_demo_10000rows.csv`.
"""
import os
import csv
import json
import logging
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from backend.models.soil_health_report import SoilHealthReport
from backend.models.farm import Farm
from backend.services.soil_health_service import (
    generate_preliminary_soil_report,
    get_effective_soil_data,
    compute_polygon_area_acres,
)

logger = logging.getLogger("cropshield.soil_health_api")

router = APIRouter(prefix="/soil-health", tags=["Soil Health Analyzer"])

UPLOAD_DIR = Path("uploads/soil_reports")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class GenerateSoilReportRequest(BaseModel):
    farm_id: Optional[str] = None
    boundary_geojson: Dict[str, Any]
    soil_type_declared: Optional[str] = None
    district: Optional[str] = None


def serialize_report(r: SoilHealthReport) -> dict:
    d = jsonable_encoder(r)
    d["id"] = str(r.id)
    d["_id"] = str(r.id)
    return d


@router.post("/generate", response_model=Dict[str, Any], summary="Generate Preliminary Soil Report from Boundary")
async def generate_soil_report_endpoint(req: GenerateSoilReportRequest):
    """
    Evaluates drawn farm boundary, fetches SoilGrids v2.0 published prediction quantiles,
    computes honest uncertainty bounds, and generates a preliminary SoilHealthReport.
    """
    if not req.boundary_geojson or "coordinates" not in req.boundary_geojson:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON boundary polygon coordinates.")

    try:
        report = await generate_preliminary_soil_report(
            farm_id=req.farm_id,
            boundary_geojson=req.boundary_geojson,
            soil_type_declared=req.soil_type_declared,
            district=req.district,
        )
        return {
            "status": "success",
            "report_id": str(report.id),
            "report": serialize_report(report),
        }
    except Exception as e:
        logger.error("Failed to generate preliminary soil report: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate soil report: {str(e)}")


@router.post("/{farm_id}/upload-lab-report", summary="Upload Verified Laboratory Soil Test Report")
async def upload_lab_report_endpoint(
    farm_id: str,
    file: UploadFile = File(...),
    ph: float = Form(..., description="Laboratory measured pH"),
    nitrogen_kg: float = Form(..., description="Laboratory available Nitrogen in kg/acre"),
    phosphorus_kg: float = Form(..., description="Laboratory available Phosphorus (P2O5) in kg/acre"),
    potassium_kg: float = Form(..., description="Laboratory available Potassium (K2O) in kg/acre"),
    organic_carbon_pct: Optional[float] = Form(0.65, description="Laboratory Organic Carbon percentage"),
    lab_name: Optional[str] = Form("Govt. District Soil Testing Laboratory", description="Testing Lab Name"),
    test_date: Optional[str] = Form(None, description="Date of lab analysis YYYY-MM-DD"),
    soil_type_declared: Optional[str] = Form(None, description="Soil classification determined by lab"),
):
    """
    Stores farmer-uploaded lab report (PDF/image) alongside verified numerical measurements.
    Creates a 'lab_verified' SoilHealthReport document which permanently OVERRIDES preliminary estimates.
    """
    # 1. Validate file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in [".pdf", ".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only PDF, PNG, JPG, or WebP files are supported.")

    # 2. Save file
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"lab_soil_{farm_id}_{timestamp}{ext}"
    dest_path = UPLOAD_DIR / safe_filename

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save lab report file: {str(e)}")

    file_url = f"/uploads/soil_reports/{safe_filename}"

    # 3. Retrieve farm boundary and district if available
    farm = await Farm.find_one({"_id": farm_id}) if hasattr(Farm, "find_one") else None
    if not farm:
        try:
            from beanie import PydanticObjectId
            if PydanticObjectId.is_valid(farm_id):
                farm = await Farm.get(PydanticObjectId(farm_id))
        except Exception:
            pass

    boundary = getattr(farm, "boundary_geojson", {}) or {
        "type": "Polygon",
        "coordinates": [[[77.87, 9.17], [77.88, 9.17], [77.88, 9.18], [77.87, 9.18], [77.87, 9.17]]]
    }
    area_acres = compute_polygon_area_acres(boundary) if boundary else 2.5
    district = getattr(farm, "district", "Thoothukudi")

    # 4. Create lab_verified document
    lab_report = SoilHealthReport(
        farm_id=farm_id,
        boundary_geojson=boundary,
        area_acres=area_acres,
        report_type="lab_verified",
        soil_type_declared=soil_type_declared or getattr(farm, "soil_type", "Lab Tested Soil"),
        district=district,
        estimated_properties={
            "ph": {"mean": ph, "value_range": [ph, ph], "confidence_pct": 100.0, "status": "Direct Measurement"},
            "nitrogen": {"level": "Measured", "value_kg_per_acre": nitrogen_kg, "confidence_pct": 100.0},
            "phosphorus": {"level": "Measured", "value_kg_per_acre": phosphorus_kg, "confidence_pct": 100.0},
            "potassium": {"level": "Measured", "value_kg_per_acre": potassium_kg, "confidence_pct": 100.0},
            "organic_carbon": {"level": "Measured", "value_pct": organic_carbon_pct, "confidence_pct": 100.0},
        },
        overall_confidence_pct=100.0,
        elevation_m=120.0,
        terrain_slope_pct=1.0,
        data_sources=[f"Verified Laboratory Testing ({lab_name})", "Farmer Document Submission"],
        lab_report_file_url=file_url,
        lab_measured_values={
            "ph": ph,
            "nitrogen_kg": nitrogen_kg,
            "phosphorus_kg": phosphorus_kg,
            "potassium_kg": potassium_kg,
            "organic_carbon_pct": organic_carbon_pct,
            "lab_name": lab_name,
            "test_date": test_date or datetime.utcnow().strftime("%Y-%m-%d"),
            "file_name": file.filename,
        },
        generated_at=datetime.utcnow(),
    )

    await lab_report.insert()
    logger.info("Successfully uploaded lab-verified soil report %s for farm %s", lab_report.id, farm_id)

    return {
        "status": "success",
        "message": "Verified lab soil test report processed successfully. Downstream recommendations updated.",
        "report_id": str(lab_report.id),
        "report": serialize_report(lab_report),
    }


@router.get("/{farm_id}/effective", summary="Get Effective Soil Data for Farm (Lab Verified > Preliminary)")
async def get_effective_soil_endpoint(farm_id: str):
    """
    Returns the active soil data for this farm.
    If a verified lab report exists, returns lab measurements.
    Otherwise, returns the latest preliminary satellite estimate.
    """
    data = await get_effective_soil_data(farm_id)
    if not data:
        raise HTTPException(
            status_code=404,
            detail="No soil health report (preliminary or lab verified) found for this farm."
        )
    return data


@router.get("/{farm_id}/history", summary="Get Soil Health Assessment History for Farm")
async def get_soil_history_endpoint(farm_id: str):
    """Returns chronological soil reports (both preliminary estimates and lab verifications)."""
    reports = await SoilHealthReport.find(
        SoilHealthReport.farm_id == str(farm_id)
    ).sort(-SoilHealthReport.generated_at).to_list()

    return {
        "farm_id": farm_id,
        "count": len(reports),
        "reports": [serialize_report(r) for r in reports],
    }


@router.post("/seed-demo-data", summary="Seed Demo Soil Reports from CSV")
async def seed_demo_soil_reports_endpoint(limit: int = 50):
    """
    Seeds a sample of real preliminary reports from `soil_health_preliminary_reports_demo_10000rows.csv`
    into MongoDB for immediate testing and presentation.
    """
    csv_path = Path("soil_health_preliminary_reports_demo_10000rows.csv")
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="Demo CSV file not found on server.")

    count = 0
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if count >= limit:
                break

            # Create mock GeoJSON boundary around the district
            dist = row.get("district", "Thoothukudi")
            area = float(row.get("area_acres", 2.5))
            ph_m = float(row.get("ph_mean", 7.0))
            ph_low = float(row.get("ph_range_low", 6.75))
            ph_high = float(row.get("ph_range_high", 7.25))

            rep = SoilHealthReport(
                farm_id=f"demo_farm_{row.get('report_id', count)}",
                boundary_geojson={
                    "type": "Polygon",
                    "coordinates": [[[77.85, 9.15], [77.87, 9.15], [77.87, 9.17], [77.85, 9.17], [77.85, 9.15]]]
                },
                area_acres=area,
                report_type="preliminary",
                soil_type_declared=row.get("soil_type_declared", "Alluvial Clay"),
                district=dist,
                estimated_properties={
                    "ph": {
                        "mean": ph_m,
                        "value_range": [ph_low, ph_high],
                        "confidence_pct": float(row.get("ph_confidence_pct", 88.0)),
                    },
                    "nitrogen": {
                        "level": row.get("nitrogen_level", "Medium"),
                        "confidence_pct": float(row.get("nitrogen_confidence_pct", 60.0)),
                    },
                    "phosphorus": {
                        "level": row.get("phosphorus_level", "Not available (SoilGrids does not model phosphorus)"),
                        "confidence_pct": None,
                        "note": "SoilGrids does not directly model phosphorus. Upload lab report.",
                    },
                    "potassium": {
                        "level": row.get("potassium_level", "Medium"),
                        "confidence_pct": float(row.get("potassium_confidence_pct", 55.0)),
                    },
                    "organic_carbon": {
                        "level": row.get("organic_carbon_level", "Medium"),
                        "confidence_pct": float(row.get("organic_carbon_confidence_pct", 45.0)),
                    },
                },
                overall_confidence_pct=float(row.get("overall_confidence_pct", 60.0)),
                elevation_m=float(row.get("elevation_m", 150.0)),
                terrain_slope_pct=float(row.get("terrain_slope_pct", 1.0)),
                data_sources=["ISRIC SoilGrids v2.0 (Quantile Demo)", "NASA POWER", "SRTM"],
                generated_at=datetime.utcnow(),
            )
            await rep.insert()
            count += 1

    return {"status": "success", "seeded_reports_count": count}
