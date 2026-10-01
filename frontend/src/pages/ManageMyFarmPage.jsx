import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Plus, Edit3, Trash2,
  Compass, AlertTriangle, Sparkles, Wallet,
  X,
  CheckCircle2, Globe
} from 'lucide-react'
import { MapContainer, TileLayer, Polygon, CircleMarker, useMap } from 'react-leaflet'
import clsx from 'clsx'
import BoundaryDrawingStep, { approximateAcres } from '../components/BoundaryDrawingStep'
import { ErrorState } from '../components'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { apiFetch, getUser } from '../utils/http'
import { fetchMyFarms, farmIdOf, canManageFarm } from '../utils/farms'

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

// Values must match the backend crop names (irrigation Kc table, fertilizer NPK table, activity
// planner and the pest model all key on these). Labels are what the farmer sees.
const CROPS = [
  { value: 'Cotton', label: 'Cotton' },
  { value: 'Rice', label: 'Rice (Paddy)' },
  { value: 'Maize', label: 'Maize' },
  { value: 'Sorghum', label: 'Sorghum (Cholam)' },
  { value: 'Millets', label: 'Millets' },
  { value: 'Pulses', label: 'Pulses (Black / Green Gram)' },
  { value: 'Groundnut', label: 'Groundnut' },
  { value: 'Sugarcane', label: 'Sugarcane' },
  { value: 'Sesamum', label: 'Sesame (Gingelly)' },
  { value: 'Sunflower', label: 'Sunflower' },
  { value: 'Banana', label: 'Banana' },
  { value: 'Turmeric', label: 'Turmeric' },
  { value: 'Chili', label: 'Chilli' },
  { value: 'Onion', label: 'Onion' },
  { value: 'Coconut', label: 'Coconut' },
]

// Must match the pest model's climate zones (predict-today validates these).
const CLIMATE_ZONES = ['Dryland', 'Irrigated', 'Delta', 'Semi-arid', 'Humid']

const WATER_LEVELS = [
  { value: 'Low', label: 'Low (Rainfed)' },
  { value: 'Medium', label: 'Medium (Canal / Well)' },
  { value: 'High', label: 'High (Borewell / Drip)' },
]

const ACRES_PER_HECTARE = 2.471

const FIELD_CLASS =
  'w-full px-4 py-2.5 rounded-xl border border-stone-300 bg-white text-stone-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500'
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

const acresOf = (farm) =>
  farm?.area_hectares ? Math.round(farm.area_hectares * ACRES_PER_HECTARE * 10) / 10 : null

// Options list that also contains a legacy stored value (so editing never silently swaps it).
function withCurrent(options, current) {
  if (!current || options.some((o) => (typeof o === 'string' ? o : o.value) === current)) return options
  return [typeof options[0] === 'string' ? current : { value: current, label: current }, ...options]
}

// Leaflet measures its container once; cards animate in (framer-motion layout), so re-measure.
function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250)
    return () => clearTimeout(t)
  }, [map])
  return null
}

