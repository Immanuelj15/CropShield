import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Plus, Edit3, Trash2, Sprout, Layers,
  Compass, AlertTriangle, Sparkles, Wallet,
  Calendar, Check, X, Shield, ArrowRight, ExternalLink,
  Droplets, CheckCircle2, ChevronRight, Globe
} from 'lucide-react'
import { MapContainer, TileLayer, Polygon } from 'react-leaflet'
import clsx from 'clsx'
import BoundaryDrawingStep from '../components/BoundaryDrawingStep'

const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
  'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur',
  'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris',
  'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga',
  'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
  'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore',
  'Viluppuram', 'Virudhunagar'
]

const SOIL_TYPES = [
  'Black Soil (Vertisol)',
  'Red Loam',
  'Alluvial Soil',
  'Clay Loam',
  'Sandy Loam',
  'Laterite Soil'
]

const CROPS = [
  'Cotton', 'Paddy (Rice)', 'Maize', 'Groundnut', 'Sugarcane',
  'Black Gram', 'Green Gram', 'Chilli', 'Tomato', 'Banana', 'Turmeric'
]

// Mini Map component for card preview
function MiniBoundaryPreview({ boundaryGeoJSON, defaultCenter = [9.1728, 77.8710] }) {
  let positions = []
  let center = defaultCenter

  if (boundaryGeoJSON && boundaryGeoJSON.coordinates && boundaryGeoJSON.coordinates[0]) {
    const coords = boundaryGeoJSON.coordinates[0]
    // GeoJSON is [lon, lat], Leaflet is [lat, lon]
    positions = coords.map((c) => [c[1], c[0]])
    if (positions.length > 0) {
      const avgLat = positions.reduce((sum, p) => sum + p[0], 0) / positions.length
      const avgLng = positions.reduce((sum, p) => sum + p[1], 0) / positions.length
      center = [avgLat, avgLng]
    }
  }

  return (
    <div className="w-full h-44 rounded-2xl overflow-hidden relative border border-stone-200 shadow-inner bg-stone-900">
      <MapContainer
        center={center}
        zoom={positions.length > 0 ? 15 : 13}
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        doubleClickZoom={false}
        attributionControl={false}
        className="w-full h-full"
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        {positions.length > 0 && (
          <Polygon
            positions={positions}
            pathOptions={{
              color: '#10b981',
              weight: 2.5,
              fillColor: '#10b981',
              fillOpacity: 0.35,
            }}
          />
        )}
      </MapContainer>
      <div className="absolute top-2 right-2 bg-stone-950/70 backdrop-blur-md text-[10px] font-bold text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
        Satellite Layer
      </div>
    </div>
  )
}

