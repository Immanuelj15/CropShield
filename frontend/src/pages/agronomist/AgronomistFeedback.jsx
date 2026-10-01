import { useState, useEffect, useCallback } from 'react'
import { Sparkles, ShieldCheck, Database, Cpu, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import { apiFetch, getUser } from '../../utils/http'

// Real feedback-loop telemetry only:
//  - pending count: GET /detect/pending (agronomist + admin); flagged when the queue is a demo queue
//  - verified samples / last retrain: GET /admin/analytics (admin only, so shown only to admins)
// Retraining itself runs offline (POST /admin/models/retrain is simulated), so no accuracy uplift
// or schedule is claimed here.
export default function AgronomistFeedback() {
  const isAdmin = getUser()?.role === 'admin'
  const [pending, setPending] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [queue, analytics] = await Promise.all([
        apiFetch('/detect/pending?limit=100'),
        isAdmin ? apiFetch('/admin/analytics').catch(() => null) : Promise.resolve(null),
      ])
      setPending(queue)
      setFeedback(analytics?.retraining_feedback_status || null)
    } catch (e) {
      setError(e.message || 'Could not load feedback-loop status.')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  const demoQueue = !!pending?.simulated
  const pendingValue = loading ? '…' : pending ? (demoQueue ? 0 : (pending.total_pending ?? 0)) : '—'

  return (
    <div className="card p-5 sm:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-4">
        <div>
          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Closed-loop learning</span>
          <h2 className="text-xl font-bold text-stone-900 mt-1">Verification feedback loop</h2>
          <p className="text-sm text-stone-600 mt-0.5">
            Every confirmed or overridden threat is signed, timestamped and queued as a labelled sample for the next model retraining.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh feedback-loop status"
          className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
        </button>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={ShieldCheck}
          accent="amber"
          label="Awaiting verification"
          value={pendingValue}
          trend={demoQueue ? 'No real cases pending (demo queue shown)' : 'Real AI predictions in your queue'}
        />
        {isAdmin && feedback ? (
          <StatCard
            icon={Database}
            accent="brand"
            label="Expert-verified samples"
            value={feedback.agronomist_verified_samples ?? '—'}
            trend={`Last real model training: ${feedback.last_retrain_date || 'not recorded'}`}
          />
        ) : (
          <StatCard
            icon={Database}
            accent="brand"
            label="Expert-verified samples"
            value="—"
            trend="Platform-wide totals are visible to admins in Platform Analytics"
          />
        )}
        <StatCard
          icon={Cpu}
          accent="sky"
          label="Model retraining"
          value="Offline"
          trend="Run manually via the training pipeline; no automatic schedule"
        />
      </div>

      {demoQueue && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
          <DemoDataBadge /> The threat queue currently shows example cases, which are not counted.
        </div>
      )}

      <ol className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        {[
          ['1. AI flags', 'Daily job and farmer predictions create unverified warnings.'],
          ['2. Expert verifies', 'You confirm or override the diagnosis in the Threat Queue.'],
          ['3. Audit trail', 'The decision is stored with your name and a timestamp.'],
          ['4. Retraining queue', 'Verified cases are queued for the next offline training run.'],
        ].map(([title, text]) => (
          <li key={title} className="p-4 rounded-xl border border-stone-200 bg-stone-50">
            <span className="font-semibold text-stone-800 block">{title}</span>
            <span className="text-stone-600 text-xs">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export const feedbackMeta = { icon: Sparkles, label: 'Retraining Feedback Loop' }
