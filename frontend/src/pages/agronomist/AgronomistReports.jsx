import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText } from 'lucide-react'
import StatCard from '../../components/ui/StatCard'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import PillToggleGroup from '../../components/ui/PillToggleGroup'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch, isAbortError } from '../../utils/http'

const RANGES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const show = (v) => (v === null || v === undefined || v === '' ? '—' : v)

export default function AgronomistReports() {
  const [report, setReport] = useState(null)
  const [reportRange, setReportRange] = useState('weekly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Switching range quickly must not let an older response overwrite the newer one
  const reqRef = useRef({ id: 0, controller: null })

  const fetchRegionalReport = useCallback(async (rangeVal) => {
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
      setError(e.message || 'Could not load the report.')
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRegionalReport('weekly')
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => reqRef.current.controller?.abort()
  }, [fetchRegionalReport])

  const changeRange = (r) => {
    setReportRange(r)
    fetchRegionalReport(r)
  }

  const dominantPests = Array.isArray(report?.dominant_pests) ? report.dominant_pests : []

  return (
    <div className="card p-5 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-stone-900 flex flex-wrap items-center gap-2">
            Regional pest activity report
            <DemoDataBadge show={!!report?.simulated} />
          </h2>
          <p className="text-sm text-stone-600 mt-0.5">Summary for agricultural department briefings.</p>
        </div>
        <PillToggleGroup options={RANGES} value={reportRange} onChange={changeRange} size="sm" />
      </div>

      {report?.simulated && !loading && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          This report uses static example content. Figures are not computed from live platform data.
        </p>
      )}

      {loading ? (
        <LoadingState message="Generating report…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchRegionalReport(reportRange)} />
      ) : !report ? (
        <EmptyState icon={FileText} title="No report" message="Choose a range to generate a report." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
            <span>Report ID: <strong className="text-stone-700">{show(report.report_id)}</strong></span>
            <span>Region: <strong className="text-stone-700">{show(report.region)}</strong></span>
            <span>Generated: <strong className="text-stone-700">{report.generated_at ? new Date(report.generated_at).toLocaleString() : '—'}</strong></span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Monitored plots" value={show(report.summary?.total_farms_monitored)} />
            <StatCard accent="red" label="High-risk farms" value={show(report.summary?.farms_at_high_risk)} />
            <StatCard accent="brand" label="Expert verified" value={show(report.summary?.threats_verified_by_experts)} />
            <StatCard accent="amber" label="Override rate" value={show(report.summary?.threat_override_rate)} />
          </div>

          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
            <h4 className="text-sm font-semibold text-stone-800">Dominant regional pests</h4>
            {dominantPests.length === 0 ? (
              <p className="text-sm text-stone-500">No dominant pests reported.</p>
            ) : (
              <ul className="space-y-2">
                {dominantPests.map((p, i) => (
                  <li key={`${p.pest}-${i}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-stone-800"><strong>{p.pest}</strong> ({p.affected_crops})</span>
                    <span className="font-bold text-stone-900">{p.incidence} incidence</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {report.climatic_drivers && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl text-sm text-sky-900 space-y-1">
              <strong>Climatic drivers</strong>
              <p>{report.climatic_drivers}</p>
            </div>
          )}

          {report.recommended_policy_action && (
            <div className="p-4 bg-brand-50 border border-brand-100 rounded-2xl text-sm text-brand-800 space-y-1">
              <strong>Recommended extension action</strong>
              <p>{report.recommended_policy_action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const reportsMeta = { icon: FileText, label: 'Regional Reports' }
