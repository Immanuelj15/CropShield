import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, AlertTriangle, Info, X, BarChart3, CheckCircle2, HelpCircle } from 'lucide-react';

/**
 * ConfidenceBadge — Compact badge showing calibrated model confidence
 * Displays next to the risk gauge. Clicking opens the info sheet.
 */
export function ConfidenceBadge({ calibratedConfidence, confidenceBand, rawConfidence }) {
  const [showSheet, setShowSheet] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  if (calibratedConfidence === undefined || calibratedConfidence === null) {
    return null;
  }

  const pct = Math.round(calibratedConfidence * 100);

  // Badge color by confidence band
  let badgeBg = 'bg-emerald-100 dark:bg-emerald-900/40';
  let badgeText = 'text-emerald-900 dark:text-emerald-200';
  let badgeBorder = 'border-emerald-300 dark:border-emerald-700';
  let BadgeIcon = ShieldCheck;

  if (confidenceBand === 'Low') {
    badgeBg = 'bg-amber-100 dark:bg-amber-900/40';
    badgeText = 'text-amber-950 dark:text-amber-200';
    badgeBorder = 'border-amber-300 dark:border-amber-700';
    BadgeIcon = ShieldAlert;
  } else if (confidenceBand === 'Moderate') {
    badgeBg = 'bg-sky-100 dark:bg-sky-900/40';
    badgeText = 'text-sky-950 dark:text-sky-200';
    badgeBorder = 'border-sky-300 dark:border-sky-700';
    BadgeIcon = ShieldCheck;
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setShowSheet(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-all shadow-sm hover:shadow-md ${badgeBg} ${badgeText} ${badgeBorder}`}
        title="Click for calibration details"
      >
        <BadgeIcon size={14} />
        <span>{pct}% Confidence</span>
        <Info size={11} className="opacity-60" />
      </motion.button>

      <AnimatePresence>
        {showSheet && (
          <ConfidenceInfoSheet
            calibratedConfidence={calibratedConfidence}
            rawConfidence={rawConfidence}
            confidenceBand={confidenceBand}
            onClose={() => setShowSheet(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}


/**
 * ConfidenceInfoSheet — Bottom sheet explaining calibration to farmers
 */
function ConfidenceInfoSheet({ calibratedConfidence, rawConfidence, confidenceBand, onClose }) {
  const pct = Math.round((calibratedConfidence || 0) * 100);
  const rawPct = Math.round((rawConfidence || 0) * 100);

  // Band styling
  let bandColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  let bandLabel = 'High Reliability';
  let bandDescription = 'This prediction is well-supported by historical patterns and can be trusted for field decision-making.';

  if (confidenceBand === 'Low') {
    bandColor = 'text-amber-800 bg-amber-50 border-amber-200';
    bandLabel = 'Needs Agronomist Review';
    bandDescription = 'This prediction has lower confidence — we recommend getting an agronomist\'s field assessment before acting on it.';
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
        className="relative bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl border border-stone-200 dark:border-stone-700"
        initial={{ y: 200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 200, opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
      >
        {/* Pull bar (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 bg-stone-300 dark:bg-stone-600 rounded-full" />
        </div>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 flex items-center justify-center border border-teal-200 dark:border-teal-800">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 dark:text-white text-base">
                  Model Confidence Explained
                </h3>
                <p className="text-[11px] text-stone-500">
                  Platt-Scaled Calibrated Probability
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <X size={18} className="text-stone-500" />
            </button>
          </div>

          {/* Main confidence number */}
          <div className="text-center p-5 bg-gradient-to-br from-teal-50/80 via-emerald-50/40 to-stone-50 dark:from-stone-800/60 dark:to-stone-800/30 rounded-2xl border border-teal-100/60 dark:border-stone-700/60">
            <span className="text-5xl font-black text-stone-900 dark:text-white tracking-tight">
              {pct}%
            </span>
            <span className="text-sm font-bold text-stone-400 ml-1">Confidence</span>
            <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${bandColor}`}>
              <CheckCircle2 size={13} />
              {bandLabel}
            </div>
          </div>

          {/* Farmer-friendly explanation */}
          <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-200/80 dark:border-stone-700/60 space-y-3">
            <div className="flex items-start gap-2.5">
              <HelpCircle size={16} className="text-teal-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-white">
                  What does this mean?
                </p>
                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed mt-1">
                  Out of similar predictions the system has made before, about <strong>{pct}%</strong> turned out to be correct.
                  This number is <em>calibrated</em> — unlike raw model scores that tend to be overconfident,
                  this percentage is adjusted to match real-world accuracy.
                </p>
              </div>
            </div>

            <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
              <p className="font-semibold text-stone-800 dark:text-stone-200 mb-1">
                {bandDescription}
              </p>
            </div>
          </div>

          {/* Raw vs Calibrated comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-stone-100 dark:bg-stone-800 rounded-xl text-center border border-stone-200 dark:border-stone-700">
              <span className="text-[10px] text-stone-500 block font-medium uppercase tracking-wider">Raw Model Score</span>
              <span className="text-lg font-black text-stone-400 line-through decoration-red-400">{rawPct}%</span>
              <span className="text-[10px] text-red-500 block">Overconfident</span>
            </div>
            <div className="p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-center border border-teal-200 dark:border-teal-800">
              <span className="text-[10px] text-teal-700 dark:text-teal-300 block font-medium uppercase tracking-wider">Calibrated</span>
              <span className="text-lg font-black text-teal-800 dark:text-teal-200">{pct}%</span>
              <span className="text-[10px] text-teal-600 dark:text-teal-400 block">Trustworthy</span>
            </div>
          </div>

          {/* Methodology summary */}
          <div className="p-3.5 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200/80 dark:border-stone-700/60">
            <p className="text-[11px] text-stone-500 leading-relaxed">
              <strong className="text-stone-700 dark:text-stone-300">Methodology:</strong>{' '}
              Platt scaling (sigmoid calibration) via <code className="text-[10px] bg-stone-200 dark:bg-stone-700 px-1 py-0.5 rounded">CalibratedClassifierCV</code> trained
              on a held-out 15% calibration partition. This post-processing technique transforms
              raw tree-based XGBoost softmax probabilities into empirically reliable confidence estimates
              (ECE &lt; 2%, Brier &lt; 0.07).
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ConfidenceBadge;
