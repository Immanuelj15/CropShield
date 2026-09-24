import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Check, RotateCcw, ArrowRight, Layers, Sparkles } from 'lucide-react'
import DrawableMap from './DrawableMap'

// Quick helper to approximate acres from polygon in client
function approximateAcres(polygonGeoJSON) {
  if (!polygonGeoJSON || !polygonGeoJSON.coordinates || !polygonGeoJSON.coordinates[0]) {
    return 0
  }
  const ring = polygonGeoJSON.coordinates[0]
  if (ring.length < 3) return 0

  let areaM2 = 0
  const r = 6378137.0
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const lon1 = (ring[i][0] * Math.PI) / 180
    const lat1 = (ring[i][1] * Math.PI) / 180
    const lon2 = (ring[j][0] * Math.PI) / 180
    const lat2 = (ring[j][1] * Math.PI) / 180
    areaM2 += (lon2 - lon1) * (2.0 + Math.sin(lat1) + Math.sin(lat2))
  }
  areaM2 = Math.abs((areaM2 * (r * r)) / 2.0)
  const acres = areaM2 * 0.000247105
  return Math.max(0.1, Math.min(500, Math.round(acres * 100) / 100))
}

export default function BoundaryDrawingStep({
  boundaryPolygon,
  onBoundaryChange,
  onNext,
  center = [9.1728, 77.8710],
  zoom = 13,
}) {
  const [activePolygon, setActivePolygon] = useState(boundaryPolygon)
  const acres = approximateAcres(activePolygon)

  const handleShapeFinalized = (polygonGeoJSON) => {
    setActivePolygon(polygonGeoJSON)
    if (onBoundaryChange) {
      onBoundaryChange(polygonGeoJSON)
    }
  }

  const handleClear = () => {
    setActivePolygon(null)
    if (onBoundaryChange) {
      onBoundaryChange(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Instructions & Area Tracker */}
      <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
            <MapPin size={14} /> Step 1: Draw Farm Boundary on Satellite Map
          </span>
          <p className="text-xs text-stone-500 leading-relaxed max-w-xl">
            Use the top toolbar to switch between <strong>Drag Rectangle</strong> or <strong>Polygon Points</strong>.
            Outline the perimeter of your field. AgriGuard will analyze topsoil properties and terrain slope within this zone.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {activePolygon ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 flex items-center gap-2 text-emerald-900">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block text-emerald-700">Calculated Area</span>
                <span className="text-base font-black font-mono">{acres} Acres</span>
              </div>
            </div>
          ) : (
            <div className="bg-stone-50 border border-stone-200 rounded-2xl px-4 py-2.5 text-stone-500 text-xs font-medium">
              No boundary drawn yet
            </div>
          )}

          <button
            type="button"
            onClick={onNext}
            disabled={!activePolygon}
            className="px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-black transition-all flex items-center gap-2 shadow-sm"
          >
            <span>Confirm Boundary</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="w-full h-[580px] rounded-3xl overflow-hidden border border-stone-200 shadow-sm relative">
        <DrawableMap
          center={center}
          zoom={zoom}
          finalizedPolygon={activePolygon}
          onShapeFinalized={handleShapeFinalized}
          onClear={handleClear}
          pins={[]}
        />
      </div>
    </div>
  )
}
