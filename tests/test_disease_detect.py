"""
AgriGuard AI — Automated Disease Detection & Inference Verification Tests
Tests PyTorch ResNet18 leaf disease classification, validation, error handling,
and MongoDB Beanie persistence.
"""

import io
import pytest
import pytest_asyncio
from PIL import Image
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.db.mongodb import init_mongodb, close_mongodb
from backend.models.disease_detection import DiseaseDetection as MongoDiseaseDetection
from backend.services.inference_disease_detection import DiseaseDetector


@pytest_asyncio.fixture(scope="function")
async def client():
    await init_mongodb()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_mongodb()


def create_mock_leaf_image(format="JPEG", size=(224, 224), color=(34, 139, 34)):
    """Helper to generate a realistic in-memory test leaf image."""
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    buf.seek(0)
    return buf


@pytest.mark.asyncio
async def test_disease_detection_endpoint_flow(client: AsyncClient):
    # 1. Login as Farmer to get auth token
    login_res = await client.post("/api/v1/auth/login", json={
        "email": "farmer@cropshield.org",
        "password": "farmer123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Upload valid JPEG leaf image
    img_buf = create_mock_leaf_image(format="JPEG")
    files = {"file": ("cotton_leaf.jpg", img_buf, "image/jpeg")}
    data = {"crop_hint": "Cotton"}

    res = await client.post("/api/v1/disease/detect", files=files, data=data, headers=headers)
    assert res.status_code == 200
    resp_data = res.json()

    assert resp_data["status"] == "success"
    assert "predicted_class" in resp_data
    assert "confidence" in resp_data
    assert 0.0 <= resp_data["confidence"] <= 1.0
    assert len(resp_data["top_k"]) > 0
    assert "image_url" in resp_data
    assert resp_data["detection_id"] is not None

    detection_id = resp_data["detection_id"]

    # 3. Verify record was persisted into MongoDB Beanie collection
    doc = await MongoDiseaseDetection.get(detection_id)
    assert doc is not None
    assert doc.predicted_class == resp_data["predicted_class"]
    assert doc.confidence == resp_data["confidence"]
    assert doc.image_url == resp_data["image_url"]


@pytest.mark.asyncio
async def test_disease_detection_invalid_file_type(client: AsyncClient):
    # Upload text file with invalid extension
    bad_buf = io.BytesIO(b"This is not a real image file content")
    files = {"file": ("malicious.exe", bad_buf, "application/octet-stream")}

    res = await client.post("/api/v1/disease/detect", files=files)
    assert res.status_code == 400
    assert "INVALID_FILE_TYPE" in str(res.json())


@pytest.mark.asyncio
async def test_disease_detector_standalone_library(tmp_path):
    # Test DiseaseDetector as a standalone library class
    test_img_path = tmp_path / "test_leaf.png"
    img = Image.new("RGB", (224, 224), color=(60, 179, 113))
    img.save(test_img_path, format="PNG")

    detector = DiseaseDetector(backbone="resnet18")
    result = detector.predict(str(test_img_path), top_k=3, crop_hint="Tomato")

    assert "predicted_class" in result
    assert "confidence" in result
    assert "top_k" in result
    assert len(result["top_k"]) == 3
    assert result["top_k"][0]["class"] == result["predicted_class"]
