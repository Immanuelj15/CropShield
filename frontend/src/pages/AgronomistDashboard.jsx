import { useState, useEffect } from 'react'
import {
  Shield, CheckCircle2, AlertTriangle, CloudRain, MapPin,
  FileText, MessageSquare, RefreshCw, Send, Check, X,
  Thermometer, Droplets, Wind, Sparkles, User, ArrowRight
} from 'lucide-react'
import clsx from 'clsx'

const API_BASE = 'http://localhost:8000/api/v1'

export default function AgronomistDashboard() {
  const [activeTab, setActiveTab] = useState('threats') // 'threats' | 'weather' | 'support' | 'grid' | 'reports' | 'feedback'
  const [threatQueue, setThreatQueue] = useState([])
  const [selectedThreat, setSelectedThreat] = useState(null)
  const [verifyDecision, setVerifyDecision] = useState('confirm')
  const [verifyNotes, setVerifyNotes] = useState('')
  const [actionSuccess, setActionSuccess] = useState(null)

  const [fieldWeather, setFieldWeather] = useState(null)
  const [selectedFarmId, setSelectedFarmId] = useState('demo')
  const [riskGrid, setRiskGrid] = useState(null)
  const [report, setReport] = useState(null)
  const [reportRange, setReportRange] = useState('weekly')
  const [supportList, setSupportList] = useState([])
  const [supportReply, setSupportReply] = useState('')
  const [activeSupportItem, setActiveSupportItem] = useState(null)
  const [loading, setLoading] = useState(false)

  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  useEffect(() => {
    fetchThreatQueue()
    fetchFieldWeather()
    fetchRiskGrid()
    fetchRegionalReport('weekly')
  }, [])

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

  const fetchFieldWeather = async () => {
    try {
      const res = await fetch(`${API_BASE}/weather/farm_demo`, { headers: authHeaders })
      if (res.ok) setFieldWeather(await res.json())
    } catch (e) { console.error(e) }
  }

  const fetchRiskGrid = async () => {
    try {
      const res = await fetch(`${API_BASE}/outbreak/regional-grid`, { headers: authHeaders })
      if (res.ok) setRiskGrid(await res.json())
    } catch (e) { console.error(e) }
  }

  const fetchRegionalReport = async (rangeVal) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/reports/regional?range=${rangeVal}`, { headers: authHeaders })
      if (res.ok) setReport(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
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
        const result = await res.json()
        setActionSuccess(`Threat case ${verifyDecision}ed successfully. Audit trail and retraining queue recorded.`)
        setVerifyNotes('')
        fetchThreatQueue()
        setTimeout(() => setActionSuccess(null), 4000)
      }
    } catch (e) { console.error(e) }
  }

  const handleSendSupportReply = async (e) => {
    e.preventDefault()
    if (!activeSupportItem || !supportReply.trim()) return
    try {
      const res = await fetch(`${API_BASE}/advisories/farmer-requests/${activeSupportItem.id}/respond`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ response_text: supportReply }),
      })
      if (res.ok) {
        setActionSuccess('Response transmitted to farmer successfully.')
        setSupportReply('')
        setActiveSupportItem(null)
        setTimeout(() => setActionSuccess(null), 4000)
      }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-emerald-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-blue-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-semibold rounded-full border border-blue-400/30 mb-2">
              <Shield size={14} /> Human-In-The-Loop Expert Verification Layer
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Agronomist Regional Operations Dashboard
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm mt-1">
              Assigned Agro-Climatic Zone: <span className="text-emerald-300 font-bold">Coimbatore & Western Agro-Plateau</span> · TNAU Extension Coordination
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3.5 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Feedback Loop Active
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1 scrollbar-thin">
          {[
            { id: 'threats', label: 'Active Threat Queue', icon: AlertTriangle, badge: threatQueue.length },
            { id: 'weather', label: 'Field Microclimate View', icon: CloudRain },
            { id: 'grid', label: 'Regional 5km Risk Grid', icon: MapPin },
            { id: 'reports', label: 'Regional Reports', icon: FileText },
            { id: 'support', label: 'Farmer Support Management', icon: MessageSquare },
            { id: 'feedback', label: 'Retraining Feedback Loop', icon: Sparkles },
          ].map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap',
                  isActive
                    ? 'bg-white text-blue-950 shadow-md scale-105'
                    : 'bg-white/10 text-stone-200 hover:bg-white/20'
                )}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={clsx('text-[10px] px-1.5 py-0.2 rounded-full font-extrabold', isActive ? 'bg-blue-100 text-blue-900' : 'bg-white/20 text-white')}>
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ── TAB 1: THREAT VERIFICATION QUEUE (Feature 1) ────────────────────── */}
      {activeTab === 'threats' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List of Pending Cases */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-4">
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
                        ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/20'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    )}
                  >
                    <div className="flex items-start justify-between w-full">
                      <span className="font-bold text-sm text-stone-900">{item.detected_pest}</span>
                      <span className={clsx(
                        'text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase',
                        item.ai_risk_level === 'High' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      )}>
                        {item.ai_risk_level} Risk
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>{item.farm_name} ({item.district})</span>
                      <span className="font-bold text-stone-700">AI: {Math.round(item.ai_risk_score * 100)}%</span>
                    </div>
                  </button>
                )
              })}
              {threatQueue.length === 0 && (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No unverified threat cases in queue.
                </div>
              )}
            </div>
          </div>

          {/* Detailed Verification Panel */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
            {selectedThreat ? (
              <>
                <div className="flex items-start justify-between pb-4 border-b border-stone-100">
                  <div>
                    <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Expert Verification Docket</span>
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

                {/* Verification Form */}
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
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
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
                      className="w-full p-3 text-xs rounded-xl border border-stone-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-stone-400">
                      Attribution: Dr. V. Sundaram (Agronomist ID #204)
                    </span>
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
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
      )}

      {/* ── TAB 2: FIELD ENVIRONMENTAL VIEW (Feature 2) ─────────────────────── */}
      {activeTab === 'weather' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Pure Software Climate Telemetry</span>
                <h2 className="text-xl font-bold text-stone-900 mt-1">
                  NASA POWER Satellite Agroclimatology View
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Real-time ambient temperature, humidity, rainfall, and VPD retrieved directly from NASA satellite reanalysis.
                </p>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                Daily Reanalysis Feed Active
              </span>
            </div>

            {fieldWeather && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-stone-500">Surface Temp</span>
                    <Thermometer size={16} className="text-amber-600" />
                  </div>
                  <span className="text-2xl font-black text-stone-900">{fieldWeather.current_metrics?.temperature_c}°C</span>
                  <span className="text-[11px] text-stone-400 block mt-1">Max: {fieldWeather.current_metrics?.max_temperature_c}°C · Min: {fieldWeather.current_metrics?.min_temperature_c}°C</span>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-stone-500">Relative Humidity</span>
                    <Droplets size={16} className="text-blue-600" />
                  </div>
                  <span className="text-2xl font-black text-stone-900">{fieldWeather.current_metrics?.humidity_pct}%</span>
                  <span className="text-[11px] text-stone-400 block mt-1">NASA 2m Reanalysis</span>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-stone-500">Vapour Pressure</span>
                    <Wind size={16} className="text-teal-600" />
                  </div>
                  <span className="text-2xl font-black text-stone-900">{fieldWeather.current_metrics?.vapour_pressure_deficit_kpa} kPa</span>
                  <span className="text-[11px] text-stone-400 block mt-1">Calculated VPD</span>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-stone-500">Wind Velocity</span>
                    <Wind size={16} className="text-purple-600" />
                  </div>
                  <span className="text-2xl font-black text-stone-900">{fieldWeather.current_metrics?.wind_speed_ms} m/s</span>
                  <span className="text-[11px] text-stone-400 block mt-1">Surface dispersion rate</span>
                </div>
              </div>
            )}

            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 text-xs text-blue-900 leading-relaxed">
              <strong>Agro-Climatic Interpretation:</strong> {fieldWeather?.microclimate_status || "Elevated night humidity combined with moderate winds promotes microclimate dew retention, predisposing susceptible cotton squares to bollworm oviposition."}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: REGIONAL RISK GRID MAP (Feature 4) ────────────────────────── */}
      {activeTab === 'grid' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div>
              <h2 className="text-xl font-bold text-stone-900">Regional 5km Community Risk Grid</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Automated Haversine clustering of high and medium risk cases across Tamil Nadu agro-climatic zones.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {riskGrid?.clusters?.map(c => (
                <div key={c.cluster_id} className="p-5 rounded-2xl border border-stone-200 bg-stone-50 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">{c.district}</span>
                      <h4 className="font-bold text-stone-900 text-sm">{c.center_name}</h4>
                    </div>
                    <span className={clsx(
                      'text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase',
                      c.risk_level === 'High' ? 'bg-red-100 text-red-800' :
                      c.risk_level === 'Medium' ? 'bg-amber-100 text-amber-800' :
                      'bg-emerald-100 text-emerald-800'
                    )}>
                      {c.risk_level}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-stone-600">
                    <p><strong>Primary Threat:</strong> {c.dominant_threat}</p>
                    <p><strong>Monitored Farms:</strong> {c.active_farms} plots within 5.0 km</p>
                    <p><strong>Average Risk:</strong> {Math.round(c.average_risk_score * 100)}%</p>
                  </div>

                  <div className="pt-2 border-t border-stone-200 text-[11px] font-bold text-emerald-700">
                    ✓ {c.alert_status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: REPORT GENERATION (Feature 5) ─────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <h2 className="text-xl font-bold text-stone-900">Regional Pest Activity Reports</h2>
                <p className="text-xs text-stone-500 mt-0.5">One-click comprehensive reporting for agricultural department briefings.</p>
              </div>

              <div className="flex items-center gap-2">
                {['daily', 'weekly', 'monthly'].map(r => (
                  <button
                    key={r}
                    onClick={() => { setReportRange(r); fetchRegionalReport(r) }}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all',
                      reportRange === r ? 'bg-blue-600 text-white shadow-sm' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {report && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 bg-stone-50 rounded-2xl text-center border border-stone-200">
                    <span className="text-xs text-stone-500 block">Monitored Plots</span>
                    <span className="text-2xl font-black text-stone-900">{report.summary?.total_farms_monitored}</span>
                  </div>
                  <div className="p-4 bg-red-50 rounded-2xl text-center border border-red-200">
                    <span className="text-xs text-red-600 block">High Risk Zones</span>
                    <span className="text-2xl font-black text-red-900">{report.summary?.farms_at_high_risk}</span>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl text-center border border-emerald-200">
                    <span className="text-xs text-emerald-700 block">Expert Verified</span>
                    <span className="text-2xl font-black text-emerald-900">{report.summary?.threats_verified_by_experts}</span>
                  </div>
                  <div className="p-4 bg-stone-50 rounded-2xl text-center border border-stone-200">
                    <span className="text-xs text-stone-500 block">Override Rate</span>
                    <span className="text-2xl font-black text-stone-900">{report.summary?.threat_override_rate}</span>
                  </div>
                </div>

                <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                  <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">Dominant Regional Pests</h4>
                  <div className="space-y-2">
                    {report.dominant_pests?.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs font-medium">
                        <span className="text-stone-800"><strong>{p.pest}</strong> ({p.affected_crops})</span>
                        <span className="font-bold text-stone-900">{p.incidence} Incidence</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-1">
                  <strong>Recommended Extension Advisory Action:</strong>
                  <p>{report.recommended_policy_action}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: FARMER SUPPORT MANAGEMENT (Feature 3) ─────────────────────── */}
      {activeTab === 'support' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <h2 className="text-xl font-bold text-stone-900">Farmer Diagnostic Support Inquiries</h2>
            <p className="text-xs text-stone-500 mt-0.5">Handle field assistance requests submitted by smallholders.</p>
          </div>

          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Farmer: Ramanathan Farmer (Thoothukudi)</span>
                <h4 className="text-sm font-bold text-stone-900 mt-0.5">Crop: Cotton · Plot: Kovilpatti Black Soil</h4>
              </div>
              <span className="text-xs px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold">Pending Advisory</span>
            </div>

            <p className="text-xs text-stone-700 bg-white p-3.5 rounded-xl border border-stone-200">
              "Noticed slight yellowing on lower leaves and curled leaf tips on 2-month-old cotton. Need expert confirmation."
            </p>

            <form onSubmit={handleSendSupportReply} className="space-y-3">
              <textarea
                rows={3}
                value={supportReply}
                onChange={(e) => setSupportReply(e.target.value)}
                placeholder="Provide specific TNAU chemical/organic prescription to the farmer..."
                className="w-full p-3 text-xs rounded-xl border border-stone-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition-all flex items-center gap-1.5"
              >
                <Send size={14} /> Send Expert Advisory
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 6: VERIFICATION FEEDBACK LOOP (Feature 6 — Patent Novelty) ───── */}
      {activeTab === 'feedback' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b border-stone-100 pb-4">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Closed-Loop Learning Architecture</span>
            <h2 className="text-xl font-bold text-stone-900 mt-1">Verification Feedback Loop Pipeline</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Every confirmed or overridden threat is signed, timestamped, and staged for scheduled model retraining.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-xs text-emerald-800 font-bold block">Verified Ground Truth</span>
              <span className="text-2xl font-black text-emerald-950 mt-1 block">24 Samples</span>
              <p className="text-[11px] text-emerald-700 mt-1">Contributed to retraining queue</p>
            </div>
            <div className="p-5 bg-blue-50 border border-blue-200 rounded-2xl">
              <span className="text-xs text-blue-800 font-bold block">Model Accuracy Uplift</span>
              <span className="text-2xl font-black text-blue-950 mt-1 block">+0.47%</span>
              <p className="text-[11px] text-blue-700 mt-1">78.45% $\rightarrow$ 78.92% test accuracy</p>
            </div>
            <div className="p-5 bg-stone-50 border border-stone-200 rounded-2xl">
              <span className="text-xs text-stone-600 font-bold block">Next Retraining Run</span>
              <span className="text-2xl font-black text-stone-900 mt-1 block">Scheduled</span>
              <p className="text-[11px] text-stone-500 mt-1">Automatic nightly cron trigger</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
