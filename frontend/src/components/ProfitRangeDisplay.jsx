import React from 'react'
import { Info, TrendingUp, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Format numbers in Indian numbering system: e.g. 150000 -> 1,50,000
 */
export function formatINR(val) {
  if (val === undefined || val === null || isNaN(val)) return '0'
  const isNeg = val < 0
  const absVal = Math.round(Math.abs(val))
  const str = absVal.toString()
  if (str.length <= 3) {
    return (isNeg ? '-' : '') + str
  }
  const lastThree = str.substring(str.length - 3)
  const otherNumbers = str.substring(0, str.length - 3)
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
  return (isNeg ? '-' : '') + formatted
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

  const minProfit = profitRange?.min ?? 0
  const maxProfit = profitRange?.max ?? 0

  const isProfitable = minProfit >= 0 || maxProfit > 0
  const isHighProfit = minProfit > 20000

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      isHighProfit
        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
        : isProfitable
        ? 'bg-emerald-50/40 border-emerald-100 text-stone-900'
        : 'bg-amber-50/70 border-amber-200 text-amber-950'
    } ${className}`}>
      {/* Header Label */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
          <TrendingUp size={14} className="text-emerald-600" />
          {t('farmer:estimated_profit_range') || 'Estimated Net Profit Range'}
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border border-emerald-300 text-emerald-800 shadow-2xs">
          Pre-Season Model
        </span>
      </div>

      {/* Main Range Display: NEVER A SINGLE NUMBER */}
      <div className="my-2">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-900 font-mono">
            ₹{formatINR(minProfit)}
          </span>
          <span className="text-lg font-bold text-stone-400">to</span>
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-900 font-mono">
            ₹{formatINR(maxProfit)}
          </span>
        </div>
      </div>

      {/* Breakdown Snapshot */}
      {!compact && (revenueRange || estimatedCost) && (
        <div className="grid grid-cols-2 gap-2 pt-2.5 mt-2 border-t border-emerald-900/10 text-xs">
          <div>
            <span className="text-[10px] text-stone-500 block">Est. Cultivation Cost</span>
            <span className="font-bold text-stone-800 font-mono">
              ₹{formatINR(estimatedCost || 0)}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-stone-500 block">Est. Revenue Range</span>
            <span className="font-bold text-stone-800 font-mono">
              ₹{formatINR(revenueRange?.min)} – ₹{formatINR(revenueRange?.max)}
            </span>
          </div>
        </div>
      )}

      {/* Mandatory Persistent Disclaimer on EVERY card */}
      <div className="mt-3 pt-2 border-t border-emerald-900/10 flex items-start gap-1.5 text-[10px] text-stone-500 leading-tight">
        <Info size={12} className="shrink-0 text-emerald-700 mt-0.5" />
        <span>
          Estimated range — actual results depend on weather, market prices, and farming practices.
        </span>
      </div>
    </div>
  )
}