// Mini Map component for card preview
function MiniBoundaryPreview({ boundaryGeoJSON, defaultCenter = [9.1728, 77.8710] }) {
  let positions = []
  let center = defaultCenter

  const ring = boundaryGeoJSON?.coordinates?.[0]
  if (Array.isArray(ring) && ring.length >= 3) {
    // GeoJSON is [lon, lat], Leaflet is [lat, lon]
    positions = ring.map((c) => [c[1], c[0]])
    const avgLat = positions.reduce((sum, p) => sum + p[0], 0) / positions.length
    const avgLng = positions.reduce((sum, p) => sum + p[1], 0) / positions.length
    center = [avgLat, avgLng]
  }

  return (
    <div className="w-full h-44 rounded-2xl overflow-hidden relative border border-stone-200 shadow-inner bg-stone-200">
      <MapContainer
        // MapContainer ignores center changes after mount — remount when the field moves (after an edit).
        key={`${center[0].toFixed(5)},${center[1].toFixed(5)},${positions.length}`}
        center={center}
        zoom={positions.length > 0 ? 15 : 13}
        scrollWheelZoom={false}
        dragging={false}
        touchZoom={false}
        zoomControl={false}
        doubleClickZoom={false}
        keyboard={false}
        attributionControl={false}
        className="w-full h-full"
      >
        <InvalidateSize />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        {positions.length > 0 ? (
          <Polygon
            positions={positions}
            pathOptions={{
              color: '#43b36c', // brand-400: visible on dark satellite imagery
              weight: 2.5,
              fillColor: '#219350', // brand-500
              fillOpacity: 0.35,
            }}
          />
        ) : (
          <CircleMarker
            center={center}
            radius={7}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0d5c2f', fillOpacity: 1 }}
          />
        )}
      </MapContainer>
      <div className="absolute top-2 right-2 z-[400] bg-stone-950/70 backdrop-blur-md text-xs font-semibold text-white px-2 py-0.5 rounded-full">
        {positions.length > 0 ? 'Satellite view' : 'Boundary not drawn'}
      </div>
      <div className="absolute bottom-1 right-2 z-[400] text-[11px] text-white/80 pointer-events-none">
        Imagery © Esri
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
  const [climateZone, setClimateZone] = useState('Dryland')
  const [cropType, setCropType] = useState('Cotton')
  const [soilType, setSoilType] = useState('Black Soil (Vertisol)')
  const [waterAvailability, setWaterAvailability] = useState('Medium')
  const [areaAcres, setAreaAcres] = useState(2.0)
  const [boundaryGeoJSON, setBoundaryGeoJSON] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, title }
  const toast = useToast()
  const currentUser = getUser()

  // Fetch registered farms
  const loadFarms = async () => {
    setLoading(true)
    setError(null)
    try {
      // Only the caller's own farms (admin: all) — contract 3
      setFarms(await fetchMyFarms())
    } catch (err) {
      console.error('Failed to load farms:', err)
      setError(err.message || 'Unable to load your fields.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFarms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the modal with Escape (not while saving)
  useEffect(() => {
    if (!isModalOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) setIsModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isModalOpen, submitting])

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingFarm(null)
    setFarmName('')
    setDistrict('Thoothukudi')
    setClimateZone('Dryland')
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
    if (!canManageFarm(farm, currentUser)) {
      toast.error('You can only edit your own farms.')
      return
    }
    setEditingFarm(farm)
    setFarmName(farm.farm_name || farm.name || '')
    setDistrict(farm.district || 'Thoothukudi')
    setClimateZone(farm.climate_zone || 'Dryland')
    setCropType(farm.crop_type || 'Cotton')
    setSoilType(farm.soil_type || 'Black Soil (Vertisol)')
    setWaterAvailability(farm.water_availability || 'Medium')
    setAreaAcres(acresOf(farm) ?? (farm.area_acres || 2.0))
    setBoundaryGeoJSON(farm.boundary_geojson || null)
    setModalStep(1)
    setIsModalOpen(true)
  }

  // Handle Boundary Change from BoundaryDrawingStep
  const handleBoundaryChange = (geojson) => {
    setBoundaryGeoJSON(geojson)
    const calculatedAcres = approximateAcres(geojson)
    if (calculatedAcres > 0) {
      setAreaAcres(Math.max(0.01, calculatedAcres))
    }
  }

  // Submit Save or Update
  const handleSubmitFarm = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!farmName.trim()) {
      toast.error('Please enter a field name.')
      return
    }
    const acresNum = Number(areaAcres)
    if (!Number.isFinite(acresNum) || acresNum <= 0) {
      toast.error('Please enter a field area greater than 0 acres.')
      return
    }

    setSubmitting(true)
    const hectares = Math.max(0.01, Math.round((acresNum / ACRES_PER_HECTARE) * 100) / 100)
    const payload = {
      farm_name: farmName.trim(),
      district,
      climate_zone: climateZone,
      crop_type: cropType,
      soil_type: soilType,
      water_availability: waterAvailability,
      area_hectares: hectares,
    }
    // Only send a boundary when one is drawn (the backend validates the ring; null would be ignored anyway).
    if (boundaryGeoJSON) payload.boundary_geojson = boundaryGeoJSON

    try {
      if (editingFarm) {
        const farmId = farmIdOf(editingFarm)
        await apiFetch(`/farms/${encodeURIComponent(farmId)}`, { method: 'PUT', json: payload })
      } else {
        await apiFetch('/farms', { method: 'POST', json: payload })
      }
      setIsModalOpen(false)
      toast.success(editingFarm ? 'Field updated successfully.' : 'Field registered successfully.')
      loadFarms()
    } catch (err) {
      console.error('Error saving farm:', err)
      // err.message is the normalized FastAPI detail (422 arrays become readable text)
      toast.error(err.message || 'Failed to save farm details.')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete farm
  const handleDeleteFarm = async (farmId) => {
    if (!farmId || deleting) return
    setDeleting(true)
    try {
      await apiFetch(`/farms/${encodeURIComponent(farmId)}`, { method: 'DELETE' })
      toast.success('Field removed.')
      loadFarms()
    } catch (err) {
      console.error('Delete error:', err)
      toast.error(err.message || 'Failed to delete farm.')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const totalAcres = farms.reduce((sum, f) => sum + (acresOf(f) ?? (Number(f.area_acres) || 0)), 0)
  const mappedCount = farms.filter((f) => f.boundary_geojson).length
  const districtCount = new Set(farms.map((f) => f.district).filter(Boolean)).size

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-stone-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 border border-brand-400/30 text-brand-200 text-xs font-bold tracking-wide">
              <Globe size={13} />
              <span>My Fields</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <Compass className="text-brand-300 shrink-0" size={28} />
              Manage My Farms
            </h1>
            <p className="text-sm text-brand-100/90 max-w-2xl leading-relaxed">
              Register each field and draw its boundary on the satellite map. AgriGuard AI uses the location for
              local weather, pest risk, vegetation (NDVI) and soil reports.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-brand-800 font-bold text-sm hover:bg-brand-50 shadow-lg transition-all shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
          >
            <Plus size={18} className="stroke-[3]" />
            <span>Register New Field</span>
          </button>
        </div>

        {/* Aggregate Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10 text-xs sm:text-sm">
          <div>
            <span className="text-brand-200 block text-xs font-bold uppercase tracking-wider">Total Fields</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-white">{loading ? '—' : farms.length}</span>
          </div>
          <div>
            <span className="text-brand-200 block text-xs font-bold uppercase tracking-wider">Total Area</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-white">
              {loading ? '—' : `${totalAcres.toLocaleString('en-IN', { maximumFractionDigits: 1 })} ac`}
            </span>
          </div>
          <div>
            <span className="text-brand-200 block text-xs font-bold uppercase tracking-wider">Boundaries Drawn</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-white">
              {loading ? '—' : `${mappedCount} / ${farms.length}`}
            </span>
          </div>
          <div>
            <span className="text-brand-200 block text-xs font-bold uppercase tracking-wider">Districts</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-white">{loading ? '—' : districtCount}</span>
          </div>
        </div>
      </div>

      {/* Farms Grid */}
      {loading ? (
        <div className="text-center py-20" role="status">
          <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-500 text-sm font-semibold">Loading your fields...</p>
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState message={error} onRetry={loadFarms} />
        </div>
      ) : farms.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
            <MapPin size={32} />
          </div>
          <h3 className="text-lg font-bold text-stone-800">No Fields Registered Yet</h3>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Draw your field boundary on the satellite map to unlock pest outbreak alerts, crop profit recommendations and soil health reports.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-all shadow-sm ${FOCUS_RING}`}
          >
            <Plus size={16} />
            <span>Register Your First Field</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {farms.map((farm) => {
            const farmId = farmIdOf(farm)
            const canManage = canManageFarm(farm, currentUser)
            const farmTitle = farm.farm_name || farm.name || 'Unnamed Field'
            const acres = acresOf(farm)
            const hasBoundary = !!farm.boundary_geojson
            const cropLabel = CROPS.find((c) => c.value === farm.crop_type)?.label || farm.crop_type || '—'

            return (
              <motion.div
                key={farmId}
                layout
                className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                {/* Card Top: Details & Actions */}
                <div className="p-5 sm:p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-stone-900 tracking-tight break-words">{farmTitle}</h2>
                        {hasBoundary && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                            <CheckCircle2 size={12} /> Mapped
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-stone-500">
                        <MapPin size={13} className="text-brand-600" />
                        <span>{farm.district || 'Tamil Nadu'}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {acres != null
                            ? `${acres.toLocaleString('en-IN')} acres (${farm.area_hectares} ha)`
                            : 'Area not set'}
                        </span>
                        {farm.climate_zone && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{farm.climate_zone}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(farm)}
                        className={`p-2 rounded-xl text-stone-500 hover:text-brand-700 hover:bg-brand-50 transition-colors ${FOCUS_RING}`}
                        title="Edit field details & boundary"
                        aria-label={`Edit ${farmTitle}`}
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: farmId, title: farmTitle })}
                        className={`p-2 rounded-xl text-stone-500 hover:text-red-600 hover:bg-red-50 transition-colors ${FOCUS_RING}`}
                        title="Delete field"
                        aria-label={`Delete ${farmTitle}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    )}
                  </div>

                  {/* Satellite Mini Map Preview */}
                  <MiniBoundaryPreview
                    boundaryGeoJSON={farm.boundary_geojson}
                    defaultCenter={
                      Array.isArray(farm.location?.coordinates) && farm.location.coordinates.length >= 2
                        ? [farm.location.coordinates[1], farm.location.coordinates[0]]
                        : [9.1728, 77.8710]
                    }
                  />

                  {/* Field Specs Pills */}
                  <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2 pt-2 text-xs">
                    <div className="bg-stone-50 border border-stone-100 rounded-xl p-2.5 min-w-0">
                      <span className="text-xs uppercase font-bold text-stone-500 block">Crop</span>
                      <span className="font-bold text-stone-800 truncate block" title={cropLabel}>{cropLabel}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-100 rounded-xl p-2.5 min-w-0">
                      <span className="text-xs uppercase font-bold text-stone-500 block">Soil</span>
                      <span className="font-bold text-stone-800 truncate block" title={farm.soil_type || ''}>{farm.soil_type || '—'}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-100 rounded-xl p-2.5 min-w-0">
                      <span className="text-xs uppercase font-bold text-stone-500 block">Water</span>
                      <span className="font-bold text-stone-800 truncate block">{farm.water_availability || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom: 4 Quick Links to Core Modules */}
                <div className="bg-stone-50/80 border-t border-stone-100 p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
                  {[
                    { to: '/farmer/today', label: "Today's Risk", Icon: AlertTriangle, iconClass: 'text-amber-600' },
                    { to: '/farmer/soil-health', label: 'Soil Health', Icon: Compass, iconClass: 'text-brand-600' },
                    { to: '/farmer/crop-recommendation', label: 'Crop Advisor', Icon: Sparkles, iconClass: 'text-brand-600' },
                    { to: '/farmer/expenses', label: 'Expenses & P&L', Icon: Wallet, iconClass: 'text-brand-700' },
                  ].map(({ to, label, Icon, iconClass }) => (
                    <button
                      key={to}
                      type="button"
                      onClick={() => navigate(to)}
                      className={`p-2 rounded-xl bg-white border border-stone-200 hover:border-brand-300 hover:bg-brand-50/50 text-stone-700 hover:text-brand-800 transition-all flex flex-col items-center gap-1 ${FOCUS_RING}`}
                    >
                      <Icon size={15} className={iconClass} />
                      <span className="text-xs">{label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Modal: Register / Edit Farm with Boundary Drawing */}
      <AnimatePresence>
        {isModalOpen && (
          <div
            className="fixed inset-0 z-[1100] flex items-start sm:items-center justify-center p-2 sm:p-4 bg-stone-950/70 backdrop-blur-sm overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="farm-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-4 sm:my-8 max-h-[calc(100vh-2rem)]"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between gap-3 bg-stone-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-2xl bg-brand-100 text-brand-800 flex items-center justify-center font-bold">
                    <MapPin size={20} />
                  </div>
                  <div className="min-w-0">
                    <h2 id="farm-modal-title" className="text-base font-bold text-stone-900 truncate">
                      {editingFarm ? `Edit Field: ${editingFarm.farm_name || editingFarm.name || ''}` : 'Register New Field'}
                    </h2>
                    <p className="text-xs text-stone-500">
                      Step {modalStep} of 2: {modalStep === 1 ? 'Draw boundary' : 'Field details'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  aria-label="Close"
                  className={`p-2 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 disabled:opacity-50 ${FOCUS_RING}`}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                {modalStep === 1 ? (
                  <div className="space-y-4">
                    <BoundaryDrawingStep
                      boundaryPolygon={boundaryGeoJSON}
                      onBoundaryChange={handleBoundaryChange}
                      onNext={() => setModalStep(2)}
                      onSkip={() => setModalStep(2)}
                      skipLabel={editingFarm ? 'Skip — keep without boundary' : 'Skip — add details only'}
                      center={
                        editingFarm && Array.isArray(editingFarm.location?.coordinates)
                          ? [editingFarm.location.coordinates[1], editingFarm.location.coordinates[0]]
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <form onSubmit={handleSubmitFarm} className="space-y-6">
                    {!boundaryGeoJSON && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                        No boundary drawn. The field will use {editingFarm ? 'its saved location' : 'a default location in Tamil Nadu'} for
                        weather and pest risk. You can draw the boundary later with Edit.
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Field Name */}
                      <div className="sm:col-span-2">
                        <label htmlFor="farm-name" className="label">Field / Plot Name</label>
                        <input
                          id="farm-name"
                          type="text"
                          required
                          maxLength={200}
                          value={farmName}
                          onChange={(e) => setFarmName(e.target.value)}
                          placeholder="e.g. North Kovilpatti Cotton Field"
                          className={FIELD_CLASS}
                        />
                      </div>

                      {/* District */}
                      <div>
                        <label htmlFor="farm-district" className="label">District (Tamil Nadu)</label>
                        <select
                          id="farm-district"
                          value={district}
                          onChange={(e) => setDistrict(e.target.value)}
                          className={FIELD_CLASS}
                        >
                          {withCurrent(TN_DISTRICTS, district).map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      {/* Area (Acres) */}
                      <div>
                        <label htmlFor="farm-area" className="label">Area (acres)</label>
                        <input
                          id="farm-area"
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="247000"
                          required
                          value={areaAcres}
                          onChange={(e) => setAreaAcres(e.target.value)}
                          className={`${FIELD_CLASS} font-mono`}
                        />
                        {boundaryGeoJSON && (
                          <p className="text-xs text-stone-500 mt-1">Calculated from your boundary. You can adjust it.</p>
                        )}
                      </div>

                      {/* Crop Type */}
                      <div>
                        <label htmlFor="farm-crop" className="label">Primary Crop</label>
                        <select
                          id="farm-crop"
                          value={cropType}
                          onChange={(e) => setCropType(e.target.value)}
                          className={FIELD_CLASS}
                        >
                          {withCurrent(CROPS, cropType).map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Climate Zone */}
                      <div>
                        <label htmlFor="farm-zone" className="label">Climate Zone</label>
                        <select
                          id="farm-zone"
                          value={climateZone}
                          onChange={(e) => setClimateZone(e.target.value)}
                          className={FIELD_CLASS}
                        >
                          {withCurrent(CLIMATE_ZONES, climateZone).map((z) => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                        </select>
                      </div>

                      {/* Soil Type */}
                      <div className="sm:col-span-2">
                        <label htmlFor="farm-soil" className="label">Dominant Soil Type</label>
                        <select
                          id="farm-soil"
                          value={soilType}
                          onChange={(e) => setSoilType(e.target.value)}
                          className={FIELD_CLASS}
                        >
                          {withCurrent(SOIL_TYPES, soilType).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* Water Availability */}
                      <div className="sm:col-span-2">
                        <span className="label" id="farm-water-label">Water Availability / Irrigation</span>
                        <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2" role="radiogroup" aria-labelledby="farm-water-label">
                          {WATER_LEVELS.map(({ value, label }) => {
                            const selected = waterAvailability === value
                            return (
                              <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setWaterAvailability(value)}
                                className={clsx(
                                  'py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center',
                                  FOCUS_RING,
                                  selected
                                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                    : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                                )}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Step Navigation Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t border-stone-200">
                      <button
                        type="button"
                        onClick={() => setModalStep(1)}
                        disabled={submitting}
                        className={`px-5 py-2.5 rounded-xl border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50 ${FOCUS_RING}`}
                      >
                        ← Back to Map
                      </button>

                      <button
                        type="submit"
                        disabled={submitting}
                        className={`px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
                      >
                        {submitting && (
                          <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        )}
                        {submitting ? 'Saving...' : editingFarm ? 'Save Changes' : 'Register Field'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => { if (!deleting) setDeleteTarget(null) }}
        onConfirm={() => handleDeleteFarm(deleteTarget?.id)}
        title={`Remove "${deleteTarget?.title || 'this field'}"?`}
        message="This field will be removed from your registered fields. This action cannot be undone."
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        danger
      />
    </div>
  )
}
