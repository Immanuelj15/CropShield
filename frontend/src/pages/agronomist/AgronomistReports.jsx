import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'

const API_BASE = '/api/v1'

export default function AgronomistReports() {
  const [report, setReport] = useState(null)
  const [reportRange, setReportRange] = useState('weekly')
  const [loading, setLoading] = useState(false)
  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  const fetchRegionalReport = async (rangeVal) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/reports/regional?range=${rangeVal}`, { headers: authHeaders })
      if (res.ok) setReport(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchRegionalReport('weekly') }, [])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Regional Pest Activity Reports</h2>
          <p className="text-xs text-stone-500 mt-0.5">One-click comprehensive reporting for agricultural department briefings.</p>
        </div>

        <div className="flex items-center gap-2">
          {['daily', 'weekly', 'monthly'].map(r => (
            <button
              key={r}
              onClick={() => { setReportRange(r); fetchRegionalReport(r) }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all',
                reportRange === r ? 'bg-sky-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-xs text-stone-400 text-center py-6">Loading report…</p>}

      {report && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Monitored Plots" value={report.summary?.total_farms_monitored} />
            <StatCard accent="red" label="High Risk Zones" value={report.summary?.farms_at_high_risk} />
            <StatCard accent="brand" label="Expert Verified" value={report.summary?.threats_verified_by_experts} />
            <StatCard label="Override Rate" value={report.summary?.threat_override_rate} />
          </div>

          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
            <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">Dominant Regional Pests</h4>
            <div className="space-y-2">
              {report.dominant_pests?.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-medium">
                  <span className="text-stone-800"><strong>{p.pest}</strong> ({p.affected_crops})</span>
                  <span className="font-bold text-stone-900">{p.incidence} Incidence</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-green-50 border border-green-200 rounded-2xl text-xs text-green-900 space-y-1">
            <strong>Recommended Extension Advisory Action:</strong>
            <p>{report.recommended_policy_action}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export const reportsMeta = { icon: FileText, label: 'Regional Reports' }
