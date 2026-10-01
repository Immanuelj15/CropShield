import { useState, useEffect } from 'react'
import { MapPin, Radio, Info, Filter } from 'lucide-react'
import api from '../utils/api'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { createPinIcon } from '../components/RiskPin'
import { ErrorState } from '../components'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import DemoDataBadge from '../components/ui/DemoDataBadge'

const TN_CENTER = [10.5, 78.0]

const hubKey = (pt) => `${pt.district}-${pt.village}`
const pct = (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100)}%` : '—')

// MapContainer's `center` is only read on mount — pan the map when the selected hub changes.
function FlyToHub({ hub }) {
  const map = useMap()
  useEffect(() => {
    if (hub && Number.isFinite(hub.lat) && Number.isFinite(hub.lng)) {
      map.flyTo([hub.lat, hub.lng], Math.max(map.getZoom(), 8), { duration: 0.6 })
    }
  }, [hub, map])
  return null
}

function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-600">
      <span className="font-semibold text-stone-700">Legend:</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> High (≥ 70%)</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> Medium (40–69%)</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block" /> Low (&lt; 40%)</span>
    </div>
  )
}

export default function OutbreakMapPage() {
  const [heatmapPoints, setHeatmapPoints] = useState([])
  const [selectedHub, setSelectedHub] = useState(null)
  const [filterRisk, setFilterRisk] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchHeatmap()
  }, [])

  const fetchHeatmap = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/outbreak/heatmap')
      const points = (Array.isArray(res.data?.points) ? res.data.points : [])
        .filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
      setHeatmapPoints(points)
      setSelectedHub(points.length > 0 ? points[0] : null)
    } catch (err) {
      setHeatmapPoints([])
      setSelectedHub(null)
      setError(err?.message || 'Could not load the outbreak heatmap. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filteredPoints = heatmapPoints.filter(p => filterRisk === 'All' || p.risk_level === filterRisk)
  const initialCenter = selectedHub ? [selectedHub.lat, selectedHub.lng] : TN_CENTER

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-800 to-brand-600 rounded-3xl p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="px-3 py-1 bg-white/15 text-brand-50 text-xs font-semibold rounded-full border border-white/20">
            Haversine Distance Kernel Decay · Spatial Clustering
          </span>
          <DemoDataBadge title="Hotspot locations and baseline risk scores are a fixed reference set, not live field observations." />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Geospatial Outbreak Intelligence Map</h1>
        <p className="mt-2 text-brand-50 text-sm max-w-2xl">
          District and village-level pest and disease hotspots across Tamil Nadu agro-climatic zones,
          with risk propagated over a 50 km distance-decay kernel.
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs">
        <Info size={15} className="shrink-0 mt-0.5 text-sky-700" />
        <p>
          These hotspots and their baseline risk scores come from a fixed reference dataset bundled with the server.
          They are illustrative and are not updated from live field reports. For your own farm's risk, use Today's Warning.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hub List & Filters */}
        <div className="card p-5 sm:p-6 space-y-4 lg:col-span-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
              <Radio className="text-brand-600" size={20} /> Outbreak Hubs
            </h2>
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <Filter size={13} className="text-stone-500" />
              <span className="sr-only">Filter by risk level</span>
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value)}
                className="text-xs border border-stone-300 rounded-lg px-2 py-1 bg-white text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <option value="All">All Risks</option>
                <option value="High">High Risk Only</option>
                <option value="Medium">Medium Risk Only</option>
                <option value="Low">Low Risk Only</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="Loading outbreak hubs">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-stone-100 animate-pulse" />)}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={fetchHeatmap} />
          ) : filteredPoints.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title={heatmapPoints.length === 0 ? 'No hotspots available' : 'No hubs match this filter'}
              message={heatmapPoints.length === 0
                ? 'The server returned no outbreak hotspots.'
                : 'Try a different risk level filter.'}
              actionLabel={heatmapPoints.length === 0 ? undefined : 'Show all risks'}
              onAction={heatmapPoints.length === 0 ? undefined : () => setFilterRisk('All')}
            />
          ) : (
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filteredPoints.map((pt) => {
                const isSelected = selectedHub && hubKey(selectedHub) === hubKey(pt)
                return (
                  <button
                    type="button"
                    key={hubKey(pt)}
                    onClick={() => setSelectedHub(pt)}
                    aria-pressed={!!isSelected}
                    className={`w-full text-left p-4 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50/70 shadow-sm'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-stone-900 text-sm truncate">{pt.district} — {pt.village}</h3>
                      <Badge status={pt.risk_level} icon={false}>{pt.risk_level}</Badge>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">Primary crop: {pt.crop} · Baseline risk: {pct(pt.intensity)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Interactive Map Visualizer */}
        <div className="lg:col-span-2 card p-5 sm:p-6 space-y-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
                <MapPin className="text-brand-600" size={20} /> Tamil Nadu Spatial Risk Grid
              </h3>
              <p className="text-xs text-stone-500">
                Coordinates: {selectedHub ? `${selectedHub.lat.toFixed(4)}, ${selectedHub.lng.toFixed(4)}` : 'Select a hub'}
              </p>
            </div>

            {selectedHub && (
              <div className="text-right">
                <span className="text-xs text-stone-500">Propagation radius</span>
                <p className="text-sm font-semibold text-stone-800">50 km bandwidth</p>
              </div>
            )}
          </div>

          {/* Leaflet map with risk pins */}
          <div className="relative w-full h-[320px] sm:h-[420px] rounded-2xl overflow-hidden border border-stone-200 isolate">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-500 text-sm animate-pulse">
                Loading spatial risk grid…
              </div>
            ) : error ? (
              <div className="w-full h-full flex items-center justify-center bg-stone-100">
                <ErrorState message={error} onRetry={fetchHeatmap} />
              </div>
            ) : (
              <MapContainer center={initialCenter} zoom={7} scrollWheelZoom={false} className="w-full h-full">
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                <FlyToHub hub={selectedHub} />
                {filteredPoints.map((pt) => (
                  <Marker
                    key={hubKey(pt)}
                    position={[pt.lat, pt.lng]}
                    icon={createPinIcon({ risk_level: pt.risk_level }, 'pest')}
                    eventHandlers={{ click: () => setSelectedHub(pt) }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1 min-w-[160px] text-stone-800">
                        <p className="font-semibold text-sm">{pt.district} — {pt.village}</p>
                        <p>Crop: <strong>{pt.crop}</strong></p>
                        <p>Risk level: <strong>{pt.risk_level}</strong> ({pct(pt.intensity)})</p>
                        <p className="text-stone-500 font-mono">{pt.lat.toFixed(4)}, {pt.lng.toFixed(4)}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
          </div>

          {!loading && !error && <MapLegend />}

          {/* Selected Detail Banner */}
          {selectedHub && !loading && !error && (
            <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-stone-900">{selectedHub.district} ({selectedHub.village})</h4>
                <p className="text-xs text-stone-600">Dominant crop: {selectedHub.crop} · Baseline risk: {pct(selectedHub.intensity)}</p>
              </div>
              <Badge status={selectedHub.risk_level}>
                {selectedHub.risk_level === 'High' ? 'High Alert' : `${selectedHub.risk_level} Risk`}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
