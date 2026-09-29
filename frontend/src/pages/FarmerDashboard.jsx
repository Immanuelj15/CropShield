import { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { AlertTriangle, Shield, Sprout, Clock, FileText, Bell, Camera, Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalizedField } from '../utils/useLocalizedField'
import { queueOfflineAction } from '../utils/offlineQueue'
import { compressImage } from '../utils/imageCompression'
import { useToast } from '../components/ui/Toast'
import { apiFetch, isNetworkError, userScopedKey } from '../utils/http'
import { farmIdOf } from '../utils/farms'
import TabBar from '../components/ui/TabBar'
import FarmerBottomNav from '../components/FarmerBottomNav'
import FarmerWarningTab from './farmer/FarmerWarningTab'
import FarmerDiseaseTab from './farmer/FarmerDiseaseTab'
import FarmerTreatmentsTab from './farmer/FarmerTreatmentsTab'
import FarmerAdvisoriesTab from './farmer/FarmerAdvisoriesTab'
import FarmerAlertsTab from './farmer/FarmerAlertsTab'
import FarmerHistoryTab from './farmer/FarmerHistoryTab'

const LAST_WARNING_CACHE = 'cropshield_last_warning'

export default function FarmerDashboard() {
  const { t } = useTranslation(['farmer', 'common', 'validation'])
  const { currentLang } = useLocalizedField()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('warning')
  const [farm, setFarm] = useState(null)
  const [farmMissing, setFarmMissing] = useState(false)
  const [farmError, setFarmError] = useState(null)
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
  const [treatmentSaving, setTreatmentSaving] = useState(false)

  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)

  const [supportQuery, setSupportQuery] = useState('')
  const [supportSent, setSupportSent] = useState(false)
  const [supportSending, setSupportSending] = useState(false)

  // Object URL for the leaf preview: revoke the previous one on change and on unmount (P3-9)
  const previewUrlRef = useRef(null)
  const replacePreviewUrl = (url) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  useEffect(() => {
    try {
      // Cache is keyed per user so the next farmer on a shared phone never sees it (P2-7)
      const cacheKey = userScopedKey(LAST_WARNING_CACHE)
      const cached = cacheKey ? localStorage.getItem(cacheKey) : null
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
    setFarmError(null)
    try {
      const data = await apiFetch('/farms/me')
      if (!data || !farmIdOf(data)) {
        setFarm(null)
        setFarmMissing(true)
        return
      }
      setFarm(data)
      setFarmMissing(false)
      fetchTodayWarning(data)
      // Contract 3: the farm id field is `farm_id`
      const farmId = farmIdOf(data)
      if (farmId) fetchVegetationData(farmId)
    } catch (err) {
      if (err?.status === 404) {
        setFarm(null)
        setFarmMissing(true)
      } else {
        console.error('Error loading farm:', err)
        setFarmError(err.message)
      }
    }
  }

  const fetchVegetationData = async (farmId) => {
    try {
      setVegetationData(await apiFetch(`/vegetation/${encodeURIComponent(farmId)}`))
    } catch (err) {
      console.warn('Vegetation fetch failed:', err)
      setVegetationData(null)
    }
  }

  const fetchTodayWarning = async (farmObj) => {
    if (!farmObj) return
    setLoading(true)
    try {
      const data = await apiFetch('/predict-today', {
        method: 'POST',
        json: {
          latitude: farmObj?.location?.coordinates?.[1] || 9.1728,
          longitude: farmObj?.location?.coordinates?.[0] || 77.8710,
          location: farmObj?.district || 'Kovilpatti',
          crop: farmObj?.crop_type || 'Cotton',
          climate_zone: farmObj?.climate_zone || 'Dryland',
          farm_id: farmIdOf(farmObj) || null,
        },
      })
      setWarningData(data)
      setIsOfflineCached(false)
      try {
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const cacheKey = userScopedKey(LAST_WARNING_CACHE)
        if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ data, time: nowStr }))
        setCachedTimestamp(nowStr)
      } catch {
        // Ignore storage quota
      }
    } catch (err) {
      if (isNetworkError(err)) {
        console.warn('Prediction request failed; operating in offline-cached tolerance mode:', err)
        setIsOfflineCached(true)
      } else {
        toast.error(err.message || 'Could not load today\'s warning.')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchTreatments = async () => {
    setTreatmentsLoading(true)
    setTreatmentsError(null)
    try {
      const data = await apiFetch('/treatments')
      setTreatments(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setTreatmentsError(isNetworkError(e) ? 'Network error while loading treatments.' : (e.message || 'Could not load treatment history.'))
    } finally {
      setTreatmentsLoading(false)
    }
  }

  const fetchAdvisories = async () => {
    setAdvisoriesLoading(true)
    setAdvisoriesError(null)
    try {
      const data = await apiFetch('/advisories')
      setAdvisories(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setAdvisoriesError(isNetworkError(e) ? 'Network error while loading advisories.' : (e.message || 'Could not load advisories.'))
    } finally {
      setAdvisoriesLoading(false)
    }
  }

  const fetchAlerts = async () => {
    setAlertsLoading(true)
    setAlertsError(null)
    try {
      const data = await apiFetch('/alerts/me')
      setAlerts(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setAlertsError(isNetworkError(e) ? 'Network error while loading alerts.' : (e.message || 'Could not load regional alerts.'))
    } finally {
      setAlertsLoading(false)
    }
  }

  const fetchHistory = async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const data = await apiFetch('/history/me')
      setHistory(data?.warnings || [])
    } catch (e) {
      console.error(e)
      setHistoryError(isNetworkError(e) ? 'Network error while loading history.' : (e.message || 'Could not load prediction history.'))
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchSupportRequests = async () => {
    try {
      await apiFetch('/support/requests/me')
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

  const queueTreatmentOffline = async (message) => {
    await queueOfflineAction({ type: 'treatment_log', payload: newTreatment })
    setTreatmentSuccess(true)
    setTimeout(() => {
      setShowTreatmentModal(false)
      setTreatmentSuccess(false)
      resetTreatmentForm()
      toast.info(message)
    }, 800)
  }

  const handleSaveTreatment = async (e) => {
    e.preventDefault()
    if (treatmentSaving || treatmentSuccess) return // P2-10: no double submits
    setTreatmentSaving(true)
    try {
      if (!navigator.onLine) {
        try {
          await queueTreatmentOffline('📡 You are offline. Treatment log saved to offline queue and will auto-sync when connected!')
        } catch (err) {
          console.error('Offline queue failed:', err)
          toast.error('Could not save the treatment offline. Please retry.')
        }
        return
      }

      try {
        await apiFetch('/treatments', { method: 'POST', json: newTreatment })
        setTreatmentSuccess(true)
        fetchTreatments()
        setTimeout(() => {
          setShowTreatmentModal(false)
          setTreatmentSuccess(false)
          resetTreatmentForm()
        }, 800)
      } catch (err) {
        if (isNetworkError(err)) {
          console.warn('Network error during treatment log, falling back to offline queue:', err)
          try {
            await queueTreatmentOffline('📡 Network unavailable. Treatment log queued in IndexedDB for auto-sync.')
          } catch (qErr) {
            toast.error('Could not save the treatment offline. Please retry.')
          }
        } else {
          toast.error(err.message || 'Failed to save treatment. Please try again.')
        }
      }
    } finally {
      setTreatmentSaving(false)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      replacePreviewUrl(URL.createObjectURL(file))
      setScanResult(null)
      setScanError(null)
      try {
        const { file: compressed } = await compressImage(file, { maxDim: 1024, quality: 0.8 })
        setSelectedFile(compressed)
      } catch {
        setSelectedFile(file)
      }
    }
  }

  const leafPhotoPayload = () => ({
    blob: selectedFile,
    filename: selectedFile.name || 'leaf_scan.jpg',
    // P2-9: queued photos carry the farm id so the scan is linked to the right farm on replay
    farm_id: farmIdOf(farm) || null,
    crop_hint: farm?.crop_type || null,
  })

  const handleDiseaseScan = async () => {
    if (!selectedFile) {
      setScanError('Please select or capture a leaf photo first.')
      return
    }
    if (scanLoading) return
    setScanLoading(true)
    setScanError(null)

    if (!navigator.onLine) {
      try {
        await queueOfflineAction({ type: 'leaf_photo', payload: leafPhotoPayload() })
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
      const farmId = farmIdOf(farm)
      if (farmId) formData.append('farm_id', farmId)

      // apiFetch checks res.ok before using the body and normalizes `detail`
      const data = await apiFetch('/disease/detect', { method: 'POST', body: formData })
      setScanResult(data)
    } catch (e) {
      if (isNetworkError(e)) {
        console.warn('Disease scan network error, storing offline:', e)
        try {
          await queueOfflineAction({ type: 'leaf_photo', payload: leafPhotoPayload() })
          setScanError('📡 Field connection dropped. Photo safely queued in IndexedDB. Will auto-sync when online.')
        } catch (qErr) {
          setScanError('Network error and the photo could not be stored offline. Please retry.')
        }
      } else {
        setScanError(e.message || 'Diagnosis failed. Please check image format.')
      }
    } finally {
      setScanLoading(false)
    }
  }

  const handleSendSupport = async (e) => {
    e.preventDefault()
    if (!supportQuery.trim() || supportSending) return
    setSupportSending(true)
    try {
      await apiFetch('/support/requests', {
        method: 'POST',
        json: { query_text: supportQuery, crop_type: farm?.crop_type || 'General' },
      })
      setSupportSent(true)
      setSupportQuery('')
      fetchSupportRequests()
      setTimeout(() => setSupportSent(false), 3000)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Could not send your question. Please retry.')
    } finally {
      setSupportSending(false)
    }
  }

  const tabs = [
    { id: 'warning', label: t('farmer:today_warning_title', "Today's Warning"), icon: AlertTriangle },
    { id: 'disease', label: t('farmer:disease_scan_title', 'Disease Photo Scan'), icon: Camera },
    { id: 'treatments', label: t('farmer:treatment_log_title', 'Treatment Log'), icon: FileText, badge: treatments.length },
    { id: 'advisories', label: t('farmer:advisories_tab', 'Digital Advisories'), icon: Shield },
    { id: 'alerts', label: t('farmer:regional_alerts_title', 'Regional Alerts'), icon: Bell, badge: alerts.length },
    { id: 'history', label: t('farmer:field_history_title', 'Prediction History'), icon: Clock },
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
              {farm ? farm.farm_name : farmMissing ? t('farmer:no_farm_title', 'No farm registered yet') : '…'}
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm mt-1">
              {farm ? `${farm.district} · ${farm.climate_zone} Agro-Zone · ${farm.crop_type} (${farm.area_hectares} Ha)` : farmError ? farmError : ''}
            </p>
            {farmMissing && (
              <NavLink
                to="/farmer/manage-farms"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold"
              >
                <Sprout size={14} /> {t('farmer:no_farm_cta', 'Register your farm in Manage My Farm')}
              </NavLink>
            )}
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
              disabled={!farm || loading}
              className="disabled:opacity-50 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
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
          supportSending={supportSending}
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
          treatmentSaving={treatmentSaving}
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
