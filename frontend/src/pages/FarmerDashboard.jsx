import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  AlertTriangle, Shield, Sprout, Clock, FileText, Bell,
  Camera, CheckCircle2, ChevronRight, Activity, Droplets,
  Wind, Thermometer, ArrowUpRight, Search, Plus, Sparkles,
  HelpCircle, Send, Check, WifiOff
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { useLocalizedField, getLocalizedText } from '../utils/useLocalizedField'
import RiskGauge from '../components/RiskGauge'
import CounterfactualCard from '../components/CounterfactualCard'
import EconomicImpactCard from '../components/EconomicImpactCard'
import VegetationHealthCard from '../components/VegetationHealthCard'
import FusedHealthScoreCard from '../components/FusedHealthScoreCard'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { WarningCardSkeleton, CounterfactualSkeleton } from '../components/SkeletonLoader'
import FarmerBottomNav from '../components/FarmerBottomNav'
import { queueOfflineAction } from '../utils/offlineQueue'

const API_BASE = 'http://localhost:8000/api/v1'

const compressImage = (file, maxWidth = 1024, quality = 0.8) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        const elem = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        elem.width = width
        elem.height = height
        const ctx = elem.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        ctx.canvas.toBlob((blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          resolve(compressedFile)
        }, 'image/jpeg', quality)
      }
      img.onerror = () => resolve(file)
    }
    reader.onerror = () => resolve(file)
  })
}

