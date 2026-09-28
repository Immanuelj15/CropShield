import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { AlertTriangle, Shield, Sprout, Clock, FileText, Bell, Camera, Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalizedField } from '../utils/useLocalizedField'
import { queueOfflineAction } from '../utils/offlineQueue'
import { compressImage } from '../utils/imageCompression'
import { useToast } from '../components/ui/Toast'
import TabBar from '../components/ui/TabBar'
import FarmerBottomNav from '../components/FarmerBottomNav'
import FarmerWarningTab from './farmer/FarmerWarningTab'
import FarmerDiseaseTab from './farmer/FarmerDiseaseTab'
import FarmerTreatmentsTab from './farmer/FarmerTreatmentsTab'
import FarmerAdvisoriesTab from './farmer/FarmerAdvisoriesTab'
import FarmerAlertsTab from './farmer/FarmerAlertsTab'
import FarmerHistoryTab from './farmer/FarmerHistoryTab'

const API_BASE = '/api/v1'

export default function FarmerDashboard() {
  const { t } = useTranslation(['farmer', 'common', 'validation'])
  const { currentLang } = useLocalizedField()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('warning')
  const [farm, setFarm] = useState(null)
  const [warningData, setWarningData] = useState(null)
  const [vegetationData, setVegetationData] = useState(null)
  const [loading, setLoading] = useState(false)

  const [treatments, setTreatments] = useState([])
  const [treatmentsLoading, setTreatmentsLoading] = useState(false)
  const [treatmentsError, setTreatmentsError] = useState(null)

  const [advisories, setAdvisories] = useState([])
  const [advisoriesLoading, setAdvisoriesLoading] = useState(false)
  const [advisoriesError, setAdvisoriesError] = useState(null)
  const [advisorySearch, setAdvisorySearch] = useState('')
  const [advisoryCrop, setAdvisoryCrop] = useState('All')

  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState(null)

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)

  const [isOfflineCached, setIsOfflineCached] = useState(false)
  const [cachedTimestamp, setCachedTimestamp] = useState(null)

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

  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)

  const [supportQuery, setSupportQuery] = useState('')
  const [supportSent, setSupportSent] = useState(false)

  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  useEffect(() => {
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
        if (farmId) fetchVegetationData(farmId)
      }
    } catch (err) {
      console.error('Error loading farm:', err)
    }
  }

  const fetchVegetationData = async (farmId) => {
    try {
      const res = await fetch(`${API_BASE}/vegetation/${farmId}`, { headers: authHeaders })
      if (res.ok) setVegetationData(await res.json())
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
          localStorage.setItem('cropshield_last_warning', JSON.stringify({ data, time: nowStr }))
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
    setTreatmentsLoading(true)
    setTreatmentsError(null)
    try {
      const res = await fetch(`${API_BASE}/treatments`, { headers: authHeaders })
      if (res.ok) setTreatments(await res.json())
      else setTreatmentsError('Could not load treatment history.')
    } catch (e) {
      console.error(e)
      setTreatmentsError('Network error while loading treatments.')
    } finally {
      setTreatmentsLoading(false)
    }
  }

  const fetchAdvisories = async () => {
    setAdvisoriesLoading(true)
    setAdvisoriesError(null)
    try {
      const res = await fetch(`${API_BASE}/advisories`, { headers: authHeaders })
      if (res.ok) setAdvisories(await res.json())
      else setAdvisoriesError('Could not load advisories.')
    } catch (e) {
      console.error(e)
      setAdvisoriesError('Network error while loading advisories.')
    } finally {
      setAdvisoriesLoading(false)
    }
  }

  const fetchAlerts = async () => {
    setAlertsLoading(true)
    setAlertsError(null)
    try {
      const res = await fetch(`${API_BASE}/alerts/me`, { headers: authHeaders })
      if (res.ok) setAlerts(await res.json())
      else setAlertsError('Could not load regional alerts.')
    } catch (e) {
      console.error(e)
      setAlertsError('Network error while loading alerts.')
    } finally {
      setAlertsLoading(false)
    }
  }

  const fetchHistory = async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch(`${API_BASE}/history/me`, { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setHistory(data.warnings || [])
      } else {
        setHistoryError('Could not load prediction history.')
      }
    } catch (e) {
      console.error(e)
      setHistoryError('Network error while loading history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchSupportRequests = async () => {
    try {
      await fetch(`${API_BASE}/support/requests/me`, { headers: authHeaders })
    } catch (e) { console.error(e) }
  }

  const resetTreatmentForm = () => setNewTreatment({
    treatment_date: new Date().toISOString().split('T')[0],
    treatment_type: 'organic',
    product_name: '',
    target_pest: '',
    dosage: '',
    notes: '',
  })

  const handleSaveTreatment = async (e) => {
    e.preventDefault()
    if (!navigator.onLine) {
      try {
        await queueOfflineAction({ type: 'treatment_log', payload: newTreatment })
        setTreatmentSuccess(true)
        setTimeout(() => {
          setShowTreatmentModal(false)
          setTreatmentSuccess(false)
          resetTreatmentForm()
          toast.info('📡 You are offline. Treatment log saved to offline queue and will auto-sync when connected!')
        }, 800)
      } catch (err) {
        console.error('Offline queue failed:', err)
      }
      return
    }

    try {
      const res = await fetch(`${API_BASE}/treatments`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(newTreatment),
      })
      if (res.ok) {
        setTreatmentSuccess(true)
        fetchTreatments()
        setTimeout(() => {
          setShowTreatmentModal(false)
          setTreatmentSuccess(false)
          resetTreatmentForm()
        }, 800)
      } else {
        toast.error('Failed to save treatment. Please try again.')
      }
    } catch (e) {
      console.warn('Network error during treatment log, falling back to offline queue:', e)
      await queueOfflineAction({ type: 'treatment_log', payload: newTreatment })
      setTreatmentSuccess(true)
      setTimeout(() => {
        setShowTreatmentModal(false)
        setTreatmentSuccess(false)
        toast.info('📡 Network unavailable. Treatment log queued in IndexedDB for auto-sync.')
      }, 800)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setPreviewUrl(URL.createObjectURL(file))
      setScanResult(null)
      try {
        const { file: compressed } = await compressImage(file, { maxDim: 1024, quality: 0.8 })
        setSelectedFile(compressed)
      } catch {
        setSelectedFile(file)
      }
    }
  }

  const handleDiseaseScan = async () => {
    if (!selectedFile) {
      setScanError('Please select or capture a leaf photo first.')
      return
    }
    setScanLoading(true)
    setScanError(null)

    if (!navigator.onLine) {
      try {
        await queueOfflineAction({
          type: 'leaf_photo',
          payload: { blob: selectedFile, filename: selectedFile.name || 'leaf_scan.jpg', farm_id: farm?.id ? String(farm.id) : null },
        })
        setScanError('📡 Offline Mode: Leaf photo saved to offline queue. Diagnosis will automatically run once internet connection returns.')
      } catch (err) {
        setScanError('Failed to store image offline: ' + err.message)
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
        setScanError(data?.detail?.message || data?.detail || 'Diagnosis failed. Please check image format.')
      }
    } catch (e) {
      console.warn('Disease scan network error, storing offline:', e)
      await queueOfflineAction({
        type: 'leaf_photo',
        payload: { blob: selectedFile, filename: selectedFile.name || 'leaf_scan.jpg', farm_id: farm?.id ? String(farm.id) : null },
      })
      setScanError('📡 Field connection dropped. Photo safely queued in IndexedDB. Will auto-sync when online.')
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
        body: JSON.stringify({ query_text: supportQuery, crop_type: farm?.crop_type || 'Cotton' }),
      })
      if (res.ok) {
        setSupportSent(true)
        setSupportQuery('')
        fetchSupportRequests()
        setTimeout(() => setSupportSent(false), 3000)
      }
    } catch (e) { console.error(e) }
  }

  const tabs = [
    { id: 'warning', label: t('farmer:today_warning_title') || "Today's Warning", icon: AlertTriangle },
    { id: 'disease', label: t('farmer:disease_scan_title') || 'Disease Photo Scan', icon: Camera },
    { id: 'treatments', label: t('farmer:treatment_log_title') || 'Treatment Log', icon: FileText, badge: treatments.length },
    { id: 'advisories', label: t('farmer:advisories_tab') || 'Digital Advisories', icon: Shield },
    { id: 'alerts', label: t('farmer:regional_alerts_title') || 'Regional Alerts', icon: Bell, badge: alerts.length },
    { id: 'history', label: t('farmer:field_history_title') || 'Prediction History', icon: Clock },
  ]

  return (
    <div className="space-y-6 animate-fadeIn pb-24 lg:pb-12">
      <div className="bg-gradient-to-r from-brand-900 via-teal-900 to-stone-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden border border-brand-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-500/20 text-brand-300 text-xs font-semibold rounded-full border border-brand-400/30 mb-2">
              <Sprout size={14} /> {t('common:app_name')} · {t('common:role_farmer')}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {farm ? farm.farm_name : 'Kovilpatti Black Soil Cotton Farm'}
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm mt-1">
              {farm ? `${farm.district} · ${farm.climate_zone} Agro-Zone · ${farm.crop_type} (${farm.area_hectares} Ha)` : 'Tamil Nadu Dryland Agro-Climatic Zone'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-4 py-2 bg-white/10 backdrop-blur rounded-2xl border border-white/10 text-right">
              <span className="text-[11px] text-stone-300 block uppercase font-bold tracking-wider">NASA Satellite Link</span>
              <span className="text-xs font-semibold text-brand-300 flex items-center gap-1.5 justify-end">
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span> Active 2026 Feed
              </span>
            </div>
            <NavLink
              to="/farmer/notifications"
              className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
            >
              <Bell size={14} /> {t('common:nav_alert_channels') || 'Alert Channels'}
            </NavLink>
            <button
              onClick={() => farm && fetchTodayWarning(farm)}
              className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
            >
              <Activity size={14} /> {t('common:refresh')}
            </button>
          </div>
        </div>

        <TabBar tabs={tabs} activeId={activeTab} onSelect={setActiveTab} activeCls="bg-white text-brand-950" className="mt-6" />
      </div>

      {activeTab === 'warning' && (
        <FarmerWarningTab
          warningData={warningData} loading={loading} isOfflineCached={isOfflineCached}
          cachedTimestamp={cachedTimestamp} farm={farm} fetchTodayWarning={fetchTodayWarning}
          vegetationData={vegetationData} scanResult={scanResult}
          supportQuery={supportQuery} setSupportQuery={setSupportQuery}
          supportSent={supportSent} handleSendSupport={handleSendSupport}
        />
      )}

      {activeTab === 'disease' && (
        <FarmerDiseaseTab
          previewUrl={previewUrl} selectedFile={selectedFile} scanResult={scanResult}
          scanLoading={scanLoading} scanError={scanError}
          handleFileChange={handleFileChange} handleDiseaseScan={handleDiseaseScan}
        />
      )}

      {activeTab === 'treatments' && (
        <FarmerTreatmentsTab
          treatments={treatments} treatmentsLoading={treatmentsLoading} treatmentsError={treatmentsError} onRetry={fetchTreatments}
          showTreatmentModal={showTreatmentModal} setShowTreatmentModal={setShowTreatmentModal}
          newTreatment={newTreatment} setNewTreatment={setNewTreatment}
          treatmentSuccess={treatmentSuccess} handleSaveTreatment={handleSaveTreatment}
        />
      )}

      {activeTab === 'advisories' && (
        <FarmerAdvisoriesTab
          advisories={advisories} advisoriesLoading={advisoriesLoading} advisoriesError={advisoriesError} onRetry={fetchAdvisories}
          advisorySearch={advisorySearch} setAdvisorySearch={setAdvisorySearch}
          advisoryCrop={advisoryCrop} setAdvisoryCrop={setAdvisoryCrop}
          currentLang={currentLang} t={t}
        />
      )}

      {activeTab === 'alerts' && (
        <FarmerAlertsTab alerts={alerts} alertsLoading={alertsLoading} alertsError={alertsError} onRetry={fetchAlerts} />
      )}

      {activeTab === 'history' && (
        <FarmerHistoryTab history={history} historyLoading={historyLoading} historyError={historyError} onRetry={fetchHistory} />
      )}

      <FarmerBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        treatmentCount={treatments.length}
        alertCount={alerts.length}
      />
    </div>
  )
}
