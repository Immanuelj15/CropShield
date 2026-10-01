import { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'
import Button from '../../components/ui/Button'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

const fmtDateTime = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

// status from backend: "operational" | "degraded" | "operational (cached)" (= ping failed, no live latency)
function statusStyle(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'operational') return { cls: 'bg-green-100 text-green-800', dot: 'bg-green-600', label: 'Operational' }
  if (s.includes('cached')) return { cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', label: 'Unreachable (cached)' }
  if (s === 'degraded') return { cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', label: 'Degraded' }
  return { cls: 'bg-stone-100 text-stone-700', dot: 'bg-stone-500', label: status || 'Unknown' }
}

function Tile({ label, value, sub, valueCls = 'text-stone-900' }) {
  return (
    <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 min-w-0">
      <span className="text-xs text-stone-500 block">{label}</span>
      <span className={clsx('text-xl font-bold block mt-0.5 break-words', valueCls)}>{value}</span>
      {sub && <span className="text-xs text-stone-500 block mt-1">{sub}</span>}
    </div>
  )
}

export default function AdminApiHealth() {
  const [apiStatus, setApiStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [runningIngestion, setRunningIngestion] = useState(false)
  const [ingestionMsg, setIngestionMsg] = useState(null)
  const [showFailures, setShowFailures] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const fetchApiStatus = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setApiStatus(await apiFetch('/admin/api-status'))
    } catch (e) {
      setLoadError(e.message || 'Could not load API status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchApiStatus() }, [fetchApiStatus])

  const handleRunIngestionNow = async () => {
    if (runningIngestion) return
    setRunningIngestion(true)
    setIngestionMsg(null)
    try {
      const data = await apiFetch('/admin/jobs/run-ingestion-now', { method: 'POST' })
      setIngestionMsg({ type: 'success', text: data?.message || 'Ingestion completed.' })
      fetchApiStatus()
    } catch (err) {
      if (err.status === 409) {
        // Backend job lock: another ingestion run (scheduled, retry sweep or another admin) is active
        setIngestionMsg({ type: 'info', text: 'An ingestion run is already in progress. Wait for it to finish, then refresh the job log.' })
      } else {
        setIngestionMsg({ type: 'error', text: err.message || 'Ingestion failed.' })
      }
    } finally {
      setRunningIngestion(false)
    }
  }

  if (loading && !apiStatus) return <div className="card p-5"><LoadingState message="Checking NASA POWER status…" /></div>
  if (loadError && !apiStatus) return <div className="card p-5"><ErrorState message={loadError} onRetry={fetchApiStatus} /></div>
  if (!apiStatus) return null

  const st = statusStyle(apiStatus.status)
  const pingFailed = String(apiStatus.status || '').toLowerCase().includes('cached')
  const job = apiStatus.last_job_run
  const failures = Array.isArray(job?.failures) ? job.failures : []

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="min-w-0">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">External climate service</span>
            <h2 className="text-xl font-bold text-stone-900 mt-1">{apiStatus.external_service || 'NASA POWER'}</h2>
            <p className="text-sm text-stone-600 mt-0.5">Live connectivity check to {apiStatus.service_url || 'the NASA POWER REST API'}.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={clsx('px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5', st.cls)}>
              <span className={clsx('w-2 h-2 rounded-full', st.dot)} /> {st.label}
            </span>
            <button type="button" onClick={fetchApiStatus} disabled={loading} aria-label="Re-check API status"
              className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}>
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile
            label="Ping latency"
            value={pingFailed ? '—' : `${apiStatus.latency_ms ?? '—'} ms`}
            sub={pingFailed ? 'Live ping failed' : 'Live HTTP ping'}
          />
          <Tile
            label="Retry queue"
            value={apiStatus.pending_retries_count ?? 0}
            sub="Farms waiting for an hourly retry"
            valueCls={apiStatus.pending_retries_count > 0 ? 'text-amber-700' : 'text-stone-900'}
          />
          <Tile label="Resolution" value={<span className="text-sm">{apiStatus.spatial_resolution || '—'}</span>} />
          <Tile label="Temporal coverage" value={<span className="text-sm">{apiStatus.temporal_coverage || '—'}</span>} />
        </div>

        <p className="text-xs text-stone-500">Checked {fmtDateTime(apiStatus.last_sync_timestamp)}.</p>
      </div>

      <div className="card p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="min-w-0">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Daily climate ingestion</span>
            <h3 className="text-lg font-semibold text-stone-800 mt-1">Overnight batch pipeline (05:00 IST)</h3>
            <p className="text-sm text-stone-600 mt-0.5">
              Pre-computes weather snapshots and risk for every registered farm so morning warnings load instantly.
            </p>
          </div>
          <Button type="button" icon={RefreshCw} loading={runningIngestion} onClick={handleRunIngestionNow} className={clsx('shrink-0', FOCUS)}>
            {runningIngestion ? 'Running ingestion…' : 'Run ingestion now'}
          </Button>
        </div>

        {ingestionMsg && (
          <div role="status" className={clsx('p-3.5 rounded-2xl text-sm flex items-start gap-2 border',
            ingestionMsg.type === 'success' ? 'bg-green-50 text-green-900 border-green-200'
              : ingestionMsg.type === 'info' ? 'bg-sky-50 text-sky-900 border-sky-200'
                : 'bg-red-50 text-red-900 border-red-200')}>
            {ingestionMsg.type === 'success' ? <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
              : ingestionMsg.type === 'info' ? <Info size={16} className="text-sky-600 shrink-0 mt-0.5" />
                : <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />}
            <span>{ingestionMsg.text}</span>
          </div>
        )}

        {job ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile
                label="Last run status"
                value={<span className="uppercase">{job.status || '—'}</span>}
                valueCls={job.status === 'success' ? 'text-green-700' : 'text-amber-700'}
                sub={job.is_manual ? 'Manual trigger' : 'Scheduled run'}
              />
              <Tile label="Farms scored" value={`${job.success_count ?? 0} / ${job.farms_processed ?? 0}`} sub="Succeeded / processed" />
              <Tile label="Duration" value={job.duration_seconds !== null && job.duration_seconds !== undefined ? `${job.duration_seconds}s` : '—'} sub="Execution time" />
              <Tile
                label="Failed"
                value={job.failed_count ?? 0}
                valueCls={job.failed_count > 0 ? 'text-red-600' : 'text-stone-900'}
                sub={`${apiStatus.pending_retries_count || 0} in retry queue`}
              />
            </div>

            <div className="text-sm text-stone-600 flex flex-wrap items-center justify-between gap-2">
              <span>Last executed: <strong>{fmtDateTime(job.run_at)}</strong></span>
              {job.failed_count > 0 && failures.length > 0 && (
                <button type="button" onClick={() => setShowFailures(!showFailures)} aria-expanded={showFailures}
                  className={clsx('text-sm text-red-700 hover:text-red-800 font-semibold underline rounded', FOCUS)}>
                  {showFailures ? 'Hide failed farms' : `Show ${job.failed_count} failed farms`}
                </button>
              )}
            </div>

            {showFailures && failures.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2 text-sm">
                <h5 className="font-semibold text-red-900">Failed farms (queued for hourly retry)</h5>
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {failures.map((f, idx) => (
                    <li key={`${f.farm_id || idx}`} className="p-2 bg-white rounded-lg border border-red-100 flex flex-col sm:flex-row sm:justify-between gap-1 text-xs">
                      <span className="font-semibold text-stone-800">{f.farm_name || f.farm_id}{f.district ? ` (${f.district})` : ''}</span>
                      <span className="text-red-700 font-mono break-all sm:text-right">{f.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 bg-stone-50 border border-dashed border-stone-300 rounded-2xl text-center text-sm text-stone-600 space-y-1">
            <p className="font-semibold text-stone-800">No ingestion run recorded yet</p>
            <p>Use “Run ingestion now” to score every registered farm.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const apiHealthMeta = { icon: Activity, label: 'External API Health' }
