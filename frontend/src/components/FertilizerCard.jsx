import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sprout, Layers, Package, ChevronDown, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const fmt = (v, digits = 1) => num(v).toLocaleString('en-IN', { maximumFractionDigits: digits })

const PRODUCTS = [
  { key: 'urea', label: 'Urea (46% N)', border: 'border-brand-100', text: 'text-brand-800' },
  { key: 'dap', label: 'DAP (18-46-0)', border: 'border-amber-100', text: 'text-amber-800' },
  { key: 'mop', label: 'MOP (60% K₂O)', border: 'border-violet-100', text: 'text-violet-800' },
]

export default function FertilizerCard({ data, loading = false, error = null, onRetry }) {
  const [expanded, setExpanded] = useState(false)

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
          <Sprout size={24} className="mx-auto text-brand-600 mb-2" />
        )}
        <p className="font-semibold text-stone-800">Fertilizer Advice Not Available</p>
        <p className="text-xs text-stone-500 mt-1">
          {error || 'Select a farm to see its NPK fertilizer recommendation.'}
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

  const comparison = data.nutrient_comparison || {}
  const perAcre = data.recommended_products_per_acre || {}
  const totalFarm = data.recommended_products_total_farm || {}
  const schedule = Array.isArray(data.application_schedule) ? data.application_schedule : []

  const nutrients = [
    {
      key: 'N',
      label: 'Nitrogen (N)',
      required: num(comparison.nitrogen?.required_kg_per_acre),
      available: num(comparison.nitrogen?.available_kg_per_acre),
      deficit: num(comparison.nitrogen?.deficit_kg_per_acre),
      color: 'bg-brand-500',
      textColor: 'text-brand-800',
    },
    {
      key: 'P',
      label: 'Phosphorus (P)',
      required: num(comparison.phosphorus?.required_kg_per_acre),
      available: num(comparison.phosphorus?.available_kg_per_acre),
      deficit: num(comparison.phosphorus?.deficit_kg_per_acre),
      color: 'bg-amber-500',
      textColor: 'text-amber-800',
    },
    {
      key: 'K',
      label: 'Potassium (K)',
      required: num(comparison.potassium?.required_kg_per_acre),
      available: num(comparison.potassium?.available_kg_per_acre),
      deficit: num(comparison.potassium?.deficit_kg_per_acre),
      color: 'bg-violet-500',
      textColor: 'text-violet-800',
    },
  ]

  const maxVal = Math.max(
    ...nutrients.map((n) => Math.max(n.required, n.available + n.deficit)),
    10
  )

  return (
    <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-2 bg-brand-100 text-brand-800 rounded-2xl shrink-0">
              <Sprout size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900">
                Fertilizer Advice (NPK)
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                Soil nutrient deficit → fertilizer products
              </p>
            </div>
          </div>
          {(data.crop_type || data.soil_type) && (
            <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full font-semibold max-w-full truncate">
              {[data.crop_type, data.soil_type].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        {data.soil_data_source && (
          <p className={clsx('mt-2 text-xs font-medium', data.is_lab_verified ? 'text-green-700' : 'text-amber-700')}>
            Soil data: {data.soil_data_source}{data.is_lab_verified ? ' (lab verified)' : ' (estimate — upload a soil lab report for accuracy)'}
          </p>
        )}

        {/* Commercial Products Banner */}
        <div className="my-4 p-3.5 bg-brand-50/60 border border-brand-200/70 rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-900 flex items-center gap-1.5">
              <Package size={13} className="text-brand-700" />
              <span>What to Buy (per acre)</span>
            </span>
            {data.farm_area_acres != null && (
              <span className="text-xs font-semibold text-stone-500">Field: {fmt(data.farm_area_acres, 2)} ac</span>
            )}
          </div>

          <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2 text-center">
            {PRODUCTS.map((p) => (
              <div key={p.key} className={clsx('p-2.5 bg-white rounded-xl border shadow-sm', p.border)}>
                <span className="text-xs font-bold text-stone-500 uppercase block">{p.label}</span>
                <span className={clsx('text-base font-bold font-mono block mt-0.5', p.text)}>
                  {fmt(perAcre[`${p.key}_kg`])}{' '}
                  <span className="text-xs font-normal text-stone-500">kg</span>
                </span>
                {totalFarm[`${p.key}_bags_50kg`] !== undefined && (
                  <span className="text-xs text-stone-500 font-medium block mt-0.5">
                    ≈ {fmt(totalFarm[`${p.key}_bags_50kg`])} bags (50 kg) for whole field
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* NPK Deficit Chart */}
        <div className="space-y-2.5 my-3">
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-stone-500 uppercase">
            <span>Soil Nutrient Deficit</span>
            <span className="normal-case font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-stone-300 mr-1 align-middle" aria-hidden="true" />in soil
              <span className="inline-block w-2 h-2 rounded-full bg-stone-600 ml-2 mr-1 align-middle" aria-hidden="true" />to apply (kg/ac)
            </span>
          </div>

          {nutrients.map((n) => {
            const availPct = Math.round((n.available / maxVal) * 100)
            const defPct = Math.round((n.deficit / maxVal) * 100)

            return (
              <div key={n.key} className="space-y-1">
                <div className="flex flex-wrap justify-between gap-x-2 text-xs">
                  <span className="font-bold text-stone-800 flex items-center gap-1.5">
                    <span className={clsx('w-2 h-2 rounded-full', n.color)} aria-hidden="true" />
                    <span>{n.label}</span>
                  </span>
                  <span className="font-mono text-stone-600">
                    Deficit <strong className={n.textColor}>{fmt(n.deficit)} kg</strong> (need {fmt(n.required)} / soil {fmt(n.available)})
                  </span>
                </div>

                <div
                  className="h-2 w-full bg-stone-100 rounded-full overflow-hidden flex"
                  role="img"
                  aria-label={`${n.label}: ${fmt(n.available)} kg in soil, ${fmt(n.deficit)} kg to apply per acre`}
                >
                  <div
                    style={{ width: `${availPct}%` }}
                    className="bg-stone-300 h-full"
                    title={`In soil: ${fmt(n.available)} kg`}
                  />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${defPct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={clsx('h-full', n.color)}
                    title={`To apply: ${fmt(n.deficit)} kg`}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {data.reason && (
          <p className="text-xs text-stone-600 mt-2">
            {data.reason}
          </p>
        )}
      </div>

      {/* Expandable Split Schedule */}
      <div className="mt-3 pt-2 border-t border-stone-100">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          disabled={schedule.length === 0}
          className="w-full flex items-center justify-between text-xs font-bold text-brand-800 hover:text-brand-900 transition-colors rounded disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex items-center gap-1.5">
            <Layers size={13} />
            <span>Split Application Schedule ({schedule.length} {schedule.length === 1 ? 'stage' : 'stages'})</span>
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <AnimatePresence>
          {expanded && schedule.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mt-2 text-xs text-stone-600 space-y-2 bg-stone-50 p-3 rounded-2xl border border-stone-200"
            >
              <div className="divide-y divide-stone-200">
                {schedule.map((item, idx) => (
                  <div key={`${item.stage}-${idx}`} className="py-1.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                    <div>
                      <span className="font-bold text-stone-900 block text-xs">
                        {item.stage}
                      </span>
                      <span className="text-xs text-stone-500">
                        {num(item.days_after_sowing) === 0 ? 'At sowing' : `Day ${item.days_after_sowing} after sowing`}
                      </span>
                    </div>
                    <div className="sm:text-right font-mono text-xs text-brand-900 font-semibold">
                      Urea {fmt(item.urea_kg_per_acre)} kg · DAP {fmt(item.dap_kg_per_acre)} kg · MOP {fmt(item.mop_kg_per_acre)} kg
                      <span className="block text-stone-500 font-normal">per acre</span>
                    </div>
                  </div>
                ))}
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
