import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, CheckCircle2, X, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'

const API_BASE = '/api/v1'

export default function AgronomistThreatQueue() {
  const toast = useToast()
  const [threatQueue, setThreatQueue] = useState([])
  const [selectedThreat, setSelectedThreat] = useState(null)
  const [verifyDecision, setVerifyDecision] = useState('confirm')
  const [verifyNotes, setVerifyNotes] = useState('')

  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  useEffect(() => { fetchThreatQueue() }, [])

  const fetchThreatQueue = async () => {
    try {
      const res = await fetch(`${API_BASE}/detect/pending`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setThreatQueue(data.items || [])
        if (data.items?.length > 0) setSelectedThreat(data.items[0])
      }
    } catch (e) { console.error(e) }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!selectedThreat) return
    try {
      const res = await fetch(`${API_BASE}/detect/${selectedThreat.log_id}/verify`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          decision: verifyDecision,
          confirmed_pest: selectedThreat.detected_pest,
          severity: verifyDecision === 'confirm' ? selectedThreat.ai_risk_level : 'Medium',
          notes: verifyNotes || `Verified by regional expert in ${selectedThreat.district}.`
        }),
      })
      if (res.ok) {
        toast.success(`Threat case ${verifyDecision}ed successfully. Audit trail and retraining queue recorded.`)
        setVerifyNotes('')
        fetchThreatQueue()
      } else {
        toast.error('Verification failed. Please try again.')
      }
    } catch (e) {
      console.error(e)
      toast.error('Network error while submitting verification.')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-base font-bold text-stone-900">Unverified Threats</h3>
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
          {threatQueue.length === 0 && (
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
                  Attribution: Dr. V. Sundaram (Agronomist ID #204)
                </span>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                >
                  <span>Submit Verification Audit</span>
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
