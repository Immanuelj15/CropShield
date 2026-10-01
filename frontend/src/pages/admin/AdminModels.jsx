import { useState, useEffect, useCallback } from 'react'
import { Sparkles, RefreshCw, BarChart3, Info } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

export default function AdminModels() {
  const toast = useToast()
  const [modelLogs, setModelLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState(null)
  const [retraining, setRetraining] = useState(false)
  const [confirmRetrain, setConfirmRetrain] = useState(false)
  const [calibrationReport, setCalibrationReport] = useState(null)
  const [calibrationLoading, setCalibrationLoading] = useState(false)
  const [lastRetrain, setLastRetrain] = useState(null)

  const fetchModelStatus = useCallback(async () => {
    setLogsLoading(true)
    setLogsError(null)
    try {
      const data = await apiFetch('/admin/models/status')
      setModelLogs(Array.isArray(data) ? data : [])
    } catch (e) {
      setLogsError(e.message || 'Could not load model status.')
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => { fetchModelStatus() }, [fetchModelStatus])

  const fetchCalibrationReport = async () => {
    if (calibrationLoading) return
    setCalibrationLoading(true)
    try {
      setCalibrationReport(await apiFetch('/admin/model-calibration'))
    } catch (e) {
      toast.error(e.message || 'Could not load the calibration report.')
    } finally {
      setCalibrationLoading(false)
    }
  }

  const handleTriggerRetrain = async () => {
    setConfirmRetrain(false)
    if (retraining) return
    setRetraining(true)
    try {
      const data = await apiFetch('/admin/models/retrain', { method: 'POST' })
      setLastRetrain(data)
      // Show what the server actually reported (no invented accuracy numbers)
      toast.info(data?.simulated ? 'Retraining request recorded (simulated — no model was retrained).' : (data?.message || 'Retraining run completed.'))
      fetchModelStatus()
    } catch (e) {
      toast.error(e.message || 'Retraining request failed.')
    } finally {
      setRetraining(false)
    }
  }

  return (
    <div className="card p-5 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-stone-900 flex flex-wrap items-center gap-2">
            Model versions & retraining log
            <DemoDataBadge show={!!lastRetrain?.simulated || modelLogs.some((l) => l?.simulated)} />
          </h2>
          <p className="text-sm text-stone-600 mt-0.5">Audit log of retraining requests and expert-verified feedback samples.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={fetchModelStatus} disabled={logsLoading} aria-label="Refresh model log"
            className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}>
            <RefreshCw size={16} className={clsx(logsLoading && 'animate-spin')} />
          </button>
          <Button type="button" icon={Sparkles} loading={retraining} onClick={() => setConfirmRetrain(true)} className={FOCUS}>
            Request retraining
          </Button>
        </div>
      </div>

      {lastRetrain?.message && (
        <div role="status" className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <Info size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>{lastRetrain.message}</p>
            {lastRetrain.verified_feedback_samples_available !== undefined && (
              <p className="text-xs">Expert-verified samples available: <strong>{lastRetrain.verified_feedback_samples_available}</strong></p>
            )}
          </div>
        </div>
      )}

      {logsLoading && modelLogs.length === 0 ? (
        <LoadingState message="Loading model log…" />
      ) : logsError ? (
        <ErrorState message={logsError} onRetry={fetchModelStatus} />
      ) : modelLogs.length === 0 ? (
        <EmptyState icon={Sparkles} title="No retraining runs yet" message="Verified agronomist cases and retraining requests will appear here." />
      ) : (
        <ul className="space-y-3">
          {modelLogs.map((log) => (
            <li key={log.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-stone-900 flex flex-wrap items-center gap-2 min-w-0">
                  <span className="break-all">{log.model_name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 text-xs font-bold uppercase">{log.status || 'unknown'}</span>
                  <DemoDataBadge show={!!log.simulated} />
                </span>
                <span className="text-xs text-stone-500">{log.created_at ? new Date(log.created_at).toLocaleString() : ''}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
                <span>Accuracy: <strong>{typeof log.accuracy === 'number' ? `${Math.round(log.accuracy * 1000) / 10}%` : 'Not available'}</strong></span>
                <span>Dataset rows: <strong>{log.dataset_rows ?? '—'}</strong></span>
                <span>Verified feedback samples: <strong>{log.verified_samples_ingested ?? '—'}</strong></span>
              </div>
              {log.notes && <p className="text-xs text-stone-600 italic break-words">{log.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="pt-4 border-t border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-stone-800">Model confidence calibration</h3>
            <p className="text-sm text-stone-600 mt-0.5">Platt-scaling reliability: predicted confidence vs observed accuracy.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" icon={BarChart3} loading={calibrationLoading} onClick={fetchCalibrationReport} className={FOCUS}>
            {calibrationReport ? 'Reload report' : 'Load report'}
          </Button>
        </div>

        {calibrationReport?.available === false && (
          <p className="mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
            No calibration report is available on this server. {calibrationReport.explanation}
          </p>
        )}

        {calibrationReport && calibrationReport.available !== false ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-5 bg-stone-50 rounded-2xl border border-stone-200">
              <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-3">Reliability Diagram — High Risk Class</h4>
              <svg viewBox="0 0 320 320" className="w-full max-w-sm mx-auto">
                {[0.2, 0.4, 0.6, 0.8].map(v => (
                  <g key={v}>
                    <line x1={40} y1={280 - v * 240} x2={300} y2={280 - v * 240} stroke="#e7e5e4" strokeWidth="0.5" />
                    <line x1={40 + v * 260} y1={40} x2={40 + v * 260} y2={280} stroke="#e7e5e4" strokeWidth="0.5" />
                    <text x="32" y={284 - v * 240} fontSize="8" fill="#78716c" textAnchor="end">{(v * 100).toFixed(0)}%</text>
                    <text x={40 + v * 260} y="295" fontSize="8" fill="#78716c" textAnchor="middle">{(v * 100).toFixed(0)}%</text>
                  </g>
                ))}
                <text x="32" y="284" fontSize="8" fill="#78716c" textAnchor="end">0%</text>
                <text x="40" y="295" fontSize="8" fill="#78716c" textAnchor="middle">0%</text>
                <text x="300" y="295" fontSize="8" fill="#78716c" textAnchor="middle">100%</text>

                <line x1="40" y1="280" x2="300" y2="280" stroke="#44403c" strokeWidth="1" />
                <line x1="40" y1="40" x2="40" y2="280" stroke="#44403c" strokeWidth="1" />
                <line x1="40" y1="280" x2="300" y2="40" stroke="#44403c" strokeWidth="1" strokeDasharray="4,3" />
                <text x="240" y="95" fontSize="7" fill="#78716c" fontStyle="italic">Perfect (y = x)</text>

                {(() => {
                  const pred = calibrationReport.reliability_diagram?.mean_predicted_confidence || []
                  const actual = calibrationReport.reliability_diagram?.fraction_actually_correct || []
                  const points = pred.map((p, i) => ({ x: 40 + p * 260, y: 280 - (actual[i] || 0) * 240 }))
                  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`).join(' ')
                  return (
                    <>
                      <path d={pathD} fill="none" stroke="#0d5c2f" strokeWidth="2" />
                      {points.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="#0d5c2f" stroke="white" strokeWidth="1.5" />)}
                    </>
                  )
                })()}

                <text x="170" y="312" fontSize="9" fill="#44403c" textAnchor="middle" fontWeight="bold">Mean Predicted Confidence</text>
                <text x="12" y="160" fontSize="9" fill="#44403c" textAnchor="middle" fontWeight="bold" transform="rotate(-90, 12, 160)">Fraction Actually Correct</text>
              </svg>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm text-center">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">Expected Calibration Error</span>
                <span className="text-3xl font-black text-stone-900 block mt-1">{typeof calibrationReport.expected_calibration_error === 'number' ? `${(calibrationReport.expected_calibration_error * 100).toFixed(2)}%` : 'N/A'}</span>
                <span className="text-xs text-green-700 font-semibold block mt-1">Target: &lt; 5%</span>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm text-center">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">Brier Score Loss</span>
                <span className="text-3xl font-black text-stone-900 block mt-1">{typeof calibrationReport.brier_score === 'number' ? calibrationReport.brier_score.toFixed(4) : 'N/A'}</span>
                <span className="text-xs text-green-700 font-semibold block mt-1">Lower is better</span>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block text-center mb-2">Confidence Bands</span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between p-2 bg-green-50 rounded-lg border border-green-200">
                    <span className="font-bold text-green-900">High</span>
                    <span className="text-green-700 font-mono">{calibrationReport.confidence_bands?.High}</span>
                  </div>
                  <div className="flex justify-between p-2 bg-sky-50 rounded-lg border border-sky-200">
                    <span className="font-bold text-sky-900">Moderate</span>
                    <span className="text-sky-700 font-mono">{calibrationReport.confidence_bands?.Moderate}</span>
                  </div>
                  <div className="flex justify-between p-2 bg-amber-50 rounded-lg border border-amber-200">
                    <span className="font-bold text-amber-900">Low</span>
                    <span className="text-amber-700 font-mono">{calibrationReport.confidence_bands?.Low}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs text-stone-600 italic">
                {calibrationReport.explanation}
              </div>
            </div>
          </div>
        ) : !calibrationReport ? (
          <div className="p-5 bg-stone-50 border border-dashed border-stone-300 rounded-2xl text-center text-sm text-stone-600 space-y-1">
            <p className="font-semibold text-stone-700">Calibration report not loaded</p>
            <p>Use “Load report” to fetch the reliability metrics and calibration diagram.</p>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={confirmRetrain}
        onCancel={() => setConfirmRetrain(false)}
        onConfirm={handleTriggerRetrain}
        danger={false}
        title="Request model retraining?"
        message="Retraining is simulated in this deployment: a log entry is recorded but no model is retrained and accuracy does not change. Real retraining runs offline via the training pipeline."
        confirmLabel="Record request"
      />
    </div>
  )
}

export const modelsMeta = { icon: Sparkles, label: 'Model Retraining' }
