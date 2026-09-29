import { useState, useEffect } from 'react'
import { Activity, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'

import { apiFetch } from '../../utils/http'

export default function AdminApiHealth() {
  const [apiStatus, setApiStatus] = useState(null)
  const [runningIngestion, setRunningIngestion] = useState(false)
  const [ingestionMsg, setIngestionMsg] = useState(null)
  const [showFailures, setShowFailures] = useState(false)

  const [loadError, setLoadError] = useState(null)

  const fetchApiStatus = async () => {
    setLoadError(null)
    try {
      setApiStatus(await apiFetch('/admin/api-status'))
    } catch (e) {
      console.error(e)
      setLoadError(e.message || 'Could not load API status.')
    }
  }

  useEffect(() => { fetchApiStatus() }, [])

  const handleRunIngestionNow = async () => {
    if (runningIngestion) return
    setRunningIngestion(true)
    setIngestionMsg(null)
    try {
      const data = await apiFetch('/admin/jobs/run-ingestion-now', { method: 'POST' })
      setIngestionMsg({ type: 'success', text: data?.message || 'Ingestion started.' })
      fetchApiStatus()
    } catch (err) {
      if (err.status === 409) {
        // Backend job lock: another ingestion run (scheduled, retry sweep or another admin) is active
        setIngestionMsg({ type: 'info', text: 'An ingestion run is already in progress. Please wait for it to finish and check the job log.' })
      } else {
        setIngestionMsg({ type: 'error', text: err.message || 'Ingestion failed' })
      }
    } finally {
      setRunningIngestion(false)
    }
  }

  if (loadError && !apiStatus) return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl text-center p-6">{loadError}</p>
  if (!apiStatus) return <p className="text-sm text-stone-400 text-center py-12">Loading API status…</p>

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <span className="text-[11px] font-bold text-violet-700 uppercase tracking-wider">External Climate Service Health</span>
            <h2 className="text-xl font-bold text-stone-900 mt-1">{apiStatus.external_service}</h2>
            <p className="text-xs text-stone-500 mt-0.5">Monitors external REST API connectivity (pure software, no physical sensor hardware).</p>
          </div>
          <span className="px-3.5 py-1.5 bg-green-100 text-green-800 rounded-full text-xs font-extrabold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-600"></span> {apiStatus.status.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
            <span className="text-xs text-stone-500 block">Ping Latency</span>
            <span className="text-2xl font-black text-stone-900">{apiStatus.latency_ms} ms</span>
            <span className="text-[11px] text-stone-400 block mt-1">Live HTTP Ping</span>
          </div>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
            <span className="text-xs text-stone-500 block">Uptime SLA</span>
            <span className="text-2xl font-black text-green-700">{apiStatus.uptime_percentage}</span>
            <span className="text-[11px] text-stone-400 block mt-1">Last 90 Days</span>
          </div>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
            <span className="text-xs text-stone-500 block">Resolution</span>
            <span className="text-sm font-bold text-stone-900 mt-2 block">{apiStatus.spatial_resolution}</span>
          </div>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
            <span className="text-xs text-stone-500 block">Temporal Window</span>
            <span className="text-sm font-bold text-stone-900 mt-2 block">{apiStatus.temporal_coverage}</span>
          </div>
        </div>

        <div className="p-4 bg-stone-100 rounded-2xl border border-stone-200 text-xs text-stone-700">
          <strong>Architecture Note:</strong> {apiStatus.monitoring_mode}. Replaces legacy hardware sensor polling with cloud-native satellite climate reanalysis.
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <span className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Automated Daily Climate Ingestion (All 38 Districts)</span>
            <h3 className="text-xl font-bold text-stone-900 mt-1">APScheduler 5:00 AM IST Overnight Batch Pipeline</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Pre-computes risk vectors and weather snapshots so morning warnings are instant for Tamil Nadu farmers.
            </p>
          </div>

          <button
            onClick={handleRunIngestionNow}
            disabled={runningIngestion}
            className="btn-primary py-2.5 px-4 text-xs flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            <RefreshCw size={14} className={runningIngestion ? 'animate-spin' : ''} />
            {runningIngestion ? 'Running Ingestion...' : 'Run Ingestion Now'}
          </button>
        </div>

        {ingestionMsg && (
          <div className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 ${
            ingestionMsg.type === 'success' ? 'bg-green-50 text-green-900 border border-green-200' : ingestionMsg.type === 'info' ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-red-50 text-red-900 border border-red-200'
          }`}>
            {ingestionMsg.type === 'success' ? <CheckCircle2 size={16} className="text-green-600" /> : <AlertTriangle size={16} className={ingestionMsg.type === 'info' ? 'text-amber-600' : 'text-red-600'} />}
            <span>{ingestionMsg.text}</span>
          </div>
        )}

        {apiStatus.last_job_run ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                <span className="text-xs text-stone-500 block">Last Run Status</span>
                <span className={`text-xl font-black block mt-0.5 uppercase ${apiStatus.last_job_run.status === 'success' ? 'text-green-700' : 'text-amber-700'}`}>
                  {apiStatus.last_job_run.status}
                </span>
                <span className="text-[10px] text-stone-400">{apiStatus.last_job_run.is_manual ? 'Manual Trigger' : 'Scheduled 5:00 AM'}</span>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                <span className="text-xs text-stone-500 block">Farms Processed</span>
                <span className="text-xl font-black text-stone-900 block mt-0.5">
                  {apiStatus.last_job_run.success_count} / {apiStatus.last_job_run.farms_processed}
                </span>
                <span className="text-[10px] text-green-600 font-bold">Successfully Scored</span>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                <span className="text-xs text-stone-500 block">Pipeline Duration</span>
                <span className="text-xl font-black text-stone-900 block mt-0.5">{apiStatus.last_job_run.duration_seconds}s</span>
                <span className="text-[10px] text-stone-400">Execution Time</span>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                <span className="text-xs text-stone-500 block">Failed / Retries</span>
                <span className={`text-xl font-black block mt-0.5 ${apiStatus.last_job_run.failed_count > 0 ? 'text-red-600' : 'text-stone-700'}`}>
                  {apiStatus.last_job_run.failed_count} Failed
                </span>
                <span className="text-[10px] text-stone-400">{apiStatus.pending_retries_count || 0} In Retry Queue</span>
              </div>
            </div>

            <div className="text-xs text-stone-500 flex items-center justify-between px-1">
              <span>Last executed: <strong>{new Date(apiStatus.last_job_run.run_at).toLocaleString()}</strong></span>
              {apiStatus.last_job_run.failed_count > 0 && (
                <button onClick={() => setShowFailures(!showFailures)} className="text-xs text-red-600 hover:text-red-800 font-semibold underline">
                  {showFailures ? 'Hide Failed Farm Details' : `Show ${apiStatus.last_job_run.failed_count} Failed Items`}
                </button>
              )}
            </div>

            {showFailures && apiStatus.last_job_run.failures?.length > 0 && (
              <div className="p-4 bg-red-50/70 border border-red-200 rounded-2xl space-y-2 text-xs">
                <h5 className="font-bold text-red-900">Failed Ingestion Items (Queued for Hourly Retry):</h5>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {apiStatus.last_job_run.failures.map((f, idx) => (
                    <div key={idx} className="p-2 bg-white rounded-lg border border-red-100 flex justify-between items-center text-[11px]">
                      <span className="font-semibold text-stone-800">{f.farm_name || f.farm_id} ({f.district})</span>
                      <span className="text-red-700 font-mono truncate max-w-xs">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 bg-stone-50 border border-dashed border-stone-300 rounded-2xl text-center text-xs text-stone-500 space-y-1">
            <p className="font-semibold text-stone-700">No Ingestion Run Recorded Yet</p>
            <p>Click "Run Ingestion Now" to initialize risk evaluation across all 38 districts.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const apiHealthMeta = { icon: Activity, label: 'External API Health' }
