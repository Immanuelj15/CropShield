import React, { useState } from 'react'
import {
  Coins, Camera, CheckCircle2, AlertCircle, X,
  Upload, Sparkles, Plus, Calendar, FileText
} from 'lucide-react'
import clsx from 'clsx'
import { queueOfflineAction } from '../utils/offlineQueue'
import { apiFetch, isNetworkError } from '../utils/http'

const MAX_AMOUNT = 1e9

// Local calendar date (YYYY-MM-DD). toISOString() is UTC, which is "yesterday" in IST before 05:30.
export function localISODate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const CATEGORIES = [
  { id: 'seeds', label: 'Seeds', icon: '🌱' },
  { id: 'fertilizer', label: 'Fertilizer', icon: '🌾' },
  { id: 'labor', label: 'Labor', icon: '👷' },
  { id: 'irrigation', label: 'Irrigation', icon: '💧' },
  { id: 'pesticides', label: 'Pesticides', icon: '🧪' },
  { id: 'other', label: 'Other', icon: '📦' },
]

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000]

const SMALL_LABEL = 'block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 flex items-center gap-1'
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

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
  const [date, setDate] = useState(() => localISODate())
  const [notes, setNotes] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('') // only ever a server URL (/uploads/receipts/...)
  const [receiptFile, setReceiptFile] = useState(null) // selected file, kept so a failed upload can be retried
  const [receiptError, setReceiptError] = useState(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false) // saved or queued: keep the form disabled until it is closed
  const [error, setError] = useState(null)
  const [queuedOffline, setQueuedOffline] = useState(false)

  const uploadReceipt = async (file) => {
    if (!file) return
    setUploadingReceipt(true)
    setReceiptError(null)
    setReceiptUrl('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (farmId) fd.append('farm_id', farmId)
      const data = await apiFetch('/expenses/receipt-upload', { method: 'POST', body: fd })
      if (!data?.url) throw new Error('Upload did not return a receipt URL.')
      setReceiptUrl(data.url)
    } catch (err) {
      // Never fall back to a local blob: URL — it would be saved to the database and be useless elsewhere.
      console.warn('Receipt upload failed:', err)
      setReceiptError(
        isNetworkError(err)
          ? 'Receipt could not be uploaded (offline). Retry, or remove it and save without a receipt.'
          : `Receipt upload failed: ${err.message}. Retry, or remove it and save without a receipt.`
      )
    } finally {
      setUploadingReceipt(false)
    }
  }

  const handleReceiptUpload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReceiptFile(file)
    uploadReceipt(file)
  }

  const clearReceipt = () => {
    setReceiptFile(null)
    setReceiptUrl('')
    setReceiptError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting || done) return
    const numericAmount = Number(amount)
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > MAX_AMOUNT) {
      setError('Please enter a valid expense amount (up to ₹100 crore).')
      return
    }
    if (uploadingReceipt) {
      setError('Please wait for the receipt upload to finish.')
      return
    }
    if (receiptFile && !receiptUrl) {
      setError('The receipt was not uploaded. Retry the upload or remove the receipt to save without it.')
      return
    }
    if (!date) {
      setError('Please choose the expense date.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      farm_id: farmId,
      season,
      crop_type: cropType || 'General',
      district,
      category,
      amount: numericAmount,
      date,
      notes: notes.trim(),
      receipt_photo_url: receiptUrl || null,
    }

    try {
      await apiFetch('/expenses', { method: 'POST', json: payload })
      setDone(true)
      onSuccess?.()
      onClose?.()
    } catch (err) {
      if (!isNetworkError(err)) {
        // Server answered (4xx/5xx): show the real error instead of pretending it was queued.
        setError(err.message || 'Could not record expense. Please retry.')
        return
      }
      console.warn('Network issue, storing expense in offline queue...', err)
      try {
        await queueOfflineAction('expense_log', payload)
        setQueuedOffline(true)
        setDone(true)
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
    <div className="bg-white rounded-3xl p-5 sm:p-7 space-y-5 max-w-lg w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-100">
        <div className="min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md">
            {season}
          </span>
          <h3 id="expense-form-title" className="text-xl font-bold text-stone-900 mt-1">
            Log Farm Expense
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className={`w-8 h-8 shrink-0 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition disabled:opacity-50 ${FOCUS_RING}`}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {queuedOffline && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
          <span>You are offline. The expense is saved on this device and will sync automatically when you reconnect.</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category Picker (Big 6 Icon Buttons) */}
        <div>
          <span id="expense-category-label" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
            Expense Category
          </span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="expense-category-label">
            {CATEGORIES.map((cat) => (
              <label
                key={cat.id}
                className={clsx(
                  "p-2.5 rounded-2xl border text-center cursor-pointer transition-all flex flex-col items-center gap-1 focus-within:ring-2 focus-within:ring-brand-500",
                  category === cat.id
                    ? "bg-brand-600 text-white border-brand-600 shadow-sm font-bold scale-[1.02]"
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
                <span className="text-xl leading-none" aria-hidden="true">{cat.icon}</span>
                <span className="text-xs">{cat.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Amount Input with Quick Presets */}
        <div>
          <label htmlFor="expense-amount" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
            Amount Paid (₹)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500 font-bold text-lg font-mono" aria-hidden="true">
              ₹
            </span>
            <input
              id="expense-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              max={MAX_AMOUNT}
              step="any"
              placeholder="e.g. 3500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              className="w-full pl-9 pr-4 py-3 rounded-2xl border border-stone-300 text-xl font-bold text-stone-900 font-mono outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Quick Increment Buttons */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String((Number(amount) || 0) + amt))}
                aria-label={`Add ₹${amt.toLocaleString('en-IN')}`}
                className={`px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-brand-50 text-stone-700 hover:text-brand-800 text-xs font-mono font-bold transition border border-stone-200 shrink-0 ${FOCUS_RING}`}
              >
                +{amt.toLocaleString('en-IN')}
              </button>
            ))}
            {amount && (
              <button
                type="button"
                onClick={() => setAmount('')}
                className={`px-2 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition shrink-0 ${FOCUS_RING}`}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Date & Receipt Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label htmlFor="expense-date" className={SMALL_LABEL}>
              <Calendar size={13} className="text-brand-600" /> Date
            </label>
            <input
              id="expense-date"
              type="date"
              max={localISODate()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full p-2.5 rounded-xl border border-stone-300 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <span className={SMALL_LABEL}>
              <Camera size={13} className="text-brand-600" /> Receipt Photo (Optional)
            </span>
            <label className="w-full p-2 rounded-xl border border-dashed border-stone-300 hover:border-brand-500 bg-stone-50 hover:bg-brand-50/40 text-stone-600 flex items-center justify-center gap-2 cursor-pointer transition focus-within:ring-2 focus-within:ring-brand-500">
              <Upload size={14} className="text-stone-500" />
              <span className="font-semibold truncate max-w-[140px]">
                {uploadingReceipt ? 'Uploading...' : receiptUrl ? 'Receipt attached ✓' : receiptFile ? 'Choose another' : 'Take photo / Upload'}
              </span>
              <input
                type="file"
                aria-label="Receipt photo or PDF (max 10 MB)"
                accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                onChange={handleReceiptUpload}
                disabled={uploadingReceipt || submitting || done}
                className="sr-only"
              />
            </label>
            {receiptError && (
              <div className="mt-1.5 space-y-1">
                <p className="text-xs text-red-700 font-semibold">{receiptError}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => uploadReceipt(receiptFile)}
                    disabled={uploadingReceipt || !receiptFile}
                    className={`px-2 py-1 rounded-lg border border-stone-300 text-xs font-bold hover:bg-stone-50 disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    Retry upload
                  </button>
                  <button
                    type="button"
                    onClick={clearReceipt}
                    className={`px-2 py-1 rounded-lg border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 ${FOCUS_RING}`}
                  >
                    Remove receipt
                  </button>
                </div>
              </div>
            )}
            {receiptUrl && !receiptError && (
              <button type="button" onClick={clearReceipt} className={`mt-1 text-xs text-stone-600 underline rounded ${FOCUS_RING}`}>
                Remove receipt
              </button>
            )}
          </div>
        </div>

        {/* Optional Notes */}
        <div>
          <label htmlFor="expense-notes" className={SMALL_LABEL}>
            <FileText size={13} className="text-stone-500" /> Notes / Supplier Name (Optional)
          </label>
          <input
            id="expense-notes"
            type="text"
            maxLength={2000}
            placeholder="e.g. Bought 2 bags at Kovilpatti Agro Center"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-stone-300 font-semibold text-stone-900 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || done || uploadingReceipt}
          className="w-full py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              <span>Saving Expense...</span>
            </>
          ) : (
            <>
              <Coins size={16} /> Save Expense (₹{amount && Number.isFinite(Number(amount)) ? Number(amount).toLocaleString('en-IN') : '0'})
            </>
          )}
        </button>
      </form>
    </div>
  )
}
