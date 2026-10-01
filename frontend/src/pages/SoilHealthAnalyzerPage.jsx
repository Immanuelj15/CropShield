import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sprout, CheckCircle2, AlertTriangle,
  RotateCcw, ShieldCheck, Upload, Database, Sparkles, MapPin, Loader2
} from 'lucide-react'

import BoundaryDrawingStep from '../components/BoundaryDrawingStep'
import SoilReportCard from '../components/SoilReportCard'
import LabReportUpload from '../components/LabReportUpload'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/Toast'

import { apiFetch, isAbortError } from '../utils/http'
import { fetchMyFarms, farmIdOf } from '../utils/farms'

// Farm boundaries may be stored as a bare Polygon or wrapped in a Feature.
function polygonFromBoundary(boundary) {
  if (!boundary) return null
  const geom = boundary.type === 'Feature' ? boundary.geometry : boundary
  if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon') && Array.isArray(geom.coordinates)) return geom
  return null
}

const STEP_TITLES = [
  '1. Draw Field Boundary',
  '2. Farm Context',
  '3. Satellite Ingestion',
  '4. Soil Health Report',
]

// Water source → the Low/Medium/High tier the Crop Recommendation engine understands
const WATER_SOURCES = [
  { value: 'Canal Irrigation', label: 'Canal Irrigation (High availability)', tier: 'High' },
  { value: 'Drip Irrigation System', label: 'Drip Irrigation System (High efficiency)', tier: 'High' },
  { value: 'Borewell / Open Well', label: 'Borewell / Open Well (Moderate)', tier: 'Medium' },
  { value: 'Rainfed / Dryland', label: 'Rainfed Only (Low / monsoon-dependent)', tier: 'Low' },
]

const SOIL_TYPES = [
  { value: 'Alluvial Clay', label: 'Alluvial Clay (Cauvery Delta / River Basin)' },
  { value: 'Black Cotton Soil', label: 'Black Cotton Soil (Vertisol / High Retention)' },
  { value: 'Red Sandy Loam', label: 'Red Sandy Loam (Dryland / Good Drainage)' },
  { value: 'Coastal Alluvial', label: 'Coastal Alluvial (Saline / Sandy)' },
  { value: 'Lateritic Hill Soil', label: 'Lateritic Hill Soil (Acidic / Highlands)' },
]

const CONTEXT_INPUT = 'w-full text-sm bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 font-semibold text-stone-900'
const TAB_BTN = 'px-4 py-2 rounded-2xl text-xs font-semibold transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

