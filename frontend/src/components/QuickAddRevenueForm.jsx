import React, { useState, useMemo } from 'react'
import {
  TrendingUp, X, CheckCircle2, AlertCircle,
  Calendar, MapPin, Scale, DollarSign
} from 'lucide-react'
import { formatINR } from './ProfitRangeDisplay'
import { queueOfflineAction } from '../utils/offlineQueue'

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
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0])
  const [buyerOrMandi, setBuyerOrMandi] = useState(`${district} Regulated Mandi`)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [queuedOffline, setQueuedOffline] = useState(false)

  const totalRevenue = useMemo(() => {
    const q = Number(quantityKg) || 0
    const p = Number(pricePerKg) || 0
    return Math.round(q * p)
  }, [quantityKg, pricePerKg])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!quantityKg || Number(quantityKg) <= 0) {
      setError('Please enter a valid harvest quantity in kg.')
      return
    }
    if (!pricePerKg || Number(pricePerKg) <= 0) {
      setError('Please enter a valid sale price per kg.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = {
      farm_id: farmId,
      season,
      crop_type: cropType,
      district,
      quantity_sold_kg: Number(quantityKg),
      price_per_kg: Number(pricePerKg),
      sale_date: saleDate,
      buyer_or_mandi: buyerOrMandi.trim() || null,
    }

    try {
      const res = await fetch('/api/v1/revenue', {
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
      console.warn('Network issue, storing revenue in offline queue...', err)
      try {
        await queueOfflineAction('revenue_log', payload)
        setQueuedOffline(true)
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
    <div className="bg-white rounded-3xl p-6 sm:p-7 space-y-5 max-w-lg w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
            Harvest Sale & Mandi Receipts
          </span>
          <h3 className="text-xl font-black text-stone-900 mt-1">
            Log Harvest Revenue
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
        {/* Quantity & Price per KG */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Scale size={13} className="text-emerald-600" /> Quantity Sold (kg)
            </label>
            <input
              type="number"
              min="0.1"
              step="any"
              placeholder="e.g. 1500"
              value={quantityKg}
              onChange={(e) => setQuantityKg(e.target.value)}
              required
              autoFocus
              className="w-full p-2.5 rounded-xl border border-stone-200 font-mono font-bold text-stone-900 text-lg outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-[10px] text-stone-400 mt-0.5 block">
              {quantityKg ? `${(Number(quantityKg) / 100).toFixed(1)} quintals` : '1 quintal = 100 kg'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1 flex items-center gap-1">
              <DollarSign size={13} className="text-emerald-600" /> Price per kg (₹)
            </label>
            <input
              type="number"
              min="0.1"
              step="any"
              placeholder="e.g. 62.5"
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
              required
              className="w-full p-2.5 rounded-xl border border-stone-200 font-mono font-bold text-stone-900 text-lg outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-[10px] text-stone-400 mt-0.5 block">
              {pricePerKg ? `₹${(Number(pricePerKg) * 100).toLocaleString('en-IN')} / quintal` : 'Rate agreed with buyer/mandi'}
            </span>
          </div>
        </div>

        {/* Live Computed Total Card */}
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
              Computed Total Revenue
            </span>
            <span className="text-xs text-stone-500">
              {quantityKg || 0} kg × ₹{pricePerKg || 0}/kg
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-950 font-mono">
            ₹{formatINR(totalRevenue)}
          </div>
        </div>

        {/* Sale Date & Mandi */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar size={13} className="text-emerald-600" /> Sale Date
            </label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              required
              className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <MapPin size={13} className="text-emerald-600" /> Buyer / Mandi Name
            </label>
            <input
              type="text"
              placeholder="e.g. Kovilpatti Mandi, Direct Trader"
              value={buyerOrMandi}
              onChange={(e) => setBuyerOrMandi(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {submitting ? (
            <span>Saving Revenue...</span>
          ) : (
            <>
              <TrendingUp size={16} /> Save Revenue (₹{formatINR(totalRevenue)})
            </>
          )}
        </button>
      </form>
    </div>
  )
}
