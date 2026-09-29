"""
Farm ownership and P&L authorization (audit P0-3 / P0-4 / P0-5 / P1-9, contract items 3–5).
Farmer B must never read or modify farmer A's farm, expenses, revenue or P&L.
Runs against the isolated test database; skips when MongoDB is unreachable.
"""
import pytest
from httpx import AsyncClient

from conftest import DEMO_FARMER, create_farm, login_headers, register_farmer

pytestmark = pytest.mark.mongo

UNKNOWN_FARM_ID = "0123456789abcdef01234567"


async def _two_farmers(client):
    a_headers, _ = await register_farmer(client, "Farmer A")
    b_headers, _ = await register_farmer(client, "Farmer B")
    farm_a = await create_farm(client, a_headers, "Farm A")
    return a_headers, b_headers, farm_a


def _expense(farm_id, **over):
    body = {"farm_id": farm_id, "season": "Kharif 2026", "crop_type": "Cotton",
            "category": "fertilizer", "amount": 4500.0, "date": "2026-09-01", "notes": "urea"}
    body.update(over)
    return body


def _revenue(farm_id):
    return {"farm_id": farm_id, "season": "Kharif 2026", "crop_type": "Cotton",
            "quantity_sold_kg": 1200.0, "price_per_kg": 65.5, "sale_date": "2026-10-01"}


@pytest.mark.asyncio
async def test_farm_update_and_delete_are_owner_only(client: AsyncClient):
    a, b, farm_a = await _two_farmers(client)

    assert (await client.put(f"/api/v1/farms/{farm_a}", json={"farm_name": "Hijacked"}, headers=b)).status_code == 403
    assert (await client.delete(f"/api/v1/farms/{farm_a}", headers=b)).status_code == 403
    assert (await client.put(f"/api/v1/farms/{farm_a}", json={"farm_name": "Hijacked"})).status_code == 401

    # B's farm list never contains A's farm
    b_farms = (await client.get("/api/v1/farms", headers=b)).json()
    assert all(f.get("farm_id") != farm_a for f in b_farms)

    # The owner can update; only the sent field changes
    upd = await client.put(f"/api/v1/farms/{farm_a}", json={"farm_name": "Farm A renamed"}, headers=a)
    assert upd.status_code == 200
    assert upd.json()["farm"]["farm_name"] == "Farm A renamed"
    assert upd.json()["farm"]["crop_type"] == "Cotton"

    assert (await client.delete(f"/api/v1/farms/{UNKNOWN_FARM_ID}", headers=a)).status_code == 404
    assert (await client.delete(f"/api/v1/farms/{farm_a}", headers=a)).status_code == 200


@pytest.mark.asyncio
async def test_pnl_requires_auth(client: AsyncClient):
    _, _, farm_a = await _two_farmers(client)
    assert (await client.get(f"/api/v1/expenses/{farm_a}")).status_code == 401
    assert (await client.get(f"/api/v1/revenue/{farm_a}")).status_code == 401
    assert (await client.get(f"/api/v1/farm-pnl/{farm_a}")).status_code == 401
    assert (await client.post("/api/v1/expenses", json=_expense(farm_a))).status_code == 401


@pytest.mark.asyncio
async def test_pnl_other_farmer_is_forbidden(client: AsyncClient):
    a, b, farm_a = await _two_farmers(client)

    created = await client.post("/api/v1/expenses", json=_expense(farm_a), headers=a)
    assert created.status_code == 201, created.text
    expense = created.json()["expense"]
    assert expense["crop_type"] == "Cotton"

    assert (await client.get(f"/api/v1/expenses/{farm_a}", headers=b)).status_code in (403, 404)
    assert (await client.get(f"/api/v1/revenue/{farm_a}", headers=b)).status_code in (403, 404)
    assert (await client.get(f"/api/v1/farm-pnl/{farm_a}", headers=b)).status_code in (403, 404)
    assert (await client.post("/api/v1/expenses", json=_expense(farm_a), headers=b)).status_code in (403, 404)
    assert (await client.post("/api/v1/revenue", json=_revenue(farm_a), headers=b)).status_code in (403, 404)
    assert (await client.delete(f"/api/v1/expenses/{expense['id']}", headers=b)).status_code in (403, 404)

    # The owner still sees their data
    own = await client.get(f"/api/v1/expenses/{farm_a}", headers=a)
    assert own.status_code == 200 and own.json()["count"] == 1
    pnl = await client.get(f"/api/v1/farm-pnl/{farm_a}", headers=a)
    assert pnl.status_code == 200


@pytest.mark.asyncio
async def test_pnl_validation_and_unknown_farm(client: AsyncClient):
    a, _, farm_a = await _two_farmers(client)

    assert (await client.post("/api/v1/expenses", json=_expense(farm_a, amount=-5), headers=a)).status_code == 422
    assert (await client.post("/api/v1/expenses", json=_expense(farm_a, amount=2e9), headers=a)).status_code == 422
    assert (await client.post("/api/v1/expenses", json=_expense(farm_a, category="bribes"), headers=a)).status_code == 422
    blob = _expense(farm_a, receipt_photo_url="blob:http://localhost/abc")
    assert (await client.post("/api/v1/expenses", json=blob, headers=a)).status_code == 422

    # crop_type defaults to "General"
    ok = await client.post("/api/v1/expenses", json=_expense(farm_a, crop_type=None), headers=a)
    assert ok.status_code == 201, ok.text
    assert ok.json()["expense"]["crop_type"] == "General"

    # Unknown farm -> 404, and a GET never creates a summary
    assert (await client.get(f"/api/v1/farm-pnl/{UNKNOWN_FARM_ID}", headers=a)).status_code == 404
    from backend.models.season_pnl_summary import SeasonPnlSummary
    assert await SeasonPnlSummary.find_one(SeasonPnlSummary.farm_id == UNKNOWN_FARM_ID) is None


@pytest.mark.asyncio
async def test_pnl_admin_endpoints_are_admin_only(client: AsyncClient):
    farmer = await login_headers(client, *DEMO_FARMER)
    assert (await client.get("/api/v1/admin/prediction-accuracy", headers=farmer)).status_code == 403
    assert (await client.post("/api/v1/pnl/seed-demo-data", headers=farmer)).status_code == 403
    assert (await client.get("/api/v1/admin/prediction-accuracy")).status_code == 401
