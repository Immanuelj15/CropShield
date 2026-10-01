import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Satellite, TrendingUp, TrendingDown, Minus, Cloud, HelpCircle, Info } from 'lucide-react';

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/**
 * Sentinel-2 NDVI card for GET /vegetation/{farm_id}:
 * { ndvi_value, ndvi_trend, cloud_cover_pct, source ("sentinel2" | "sentinel2_calibrated_proxy"),
 *   image_date_actual, date, status ("healthy" | "stressed" | "declining"), persisted }.
 * `unavailableReason` is shown when the request failed (e.g. farm has no GPS location).
 */
export default function VegetationHealthCard({ vegetationData, loading = false, unavailableReason = null }) {
  const shouldReduceMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm animate-pulse space-y-4" aria-busy="true">
        <div className="h-6 bg-stone-200 rounded-xl w-2/3" />
        <div className="h-28 bg-stone-100 rounded-2xl" />
        <div className="h-4 bg-stone-200 rounded w-1/2" />
      </div>
    );
  }

  // No reading available (request failed or no satellite pass yet)
  if (!vegetationData || !isNum(vegetationData.ndvi_value)) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Satellite size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-sm">Satellite Vegetation Health</h3>
              <p className="text-xs text-stone-500">Copernicus Sentinel-2 Surface Reflectance</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 font-semibold border border-stone-200">
            {unavailableReason ? 'Unavailable' : 'Pending'}
          </span>
        </div>
        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 flex items-center gap-3">
          <HelpCircle size={20} className="text-stone-500 shrink-0" aria-hidden="true" />
          <p className="text-xs text-stone-600 leading-relaxed">
            {unavailableReason
              ? `Satellite reading unavailable: ${unavailableReason}`
              : 'No satellite reading for your farm yet. Readings refresh every few days after a cloud-free Sentinel-2 pass.'}
          </p>
        </div>
      </div>
    );
  }

  const ndvi = Number(vegetationData.ndvi_value);
  const trend = isNum(vegetationData.ndvi_trend) ? Number(vegetationData.ndvi_trend) : 0;
  const status = vegetationData.status || (ndvi < 0.4 ? 'stressed' : trend < -0.15 ? 'declining' : 'healthy');
  const cloudCover = isNum(vegetationData.cloud_cover_pct) ? Math.round(Number(vegetationData.cloud_cover_pct)) : null;
  const imageDate = vegetationData.image_date_actual || vegetationData.date || null;
  // The backend falls back to a calibrated proxy when Earth Engine is not configured
  const isSimulated = !!vegetationData.source && vegetationData.source !== 'sentinel2';

  let statusBadgeColor = 'bg-green-100 text-green-900 border-green-300';
  let barColor = 'bg-green-600';
  let statusTitle = 'Healthy Canopy';
  let statusDescription = 'High chlorophyll reflectance and robust vegetative biomass.';

  if (status === 'stressed' || ndvi < 0.40) {
    statusBadgeColor = 'bg-red-100 text-red-900 border-red-300';
    barColor = 'bg-red-500';
    statusTitle = 'Moisture / Canopy Stress';
    statusDescription = 'Low biomass density or defoliation detected from the satellite index.';
  } else if (status === 'declining' || trend < -0.15) {
    statusBadgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
    barColor = 'bg-amber-500';
    statusTitle = 'Declining Vigour';
    statusDescription = 'Vegetation index dropped sharply since the previous satellite pass.';
  }

  // Normalized gauge percentage (0.0 to 1.0 mapped to 0% to 100%)
  const gaugePercent = Math.max(0, Math.min(100, Math.round(ndvi * 100)));

  return (
    <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-brand-50 flex items-center justify-center border border-brand-100 shrink-0">
            <Satellite size={19} className="text-brand-700" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-stone-900 text-sm flex flex-wrap items-center gap-1.5">
              Satellite Vegetation Health
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                NDVI
              </span>
            </h3>
            <p className="text-xs text-stone-500">Sentinel-2 Surface Reflectance (10 m grid)</p>
          </div>
        </div>

        <span className={`text-xs px-3 py-1 rounded-full font-bold border uppercase tracking-wider ${statusBadgeColor}`}>
          {status}
        </span>
      </div>

      {isSimulated && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-2xl flex items-start gap-2 text-xs text-sky-900" role="status">
          <Info size={14} className="text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>Estimated vegetation index (live satellite imagery not connected). Use as an indication only.</span>
        </div>
      )}

      {/* ── Gauge & Big Number ────────────────────────────────── */}
      <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/70">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <span className="text-xs text-stone-500 block font-medium">Vegetation Index (NDVI)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-black text-stone-900 tracking-tight">
                {ndvi.toFixed(2)}
              </span>
              <span className="text-xs text-stone-500 font-medium">/ 1.00</span>
            </div>
          </div>

          {/* Trend Badge */}
          <div className="text-right">
            <span className="text-xs text-stone-500 block font-medium">Revisit Trend</span>
            <div className="inline-flex items-center gap-1 mt-0.5 text-xs font-bold">
              {trend > 0.02 ? (
                <span className="text-green-700 flex items-center gap-0.5 bg-green-50 px-2 py-1 rounded-lg border border-green-200">
                  <TrendingUp size={14} aria-hidden="true" /> +{trend.toFixed(2)}
                </span>
              ) : trend < -0.05 ? (
                <span className="text-amber-700 flex items-center gap-0.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                  <TrendingDown size={14} aria-hidden="true" /> {trend.toFixed(2)}
                </span>
              ) : (
                <span className="text-stone-600 flex items-center gap-0.5 bg-stone-100 px-2 py-1 rounded-lg border border-stone-200">
                  <Minus size={14} aria-hidden="true" /> Stable
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar Gauge */}
        <div className="space-y-1.5">
          <div
            className="w-full bg-stone-200 rounded-full h-3 overflow-hidden p-0.5 relative"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Number(ndvi.toFixed(2))}
            aria-label="NDVI vegetation index"
          >
            <motion.div
              initial={shouldReduceMotion ? { width: `${gaugePercent}%` } : { width: '0%' }}
              animate={{ width: `${gaugePercent}%` }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.6, ease: 'easeOut' }}
              className={`h-full rounded-full ${barColor}`}
            />
          </div>
          <div className="flex justify-between text-xs text-stone-500 font-medium px-0.5">
            <span>0.0 Bare</span>
            <span>0.4 Threshold</span>
            <span>1.0</span>
          </div>
        </div>
      </div>

      {/* ── Status Description & Recency Metadata ────────────── */}
      <div className="space-y-2 text-xs">
        <p className="text-stone-700 font-medium leading-relaxed">
          <strong className="text-stone-900 font-bold">{statusTitle}:</strong> {statusDescription}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs text-stone-500">
          <span className="flex items-center gap-1 font-medium">
            <Cloud size={13} className="text-stone-500" aria-hidden="true" />
            Cloud cover: {cloudCover != null ? `${cloudCover}%` : '—'}
          </span>
          <span className="font-semibold text-stone-600">
            Observed: {imageDate || 'Date unavailable'}
            {vegetationData.persisted === false ? ' (live reading)' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
