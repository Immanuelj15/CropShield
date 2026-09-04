import { useState, useEffect } from 'react'
import { MapPin, ShieldAlert, Radio, Filter, Info } from 'lucide-react'
import axios from 'axios'

export default function OutbreakMapPage() {
  const [heatmapPoints, setHeatmapPoints] = useState([])
  const [selectedHub, setSelectedHub] = useState(null)
  const [filterRisk, setFilterRisk] = useState('All')

  useEffect(() => {
    fetchHeatmap()
  }, [])

  const fetchHeatmap = async () => {
    try {
      const res = await axios.get('/api/v1/outbreak/heatmap')
      setHeatmapPoints(res.data.points || [])
      if (res.data.points && res.data.points.length > 0) {
        setSelectedHub(res.data.points[0])
      }
    } catch (err) {
      // Mock spatial data for TN hubs
      const mockPoints = [
        { lat: 11.0036, lng: 79.4731, intensity: 0.72, district: "Thanjavur", village: "Aduthurai", crop: "Rice", risk_level: "High" },
        { lat: 10.9934, lng: 76.8286, intensity: 0.45, district: "Coimbatore", village: "Thondamuthur", crop: "Cotton", risk_level: "Medium" },
        { lat: 10.8675, lng: 78.8166, intensity: 0.68, district: "Thiruchirapalli", village: "Lalgudi", crop: "Sugarcane", risk_level: "High" },
        { lat: 9.9699, lng: 77.7911, intensity: 0.81, district: "Madurai", village: "Usilampatti", crop: "Paddy", risk_level: "High" },
        { lat: 9.1728, lng: 77.8710, intensity: 0.75, district: "Tuticorin", village: "Kovilpatti", crop: "Cotton", risk_level: "High" },
        { lat: 12.5266, lng: 77.8256, intensity: 0.38, district: "Krishnagiri", village: "Hosur", crop: "Tomato", risk_level: "Medium" },
        { lat: 11.4102, lng: 76.6950, intensity: 0.25, district: "Nilgiris", village: "Ooty", crop: "Potato", risk_level: "Low" },
        { lat: 12.9469, lng: 78.8702, intensity: 0.58, district: "Vellore", village: "Gudiyatham", crop: "Groundnut", risk_level: "Medium" }
      ]
      setHeatmapPoints(mockPoints)
      setSelectedHub(mockPoints[0])
    }
  }

  const filteredPoints = heatmapPoints.filter(p => filterRisk === 'All' || p.risk_level === filterRisk)

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-900 to-emerald-800 rounded-3xl p-8 text-white shadow-xl">
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
              <Radio className="text-emerald-600 animate-pulse" size={20} /> Active Outbreak Hubs
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

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {filteredPoints.map((pt, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedHub(pt)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedHub?.district === pt.district
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
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

          {/* Graphical Map Representation */}
          <div className="relative w-full h-[400px] bg-stone-900 rounded-2xl overflow-hidden p-6 text-white flex flex-col justify-between shadow-inner">
            <div className="absolute inset-0 bg-[radial-gradient(#22c55e_1px,transparent_1px)] [background-size:16px_16px] opacity-10"></div>

            <div className="relative z-10 flex justify-between items-start">
              <span className="px-3 py-1 bg-white/10 backdrop-blur text-xs rounded-lg font-mono">
                REGION: TAMIL NADU, INDIA
              </span>
              <div className="flex gap-2">
                <span className="flex items-center gap-1 text-xs text-red-400 font-semibold"><span className="w-2 h-2 rounded-full bg-red-500"></span> High Risk</span>
                <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Medium Risk</span>
              </div>
            </div>

            {/* Hub Overlay Pins */}
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4 my-auto">
              {filteredPoints.slice(0, 8).map((pt, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedHub(pt)}
                  className={`p-3 rounded-xl backdrop-blur border cursor-pointer transition-all text-center ${
                    pt.risk_level === 'High' ? 'bg-red-500/20 border-red-500/50 hover:bg-red-500/30' :
                    pt.risk_level === 'Medium' ? 'bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/30' :
                    'bg-emerald-500/20 border-emerald-500/50 hover:bg-emerald-500/30'
                  }`}
                >
                  <MapPin size={18} className={`mx-auto mb-1 ${pt.risk_level === 'High' ? 'text-red-400' : 'text-amber-400'}`} />
                  <p className="text-xs font-bold truncate">{pt.district}</p>
                  <p className="text-[10px] text-stone-300">{(pt.intensity*100).toFixed(0)}% Risk</p>
                </div>
              ))}
            </div>

            {/* Selected Detail Banner */}
            {selectedHub && (
              <div className="relative z-10 bg-white/10 backdrop-blur p-4 rounded-xl border border-white/15 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white">{selectedHub.district} ({selectedHub.village})</h4>
                  <p className="text-xs text-stone-300">Dominant Crop: {selectedHub.crop} · Risk Transmission: {(selectedHub.intensity*100).toFixed(0)}%</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500 text-white">
                  🚨 High Alert
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
