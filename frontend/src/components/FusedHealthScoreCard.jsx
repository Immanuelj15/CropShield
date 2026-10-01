import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Layers, ChevronDown, ChevronUp, CloudSun, Camera, Satellite, Sparkles } from 'lucide-react';

const pctOf = (v, fallback) => Math.round((typeof v === 'number' && Number.isFinite(v) ? v : fallback) * 100);

/**
 * Multi-modal fused health score (backend fusion_service.compute_fused_health_score):
 * { value 0–100, health_grade, signals_count, signals_available[], components{…}, explanation_text }.
 * Backend grade cut-offs: ≥75 optimal, ≥45 moderate, else critical.
 */
export default function FusedHealthScoreCard({ fusedData, loading = false }) {
  const [expanded, setExpanded] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm animate-pulse space-y-4" aria-busy="true">
        <div className="h-6 bg-stone-200 rounded-xl w-3/4" />
        <div className="h-20 bg-stone-100 rounded-2xl" />
      </div>
    );
  }

  const rawValue = Number(fusedData?.value);
  if (!fusedData || !Number.isFinite(rawValue)) {
    return null;
  }

  const score = Math.round(rawValue);
  const grade = fusedData.health_grade || (score >= 75 ? 'Optimal' : score >= 45 ? 'Moderate' : 'Critical');
  const components = fusedData.components || {};
  const available = Array.isArray(fusedData.signals_available) ? fusedData.signals_available : null;
  const has = (key) => (available ? available.includes(key) : components[`${key}_contribution`] != null);
  const signalsCount = fusedData.signals_count ?? (available ? available.length : 1);
  const explanation = fusedData.explanation_text || 'Health index combining weather risk, satellite vegetation and leaf photo signals.';

  // Grade colour (matches backend cut-offs)
  let gradeBadgeColor = 'bg-green-100 text-green-900 border-green-300';
  if (score < 45) {
    gradeBadgeColor = 'bg-red-100 text-red-900 border-red-300';
  } else if (score < 75) {
    gradeBadgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
  }

  const chip = (active, activeCls) => `p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${active ? activeCls : 'bg-stone-100 text-stone-500'}`;

  return (
    <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-4">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-100 shrink-0">
            <Layers size={19} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-stone-900 text-sm flex flex-wrap items-center gap-1.5">
              Multi-Modal Health Index
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-semibold">
                {signalsCount}/3 signals
              </span>
            </h3>
            <p className="text-xs text-stone-500">Climate + Leaf Photo + Satellite NDVI</p>
          </div>
        </div>

        <span className={`text-xs px-3 py-1 rounded-full font-bold border ${gradeBadgeColor}`}>
          {grade}
        </span>
      </div>

      {/* ── Score & Headline ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-brand-50/60 to-stone-50 rounded-2xl border border-brand-100/60">
        <div>
          <span className="text-xs text-stone-500 block font-medium">Fused Overall Score</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-4xl font-black text-stone-900 tracking-tight">{score}</span>
            <span className="text-sm font-bold text-stone-500">/ 100</span>
          </div>
        </div>

        {/* Signal Presence Chips */}
        <div className="text-right space-y-1">
          <span className="text-xs text-stone-500 block font-medium">Active Signals</span>
          <div className="flex items-center gap-1.5 justify-end">
            <span className={chip(has('climate'), 'bg-green-100 text-green-800')} title="Weather (climate risk) signal" aria-label={`Weather signal ${has('climate') ? 'active' : 'missing'}`}>
              <CloudSun size={13} aria-hidden="true" />
            </span>
            <span className={chip(has('ndvi'), 'bg-brand-100 text-brand-800')} title="Sentinel-2 satellite NDVI" aria-label={`Satellite signal ${has('ndvi') ? 'active' : 'missing'}`}>
              <Satellite size={13} aria-hidden="true" />
            </span>
            <span className={chip(has('image'), 'bg-sky-100 text-sky-800')} title="Leaf photo diagnosis" aria-label={`Leaf photo signal ${has('image') ? 'active' : 'missing'}`}>
              <Camera size={13} aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>

      {/* Explanation Text */}
      <p className="text-xs text-stone-600 leading-relaxed">
        {explanation}
      </p>

      {/* ── Progressive Disclosure Accordion ─────────────────── */}
      <div className="pt-2 border-t border-stone-100">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-between gap-2 text-left text-xs font-bold text-stone-700 hover:text-brand-700 py-1 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-brand-600 shrink-0" aria-hidden="true" />
            Signal Weights & Point Contributions ({signalsCount}/3 Active)
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-3 space-y-2 text-xs overflow-hidden"
            >
              {/* Climate Signal */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CloudSun size={16} className="text-amber-600 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-bold text-stone-900 block">Climate Risk Model</span>
                    <span className="text-xs text-stone-500">Base: {pctOf(components.climate_base_weight, 0.5)}% · Effective: {pctOf(components.climate_effective_weight, 0.5)}%</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-stone-900 shrink-0">
                  +{components.climate_contribution ?? 0} pts
                </span>
              </div>

              {/* Satellite NDVI Signal */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Satellite size={16} className="text-brand-600 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-bold text-stone-900 block">Sentinel-2 NDVI Vegetation</span>
                    <span className="text-xs text-stone-500">
                      {has('ndvi')
                        ? `Base: ${pctOf(components.ndvi_base_weight, 0.2)}% · Effective: ${pctOf(components.ndvi_effective_weight, 0.2)}%`
                        : 'No satellite reading (weight redistributed)'}
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-stone-900 shrink-0">
                  {has('ndvi') ? `+${components.ndvi_contribution ?? 0} pts` : '0 pts'}
                </span>
              </div>

              {/* Leaf Photo Signal */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Camera size={16} className="text-sky-600 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-bold text-stone-900 block">Leaf Photo Diagnosis</span>
                    <span className="text-xs text-stone-500">
                      {has('image')
                        ? `Base: ${pctOf(components.image_base_weight, 0.3)}% · Effective: ${pctOf(components.image_effective_weight, 0.3)}%`
                        : 'No reliable leaf diagnosis yet (weight redistributed)'}
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-stone-900 shrink-0">
                  {has('image') ? `+${components.image_contribution ?? 0} pts` : '0 pts'}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
