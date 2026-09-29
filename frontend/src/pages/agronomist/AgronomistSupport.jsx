import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Send, RefreshCw, Inbox } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'
import { apiFetch } from '../../utils/http'

// Contract 9: real queue from GET /advisories/farmer-requests?status=pending,
// responses go to the selected request's id (no hard-coded demo id).
export default function AgronomistSupport() {
  const toast = useToast()
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [supportReply, setSupportReply] = useState('')
  const [sending, setSending] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch('/advisories/farmer-requests?status=pending')
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setRequests(items)
      setSelectedId((prev) => (prev && items.some((r) => String(r.id) === String(prev)) ? prev : (items[0]?.id ?? null)))
    } catch (e) {
      console.error(e)
      setRequests([])
      setSelectedId(null)
      setLoadError(e.message || 'Could not load farmer requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  const selected = requests.find((r) => String(r.id) === String(selectedId)) || null

  const handleSendSupportReply = async (e) => {
    e.preventDefault()
    if (!selected || !supportReply.trim() || sending) return
    const targetId = selected.id
    setSending(true)
    try {
      await apiFetch(`/advisories/farmer-requests/${encodeURIComponent(targetId)}/respond`, {
        method: 'POST',
        json: { response_text: supportReply },
      })
      toast.success('Response transmitted to farmer successfully.')
      setSupportReply('')
      setRequests((prev) => prev.filter((r) => String(r.id) !== String(targetId)))
      setSelectedId(null)
      loadRequests()
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to send response.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Farmer Diagnostic Support Inquiries</h2>
          <p className="text-xs text-stone-500 mt-0.5">Handle field assistance requests submitted by smallholders.</p>
        </div>
        <button onClick={loadRequests} disabled={loading} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50" title="Refresh">
          <RefreshCw size={14} className={clsx(loading && 'animate-spin')} />
        </button>
      </div>

      {loadError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</p>
      )}

      {!loading && !loadError && requests.length === 0 && (
        <EmptyState icon={Inbox} title="No pending requests" message="Farmer support requests will appear here." />
      )}

      {requests.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-2">
            {requests.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setSelectedId(r.id); setSupportReply('') }}
                className={clsx(
                  'w-full text-left p-3 rounded-xl border text-xs transition-all',
                  String(r.id) === String(selectedId) ? 'border-sky-400 bg-sky-50' : 'border-stone-200 hover:bg-stone-50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-stone-900 truncate">{r.farmer_name || 'Farmer'}</span>
                  <span className="text-[10px] text-stone-400 shrink-0">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <p className="text-stone-500 truncate">{r.farm_name || '—'} · {r.crop_type || 'General'}</p>
                <p className="text-stone-700 line-clamp-2 mt-0.5">{r.question}</p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-7">
            {selected ? (
              <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-green-700 uppercase tracking-wider">
                      Farmer: {selected.farmer_name || 'Farmer'}
                    </span>
                    <h4 className="text-sm font-bold text-stone-900 mt-0.5">
                      Crop: {selected.crop_type || 'General'} · Plot: {selected.farm_name || '—'}
                    </h4>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold capitalize">
                    {selected.status || 'pending'}
                  </span>
                </div>

                <p className="text-xs text-stone-700 bg-white p-3.5 rounded-lg border border-stone-200">
                  "{selected.question}"
                </p>

                <form onSubmit={handleSendSupportReply} className="space-y-3">
                  <textarea
                    rows={3}
                    value={supportReply}
                    onChange={(e) => setSupportReply(e.target.value)}
                    placeholder="Provide specific TNAU chemical/organic prescription to the farmer..."
                    className="w-full p-3 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-sky-500 outline-none resize-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !supportReply.trim()}
                    className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={14} /> {sending ? 'Sending…' : 'Send Expert Advisory'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="p-12 text-center text-stone-400 text-xs">Select a request to respond.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export const supportMeta = { icon: MessageSquare, label: 'Farmer Support Management' }
