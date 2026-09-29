"""
Shared pytest configuration for CropShield.

Isolation guarantees (audit P3-8):
- Every test uses a SEPARATE MongoDB database (default `cropshield_test`, override with
  CROPSHIELD_TEST_DB; the name must contain "test"), set BEFORE any backend module is imported.
  The real `cropshield_db` is never touched. The test database is dropped at session end
  (set CROPSHIELD_TEST_KEEP_DB=1 to keep it for debugging).
- The legacy SQLite store points at a throw-away file in a temp directory (not ./cropshield.db).
- Twilio / VAPID credentials are blanked, so no real SMS, WhatsApp or push can be sent.
- DB-backed tests use the `mongo_db` / `client` fixtures, which SKIP (not error) when MongoDB is
  unreachable at CROPSHIELD_TEST_MONGODB_URL (default mongodb://localhost:27017).
- Tests that call external APIs (NASA POWER, SoilGrids) are marked `network` and only run with
  CROPSHIELD_TEST_NETWORK=1.

Run from anywhere:  python -m pytest tests -q
Pure unit tests only: python -m pytest tests -q -m "not mongo and not network"
"""
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
# Settings, model paths, uploads and CSVs are CWD-relative: always run from the repo root.
os.chdir(ROOT)

# ── Test environment (must be set before importing anything from `backend`) ─────────────
TEST_DB_NAME = os.environ.get("CROPSHIELD_TEST_DB", "cropshield_test").strip()
if not TEST_DB_NAME or "test" not in TEST_DB_NAME.lower() or TEST_DB_NAME == "cropshield_db":
    raise RuntimeError(
        f"Refusing to run tests against database {TEST_DB_NAME!r}: the test DB name must contain 'test'."
    )
TEST_MONGODB_URL = os.environ.get("CROPSHIELD_TEST_MONGODB_URL", "mongodb://localhost:27017").strip()

_TMP_DIR = Path(tempfile.mkdtemp(prefix="cropshield_test_"))

os.environ.update({
    "APP_ENV": "test",
    "DEBUG": "false",
    "SECRET_KEY": "cropshield-test-only-secret-key-0123456789",
    "MONGODB_URL": TEST_MONGODB_URL,
    "MONGODB_DB_NAME": TEST_DB_NAME,
    "DATABASE_URL": f"sqlite:///{(_TMP_DIR / 'cropshield_test.db').as_posix()}",
    "VAPID_PUBLIC_KEY": "",
    "VAPID_PRIVATE_KEY": "",
    "TWILIO_ACCOUNT_SID": "",
    "TWILIO_AUTH_TOKEN": "",
    "TWILIO_PHONE_NUMBER": "",
    "TWILIO_WHATSAPP_NUMBER": "",
})

RUN_NETWORK = os.environ.get("CROPSHIELD_TEST_NETWORK", "").strip() == "1"

DEMO_FARMER = ("farmer@cropshield.org", "farmer123")
DEMO_AGRONOMIST = ("agronomist@cropshield.org", "agro123")
DEMO_ADMIN = ("admin@cropshield.org", "admin123")


# ── MongoDB availability ─────────────────────────────────────────────────────────────
_mongo_state = {"checked": False, "ok": False, "used": False}


def mongo_available() -> bool:
    if not _mongo_state["checked"]:
        _mongo_state["checked"] = True
        try:
            from pymongo import MongoClient

            c = MongoClient(TEST_MONGODB_URL, serverSelectionTimeoutMS=1500)
            try:
                c.admin.command("ping")
                _mongo_state["ok"] = True
            finally:
                c.close()
        except Exception:
            _mongo_state["ok"] = False
    return _mongo_state["ok"]


def pytest_configure(config):
    config.addinivalue_line("markers", "mongo: needs a reachable MongoDB (uses the isolated test database)")
    config.addinivalue_line("markers", "network: calls external APIs (NASA POWER etc.); run with CROPSHIELD_TEST_NETWORK=1")


def pytest_collection_modifyitems(config, items):
    skip_net = pytest.mark.skip(reason="network test: set CROPSHIELD_TEST_NETWORK=1 to run")
    for item in items:
        if "network" in item.keywords and not RUN_NETWORK:
            item.add_marker(skip_net)


def pytest_sessionfinish(session, exitstatus):
    """Drop ONLY the isolated test database, and remove the temp SQLite dir."""
    if _mongo_state["used"] and os.environ.get("CROPSHIELD_TEST_KEEP_DB") != "1":
        assert TEST_DB_NAME != "cropshield_db" and "test" in TEST_DB_NAME.lower()
        try:
            from pymongo import MongoClient

            c = MongoClient(TEST_MONGODB_URL, serverSelectionTimeoutMS=3000)
            try:
                c.drop_database(TEST_DB_NAME)
            finally:
                c.close()
        except Exception as e:  # pragma: no cover - best effort
            print(f"[conftest] could not drop test database {TEST_DB_NAME}: {e}")
    shutil.rmtree(_TMP_DIR, ignore_errors=True)


# ── Fixtures ─────────────────────────────────────────────────────────────────────────
import pytest_asyncio  # noqa: E402

_seeded = {"done": False}


async def _seed_demo_data():
    """Demo users (farmer/agronomist/admin), their farms and advisories, once per session."""
    if _seeded["done"]:
        return
    from scripts.init_mongo_db import seed_users, seed_farms, seed_advisories, seed_treatments_and_support

    await seed_users()
    await seed_farms()
    await seed_advisories()
    await seed_treatments_and_support()
    _seeded["done"] = True


@pytest_asyncio.fixture
async def mongo_db():
    """Initialised Beanie on the isolated test database (seeded with the demo accounts)."""
    if not mongo_available():
        pytest.skip(f"MongoDB not reachable at {TEST_MONGODB_URL}")
    from backend.db.mongodb import init_mongodb, close_mongodb

    _mongo_state["used"] = True
    db = await init_mongodb()
    assert db.name == TEST_DB_NAME, f"tests must never use {db.name!r}"
    try:
        await _seed_demo_data()
        yield db
    finally:
        await close_mongodb()


@pytest_asyncio.fixture
async def client(mongo_db):
    """In-process HTTP client for the FastAPI app (no server, no lifespan/scheduler)."""
    from httpx import AsyncClient, ASGITransport
    from backend.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Helpers ──────────────────────────────────────────────────────────────────────────
async def login_headers(client, email: str, password: str) -> dict:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"login failed for {email}: {res.status_code} {res.text}"
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def register_farmer(client, name: str = "Test Farmer", **extra) -> tuple:
    """Registers a fresh farmer account; returns (headers, token_response_json)."""
    email = f"{name.lower().replace(' ', '.')}.{uuid.uuid4().hex[:8]}@example.com"
    body = {"username": name, "email": email, "password": "correct-horse-battery", "full_name": name}
    body.update(extra)
    res = await client.post("/api/v1/auth/register", json=body)
    assert res.status_code == 200, f"register failed: {res.status_code} {res.text}"
    data = res.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data


async def create_farm(client, headers: dict, name: str = "Test Farm", lon: float = 77.87, lat: float = 9.17) -> str:
    res = await client.post(
        "/api/v1/farms",
        json={
            "farm_name": f"{name} {uuid.uuid4().hex[:6]}",
            "district": "Thoothukudi",
            "climate_zone": "Dryland",
            "crop_type": "Cotton",
            "area_hectares": 1.5,
            "location": {"type": "Point", "coordinates": [lon, lat]},
        },
        headers=headers,
    )
    assert res.status_code == 201, f"create farm failed: {res.status_code} {res.text}"
    return res.json()["farm_id"]
