import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, CheckCircle2, AlertTriangle, ShieldCheck,
  ChevronDown, ChevronUp, Droplets, Sun, Sprout, Coins,
  Scale, FileText, ArrowUpRight
} from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import ProfitRangeDisplay, { formatINR } from './ProfitRangeDisplay'

/**
 * Animated Circular Score Ring
 */
function CircularScoreRing({ score, size = 68, strokeWidth = 6 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const strokeColor =
    score >= 80 ? '#059669' : score >= 60 ? '#0d9488' : score >= 40 ? '#d97706' : '#dc2626'

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e7e5e4"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-base font-black text-stone-900 leading-none font-mono">
          {Math.round(score)}
        </span>
        <span className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter">
          Score
        </span>
      </div>
    </div>
  )
}

/**
 * Traffic-light badge helper
 */
function RiskBadge({ label, level }) {
  const isHigh = level === 'High'
  const isMed = level === 'Medium'
  const badgeClasses = isHigh
    ? 'bg-red-100 text-red-800 border-red-200'
    : isMed
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-emerald-100 text-emerald-800 border-emerald-200'

  const dotClasses = isHigh
    ? 'bg-red-500'
    : isMed
    ? 'bg-amber-500'
    : 'bg-emerald-500'

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClasses}`} />
      <span>{label}: {level}</span>
    </span>
  )
}

/**
 * CropRecommendationCard Component
 */
export default function CropRecommendationCard({
  rec,
  rank = 1,
  isTop = false,
  className = '',
}) {
  const { t } = useTranslation(['farmer', 'common'])
  const [expanded, setExpanded] = useState(false)

  const {
    crop_type,
    suitability_score,
    expected_yield_range,
    estimated_cost,
    cost_per_acre,
    cost_breakdown,
    expected_price_range,
    estimated_revenue_range,
    estimated_profit_range,
    weather_risk,
    market_risk,
    water_requirement,
    source_note,
    cost_source_note,
    reason_text,
  } = rec

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: rank * 0.08 }}
      className={`bg-white rounded-3xl border transition-all duration-300 relative overflow-hidden shadow-sm hover:shadow-md ${
        isTop
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
          : 'border-stone-200 hover:border-emerald-300'
      } ${className}`}
    >
      {/* Top Match Highlight Ribbon */}
      {isTop && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[11px] font-extrabold uppercase tracking-wider py-1.5 px-4 flex items-center justify-between shadow-xs">
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-yellow-300" /> #1 Best Agronomic Fit
          </span>
          <span className="text-[10px] bg-white/20 px-2 py-0.2 rounded-full font-mono font-semibold">
            {suitability_score}% Match
          </span>
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Header: Rank + Crop Name + Score Ring */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={clsx(
                'text-xs font-black px-2 py-0.5 rounded-lg border font-mono',
                isTop ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-stone-100 text-stone-700 border-stone-200'
              )}>
                #{rank}
              </span>
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                {water_requirement} Water Requirement
              </span>
            </div>
            <h3 className="text-2xl font-extrabold text-stone-900 tracking-tight">
              {crop_type}
            </h3>
            <p className="text-xs text-stone-500 leading-snug line-clamp-2">
              {reason_text}
            </p>
          </div>

          <CircularScoreRing score={suitability_score} size={66} strokeWidth={6} />
        </div>

        {/* Profit Range Section (Hard requirement: always min-max range) */}
        <ProfitRangeDisplay
          profitRange={estimated_profit_range}
          revenueRange={estimated_revenue_range}
          estimatedCost={estimated_cost}
        />

        {/* Yield & Mandi Price Snapshot */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-stone-50/70 p-3.5 rounded-2xl border border-stone-200/70">
          <div>
            <span className="text-[11px] font-bold text-stone-500 block uppercase tracking-wider">
              Expected Total Yield
            </span>
            <span className="font-extrabold text-stone-900 text-sm font-mono mt-0.5 block">
              {expected_yield_range?.min} – {expected_yield_range?.max} {expected_yield_range?.unit || 'quintals'}
            </span>
            <span className="text-[10px] text-stone-400 block mt-0.5">
              ({expected_yield_range?.per_acre_kg_range})
            </span>
          </div>

          <div>
            <span className="text-[11px] font-bold text-stone-500 block uppercase tracking-wider">
              Mandi Price Band
            </span>
            <span className="font-extrabold text-stone-900 text-sm font-mono mt-0.5 block">
              ₹{formatINR(expected_price_range?.min)} – ₹{formatINR(expected_price_range?.max)}
            </span>
            <span className="text-[10px] text-stone-400 block mt-0.5">
              per quintal ({formatINR(expected_price_range?.min_per_kg)} – {formatINR(expected_price_range?.max_per_kg)} ₹/kg)
            </span>
          </div>
        </div>

        {/* Risk Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge label="Weather Risk" level={weather_risk} />
            <RiskBadge label="Market Risk" level={market_risk} />
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition flex items-center gap-1"
          >
            <span>{expanded ? 'Less Details' : 'Cost & Sources'}</span>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {/* Expandable Cost Breakdown & Citations Drawer */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-3 border-t border-stone-100 space-y-3.5 text-xs overflow-hidden"
            >
              {/* Cost Itemization */}
              {cost_breakdown && (
                <div className="space-y-1.5">
                  <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wider block">
                    Estimated Cost Itemization:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-stone-700">
                    <div className="p-2 bg-stone-50 rounded-xl border border-stone-200">
                      <span className="text-[10px] text-stone-400 block">Seeds</span>
                      <span className="font-bold font-mono">₹{formatINR(cost_breakdown.seeds)}</span>
                    </div>
                    <div className="p-2 bg-stone-50 rounded-xl border border-stone-200">
                      <span className="text-[10px] text-stone-400 block">Fertilizer</span>
                      <span className="font-bold font-mono">₹{formatINR(cost_breakdown.fertilizer)}</span>
                    </div>
                    <div className="p-2 bg-stone-50 rounded-xl border border-stone-200">
                      <span className="text-[10px] text-stone-400 block">Labor</span>
                      <span className="font-bold font-mono">₹{formatINR(cost_breakdown.labor)}</span>
                    </div>
                    <div className="p-2 bg-stone-50 rounded-xl border border-stone-200">
                      <span className="text-[10px] text-stone-400 block">Irrigation</span>
                      <span className="font-bold font-mono">₹{formatINR(cost_breakdown.irrigation)}</span>
                    </div>
                    <div className="p-2 bg-stone-50 rounded-xl border border-stone-200">
                      <span className="text-[10px] text-stone-400 block">Pesticides</span>
                      <span className="font-bold font-mono">₹{formatINR(cost_breakdown.pesticides)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Source Note Citations */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-1">
                <span className="font-bold text-stone-800 block flex items-center gap-1.5">
                  <FileText size={12} className="text-emerald-700" /> Agronomic Citations:
                </span>
                <p className="italic"><strong>Suitability & Yield Source:</strong> {source_note}</p>
                <p className="italic"><strong>Cost Template Source:</strong> {cost_source_note}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
