import { useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import { apiFetch } from '../../utils/http'

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        setAnalytics(await apiFetch('/admin/analytics'))
      } catch (e) {
        console.error(e)
        setError(e.message || 'Could not load analytics.')
      }
    })()
  }, [])

  const bench = analytics?.model_performance_benchmarks || {}
  const fmtMetric = (v) => {
    if (v === null || v === undefined || v === '') return 'Not available'
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v)
    return n <= 1 ? `${(n * 100).toFixed(1)}%` : String(n)
  }

  if (error) return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl text-center p-6">{error}</p>
  if (!analytics) return <p className="text-sm text-stone-400 text-center py-12">Loading analytics…</p>

  return (
    <div className="space-y-6">
      {analytics.simulated && (
        <div className="flex items-center gap-2 text-xs text-amber-900">
          <DemoDataBadge />
          <span>Some of these figures are simulated and not computed from real platform data.</span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Registered Users" value={analytics.platform_summary?.total_registered_users} trend="Farmers, Agronomists, Admins" />
        <StatCard accent="brand" label="Active Farm Plots" value={analytics.platform_summary?.total_registered_farms} trend="GPS Mapped Boundaries" />
        <StatCard accent="violet" label="Treatments Logged" value={analytics.platform_summary?.total_treatments_logged} trend="Chemical & Bio-pesticides" />
        <StatCard accent="sky" label="Model Accuracy (test)" value={fmtMetric(bench.test_accuracy)} trend={bench.model_version || bench.pest_warning_model || 'Pest-risk model'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">Zone Vulnerability Index</h3>
          <div className="space-y-3">
            {analytics.vulnerability_by_district?.map((v, i) => (
              <div key={i} className="flex items-center justify-between p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                <div>
                  <span className="font-bold text-sm text-stone-900">{v.district}</span>
                  <span className="text-xs text-stone-500 block">{v.dominant_threat} · {v.farm_count} Farms</span>
                </div>
                <Badge status={v.risk_level}>{v.risk_level}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wider">Model Benchmark Metrics</h3>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5 text-xs">
            {bench.available === false && (
              <p className="text-amber-800">{bench.message || 'Model metrics are not available.'}</p>
            )}
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">Pest-risk model</span>
              <span className="font-bold text-stone-900">{bench.pest_warning_model || '—'} {bench.model_version ? `(${bench.model_version})` : ''}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">Test F1 (weighted / macro)</span>
              <span className="font-bold text-stone-900">{fmtMetric(bench.test_f1_weighted)} / {fmtMetric(bench.test_f1_macro)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">AUC-ROC (One-vs-Rest)</span>
              <span className="font-bold text-stone-900">{fmtMetric(bench.auc_roc)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">Majority-class baseline</span>
              <span className="font-bold text-stone-900">{fmtMetric(bench.majority_class_baseline_accuracy)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">Calibration method</span>
              <span className="font-bold text-stone-900">{bench.calibration_method || 'Not available'}</span>
            </div>
            <div className="py-1">
              <span className="text-stone-600 block">Yield model</span>
              <span className="font-semibold text-stone-800">{bench.yield_model || 'Not available'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const analyticsMeta = { icon: BarChart3, label: 'Platform Analytics' }
