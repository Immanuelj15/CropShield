"""
CropShield / AgriGuard — Soil Health Report Document Model
Stores preliminary satellite/regional soil health evaluations (with honest quantile uncertainty)
and verified laboratory soil test reports.
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class SoilHealthReport(Document):
    farm_id: Optional[str] = Field(default=None, index=True)
    boundary_geojson: Dict[str, Any] = Field(
        default_factory=dict,
        description="GeoJSON Polygon boundary of the assessed farm plot"
    )
    area_acres: float = Field(..., description="Plot land area computed via polygon shoelace / geodesic geometry")
    report_type: str = Field(
        default="preliminary",
        description="'preliminary' (SoilGrids + satellite estimate) or 'lab_verified' (farmer lab report)"
    )
    soil_type_declared: Optional[str] = Field(
        default=None,
        description="Farmer-declared or regional reference soil type (e.g. Alluvial Clay, Black Cotton Soil)"
    )
    district: Optional[str] = Field(default=None, index=True)

    # Estimated properties with uncertainty bounds
    estimated_properties: Dict[str, Any] = Field(
        default_factory=dict,
        description="Dictionary containing pH range, qualitative N/P/K bands, and individual confidence percentages"
    )
    overall_confidence_pct: Optional[float] = Field(
        default=None,
        description="Composite uncertainty score derived from SoilGrids prediction quantiles"
    )

    # Topographical data
    elevation_m: float = Field(default=0.0, description="Mean plot elevation above sea level in meters (SRTM)")
    terrain_slope_pct: float = Field(default=0.0, description="Estimated terrain slope percentage (SRTM)")

    data_sources: List[str] = Field(
        default_factory=lambda: ["SoilGrids v2.0", "NASA POWER", "SRTM (via Google Earth Engine)"],
        description="Transparent record of scientific ingestion sources"
    )

    # Laboratory verification fields (when report_type == 'lab_verified')
    lab_report_file_url: Optional[str] = Field(
        default=None,
        description="Relative static file path to farmer-uploaded laboratory test PDF or photograph"
    )
    lab_measured_values: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Verified quantitative lab measurements: {ph, nitrogen_kg, phosphorus_kg, potassium_kg, organic_carbon_pct, lab_name, test_date}"
    )

    generated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "soil_health_reports"
        indexes = [
            IndexModel([("farm_id", ASCENDING)], name="soil_health_farm_id_idx"),
            IndexModel([("report_type", ASCENDING)], name="soil_health_report_type_idx"),
            IndexModel([("generated_at", DESCENDING)], name="soil_health_generated_at_idx"),
            IndexModel([("district", ASCENDING)], name="soil_health_district_idx"),
        ]
