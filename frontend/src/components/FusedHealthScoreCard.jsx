import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Layers, ChevronDown, ChevronUp, CloudSun, Camera, Satellite, Sparkles, ShieldCheck } from 'lucide-react';

export default function FusedHealthScoreCard({ fusedData, loading = false }) {
  const [expanded, setExpanded] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-6 bg-stone-200 dark:bg-stone-800 rounded-xl w-3/4" />
        <div className="h-20 bg-stone-100 dark:bg-stone-800/60 rounded-2xl" />
      </div>
    );
  }

  if (!fusedData || fusedData.value === undefined) {
    return null;
  }

  const score = Math.round(fusedData.value);
  const grade = fusedData.health_grade || (score >= 70 ? 'Optimal' : score >= 45 ? 'Moderate' : 'Critical');
  const components = fusedData.components || {};
  const explanation = fusedData.explanation_text || 'Multi-modal health index combining satellite climate and vegetation health.';
  const signalsCount = fusedData.signals_count || 2;

  // Grade color theme
  let gradeBadgeColor = 'bg-emerald-100 text-emerald-950 border-emerald-300';
  let ringColor = 'text-emerald-600';
  if (score < 45) {
    gradeBadgeColor = 'bg-red-100 text-red-950 border-red-300';
    ringColor = 'text-red-600';
  } else if (score < 70) {
    gradeBadgeColor = 'bg-amber-100 text-amber-950 border-amber-300';
    ringColor = 'text-amber-600';
  }

  return (
    <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm space-y-4">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 flex items-center justify-center border border-teal-200 dark:border-teal-800">
            <Layers size={19} />
          </div>
          <div>
            <h3 className="font-bold text-stone-900 dark:text-white text-sm flex items-center gap-1.5">
              Multi-Modal Health Index
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold">
                3-Signal Fusion
              </span>
            </h3>
            <p className="text-[11px] text-stone-500">Climate + Leaf Vision + Satellite NDVI</p>
          </div>
        </div>

        <span className={`text-xs px-3 py-1 rounded-full font-bold border uppercase tracking-wider ${gradeBadgeColor}`}>
          {grade}
        </span>
      </div>

      {/* ── Score & Headline ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-teal-50/50 via-emerald-50/30 to-stone-50 dark:from-stone-800/50 dark:to-stone-800/20 rounded-2xl border border-teal-100/60 dark:border-stone-700/60">
        <div>
          <span className="text-xs text-stone-500 block font-medium">Fused Overall Score</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-4xl font-black text-stone-900 dark:text-white tracking-tight">{score}</span>
            <span className="text-sm font-bold text-stone-400">/ 100</span>
          </div>
        </div>

        {/* Signal Presence Chips */}
        <div className="text-right space-y-1">
          <span className="text-[11px] text-stone-500 block font-medium">Active Signals</span>
          <div className="flex items-center gap-1.5 justify-end">
            <span
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                components.climate_contribution ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-400'
              }`}
              title="Climate Weather Signal"
            >
              <CloudSun size={13} />
            </span>
            <span
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                components.ndvi_contribution ? 'bg-teal-100 text-teal-800' : 'bg-stone-100 text-stone-400'
              }`}
              title="Sentinel-2 Satellite NDVI"
            >
              <Satellite size={13} />
            </span>
            <span
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                components.image_contribution ? 'bg-indigo-100 text-indigo-800' : 'bg-stone-100 text-stone-400'
              }`}
              title="Leaf Image Diagnosis"
            >
              <Camera size={13} />
            </span>
          </div>
        </div>
      </div>

      {/* Explanation Text */}
      <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
        {explanation}
      </p>

      {/* ── Progressive Disclosure Accordion ─────────────────── */}
      <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-xs font-bold text-stone-700 dark:text-stone-300 hover:text-emerald-700 py-1 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-teal-600" />
            Signal Weight & Point Contributions ({signalsCount}/3 Active)
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-3 space-y-2 text-xs overflow-hidden"
            >
              {/* Climate Signal */}
              <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/80 dark:border-stone-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CloudSun size={16} className="text-amber-600" />
                  <div>
                    <span className="font-bold text-stone-900 dark:text-white block">Climate Risk Model</span>
                    <span className="text-[10px] text-stone-500">Base: 50% · Eff: {Math.round((components.climate_effective_weight || 0.5) * 100)}%</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-stone-900 dark:text-white">
                  +{components.climate_contribution || 0} pts
                </span>
              </div>

              {/* Satellite NDVI Signal */}
              <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/80 dark:border-stone-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Satellite size={16} className="text-teal-600" />
                  <div>
                    <span className="font-bold text-stone-900 dark:text-white block">Sentinel-2 NDVI Vegetation</span>
                    <span className="text-[10px] text-stone-500">Base: 20% · Eff: {Math.round((components.ndvi_effective_weight || 0.2) * 100)}%</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-stone-900 dark:text-white">
                  +{components.ndvi_contribution || 0} pts
                </span>
              </div>

              {/* Leaf Vision Image Signal */}
              <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/80 dark:border-stone-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera size={16} className="text-indigo-600" />
                  <div>
                    <span className="font-bold text-stone-900 dark:text-white block">Leaf Photo CNN Diagnosis</span>
                    <span className="text-[10px] text-stone-500">
                      {components.image_contribution ? `Base: 30% · Eff: ${Math.round((components.image_effective_weight || 0.3) * 100)}%` : 'No photo uploaded (weight redistributed)'}
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-stone-900 dark:text-white">
                  {components.image_contribution ? `+${components.image_contribution} pts` : '0 pts'}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
