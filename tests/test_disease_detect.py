"""
AgriGuard AI — Disease detection tests (audit P0-8 / P0-9, contract item 7).
- Without trained weights the API/service must say so (model_available=false, confidence null,
  no treatment) instead of inventing a diagnosis.
- Uploads require auth, are extension-checked and capped at 10 MB.
The endpoint tests use the isolated test database and skip when MongoDB is unreachable.
"""
import io
from pathlib import Path

import pytest
from httpx import AsyncClient

from conftest import DEMO_FARMER, login_headers

Image = pytest.importorskip("PIL.Image")


def create_mock_leaf_image(format="JPEG", size=(224, 224), color=(34, 139, 34)):
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    buf.seek(0)
    return buf


def _cleanup_upload(image_url):
    if image_url and image_url.startswith("/uploads/disease_images/"):
        Path(image_url.lstrip("/")).unlink(missing_ok=True)


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_disease_detection_endpoint_flow(client: AsyncClient):
    headers = await login_headers(client, *DEMO_FARMER)
    files = {"file": ("cotton_leaf.jpg", create_mock_leaf_image(), "image/jpeg")}

    res = await client.post("/api/v1/disease/detect", files=files, data={"crop_hint": "Cotton"}, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    _cleanup_upload(data.get("image_url"))

    assert "model_available" in data and "is_heuristic" in data
    if not data["model_available"]:
        # No weights committed: honest "unavailable" answer, nothing persisted
        assert data["status"] == "model_unavailable"
        assert data["confidence"] is None
        assert data["predicted_class"] is None
        assert data["chemical_treatment"] is None and data["organic_treatment"] is None
        assert data["detection_id"] is None
        assert data["message"]
    else:
        from backend.models.disease_detection import DiseaseDetection
        assert data["status"] == "success"
        assert 0.0 <= data["confidence"] <= 1.0
        assert len(data["top_k"]) > 0
        doc = await DiseaseDetection.get(data["detection_id"])
        assert doc is not None and doc.predicted_class == data["predicted_class"]


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_disease_detection_requires_auth(client: AsyncClient):
    files = {"file": ("leaf.jpg", create_mock_leaf_image(), "image/jpeg")}
    res = await client.post("/api/v1/disease/detect", files=files)
    assert res.status_code == 401


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_disease_detection_invalid_file_type(client: AsyncClient):
    headers = await login_headers(client, *DEMO_FARMER)
    files = {"file": ("malicious.exe", io.BytesIO(b"MZ not an image"), "application/octet-stream")}
    res = await client.post("/api/v1/disease/detect", files=files, headers=headers)
    assert res.status_code == 400
    assert "Unsupported file type" in str(res.json())


@pytest.mark.mongo
@pytest.mark.asyncio
async def test_disease_detection_rejects_files_over_10mb(client: AsyncClient):
    headers = await login_headers(client, *DEMO_FARMER)
    huge = io.BytesIO(b"\xff\xd8\xff" + b"0" * (10 * 1024 * 1024 + 16))
    files = {"file": ("huge.jpg", huge, "image/jpeg")}
    res = await client.post("/api/v1/disease/detect", files=files, headers=headers)
    assert res.status_code == 413


def test_disease_detector_without_weights_is_honest(tmp_path):
    """The service singleton never fabricates a diagnosis when the weights are absent."""
    pytest.importorskip("torch")
    pytest.importorskip("torchvision")
    from backend.services.disease_service import DiseaseDetector

    img_path = tmp_path / "leaf.png"
    Image.new("RGB", (224, 224), color=(60, 179, 113)).save(img_path, format="PNG")

    detector = DiseaseDetector(model_dir=tmp_path / "no_weights_here")
    assert detector.has_weights is False
    result = detector.predict(str(img_path), top_k=3, crop_hint="Tomato")
    assert result["model_available"] is False
    assert result["is_heuristic"] is True
    assert result["confidence"] is None
    assert result["predicted_class"] is None
    assert result["top_k"] == []
