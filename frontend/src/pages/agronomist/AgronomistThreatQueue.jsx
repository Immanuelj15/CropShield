import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw, CheckCircle2, X, ArrowRight, Info } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const SEVERITIES = ['Low', 'Medium', 'High']
const DECISION_PAST = { confirm: 'confirmed', override: 'overridden' }

const pct = (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100)}%` : '—')

export default function AgronomistThreatQueue() {
  const toast = useToast()
  const [threatQueue, setThreatQueue] = useState([])
  const [selectedThreat, setSelectedThreat] = useState(null)
  const [verifyDecision, setVerifyDecision] = useState('confirm')
  const [overrideSeverity, setOverrideSeverity] = useState('Medium')
  const [overridePest, setOverridePest] = useState('')
  const [verifyNotes, setVerifyNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [isSimulated, setIsSimulated] = useState(false) // demo queue: cases cannot be verified (backend 404s)

  const selectedId = selectedThreat?.log_id
  // Reset the verification form whenever a different case is selected
  useEffect(() => {
    setVerifyDecision('confirm')
    setOverrideSeverity(SEVERITIES.includes(selectedThreat?.ai_risk_level) ? selectedThreat.ai_risk_level : 'Medium')
    setOverridePest(selectedThreat?.detected_pest || '')
    setVerifyNotes('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const fetchThreatQueue = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch('/detect/pending')
      const items = Array.isArray(data?.items) ? data.items : []
      setIsSimulated(!!data?.simulated)
      setThreatQueue(items)
      // Keep the selection only if it is still in the queue; otherwise pick the first item
      setSelectedThreat((prev) => (prev && items.find((i) => i.log_id === prev.log_id)) || items[0] || null)
    } catch (e) {
      setThreatQueue([])
      setSelectedThreat(null)
      setLoadError(e.message || 'Could not load the threat queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchThreatQueue() }, [fetchThreatQueue])

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!selectedThreat || verifying || isSimulated) return
    if (verifyDecision === 'override' && !verifyNotes.trim()) {
      toast.error('Please add a field note explaining why you are overriding the AI diagnosis.')
      return
    }
    const target = selectedThreat
    setVerifying(true)
    try {
      await apiFetch(`/detect/${encodeURIComponent(target.log_id)}/verify`, {
        method: 'POST',
        json: {
          decision: verifyDecision,
          confirmed_pest: verifyDecision === 'override' ? (overridePest.trim() || target.detected_pest) : target.detected_pest,
          severity: verifyDecision === 'override'
            ? overrideSeverity
            : (SEVERITIES.includes(target.ai_risk_level) ? target.ai_risk_level : undefined),
          notes: verifyNotes.trim() || `Verified by regional expert in ${target.district || 'the field'}.`,
        },
      })
      toast.success(`Case ${DECISION_PAST[verifyDecision]}. Audit trail recorded and added to the retraining queue.`)
      setVerifyNotes('')
      // Drop the verified case locally so it can't be verified twice while the queue reloads
      setThreatQueue((prev) => prev.filter((i) => i.log_id !== target.log_id))
      setSelectedThreat(null)
      await fetchThreatQueue()
    } catch (err) {
      if (err.status === 409) {
        toast.error('This case was already verified by another expert. Refreshing the queue.')
        fetchThreatQueue()
      } else {
        toast.error(err.message || 'Verification failed. Please try again.')
      }
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-4">
      {isSimulated && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>
            There are no real unverified predictions right now, so example cases are shown. Demo cases cannot be verified.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 card p-5 space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-stone-800 flex flex-wrap items-center gap-2">
                Unverified threats <DemoDataBadge show={isSimulated} />
              </h3>
              <p className="text-xs text-stone-500">AI-flagged cases awaiting agronomist confirmation</p>
            </div>
            <button
              type="button"
              onClick={fetchThreatQueue}
              disabled={loading}
              aria-label="Refresh threat queue"
              className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50 shrink-0', FOCUS)}
            >
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </button>
          </div>

          {loading && threatQueue.length === 0 ? (
            <LoadingState message="Loading threat queue…" />
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={fetchThreatQueue} />
          ) : threatQueue.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Queue clear" message="No unverified threat cases right now." />
          ) : (
            <div className="space-y-3">
              {threatQueue.map((item) => {
                const isSelected = selectedThreat?.log_id === item.log_id
                return (
                  <button
                    key={item.log_id}
                    type="button"
                    onClick={() => setSelectedThreat(item)}
                    aria-pressed={isSelected}
                    className={clsx(
                      'w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-2',
                      FOCUS,
                      isSelected
                        ? 'border-brand-600 bg-brand-50 shadow-sm'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <span className="font-bold text-sm text-stone-900 min-w-0 break-words">{item.detected_pest}</span>
                      <Badge status={item.ai_risk_level}>{item.ai_risk_level} risk</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                      <span className="min-w-0 truncate">{item.farm_name} ({item.district})</span>
                      <span className="font-bold text-stone-700 shrink-0">Risk {pct(item.ai_risk_score)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 card p-5 sm:p-6 space-y-6 min-w-0">
          {selectedThreat ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-stone-100">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Expert verification docket</span>
                  <h2 className="text-xl font-bold text-stone-900 mt-1 break-words">{selectedThreat.detected_pest}</h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Plot: {selectedThreat.farm_name} · Crop: {selectedThreat.crop_type} · Date: {selectedThreat.date}
                  </p>
                </div>
                <div className="flex gap-4 sm:text-right shrink-0">
                  <div>
                    <span className="text-2xl font-bold text-stone-900 block">{pct(selectedThreat.ai_risk_score)}</span>
                    <span className="text-xs text-stone-500 block">AI risk score</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-stone-900 block">{pct(selectedThreat.ai_confidence)}</span>
                    <span className="text-xs text-stone-500 block">Pest confidence</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-sm space-y-1">
                <span className="font-bold text-stone-600 uppercase tracking-wider block text-xs">AI satellite & climate evidence</span>
                <p className="text-stone-800">{selectedThreat.evidence_snippet || 'No evidence summary available.'}</p>
              </div>

              <form onSubmit={handleVerify} className="space-y-4 pt-2">
                <fieldset>
                  <legend className="label">Agronomist action</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setVerifyDecision('confirm')}
                      aria-pressed={verifyDecision === 'confirm'}
                      className={clsx(
                        'p-3.5 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all',
                        FOCUS,
                        verifyDecision === 'confirm'
                          ? 'bg-green-600 text-white border-green-600 shadow-sm'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      )}
                    >
                      <CheckCircle2 size={16} /> Confirm AI diagnosis
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerifyDecision('override')}
                      aria-pressed={verifyDecision === 'override'}
                      className={clsx(
                        'p-3.5 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all',
                        FOCUS,
                        verifyDecision === 'override'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      )}
                    >
                      <X size={16} /> Override / adjust level
                    </button>
                  </div>
                </fieldset>

                {verifyDecision === 'override' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="override-pest" className="label">Corrected pest / disease</label>
                      <input
                        id="override-pest"
                        type="text"
                        maxLength={200}
                        value={overridePest}
                        onChange={(e) => setOverridePest(e.target.value)}
                        className="input-field text-sm py-2.5"
                      />
                    </div>
                    <div>
                      <label htmlFor="override-severity" className="label">Corrected risk level</label>
                      <select
                        id="override-severity"
                        value={overrideSeverity}
                        onChange={(e) => setOverrideSeverity(e.target.value)}
                        className="input-field text-sm py-2.5"
                      >
                        {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="verify-notes" className="label">
                    Field notes & observations{verifyDecision === 'override' && <span className="text-red-600"> *</span>}
                  </label>
                  <textarea
                    id="verify-notes"
                    rows={3}
                    maxLength={2000}
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    placeholder="Field scouting observations, symptom confirmation, or reasons for override…"
                    className="input-field text-sm resize-none"
                  />
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-stone-500">
                    {isSimulated ? 'Demo cases cannot be verified.' : 'Attributed to your agronomist account.'}
                  </span>
                  <Button
                    type="submit"
                    loading={verifying}
                    disabled={isSimulated}
                    title={isSimulated ? 'Demo cases cannot be verified' : undefined}
                    className={FOCUS}
                  >
                    {verifying ? 'Submitting…' : 'Submit verification'}
                    {!verifying && <ArrowRight size={14} />}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <EmptyState
              icon={AlertTriangle}
              title="No case selected"
              message="Select a threat case from the list to review and verify it."
            />
          )}
        </div>
      </div>
    </div>
  )
}

export const threatQueueMeta = { icon: AlertTriangle, label: 'Active Threat Queue' }
