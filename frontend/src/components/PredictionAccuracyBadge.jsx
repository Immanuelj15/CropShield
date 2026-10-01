import React from 'react'
import { CheckCircle2, AlertTriangle, HelpCircle, TrendingUp, Info } from 'lucide-react'
import clsx from 'clsx'
import { formatRupee } from './ProfitRangeDisplay'

/**
 * PredictionAccuracyBadge Component
 * Displays whether actual seasonal net profit fell within the pre-season predicted range.
 */
export default function PredictionAccuracyBadge({
  accuracy,
  predictedRange,
  actualProfit,
  className = '',
  compact = false,
}) {
  if (!accuracy) {
    return (
      <div className={clsx("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-600 border border-stone-200", className)}>
        <HelpCircle size={14} className="text-stone-500" />
        <span>Pre-Season Baseline In Progress</span>
      </div>
    )
  }

  const isWithin = Boolean(accuracy.actual_within_predicted_range)
  // deviation_pct is null when the predicted midpoint is 0 (backend) — don't show a fake 0%
  const deviation = typeof accuracy.deviation_pct === 'number' ? `${accuracy.deviation_pct}%` : 'n/a'

  if (compact) {
    return (
      <span
        title={
          predictedRange
            ? `Predicted: ${formatRupee(predictedRange.min)} – ${formatRupee(predictedRange.max)} | Actual: ${formatRupee(actualProfit)} (${deviation} deviation)`
            : `Accuracy: ${deviation} deviation`
        }
        className={clsx(
          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
          isWithin
            ? "bg-green-100 text-green-800 border-green-300"
            : "bg-amber-100 text-amber-800 border-amber-300",
          className
        )}
      >
        {isWithin ? (
          <>
            <CheckCircle2 size={12} className="text-green-700" />
            <span>Within Predicted Band ({deviation} dev)</span>
          </>
        ) : (
          <>
            <AlertTriangle size={12} className="text-amber-700" />
            <span>Outside Predicted Band ({deviation} dev)</span>
          </>
        )}
      </span>
    )
  }

  return (
    <div
      className={clsx(
        "rounded-2xl border p-4 transition-all space-y-2",
        isWithin
          ? "bg-green-50/80 border-green-200 text-green-950"
          : "bg-amber-50/80 border-amber-200 text-amber-950",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isWithin ? (
            <div className="w-7 h-7 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 size={16} />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle size={16} />
            </div>
          )}
          <div>
            <h4 className="font-extrabold text-xs sm:text-sm">
              {isWithin ? "Actual Profit Within Predicted Range ✓" : "Actual Profit Deviated from Predicted Range"}
            </h4>
            <p className="text-[11px] opacity-75">
              {isWithin
                ? "AI Pre-Season Profit Range accurately bounded this season's financial outcome."
                : "Actual outcome fell outside the pre-season range (for example due to price swings or input costs)."}
            </p>
          </div>
        </div>

        <span
          className={clsx(
            "text-xs font-mono font-black px-2.5 py-1 rounded-xl border shrink-0",
            isWithin
              ? "bg-green-100 border-green-300 text-green-900"
              : "bg-amber-100 border-amber-300 text-amber-900"
          )}
        >
          {deviation} Dev
        </span>
      </div>

      {predictedRange && (
        <div className="flex flex-wrap items-center justify-between text-xs pt-1.5 border-t border-black/5 gap-2">
          <div className="flex items-center gap-1.5 text-stone-600">
            <span className="font-bold">Pre-Season Estimate:</span>
            <span className="font-mono font-semibold">
              {formatRupee(predictedRange.min)} – {formatRupee(predictedRange.max)}
            </span>
          </div>

          {actualProfit !== undefined && actualProfit !== null && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-stone-600">Actual Realized Profit:</span>
              <span className={clsx("font-mono font-extrabold", actualProfit >= 0 ? "text-green-700" : "text-red-700")}>
                {formatRupee(actualProfit)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
