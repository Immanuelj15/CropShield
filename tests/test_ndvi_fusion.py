"""
AgriGuard AI — NDVI Satellite Vegetation & Multi-Modal Fusion Tests
Tests Sentinel-2 NDVI calculation, proportional weight redistribution in multi-modal fusion
(including healthy-class / model-unavailable handling, audit P2-5), VegetationSnapshot
persistence, and the authenticated /api/v1/vegetation endpoints.
DB-backed tests use the isolated test database and skip when MongoDB is unreachable.
"""

import pytest
from httpx import AsyncClient

from backend.services.ndvi_service import derive_vegetation_status, _simulate_sentinel2_ndvi
from backend.services.fusion_service import compute_fused_health_score
from conftest import DEMO_FARMER, login_headers


def test_derive_vegetation_status():
    # 1. Stressed: NDVI < 0.40
    assert derive_vegetation_status(0.32, 0.02) == "stressed"
    assert derive_vegetation_status(0.39, -0.01) == "stressed"

    # 2. Declining: Trend < -0.15 even if NDVI >= 0.40
    assert derive_vegetation_status(0.55, -0.18) == "declining"
    assert derive_vegetation_status(0.70, -0.22) == "declining"

    # 3. Healthy: Normal NDVI with stable/positive trend
    assert derive_vegetation_status(0.74, 0.05) == "healthy"
    assert derive_vegetation_status(0.60, -0.05) == "healthy"


def test_sentinel2_ndvi_simulation():
    # Tamil Nadu Delta coordinates (Thanjavur)
    delta_res = _simulate_sentinel2_ndvi(10.7870, 79.1378)
    assert 0.0 <= delta_res["ndvi_value"] <= 1.0
    assert delta_res["cloud_cover_pct"] >= 0.0
    assert len(delta_res["image_date_actual"]) == 10

    # Southern Dryland coordinates (Kovilpatti)
    dryland_res = _simulate_sentinel2_ndvi(9.1768, 77.9803)
    assert 0.0 <= dryland_res["ndvi_value"] <= 1.0


def test_multimodal_fusion_three_signals():
    # All 3 signals present: climate risk=0.20 (health=0.8), image conf=0.10 (health=0.9), ndvi=0.70 (health=0.85)
    fused = compute_fused_health_score(
        climate_risk_score=0.20,
        image_diagnosis_confidence=0.10,
        ndvi_value=0.70
    )
    assert fused["value"] > 70.0
    assert fused["signals_count"] == 3
    assert set(fused["signals_available"]) == {"climate", "image", "ndvi"}
    assert "weather risk contributes" in fused["explanation_text"]
    assert "satellite vegetation health contributes" in fused["explanation_text"]
    assert "leaf photo diagnosis contributes" in fused["explanation_text"]

    # Verify weight sums
    comp = fused["components"]
    assert comp["climate_base_weight"] == 0.5
    assert comp["image_base_weight"] == 0.3
    assert comp["ndvi_base_weight"] == 0.2
    assert (comp["climate_effective_weight"] + comp["image_effective_weight"] + comp["ndvi_effective_weight"]) == 1.0


def test_multimodal_fusion_proportional_redistribution_missing_image():
    # No photo uploaded: climate risk=0.40 (health=0.6), image=None, ndvi=0.60 (health=0.8)
    # Available base weights: climate=0.5, ndvi=0.2 (total=0.7)
    # Effective weights: climate=0.5/0.7 (~0.714), ndvi=0.2/0.7 (~0.286)
    fused = compute_fused_health_score(
        climate_risk_score=0.40,
        image_diagnosis_confidence=None,
        ndvi_value=0.60
    )
    assert fused["signals_count"] == 2
    assert "image" not in fused["signals_available"]
    assert "leaf photo diagnosis" not in fused["explanation_text"]

    comp = fused["components"]
    assert comp["climate_effective_weight"] == round(0.5 / 0.7, 2)
    assert comp["ndvi_effective_weight"] == round(0.2 / 0.7, 2)


