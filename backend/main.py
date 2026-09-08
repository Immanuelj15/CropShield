"""
AgriGuard AI — FastAPI Application (v2)
Explainable AI Pest & Crop Disease Early Warning System for Indian Farmers.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.api import predict, detect, features, weather, history, auth, disease, yield_api, outbreak, chatbot, alerts, location_predict
from backend.db.database import engine, Base
from backend.utils.config import settings

from contextlib import asynccontextmanager
from backend.db.mongodb import init_mongodb, close_mongodb

Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize MongoDB & Beanie collections/indexes
    try:
        await init_mongodb()
    except Exception as e:
        print(f"[WARN] MongoDB startup init error: {e}")
    yield
    # Close connection pool on shutdown
    await close_mongodb()

app = FastAPI(
    title="AgriGuard AI — Early Warning & Advisory API",
    description=(
        "Explainable AI Based Pest & Crop Disease Early Warning System for Indian Farmers. "
        "Trained on NASA POWER 1980–2025 data + PyTorch leaf vision + SHAP XAI + Haversine spatial clustering."
    ),
    version="2.0.0",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(location_predict.router, prefix="/api/v1", tags=["Location-Based AI Warning"])
app.include_router(auth.router,           prefix="/api/v1", tags=["Authentication & User"])
app.include_router(predict.router,        prefix="/api/v1", tags=["Pest Early Warning"])
app.include_router(disease.router,        prefix="/api/v1", tags=["Crop Disease Vision Scan"])
app.include_router(yield_api.router,      prefix="/api/v1", tags=["Crop Yield Forecasting"])
app.include_router(outbreak.router,       prefix="/api/v1", tags=["Spatial Outbreak Heatmap"])
app.include_router(chatbot.router,        prefix="/api/v1", tags=["Tamil & English Voice Assistant"])
app.include_router(alerts.router,         prefix="/api/v1", tags=["Alert Dispatcher"])
app.include_router(detect.router,         prefix="/api/v1", tags=["Rule-based Pest Detection"])
app.include_router(features.router,       prefix="/api/v1", tags=["Live Feature Inspector"])
app.include_router(weather.router,        prefix="/api/v1", tags=["Weather Integration"])
app.include_router(history.router,        prefix="/api/v1", tags=["Warning History"])

@app.get("/", tags=["Health"])
async def root():
    return {
        "system":   "AgriGuard AI Platform",
        "model":    "XGBoost + PyTorch Leaf Vision + SHAP Counterfactual XAI",
        "target":   "Pest & Disease Early Warning for Indian Farmers",
        "region":   "Tamil Nadu & All-India",
        "status":   "operational",
        "docs":     "/api/v1/docs",
    }

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
