import React, { useState } from 'react'
import { MapPin, ArrowRight } from 'lucide-react'
import DrawableMap from './DrawableMap'

// Quick helper to approximate acres from polygon in client
export function approximateAcres(polygonGeoJSON) {
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
  return Math.round(acres * 100) / 100
}

export default function BoundaryDrawingStep({
  boundaryPolygon,
  onBoundaryChange,
  onNext,
  onSkip, // optional: lets the user continue without drawing (boundary is optional for some flows)
  skipLabel = 'Skip — enter details without a map',
  nextLabel = 'Confirm Boundary',
  center = [9.1728, 77.8710],
  zoom = 13,
}) {
  const [activePolygon, setActivePolygon] = useState(boundaryPolygon || null)
  const acres = approximateAcres(activePolygon)
  const tooLarge = acres > 500

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

  const areaLabel = acres > 0 && acres < 0.1 ? '< 0.1' : acres.toLocaleString('en-IN', { maximumFractionDigits: 2 })

  return (
    <div className="space-y-4">
      {/* Instructions & Area Tracker */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-700 flex items-center gap-1.5">
            <MapPin size={14} /> Step 1: Draw Your Farm Boundary
          </span>
          <p className="text-sm text-stone-600 leading-relaxed max-w-xl">
            Choose <strong>Rectangle</strong> (click and drag) or <strong>Polygon</strong> (tap each corner, then
            press <strong>Finish Boundary</strong>) in the map toolbar to outline your field.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activePolygon ? (
            <div
              className={`rounded-2xl px-4 py-2.5 flex items-center gap-2 border ${
                tooLarge ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-brand-50 border-brand-200 text-brand-900'
              }`}
            >
              <div>
                <span className={`text-xs font-bold uppercase tracking-wider block ${tooLarge ? 'text-amber-700' : 'text-brand-700'}`}>
                  Calculated Area
                </span>
                <span className="text-base font-bold font-mono">{areaLabel} acres</span>
                {tooLarge && (
                  <span className="block text-xs font-medium">Larger than a typical field — check the outline.</span>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-stone-50 border border-stone-200 rounded-2xl px-4 py-2.5 text-stone-600 text-xs font-medium">
              No boundary drawn yet
            </div>
          )}

          {onSkip && !activePolygon && (
            <button
              type="button"
              onClick={onSkip}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {skipLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onNext}
            disabled={!activePolygon}
            className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <span>{nextLabel}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div className="w-full h-[420px] sm:h-[560px] rounded-3xl overflow-hidden border border-stone-200 shadow-sm relative">
        <DrawableMap
          center={center}
          zoom={zoom}
          finalizedPolygon={activePolygon}
          onShapeFinalized={handleShapeFinalized}
          onClear={handleClear}
          farms={[]}
          showLayerSwitcher={false}
          completeLabel="Finish Boundary"
          rectangleHint="Click and drag over your field"
          polygonHint="Tap each corner of your field"
        />
      </div>
    </div>
  )
}
