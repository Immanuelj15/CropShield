import React, { useState, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Droplets, Calendar, Info, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const num = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// "YYYY-MM-DD" → local calendar date (avoids the UTC-midnight off-by-one)
function formatCalendarDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function IrrigationCard({ data, loading = false, error = null, onRetry }) {
  const [expanded, setExpanded] = useState(false)
  const uid = useId().replace(/:/g, '')
  const clipId = `dropletClip-${uid}`
  const gradId = `waterGrad-${uid}`

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm animate-pulse space-y-4" aria-busy="true">
        <div className="h-6 w-48 bg-stone-200 rounded-lg" />
        <div className="h-28 bg-stone-100 rounded-2xl" />
        <div className="h-8 bg-stone-100 rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white rounded-3xl border border-dashed border-stone-300 p-6 text-center text-stone-600 text-sm">
        {error ? (
          <AlertCircle size={24} className="mx-auto text-red-500 mb-2" />
        ) : (
          <Droplets size={24} className="mx-auto text-sky-500 mb-2" />
        )}
        <p className="font-semibold text-stone-800">Irrigation Advice Not Available</p>
        <p className="text-xs text-stone-500 mt-1">
          {error || 'Select a farm to see this week’s irrigation recommendation.'}
        </p>
        {error && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <RefreshCw size={12} /> Try Again
          </button>
        )}
      </div>
    )
  }

  const mm = num(data.recommended_irrigation_mm)
  const liters = num(data.recommended_irrigation_liters_per_acre)
  const totalLiters = num(data.total_farm_liters)
  const urgency = data.urgency || 'Low'
  const stage = data.current_growth_stage || '—'
  const kc = data.crop_coefficient_kc
  const effRain = num(data.effective_rainfall_mm)
  const totalRain = num(data.recent_7d_rainfall_mm)
  const nextDate = formatCalendarDate(data.next_irrigation_date)

  // Droplet fill height (0–45 mm scale, min 12% so the gauge never looks empty/broken)
  const fillPct = Math.min(100, Math.max(12, Math.round((mm / 45.0) * 100)))

  return (
    <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-2 bg-sky-100 text-sky-700 rounded-2xl shrink-0">
              <Droplets size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900">
                Smart Irrigation
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                FAO-56 water requirement{data.crop_type ? ` · ${data.crop_type}` : ''}
              </p>
            </div>
          </div>
          <span
            className={clsx(
              'px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 border',
              urgency === 'High'
                ? 'bg-red-100 text-red-800 border-red-200'
                : urgency === 'Moderate'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-green-100 text-green-800 border-green-200'
            )}
          >
            {urgency} need
          </span>
        </div>

        {/* Droplet Graphic & Key Metrics */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4 items-center my-4">
          {/* Animated Water Droplet Gauge */}
          <div className="col-span-12 min-[400px]:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-20 h-24 flex items-center justify-center" role="img" aria-label={`${mm} millimetres of irrigation needed this week`}>
              <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-sm" aria-hidden="true">
                <defs>
                  <clipPath id={clipId}>
                    <path d="M50 0 C50 0 5 60 5 85 A45 45 0 0 0 95 85 C95 60 50 0 50 0 Z" />
                  </clipPath>
                  <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>

                <path
                  d="M50 0 C50 0 5 60 5 85 A45 45 0 0 0 95 85 C95 60 50 0 50 0 Z"
                  fill="#f0f9ff"
                  stroke="#bae6fd"
                  strokeWidth="3"
                />

                <g clipPath={`url(#${clipId})`}>
                  <motion.rect
                    x="0"
                    width="100"
                    fill={`url(#${gradId})`}
                    initial={{ y: 120, height: 0 }}
                    animate={{
                      y: 120 - (120 * fillPct) / 100,
                      height: (120 * fillPct) / 100,
                    }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                  <motion.path
                    d="M0 5 Q 25 0, 50 5 T 100 5 V 20 H 0 Z"
                    fill="#e0f2fe"
                    opacity="0.6"
                    initial={{ y: 120 - (120 * fillPct) / 100 }}
                    animate={{
                      y: 120 - (120 * fillPct) / 100,
                      x: [-10, 0, -10],
                    }}
                    transition={{
                      y: { duration: 0.9, ease: 'easeOut' },
                      x: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                    }}
                  />
                </g>
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center pt-5 pointer-events-none">
                <span className="text-lg font-bold text-stone-900 font-mono leading-none drop-shadow-sm">
                  {mm.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-bold text-stone-700">mm</span>
              </div>
            </div>
            <span className="text-xs font-semibold text-stone-500 mt-1 text-center">
              Net this week
            </span>
          </div>

          {/* Numerical Breakdown */}
          <div className="col-span-12 min-[400px]:col-span-7 space-y-2">
            <div className="bg-sky-50/70 border border-sky-100 rounded-2xl p-2.5">
              <span className="text-xs font-bold text-sky-800 uppercase tracking-tight block">
                Water to Apply
              </span>
              <span className="text-base font-bold text-sky-950 font-mono">
                {liters.toLocaleString('en-IN')}{' '}
                <span className="text-xs font-semibold text-sky-700">L/acre</span>
              </span>
              {data.farm_area_acres != null && (
                <span className="text-xs text-sky-700 block mt-0.5">
                  Whole field: {totalLiters.toLocaleString('en-IN')} L ({num(data.farm_area_acres).toLocaleString('en-IN')} ac)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-2 min-w-0">
                <span className="text-xs text-stone-500 font-bold uppercase block">Stage (Kc)</span>
                <span className="font-bold text-stone-800 truncate block" title={stage}>
                  {stage}{' '}
                  {kc != null && <span className="font-mono text-sky-700">({kc})</span>}
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-2 min-w-0">
                <span className="text-xs text-stone-500 font-bold uppercase block">Rain Offset</span>
                <span className="font-bold text-sky-800 truncate block">
                  −{effRain.toLocaleString('en-IN', { maximumFractionDigits: 1 })} mm
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Next Scheduled Date */}
        <div className="flex items-center justify-between gap-2 text-xs bg-stone-50 rounded-2xl p-3 border border-stone-200">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-stone-500" />
            <span className="text-xs font-medium text-stone-600">Next irrigation:</span>
          </div>
          <span className="font-bold text-stone-900 text-xs">
            {nextDate || 'As needed'}
          </span>
        </div>

        {data.status_note && (
          <p className="text-xs text-stone-600 mt-2.5">
            {data.status_note}
          </p>
        )}
      </div>

      {/* Expandable Agronomic Explanation */}
      <div className="mt-3 pt-2 border-t border-stone-100">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-between text-xs font-bold text-sky-700 hover:text-sky-800 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex items-center gap-1.5">
            <Info size={12} />
            <span>How this is calculated</span>
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mt-2 text-xs text-stone-600 space-y-2 bg-stone-50 p-3 rounded-2xl border border-stone-200"
            >
              <div className="space-y-1 font-mono text-xs break-words">
                <p>1. ET₀ (Hargreaves): {data.reference_et0_mm_per_day ?? '—'} mm/day</p>
                <p>2. Crop need: {data.daily_crop_water_need_mm ?? '—'} mm/day × 7 = {data.weekly_crop_water_need_mm ?? '—'} mm</p>
                <p>3. Effective rain (USDA SCS): {effRain} mm (from {totalRain} mm measured)</p>
                <p className="font-bold text-sky-900">4. Net weekly need = max(0, {data.weekly_crop_water_need_mm ?? '—'} − {effRain}) = {mm} mm</p>
              </div>
              {data.source_note && (
                <p className="text-xs text-stone-600 italic border-t border-stone-200 pt-1">
                  Source: {data.source_note}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