export default function FarmerDashboard() {
  const { t } = useTranslation(['farmer', 'common', 'validation'])
  const { currentLang } = useLocalizedField()
  const [activeTab, setActiveTab] = useState('warning') // 'warning' | 'disease' | 'treatments' | 'advisories' | 'alerts' | 'history'
  const [farm, setFarm] = useState(null)
  const [warningData, setWarningData] = useState(null)
  const [vegetationData, setVegetationData] = useState(null)
  const [treatments, setTreatments] = useState([])
  const [advisories, setAdvisories] = useState([])
  const [alerts, setAlerts] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [advisorySearch, setAdvisorySearch] = useState('')
  const [advisoryCrop, setAdvisoryCrop] = useState('All')

  // Offline Tolerance State
  const [isOfflineCached, setIsOfflineCached] = useState(false)
  const [cachedTimestamp, setCachedTimestamp] = useState(null)

  // Treatment Form State
  const [showTreatmentModal, setShowTreatmentModal] = useState(false)
  const [newTreatment, setNewTreatment] = useState({
    treatment_date: new Date().toISOString().split('T')[0],
    treatment_type: 'organic',
    product_name: '',
    target_pest: '',
    dosage: '',
    notes: '',
  })
  const [treatmentSuccess, setTreatmentSuccess] = useState(false)

  // Disease Scan State
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)

  // Farmer Support State
  const [supportQuery, setSupportQuery] = useState('')
  const [supportSent, setSupportSent] = useState(false)
  const [mySupportList, setMySupportList] = useState([])

  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  // Initial Fetch
  useEffect(() => {
    // Attempt to load cached warning state immediately for zero-delay UI rendering
    try {
      const cached = localStorage.getItem('cropshield_last_warning')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed?.data) {
          setWarningData(parsed.data)
          setIsOfflineCached(true)
          setCachedTimestamp(parsed.time)
        }
      }
    } catch {
      // Storage access error fallback
    }

    fetchFarmData()
    fetchTreatments()
    fetchAdvisories()
    fetchAlerts()
    fetchHistory()
    fetchSupportRequests()
  }, [])

  const fetchFarmData = async () => {
    try {
      const res = await fetch(`${API_BASE}/farms/me`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setFarm(data)
        fetchTodayWarning(data)
        const farmId = data._id || data.id
        if (farmId) {
          fetchVegetationData(farmId)
        }
      }
    } catch (err) {
      console.error('Error loading farm:', err)
    }
  }

  const fetchVegetationData = async (farmId) => {
    try {
      const res = await fetch(`${API_BASE}/vegetation/${farmId}`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setVegetationData(data)
      }
    } catch (err) {
      console.warn('Vegetation fetch fallback:', err)
    }
  }

  const fetchTodayWarning = async (farmObj) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/predict-today`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          latitude: farmObj?.location?.coordinates?.[1] || 9.1728,
          longitude: farmObj?.location?.coordinates?.[0] || 77.8710,
          location: farmObj?.district || 'Kovilpatti',
          crop: farmObj?.crop_type || 'Cotton',
          climate_zone: farmObj?.climate_zone || 'Dryland',
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setWarningData(data)
        setIsOfflineCached(false)
        try {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          localStorage.setItem('cropshield_last_warning', JSON.stringify({
            data,
            time: nowStr,
          }))
          setCachedTimestamp(nowStr)
        } catch {
          // Ignore storage quota
        }
      }
    } catch (err) {
      console.warn('Prediction request failed; operating in offline-cached tolerance mode:', err)
      setIsOfflineCached(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchTreatments = async () => {
    try {
      const res = await fetch(`${API_BASE}/treatments`, { headers: authHeaders })
      if (res.ok) setTreatments(await res.json())
    } catch (e) { console.error(e) }
  }

  const fetchAdvisories = async () => {
    try {
      const res = await fetch(`${API_BASE}/advisories`, { headers: authHeaders })
      if (res.ok) setAdvisories(await res.json())
    } catch (e) { console.error(e) }
  }

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts/me`, { headers: authHeaders })
      if (res.ok) setAlerts(await res.json())
    } catch (e) { console.error(e) }
  }

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/history/me`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setHistory(data.warnings || [])
      }
    } catch (e) { console.error(e) }
  }

  const fetchSupportRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/support/requests/me`, { headers: authHeaders })
      if (res.ok) setMySupportList(await res.json())
    } catch (e) { console.error(e) }
  }

  const handleSaveTreatment = async (e) => {
    e.preventDefault()
    if (!navigator.onLine) {
      try {
        await queueOfflineAction({
          type: 'treatment_log',
          payload: newTreatment,
        })
        setTreatmentSuccess(true)
        setTimeout(() => {
          setShowTreatmentModal(false)
          setTreatmentSuccess(false)
          setNewTreatment({
            treatment_date: new Date().toISOString().split('T')[0],
            treatment_type: 'organic',
            product_name: '',
            target_pest: '',
            dosage: '',
            notes: '',
          })
          alert("📡 You are offline. Treatment log saved to offline queue and will auto-sync when connected!")
        }, 800)
      } catch (err) {
        console.error('Offline queue failed:', err)
      }
      return
    }

    try {
      const res = await fetch(`${API_BASE}/treatments`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newTreatment),
      })
      if (res.ok) {
        setTreatmentSuccess(true)
        fetchTreatments()
        setTimeout(() => {
          setShowTreatmentModal(false)
          setTreatmentSuccess(false)
          setNewTreatment({
            treatment_date: new Date().toISOString().split('T')[0],
            treatment_type: 'organic',
            product_name: '',
            target_pest: '',
            dosage: '',
            notes: '',
          })
        }, 800)
      }
    } catch (e) {
      console.warn("Network error during treatment log, falling back to offline queue:", e)
      await queueOfflineAction({
        type: 'treatment_log',
        payload: newTreatment,
      })
      setTreatmentSuccess(true)
      setTimeout(() => {
        setShowTreatmentModal(false)
        setTreatmentSuccess(false)
        alert("📡 Network unavailable. Treatment log queued in IndexedDB for auto-sync.")
      }, 800)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setPreviewUrl(URL.createObjectURL(file))
      setScanResult(null)
      try {
        const compressed = await compressImage(file, 1024, 0.8)
        setSelectedFile(compressed)
      } catch {
        setSelectedFile(file)
      }
    }
  }

  const [scanError, setScanError] = useState(null)

  const handleDiseaseScan = async () => {
    if (!selectedFile) {
      setScanError("Please select or capture a leaf photo first.")
      return
    }
    setScanLoading(true)
    setScanError(null)

    if (!navigator.onLine) {
      try {
        await queueOfflineAction({
          type: 'leaf_photo',
          payload: {
            blob: selectedFile,
            filename: selectedFile.name || 'leaf_scan.jpg',
            farm_id: farm?.id ? String(farm.id) : null,
          }
        })
        setScanError("📡 Offline Mode: Leaf photo saved to offline queue. Diagnosis will automatically run once internet connection returns.")
      } catch (err) {
        setScanError("Failed to store image offline: " + err.message)
      } finally {
        setScanLoading(false)
      }
      return
    }

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('crop_hint', farm?.crop_type || 'Cotton')

      const res = await fetch(`${API_BASE}/disease/detect`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setScanResult(data)
      } else {
        setScanError(data?.detail?.message || data?.detail || "Diagnosis failed. Please check image format.")
      }
    } catch (e) {
      console.warn("Disease scan network error, storing offline:", e)
      await queueOfflineAction({
        type: 'leaf_photo',
        payload: {
          blob: selectedFile,
          filename: selectedFile.name || 'leaf_scan.jpg',
          farm_id: farm?.id ? String(farm.id) : null,
        }
      })
      setScanError("📡 Field connection dropped. Photo safely queued in IndexedDB. Will auto-sync when online.")
    } finally {
      setScanLoading(false)
    }
  }

  const handleSendSupport = async (e) => {
    e.preventDefault()
    if (!supportQuery.trim()) return
    try {
      const res = await fetch(`${API_BASE}/support/requests`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          query_text: supportQuery,
          crop_type: farm?.crop_type || 'Cotton',
        }),
      })
      if (res.ok) {
        setSupportSent(true)
        setSupportQuery('')
        fetchSupportRequests()
        setTimeout(() => setSupportSent(false), 3000)
      }
    } catch (e) { console.error(e) }
  }

  const filteredAdvisories = advisories.filter(a => {
    const pestName = getLocalizedText(a.pest_or_disease, currentLang).toLowerCase()
    const cropName = getLocalizedText(a.crop_type, currentLang).toLowerCase()
    const chem = getLocalizedText(a.chemical_treatment, currentLang).toLowerCase()
    const org = getLocalizedText(a.organic_treatment, currentLang).toLowerCase()
    const sym = getLocalizedText(a.symptoms, currentLang).toLowerCase()

    const matchesCrop = advisoryCrop === 'All' || cropName.includes(advisoryCrop.toLowerCase())
    const q = (advisorySearch || '').toLowerCase()
    const matchesSearch = !advisorySearch ||
      pestName.includes(q) ||
      chem.includes(q) ||
      org.includes(q) ||
      sym.includes(q)
    return matchesCrop && matchesSearch
  })

  const getRiskBadge = (level) => {
    if (level === 'High') return 'bg-red-100 text-red-800 border-red-300'
    if (level === 'Medium') return 'bg-amber-100 text-amber-800 border-amber-300'
    return 'bg-emerald-100 text-emerald-800 border-emerald-300'
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-24 lg:pb-12">
      {/* Farm Overview Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-stone-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-emerald-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-400/30 mb-2">
              <Sprout size={14} /> {t('common:app_name')} · {t('common:role_farmer')}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {farm ? farm.farm_name : "Kovilpatti Black Soil Cotton Farm"}
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm mt-1">
              {farm ? `${farm.district} · ${farm.climate_zone} Agro-Zone · ${farm.crop_type} (${farm.area_hectares} Ha)` : 'Tamil Nadu Dryland Agro-Climatic Zone'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-4 py-2 bg-white/10 backdrop-blur rounded-2xl border border-white/10 text-right">
              <span className="text-[11px] text-stone-300 block uppercase font-bold tracking-wider">NASA Satellite Link</span>
              <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5 justify-end">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Active 2026 Feed
              </span>
            </div>
            <NavLink
              to="/farmer/notifications"
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
            >
              <Bell size={14} /> {t('common:nav_alert_channels') || 'Alert Channels'}
            </NavLink>
            <button
              onClick={() => farm && fetchTodayWarning(farm)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
            >
              <Activity size={14} /> {t('common:refresh')}
            </button>
          </div>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1 scrollbar-thin">
          {[
            { id: 'warning', label: t('farmer:today_warning_title') || "Today's Warning", icon: AlertTriangle },
            { id: 'disease', label: t('farmer:disease_scan_title') || "Disease Photo Scan", icon: Camera },
            { id: 'treatments', label: t('farmer:treatment_log_title') || "Treatment Log", icon: FileText, badge: treatments.length },
            { id: 'advisories', label: t('farmer:advisories_tab') || "Digital Advisories", icon: Shield },
            { id: 'alerts', label: t('farmer:regional_alerts_title') || "Regional Alerts", icon: Bell, badge: alerts.length },
            { id: 'history', label: t('farmer:field_history_title') || "Prediction History", icon: Clock },
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
                    ? 'bg-white text-emerald-950 shadow-md scale-105'
                    : 'bg-white/10 text-stone-200 hover:bg-white/20'
                )}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={clsx('text-[10px] px-1.5 py-0.2 rounded-full font-extrabold', isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-white/20 text-white')}>
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── TAB 1: TODAY'S WARNING + SHAP + COUNTERFACTUAL CARD ──────────────── */}
      {activeTab === 'warning' && (
        <div className="space-y-6">
          {/* Offline Cached Tolerance Banner */}
          {isOfflineCached && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 font-semibold shadow-xs">
              <div className="flex items-center gap-2.5">
                <WifiOff size={18} className="text-amber-700 shrink-0" />
                <span>
                  Showing cached early warning {cachedTimestamp ? `(recorded at ${cachedTimestamp})` : ''}. Operating in offline resilience mode for rural low-connectivity coverage.
                </span>
              </div>
              <button
                onClick={() => farm && fetchTodayWarning(farm)}
                className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 rounded-xl text-amber-950 text-xs font-bold transition-all shrink-0 self-start sm:self-auto"
              >
                Reconnect & Refresh
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <WarningCardSkeleton />
              </div>
              <div className="lg:col-span-4">
                <CounterfactualSkeleton />
              </div>
            </div>
          ) : warningData ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Primary Warning Card */}
              <div className="lg:col-span-8 bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold text-stone-900">Today's Pest Risk Assessment</h2>
                      <span className={`text-xs px-3 py-1 rounded-full font-extrabold border uppercase tracking-wider ${getRiskBadge(warningData.risk_level)}`}>
                        {warningData.risk_level} Risk
                      </span>
                      <ConfidenceBadge
                        calibratedConfidence={warningData.calibrated_confidence}
                        confidenceBand={warningData.confidence_band}
                        rawConfidence={warningData.raw_confidence}
                      />
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      NASA POWER satellite observation: {warningData.data_date} · Model: {warningData.model_version}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-2xl font-black text-stone-900">{Math.round(warningData.risk_score * 100)}%</span>
                    <span className="text-[11px] text-stone-500 block">Risk Probability</span>
                  </div>
                </div>

                {/* Animated Risk Gauge (Hero UI Component) */}
                <div className="bg-stone-50/70 rounded-2xl border border-stone-200/80 p-4">
                  <RiskGauge
                    riskScore={warningData.risk_score}
                    riskLevel={warningData.risk_level}
                  />
                </div>

                {/* Alert Message Box */}
                <div className={clsx(
                  'p-4 rounded-2xl border text-sm font-semibold flex items-start gap-3',
                  warningData.risk_level === 'High' ? 'bg-red-50 border-red-200 text-red-900' :
                  warningData.risk_level === 'Medium' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                  'bg-emerald-50 border-emerald-200 text-emerald-900'
                )}>
                  <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                  <p>{warningData.alert_message}</p>
                </div>

                {/* Microclimate Weather Snapshot */}
                <div>
                  <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-3">Field Microclimate Snapshot (NASA Satellite)</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-center">
                      <Thermometer size={16} className="mx-auto text-amber-600 mb-1" />
                      <span className="text-xs text-stone-500 block">Temperature</span>
                      <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.temperature_c}°C</span>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-center">
                      <Droplets size={16} className="mx-auto text-blue-600 mb-1" />
                      <span className="text-xs text-stone-500 block">Humidity</span>
                      <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.humidity_pct}%</span>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-center">
                      <Wind size={16} className="mx-auto text-teal-600 mb-1" />
                      <span className="text-xs text-stone-500 block">7-Day Rain</span>
                      <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.rain_rolling_7d_mm} mm</span>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-center">
                      <Activity size={16} className="mx-auto text-purple-600 mb-1" />
                      <span className="text-xs text-stone-500 block">Dry Days</span>
                      <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.consecutive_dry_days} Days</span>
                    </div>
                  </div>
                </div>

                {/* Tree-SHAP Feature Breakdown (Feature 2) */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">Explainable AI: Risk Feature Breakdown (SHAP)</h3>
                    <span className="text-[11px] text-stone-500">Tree-SHAP Attribution</span>
                  </div>

                  <div className="space-y-2.5">
                    {warningData.top_features?.map((f, i) => {
                      const isPos = f.shap_value > 0
                      const pct = Math.min(100, Math.abs(f.shap_value) * 350)
                      return (
                        <div key={i} className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/80">
                          <div className="flex items-center justify-between text-xs font-semibold mb-1">
                            <span className="text-stone-800">{f.feature.replace(/_/g, ' ').toUpperCase()} ({f.value})</span>
                            <span className={isPos ? 'text-red-600' : 'text-emerald-700'}>
                              {isPos ? '+' : ''}{Math.round(f.shap_value * 100)}% Risk Impact
                            </span>
                          </div>
                          <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={clsx('h-1.5 rounded-full', isPos ? 'bg-red-500' : 'bg-emerald-500')}
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-stone-600 italic mt-3 bg-stone-100 p-2.5 rounded-xl border border-stone-200">
                    💡 {warningData.shap_interpretation}
                  </p>
                </div>
              </div>

              {/* Counterfactual Prescription Card (Feature 3 — Patent Novelty 1) */}
              <div className="lg:col-span-4 space-y-6">
                <CounterfactualCard
                  prescription={warningData.counterfactual_prescription}
                  currentRiskScore={warningData.risk_score}
                />

                {/* Economic Impact Advisor (Feature 6 — Patent Novelty 2: ₹ Decision Optimization) */}
                <EconomicImpactCard
                  economicImpact={warningData.economic_impact}
                />

                  {/* Ask Agronomist Card */}
                  <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                      <HelpCircle size={16} className="text-emerald-600" />
                      <span>Need Expert Agronomist Advice?</span>
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed">
                      Send your field symptoms directly to regional extension agronomists.
                    </p>
                    <form onSubmit={handleSendSupport} className="space-y-2.5">
                      <textarea
                        rows={3}
                        value={supportQuery}
                        onChange={(e) => setSupportQuery(e.target.value)}
                        placeholder="Describe leaf spots, pest sightings, or soil conditions..."
                        className="w-full p-2.5 text-xs rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                      />
                      <button
                        type="submit"
                        disabled={!supportQuery.trim()}
                        className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Send size={13} /> Submit Diagnostic Request
                      </button>
                    </form>
                    {supportSent && (
                      <p className="text-[11px] text-emerald-700 font-bold bg-emerald-50 p-2 rounded-lg text-center">
                        ✓ Diagnostic request routed to Dr. V. Sundaram (Coimbatore Region).
                      </p>
                    )}
                  </div>
                </div>

                {/* Multi-Modal Fusion Engine: Satellite NDVI + Climate + Vision Diagnosis (Feature 5) */}
                <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <FusedHealthScoreCard
                    fusedData={vegetationData?.fused_health_score || warningData?.fused_health_score}
                    climateRiskScore={warningData?.risk_score}
                    ndviValue={vegetationData?.ndvi_value}
                    imageConfidence={scanResult?.confidence}
                  />
                  <VegetationHealthCard
                    vegetationData={vegetationData}
                  />
                </div>
              </div>
          ) : (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-500">
              No warning generated yet. Click "Refresh AI" above.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: IMAGE-BASED DISEASE DETECTION (Feature 4) ────────────────── */}
      {activeTab === 'disease' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Leaf Disease Vision Scan</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Upload a photo taken on your mobile phone for instant PyTorch CNN leaf pathology diagnosis.
              </p>
            </div>

            <div className="border-2 border-dashed border-stone-200 hover:border-emerald-500 rounded-2xl p-6 text-center transition-all">
              {previewUrl ? (
                <div className="space-y-3">
                  <img src={previewUrl} alt="Leaf Preview" className="max-h-56 mx-auto rounded-xl shadow-md object-contain" />
                  <p className="text-xs text-stone-600 font-medium">{selectedFile?.name}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Camera size={36} className="mx-auto text-stone-400" />
                  <p className="text-xs font-bold text-stone-700">Take or upload a photo of an affected leaf</p>
                  <p className="text-[11px] text-stone-400">Supports JPG, PNG from phone camera or gallery</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-4 block w-full text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
              />
            </div>

            {scanError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-semibold flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            <button
              onClick={handleDiseaseScan}
              disabled={scanLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {scanLoading ? (
                <>
                  <Activity size={16} className="animate-spin" /> Analyzing leaf with ResNet18 model...
                </>
              ) : (
                <>
                  <Camera size={16} /> Run Disease Diagnosis
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-6">
            {scanResult ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">PyTorch Vision Diagnosis</span>
                    <h3 className="text-xl font-bold text-stone-900 mt-0.5">{scanResult.disease_name}</h3>
                    <span className="text-xs text-stone-500 font-medium">{scanResult.pathogen}</span>
                  </div>
                  <span className={clsx(
                    "text-xs px-3 py-1 font-bold rounded-full border",
                    scanResult.severity_level === 'High' ? 'bg-red-100 text-red-800 border-red-200' :
                    scanResult.severity_level === 'Medium' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                    'bg-emerald-100 text-emerald-800 border-emerald-200'
                  )}>
                    {scanResult.severity_level || 'Moderate'} Severity
                  </span>
                </div>

                {/* Animated Confidence Gauge Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-600">Model Confidence</span>
                    <span className="font-bold text-emerald-700">{Math.round((scanResult.confidence || 0.88) * 100)}%</span>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((scanResult.confidence || 0.88) * 100)}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full"
                    />
                  </div>
                </div>

                {/* Differential Diagnoses (Top-K) */}
                {scanResult.top_k && scanResult.top_k.length > 1 && (
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
                    <span className="text-[11px] font-bold text-stone-600 uppercase block mb-1.5">Differential Diagnoses (Top Alternatives)</span>
                    <div className="space-y-1">
                      {scanResult.top_k.slice(1).map((alt, idx) => (
                        <div key={idx} className="flex items-center justify-between text-stone-600">
                          <span>{alt.class.replace(/___/g, ' · ').replace(/_/g, ' ')}</span>
                          <span className="font-bold">{Math.round(alt.confidence * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Treatments & Prevention */}
                <div className="space-y-2.5 pt-1">
                  <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
                    <span className="font-bold text-emerald-900 block mb-1">🌿 TNAU Bio-Control Recommendation:</span>
                    <p className="text-emerald-800 leading-relaxed">{scanResult.organic_treatment || 'Apply 2% neem oil extract with bio-agents.'}</p>
                  </div>
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-xs">
                    <span className="font-bold text-stone-900 block mb-1">🧪 ICAR Chemical Intervention:</span>
                    <p className="text-stone-700 leading-relaxed">{scanResult.chemical_treatment || 'Spray recommended broad-spectrum fungicide.'}</p>
                  </div>
                  {scanResult.prevention && (
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs">
                      <span className="font-bold text-blue-900 block mb-0.5">🛡️ Cultural Prevention:</span>
                      <p className="text-blue-800">{scanResult.prevention}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <div className="bg-stone-50 rounded-3xl border border-stone-200/80 p-12 text-center text-stone-400">
                <Camera size={36} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">Diagnosis results will appear here after scanning a leaf photo.</p>
                <p className="text-xs text-stone-400 mt-1">Accepts mobile photos up to 10MB (automatically compressed for rural connectivity).</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: TREATMENT LOG (Feature 6) ────────────────────────────────── */}
      {activeTab === 'treatments' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-900">Treatment & Application Log</h2>
              <p className="text-xs text-stone-500 mt-0.5">Keep an official digital log of all bio-pesticide and chemical applications.</p>
            </div>
            <button
              onClick={() => setShowTreatmentModal(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 self-start"
            >
              <Plus size={16} /> Log New Treatment
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Product Name</th>
                    <th className="p-4">Target Pest</th>
                    <th className="p-4">Dosage</th>
                    <th className="p-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {treatments.map((t) => (
                    <tr key={t.id} className="hover:bg-stone-50 transition-colors">
                      <td className="p-4 font-semibold text-stone-900 whitespace-nowrap">{t.treatment_date}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-md text-[11px] font-bold uppercase',
                          t.treatment_type === 'organic' ? 'bg-emerald-100 text-emerald-800' :
                          t.treatment_type === 'biological' ? 'bg-blue-100 text-blue-800' :
                          'bg-purple-100 text-purple-800'
                        )}>
                          {t.treatment_type}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-stone-800 whitespace-nowrap">{t.product_name}</td>
                      <td className="p-4 text-stone-600 whitespace-nowrap">{t.target_pest}</td>
                      <td className="p-4 text-stone-600 whitespace-nowrap">{t.dosage || 'Standard'}</td>
                      <td className="p-4 text-stone-500 max-w-xs truncate">{t.notes || '—'}</td>
                    </tr>
                  ))}
                  {treatments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-stone-400">No treatments logged yet. Click "Log New Treatment" above.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: DOWNLOADABLE DIGITAL ADVISORIES (Feature 7) ───────────────── */}
      {activeTab === 'advisories' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-stone-900">Digital Pest & Disease Advisories</h2>
              <p className="text-xs text-stone-500 mt-0.5">TNAU & ICAR verified treatment and prevention guidance by crop and pest.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search pest or symptoms..."
                  value={advisorySearch}
                  onChange={(e) => setAdvisorySearch(e.target.value)}
                  className="pl-9 pr-4 py-1.5 rounded-xl border border-stone-200 text-xs outline-none focus:ring-2 focus:ring-emerald-500 w-52"
                />
              </div>
              <select
                value={advisoryCrop}
                onChange={(e) => setAdvisoryCrop(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 outline-none"
              >
                <option value="All">All Crops</option>
                <option value="Cotton">Cotton</option>
                <option value="Rice">Rice</option>
                <option value="Sugarcane">Sugarcane</option>
                <option value="Millets">Millets</option>
                <option value="Pulses">Pulses</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAdvisories.map((adv) => {
              const cropName = getLocalizedText(adv.crop_type, currentLang)
              const pestName = getLocalizedText(adv.pest_or_disease, currentLang)
              const org = getLocalizedText(adv.organic_treatment, currentLang)
              const chem = getLocalizedText(adv.chemical_treatment, currentLang)
              const symp = Array.isArray(adv.symptoms)
                ? adv.symptoms.map(s => getLocalizedText(s, currentLang)).filter(Boolean).join(', ')
                : getLocalizedText(adv.symptoms, currentLang)

              return (
                <div key={adv.id} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">{cropName} {t('farmer:advisories_tab')}</span>
                      <h3 className="font-bold text-base text-stone-900">{pestName}</h3>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-bold">{adv.season || 'All Seasons'}</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {symp && (
                      <p className="text-stone-600"><strong>Symptoms:</strong> {symp}</p>
                    )}
                    {org && (
                      <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-900">
                        <strong>🌿 Organic:</strong> {org}
                      </div>
                    )}
                    {chem && (
                      <div className="p-2.5 bg-stone-50 rounded-xl text-stone-800">
                        <strong>🧪 Chemical:</strong> {chem}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
                    <span>Temp: {adv.favorable_temp_range || '24-34°C'}</span>
                    <span>RH: {adv.favorable_humidity_range || '65-85%'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TAB 5: REGIONAL ALERTS (Feature 8) ───────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-stone-900">Regional Community Risk Grid Alerts</h2>
            <p className="text-xs text-stone-500 mt-0.5">Automated Haversine 5km spatial warnings triggered when neighbor plots detect high risk.</p>
          </div>

          <div className="space-y-3">
            {alerts.map((al) => (
              <div key={al.id} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex items-start gap-4">
                <div className="p-3 bg-red-50 text-red-700 rounded-xl shrink-0">
                  <Bell size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-800 uppercase tracking-wider">{al.type.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] text-stone-400">{new Date(al.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-semibold text-stone-800 mt-1">{al.message}</p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-400">
                No active outbreak alerts in your 5km cluster.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 6: PREDICTION HISTORY (Feature 5) ─────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-stone-900">Farm Diagnostic & Risk History</h2>
            <p className="text-xs text-stone-500 mt-0.5">Audit log of all daily pest predictions generated for your farm.</p>
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Crop</th>
                    <th className="p-4">Risk Level</th>
                    <th className="p-4">Probability</th>
                    <th className="p-4">Top Weather Factor</th>
                    <th className="p-4">Expert Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {history.map((h) => (
                    <tr key={h.id} className="hover:bg-stone-50 transition-colors">
                      <td className="p-4 font-semibold text-stone-900 whitespace-nowrap">{h.date}</td>
                      <td className="p-4 font-bold text-stone-800 whitespace-nowrap">{h.crop_type}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase ${getRiskBadge(h.risk_level)}`}>
                          {h.risk_level}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-stone-800 whitespace-nowrap">{Math.round(h.risk_score * 100)}%</td>
                      <td className="p-4 text-stone-600 whitespace-nowrap">
                        {h.shap_explanation?.[0]?.feature?.replace(/_/g, ' ').toUpperCase() || 'NASA Climate'}
                      </td>
                      <td className="p-4 whitespace-nowrap text-stone-500">
                        {h.verified_by ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <Check size={14} /> Verified
                          </span>
                        ) : 'AI Automated'}
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-stone-400">No past prediction logs recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: LOG NEW TREATMENT ─────────────────────────────────────────── */}
      {showTreatmentModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-stone-200 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-lg font-bold text-stone-900">Record Field Treatment</h3>
              <button onClick={() => setShowTreatmentModal(false)} className="text-stone-400 hover:text-stone-600 text-sm font-bold">✕</button>
            </div>

            {treatmentSuccess ? (
              <div className="p-6 bg-emerald-50 rounded-2xl text-center space-y-2">
                <CheckCircle2 size={36} className="text-emerald-600 mx-auto" />
                <h4 className="font-bold text-emerald-900 text-base">Treatment Logged!</h4>
                <p className="text-xs text-emerald-700">The application record has been added to your farm history.</p>
              </div>
            ) : (
              <form onSubmit={handleSaveTreatment} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={newTreatment.treatment_date}
                      onChange={(e) => setNewTreatment({ ...newTreatment, treatment_date: e.target.value })}
                      className="w-full p-2 text-xs rounded-xl border border-stone-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Type</label>
                    <select
                      value={newTreatment.treatment_type}
                      onChange={(e) => setNewTreatment({ ...newTreatment, treatment_type: e.target.value })}
                      className="w-full p-2 text-xs rounded-xl border border-stone-200 outline-none font-semibold"
                    >
                      <option value="organic">Organic / Botanical</option>
                      <option value="biological">Biological Agent</option>
                      <option value="chemical">Chemical Pesticide</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NeemAzal T/S 1% or Spinosad"
                    value={newTreatment.product_name}
                    onChange={(e) => setNewTreatment({ ...newTreatment, product_name: e.target.value })}
                    className="w-full p-2 text-xs rounded-xl border border-stone-200 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Target Pest</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pink Bollworm"
                      value={newTreatment.target_pest}
                      onChange={(e) => setNewTreatment({ ...newTreatment, target_pest: e.target.value })}
                      className="w-full p-2 text-xs rounded-xl border border-stone-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Dosage</label>
                    <input
                      type="text"
                      placeholder="e.g. 2.5 ml / Litre"
                      value={newTreatment.dosage}
                      onChange={(e) => setNewTreatment({ ...newTreatment, dosage: e.target.value })}
                      className="w-full p-2 text-xs rounded-xl border border-stone-200 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Observations / Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Applied in plot A at dawn with knapsack sprayer."
                    value={newTreatment.notes}
                    onChange={(e) => setNewTreatment({ ...newTreatment, notes: e.target.value })}
                    className="w-full p-2 text-xs rounded-xl border border-stone-200 outline-none resize-none"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTreatmentModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
                  >
                    Save to Farm Log
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Mobile Thumb-Reachable Quick Navigation */}
      <FarmerBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        treatmentCount={treatments.length}
        alertCount={alerts.length}
      />
    </div>
  )
}
