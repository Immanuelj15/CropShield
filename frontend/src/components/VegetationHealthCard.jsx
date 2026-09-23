import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Satellite, TrendingUp, TrendingDown, Minus, Cloud, HelpCircle, CheckCircle, AlertOctagon } from 'lucide-react';

export default function VegetationHealthCard({ vegetationData, loading = false }) {
  const shouldReduceMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 bg-stone-200 dark:bg-stone-800 rounded-xl w-2/3" />
        <div className="h-28 bg-stone-100 dark:bg-stone-800/60 rounded-2xl" />
        <div className="h-4 bg-stone-200 dark:bg-stone-800 rounded w-1/2" />
      </div>
    );
  }

  // Pending State if no satellite pass yet
  if (!vegetationData || vegetationData.ndvi_value === undefined || vegetationData.ndvi_value === null) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <Satellite size={18} />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 dark:text-white text-sm">Satellite Vegetation Health</h3>
              <p className="text-[11px] text-stone-500">Copernicus Sentinel-2 Surface Reflectance</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 font-semibold border border-stone-200 dark:border-stone-700">
            Pending
          </span>
        </div>
        <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-200/80 dark:border-stone-700/60 flex items-center gap-3">
          <HelpCircle size={20} className="text-stone-400 shrink-0" />
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            Satellite check pending — Sentinel-2 overpass cloud filtering in progress. Next pass in ~2-3 days.
          </p>
        </div>
      </div>
    );
  }

  const ndvi = Number(vegetationData.ndvi_value);
  const trend = Number(vegetationData.ndvi_trend || 0);
  const status = vegetationData.status || (ndvi < 0.4 ? 'stressed' : trend < -0.15 ? 'declining' : 'healthy');
  const cloudCover = vegetationData.cloud_cover_pct || 10;
  const imageDate = vegetationData.image_date_actual || vegetationData.date || 'Recent';

  // Distinct NDVI Green-to-Brown visual language
  // > 0.65 -> Vibrant Forest Green
  // 0.40 - 0.65 -> Olive Amber
  // < 0.40 -> Earthy Brown / Rust
  let statusBadgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-300';
  let gaugeColor = '#15803d'; // green-700
  let statusTitle = 'Healthy Canopy';
  let statusDescription = 'High chlorophyll reflectance and robust vegetative biomass.';

  if (status === 'stressed' || ndvi < 0.40) {
    statusBadgeColor = 'bg-amber-100 text-amber-950 border-amber-300';
    gaugeColor = '#b45309'; // amber-700 / brown
    statusTitle = 'Moisture / Canopy Stress';
    statusDescription = 'Low biomass density or defoliation detected by Sentinel-2.';
  } else if (status === 'declining' || trend < -0.15) {
    statusBadgeColor = 'bg-orange-100 text-orange-950 border-orange-300';
    gaugeColor = '#c2410c'; // orange-700
    statusTitle = 'Declining Vigor';
    statusDescription = 'Accelerating vegetative drop vs previous satellite overpass.';
  }

  // Normalized gauge percentage (0.0 to 1.0 mapped to 0% to 100%)
  const gaugePercent = Math.max(0, Math.min(100, Math.round(ndvi * 100)));

  return (
    <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm space-y-5">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 flex items-center justify-center border border-stone-200 dark:border-stone-700">
            <Satellite size={19} className="text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-stone-900 dark:text-white text-sm flex items-center gap-1.5">
              Satellite Vegetation Health
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-medium">
                NDVI (B8-B4)
              </span>
            </h3>
            <p className="text-[11px] text-stone-500">Sentinel-2 Surface Reflectance (10m grid)</p>
          </div>
        </div>

        <span className={`text-xs px-3 py-1 rounded-full font-bold border uppercase tracking-wider ${statusBadgeColor}`}>
          {status}
        </span>
      </div>

      {/* ── Gauge & Big Number ────────────────────────────────── */}
      <div className="bg-gradient-to-br from-stone-50 via-stone-50/50 to-emerald-50/20 dark:from-stone-800/40 dark:to-stone-800/20 rounded-2xl p-4 border border-stone-200/70 dark:border-stone-700/60">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <span className="text-xs text-stone-500 block font-medium">Vegetation Index (NDVI)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-black text-stone-900 dark:text-white tracking-tight">
                {ndvi.toFixed(2)}
              </span>
              <span className="text-xs text-stone-400 font-medium">/ 1.00</span>
            </div>
          </div>

          {/* Trend Badge */}
          <div className="text-right">
            <span className="text-xs text-stone-500 block font-medium">Revisit Trend</span>
            <div className="inline-flex items-center gap-1 mt-0.5 text-xs font-bold">
              {trend > 0.02 ? (
                <span className="text-emerald-600 flex items-center gap-0.5 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <TrendingUp size={14} /> +{trend.toFixed(2)}
                </span>
              ) : trend < -0.05 ? (
                <span className="text-amber-700 dark:text-amber-400 flex items-center gap-0.5 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                  <TrendingDown size={14} /> {trend.toFixed(2)}
                </span>
              ) : (
                <span className="text-stone-500 flex items-center gap-0.5 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700">
                  <Minus size={14} /> Stable
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Distinct Green-to-Brown Progress Bar Gauge */}
        <div className="space-y-1.5">
          <div className="w-full bg-stone-200 dark:bg-stone-700 rounded-full h-3 overflow-hidden p-0.5 relative">
            <motion.div
              initial={shouldReduceMotion ? { width: `${gaugePercent}%` } : { width: '0%' }}
              animate={{ width: `${gaugePercent}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-500 to-emerald-600 shadow-sm"
              style={{ backgroundColor: gaugeColor }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-stone-400 font-medium px-0.5">
            <span>0.00 (Bare Soil)</span>
            <span>0.40 (Threshold)</span>
            <span>0.70 (Vigorous)</span>
            <span>1.00</span>
          </div>
        </div>
      </div>

      {/* ── Status Description & Recency Metadata ────────────── */}
      <div className="space-y-2 text-xs">
        <p className="text-stone-700 dark:text-stone-300 font-medium leading-relaxed">
          <strong className="text-stone-900 dark:text-white font-bold">{statusTitle}:</strong> {statusDescription}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-500">
          <span className="flex items-center gap-1 font-medium">
            <Cloud size={13} className="text-stone-400" />
            Cloud cover: {cloudCover}%
          </span>
          <span className="font-semibold text-stone-600 dark:text-stone-400">
            Observed: {imageDate}
          </span>
        </div>
      </div>
    </div>
  );
}
