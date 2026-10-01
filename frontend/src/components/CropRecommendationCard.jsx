import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, AlertTriangle, ChevronDown, ChevronUp, FileText
} from 'lucide-react'
import clsx from 'clsx'
import ProfitRangeDisplay, { formatINR } from './ProfitRangeDisplay'

/**
 * Animated Circular Score Ring
 */
function CircularScoreRing({ score, size = 68, strokeWidth = 6 }) {
  const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (safeScore / 100) * circumference

  // brand-600 / brand-500 / amber-600 / red-600
  const strokeColor =
    safeScore >= 80 ? '#0d5c2f' : safeScore >= 60 ? '#219350' : safeScore >= 40 ? '#d97706' : '#dc2626'

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Suitability score ${Math.round(safeScore)} out of 100`}
    >
      <svg width={size} height={size} className="transform -rotate-90" aria-hidden="true">
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
        <span className="text-base font-bold text-stone-900 leading-none font-mono">
          {Math.round(safeScore)}
        </span>
        <span className="text-xs font-medium text-stone-500 leading-none mt-0.5">
          score
        </span>
      </div>
    </div>
  )
}

const RISK_STYLES = {
  High: { badge: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
  Medium: { badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  Low: { badge: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' },
}

/**
 * Traffic-light badge helper
 */
function RiskBadge({ label, level }) {
  const s = RISK_STYLES[level] || { badge: 'bg-stone-100 text-stone-700 border-stone-200', dot: 'bg-stone-400' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      <span>{label}: {level || '—'}</span>
    </span>
  )
}

const prettyKey = (k) => String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * CropRecommendationCard Component
 */
export default function CropRecommendationCard({
  rec,
  rank = 1,
  isTop = false,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false)
  if (!rec) return null

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
    exceeds_budget,
  } = rec

  const breakdownEntries = cost_breakdown && typeof cost_breakdown === 'object'
    ? Object.entries(cost_breakdown).filter(([, v]) => Number.isFinite(Number(v)))
    : []
  const scoreLabel = Number.isFinite(Number(suitability_score)) ? Math.round(Number(suitability_score)) : '—'
  const detailsId = `crop-details-${String(crop_type || rank).replace(/\s+/g, '-')}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: rank * 0.08 }}
      className={clsx(
        'bg-white rounded-3xl border transition-all duration-300 relative overflow-hidden shadow-sm hover:shadow-md',
        isTop ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md' : 'border-stone-200 hover:border-brand-300',
        className
      )}
    >
      {/* Top Match Highlight Ribbon */}
      {isTop && (
        <div className="bg-brand-600 text-white text-xs font-semibold uppercase tracking-wider py-1.5 px-4 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} /> #1 Best Agronomic Fit
          </span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono font-semibold normal-case">
            {scoreLabel}% match
          </span>
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-5">
        {/* Header: Rank + Crop Name + Score Ring */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded-lg border font-mono',
                isTop ? 'bg-brand-100 text-brand-800 border-brand-300' : 'bg-stone-100 text-stone-700 border-stone-200'
              )}>
                #{rank}
              </span>
              {water_requirement && (
                <span className="text-xs font-semibold text-stone-500">
                  {water_requirement} water need
                </span>
              )}
            </div>
            <h3 className="text-2xl font-bold text-stone-900 tracking-tight break-words">
              {crop_type}
            </h3>
            {reason_text && (
              <p className="text-xs text-stone-600 leading-snug line-clamp-3">
                {reason_text}
              </p>
            )}
          </div>

          <CircularScoreRing score={suitability_score} size={66} strokeWidth={6} />
        </div>

        {exceeds_budget && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-700" />
            <span>Exceeds your budget — shown as the closest agronomic fit. Estimated cost ₹{formatINR(estimated_cost)}.</span>
          </div>
        )}

        {/* Profit Range Section (Hard requirement: always min-max range) */}
        <ProfitRangeDisplay
          profitRange={estimated_profit_range}
          revenueRange={estimated_revenue_range}
          estimatedCost={estimated_cost}
        />

        {/* Yield & Mandi Price Snapshot */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-stone-50/70 p-3.5 rounded-2xl border border-stone-200/70">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-stone-500 block">
              Expected total yield
            </span>
            <span className="font-bold text-stone-900 text-sm font-mono mt-0.5 block">
              {expected_yield_range?.min ?? '—'} – {expected_yield_range?.max ?? '—'} {expected_yield_range?.unit || 'quintals'}
            </span>
            {expected_yield_range?.per_acre_kg_range && (
              <span className="text-xs text-stone-500 block mt-0.5">
                ({expected_yield_range.per_acre_kg_range})
              </span>
            )}
          </div>

          <div className="min-w-0">
            <span className="text-xs font-semibold text-stone-500 block">
              Mandi price band
            </span>
            <span className="font-bold text-stone-900 text-sm font-mono mt-0.5 block">
              ₹{formatINR(expected_price_range?.min)} – ₹{formatINR(expected_price_range?.max)}
            </span>
            <span className="text-xs text-stone-500 block mt-0.5">
              per quintal (₹{expected_price_range?.min_per_kg ?? '—'} – ₹{expected_price_range?.max_per_kg ?? '—'} per kg)
            </span>
          </div>
        </div>

        {/* Risk Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge label="Weather risk" level={weather_risk} />
            <RiskBadge label="Market risk" level={market_risk} />
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800 transition flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <span>{expanded ? 'Hide details' : 'Cost & sources'}</span>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {/* Expandable Cost Breakdown & Citations Drawer */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              id={detailsId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-3 border-t border-stone-100 space-y-3.5 text-xs overflow-hidden"
            >
              {/* Cost Itemization */}
              {breakdownEntries.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-semibold text-stone-800 text-xs block">
                    Estimated cost breakdown (whole plot)
                    {Number.isFinite(Number(cost_per_acre)) && (
                      <span className="font-normal text-stone-500"> · ₹{formatINR(cost_per_acre)} per acre</span>
                    )}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-stone-700">
                    {breakdownEntries.map(([key, value]) => (
                      <div key={key} className="p-2 bg-stone-50 rounded-xl border border-stone-200 min-w-0">
                        <span className="text-xs text-stone-500 block truncate">{prettyKey(key)}</span>
                        <span className="font-semibold font-mono">₹{formatINR(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Note Citations */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 space-y-1">
                <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                  <FileText size={12} className="text-brand-700" /> Sources
                </span>
                <p><strong>Suitability &amp; yield:</strong> {source_note || 'Not specified'}</p>
                <p><strong>Cost template:</strong> {cost_source_note || 'Not specified'}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
