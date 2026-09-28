import { useState, useEffect } from 'react'
import { MapPin, Radio } from 'lucide-react'
import axios from 'axios'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { createPinIcon } from '../components/RiskPin'
import { ErrorState } from '../components'

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
      const res = await axios.get('/api/v1/outbreak/heatmap')
      const points = res.data.points || []
      setHeatmapPoints(points)
      setSelectedHub(points.length > 0 ? points[0] : null)
    } catch (err) {
      setHeatmapPoints([])
      setSelectedHub(null)
      setError(err?.response?.data?.detail || err?.message || 'Could not load the outbreak heatmap. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filteredPoints = heatmapPoints.filter(p => filterRisk === 'All' || p.risk_level === filterRisk)
  const mapCenter = selectedHub ? [selectedHub.lat, selectedHub.lng] : [10.5, 78.0]

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-900 to-brand-800 rounded-3xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-3 py-1 bg-teal-500/30 text-teal-200 text-xs font-semibold rounded-full border border-teal-400/30">
            Haversine Distance Kernel Decay · Spatial Clustering
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Geospatial Outbreak Intelligence Map</h1>
        <p className="mt-2 text-teal-100 text-sm max-w-2xl">
          Real-time District & Village level pest/disease outbreak risk propagation across Tamil Nadu agro-climatic zones.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Hub List & Filters */}
        <div className="card p-6 space-y-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <Radio className="text-brand-600 animate-pulse" size={20} /> Active Outbreak Hubs
            </h2>
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              className="text-xs border border-stone-300 rounded-lg px-2 py-1"
            >
              <option value="All">All Risks</option>
              <option value="High">High Risk Only</option>
              <option value="Medium">Medium Risk Only</option>
              <option value="Low">Low Risk Only</option>
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-stone-400 text-center py-12">Loading outbreak hubs…</p>
          ) : error ? (
            <ErrorState message={error} onRetry={fetchHeatmap} />
          ) : (
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredPoints.map((pt, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedHub(pt)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedHub?.district === pt.district
                    ? 'border-brand-600 bg-brand-50/70 shadow-sm'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-stone-900 text-sm">{pt.district} — {pt.village}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    pt.risk_level === 'High' ? 'bg-red-100 text-red-800' :
                    pt.risk_level === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {pt.risk_level}
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-1">Primary Crop: {pt.crop} · Risk Score: {(pt.intensity * 100).toFixed(0)}%</p>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Interactive Map Visualizer */}
        <div className="lg:col-span-2 card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <MapPin className="text-red-500" size={20} /> Tamil Nadu Spatial Risk Grid
              </h3>
              <p className="text-xs text-stone-500">Coordinates: {selectedHub ? `${selectedHub.lat}, ${selectedHub.lng}` : "Select a hub"}</p>
            </div>

            {selectedHub && (
              <div className="text-right">
                <span className="text-xs text-stone-500">Propagation Radius</span>
                <p className="text-sm font-bold text-stone-800">50 km Bandwidth</p>
              </div>
            )}
          </div>

          {/* Real Leaflet Map with Risk Pins */}
          <div className="relative w-full h-[400px] rounded-2xl overflow-hidden shadow-inner border border-stone-200">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-400 text-sm">
                Loading spatial risk grid…
              </div>
            ) : error ? (
              <div className="w-full h-full flex items-center justify-center bg-stone-100">
                <ErrorState message={error} onRetry={fetchHeatmap} />
              </div>
            ) : (
              <MapContainer center={mapCenter} zoom={7} scrollWheelZoom className="w-full h-full">
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                {filteredPoints.map((pt, i) => (
                  <Marker
                    key={i}
                    position={[pt.lat, pt.lng]}
                    icon={createPinIcon({ risk_level: pt.risk_level }, 'pest')}
                    eventHandlers={{ click: () => setSelectedHub(pt) }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1 min-w-[150px]">
                        <p className="font-bold text-sm">{pt.district} — {pt.village}</p>
                        <p>Crop: <strong>{pt.crop}</strong></p>
                        <p>Risk Level: <strong>{pt.risk_level}</strong> ({(pt.intensity * 100).toFixed(0)}%)</p>
                        <p className="text-stone-400 font-mono">{pt.lat.toFixed(4)}, {pt.lng.toFixed(4)}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
          </div>

          {/* Selected Detail Banner */}
          {selectedHub && !loading && !error && (
            <div className="bg-stone-900 text-white p-4 rounded-xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">{selectedHub.district} ({selectedHub.village})</h4>
                <p className="text-xs text-stone-300">Dominant Crop: {selectedHub.crop} · Risk Transmission: {(selectedHub.intensity * 100).toFixed(0)}%</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                selectedHub.risk_level === 'High' ? 'bg-red-500' : selectedHub.risk_level === 'Medium' ? 'bg-amber-500' : 'bg-green-600'
              } text-white`}>
                {selectedHub.risk_level === 'High' ? '🚨 High Alert' : `${selectedHub.risk_level} Risk`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
