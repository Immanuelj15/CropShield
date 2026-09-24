import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, DollarSign, Wallet,
  Receipt, ArrowUpRight, ArrowDownRight, Layers, Sparkles
} from 'lucide-react'
import clsx from 'clsx'
import { formatINR } from './ProfitRangeDisplay'
import PredictionAccuracyBadge from './PredictionAccuracyBadge'

const CATEGORY_COLORS = {
  seeds: { bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-300', light: 'bg-amber-50', label: 'Seeds' },
  fertilizer: { bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-300', light: 'bg-emerald-50', label: 'Fertilizer' },
  labor: { bg: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-300', light: 'bg-blue-50', label: 'Labor' },
  irrigation: { bg: 'bg-cyan-500', text: 'text-cyan-700', border: 'border-cyan-300', light: 'bg-cyan-50', label: 'Irrigation' },
  pesticides: { bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-300', light: 'bg-purple-50', label: 'Pesticides' },
  other: { bg: 'bg-stone-400', text: 'text-stone-700', border: 'border-stone-300', light: 'bg-stone-50', label: 'Other' },
}

function AnimatedNumber({ value, prefix = '₹', duration = 900 }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let start = 0
    const end = Math.round(Number(value) || 0)
    if (start === end) {
      setDisplay(end)
      return
    }
    const startTime = performance.now()
    let frameId

    const step = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const current = Math.round(start + (end - start) * (1 - Math.pow(1 - progress, 3)))
      setDisplay(current)
      if (progress < 1) {
        frameId = requestAnimationFrame(step)
      }
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [value, duration])

  return (
    <span>
      {prefix}{formatINR(display)}
    </span>
  )
}

export default function PnLSummaryCard({
  summary,
  season = 'Kharif 2026',
  cropType = 'Cotton',
  farmName = 'My Farm',
  className = '',
}) {
  const totalRevenue = summary?.total_revenue ?? 0
  const totalExpenses = summary?.total_expenses ?? 0
  const actualProfit = summary?.actual_profit ?? (totalRevenue - totalExpenses)
  const breakdown = summary?.expense_breakdown || {}
  const accuracy = summary?.prediction_accuracy
  const predictedRange = summary?.predicted_profit_range

  const isProfitable = actualProfit >= 0

  return (
    <div className={clsx("bg-white rounded-3xl border border-stone-200 shadow-sm p-6 sm:p-8 space-y-6", className)}>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {season}
            </span>
            <span className="text-xs font-bold text-stone-500">
              · {cropType} · {farmName}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 mt-1">
            Season Profit & Loss Summary
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
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/80 to-teal-50/40 border border-emerald-100 text-stone-900 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <TrendingUp size={15} className="text-emerald-600" /> Total Realized Revenue
            </span>
            <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-950 font-mono">
            <AnimatedNumber value={totalRevenue} />
          </div>
          <p className="text-[11px] text-stone-500">
            From verified harvest sales & mandi receipts
          </p>
        </div>

        {/* Expenses Card */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-50/70 to-stone-50 border border-rose-100 text-stone-900 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
              <Receipt size={15} className="text-rose-600" /> Total Production Cost
            </span>
            <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center text-xs font-bold">
              <ArrowDownRight size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-950 font-mono">
            <AnimatedNumber value={totalExpenses} />
          </div>
          <p className="text-[11px] text-stone-500">
            Seeds, fertilizer, labor, irrigation & pesticides
          </p>
        </div>

        {/* Actual Net Profit Card */}
        <div className={clsx(
          "p-5 rounded-2xl border space-y-2 shadow-xs",
          isProfitable
            ? "bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-emerald-600"
            : "bg-gradient-to-br from-rose-600 to-red-700 text-white border-rose-600"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/90 flex items-center gap-1.5">
              <Wallet size={15} /> Actual Net Profit
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
              {isProfitable ? "Profitable ✓" : "Net Deficit"}
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono">
            <AnimatedNumber value={actualProfit} />
          </div>
          <p className="text-[11px] text-white/80">
            Revenue minus all actual seasonal input costs
          </p>
        </div>
      </div>

      {/* Horizontal Stacked Expense Bar */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs font-bold text-stone-700">
          <span className="flex items-center gap-1.5 uppercase tracking-wider">
            <Layers size={14} className="text-emerald-700" /> Expense Allocation by Category
          </span>
          <span className="font-mono text-stone-500">
            Total: ₹{formatINR(totalExpenses)}
          </span>
        </div>

        {/* Multi-segment stacked bar */}
        <div className="h-4 w-full bg-stone-100 rounded-full overflow-hidden flex shadow-inner">
          {totalExpenses > 0 ? (
            Object.entries(breakdown).map(([cat, amt]) => {
              const pct = (amt / totalExpenses) * 100
              if (pct <= 0) return null
              const meta = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
              return (
                <div
                  key={cat}
                  style={{ width: `${pct}%` }}
                  title={`${meta.label}: ₹${formatINR(amt)} (${Math.round(pct)}%)`}
                  className={clsx(meta.bg, "h-full transition-all duration-500 hover:opacity-90 cursor-pointer")}
                />
              )
            })
          ) : (
            <div className="w-full h-full bg-stone-200 flex items-center justify-center text-[10px] text-stone-400">
              No expenses recorded for this season
            </div>
          )}
        </div>

        {/* Category Legend & Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs pt-1">
          {Object.entries(CATEGORY_COLORS).map(([cat, meta]) => {
            const amt = breakdown[cat] || 0
            const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0
            return (
              <div
                key={cat}
                className={clsx("p-2.5 rounded-xl border flex flex-col justify-between", meta.light, meta.border)}
              >
                <div className="flex items-center justify-between">
                  <span className={clsx("text-[11px] font-bold", meta.text)}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-stone-400">
                    {pct}%
                  </span>
                </div>
                <div className="text-sm font-extrabold text-stone-900 font-mono mt-1">
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
