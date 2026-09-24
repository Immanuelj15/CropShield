import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Droplets, CloudRain, Sun, Calendar, Info, ChevronDown, ChevronUp, AlertCircle, CheckCircle } from 'lucide-react'
import clsx from 'clsx'

export default function IrrigationCard({ data, loading = false }) {
  const [expanded, setExpanded] = useState(false)

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 w-48 bg-stone-200 rounded-lg" />
        <div className="h-28 bg-stone-100 rounded-2xl" />
        <div className="h-8 bg-stone-100 rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-white rounded-3xl border border-dashed border-stone-300 p-6 text-center text-stone-500 text-xs">
        <Droplets size={24} className="mx-auto text-sky-400 mb-2" />
        <p className="font-semibold text-stone-700">Irrigation Advisory Not Available</p>
        <p className="text-[11px] text-stone-400 mt-1">Generate a farm activity plan to activate irrigation telemetry.</p>
      </div>
    )
  }

  const mm = data.recommended_irrigation_mm || 0
  const liters = data.recommended_irrigation_liters_per_acre || 0
  const totalLiters = data.total_farm_liters || 0
  const urgency = data.urgency || 'Low'
  const stage = data.current_growth_stage || 'Vegetative'
  const kc = data.crop_coefficient_kc || 0.8
  const effRain = data.effective_rainfall_mm || 0
  const totalRain = data.recent_7d_rainfall_mm || 0

  // Calculate droplet percentage height (0 - 50mm scale)
  const fillPct = Math.min(100, Math.max(12, Math.round((mm / 45.0) * 100)))

  return (
    <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-sky-100 text-sky-700 rounded-2xl">
              <Droplets size={18} />
            </span>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
                Smart Irrigation
              </h3>
              <p className="text-[10px] text-stone-400 font-semibold">
                FAO-56 Water Requirement
              </p>
            </div>
          </div>
          <span
            className={clsx(
              'px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider',
              urgency === 'High'
                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                : urgency === 'Moderate'
                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            )}
          >
            {urgency} Need
          </span>
        </div>

        {/* Droplet Graphic & Key Metrics */}
        <div className="grid grid-cols-12 gap-4 items-center my-4">
          {/* Animated Water Droplet Gauge */}
          <div className="col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-20 h-24 flex items-center justify-center">
              {/* Outer SVG Droplet Outline */}
              <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-sm">
                <defs>
                  <clipPath id="dropletClip">
                    <path d="M50 0 C50 0 5 60 5 85 A45 45 0 0 0 95 85 C95 60 50 0 50 0 Z" />
                  </clipPath>
                  <linearGradient id="waterGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>

                {/* Droplet Background Frame */}
                <path
                  d="M50 0 C50 0 5 60 5 85 A45 45 0 0 0 95 85 C95 60 50 0 50 0 Z"
                  fill="#f0f9ff"
                  stroke="#bae6fd"
                  strokeWidth="3"
                />

                {/* Animated Rising Water Level */}
                <g clipPath="url(#dropletClip)">
                  <motion.rect
                    x="0"
                    width="100"
                    fill="url(#waterGrad)"
                    initial={{ y: 120, height: 0 }}
                    animate={{
                      y: 120 - (120 * fillPct) / 100,
                      height: (120 * fillPct) / 100,
                    }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                  {/* Subtle water ripple wave line */}
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

              {/* Water Depth overlay text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-5 pointer-events-none">
                <span className="text-lg font-black text-stone-900 font-mono leading-none drop-shadow-sm">
                  {mm}
                </span>
                <span className="text-[10px] font-bold text-stone-600">mm</span>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-stone-400 mt-1 text-center">
              Weekly Net
            </span>
          </div>

          {/* Numerical Breakdown */}
          <div className="col-span-7 space-y-2">
            <div className="bg-sky-50/70 border border-sky-100 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold text-sky-800 uppercase tracking-tight block">
                Target Volume
              </span>
              <span className="text-base font-black text-sky-950 font-mono">
                {liters.toLocaleString('en-IN')}{' '}
                <span className="text-xs font-semibold text-sky-700">L/acre</span>
              </span>
              {data.farm_area_acres && (
                <span className="text-[10px] text-sky-600 block mt-0.5">
                  Total Plot: {totalLiters.toLocaleString('en-IN')} L ({data.farm_area_acres} ac)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-2">
                <span className="text-[9px] text-stone-400 font-bold uppercase block">Stage (Kc)</span>
                <span className="font-bold text-stone-800 truncate block">
                  {stage}{' '}
                  <span className="font-mono text-sky-700 text-[10px]">({kc})</span>
                </span>
              </div>
              <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-2">
                <span className="text-[9px] text-stone-400 font-bold uppercase block">Rain Offset</span>
                <span className="font-bold text-emerald-700 truncate block">
                  -{effRain}mm
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Next Scheduled Date */}
        <div className="flex items-center justify-between text-xs bg-stone-50 rounded-2xl p-3 border border-stone-200/80">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-stone-400" />
            <span className="text-[11px] font-medium text-stone-600">Next Action:</span>
          </div>
          <span className="font-bold text-stone-900 font-mono text-xs">
            {data.next_irrigation_date ? new Date(data.next_irrigation_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'As needed'}
          </span>
        </div>

        <p className="text-[11px] text-stone-500 mt-2.5 italic">
          {data.status_note}
        </p>
      </div>

      {/* Expandable Agronomic Explanation */}
      <div className="mt-3 pt-2 border-t border-stone-100">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-sky-700 hover:text-sky-800 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Info size={12} />
            <span>FAO-56 Calculation Formula</span>
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
              className="overflow-hidden mt-2 text-[10px] text-stone-600 space-y-2 bg-stone-50 p-3 rounded-2xl border border-stone-200"
            >
              <div className="space-y-1 font-mono text-[9.5px]">
                <p>1. ET₀ (Hargreaves): {data.reference_et0_mm_per_day} mm/day</p>
                <p>2. Crop Need: {data.daily_crop_water_need_mm} mm/day × 7 = {data.weekly_crop_water_need_mm} mm</p>
                <p>3. USDA Effective Rain: {effRain} mm (from {totalRain}mm raw)</p>
                <p className="font-bold text-sky-900">4. Net Weekly Need = max(0, {data.weekly_crop_water_need_mm} - {effRain}) = {mm} mm</p>
              </div>
              <p className="text-[9px] text-emerald-800 font-semibold italic border-t border-stone-200 pt-1">
                Citation: {data.source_note}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