function formatReportDate(value) {
  if (!value) return '—'
  // Backend datetimes are naive UTC ISO strings
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const fmt = (v, suffix = '') => (v === undefined || v === null || v === '' ? '—' : `${v}${suffix}`)

export default function SoilHealthAnalyzerPage() {
  const navigate = useNavigate()

  // Onboarding Step State: 1 | 2 | 3 | 4
  const [currentStep, setCurrentStep] = useState(1)
  const [farms, setFarms] = useState([])
  const [selectedFarmId, setSelectedFarmId] = useState('')

  // Form & Boundary Data
  const [boundaryPolygon, setBoundaryPolygon] = useState(null)
  const [soilTypeDeclared, setSoilTypeDeclared] = useState('Alluvial Clay')
  const [district, setDistrict] = useState('Thoothukudi')
  const [waterSource, setWaterSource] = useState('Borewell / Open Well')

  // Analysis State & Reports
  const [analyzing, setAnalyzing] = useState(false)
  const [activeReport, setActiveReport] = useState(null)
  const [showLabUploadModal, setShowLabUploadModal] = useState(false)
  const [historyReports, setHistoryReports] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [activeTab, setActiveTab] = useState('analyzer') // 'analyzer' | 'history'
  const toast = useToast()

  const [farmsLoaded, setFarmsLoaded] = useState(false)
  const [farmsError, setFarmsError] = useState(null)

  // Use the farm's saved boundary when present (P3-6: never a silent demo polygon)
  const applyFarm = (f) => {
    if (!f) return
    setDistrict(f.district || 'Thoothukudi')
    if (f.soil_type) setSoilTypeDeclared(f.soil_type)
    setBoundaryPolygon(polygonFromBoundary(f.boundary_geojson))
  }

  // Fetch the caller's farms
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const data = await fetchMyFarms({ signal: controller.signal })
        setFarms(data)
        if (data.length > 0) {
          setSelectedFarmId(farmIdOf(data[0]))
          applyFarm(data[0])
        }
        setFarmsLoaded(true)
      } catch (e) {
        if (isAbortError(e)) return
        console.debug('Error loading farms:', e)
        setFarmsError(e.message || 'Could not load your farms.')
        setFarmsLoaded(true)
      }
    })()
    return () => controller.abort()
  }, [])

  // Fetch soil history for selected farm (P2-8: ignore stale responses after a farm switch)
  const historyReqRef = useRef({ id: 0, controller: null })
  const fetchSoilHistory = async (farmId) => {
    if (!farmId) return
    historyReqRef.current.controller?.abort()
    const controller = new AbortController()
    const requestId = historyReqRef.current.id + 1
    historyReqRef.current = { id: requestId, controller }
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const data = await apiFetch(`/soil-health/${encodeURIComponent(farmId)}/history`, { signal: controller.signal })
      if (historyReqRef.current.id === requestId) setHistoryReports(Array.isArray(data?.reports) ? data.reports : [])
    } catch (e) {
      if (isAbortError(e)) return
      console.debug('Error fetching soil history:', e)
      if (historyReqRef.current.id === requestId) {
        setHistoryReports([])
        setHistoryError(e.message || 'Could not load soil report history.')
      }
    } finally {
      if (historyReqRef.current.id === requestId) setHistoryLoading(false)
    }
  }

  useEffect(() => {
    setHistoryReports([])
    setHistoryError(null)
    setActiveReport(null)
    if (selectedFarmId) {
      fetchSoilHistory(selectedFarmId)
    }
    return () => historyReqRef.current.controller?.abort()
  }, [selectedFarmId])

  // Run Satellite & Regional Soil Analysis
  const handleRunAnalysis = async () => {
    if (analyzing) return
    // P3-6: require a real farm and boundary — no silent Kovilpatti demo polygon
    if (!selectedFarmId) {
      toast.error('Register or select your farm first (Manage My Farm).')
      return
    }
    if (!boundaryPolygon) {
      toast.error('Draw your field boundary on the map before running the analysis.')
      setCurrentStep(1)
      return
    }
    const farmIdAtRequest = selectedFarmId
    setAnalyzing(true)
    setCurrentStep(3)

    try {
      // Minimum display timeout for analyzing animation
      const minDelay = new Promise((resolve) => setTimeout(resolve, 1400))

      const postPromise = apiFetch('/soil-health/generate', {
        method: 'POST',
        json: {
          farm_id: farmIdAtRequest,
          boundary_geojson: boundaryPolygon,
          soil_type_declared: soilTypeDeclared,
          district: district,
        },
      })

      const [data] = await Promise.all([postPromise, minDelay])
      if (farmIdAtRequest !== selectedFarmIdRef.current) return // farm switched meanwhile
      setActiveReport(data?.report || null)
      setCurrentStep(4)
      fetchSoilHistory(farmIdAtRequest)
    } catch (err) {
      console.error(err)
      toast.error('Analysis error: ' + (err.message || 'Failed to generate preliminary soil report.'))
      setCurrentStep(2)
    } finally {
      setAnalyzing(false)
    }
  }

  const selectedFarmIdRef = useRef(selectedFarmId)
  selectedFarmIdRef.current = selectedFarmId

  const handleLabReportSuccess = (newReport) => {
    if (newReport) {
      setActiveReport(newReport)
      setCurrentStep(4)
      setActiveTab('analyzer')
    }
    setShowLabUploadModal(false)
    toast.success('Lab report saved. It now overrides the preliminary estimate.')
    if (selectedFarmId) fetchSoilHistory(selectedFarmId)
  }

  const handleNavigateToCropRecommendation = () => {
    navigate('/farmer/crop-recommendation', {
      state: {
        soil_type: activeReport?.soil_type_declared || soilTypeDeclared,
        land_area_acres: activeReport?.area_acres || undefined,
        district: activeReport?.district || district,
        water_availability: WATER_SOURCES.find((w) => w.value === waterSource)?.tier,
        farm_id: activeReport?.farm_id || selectedFarmId,
      },
    })
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Top Hero Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-brand-50 text-brand-800 border border-brand-200 mb-2">
            <Sprout size={14} className="text-brand-700" />
            <span>Farmer Onboarding & Pre-Season Foundation</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            AI Preliminary Soil Health Analyzer
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl leading-relaxed">
            Trace your farm boundary to estimate topsoil reaction (pH), available nitrogen, and organic carbon
            with honest SoilGrids v2.0 uncertainty scoring. Feeds directly into your season crop recommendation.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto" role="tablist" aria-label="Soil health views">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'analyzer'}
            onClick={() => setActiveTab('analyzer')}
            className={`${TAB_BTN} ${
              activeTab === 'analyzer'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            Plot Analyzer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`${TAB_BTN} ${
              activeTab === 'history'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>Assessment History</span>
            {historyReports.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === 'history' ? 'bg-white/20' : 'bg-stone-200 text-stone-700'}`}>
                {historyReports.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* No farm registered / farms failed to load */}
      {farmsLoaded && farms.length === 0 && (
        farmsError ? (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
            <div className="flex items-start gap-2 flex-1">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{farmsError}</span>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-secondary text-xs px-4 py-2 self-start sm:self-auto"
            >
              Reload
            </button>
          </div>
        ) : (
          <EmptyState
            icon={MapPin}
            title="Register your farm first"
            message="Soil analysis is saved against a registered farm. Add your farm (with its location) in Manage My Farm, then come back to draw its boundary."
            actionLabel="Go to Manage My Farm"
            onAction={() => navigate('/farmer/manage-farms')}
          />
        )
      )}

      {/* Main Tab 1: Plot Analyzer Stepper Flow */}
      {activeTab === 'analyzer' && (
        <div className="space-y-6">
          {/* Farm Selector Pill Bar */}
          <div className="card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
              <label htmlFor="soil-farm-select" className="text-xs font-semibold text-stone-700 whitespace-nowrap">Assign to farm:</label>
              <select
                id="soil-farm-select"
                value={selectedFarmId}
                disabled={farms.length === 0}
                onChange={(e) => {
                  setSelectedFarmId(e.target.value)
                  const f = farms.find((item) => farmIdOf(item) === e.target.value)
                  applyFarm(f)
                  setCurrentStep(1)
                }}
                className="text-sm font-semibold bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 text-stone-900 max-w-full disabled:opacity-60"
              >
                {farms.length > 0 ? (
                  farms.map((f) => (
                    <option key={farmIdOf(f)} value={farmIdOf(f)}>
                      {f.farm_name || 'My farm'} ({f.district || 'District not set'} • {f.crop_type || 'Unspecified'})
                    </option>
                  ))
                ) : (
                  <option value="">{farmsLoaded ? (farmsError ? 'Could not load farms' : 'No farm registered — add one in Manage My Farm') : 'Loading farms…'}</option>
                )}
              </select>
            </div>

            {/* Stepper Pill Indicators */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold pb-0.5">
              {STEP_TITLES.map((title, idx) => {
                const stepNum = idx + 1
                const isCurrent = currentStep === stepNum
                const isDone = currentStep > stepNum

                return (
                  <div
                    key={title}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`px-3 py-1 rounded-xl transition-all whitespace-nowrap flex items-center gap-1 ${
                      isCurrent
                        ? 'bg-brand-600 text-white'
                        : isDone
                        ? 'bg-brand-50 text-brand-900 border border-brand-200'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {isDone && <CheckCircle2 size={12} className="text-brand-700" />}
                    <span>{title}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* STEP 1: Draw Boundary Map */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <BoundaryDrawingStep
                key={selectedFarmId || 'no-farm'}
                boundaryPolygon={boundaryPolygon}
                onBoundaryChange={(poly) => setBoundaryPolygon(poly)}
                onNext={() => setCurrentStep(2)}
              />
            </motion.div>
          )}

          {/* STEP 2: Basic Farm Context Confirmation */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="card p-5 sm:p-6 space-y-6 max-w-3xl mx-auto"
            >
              <div className="border-b border-stone-100 pb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-800 flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Step 2: Confirm Boundary &amp; Agricultural Context
                </span>
                <h3 className="text-lg font-semibold text-stone-800 mt-1">
                  Field Soil &amp; Water Availability Profile
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  The declared soil type and district are saved with the report. The water source is carried over to
                  your crop recommendation.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="soil-district" className="text-xs font-semibold text-stone-700 block mb-1.5">District / Agro-zone</label>
                  <input
                    id="soil-district"
                    type="text"
                    maxLength={100}
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className={CONTEXT_INPUT}
                  />
                </div>

                <div>
                  <label htmlFor="soil-declared" className="text-xs font-semibold text-stone-700 block mb-1.5">Declared soil classification</label>
                  <select
                    id="soil-declared"
                    value={soilTypeDeclared}
                    onChange={(e) => setSoilTypeDeclared(e.target.value)}
                    className={CONTEXT_INPUT}
                  >
                    {!SOIL_TYPES.some((s) => s.value === soilTypeDeclared) && soilTypeDeclared && (
                      <option value={soilTypeDeclared}>{soilTypeDeclared}</option>
                    )}
                    {SOIL_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="soil-water" className="text-xs font-semibold text-stone-700 block mb-1.5">Water availability / source</label>
                  <select
                    id="soil-water"
                    value={waterSource}
                    onChange={(e) => setWaterSource(e.target.value)}
                    className={CONTEXT_INPUT}
                  >
                    {WATER_SOURCES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Step Navigation Buttons */}
              <div className="pt-4 border-t border-stone-100 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="btn-secondary px-4 py-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  Back to Boundary Map
                </button>
                <button
                  type="button"
                  onClick={handleRunAnalysis}
                  disabled={analyzing || !selectedFarmId}
                  className="btn-primary px-6 py-2.5 text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  <span>Run Satellite &amp; SoilGrids Analysis</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Animated Analyzing State */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="card p-8 sm:p-12 text-center max-w-lg mx-auto space-y-6"
              aria-busy="true"
            >
              <div className="relative w-20 h-20 mx-auto">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  className="w-20 h-20 rounded-full border-4 border-stone-200 border-t-brand-600"
                />
                <div className="absolute inset-0 flex items-center justify-center text-brand-700">
                  <Database size={26} />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-stone-800">
                  Evaluating Plot SoilGrids &amp; Topography
                </h3>
                <p className="text-sm text-stone-600 max-w-xs mx-auto leading-relaxed">
                  Querying ISRIC SoilGrids v2.0 prediction quantiles (Q0.05, mean, Q0.95) at your boundary's
                  centre and sampling elevation data…
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Full Report View */}
          {currentStep === 4 && activeReport && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 hover:text-stone-900 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <RotateCcw size={13} />
                  <span>Analyze Another Plot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLabUploadModal(true)}
                  disabled={!selectedFarmId}
                  className="px-4 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-800 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <Upload size={13} />
                  <span>Upload Verified Lab Report</span>
                </button>
              </div>

              <SoilReportCard
                report={activeReport}
                onOpenLabUpload={() => setShowLabUploadModal(true)}
                onNavigateToCropRecommendation={handleNavigateToCropRecommendation}
              />
            </motion.div>
          )}
        </div>
      )}

      {/* Main Tab 2: Assessment History View */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="card p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-stone-800 mb-1">
              Soil Health Records for Selected Farm
            </h3>
            <p className="text-sm text-stone-600 mb-4">
              Chronological log of preliminary satellite estimates and verified laboratory reports.
            </p>

            {historyLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading soil report history">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-xl bg-stone-100 animate-pulse" />)}
              </div>
            ) : historyError ? (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
                <div className="flex items-start gap-2 flex-1">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{historyError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => fetchSoilHistory(selectedFarmId)}
                  className="btn-secondary text-xs px-4 py-2 self-start sm:self-auto"
                >
                  Try again
                </button>
              </div>
            ) : historyReports.length === 0 ? (
              <EmptyState
                icon={Database}
                title="No soil reports yet"
                message={selectedFarmId
                  ? 'No soil reports recorded for this farm yet. Run an analysis in Plot Analyzer or upload a lab test report.'
                  : 'Select or register a farm to see its soil report history.'}
                actionLabel={selectedFarmId ? 'Open Plot Analyzer' : undefined}
                onAction={selectedFarmId ? () => { setActiveTab('analyzer'); setCurrentStep(1) } : undefined}
              />
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full min-w-[720px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-50 text-stone-600 font-semibold uppercase text-xs tracking-wider border-b border-stone-200">
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Area</th>
                      <th className="px-4 py-3">pH</th>
                      <th className="px-4 py-3">Nitrogen</th>
                      <th className="px-4 py-3">Phosphorus</th>
                      <th className="px-4 py-3">Potassium</th>
                      <th className="px-4 py-3">Confidence</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {historyReports.map((item) => {
                      const isLab = item.report_type === 'lab_verified'
                      const props = item.estimated_properties || {}
                      return (
                        <tr key={item._id || item.id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="px-4 py-3">
                            {isLab ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 whitespace-nowrap">
                                <ShieldCheck size={11} /> Lab Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 whitespace-nowrap">
                                <AlertTriangle size={11} className="text-amber-700" /> Estimated
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-stone-600 whitespace-nowrap">
                            {formatReportDate(item.generated_at)}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-stone-800 whitespace-nowrap">
                            {fmt(item.area_acres, ' ac')}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-stone-900 whitespace-nowrap">
                            {isLab
                              ? fmt(item.lab_measured_values?.ph ?? props.ph?.mean)
                              : Array.isArray(props.ph?.value_range)
                              ? `${props.ph.value_range[0]} – ${props.ph.value_range[1]}`
                              : fmt(props.ph?.mean)}
                          </td>
                          <td className="px-4 py-3 text-stone-700">
                            {isLab ? fmt(item.lab_measured_values?.nitrogen_kg, ' kg/ac') : fmt(props.nitrogen?.level)}
                          </td>
                          <td className="px-4 py-3 text-stone-700">
                            {isLab ? fmt(item.lab_measured_values?.phosphorus_kg, ' kg/ac') : 'Not modelled'}
                          </td>
                          <td className="px-4 py-3 text-stone-700">
                            {isLab ? fmt(item.lab_measured_values?.potassium_kg, ' kg/ac') : fmt(props.potassium?.level)}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-sky-800">
                            {isLab ? 'Measured' : fmt(item.overall_confidence_pct != null ? Math.round(item.overall_confidence_pct) : null, '%')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveReport(item)
                                setCurrentStep(4)
                                setActiveTab('analyzer')
                              }}
                              className="px-3 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              View Report
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lab Report Upload Modal */}
      <AnimatePresence>
        {showLabUploadModal && (
          <LabReportUpload
            farmId={selectedFarmId}
            onSuccess={handleLabReportSuccess}
            onCancel={() => setShowLabUploadModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
