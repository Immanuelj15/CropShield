import { useEffect } from 'react'
import { Sliders } from 'lucide-react'

const API_BASE = '/api/v1'

// NOTE: preserved from the pre-refactor dashboard — this tab fetches `/admin/alert-thresholds`
// but has always rendered static illustrative values (0.65 / 0.35 / 5.0km) rather than the fetched
// response fields. Not changed here since fixing it would alter displayed values, which is a
// behavior change outside the scope of this presentational refactor.
export default function AdminThresholds() {
  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

  useEffect(() => {
    (async () => {
      try { await fetch(`${API_BASE}/admin/alert-thresholds`, { headers: authHeaders }) } catch (e) { console.error(e) }
    })()
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Alert Sensitivity & Escalation Configuration</h2>
        <p className="text-xs text-stone-500 mt-0.5">Control risk thresholds for automated alert dispatch.</p>
      </div>

      <div className="space-y-4 text-xs">
        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between">
          <div>
            <span className="font-bold text-stone-900 block">High Risk Threshold Score</span>
            <span className="text-stone-500">Triggers immediate SMS/push alert and agronomist verification queue</span>
          </div>
          <span className="text-base font-black text-red-600">0.65 (65%)</span>
        </div>

        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between">
          <div>
            <span className="font-bold text-stone-900 block">Medium Risk Threshold Score</span>
            <span className="text-stone-500">Prompts 24-hour field scouting notification</span>
          </div>
          <span className="text-base font-black text-amber-600">0.35 (35%)</span>
        </div>

        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between">
          <div>
            <span className="font-bold text-stone-900 block">Haversine Spatial Cluster Radius</span>
            <span className="text-stone-500">Broadcasts preemptive warnings to plots within this radius</span>
          </div>
          <span className="text-base font-black text-blue-600">5.0 Kilometers</span>
        </div>
      </div>
    </div>
  )
}

export const thresholdsMeta = { icon: Sliders, label: 'Alert Thresholds' }
