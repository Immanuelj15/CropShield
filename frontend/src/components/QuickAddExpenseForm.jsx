import React, { useState } from 'react'
import {
  Coins, Camera, CheckCircle2, AlertCircle, X,
  Upload, Sparkles, Plus, Calendar, FileText
} from 'lucide-react'
import clsx from 'clsx'
import { queueOfflineAction } from '../utils/offlineQueue'

const CATEGORIES = [
  { id: 'seeds', label: 'Seeds', icon: '🌱', color: 'hover:border-amber-400 peer-checked:bg-amber-500 peer-checked:text-white' },
  { id: 'fertilizer', label: 'Fertilizer', icon: '🌾', color: 'hover:border-emerald-400 peer-checked:bg-emerald-600 peer-checked:text-white' },
  { id: 'labor', label: 'Labor', icon: '👷', color: 'hover:border-blue-400 peer-checked:bg-blue-600 peer-checked:text-white' },
  { id: 'irrigation', label: 'Irrigation', icon: '💧', color: 'hover:border-cyan-400 peer-checked:bg-cyan-600 peer-checked:text-white' },
  { id: 'pesticides', label: 'Pesticides', icon: '🧪', color: 'hover:border-purple-400 peer-checked:bg-purple-600 peer-checked:text-white' },
  { id: 'other', label: 'Other', icon: '📦', color: 'hover:border-stone-400 peer-checked:bg-stone-700 peer-checked:text-white' },
]

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000]

export default function QuickAddExpenseForm({
  farmId,
  season = 'Kharif 2026',
  cropType = 'Cotton',
  district = 'Thoothukudi',
  onSuccess,
  onClose,
}) {
  const [category, setCategory] = useState('fertilizer')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [queuedOffline, setQueuedOffline] = useState(false)

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingReceipt(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/v1/expenses/receipt-upload', {
        method: 'POST',
        body: fd,
      })
      if (res.ok) {
        const data = await res.json()
        setReceiptUrl(data.url)
      } else {
        setError('Failed to upload receipt image.')
      }
    } catch (err) {
      console.warn('Receipt upload fallback:', err)
      setReceiptUrl(URL.createObjectURL(file))
    } finally {
      setUploadingReceipt(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid expense amount.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      farm_id: farmId,
      season,
      crop_type: cropType,
      district,
      category,
      amount: Number(amount),
      date,
      notes: notes.trim(),
      receipt_photo_url: receiptUrl || null,
    }

    try {
      const res = await fetch('/api/v1/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        onSuccess?.()
        onClose?.()
      } else {
        throw new Error('Server returned error.')
      }
    } catch (err) {
      console.warn('Network issue, storing expense in offline queue...', err)
      try {
        await queueOfflineAction('expense_log', payload)
        setQueuedOffline(true)
        setTimeout(() => {
          onSuccess?.()
          onClose?.()
        }, 1500)
      } catch (qErr) {
        setError('Could not record expense. Please retry.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-7 space-y-5 max-w-lg w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
            10-Second Field Entry
          </span>
          <h3 className="text-xl font-black text-stone-900 mt-1">
            Log Farm Expense
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {queuedOffline && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
          <span>Saved to offline queue! Will auto-sync when connection restores.</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category Picker (Big 6 Icon Buttons) */}
        <div>
          <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
            Expense Category
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => (
              <label
                key={cat.id}
                className={clsx(
                  "p-2.5 rounded-2xl border text-center cursor-pointer transition-all flex flex-col items-center gap-1",
                  category === cat.id
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm font-bold scale-[1.02]"
                    : "bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200 font-semibold"
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={cat.id}
                  checked={category === cat.id}
                  onChange={() => setCategory(cat.id)}
                  className="sr-only"
                />
                <span className="text-xl leading-none">{cat.icon}</span>
                <span className="text-xs">{cat.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Amount Input with Quick Presets */}
        <div>
          <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
            Amount Paid (₹)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-lg font-mono">
              ₹
            </span>
            <input
              type="number"
              min="1"
              step="any"
              placeholder="e.g. 3500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              className="w-full pl-9 pr-4 py-3 rounded-2xl border border-stone-200 text-xl font-black text-stone-900 font-mono outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Quick Increment Buttons */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String((Number(amount) || 0) + amt))}
                className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-emerald-50 text-stone-600 hover:text-emerald-800 text-[11px] font-mono font-bold transition border border-stone-200 shrink-0"
              >
                +{amt}
              </button>
            ))}
            {amount && (
              <button
                type="button"
                onClick={() => setAmount('')}
                className="px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold hover:bg-rose-100 transition shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Date & Receipt Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar size={13} className="text-emerald-600" /> Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Camera size={13} className="text-blue-600" /> Receipt Photo (Optional)
            </label>
            <label className="w-full p-2 rounded-xl border border-dashed border-stone-300 hover:border-emerald-500 bg-stone-50 hover:bg-emerald-50/40 text-stone-600 flex items-center justify-center gap-2 cursor-pointer transition">
              <Upload size={14} className="text-stone-400" />
              <span className="font-semibold truncate max-w-[140px]">
                {uploadingReceipt ? 'Uploading...' : receiptUrl ? 'Receipt Attached ✓' : 'Snap / Upload'}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                capture="environment"
                onChange={handleReceiptUpload}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Optional Notes */}
        <div>
          <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1 flex items-center gap-1">
            <FileText size={13} className="text-stone-400" /> Notes / Supplier Name (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Bought 2 bags at Kovilpatti Agro Center"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {submitting ? (
            <span>Saving Expense...</span>
          ) : (
            <>
              <Coins size={16} /> Save Expense (₹{amount ? Number(amount).toLocaleString('en-IN') : '0'})
            </>
          )}
        </button>
      </form>
    </div>
  )
}
