import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sprout, Layers, Package, Calendar, ChevronDown, ChevronUp, Info, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

export default function FertilizerCard({ data, loading = false }) {
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
        <Sprout size={24} className="mx-auto text-emerald-500 mb-2" />
        <p className="font-semibold text-stone-700">Fertilizer Recommendation Not Available</p>
        <p className="text-[11px] text-stone-400 mt-1">Generate a farm activity plan to activate NPK nutrient profiling.</p>
      </div>
    )
  }

  const comparison = data.nutrient_comparison || {}
  const perAcre = data.recommended_products_per_acre || {}
  const totalFarm = data.recommended_products_total_farm || {}
  const schedule = data.application_schedule || []

  const nutrients = [
    {
      key: 'N',
      label: 'Nitrogen (N)',
      required: comparison.nitrogen?.required_kg_per_acre || 0,
      available: comparison.nitrogen?.available_kg_per_acre || 0,
      deficit: comparison.nitrogen?.deficit_kg_per_acre || 0,
      color: 'bg-emerald-500',
      lightColor: 'bg-emerald-100',
      textColor: 'text-emerald-800',
    },
    {
      key: 'P',
      label: 'Phosphorus (P)',
      required: comparison.phosphorus?.required_kg_per_acre || 0,
      available: comparison.phosphorus?.available_kg_per_acre || 0,
      deficit: comparison.phosphorus?.deficit_kg_per_acre || 0,
      color: 'bg-amber-500',
      lightColor: 'bg-amber-100',
      textColor: 'text-amber-800',
    },
    {
      key: 'K',
      label: 'Potassium (K)',
      required: comparison.potassium?.required_kg_per_acre || 0,
      available: comparison.potassium?.available_kg_per_acre || 0,
      deficit: comparison.potassium?.deficit_kg_per_acre || 0,
      color: 'bg-purple-500',
      lightColor: 'bg-purple-100',
      textColor: 'text-purple-800',
    },
  ]

  const maxVal = Math.max(
    ...nutrients.map((n) => Math.max(n.required, n.available + n.deficit)),
    10
  )

  return (
    <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-100 text-emerald-800 rounded-2xl">
              <Sprout size={18} />
            </span>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
                Fertilizer Advisory (NPK)
              </h3>
              <p className="text-[10px] text-stone-400 font-semibold">
                ICAR/TNAU Soil Deficit Conversion
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-bold">
            {data.crop_type} · {data.soil_type}
          </span>
        </div>

        {/* Commercial Products Banner (Counter Ready) */}
        <div className="my-4 p-3.5 bg-gradient-to-br from-emerald-50 via-white to-stone-50 border border-emerald-200/70 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
              <Package size={13} className="text-emerald-700" />
              <span>Recommended Purchases (Per Acre)</span>
            </span>
            <span className="text-[9px] font-extrabold text-stone-400">Fixed Nutrient Contents</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Urea */}
            <div className="p-2.5 bg-white rounded-xl border border-emerald-100 shadow-sm">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">Urea (46% N)</span>
              <span className="text-base font-black text-emerald-800 font-mono block mt-0.5">
                {perAcre.urea_kg}{' '}
                <span className="text-[10px] font-normal text-stone-500">kg</span>
              </span>
              {totalFarm.urea_bags_50kg !== undefined && (
                <span className="text-[9px] text-stone-400 font-medium block mt-0.5">
                  ~{totalFarm.urea_bags_50kg} bags total
                </span>
              )}
            </div>

            {/* DAP */}
            <div className="p-2.5 bg-white rounded-xl border border-amber-100 shadow-sm">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">DAP (18-46-0)</span>
              <span className="text-base font-black text-amber-800 font-mono block mt-0.5">
                {perAcre.dap_kg}{' '}
                <span className="text-[10px] font-normal text-stone-500">kg</span>
              </span>
              {totalFarm.dap_bags_50kg !== undefined && (
                <span className="text-[9px] text-stone-400 font-medium block mt-0.5">
                  ~{totalFarm.dap_bags_50kg} bags total
                </span>
              )}
            </div>

            {/* MOP */}
            <div className="p-2.5 bg-white rounded-xl border border-purple-100 shadow-sm">
              <span className="text-[10px] font-bold text-stone-500 uppercase block">MOP (60% K)</span>
              <span className="text-base font-black text-purple-800 font-mono block mt-0.5">
                {perAcre.mop_kg}{' '}
                <span className="text-[10px] font-normal text-stone-500">kg</span>
              </span>
              {totalFarm.mop_bags_50kg !== undefined && (
                <span className="text-[9px] text-stone-400 font-medium block mt-0.5">
                  ~{totalFarm.mop_bags_50kg} bags total
                </span>
              )}
            </div>
          </div>
        </div>

        {/* NPK Deficit Chart */}
        <div className="space-y-2.5 my-3">
          <div className="flex items-center justify-between text-[10px] font-bold text-stone-500 uppercase">
            <span>Soil Nutrient Deficit</span>
            <span>Required vs Available (kg/ac)</span>
          </div>

          {nutrients.map((n) => {
            const reqPct = Math.round((n.required / maxVal) * 100)
            const availPct = Math.round((n.available / maxVal) * 100)
            const defPct = Math.round((n.deficit / maxVal) * 100)

            return (
              <div key={n.key} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="font-bold text-stone-800 flex items-center gap-1.5">
                    <span className={clsx('w-2 h-2 rounded-full', n.color)} />
                    <span>{n.label}</span>
                  </span>
                  <span className="font-mono text-stone-600">
                    Deficit: <strong className={n.textColor}>{n.deficit}kg</strong> (Req {n.required} / Soil {n.available})
                  </span>
                </div>

                <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden flex">
                  {/* Soil available pool */}
                  <div
                    style={{ width: `${availPct}%` }}
                    className="bg-stone-300 h-full"
                    title={`Soil Available: ${n.available}kg`}
                  />
                  {/* Deficit needing replenishment */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${defPct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={clsx('h-full', n.color)}
                    title={`Deficit to apply: ${n.deficit}kg`}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-stone-500 mt-2 italic">
          {data.reason}
        </p>
      </div>

      {/* Expandable Split Schedule */}
      <div className="mt-3 pt-2 border-t border-stone-100">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-800 hover:text-emerald-900 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Layers size={13} />
            <span>Split Application Schedule ({schedule.length} Stages)</span>
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
              <div className="divide-y divide-stone-200">
                {schedule.map((item, idx) => (
                  <div key={idx} className="py-1.5 first:pt-0 last:pb-0 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-stone-900 block text-[10.5px]">
                        {item.stage}
                      </span>
                      <span className="text-[9px] text-stone-400">
                        {item.days_after_sowing === 0 ? 'At Sowing' : `Day ${item.days_after_sowing} after sowing`}
                      </span>
                    </div>
                    <div className="text-right font-mono text-[10px] text-emerald-900 font-semibold">
                      <span>Urea: {item.urea_kg_per_acre}kg</span> · <span>DAP: {item.dap_kg_per_acre}kg</span> · <span>MOP: {item.mop_kg_per_acre}kg</span>
                    </div>
                  </div>
                ))}
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