export default function ManageMyFarmPage() {
  const navigate = useNavigate()
  const [farms, setFarms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modal states for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingFarm, setEditingFarm] = useState(null) // null = creating new
  const [modalStep, setModalStep] = useState(1) // 1: draw boundary, 2: farm details

  // Form Fields
  const [farmName, setFarmName] = useState('')
  const [district, setDistrict] = useState('Thoothukudi')
  const [cropType, setCropType] = useState('Cotton')
  const [soilType, setSoilType] = useState('Black Soil (Vertisol)')
  const [waterAvailability, setWaterAvailability] = useState('Medium')
  const [areaAcres, setAreaAcres] = useState(2.0)
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch registered farms
  const loadFarms = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = sessionStorage.getItem('cropshield_token')
      const res = await fetch('/api/v1/farms', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setFarms(data || [])
      } else {
        // Fallback to /api/v1/farmer/profile
        const pRes = await fetch('/api/v1/farmer/profile', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (pRes.ok) {
          const profile = await pRes.json()
          setFarms(profile.farms || [])
        }
      }
    } catch (err) {
      console.error('Failed to load farms:', err)
      setError('Unable to load registered fields.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFarms()
  }, [])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingFarm(null)
    setFarmName('')
    setDistrict('Thoothukudi')
    setCropType('Cotton')
    setSoilType('Black Soil (Vertisol)')
    setWaterAvailability('Medium')
    setAreaAcres(2.0)
    setBoundaryGeoJSON(null)
    setModalStep(1)
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (farm) => {
    setEditingFarm(farm)
    setFarmName(farm.farm_name || farm.name || '')
    setDistrict(farm.district || 'Thoothukudi')
    setCropType(farm.crop_type || 'Cotton')
    setSoilType(farm.soil_type || 'Black Soil (Vertisol)')
    setWaterAvailability(farm.water_availability || 'Medium')
    const acres = farm.area_hectares ? Math.round(farm.area_hectares * 2.471 * 10) / 10 : (farm.area_acres || 2.0)
    setAreaAcres(acres)
    setBoundaryGeoJSON(farm.boundary_geojson || null)
    setModalStep(1)
    setIsModalOpen(true)
  }

  // Handle Boundary Change from BoundaryDrawingStep
  const handleBoundaryChange = (geojson) => {
    setBoundaryGeoJSON(geojson)
    if (geojson && geojson.coordinates && geojson.coordinates[0]) {
      const coords = geojson.coordinates[0]
      let areaM2 = 0
      const r = 6378137.0
      const n = coords.length
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const lon1 = (coords[i][0] * Math.PI) / 180
        const lat1 = (coords[i][1] * Math.PI) / 180
        const lon2 = (coords[j][0] * Math.PI) / 180
        const lat2 = (coords[j][1] * Math.PI) / 180
        areaM2 += (lon2 - lon1) * (2.0 + Math.sin(lat1) + Math.sin(lat2))
      }
      areaM2 = Math.abs((areaM2 * (r * r)) / 2.0)
      const calculatedAcres = Math.round((areaM2 * 0.000247105) * 100) / 100
      if (calculatedAcres > 0) {
        setAreaAcres(calculatedAcres)
      }
    }
  }

  // Submit Save or Update
  const handleSubmitFarm = async (e) => {
    e.preventDefault()
    if (!farmName.trim()) {
      alert('Please enter a field name.')
      return
    }

    setSubmitting(true)
    const hectares = Math.round((Number(areaAcres) / 2.471) * 100) / 100
    const payload = {
      farm_name: farmName.trim(),
      district,
      crop_type: cropType,
      soil_type: soilType,
      water_availability: waterAvailability,
      area_hectares: hectares || 1.0,
      boundary_geojson: boundaryGeoJSON,
    }

    try {
      const token = sessionStorage.getItem('cropshield_token')
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }

      let res
      if (editingFarm) {
        const farmId = editingFarm.id || editingFarm._id
        res = await fetch(`/api/v1/farms/${farmId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/v1/farms', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        setIsModalOpen(false)
        loadFarms()
      } else {
        const err = await res.json()
        alert(err.detail || 'Failed to save farm details.')
      }
    } catch (err) {
      console.error('Error saving farm:', err)
      alert('Network error while saving field.')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete farm
  const handleDeleteFarm = async (farmId, farmTitle) => {
    if (!window.confirm(`Are you sure you want to remove "${farmTitle}" from your registered fields?`)) {
      return
    }
    try {
      const res = await fetch(`/api/v1/farms/${farmId}`, { method: 'DELETE' })
      if (res.ok) {
        loadFarms()
      } else {
        alert('Failed to delete farm.')
      }
    } catch (err) {
      console.error('Delete error:', err)
      alert('Error deleting farm.')
    }
  }

  const totalAcres = farms.reduce((sum, f) => {
    const acres = f.area_hectares ? f.area_hectares * 2.471 : (f.area_acres || 2.0)
    return sum + acres
  }, 0)

  return (
    <div className="space-y-8 pb-16">
      {/* Page Header */}
      <div className="bg-gradient-to-br from-emerald-950 via-teal-900 to-stone-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold tracking-wide">
              <Globe size={13} />
              <span>Multi-Field Geospatial Registry</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Compass className="text-emerald-400 shrink-0" size={32} />
              Manage My Farms & Spatial Boundaries
            </h1>
            <p className="text-sm text-emerald-100/80 max-w-2xl leading-relaxed">
              Define the exact satellite coordinates of your agricultural plots. AgriGuard uses these polygons
              for localized NASA POWER weather reanalysis, Sentinel-2 vegetation scanning, and soil moisture tracking.
            </p>
          </div>

          <button
            onClick={handleOpenCreate}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-stone-950 font-black text-sm hover:from-emerald-400 hover:to-teal-400 shadow-xl shadow-emerald-950/40 transition-all cursor-pointer shrink-0"
          >
            <Plus size={18} className="stroke-[3]" />
            <span>Register New Field</span>
          </button>
        </div>

        {/* Aggregate Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10 text-xs sm:text-sm">
          <div>
            <span className="text-emerald-300/70 block text-[11px] font-bold uppercase tracking-wider">Total Fields</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-white">{farms.length}</span>
          </div>
          <div>
            <span className="text-emerald-300/70 block text-[11px] font-bold uppercase tracking-wider">Total Area</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-white">{totalAcres.toFixed(1)} Acres</span>
          </div>
          <div>
            <span className="text-emerald-300/70 block text-[11px] font-bold uppercase tracking-wider">Spatial Status</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">100% Monitored</span>
          </div>
          <div>
            <span className="text-emerald-300/70 block text-[11px] font-bold uppercase tracking-wider">Validation State</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-teal-300">P&L Linked</span>
          </div>
        </div>
      </div>

      {/* Farms Grid */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-500 text-sm font-semibold">Loading your registered agricultural fields...</p>
        </div>
      ) : farms.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <MapPin size={32} />
          </div>
          <h3 className="text-lg font-bold text-stone-800">No Farm Fields Registered Yet</h3>
          <p className="text-stone-500 text-xs max-w-md mx-auto">
            Draw your field boundary on the satellite map to unlock disease outbreak alerts, AI crop profit recommendations, and soil health reports.
          </p>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-all cursor-pointer shadow-sm"
          >
            <Plus size={16} />
            <span>Map First Field Boundary</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {farms.map((farm) => {
            const farmId = farm.id || farm._id
            const farmTitle = farm.farm_name || farm.name || 'Unnamed Field'
            const acres = farm.area_hectares
              ? Math.round(farm.area_hectares * 2.471 * 10) / 10
              : (farm.area_acres || 2.0)
            const hasBoundary = !!farm.boundary_geojson

            return (
              <motion.div
                key={farmId}
                layout
                className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                {/* Card Top: Details & Actions */}
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-stone-900 tracking-tight">{farmTitle}</h2>
                        {hasBoundary && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 size={11} /> Mapped
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                        <MapPin size={13} className="text-emerald-600" />
                        <span>{farm.district || 'Tamil Nadu'}</span>
                        <span>·</span>
                        <span>{acres} Acres ({farm.area_hectares || (acres / 2.471).toFixed(1)} ha)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(farm)}
                        className="p-2 rounded-xl text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                        title="Edit field details & boundary"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteFarm(farmId, farmTitle)}
                        className="p-2 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete field"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Satellite Mini Map Preview */}
                  <MiniBoundaryPreview
                    boundaryGeoJSON={farm.boundary_geojson}
                    defaultCenter={
                      farm.location?.coordinates
                        ? [farm.location.coordinates[1], farm.location.coordinates[0]]
                        : [9.1728, 77.8710]
                    }
                  />

                  {/* Field Specs Pills */}
                  <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                    <div className="bg-stone-50 border border-stone-100 rounded-xl p-2.5">
                      <span className="text-[10px] uppercase font-bold text-stone-400 block">Current Crop</span>
                      <span className="font-bold text-stone-800 truncate block">{farm.crop_type || 'Cotton'}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-100 rounded-xl p-2.5">
                      <span className="text-[10px] uppercase font-bold text-stone-400 block">Soil Type</span>
                      <span className="font-bold text-stone-800 truncate block">{farm.soil_type || 'Black Soil'}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-100 rounded-xl p-2.5">
                      <span className="text-[10px] uppercase font-bold text-stone-400 block">Water Source</span>
                      <span className="font-bold text-stone-800 truncate block">{farm.water_availability || 'Medium'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom: 4 Quick Links to Core Modules */}
                <div className="bg-stone-50/80 border-t border-stone-100 p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
                  <button
                    onClick={() => navigate('/farmer/today')}
                    className="p-2 rounded-xl bg-white border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-stone-700 hover:text-emerald-800 transition-all flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <AlertTriangle size={15} className="text-amber-500" />
                    <span className="text-[11px]">Today's Risk</span>
                  </button>

                  <button
                    onClick={() => navigate('/farmer/soil-health')}
                    className="p-2 rounded-xl bg-white border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-stone-700 hover:text-emerald-800 transition-all flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <Compass size={15} className="text-teal-600" />
                    <span className="text-[11px]">Soil Health</span>
                  </button>

                  <button
                    onClick={() => navigate('/farmer/crop-recommendation')}
                    className="p-2 rounded-xl bg-white border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-stone-700 hover:text-emerald-800 transition-all flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <Sparkles size={15} className="text-emerald-600" />
                    <span className="text-[11px]">Crop Advisor</span>
                  </button>

                  <button
                    onClick={() => navigate('/farmer/expenses')}
                    className="p-2 rounded-xl bg-white border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-stone-700 hover:text-emerald-800 transition-all flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <Wallet size={15} className="text-emerald-700" />
                    <span className="text-[11px]">P&L Tracker</span>
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Modal: Register / Edit Farm with Boundary Drawing */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[92vh]"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-stone-900">
                      {editingFarm ? `Edit Field: ${editingFarm.farm_name || editingFarm.name}` : 'Register New Field & Draw Boundary'}
                    </h2>
                    <p className="text-xs text-stone-500">
                      Step {modalStep} of 2: {modalStep === 1 ? 'Draw Boundary Polygon' : 'Agricultural Specifications'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1">
                {modalStep === 1 ? (
                  <div className="space-y-4">
                    <BoundaryDrawingStep
                      boundaryPolygon={boundaryGeoJSON}
                      onBoundaryChange={handleBoundaryChange}
                      onNext={() => setModalStep(2)}
                    />
                  </div>
                ) : (
                  <form onSubmit={handleSubmitFarm} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Field Name */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-stone-700">Field / Plot Name</label>
                        <input
                          type="text"
                          required
                          value={farmName}
                          onChange={(e) => setFarmName(e.target.value)}
                          placeholder="e.g. North Kovilpatti Cotton Field"
                          className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 text-stone-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      {/* District */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-stone-700">District (Tamil Nadu)</label>
                        <select
                          value={district}
                          onChange={(e) => setDistrict(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 text-stone-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        >
                          {TN_DISTRICTS.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      {/* Area (Acres) */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-stone-700">Area (Acres)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          required
                          value={areaAcres}
                          onChange={(e) => setAreaAcres(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 text-stone-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                        />
                      </div>

                      {/* Crop Type */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-stone-700">Primary Crop</label>
                        <select
                          value={cropType}
                          onChange={(e) => setCropType(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 text-stone-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        >
                          {CROPS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      {/* Soil Type */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-stone-700">Dominant Soil Type</label>
                        <select
                          value={soilType}
                          onChange={(e) => setSoilType(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 text-stone-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                        >
                          {SOIL_TYPES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Water Availability */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-stone-700">Water Availability / Irrigation</label>
                        <div className="grid grid-cols-3 gap-2">
                          {['Low (Rainfed)', 'Medium (Canal/Well)', 'High (Borewell/Drip)'].map((lvl) => {
                            const val = lvl.split(' ')[0]
                            const selected = waterAvailability === val
                            return (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => setWaterAvailability(val)}
                                className={clsx(
                                  'py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer',
                                  selected
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                    : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                                )}
                              >
                                {lvl}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Step Navigation Buttons */}
                    <div className="flex items-center justify-between pt-6 border-t border-stone-200">
                      <button
                        type="button"
                        onClick={() => setModalStep(1)}
                        className="px-5 py-2.5 rounded-2xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                      >
                        ← Back to Map
                      </button>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-2"
                      >
                        {submitting ? 'Saving Field...' : editingFarm ? 'Save Changes' : 'Confirm Registration'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
