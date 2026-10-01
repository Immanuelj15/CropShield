import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Sparkles, CheckCircle2, ArrowRight, RefreshCw, Layers, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

export default function CounterfactualCard({ prescription, currentRiskScore }) {
  const shouldReduceMotion = useReducedMotion()
  const [viewMode, setViewMode] = useState('comparison') // 'comparison' | 'interactive'
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  if (!prescription) return null

  const {
    delta_summary,
    recommendation_title,
    current_risk_level,
    current_risk_score,
    target_risk_level = 'Low',
    target_risk_score,
    confidence,
    optimization_method,
    solver_method,
  } = prescription
  // Backend may send null for lists; never .map() a non-array
  const mutable_deltas = Array.isArray(prescription.mutable_deltas) ? prescription.mutable_deltas : []
  const actionable_steps = Array.isArray(prescription.actionable_steps) ? prescription.actionable_steps : []
  const method = optimization_method || solver_method || 'Heuristic counterfactual search'

  const toPct = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 100) : null
  }
  const currentScorePct = toPct(current_risk_score ?? currentRiskScore)
  const targetScorePct = toPct(target_risk_score)
  const riskReductionPct = currentScorePct != null && targetScorePct != null
    ? Math.max(0, currentScorePct - targetScorePct)
    : null
  const currentLevel = current_risk_level || null
  const confidencePct = toPct(confidence)

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: 'easeOut' }}
      className="bg-gradient-to-br from-brand-900 via-brand-800 to-stone-900 rounded-3xl p-6 text-white shadow-lg border border-brand-500/40 relative overflow-hidden"
    >
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Pill */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-500/20 text-brand-200 text-xs font-black rounded-full border border-brand-400/30">
          <Sparkles size={13} className="text-brand-200" />
          <span>ACTION PLAN · COUNTERFACTUAL</span>
        </div>
      </div>

      {/* Title & Core Promise */}
      <h3 className="text-xl font-black tracking-tight text-white">
        What to do to reduce risk
      </h3>
      {recommendation_title && (
        <p className="text-xs font-bold text-brand-200 mt-0.5">{recommendation_title}</p>
      )}
      <p className="text-xs text-brand-200/90 mt-1 leading-relaxed">
        {delta_summary || 'Targeted microclimate adjustments to transition your plot into a safe vegetative envelope.'}
      </p>

      {/* Animated Before vs After Risk Transition */}
      <div className="mt-5 p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15">
        <div className="text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-2 flex flex-wrap items-center justify-between gap-1">
          <span>Microclimate Risk Transition</span>
          {riskReductionPct != null && (
            <span className="text-brand-300">-{riskReductionPct}% Expected Reduction</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Current State */}
          <div className={clsx(
            'text-center flex-1 bg-black/20 p-2.5 rounded-xl border',
            currentLevel === 'High' ? 'border-red-500/30' : currentLevel === 'Medium' ? 'border-amber-500/30' : 'border-white/20'
          )}>
            <span className="text-[11px] text-stone-300 block font-semibold">Current State</span>
            <span className={clsx(
              'text-xl font-black',
              currentLevel === 'High' ? 'text-red-400' : currentLevel === 'Medium' ? 'text-amber-300' : 'text-white'
            )}>{currentScorePct != null ? `${currentScorePct}%` : '—'}</span>
            <span className={clsx(
              'text-xs block font-medium',
              currentLevel === 'High' ? 'text-red-300' : currentLevel === 'Medium' ? 'text-amber-200' : 'text-stone-300'
            )}>{currentLevel ? `${currentLevel} Risk` : 'Current'}</span>
          </div>

          <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/15">
            <ArrowRight size={16} className="text-brand-300" />
          </div>

          {/* Target Optimized State */}
          <div className="text-center flex-1 bg-black/20 p-2.5 rounded-xl border border-brand-500/30">
            <span className="text-[11px] text-brand-200 block font-semibold">Target State</span>
            <span className="text-xl font-black text-brand-300">{targetScorePct != null ? `${targetScorePct}%` : '—'}</span>
            <span className="text-xs text-brand-300 block font-bold">{target_risk_level} Risk</span>
          </div>
        </div>
      </div>

      {/* Mutable Physical Deltas (Before → After dials) */}
      <div className="mt-5 space-y-3">
        <h4 className="text-xs font-bold text-stone-200 uppercase tracking-wider">
          Physical Microclimate Deltas (Minimum Effort)
        </h4>

        {mutable_deltas.length > 0 ? (
          mutable_deltas.map((delta, i) => {
            const cur = parseFloat(delta.current_value) || 0
            const tgt = parseFloat(delta.target_value) || 0
            const unit = delta.unit || ''

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : i * 0.1, duration: 0.25 }}
                className="p-3.5 bg-white/10 backdrop-blur rounded-2xl border border-white/10 space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-white">{delta.parameter}</span>
                  <span className="text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-md border border-amber-400/30">
                    Delta: {delta.delta} {unit}
                  </span>
                </div>

                {/* Visual Delta Gauge Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-stone-300">
                    <span>Current: <strong className="text-white">{cur}{unit}</strong></span>
                    <span>Target: <strong className="text-brand-300">{tgt}{unit}</strong></span>
                  </div>

                  <div className="w-full bg-stone-800/80 rounded-full h-2 overflow-hidden flex">
                    <motion.div
                      className="bg-red-400 h-full rounded-l-full"
                      style={{ width: `${Math.min(100, (cur / (cur + tgt || 1)) * 100)}%` }}
                    />
                    <motion.div
                      className="bg-brand-400 h-full rounded-r-full"
                      style={{ width: `${Math.min(100, (tgt / (cur + tgt || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            )
          })
        ) : (
          <div className="p-3 bg-white/5 rounded-xl text-xs text-stone-300 italic text-center">
            Microclimate is already near optimal threshold boundaries.
          </div>
        )}
      </div>

      {/* Step-by-Step Actionable Guidance */}
      <div className="mt-5 pt-4 border-t border-white/10 space-y-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-brand-300 flex items-center justify-between">
          <span>Actionable Field Steps</span>
          <span className="text-xs text-stone-300 lowercase">{actionable_steps.length} prescribed</span>
        </h4>

        <div className="space-y-2">
          {actionable_steps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : idx * 0.08 }}
              className="flex items-start gap-2.5 p-2.5 bg-white/5 rounded-xl border border-white/10 text-xs text-stone-200"
            >
              <div className="w-5 h-5 rounded-full bg-brand-500/30 border border-brand-400/50 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 size={13} className="text-brand-300" />
              </div>
              <span className="leading-snug">{step}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Algorithmic & Patent Attribution Footer */}
      <div className="mt-5 pt-3 border-t border-white/10 text-xs text-stone-300 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <Layers size={12} className="text-brand-300 shrink-0" />
          {method}
        </span>
        {confidencePct != null && (
          <span className="font-bold text-brand-200" title="Fixed heuristic estimate from the rule-based optimizer">
            Plan confidence (heuristic): {confidencePct}%
          </span>
        )}
      </div>
    </motion.div>
  )
}
