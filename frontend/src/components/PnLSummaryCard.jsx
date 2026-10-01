import React from 'react'
import {
  TrendingUp, Wallet,
  Receipt, ArrowUpRight, ArrowDownRight, Layers
} from 'lucide-react'
import clsx from 'clsx'
import { formatINR, formatRupee } from './ProfitRangeDisplay'
import PredictionAccuracyBadge from './PredictionAccuracyBadge'
import { useAnimatedNumber } from '../hooks/useAnimatedNumber'

// Categorical palette for the six expense categories (static class strings so Tailwind keeps them).
const CATEGORY_COLORS = {
  seeds: { bg: 'bg-amber-500', text: 'text-amber-800', border: 'border-amber-200', light: 'bg-amber-50', label: 'Seeds' },
  fertilizer: { bg: 'bg-brand-500', text: 'text-brand-800', border: 'border-brand-200', light: 'bg-brand-50', label: 'Fertilizer' },
  labor: { bg: 'bg-sky-500', text: 'text-sky-800', border: 'border-sky-200', light: 'bg-sky-50', label: 'Labor' },
  irrigation: { bg: 'bg-cyan-500', text: 'text-cyan-800', border: 'border-cyan-200', light: 'bg-cyan-50', label: 'Irrigation' },
  pesticides: { bg: 'bg-violet-500', text: 'text-violet-800', border: 'border-violet-200', light: 'bg-violet-50', label: 'Pesticides' },
  other: { bg: 'bg-stone-400', text: 'text-stone-700', border: 'border-stone-200', light: 'bg-stone-50', label: 'Other' },
}

