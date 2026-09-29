import { useState, useEffect, useRef } from 'react'
import { FileText } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import { apiFetch, isAbortError } from '../../utils/http'

export default function AgronomistReports() {
  const [report, setReport] = useState(null)
  const [reportRange, setReportRange] = useState('weekly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // P2-8: switching range quickly must not let an older response overwrite the newer one
  const reqRef = useRef({ id: 0, controller: null })

  const fetchRegionalReport = async (rangeVal) => {
    reqRef.current.controller?.abort()
    const controller = new AbortController()
    const requestId = reqRef.current.id + 1
    reqRef.current = { id: requestId, controller }
    const isCurrent = () => reqRef.current.id === requestId

    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const data = await apiFetch(`/reports/regional?range=${encodeURIComponent(rangeVal)}`, { signal: controller.signal })
      if (isCurrent()) setReport(data)
    } catch (e) {
      if (isAbortError(e) || !isCurrent()) return
      console.error(e)
      setError(e.message || 'Could not load the report.')
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  useEffect(() => {
    fetchRegionalReport('weekly')
    return () => reqRef.current.controller?.abort()
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            Regional Pest Activity Reports
            <DemoDataBadge show={!!report?.simulated} />
          </h2>
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
      {error && !loading && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

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
