import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Info, X, BarChart3, CheckCircle2, HelpCircle } from 'lucide-react';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * ConfidenceBadge — Compact badge showing the model's confidence in the reported risk level.
 * Clicking opens an info sheet. `calibrationMethod` is "platt" (fitted Platt scaling) or
 * "analytic-fallback" (fixed, uncalibrated mapping) as returned by POST /predict-today.
 */
export function ConfidenceBadge({ calibratedConfidence, confidenceBand, rawConfidence, calibrationMethod }) {
  const [showSheet, setShowSheet] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  if (!isNum(calibratedConfidence)) {
    return null;
  }

  const pct = Math.round(calibratedConfidence * 100);
  const isPlatt = calibrationMethod ? calibrationMethod === 'platt' : true;

  // Badge colour by confidence band (High = success, Moderate = info, Low = warning)
  let badgeCls = 'bg-green-100 text-green-900 border-green-300';
  let BadgeIcon = ShieldCheck;
  if (confidenceBand === 'Low') {
    badgeCls = 'bg-amber-100 text-amber-950 border-amber-300';
    BadgeIcon = ShieldAlert;
  } else if (confidenceBand === 'Moderate') {
    badgeCls = 'bg-sky-100 text-sky-950 border-sky-300';
  }

  return (
    <>
      <motion.button
        type="button"
        whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
        onClick={() => setShowSheet(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${badgeCls}`}
        title="Show confidence details"
        aria-haspopup="dialog"
      >
        <BadgeIcon size={14} aria-hidden="true" />
        <span>{pct}% Confidence{isPlatt ? '' : ' (uncalibrated)'}</span>
        <Info size={12} className="opacity-70" aria-hidden="true" />
      </motion.button>

      <AnimatePresence>
        {showSheet && (
          <ConfidenceInfoSheet
            calibratedConfidence={calibratedConfidence}
            rawConfidence={rawConfidence}
            confidenceBand={confidenceBand}
            isPlatt={isPlatt}
            onClose={() => setShowSheet(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}


/**
 * ConfidenceInfoSheet — Bottom sheet explaining the confidence number to farmers
 */
function ConfidenceInfoSheet({ calibratedConfidence, rawConfidence, confidenceBand, isPlatt, onClose }) {
  const pct = Math.round((calibratedConfidence || 0) * 100);
  const hasRaw = isNum(rawConfidence);
  const rawPct = hasRaw ? Math.round(rawConfidence * 100) : null;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Band styling
  let bandColor = 'text-green-800 bg-green-50 border-green-200';
  let bandLabel = 'High Reliability';
  let bandDescription = 'This prediction is well supported by the model and can guide your field decisions. Still scout your field before spraying.';

  if (confidenceBand === 'Low') {
    bandColor = 'text-amber-800 bg-amber-50 border-amber-200';
    bandLabel = 'Needs Agronomist Review';
    bandDescription = 'This prediction has lower confidence. We recommend an agronomist\'s field assessment before acting on it.';
  } else if (confidenceBand === 'Moderate') {
    bandColor = 'text-sky-800 bg-sky-50 border-sky-200';
    bandLabel = 'Acceptable Reliability';
    bandDescription = 'This prediction is reasonably confident. Proceed with standard monitoring practices.';
  }

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confidence-sheet-title"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Sheet */}
      <motion.div
        className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl border border-stone-200"
        initial={{ y: 200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 200, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
      >
        {/* Pull bar (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 bg-stone-300 rounded-full" />
        </div>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-100">
                <BarChart3 size={20} aria-hidden="true" />
              </div>
              <div>
                <h3 id="confidence-sheet-title" className="font-bold text-stone-900 text-base">
                  Model Confidence Explained
                </h3>
                <p className="text-xs text-stone-500">
                  {isPlatt ? 'Platt-scaled calibrated probability' : 'Uncalibrated estimate (calibration unavailable)'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-xl hover:bg-stone-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X size={18} className="text-stone-500" />
            </button>
          </div>

          {/* Main confidence number */}
          <div className="text-center p-5 bg-gradient-to-br from-brand-50/80 to-stone-50 rounded-2xl border border-brand-100/60">
            <span className="text-5xl font-black text-stone-900 tracking-tight">
              {pct}%
            </span>
            <span className="text-sm font-bold text-stone-500 ml-1">Confidence</span>
            <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${bandColor}`}>
              <CheckCircle2 size={13} aria-hidden="true" />
              {bandLabel}
            </div>
          </div>

          {/* Farmer-friendly explanation */}
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-3">
            <div className="flex items-start gap-2.5">
              <HelpCircle size={16} className="text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  What does this mean?
                </p>
                <p className="text-xs text-stone-600 leading-relaxed mt-1">
                  {isPlatt ? (
                    <>
                      This is how sure the model is that today&apos;s risk level is <strong>correct</strong>:
                      about <strong>{pct}%</strong>. The number is <em>calibrated</em>, meaning it was adjusted on past seasons
                      so that it matches how often similar predictions agreed with the agronomic risk rules.
                    </>
                  ) : (
                    <>
                      The calibration file could not be used, so this <strong>{pct}%</strong> is a fixed conversion of the raw
                      risk score. Treat it as a rough indication only.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="text-xs text-stone-600 leading-relaxed">
              <p className="font-semibold text-stone-800 mb-1">
                {bandDescription}
              </p>
            </div>
          </div>

          {/* Raw vs Calibrated comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-stone-100 rounded-xl text-center border border-stone-200">
              <span className="text-xs text-stone-500 block font-medium uppercase tracking-wider">Raw Model Score</span>
              <span className="text-lg font-black text-stone-600">{hasRaw ? `${rawPct}%` : '—'}</span>
              <span className="text-xs text-stone-500 block">{hasRaw ? 'Before calibration' : 'Not available'}</span>
            </div>
            <div className="p-3 bg-brand-50 rounded-xl text-center border border-brand-200">
              <span className="text-xs text-brand-700 block font-medium uppercase tracking-wider">{isPlatt ? 'Calibrated' : 'Displayed'}</span>
              <span className="text-lg font-black text-brand-800">{pct}%</span>
              <span className="text-xs text-brand-700 block">{isPlatt ? 'Adjusted to past accuracy' : 'Uncalibrated'}</span>
            </div>
          </div>

          {/* Methodology summary */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80">
            <p className="text-xs text-stone-500 leading-relaxed">
              <strong className="text-stone-700">Methodology:</strong>{' '}
              {isPlatt
                ? 'Platt scaling (sigmoid calibration) fitted on held-out seasons (2019–2021) and checked on unseen seasons (2022–2024). '
                : 'Platt calibration was not available for this prediction, so a fixed sigmoid of the raw score is shown. '}
              Training labels are rule-derived weather-suitability classes, not observed outbreaks, so confidence reflects
              agreement with those rules.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ConfidenceBadge;
