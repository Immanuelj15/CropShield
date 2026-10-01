import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Users, MapPin, FlaskConical, BookOpen, Bell, ShieldCheck, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const show = (v) => (v === null || v === undefined || v === '' ? '—' : Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-IN') : v)

const fmtMetric = (v) => {
  if (v === null || v === undefined || v === '') return 'Not available'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n <= 1 ? `${(n * 100).toFixed(1)}%` : String(n)
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAnalytics(await apiFetch('/admin/analytics'))
    } catch (e) {
      setError(e.message || 'Could not load analytics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !analytics) return <div className="card p-5"><LoadingState message="Loading analytics…" /></div>
  if (error && !analytics) return <div className="card p-5"><ErrorState message={error} onRetry={load} /></div>
  if (!analytics) return null

  const bench = analytics.model_performance_benchmarks || {}
  const summary = analytics.platform_summary || {}
  const feedback = analytics.retraining_feedback_status || {}
  const simulatedSections = Array.isArray(analytics.simulated_sections) ? analytics.simulated_sections : []
  // Older payloads may flag `simulated` without listing sections: treat the vulnerability list as simulated then.
  const vulnSimulated = simulatedSections.includes('vulnerability_by_district') || (analytics.simulated && simulatedSections.length === 0)
  const vulnerability = Array.isArray(analytics.vulnerability_by_district) ? analytics.vulnerability_by_district : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-stone-800">Platform analytics</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh analytics"
          className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Registered users" value={show(summary.total_registered_users)} />
        <StatCard icon={MapPin} label="Registered farms" value={show(summary.total_registered_farms)} />
        <StatCard icon={FlaskConical} accent="amber" label="Treatments logged" value={show(summary.total_treatments_logged)} />
        <StatCard icon={BookOpen} accent="sky" label="Knowledge advisories" value={show(summary.total_knowledge_advisories)} />
        <StatCard icon={Bell} accent="red" label="Alerts dispatched" value={show(summary.total_geospatial_alerts_dispatched)} />
        <StatCard icon={BarChart3} accent="sky" label="Model accuracy (test)" value={fmtMetric(bench.test_accuracy)} trend={bench.model_version || bench.pest_warning_model || 'Pest-risk model'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800 flex flex-wrap items-center gap-2">
            District vulnerability <DemoDataBadge show={vulnSimulated} />
          </h3>
          {vulnSimulated && (
            <p className="text-xs text-amber-800">Farm counts are real; risk labels and threats are static examples, not live predictions.</p>
          )}
          {vulnerability.length === 0 ? (
            <EmptyState icon={MapPin} title="No districts" message="Register farms to see district coverage." />
          ) : (
            <ul className="space-y-3">
              {vulnerability.map((v, i) => (
                <li key={`${v.district}-${i}`} className="flex items-center justify-between gap-2 p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-stone-900">{v.district}</span>
                    <span className="text-xs text-stone-500 block">{v.dominant_threat} · {show(v.farm_count)} farms</span>
                  </div>
                  <Badge status={v.risk_level}>{v.risk_level}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">Model benchmark metrics</h3>
          <dl className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5 text-sm">
            {bench.available === false && (
              <p className="text-amber-800">{bench.message || 'Model metrics are not available.'}</p>
            )}
            {[
              ['Pest-risk model', `${bench.pest_warning_model || '—'}${bench.model_version ? ` (${bench.model_version})` : ''}`],
              ['Test F1 (weighted / macro)', `${fmtMetric(bench.test_f1_weighted)} / ${fmtMetric(bench.test_f1_macro)}`],
              ['AUC-ROC (one-vs-rest)', fmtMetric(bench.auc_roc)],
              ['Majority-class baseline', fmtMetric(bench.majority_class_baseline_accuracy)],
              ['Calibration method', bench.calibration_method || 'Not available'],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-2 py-1 border-b border-stone-200">
                <dt className="text-stone-600">{k}</dt>
                <dd className="font-semibold text-stone-900 text-right">{v}</dd>
              </div>
            ))}
            <div className="py-1">
              <dt className="text-stone-600">Yield model</dt>
              <dd className="font-medium text-stone-800">{bench.yield_model || 'Not available'}</dd>
            </div>
          </dl>
          {bench.label_source && <p className="text-xs text-stone-500">Labels: {bench.label_source}</p>}
        </div>

        <div className="card p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">Expert feedback loop</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={ShieldCheck} accent="brand" label="Verified samples" value={show(feedback.agronomist_verified_samples)} />
            <StatCard accent="amber" label="Awaiting review" value={show(feedback.pending_in_queue)} />
          </div>
          <p className="text-sm text-stone-600">
            Last real model training: <strong className="text-stone-800">{feedback.last_retrain_date || 'not recorded'}</strong>
          </p>
          <p className="text-xs text-stone-500">Retraining runs offline; admin retrain requests are simulated.</p>
        </div>
      </div>
    </div>
  )
}

export const analyticsMeta = { icon: BarChart3, label: 'Platform Analytics' }
