import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldAlert, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  Send, Sparkles, MapPin, X, Info, Layers, BellRing, Check, Loader2
} from 'lucide-react'
import axios from 'axios'

export default function RegionalResultSheet({
  scanResult,
  loading,
  error,
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

  const handleBroadcast = async (e) => {
    e?.preventDefault()
    if (!polygonGeoJSON || !broadcastTitle || !broadcastMessage) return

    setBroadcasting(true)
    setBroadcastStatus(null)

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('cropshield_token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}

      const payload = {
        polygon: polygonGeoJSON,
        title: broadcastTitle,
        message: broadcastMessage,
        severity: broadcastSeverity,
        target_threat: scanResult?.dominant_threat?.pest_or_disease,
      }

      const res = await axios.post('/api/v1/outbreak/scan-area/broadcast-advisory', payload, { headers })
      setBroadcastStatus({
        type: 'success',
        message: res.data.message || 'Advisory successfully broadcasted to regional farm owners.',
      })
      setTimeout(() => {
        setShowBroadcastModal(false)
        setBroadcastStatus(null)
      }, 2500)
    } catch (err) {
      setBroadcastStatus({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to dispatch regional advisory.',
      })
    } finally {
      setBroadcasting(false)
    }
  }

  if (!scanResult && !loading && !error) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-[1000] max-w-4xl mx-auto px-4 pb-4"
      >
        <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-stone-200/90 overflow-hidden">
          {/* Header Bar / Drag Handle */}
          <div className="flex items-center justify-between px-6 py-3 bg-stone-50/80 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Regional Boundary Analysis
              </span>
              {scanResult && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">
                  {scanResult.farm_count} Farms Identified
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-stone-500 hover:text-stone-800 p-1 rounded-lg hover:bg-stone-200/60 transition-colors"
                title={isExpanded ? 'Collapse Sheet' : 'Expand Sheet'}
              >
                {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
              <button
                onClick={onClear}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-200/60 transition-colors"
                title="Clear Boundary"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="p-6 space-y-5 max-h-[60vh] overflow-y-auto"
              >
                {/* 1. Loading State */}
                {loading && (
                  <div className="space-y-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
                      <p className="text-sm font-semibold text-stone-700">
                        Querying MongoDB 2dsphere index & aggregating SHAP risk vectors...
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

                {/* 2. Error State (e.g. AREA_TOO_LARGE) */}
                {error && !loading && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3">
                    <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-sm">Zone Scan Exceeded</p>
                      <p className="leading-relaxed">{error}</p>
                      <p className="text-stone-600 pt-1">
                        Tip: Zoom in using the +/- controls and draw a compact boundary over specific farm clusters.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. Empty State (0 Farms Found) */}
                {!loading && !error && scanResult?.farm_count === 0 && (
                  <div className="text-center py-6 space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                      <MapPin size={24} />
                    </div>
                    <p className="text-stone-800 font-bold text-sm">No Registered Farms in this Polygon</p>
                    <p className="text-stone-500 text-xs max-w-md mx-auto leading-relaxed">
                      No plots are currently registered inside this geographical perimeter.
                      Try drawing a wider boundary or shift coordinates toward monitored agro-clusters.
                    </p>
                  </div>
                )}

                {/* 4. Active Scan Results */}
                {!loading && !error && scanResult && scanResult.farm_count > 0 && (
                  <>
                    {/* Risk Breakdown Chips */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-2xl bg-red-50/80 border border-red-200 text-center">
                        <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider block">
                          High Threat
                        </span>
                        <p className="text-2xl font-black text-red-800 mt-0.5">
                          {scanResult.risk_breakdown?.High || 0}
                        </p>
                        <span className="text-[10px] text-red-600 font-medium">Urgent intervention</span>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-center">
                        <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                          Medium Alert
                        </span>
                        <p className="text-2xl font-black text-amber-800 mt-0.5">
                          {scanResult.risk_breakdown?.Medium || 0}
                        </p>
                        <span className="text-[10px] text-amber-600 font-medium">Proactive scouting</span>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-green-50/80 border border-green-200 text-center">
                        <span className="text-[11px] font-bold text-green-700 uppercase tracking-wider block">
                          Low Risk
                        </span>
                        <p className="text-2xl font-black text-green-800 mt-0.5">
                          {scanResult.risk_breakdown?.Low || 0}
                        </p>
                        <span className="text-[10px] text-green-600 font-medium">Optimal health</span>
                      </div>
                    </div>

                    {/* Dominant Threat & SHAP Summary Card */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                          <Sparkles size={14} className="text-emerald-600" />
                          Dominant Regional Threat
                        </div>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                          {scanResult.dominant_threat?.affected_farm_count} Farms Impacted
                        </span>
                      </div>
                      <h4 className="text-lg font-black text-stone-900">
                        {scanResult.dominant_threat?.pest_or_disease}
                      </h4>
                      <div className="flex items-start gap-2 pt-1">
                        <Info size={14} className="text-emerald-700 shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-950 leading-relaxed font-medium">
                          {scanResult.dominant_threat?.shap_summary}
                        </p>
                      </div>
                    </div>

                    {/* Action Bar (Agronomist / Admin Broadcast) */}
                    {canBroadcast && (
                      <div className="pt-2">
                        <button
                          onClick={() => setShowBroadcastModal(true)}
                          className="w-full btn-primary py-3 flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 text-sm"
                        >
                          <BellRing size={16} /> Broadcast Advisory to All {scanResult.farm_count} Farms
                        </button>
                      </div>
                    )}

                    {/* Farm Details Mini-Roster */}
                    <div className="space-y-2 pt-1">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                        <Layers size={13} className="text-stone-500" /> Registered Plots in Scanned Area
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                        {scanResult.farms?.map((f) => (
                          <div
                            key={f.farm_id}
                            className="p-2.5 rounded-xl border border-stone-200 bg-stone-50/60 flex items-center justify-between text-xs"
                          >
                            <div className="truncate pr-2">
                              <span className="font-bold text-stone-800 block truncate">{f.name}</span>
                              <span className="text-[11px] text-stone-500 font-mono">
                                {f.crop_type} · {f.threat_name}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                                f.risk_level === 'High'
                                  ? 'bg-red-100 text-red-700'
                                  : f.risk_level === 'Medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
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

        {/* Broadcast Advisory Modal */}
        {showBroadcastModal && (
          <div className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-stone-200 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <Send size={18} className="text-emerald-600" />
                  <span>Send Regional Advisory Alert</span>
                </div>
                <button
                  onClick={() => setShowBroadcastModal(false)}
                  className="text-stone-400 hover:text-stone-700 p-1"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleBroadcast} className="space-y-3.5 text-xs">
                <div>
                  <label className="label text-xs">Target Threat</label>
                  <input
                    type="text"
                    disabled
                    value={scanResult?.dominant_threat?.pest_or_disease || 'General Threat'}
                    className="input-field bg-stone-100 text-stone-600 text-xs cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="label text-xs">Advisory Severity</label>
                  <select
                    value={broadcastSeverity}
                    onChange={(e) => setBroadcastSeverity(e.target.value)}
                    className="input-field text-xs font-semibold"
                  >
                    <option value="High">High Threat (Immediate Action)</option>
                    <option value="Medium">Medium Alert (Preventive Scouting)</option>
                    <option value="Low">Low Risk (Standard Protocol)</option>
                  </select>
                </div>

                <div>
                  <label className="label text-xs">Advisory Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Urgent Whitefly Alert - Kovilpatti Cotton Belt"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    className="input-field text-xs"
                  />
                </div>

                <div>
                  <label className="label text-xs">Agronomic Guidance & Spray Schedule</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Enter prescribed organic or chemical treatment, dosage, and meteorological spraying window..."
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    className="input-field text-xs"
                  />
                </div>

                {broadcastStatus && (
                  <div
                    className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                      broadcastStatus.type === 'success'
                        ? 'bg-green-50 text-green-800 border border-green-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {broadcastStatus.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                    <span>{broadcastStatus.message}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setShowBroadcastModal(false)}
                    className="btn-secondary py-2 px-4 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={broadcasting}
                    className="btn-primary py-2 px-5 text-xs flex items-center gap-2"
                  >
                    {broadcasting ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Dispatching...
                      </>
                    ) : (
                      <>
                        <Send size={13} /> Dispatch to {scanResult?.farm_count} Farms
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
