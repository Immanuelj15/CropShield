import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  IndianRupee, TrendingUp, AlertOctagon, CheckCircle2,
  Clock, HelpCircle, ChevronDown, ChevronUp, ShieldCheck,
  Scale, ArrowRight, Info, AlertTriangle
} from 'lucide-react'
import clsx from 'clsx'

// ── Smooth Counter with Reduced-Motion Support ──────────────────────────────
function AnimatedRupee({ value, duration = 0.75 }) {
  const shouldReduceMotion = useReducedMotion()
  const [displayValue, setDisplayValue] = useState(shouldReduceMotion ? value : 0)

  useEffect(() => {
    if (shouldReduceMotion || value == null) {
      setDisplayValue(value)
      return
    }

    let startTime = null
    const startVal = 0
    const endVal = Number(value) || 0
    let animationFrameId

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(startVal + (endVal - startVal) * easeOut))

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step)
      }
    }

    animationFrameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animationFrameId)
  }, [value, duration, shouldReduceMotion])

  if (value == null) return <span>—</span>

  return (
    <span>
      ₹{Math.round(displayValue).toLocaleString('en-IN')}
    </span>
  )
}

export default function EconomicImpactCard({ economicImpact }) {
  const shouldReduceMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(false)

  if (!economicImpact) return null

  const {
    crop_value_at_stake = 0,
    expected_loss_if_untreated = 0,
    treatment_cost = null,
    net_benefit = null,
    recommendation = 'Monitor Only',
    calculation_basis = '',
    expected_yield_kg_per_acre = null,
    market_price_per_kg = null,
    market_price_source = 'Agmarknet',
    treatment_effectiveness_pct = 0.75,
    cost_source_note = null,
  } = economicImpact

  const hasCostData = treatment_cost !== null && treatment_cost !== undefined

  // Compute value protected = expected_loss_if_untreated * effectiveness
  const valueProtected = hasCostData
    ? Math.round(expected_loss_if_untreated * (treatment_effectiveness_pct || 0.75))
    : 0

  // Total for proportional visual comparison bar
  const totalScale = Math.max(1, (treatment_cost || 0) + valueProtected)
  const costPct = hasCostData ? Math.min(100, Math.max(8, Math.round(((treatment_cost || 0) / totalScale) * 100))) : 0
  const valuePct = hasCostData ? Math.min(100, Math.max(8, 100 - costPct)) : 0

  // ── Color Schemes per Recommendation ──────────────────────────────────────
  const recommendationStyles = {
    'Treat Now': {
      container: 'bg-red-50/80 border-red-200 text-red-950',
      badge: 'bg-red-600 text-white border-red-700 shadow-xs',
      badgeDot: 'bg-red-200 animate-ping',
      tag: 'Urgent Action Justified',
      headline: 'Treat Now — Strong Economic Payoff',
      description: 'The prevented crop loss significantly exceeds treatment expenses. Treating now protects your field revenue.',
      icon: AlertOctagon,
      benefitColor: 'text-emerald-700',
    },
    'Treat Soon': {
      container: 'bg-amber-50/80 border-amber-200 text-amber-950',
      badge: 'bg-amber-500 text-white border-amber-600 shadow-xs',
      badgeDot: 'bg-amber-200 animate-pulse',
      tag: 'Economically Viable',
      headline: 'Treat Soon — Positive Net Benefit',
      description: 'Treatment yields a positive net return. Schedule spray within the recommended weather window.',
      icon: Clock,
      benefitColor: 'text-emerald-700',
    },
    'Monitor Only': {
      container: 'bg-blue-50/80 border-blue-200 text-blue-950',
      badge: 'bg-blue-600 text-white border-blue-700 shadow-xs',
      badgeDot: 'bg-blue-200',
      tag: 'Hold Intervention',
      headline: 'Monitor Only — Cost Exceeds Risk',
      description: hasCostData
        ? 'Current pest loss is below the economic injury threshold. Spraying now costs more than the potential loss.'
        : 'Treatment cost data is not yet cataloged for this pest. Monitor fields closely.',
      icon: ShieldCheck,
      benefitColor: 'text-stone-700',
    },
    'No Action Needed': {
      container: 'bg-emerald-50/80 border-emerald-200 text-emerald-950',
      badge: 'bg-emerald-600 text-white border-emerald-700 shadow-xs',
      badgeDot: 'bg-emerald-200',
      tag: 'Crop Safe',
      headline: 'No Action Needed — Optimal Economics',
      description: 'Microclimate risk is low and crops are healthy. No chemical or bio intervention required.',
      icon: CheckCircle2,
      benefitColor: 'text-emerald-700',
    },
  }

  const currentStyle = recommendationStyles[recommendation] || recommendationStyles['Monitor Only']
  const RecIcon = currentStyle.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: 'easeOut' }}
      className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5 relative overflow-hidden"
    >
      {/* Background Accent Gradient */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-amber-500/5 via-emerald-500/5 to-transparent rounded-full pointer-events-none blur-2xl" />

      {/* Header Pill & Patent Badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 text-xs font-black rounded-full border border-amber-200">
          <IndianRupee size={13} className="text-amber-700" />
          <span>ECONOMIC IMPACT ADVISOR · ₹ DECISION OPTIMIZATION</span>
        </div>

        <span className="text-[11px] font-bold text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-md">
          Dual Optimization Layer
        </span>
      </div>

      {/* Hero Recommendation Banner */}
      <div className={clsx('p-4 rounded-2xl border transition-all', currentStyle.container)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-xs border border-stone-200/60 mt-0.5">
              <RecIcon size={22} className={clsx(
                recommendation === 'Treat Now' ? 'text-red-600' :
                recommendation === 'Treat Soon' ? 'text-amber-600' :
                recommendation === 'No Action Needed' ? 'text-emerald-600' : 'text-blue-600'
              )} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border', currentStyle.badge)}>
                  <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', currentStyle.badgeDot)} />
                  {recommendation}
                </span>
                <span className="text-[11px] font-bold opacity-75">{currentStyle.tag}</span>
              </div>
              <h4 className="text-base font-bold text-stone-900 mt-1">{currentStyle.headline}</h4>
              <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">{currentStyle.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Financial Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Crop Value at Stake */}
        <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-left space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            Crop Value / Acre
          </span>
          <div className="text-lg font-black text-stone-900">
            <AnimatedRupee value={crop_value_at_stake} />
          </div>
          <span className="text-[10px] text-stone-500 block truncate">
            {expected_yield_kg_per_acre ? `${Math.round(expected_yield_kg_per_acre)} kg @ ₹${market_price_per_kg}/kg` : 'Yield prediction'}
          </span>
        </div>

        {/* Metric 2: Expected Loss */}
        <div className="p-3.5 bg-red-50/60 rounded-2xl border border-red-200 text-left space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 block">
            Loss If Untreated
          </span>
          <div className="text-lg font-black text-red-950">
            <AnimatedRupee value={expected_loss_if_untreated} />
          </div>
          <span className="text-[10px] text-red-600 block">
            Potential pest damage
          </span>
        </div>

        {/* Metric 3: Treatment Cost */}
        <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200 text-left space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
            Treatment Cost
          </span>
          <div className="text-lg font-black text-amber-950">
            {hasCostData ? <AnimatedRupee value={treatment_cost} /> : <span className="text-sm font-semibold text-stone-400">N/A</span>}
          </div>
          <span className="text-[10px] text-amber-700 block truncate">
            {hasCostData ? 'Input + labor / acre' : 'No advisory cost'}
          </span>
        </div>

        {/* Metric 4: Net Benefit */}
        <div className={clsx(
          'p-3.5 rounded-2xl border text-left space-y-1',
          net_benefit && net_benefit > 0 ? 'bg-emerald-50/80 border-emerald-300' : 'bg-stone-50 border-stone-200'
        )}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
            Net Benefit
          </span>
          <div className="text-lg font-black text-emerald-950">
            {hasCostData && net_benefit !== null ? (
              <AnimatedRupee value={net_benefit} />
            ) : (
              <span className="text-sm font-semibold text-stone-400">—</span>
            )}
          </div>
          <span className="text-[10px] text-emerald-700 block truncate">
            {hasCostData && net_benefit && net_benefit > 0 ? 'Net savings in pocket' : 'Cost threshold'}
          </span>
        </div>
      </div>

      {/* Visual Proportional Comparison Bar (Lower-Literacy Friendly) */}
      {hasCostData && (
        <div className="p-4 bg-stone-50/90 rounded-2xl border border-stone-200 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-stone-800 flex items-center gap-1.5">
              <Scale size={14} className="text-amber-600" />
              <span>Investment vs Value Protected:</span>
            </span>
            <span className="text-[11px] text-stone-500 font-medium">
              ₹{treatment_cost?.toLocaleString('en-IN')} vs ₹{valueProtected.toLocaleString('en-IN')}
            </span>
          </div>

          {/* Dual Segment Progress Bar */}
          <div className="w-full h-3 rounded-full bg-stone-200 overflow-hidden flex shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${costPct}%` }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.6, ease: 'easeOut' }}
              className="bg-amber-500 h-full relative group cursor-pointer"
              title={`Treatment Cost: ₹${treatment_cost}`}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${valuePct}%` }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.6, ease: 'easeOut', delay: shouldReduceMotion ? 0 : 0.1 }}
              className="bg-emerald-600 h-full relative group cursor-pointer"
              title={`Protected Crop Value: ₹${valueProtected}`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <span>Cost to Treat: ₹{treatment_cost?.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
              <span>Value Protected: ₹{valueProtected.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Partial Data Notice if Treatment Cost Missing */}
      {!hasCostData && (
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
          <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Treatment cost data is not yet cataloged in the advisory database for this pest species.
            Estimated risk loss is shown above honestly without fabricating a treatment cost.
          </p>
        </div>
      )}

      {/* Progressive Disclosure: Tap to Expand Calculation Basis */}
      <div className="border-t border-stone-100 pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-xs font-bold text-stone-700 hover:text-stone-900 p-2 rounded-xl hover:bg-stone-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <HelpCircle size={14} className="text-emerald-600" />
            <span>How was this ₹ decision calculated? (Transparent Methodology)</span>
          </div>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden text-xs text-stone-600 mt-2 space-y-2.5 px-3 py-2 bg-stone-50 rounded-2xl border border-stone-200"
            >
              <p className="leading-relaxed italic text-stone-700">
                "{calculation_basis}"
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-stone-200/80 text-[11px]">
                <div>
                  <span className="font-bold text-stone-700 block">Mandi Price Benchmark:</span>
                  <span>{market_price_source} ({market_price_per_kg ? `₹${market_price_per_kg}/kg` : 'Modal'})</span>
                </div>
                <div>
                  <span className="font-bold text-stone-700 block">Input Cost Reference:</span>
                  <span>{cost_source_note || 'TNAU Crop Protection Guide 2024'}</span>
                </div>
                <div>
                  <span className="font-bold text-stone-700 block">Expected Yield Estimate:</span>
                  <span>{expected_yield_kg_per_acre ? `${Math.round(expected_yield_kg_per_acre)} kg/acre` : 'Yield Regressor'}</span>
                </div>
                <div>
                  <span className="font-bold text-stone-700 block">Treatment Efficacy Factor:</span>
                  <span>{Math.round((treatment_effectiveness_pct || 0.75) * 100)}% potential loss prevented</span>
                </div>
              </div>

              <p className="text-[10px] text-stone-400 pt-1">
                *Note: Damage fractions and treatment efficacy are model assumptions derived from TNAU & ICAR extension studies.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
