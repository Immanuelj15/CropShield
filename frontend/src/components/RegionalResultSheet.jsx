import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, ChevronDown, ChevronUp,
  Send, Sparkles, MapPin, X, Info, Layers, BellRing, Check, Loader2
} from 'lucide-react'
import { apiFetch } from '../utils/http'

const RISK_PILL = {
  High: 'bg-red-100 text-red-800',
  Medium: 'bg-amber-100 text-amber-800',
  Low: 'bg-green-100 text-green-800',
}

const ICON_BTN = 'p-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

export default function RegionalResultSheet({
  scanResult,
  loading,
  error,
  errorTitle = 'Scan failed',
  onRetry,
  userRole,
  polygonGeoJSON,
  onClear,
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastSeverity, setBroadcastSeverity] = useState('High')
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastStatus, setBroadcastStatus] = useState(null)

  const canBroadcast = userRole === 'agronomist' || userRole === 'admin'

  // A new scan (or cleared boundary) always re-opens the sheet and closes a stale modal
  useEffect(() => {
    setIsExpanded(true)
    setShowBroadcastModal(false)
    setBroadcastStatus(null)
  }, [polygonGeoJSON])

  // Close the modal with Escape
  useEffect(() => {
    if (!showBroadcastModal) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && !broadcasting) setShowBroadcastModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showBroadcastModal, broadcasting])

  // Auto-close the modal a moment after a successful dispatch
  useEffect(() => {
    if (broadcastStatus?.type !== 'success') return undefined
    const timer = setTimeout(() => {
      setShowBroadcastModal(false)
      setBroadcastStatus(null)
    }, 2500)
    return () => clearTimeout(timer)
  }, [broadcastStatus])

  const handleBroadcast = async (e) => {
    e?.preventDefault()
    if (!polygonGeoJSON || !broadcastTitle.trim() || !broadcastMessage.trim() || broadcasting) return

    setBroadcasting(true)
    setBroadcastStatus(null)

    try {
      const threat = scanResult?.dominant_threat?.pest_or_disease
      const payload = {
        polygon: polygonGeoJSON,
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        severity: broadcastSeverity,
        target_threat: threat && !/^nil/i.test(threat) ? threat : null,
      }

      const data = await apiFetch('/outbreak/scan-area/broadcast-advisory', { method: 'POST', json: payload })
      setBroadcastStatus({
        type: 'success',
        message: data?.message || 'Advisory sent to farm owners in this area.',
      })
      setBroadcastTitle('')
      setBroadcastMessage('')
    } catch (err) {
      setBroadcastStatus({
        type: 'error',
        message: err.message || 'Failed to send the regional advisory.',
      })
    } finally {
      setBroadcasting(false)
    }
  }

  if (!scanResult && !loading && !error) {
    return null
  }

  const farmCount = scanResult?.farm_count ?? 0
  const threatName = scanResult?.dominant_threat?.pest_or_disease

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="fixed bottom-0 left-0 right-0 z-[1000] max-w-4xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4"
        >
          <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
            {/* Header Bar */}
            <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 bg-stone-50/80 border-b border-stone-200">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                  Regional Boundary Analysis
                </span>
                {scanResult && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">
                    {farmCount} {farmCount === 1 ? 'farm' : 'farms'} found
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={`${ICON_BTN} text-stone-500 hover:text-stone-800 hover:bg-stone-200/60`}
                  aria-label={isExpanded ? 'Collapse results' : 'Expand results'}
                  aria-expanded={isExpanded}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
                <button
                  type="button"
                  onClick={onClear}
                  className={`${ICON_BTN} text-stone-500 hover:text-stone-800 hover:bg-stone-200/60`}
                  aria-label="Clear boundary and close results"
                  title="Clear boundary"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body Content */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="p-4 sm:p-6 space-y-5 max-h-[60vh] overflow-y-auto"
                >
                  {/* 1. Loading State */}
                  {loading && (
                    <div className="space-y-4 py-3" aria-busy="true">
                      <div className="flex items-center gap-3">
                        <Loader2 size={22} className="text-brand-600 animate-spin shrink-0" />
                        <p className="text-sm font-semibold text-stone-700">
                          Finding farms inside the boundary and aggregating their latest risk assessments…
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="h-16 bg-stone-100 animate-pulse rounded-2xl" />
                        <div className="h-16 bg-stone-100 animate-pulse rounded-2xl" />
                        <div className="h-16 bg-stone-100 animate-pulse rounded-2xl" />
                      </div>
                      <div className="h-20 bg-stone-100 animate-pulse rounded-2xl" />
                    </div>
                  )}

                  {/* 2. Error State */}
                  {error && !loading && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3" role="alert">
                      <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-sm">{errorTitle}</p>
                        <p className="leading-relaxed">{error}</p>
                        {onRetry ? (
                          <button
                            type="button"
                            onClick={onRetry}
                            className="mt-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          >
                            Retry scan
                          </button>
                        ) : (
                          <p className="text-stone-600 pt-1">
                            Tip: zoom in with the +/− controls and draw a compact boundary over a specific farm cluster.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3. Empty State (0 Farms Found) */}
                  {!loading && !error && scanResult && farmCount === 0 && (
                    <div className="text-center py-6 space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto text-stone-500">
                        <MapPin size={24} />
                      </div>
                      <p className="text-stone-800 font-semibold text-sm">No registered farms in this boundary</p>
                      <p className="text-stone-500 text-xs max-w-md mx-auto leading-relaxed">
                        No plots are currently registered inside this area.
                        Try drawing a wider boundary or move towards a monitored farming cluster.
                      </p>
                    </div>
                  )}

                  {/* 4. Active Scan Results */}
                  {!loading && !error && scanResult && farmCount > 0 && (
                    <>
                      {/* Risk Breakdown Chips */}
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="p-3 rounded-2xl bg-red-50/80 border border-red-200 text-center min-w-0">
                          <span className="text-xs font-semibold text-red-700 block truncate">High risk</span>
                          <p className="text-2xl font-bold text-red-800 mt-0.5">{scanResult.risk_breakdown?.High || 0}</p>
                          <span className="text-xs text-red-700 hidden sm:block">Urgent intervention</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-center min-w-0">
                          <span className="text-xs font-semibold text-amber-700 block truncate">Medium risk</span>
                          <p className="text-2xl font-bold text-amber-800 mt-0.5">{scanResult.risk_breakdown?.Medium || 0}</p>
                          <span className="text-xs text-amber-700 hidden sm:block">Proactive scouting</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-green-50/80 border border-green-200 text-center min-w-0">
                          <span className="text-xs font-semibold text-green-700 block truncate">Low risk</span>
                          <p className="text-2xl font-bold text-green-800 mt-0.5">{scanResult.risk_breakdown?.Low || 0}</p>
                          <span className="text-xs text-green-700 hidden sm:block">Includes unassessed farms</span>
                        </div>
                      </div>

                      {/* Dominant Threat & SHAP Summary Card */}
                      <div className="p-4 rounded-2xl bg-brand-50 border border-brand-200 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-800 uppercase tracking-wider">
                            <Sparkles size={14} className="text-brand-600" />
                            Dominant Regional Threat
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-800">
                            {scanResult.dominant_threat?.affected_farm_count ?? 0} farms affected
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-stone-900">
                          {threatName || 'None identified'}
                        </h4>
                        {scanResult.dominant_threat?.shap_summary && (
                          <div className="flex items-start gap-2 pt-1">
                            <Info size={14} className="text-brand-700 shrink-0 mt-0.5" />
                            <p className="text-xs text-stone-700 leading-relaxed">
                              {scanResult.dominant_threat.shap_summary}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action Bar (Agronomist / Admin Broadcast) */}
                      {canBroadcast && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => { setBroadcastStatus(null); setShowBroadcastModal(true) }}
                            className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <BellRing size={16} /> Broadcast Advisory to All {farmCount} Farms
                          </button>
                        </div>
                      )}

                      {/* Farm Details Mini-Roster */}
                      <div className="space-y-2 pt-1">
                        <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                          <Layers size={13} className="text-stone-500" /> Registered Plots in Scanned Area
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                          {(scanResult.farms || []).map((f) => (
                            <div
                              key={f.farm_id}
                              className="p-2.5 rounded-xl border border-stone-200 bg-stone-50/60 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-stone-800 block truncate">{f.name}</span>
                                <span className="text-xs text-stone-500 block truncate">
                                  {f.crop_type || '—'} · {f.threat_name || '—'}
                                </span>
                              </div>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${RISK_PILL[f.risk_level] || 'bg-stone-100 text-stone-600'}`}>
                                {f.risk_level}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Broadcast Advisory Modal — rendered OUTSIDE the transformed sheet so `fixed inset-0` covers the viewport */}
      {showBroadcastModal && (
        <div
          className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="broadcast-advisory-title"
          onClick={(e) => { if (e.target === e.currentTarget && !broadcasting) setShowBroadcastModal(false) }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div id="broadcast-advisory-title" className="flex items-center gap-2 text-stone-900 font-semibold">
                <Send size={18} className="text-brand-600" />
                <span>Send Regional Advisory Alert</span>
              </div>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                disabled={broadcasting}
                className={`${ICON_BTN} text-stone-500 hover:text-stone-800 hover:bg-stone-100`}
                aria-label="Close advisory form"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBroadcast} className="space-y-3.5 text-xs">
              <div>
                <label className="label text-xs" htmlFor="broadcast-threat">Target threat</label>
                <input
                  id="broadcast-threat"
                  type="text"
                  disabled
                  value={threatName && !/^nil/i.test(threatName) ? threatName : 'General advisory'}
                  className="input-field bg-stone-100 text-stone-600 text-xs cursor-not-allowed"
                />
              </div>

              <div>
                <label className="label text-xs" htmlFor="broadcast-severity">Advisory severity</label>
                <select
                  id="broadcast-severity"
                  value={broadcastSeverity}
                  onChange={(e) => setBroadcastSeverity(e.target.value)}
                  className="input-field text-xs font-semibold"
                >
                  <option value="High">High (immediate action)</option>
                  <option value="Medium">Medium (preventive scouting)</option>
                  <option value="Low">Low (standard protocol)</option>
                </select>
              </div>

              <div>
                <label className="label text-xs" htmlFor="broadcast-title">Advisory title</label>
                <input
                  id="broadcast-title"
                  type="text"
                  required
                  maxLength={200}
                  placeholder="e.g. Urgent Whitefly Alert - Kovilpatti Cotton Belt"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="input-field text-xs"
                />
              </div>

              <div>
                <label className="label text-xs" htmlFor="broadcast-message">Agronomic guidance &amp; spray schedule</label>
                <textarea
                  id="broadcast-message"
                  required
                  rows={3}
                  maxLength={2000}
                  placeholder="Enter the prescribed organic or chemical treatment, dosage and spraying window…"
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  className="input-field text-xs"
                />
              </div>

              {broadcastStatus && (
                <div
                  role="status"
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    broadcastStatus.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {broadcastStatus.type === 'success' ? <Check size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
                  <span>{broadcastStatus.message}</span>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  disabled={broadcasting}
                  className="btn-secondary py-2 px-4 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcasting || !broadcastTitle.trim() || !broadcastMessage.trim()}
                  className="btn-primary py-2 px-5 text-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {broadcasting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      <Send size={13} /> Send to {farmCount} {farmCount === 1 ? 'farm' : 'farms'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  )
}
