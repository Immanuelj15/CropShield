import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import Badge from '../../components/ui/Badge'

const API_BASE = '/api/v1'

export default function AgronomistGrid() {
  const [riskGrid, setRiskGrid] = useState(null)
  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/outbreak/regional-grid`, { headers: authHeaders })
        if (res.ok) setRiskGrid(await res.json())
      } catch (e) { console.error(e) }
    })()
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Regional 5km Community Risk Grid</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Automated Haversine clustering of high and medium risk cases across Tamil Nadu agro-climatic zones.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {riskGrid?.clusters?.map(c => (
          <div key={c.cluster_id} className="p-5 rounded-2xl border border-stone-200 bg-stone-50 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">{c.district}</span>
                <h4 className="font-bold text-stone-900 text-sm">{c.center_name}</h4>
              </div>
              <Badge status={c.risk_level}>{c.risk_level}</Badge>
            </div>

            <div className="text-xs space-y-1 text-stone-600">
              <p><strong>Primary Threat:</strong> {c.dominant_threat}</p>
              <p><strong>Monitored Farms:</strong> {c.active_farms} plots within 5.0 km</p>
              <p><strong>Average Risk:</strong> {Math.round(c.average_risk_score * 100)}%</p>
            </div>

            <div className="pt-2 border-t border-stone-200 text-[11px] font-bold text-green-700">
              ✓ {c.alert_status}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const gridMeta = { icon: MapPin, label: 'Regional 5km Risk Grid' }
