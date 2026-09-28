import { Sparkles } from 'lucide-react'

// TODO(backend): no endpoint currently exposes real retraining-feedback-loop metrics
// (samples contributed, accuracy uplift, next scheduled run). These three figures are illustrative
// placeholders carried over from the pre-refactor dashboard, not live data — wire up a real endpoint
// before treating this tab as production telemetry.
export default function AgronomistFeedback() {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div className="border-b border-stone-100 pb-4">
        <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Closed-Loop Learning Architecture</span>
        <h2 className="text-xl font-bold text-stone-900 mt-1">Verification Feedback Loop Pipeline</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Every confirmed or overridden threat is signed, timestamped, and staged for scheduled model retraining.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-green-50 border border-green-200 rounded-2xl">
          <span className="text-xs text-green-800 font-bold block">Verified Ground Truth</span>
          <span className="text-2xl font-black text-green-950 mt-1 block">24 Samples</span>
          <p className="text-[11px] text-green-700 mt-1">Contributed to retraining queue</p>
        </div>
        <div className="p-5 bg-sky-50 border border-sky-200 rounded-2xl">
          <span className="text-xs text-sky-800 font-bold block">Model Accuracy Uplift</span>
          <span className="text-2xl font-black text-sky-950 mt-1 block">+0.47%</span>
          <p className="text-[11px] text-sky-700 mt-1">78.45% → 78.92% test accuracy</p>
        </div>
        <div className="p-5 bg-stone-50 border border-stone-200 rounded-2xl">
          <span className="text-xs text-stone-600 font-bold block">Next Retraining Run</span>
          <span className="text-2xl font-black text-stone-900 mt-1 block">Scheduled</span>
          <p className="text-[11px] text-stone-500 mt-1">Automatic nightly cron trigger</p>
        </div>
      </div>
    </div>
  )
}

export const feedbackMeta = { icon: Sparkles, label: 'Retraining Feedback Loop' }