function AnimatedNumber({ value, duration = 900 }) {
  const display = useAnimatedNumber(value, { duration })
  return <span>{formatRupee(display)}</span>
}

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function PnLSummaryCard({
  summary,
  season = 'Kharif 2026',
  cropType = 'Cotton',
  farmName = 'My Farm',
  loading = false,
  className = '',
}) {
  const totalRevenue = toNum(summary?.total_revenue)
  const totalExpenses = toNum(summary?.total_expenses)
  const actualProfit = summary?.actual_profit != null ? toNum(summary.actual_profit) : totalRevenue - totalExpenses
  const breakdown = summary?.expense_breakdown || {}
  const accuracy = summary?.prediction_accuracy
  const predictedRange = summary?.predicted_profit_range
  const hasActivity = totalRevenue > 0 || totalExpenses > 0

  const isProfitable = actualProfit >= 0

  if (loading && !summary) {
    return (
      <div className={clsx('bg-white rounded-3xl border border-stone-200 shadow-sm p-6 sm:p-8 space-y-6 animate-pulse', className)} aria-busy="true">
        <div className="h-6 w-1/3 bg-stone-200 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-stone-100" />)}
        </div>
        <div className="h-4 w-full bg-stone-100 rounded-full" />
      </div>
    )
  }

  return (
    <div className={clsx('bg-white rounded-3xl border border-stone-200 shadow-sm p-5 sm:p-8 space-y-6', className)}>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-800 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
              {season}
            </span>
            <span className="text-xs font-semibold text-stone-500 break-words">
              {cropType} · {farmName}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-stone-900 mt-1">
            Season Profit &amp; Loss Summary
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {accuracy && (
            <PredictionAccuracyBadge
              accuracy={accuracy}
              predictedRange={predictedRange}
              actualProfit={actualProfit}
              compact
            />
          )}
        </div>
      </div>

      {/* 3 Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Revenue Card */}
        <div className="p-5 rounded-2xl bg-brand-50/70 border border-brand-100 text-stone-900 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-800 flex items-center gap-1.5">
              <TrendingUp size={15} className="text-brand-600" /> Total Revenue
            </span>
            <div className="w-7 h-7 shrink-0 rounded-xl bg-brand-100 text-brand-800 flex items-center justify-center">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-brand-950 font-mono break-all">
            <AnimatedNumber value={totalRevenue} />
          </div>
          <p className="text-xs text-stone-500">From harvest sales you have logged</p>
        </div>

        {/* Expenses Card */}
        <div className="p-5 rounded-2xl bg-red-50/60 border border-red-100 text-stone-900 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center gap-1.5">
              <Receipt size={15} className="text-red-600" /> Total Expenses
            </span>
            <div className="w-7 h-7 shrink-0 rounded-xl bg-red-100 text-red-800 flex items-center justify-center">
              <ArrowDownRight size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-red-950 font-mono break-all">
            <AnimatedNumber value={totalExpenses} />
          </div>
          <p className="text-xs text-stone-500">Seeds, fertilizer, labor, irrigation, pesticides &amp; other</p>
        </div>

        {/* Actual Net Profit Card */}
        <div className={clsx(
          'p-5 rounded-2xl border space-y-2 shadow-sm text-white',
          !hasActivity
            ? 'bg-stone-700 border-stone-700'
            : isProfitable
            ? 'bg-gradient-to-br from-brand-600 to-brand-800 border-brand-600'
            : 'bg-gradient-to-br from-red-600 to-red-800 border-red-600'
        )}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white/90 flex items-center gap-1.5">
              <Wallet size={15} /> Net Profit
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
              {!hasActivity ? 'No entries yet' : isProfitable ? 'Profit' : 'Loss'}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono break-all">
            <AnimatedNumber value={actualProfit} />
          </div>
          <p className="text-xs text-white/85">Revenue minus all expenses this season</p>
        </div>
      </div>

      {/* Horizontal Stacked Expense Bar */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-stone-700">
          <span className="flex items-center gap-1.5 uppercase tracking-wider">
            <Layers size={14} className="text-brand-700" /> Expenses by Category
          </span>
          <span className="font-mono text-stone-500">
            Total: ₹{formatINR(totalExpenses)}
          </span>
        </div>

        {/* Multi-segment stacked bar */}
        <div
          className="h-4 w-full bg-stone-100 rounded-full overflow-hidden flex shadow-inner"
          role="img"
          aria-label={
            totalExpenses > 0
              ? Object.entries(CATEGORY_COLORS)
                  .map(([cat, meta]) => `${meta.label} ₹${formatINR(breakdown[cat] || 0)}`)
                  .join(', ')
              : 'No expenses recorded for this season'
          }
        >
          {totalExpenses > 0 &&
            Object.entries(breakdown).map(([cat, amt]) => {
              const pct = (toNum(amt) / totalExpenses) * 100
              if (pct <= 0) return null
              const meta = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
              return (
                <div
                  key={cat}
                  style={{ width: `${pct}%` }}
                  title={`${meta.label}: ₹${formatINR(amt)} (${Math.round(pct)}%)`}
                  className={clsx(meta.bg, 'h-full transition-all duration-500')}
                />
              )
            })}
        </div>
        {totalExpenses <= 0 && (
          <p className="text-xs text-stone-500">No expenses recorded for this season yet.</p>
        )}

        {/* Category Legend & Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs pt-1">
          {Object.entries(CATEGORY_COLORS).map(([cat, meta]) => {
            const amt = toNum(breakdown[cat])
            const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0
            return (
              <div
                key={cat}
                className={clsx('p-2.5 rounded-xl border flex flex-col justify-between min-w-0', meta.light, meta.border)}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={clsx('text-xs font-bold flex items-center gap-1.5', meta.text)}>
                    <span className={clsx('w-2 h-2 rounded-full shrink-0', meta.bg)} aria-hidden="true" />
                    {meta.label}
                  </span>
                  <span className="text-xs font-mono font-semibold text-stone-500">
                    {pct}%
                  </span>
                </div>
                <div className="text-sm font-bold text-stone-900 font-mono mt-1 truncate">
                  ₹{formatINR(amt)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Prediction Accuracy Breakdown banner */}
      <PredictionAccuracyBadge
        accuracy={accuracy}
        predictedRange={predictedRange}
        actualProfit={actualProfit}
      />
    </div>
  )
}
