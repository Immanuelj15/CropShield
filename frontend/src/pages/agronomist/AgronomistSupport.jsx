import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Send, RefreshCw, Inbox, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import PillToggleGroup from '../../components/ui/PillToggleGroup'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const MIN_REPLY = 5 // backend SupportResponseRequest.response_text min_length
const MAX_REPLY = 4000
const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Answered' },
  { value: 'all', label: 'All' },
]

const fmtDate = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

// Real queue from GET /advisories/farmer-requests?status=…; responses go to the selected request's id.
export default function AgronomistSupport() {
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [requests, setRequests] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [supportReply, setSupportReply] = useState('')
  const [replyError, setReplyError] = useState(null)
  const [sending, setSending] = useState(false)

  const loadRequests = useCallback(async (filter) => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch(`/advisories/farmer-requests?status=${encodeURIComponent(filter)}`)
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setRequests(items)
      setSelectedId((prev) => (prev && items.some((r) => String(r.id) === String(prev)) ? prev : (items[0]?.id ?? null)))
    } catch (e) {
      setRequests([])
      setSelectedId(null)
      setLoadError(e.message || 'Could not load farmer requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRequests(statusFilter) }, [loadRequests, statusFilter])

  const selected = requests.find((r) => String(r.id) === String(selectedId)) || null
  const isResolved = selected?.status === 'resolved'

  const handleSendSupportReply = async (e) => {
    e.preventDefault()
    if (!selected || sending) return
    const text = supportReply.trim()
    if (text.length < MIN_REPLY) {
      setReplyError(`Please write at least ${MIN_REPLY} characters.`)
      return
    }
    setReplyError(null)
    const targetId = selected.id
    setSending(true)
    try {
      await apiFetch(`/advisories/farmer-requests/${encodeURIComponent(targetId)}/respond`, {
        method: 'POST',
        json: { response_text: text },
      })
      toast.success('Response sent to the farmer.')
      setSupportReply('')
      if (statusFilter === 'pending') {
        setRequests((prev) => prev.filter((r) => String(r.id) !== String(targetId)))
        setSelectedId(null)
      }
      loadRequests(statusFilter)
    } catch (err) {
      toast.error(err.message || 'Failed to send response.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card p-5 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-stone-900">Farmer support requests</h2>
          <p className="text-sm text-stone-600 mt-0.5">Answer field assistance requests submitted by farmers.</p>
        </div>
        <div className="flex items-center gap-2">
          <PillToggleGroup options={FILTERS} value={statusFilter} onChange={setStatusFilter} size="sm" />
          <button
            type="button"
            onClick={() => loadRequests(statusFilter)}
            disabled={loading}
            aria-label="Refresh requests"
            className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}
          >
            <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {loading && requests.length === 0 ? (
        <LoadingState message="Loading requests…" />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => loadRequests(statusFilter)} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={statusFilter === 'pending' ? 'No pending requests' : 'No requests'}
          message="Farmer support requests will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-2 min-w-0">
            {requests.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setSelectedId(r.id); setSupportReply(''); setReplyError(null) }}
                aria-pressed={String(r.id) === String(selectedId)}
                className={clsx(
                  'w-full text-left p-3 rounded-xl border text-sm transition-all',
                  FOCUS,
                  String(r.id) === String(selectedId) ? 'border-brand-600 bg-brand-50' : 'border-stone-200 hover:bg-stone-50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-stone-900 truncate">{r.farmer_name || 'Farmer'}</span>
                  <span className="text-xs text-stone-500 shrink-0">{fmtDate(r.created_at)}</span>
                </div>
                <p className="text-xs text-stone-500 truncate">{r.farm_name || r.district || '—'} · {r.crop_type || 'General'}</p>
                <p className="text-stone-700 line-clamp-2 mt-0.5">{r.question}</p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-7 min-w-0">
            {selected ? (
              <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                      Farmer: {selected.farmer_name || 'Farmer'}
                    </span>
                    <h4 className="text-sm font-bold text-stone-900 mt-0.5 break-words">
                      Crop: {selected.crop_type || 'General'} · Plot: {selected.farm_name || '—'}{selected.district ? ` · ${selected.district}` : ''}
                    </h4>
                  </div>
                  <Badge status={isResolved ? 'success' : 'warning'}>{isResolved ? 'Answered' : 'Pending'}</Badge>
                </div>

                <blockquote className="text-sm text-stone-700 bg-white p-3.5 rounded-lg border border-stone-200 break-words">
                  “{selected.question}”
                </blockquote>

                {selected.image_url && (
                  <a href={selected.image_url} target="_blank" rel="noreferrer" className={clsx('inline-block rounded-lg', FOCUS)}>
                    <img src={selected.image_url} alt="Photo attached by the farmer" className="max-h-48 rounded-lg border border-stone-200" />
                  </a>
                )}

                {isResolved ? (
                  <div className="p-3.5 rounded-lg border border-green-200 bg-green-50 text-sm text-green-900 space-y-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 size={16} /> Answered by {selected.agronomist_name || 'an agronomist'}
                      {selected.responded_at ? ` on ${fmtDate(selected.responded_at)}` : ''}
                    </span>
                    <p className="whitespace-pre-line break-words">{selected.response_text}</p>
                  </div>
                ) : (
                  <form onSubmit={handleSendSupportReply} className="space-y-3" noValidate>
                    <label htmlFor="support-reply" className="label">Your advisory</label>
                    <textarea
                      id="support-reply"
                      rows={4}
                      maxLength={MAX_REPLY}
                      value={supportReply}
                      onChange={(e) => { setSupportReply(e.target.value); if (replyError) setReplyError(null) }}
                      placeholder="Give a specific TNAU organic or chemical prescription for the farmer…"
                      aria-invalid={!!replyError}
                      className={clsx('input-field text-sm resize-none', replyError && 'border-red-400')}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={clsx('text-xs', replyError ? 'text-red-600 font-medium' : 'text-stone-500')}>
                        {replyError || `${supportReply.length}/${MAX_REPLY}`}
                      </span>
                      <Button type="submit" icon={Send} loading={sending} disabled={!supportReply.trim()} className={FOCUS}>
                        {sending ? 'Sending…' : 'Send advisory'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <EmptyState icon={MessageSquare} title="No request selected" message="Select a request to view or respond." />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export const supportMeta = { icon: MessageSquare, label: 'Farmer Support Management' }
