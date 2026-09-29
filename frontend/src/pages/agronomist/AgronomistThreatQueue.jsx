import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, CheckCircle2, X, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'

import { apiFetch } from '../../utils/http'
import DemoDataBadge from '../../components/ui/DemoDataBadge'

export default function AgronomistThreatQueue() {
  const toast = useToast()
  const [threatQueue, setThreatQueue] = useState([])
  const [selectedThreat, setSelectedThreat] = useState(null)
  const [verifyDecision, setVerifyDecision] = useState('confirm')
  const [verifyNotes, setVerifyNotes] = useState('')

  const [verifying, setVerifying] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [isSimulated, setIsSimulated] = useState(false) // demo queue: cases cannot be verified (backend 404s)

  useEffect(() => { fetchThreatQueue() }, [])

  const fetchThreatQueue = async () => {
    setLoadError(null)
    try {
      const data = await apiFetch('/detect/pending')
      const items = data?.items || []
      setIsSimulated(!!data?.simulated)
      setThreatQueue(items)
      // P2-10: keep the selection only if it is still in the queue; clear it when the queue is empty
      setSelectedThreat((prev) => {
        if (prev && items.some((i) => i.log_id === prev.log_id)) return items.find((i) => i.log_id === prev.log_id)
        return items[0] || null
      })
    } catch (e) {
      console.error(e)
      setThreatQueue([])
      setSelectedThreat(null)
      setLoadError(e.message || 'Could not load the threat queue.')
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!selectedThreat || verifying) return
    const target = selectedThreat
    setVerifying(true)
    try {
      await apiFetch(`/detect/${encodeURIComponent(target.log_id)}/verify`, {
        method: 'POST',
        json: {
          decision: verifyDecision,
          confirmed_pest: target.detected_pest,
          severity: verifyDecision === 'confirm' ? target.ai_risk_level : 'Medium',
          notes: verifyNotes || `Verified by regional expert in ${target.district}.`
        },
      })
      toast.success(`Threat case ${verifyDecision}ed successfully. Audit trail and retraining queue recorded.`)
      setVerifyNotes('')
      // Drop the verified case locally so it can't be verified twice while the queue reloads
      setThreatQueue((prev) => prev.filter((i) => i.log_id !== target.log_id))
      setSelectedThreat(null)
      await fetchThreatQueue()
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">Unverified Threats <DemoDataBadge show={isSimulated} /></h3>
            <p className="text-xs text-stone-500">AI-flagged cases awaiting agronomist confirmation</p>
          </div>
          <button onClick={fetchThreatQueue} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="space-y-3">
          {threatQueue.map(item => {
            const isSelected = selectedThreat?.log_id === item.log_id
            return (
              <button
                key={item.log_id}
                onClick={() => setSelectedThreat(item)}
                className={clsx(
                  'w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-2',
                  isSelected
                    ? 'border-sky-600 bg-sky-50/70 shadow-sm ring-2 ring-sky-500/20'
                    : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                )}
              >
                <div className="flex items-start justify-between w-full">
                  <span className="font-bold text-sm text-stone-900">{item.detected_pest}</span>
                  <Badge status={item.ai_risk_level}>{item.ai_risk_level} Risk</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>{item.farm_name} ({item.district})</span>
                  <span className="font-bold text-stone-700">AI: {Math.round(item.ai_risk_score * 100)}%</span>
                </div>
              </button>
            )
          })}
          {loadError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{loadError}</p>
          )}
          {threatQueue.length === 0 && !loadError && (
            <EmptyState icon={AlertTriangle} title="Queue clear" message="No unverified threat cases in queue." />
          )}
        </div>
      </div>

      <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
        {selectedThreat ? (
          <>
            <div className="flex items-start justify-between pb-4 border-b border-stone-100">
              <div>
                <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Expert Verification Docket</span>
                <h2 className="text-xl font-bold text-stone-900 mt-1">{selectedThreat.detected_pest}</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Plot: {selectedThreat.farm_name} · Crop: {selectedThreat.crop_type} · Date: {selectedThreat.date}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-stone-900">{Math.round(selectedThreat.ai_risk_score * 100)}%</span>
                <span className="text-[11px] text-stone-400 block">AI Confidence</span>
              </div>
            </div>

            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs space-y-1">
              <span className="font-bold text-stone-700 uppercase tracking-wider block text-[10px]">AI Satellite & Climate Evidence</span>
              <p className="text-stone-800">{selectedThreat.evidence_snippet}</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">Agronomist Action</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVerifyDecision('confirm')}
                    className={clsx(
                      'p-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                      verifyDecision === 'confirm'
                        ? 'bg-green-600 text-white border-green-600 shadow-md'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    )}
                  >
                    <CheckCircle2 size={16} /> Confirm AI Diagnosis
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerifyDecision('override')}
                    className={clsx(
                      'p-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                      verifyDecision === 'override'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    )}
                  >
                    <X size={16} /> Override / Adjust Level
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">Expert Field Notes & Observations</label>
                <textarea
                  rows={3}
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Add specific field scouting observations, symptom confirmation, or reasons for override..."
                  className="w-full p-3 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-sky-500 outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <span className="text-[11px] text-stone-400">
                  Attribution: your agronomist account
                </span>
                <button
                  type="submit"
                  disabled={verifying || isSimulated}
                  title={isSimulated ? 'Demo cases cannot be verified' : undefined}
                  className="disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                >
                  <span>{verifying ? 'Submitting…' : 'Submit Verification Audit'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="p-16 text-center text-stone-400 text-xs">
            Select a threat case from the list on the left to review and verify.
          </div>
        )}
      </div>
    </div>
  )
}

export const threatQueueMeta = { icon: AlertTriangle, label: 'Active Threat Queue' }