def test_multimodal_fusion_proportional_redistribution_missing_ndvi():
    # Heavy cloud cover (no satellite pass): climate risk=0.30, image=0.20, ndvi=None
    # Available base weights: climate=0.5, image=0.3 (total=0.8)
    fused = compute_fused_health_score(
        climate_risk_score=0.30,
        image_diagnosis_confidence=0.20,
        ndvi_value=None
    )
    assert fused["signals_count"] == 2
    assert "ndvi" not in fused["signals_available"]
    comp = fused["components"]
    assert comp["climate_effective_weight"] == round(0.5 / 0.8, 2)
    assert comp["image_effective_weight"] == round(0.3 / 0.8, 2)


def test_fusion_healthy_leaf_class_raises_health():
    # A confident "healthy" prediction is good news; a confident disease is bad news.
    healthy = compute_fused_health_score(0.30, image_diagnosis_confidence=0.95, ndvi_value=0.6,
                                         image_predicted_class="Tomato___healthy")
    diseased = compute_fused_health_score(0.30, image_diagnosis_confidence=0.95, ndvi_value=0.6,
                                          image_predicted_class="Tomato___Late_blight")
    assert healthy["value"] > diseased["value"]


def test_fusion_skips_image_when_model_unavailable():
    fused = compute_fused_health_score(0.30, image_diagnosis_confidence=0.924, ndvi_value=0.6,
                                       image_model_available=False)
    assert "image" not in fused["signals_available"]
    assert fused["signals_count"] == 2


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_vegetation_api_endpoints(client: AsyncClient):
    from backend.models.farm import Farm as MongoFarm
    from backend.models.user import User

    farmer = await User.find_one({"email": DEMO_FARMER[0]})
    farm = await MongoFarm.find_one({"district": "Thanjavur", "owner_id": farmer.id})
    assert farm is not None

    # auth is required now
    assert (await client.get(f"/api/v1/vegetation/{farm.id}")).status_code == 401
    assert (await client.get("/api/v1/vegetation")).status_code == 401

    headers = await login_headers(client, *DEMO_FARMER)
    resp = await client.get(f"/api/v1/vegetation/{farm.id}", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["farm_id"] == str(farm.id)
    assert data["district"] == "Thanjavur"
    assert -1.0 <= data["ndvi_value"] <= 1.0
    assert data["status"] in ["healthy", "stressed", "declining"]
    assert data["fused_health_score"]["value"] >= 0.0
    assert "persisted" in data

    all_resp = await client.get("/api/v1/vegetation", headers=headers)
    assert all_resp.status_code == 200
    all_data = all_resp.json()
    assert all_data["count"] >= 1
    # farmers only see their own farms
    own_ids = {str(f.id) for f in await MongoFarm.find({"owner_id": farmer.id}).to_list()}
    assert {row["farm_id"] for row in all_data["vegetation_data"]} <= own_ids | {str(farmer.farm_id)}


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_process_single_farm_ndvi_job(mongo_db):
    from backend.jobs.ndvi_ingestion_job import process_single_farm_ndvi
    from backend.models.farm import Farm as MongoFarm
    from backend.models.vegetation_snapshot import VegetationSnapshot as MongoVegSnapshot
    from scripts.seed_districts import seed_tamil_nadu_districts

    await seed_tamil_nadu_districts()
    farm = await MongoFarm.find_one({"is_reference_point": True, "district": "Coimbatore"})
    assert farm is not None

    result = await process_single_farm_ndvi(farm)
    assert result is not None
    assert result["farm_id"] == str(farm.id)
    assert result["district"] == "Coimbatore"
    assert result["status"] in ["healthy", "stressed", "declining"]

    snap = await MongoVegSnapshot.find_one({"farm_id": farm.id})
    assert snap is not None
    assert snap.ndvi_value == result["ndvi_value"]
