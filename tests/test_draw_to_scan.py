"""
AgriGuard AI — Automated Draw-to-Scan & Geospatial Outbreak Query Tests
Tests GeoJSON polygon indexing with MongoDB 2dsphere $geoWithin, risk aggregation,
dominant threat calculation, and RBAC broadcast advisory.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.farm import Farm as MongoFarm
from backend.models.alert import Alert as MongoAlert


@pytest_asyncio.fixture(scope="function")
async def client():
    await init_mongodb()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_mongodb()


@pytest.mark.asyncio
async def test_draw_to_scan_area_query(client: AsyncClient):
    # 1. Login as Farmer to get auth token
    login_res = await client.post("/api/v1/auth/login", json={
        "email": "farmer@cropshield.org",
        "password": "farmer123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Define a polygon covering Tamil Nadu agricultural belt (Kovilpatti / Madurai / Tirunelveli)
    # GeoJSON: [lon, lat] pairs, closed ring
    polygon_payload = {
        "type": "Polygon",
        "coordinates": [
            [
                [76.5, 8.5],
                [80.5, 8.5],
                [80.5, 12.0],
                [76.5, 12.0],
                [76.5, 8.5],
            ]
        ]
    }

    # 3. Call POST /api/v1/outbreak/scan-area
    res = await client.post("/api/v1/outbreak/scan-area", json=polygon_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "success"
    assert "farm_count" in data
    assert "risk_breakdown" in data
    assert "farms" in data
    assert "dominant_threat" in data
    assert "Low" in data["risk_breakdown"]
    assert "Medium" in data["risk_breakdown"]
    assert "High" in data["risk_breakdown"]


@pytest.mark.asyncio
async def test_draw_to_scan_empty_polygon(client: AsyncClient):
    # Polygon over the Indian ocean with 0 registered farms
    ocean_polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [85.0, 5.0],
                [86.0, 5.0],
                [86.0, 6.0],
                [85.0, 6.0],
                [85.0, 5.0],
            ]
        ]
    }

    res = await client.post("/api/v1/outbreak/scan-area", json=ocean_polygon)
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "success"
    assert data["farm_count"] == 0
    assert data["farms"] == []


@pytest.mark.asyncio
async def test_broadcast_advisory_rbac(client: AsyncClient):
    polygon_payload = {
        "type": "Polygon",
        "coordinates": [
            [
                [77.0, 9.0],
                [78.5, 9.0],
                [78.5, 10.5],
                [77.0, 10.5],
                [77.0, 9.0],
            ]
        ]
    }

    # 1. Farmer attempt to broadcast advisory -> 403 Forbidden
    farmer_login = await client.post("/api/v1/auth/login", json={
        "email": "farmer@cropshield.org",
        "password": "farmer123"
    })
    farmer_token = farmer_login.json()["access_token"]

    res_farmer = await client.post(
        "/api/v1/outbreak/scan-area/broadcast-advisory",
        json={
            "polygon": polygon_payload,
            "title": "Unauthorized Advisory",
            "message": "Testing RBAC protection",
            "severity": "High"
        },
        headers={"Authorization": f"Bearer {farmer_token}"}
    )
    assert res_farmer.status_code == 403

    # 2. Agronomist attempt to broadcast advisory -> 200 OK
    agro_login = await client.post("/api/v1/auth/login", json={
        "email": "agronomist@cropshield.org",
        "password": "agro123"
    })
    agro_token = agro_login.json()["access_token"]

    res_agro = await client.post(
        "/api/v1/outbreak/scan-area/broadcast-advisory",
        json={
            "polygon": polygon_payload,
            "title": "Regional Whitefly Outbreak Warning",
            "message": "Apply 2% Neem oil or systemic bactericide as per TNAU advisory.",
            "severity": "High"
        },
        headers={"Authorization": f"Bearer {agro_token}"}
    )
    assert res_agro.status_code == 200
    assert res_agro.json()["status"] == "success"
    assert "notified_farms_count" in res_agro.json()
