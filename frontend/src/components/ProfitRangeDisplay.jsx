import React from 'react'
import { Info, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Format numbers in Indian numbering system: e.g. 150000 -> 1,50,000 (rounded to whole rupees).
 * Returns '0' for null/undefined/NaN. Negative values keep a leading '-'.
 */
export function formatINR(val) {
  const n = Number(val)
  if (val === undefined || val === null || val === '' || !Number.isFinite(n)) return '0'
  const rounded = Math.round(n)
  if (rounded === 0) return '0'
  return rounded.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

/**
 * Rupee amount with the sign before the symbol: -5000 -> "-₹5,000" (not "₹-5,000").
 */
export function formatRupee(val) {
  const n = Number(val)
  if (!Number.isFinite(n)) return '₹0'
  return `${Math.round(n) < 0 ? '-' : ''}₹${formatINR(Math.abs(n))}`
}

/**
 * ProfitRangeDisplay Component
 * HARD REQUIREMENT: ALWAYS renders profit as an estimated range (e.g., "₹30,000 – ₹40,000"),
 * NEVER a single guaranteed point figure, with the mandatory persistent disclaimer on every card.
 */
export default function ProfitRangeDisplay({
  profitRange,
  revenueRange,
  estimatedCost,
  className = '',
  compact = false,
}) {
  const { t } = useTranslation(['farmer', 'common'])

  const minProfit = Number(profitRange?.min ?? 0) || 0
  const maxProfit = Number(profitRange?.max ?? 0) || 0

  const isProfitable = minProfit >= 0
  const isHighProfit = minProfit > 20000

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      isHighProfit
        ? 'bg-brand-50 border-brand-200 text-brand-950'
        : isProfitable
        ? 'bg-brand-50/50 border-brand-100 text-stone-900'
        : 'bg-amber-50/70 border-amber-200 text-amber-950'
    } ${className}`}>
      {/* Header Label */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-800 flex items-center gap-1.5">
          <TrendingUp size={14} className="text-brand-600" />
          {t('farmer:estimated_profit_range', 'Estimated Net Profit Range')}
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/80 border border-brand-200 text-brand-800 shadow-sm">
          Pre-Season Model
        </span>
      </div>

      {/* Main Range Display: NEVER A SINGLE NUMBER */}
      <div className="my-2">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-mono ${minProfit < 0 ? 'text-red-700' : 'text-brand-900'}`}>
            {formatRupee(minProfit)}
          </span>
          <span className="text-lg font-bold text-stone-500">to</span>
          <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight font-mono ${maxProfit < 0 ? 'text-red-700' : 'text-brand-900'}`}>
            {formatRupee(maxProfit)}
          </span>
        </div>
      </div>

      {/* Breakdown Snapshot */}
      {!compact && (revenueRange || estimatedCost) && (
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 pt-2.5 mt-2 border-t border-stone-900/10 text-xs">
          <div>
            <span className="text-xs text-stone-500 block">Est. Cultivation Cost</span>
            <span className="font-bold text-stone-800 font-mono">
              {formatRupee(estimatedCost || 0)}
            </span>
          </div>
          <div>
            <span className="text-xs text-stone-500 block">Est. Revenue Range</span>
            <span className="font-bold text-stone-800 font-mono">
              {formatRupee(revenueRange?.min)} – {formatRupee(revenueRange?.max)}
            </span>
          </div>
        </div>
      )}

      {/* Mandatory Persistent Disclaimer on EVERY card */}
      <div className="mt-3 pt-2 border-t border-stone-900/10 flex items-start gap-1.5 text-xs text-stone-500 leading-snug">
        <Info size={12} className="shrink-0 text-brand-700 mt-0.5" />
        <span>
          Estimated range — actual results depend on weather, market prices, and farming practices.
        </span>
      </div>
    </div>
  )
}
