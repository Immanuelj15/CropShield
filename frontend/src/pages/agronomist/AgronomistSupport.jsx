import { useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'

const API_BASE = '/api/v1'

// TODO(backend): there is no GET endpoint to list pending farmer support requests for agronomists
// (backend/api/agronomist.py only exposes POST /advisories/farmer-requests/{id}/respond — a respond-to-one
// action, not a list). Until that endpoint exists, this tab shows one illustrative placeholder request
// rather than a real, fetched queue. Do not present this as live data.
const PLACEHOLDER_REQUEST = {
  id: 'demo',
  farmer_name: 'Ramanathan Farmer',
  district: 'Thoothukudi',
  crop: 'Cotton',
  plot: 'Kovilpatti Black Soil',
  query: 'Noticed slight yellowing on lower leaves and curled leaf tips on 2-month-old cotton. Need expert confirmation.',
}

export default function AgronomistSupport() {
  const toast = useToast()
  const [supportReply, setSupportReply] = useState('')
  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  const handleSendSupportReply = async (e) => {
    e.preventDefault()
    if (!supportReply.trim()) return
    try {
      const res = await fetch(`${API_BASE}/advisories/farmer-requests/${PLACEHOLDER_REQUEST.id}/respond`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ response_text: supportReply }),
      })
      if (res.ok) {
        toast.success('Response transmitted to farmer successfully.')
        setSupportReply('')
      } else {
        toast.error('Failed to send response.')
      }
    } catch (e) {
      console.error(e)
      toast.error('Network error while sending response.')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Farmer Diagnostic Support Inquiries</h2>
        <p className="text-xs text-stone-500 mt-0.5">Handle field assistance requests submitted by smallholders.</p>
      </div>

      <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold text-green-700 uppercase tracking-wider">
              Farmer: {PLACEHOLDER_REQUEST.farmer_name} ({PLACEHOLDER_REQUEST.district})
            </span>
            <h4 className="text-sm font-bold text-stone-900 mt-0.5">Crop: {PLACEHOLDER_REQUEST.crop} · Plot: {PLACEHOLDER_REQUEST.plot}</h4>
          </div>
          <span className="text-xs px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold">Pending Advisory</span>
        </div>

        <p className="text-xs text-stone-700 bg-white p-3.5 rounded-lg border border-stone-200">
          "{PLACEHOLDER_REQUEST.query}"
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
            className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow transition-all flex items-center gap-1.5"
          >
            <Send size={14} /> Send Expert Advisory
          </button>
        </form>
      </div>
    </div>
  )
}

export const supportMeta = { icon: MessageSquare, label: 'Farmer Support Management' }
