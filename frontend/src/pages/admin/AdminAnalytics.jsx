import { useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'

const API_BASE = '/api/v1'

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null)
  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/analytics`, { headers: authHeaders })
        if (res.ok) setAnalytics(await res.json())
      } catch (e) { console.error(e) }
    })()
  }, [])

  if (!analytics) return <p className="text-sm text-stone-400 text-center py-12">Loading analytics…</p>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Registered Users" value={analytics.platform_summary?.total_registered_users} trend="Farmers, Agronomists, Admins" />
        <StatCard accent="brand" label="Active Farm Plots" value={analytics.platform_summary?.total_registered_farms} trend="GPS Mapped Boundaries" />
        <StatCard accent="violet" label="Treatments Logged" value={analytics.platform_summary?.total_treatments_logged} trend="Chemical & Bio-pesticides" />
        <StatCard accent="sky" label="Model Accuracy" value={analytics.model_performance_benchmarks?.accuracy} trend="XGBoost Multicrop v2.0" />
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
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">Model Architecture</span>
              <span className="font-bold text-stone-900">XGBoost Ensemble + Tree-SHAP</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">Cross-Validation F1</span>
              <span className="font-bold text-stone-900">{analytics.model_performance_benchmarks?.cv_f1_score}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-600">AUC-ROC (One-vs-Rest)</span>
              <span className="font-bold text-stone-900">{analytics.model_performance_benchmarks?.auc_roc}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-stone-600">Soil Yield Model (R²)</span>
              <span className="font-bold text-green-700">{analytics.model_performance_benchmarks?.yield_model_r2}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const analyticsMeta = { icon: BarChart3, label: 'Platform Analytics' }
