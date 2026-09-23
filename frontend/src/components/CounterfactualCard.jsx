import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Sparkles, CheckCircle2, ArrowRight, RefreshCw, Layers, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

export default function CounterfactualCard({ prescription, currentRiskScore = 0.72 }) {
  const shouldReduceMotion = useReducedMotion()
  const [viewMode, setViewMode] = useState('comparison') // 'comparison' | 'interactive'
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  if (!prescription) return null

  const {
    delta_summary,
    target_risk_level = 'Low',
    target_risk_score = 0.28,
    mutable_deltas = [],
    actionable_steps = [],
    confidence = 0.94,
    solver_method = 'Constrained Random Forest Grid Optimization'
  } = prescription

  const targetScorePct = Math.round(target_risk_score * 100)
  const currentScorePct = Math.round(currentRiskScore * 100)
  const riskReductionPct = Math.max(0, currentScorePct - targetScorePct)

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: 'easeOut' }}
      className="bg-gradient-to-br from-emerald-950 via-teal-950 to-stone-900 rounded-3xl p-6 text-white shadow-xl border border-emerald-500/40 relative overflow-hidden"
    >
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Pill */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-black rounded-full border border-emerald-400/30">
          <Sparkles size={13} className="text-emerald-300" />
          <span>HERO FEATURE · COUNTERFACTUAL PRESCRIPTION</span>
        </div>

        <span className="text-[11px] font-bold text-emerald-400/80 bg-white/10 px-2.5 py-0.5 rounded-md">
          Patent Claim 1–4
        </span>
      </div>

      {/* Title & Core Promise */}
      <h3 className="text-xl font-black tracking-tight text-white">
        What to do to reduce risk
      </h3>
      <p className="text-xs text-emerald-200/90 mt-1 leading-relaxed">
        {delta_summary || 'Targeted microclimate adjustments to transition your plot into a safe vegetative envelope.'}
      </p>

      {/* Animated Before vs After Risk Transition */}
      <div className="mt-5 p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15">
        <div className="text-[11px] font-bold text-stone-300 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Microclimate Risk Transition</span>
          <span className="text-emerald-300">-{riskReductionPct}% Expected Reduction</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Current State */}
          <div className="text-center flex-1 bg-black/20 p-2.5 rounded-xl border border-red-500/30">
            <span className="text-[11px] text-stone-300 block font-semibold">Current State</span>
            <span className="text-xl font-black text-red-400">{currentScorePct}%</span>
            <span className="text-[10px] text-red-300 block font-medium">High Risk</span>
          </div>

          <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/15">
            <ArrowRight size={16} className="text-emerald-300" />
          </div>

          {/* Target Optimized State */}
          <div className="text-center flex-1 bg-black/20 p-2.5 rounded-xl border border-emerald-500/30">
            <span className="text-[11px] text-emerald-200 block font-semibold">Target State</span>
            <span className="text-xl font-black text-emerald-400">{targetScorePct}%</span>
            <span className="text-[10px] text-emerald-300 block font-bold">{target_risk_level} Risk</span>
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
                    <span>Target: <strong className="text-emerald-300">{tgt}{unit}</strong></span>
                  </div>

                  <div className="w-full bg-stone-800/80 rounded-full h-2 overflow-hidden flex">
                    <motion.div
                      className="bg-red-400 h-full rounded-l-full"
                      style={{ width: `${Math.min(100, (cur / (cur + tgt || 1)) * 100)}%` }}
                    />
                    <motion.div
                      className="bg-emerald-400 h-full rounded-r-full"
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
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center justify-between">
          <span>Actionable Field Steps</span>
          <span className="text-[10px] text-stone-400 lowercase">{actionable_steps.length} prescribed</span>
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
              <div className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-400/50 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 size={13} className="text-emerald-300" />
              </div>
              <span className="leading-snug">{step}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Algorithmic & Patent Attribution Footer */}
      <div className="mt-5 pt-3 border-t border-white/10 text-[10px] text-stone-400 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <Layers size={11} className="text-emerald-400" />
          {solver_method}
        </span>
        <span className="font-bold text-emerald-300">
          Optimization Confidence: {Math.round(confidence * 100)}%
        </span>
      </div>
    </motion.div>
  )
}
