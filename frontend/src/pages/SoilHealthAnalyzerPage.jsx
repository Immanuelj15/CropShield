import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sprout, MapPin, Compass, CheckCircle2, AlertTriangle, ArrowRight,
  RotateCcw, ShieldCheck, Upload, Database, Sparkles, Layers,
  ChevronRight, Activity, FileText, Mountain, RefreshCw
} from 'lucide-react'

import BoundaryDrawingStep from '../components/BoundaryDrawingStep'
import SoilReportCard from '../components/SoilReportCard'
import LabReportUpload from '../components/LabReportUpload'

const API_BASE = '/api/v1'

const STEP_TITLES = [
  '1. Draw Field Boundary',
  '2. Farm Context',
  '3. Satellite Ingestion',
  '4. Soil Health Report',
]

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
  const [previousCrop, setPreviousCrop] = useState('None')

  // Analysis State & Reports
  const [analyzing, setAnalyzing] = useState(false)
  const [activeReport, setActiveReport] = useState(null)
  const [showLabUploadModal, setShowLabUploadModal] = useState(false)
  const [historyReports, setHistoryReports] = useState([])
  const [activeTab, setActiveTab] = useState('analyzer') // 'analyzer' | 'history'

  // Fetch available farms
  useEffect(() => {
    const fetchFarms = async () => {
      try {
        const token = sessionStorage.getItem('cropshield_token') || localStorage.getItem('token')
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`${API_BASE}/farmer/farms`, { headers })
        if (res.ok) {
          const data = await res.json()
          setFarms(data || [])
          if (data && data.length > 0) {
            setSelectedFarmId(data[0].id || data[0]._id)
            setDistrict(data[0].district || 'Thoothukudi')
            if (data[0].soil_type) setSoilTypeDeclared(data[0].soil_type)
          }
        }
      } catch (e) {
        console.debug('Error loading farms:', e)
      }
    }
    fetchFarms()
  }, [])

  // Fetch soil history for selected farm
  const fetchSoilHistory = async (farmId) => {
    if (!farmId) return
    try {
      const res = await fetch(`${API_BASE}/soil-health/${farmId}/history`)
      if (res.ok) {
        const data = await res.json()
        setHistoryReports(data.reports || [])
      }
    } catch (e) {
      console.debug('Error fetching soil history:', e)
    }
  }

  useEffect(() => {
    if (selectedFarmId) {
      fetchSoilHistory(selectedFarmId)
    }
  }, [selectedFarmId])

  // Run Satellite & Regional Soil Analysis
  const handleRunAnalysis = async () => {
    setAnalyzing(true)
    setCurrentStep(3)

    // Fallback default polygon if none drawn (e.g. Kovilpatti agricultural plot)
    const effectivePolygon = boundaryPolygon || {
      type: 'Polygon',
      coordinates: [
        [
          [77.9780, 9.1750],
          [77.9820, 9.1750],
          [77.9820, 9.1785],
          [77.9780, 9.1785],
          [77.9780, 9.1750],
        ],
      ],
    }

    try {
      // Minimum display timeout for analyzing animation
      const minDelay = new Promise((resolve) => setTimeout(resolve, 1400))

      const postPromise = fetch(`${API_BASE}/soil-health/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farm_id: selectedFarmId || 'demo_farm_plot',
          boundary_geojson: effectivePolygon,
          soil_type_declared: soilTypeDeclared,
          district: district,
        }),
      })

      const [res] = await Promise.all([postPromise, minDelay])
      if (!res.ok) {
        throw new Error('Failed to generate preliminary soil report.')
      }

      const data = await res.json()
      setActiveReport(data.report)
      setCurrentStep(4)
      if (selectedFarmId) fetchSoilHistory(selectedFarmId)
    } catch (err) {
      console.error(err)
      alert('Analysis error: ' + err.message)
      setCurrentStep(2)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleLabReportSuccess = (newReport) => {
    setActiveReport(newReport)
    setShowLabUploadModal(false)
    if (selectedFarmId) fetchSoilHistory(selectedFarmId)
  }

  const handleNavigateToCropRecommendation = () => {
    navigate('/farmer/crop-recommendation', {
      state: {
        soil_type: activeReport?.soil_type_declared || soilTypeDeclared,
        land_area_acres: activeReport?.area_acres || 2.5,
        district: activeReport?.district || district,
        farm_id: selectedFarmId,
      },
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Hero Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-2">
            <Sprout size={14} className="text-emerald-700" />
            <span>Farmer Onboarding & Pre-Season Foundation</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
            AI Preliminary Soil Health Analyzer
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1 max-w-2xl leading-relaxed">
            Trace your farm boundary to estimate topsoil reaction (pH), available nitrogen, and organic carbon
            with honest SoilGrids v2.0 uncertainty scoring. Feeds directly into your season crop recommendation.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('analyzer')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeTab === 'analyzer'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            Plot Analyzer
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>Assessment History</span>
            {historyReports.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
                {historyReports.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Tab 1: Plot Analyzer Stepper Flow */}
      {activeTab === 'analyzer' && (
        <div className="space-y-6">
          {/* Farm Selector Pill Bar */}
          <div className="bg-white rounded-3xl border border-stone-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-stone-700">Assign To Farm:</span>
              <select
                value={selectedFarmId}
                onChange={(e) => {
                  setSelectedFarmId(e.target.value)
                  const f = farms.find((item) => (item.id || item._id) === e.target.value)
                  if (f) {
                    setDistrict(f.district || 'Thoothukudi')
                    if (f.soil_type) setSoilTypeDeclared(f.soil_type)
                  }
                }}
                className="text-xs font-bold bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-600 text-stone-900"
              >
                {farms.length > 0 ? (
                  farms.map((f) => (
                    <option key={f.id || f._id} value={f.id || f._id}>
                      {f.farm_name} ({f.district} • {f.crop_type || 'Unspecified'})
                    </option>
                  ))
                ) : (
                  <option value="demo_farm_plot">Demo Smallholder Plot (Madurai / Kovilpatti)</option>
                )}
              </select>
            </div>

            {/* Stepper Pill Indicators */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-bold">
              {STEP_TITLES.map((title, idx) => {
                const stepNum = idx + 1
                const isCurrent = currentStep === stepNum
                const isDone = currentStep > stepNum

                return (
                  <div
                    key={title}
                    className={`px-3 py-1 rounded-xl transition-all whitespace-nowrap flex items-center gap-1 ${
                      isCurrent
                        ? 'bg-emerald-700 text-white'
                        : isDone
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {isDone && <CheckCircle2 size={12} className="text-emerald-700" />}
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
              className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6 max-w-3xl mx-auto"
            >
              <div className="border-b border-stone-100 pb-4">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Step 2: Confirm Boundary & Agricultural Context
                </span>
                <h3 className="text-lg font-black text-stone-900 mt-1">
                  Field Soil & Water Availability Profile
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Help refine the preliminary evaluation by declaring your local soil observations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1.5">District / Agro-Zone</label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600 font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1.5">Declared Soil Classification</label>
                  <select
                    value={soilTypeDeclared}
                    onChange={(e) => setSoilTypeDeclared(e.target.value)}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600 font-bold"
                  >
                    <option value="Alluvial Clay">Alluvial Clay (Cauvery Delta / River Basin)</option>
                    <option value="Black Cotton Soil">Black Cotton Soil (Vertisol / High Retention)</option>
                    <option value="Red Sandy Loam">Red Sandy Loam (Dryland / Good Drainage)</option>
                    <option value="Coastal Alluvial">Coastal Alluvial (Saline / Sandy)</option>
                    <option value="Lateritic Hill Soil">Lateritic Hill Soil (Acidic / Highlands)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1.5">Water Availability / Source</label>
                  <select
                    value={waterSource}
                    onChange={(e) => setWaterSource(e.target.value)}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600 font-bold"
                  >
                    <option value="Borewell / Open Well">Borewell / Open Well (Moderate)</option>
                    <option value="Canal Irrigation">Canal Irrigation (High Availability)</option>
                    <option value="Rainfed / Dryland">Rainfed Only (Low / Monsoon-Dependent)</option>
                    <option value="Drip Irrigation System">Drip Irrigation System (High Efficiency)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1.5">Previous Season Crop (Rotation)</label>
                  <input
                    type="text"
                    value={previousCrop}
                    onChange={(e) => setPreviousCrop(e.target.value)}
                    placeholder="e.g. Cotton, Maize, Pulses"
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600 font-bold"
                  />
                </div>
              </div>

              {/* Step Navigation Buttons */}
              <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:text-stone-900 transition-colors"
                >
                  Back to Boundary Map
                </button>
                <button
                  type="button"
                  onClick={handleRunAnalysis}
                  className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black transition-all flex items-center gap-2 shadow-sm"
                >
                  <Sparkles size={15} />
                  <span>Run Satellite & SoilGrids Analysis</span>
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
              className="bg-white rounded-3xl border border-stone-200 p-12 text-center shadow-sm max-w-lg mx-auto space-y-6"
            >
              <div className="relative w-20 h-20 mx-auto">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  className="w-20 h-20 rounded-full border-4 border-stone-200 border-t-emerald-600"
                />
                <div className="absolute inset-0 flex items-center justify-center text-emerald-700">
                  <Database size={26} />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-black text-stone-900">
                  Evaluating Plot SoilGrids & Topography
                </h3>
                <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
                  Querying ISRIC SoilGrids v2.0 prediction quantiles (Q0.05, mean, Q0.95),
                  averaging boundary polygon, and sampling SRTM elevation data...
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
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 rounded-2xl bg-white border border-stone-200 text-stone-600 hover:text-stone-900 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <RotateCcw size={13} />
                  <span>Analyze Another Plot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLabUploadModal(true)}
                  className="px-4 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
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
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm">
            <h3 className="text-base font-black text-stone-900 mb-1">
              Soil Health Records for Selected Farm
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Chronological log of preliminary satellite estimates and verified laboratory reports.
            </p>

            {historyReports.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs">
                No soil reports recorded for this farm yet. Run an analysis above or upload a lab test report.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 font-black uppercase text-[10px] tracking-wider border-b border-stone-200">
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
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                <ShieldCheck size={11} /> Lab Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-200">
                                <AlertTriangle size={11} className="text-amber-700" /> Estimated
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-stone-600">
                            {new Date(item.generated_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-stone-800">
                            {item.area_acres} ac
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-stone-900">
                            {isLab
                              ? item.lab_measured_values?.ph ?? props.ph?.mean
                              : props.ph?.value_range
                              ? `${props.ph.value_range[0]} - ${props.ph.value_range[1]}`
                              : props.ph?.mean}
                          </td>
                          <td className="px-4 py-3 text-stone-700">
                            {isLab ? `${item.lab_measured_values?.nitrogen_kg} kg/ac` : props.nitrogen?.level}
                          </td>
                          <td className="px-4 py-3 text-stone-700">
                            {isLab ? `${item.lab_measured_values?.phosphorus_kg} kg/ac` : 'Unmodeled'}
                          </td>
                          <td className="px-4 py-3 text-stone-700">
                            {isLab ? `${item.lab_measured_values?.potassium_kg} kg/ac` : props.potassium?.level}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-sky-800">
                            {isLab ? '100%' : `${item.overall_confidence_pct}%`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                setActiveReport(item)
                                setCurrentStep(4)
                                setActiveTab('analyzer')
                              }}
                              className="px-3 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors"
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
