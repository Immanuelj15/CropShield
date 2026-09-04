"""
AgriGuard AI — Spatial Outbreak API Router
Generates Haversine distance-decay risk heatmaps for Tamil Nadu districts and villages.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from ml.spatial_outbreak.clustering import calculate_spatial_outbreak_risk, get_full_district_heatmap_data

router = APIRouter()

class SpatialRiskRequest(BaseModel):
    latitude: float = 9.1728
    longitude: float = 77.8710
    bandwidth_km: float = 50.0

@router.get("/outbreak/heatmap")
def get_outbreak_heatmap():
    """
    Returns spatial points for Leaflet map heatmap rendering across Tamil Nadu.
    """
    return {
        "status": "success",
        "region": "Tamil Nadu, India",
        "points": get_full_district_heatmap_data()
    }

@router.post("/outbreak/spatial-risk")
def get_spatial_risk_prediction(req: SpatialRiskRequest):
    """
    Calculates proximity-weighted spatial outbreak risk for a given field coordinate.
    """
    return calculate_spatial_outbreak_risk(req.latitude, req.longitude, req.bandwidth_km)
