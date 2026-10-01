import React, { useState, useMemo } from 'react'
import {
  TrendingUp, X, CheckCircle2, AlertCircle,
  Calendar, MapPin, Scale, IndianRupee
} from 'lucide-react'
import { formatINR } from './ProfitRangeDisplay'
import { localISODate } from './QuickAddExpenseForm'
import { queueOfflineAction } from '../utils/offlineQueue'
import { apiFetch, isNetworkError } from '../utils/http'

const MAX_AMOUNT = 1e9

const SMALL_LABEL = 'block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1 flex items-center gap-1'
const FIELD = 'w-full p-2.5 rounded-xl border border-stone-300 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-brand-500'

export default function QuickAddRevenueForm({
  farmId,
  season = 'Kharif 2026',
  cropType = 'Cotton',
  district = 'Thoothukudi',
  onSuccess,
  onClose,
}) {
  const [quantityKg, setQuantityKg] = useState('')
  const [pricePerKg, setPricePerKg] = useState('')
  const [saleDate, setSaleDate] = useState(() => localISODate())
  const [buyerOrMandi, setBuyerOrMandi] = useState(district && district !== 'Tamil Nadu' ? `${district} Regulated Mandi` : '')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false) // saved or queued: keep the form disabled until it is closed
  const [error, setError] = useState(null)
  const [queuedOffline, setQueuedOffline] = useState(false)

  const qtyNum = Number(quantityKg)
  const priceNum = Number(pricePerKg)

  const totalRevenue = useMemo(() => {
    const q = Number.isFinite(qtyNum) ? qtyNum : 0
    const p = Number.isFinite(priceNum) ? priceNum : 0
    return Math.round(q * p)
  }, [qtyNum, priceNum])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting || done) return
    if (!quantityKg || !Number.isFinite(qtyNum) || qtyNum <= 0 || qtyNum > MAX_AMOUNT) {
      setError('Please enter a valid harvest quantity in kg.')
      return
    }
    if (!pricePerKg || !Number.isFinite(priceNum) || priceNum <= 0 || priceNum > MAX_AMOUNT) {
      setError('Please enter a valid sale price per kg.')
      return
    }
    if (!saleDate) {
      setError('Please choose the sale date.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      farm_id: farmId,
      season,
      crop_type: cropType || 'General',
      district,
      quantity_sold_kg: qtyNum,
      price_per_kg: priceNum,
      sale_date: saleDate,
      buyer_or_mandi: buyerOrMandi.trim() || null,
    }

    try {
      await apiFetch('/revenue', { method: 'POST', json: payload })
      setDone(true)
      onSuccess?.()
      onClose?.()
    } catch (err) {
      if (!isNetworkError(err)) {
        // Server answered (4xx/5xx): show the real error instead of pretending it was queued.
        setError(err.message || 'Could not record revenue. Please retry.')
        return
      }
      console.warn('Network issue, storing revenue in offline queue...', err)
      try {
        await queueOfflineAction('revenue_log', payload)
        setQueuedOffline(true)
        setDone(true)
        setTimeout(() => {
          onSuccess?.()
          onClose?.()
        }, 1500)
      } catch (qErr) {
        setError('Could not record revenue. Please retry.')
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
          <h3 className="text-xl font-bold text-stone-900 mt-1">
            Log Harvest Sale
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="w-8 h-8 shrink-0 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {queuedOffline && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
          <span>You are offline. The sale is saved on this device and will sync automatically when you reconnect.</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Quantity & Price per KG */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="rev-qty" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Scale size={13} className="text-brand-600" /> Quantity Sold (kg)
            </label>
            <input
              id="rev-qty"
              type="number"
              inputMode="decimal"
              min="0.01"
              max={MAX_AMOUNT}
              step="any"
              placeholder="e.g. 1500"
              value={quantityKg}
              onChange={(e) => setQuantityKg(e.target.value)}
              required
              autoFocus
              className={`${FIELD} font-mono font-bold text-lg`}
            />
            <span className="text-xs text-stone-500 mt-0.5 block">
              {quantityKg && Number.isFinite(qtyNum) ? `${(qtyNum / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} quintals` : '1 quintal = 100 kg'}
            </span>
          </div>

          <div>
            <label htmlFor="rev-price" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              <IndianRupee size={13} className="text-brand-600" /> Price per kg (₹)
            </label>
            <input
              id="rev-price"
              type="number"
              inputMode="decimal"
              min="0.01"
              max={MAX_AMOUNT}
              step="any"
              placeholder="e.g. 62.5"
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
              required
              className={`${FIELD} font-mono font-bold text-lg`}
            />
            <span className="text-xs text-stone-500 mt-0.5 block">
              {pricePerKg && Number.isFinite(priceNum) ? `₹${(priceNum * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} / quintal` : 'Rate agreed with buyer / mandi'}
            </span>
          </div>
        </div>

        {/* Live Computed Total Card */}
        <div className="p-4 rounded-2xl bg-brand-50 border border-brand-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-brand-800 uppercase tracking-wider block">
              Total Revenue
            </span>
            <span className="text-xs text-stone-600">
              {Number.isFinite(qtyNum) && quantityKg ? qtyNum.toLocaleString('en-IN') : 0} kg × ₹{Number.isFinite(priceNum) && pricePerKg ? priceNum.toLocaleString('en-IN') : 0}/kg
            </span>
          </div>
          <div className="text-2xl font-bold text-brand-900 font-mono break-all" aria-live="polite">
            ₹{formatINR(totalRevenue)}
          </div>
        </div>

        {/* Sale Date & Mandi */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <label htmlFor="rev-date" className={SMALL_LABEL}>
              <Calendar size={13} className="text-brand-600" /> Sale Date
            </label>
            <input
              id="rev-date"
              type="date"
              max={localISODate()}
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              required
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="rev-buyer" className={SMALL_LABEL}>
              <MapPin size={13} className="text-brand-600" /> Buyer / Mandi Name
            </label>
            <input
              id="rev-buyer"
              type="text"
              maxLength={200}
              placeholder="e.g. Kovilpatti Mandi, Direct Trader"
              value={buyerOrMandi}
              onChange={(e) => setBuyerOrMandi(e.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || done}
          className="w-full py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              <span>Saving Sale...</span>
            </>
          ) : (
            <>
              <TrendingUp size={16} /> Save Sale (₹{formatINR(totalRevenue)})
            </>
          )}
        </button>
      </form>
    </div>
  )
}
