import React, { useState } from 'react'
import { apiFetch, getUser } from '../utils/http'
import {
  Sparkles, Navigation
} from 'lucide-react'
import DrawableMap from '../components/DrawableMap'
import RegionalResultSheet from '../components/RegionalResultSheet'

const REGIONAL_PRESETS = [
  { name: 'Kovilpatti (Dryland)', lat: 9.1768, lon: 77.9803, zoom: 11 },
  { name: 'Thanjavur (Delta)', lat: 10.7870, lon: 79.1378, zoom: 11 },
  { name: 'Madurai (Irrigated)', lat: 9.9252, lon: 78.1198, zoom: 11 },
  { name: 'Coimbatore (Western)', lat: 11.0168, lon: 76.9558, zoom: 11 },
  { name: 'Tirunelveli (Southern)', lat: 8.7139, lon: 77.7567, zoom: 11 },
]

export default function RegionalScanPage() {
  const [mapCenter, setMapCenter] = useState([9.9252, 78.1198])
  const [mapZoom, setMapZoom] = useState(9)
  const [finalizedPolygon, setFinalizedPolygon] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [errorKind, setErrorKind] = useState(null) // 'too_large' | 'failed'
  // Role for UI comes from the shared session (P2-3); the backend still enforces RBAC.
  const [userRole] = useState(() => getUser()?.role || 'farmer')
  const [colorMode, setColorMode] = useState('pest') // 'pest' | 'vegetation'

  const runScan = async (polygonGeoJSON) => {
    setLoading(true)
    setError(null)
    setErrorKind(null)
    setScanResult(null)

    try {
      const data = await apiFetch('/outbreak/scan-area', { method: 'POST', json: polygonGeoJSON })
      setScanResult(data)
    } catch (err) {
      console.error('Scan area error:', err)
      // P2-5: never fabricate a result — show an error state with retry instead.
      if (err.status === 422) {
        setErrorKind('too_large')
        setError(err.message || 'Selected zone is too large (>500 farms). Please zoom in and scan a smaller zone.')
      } else {
        setErrorKind('failed')
        setError(err.message || 'The regional scan could not be completed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleShapeFinalized = (polygonGeoJSON) => {
    setFinalizedPolygon(polygonGeoJSON)
    runScan(polygonGeoJSON)
  }

  const handleClear = () => {
    setFinalizedPolygon(null)
    setScanResult(null)
    setError(null)
    setErrorKind(null)
  }

  const jumpToPreset = (preset) => {
    setMapCenter([preset.lat, preset.lon])
    setMapZoom(preset.zoom)
    handleClear()
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-24 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-brand-800 to-brand-900 rounded-3xl p-7 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-brand-400/20 text-brand-200 text-xs font-semibold rounded-full border border-brand-400/30 flex items-center gap-1">
              <Sparkles size={12} className="text-brand-300" />
              Interactive "Draw-to-Scan" · MongoDB 2dsphere Spatial Index
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-stone-900/40 border border-white/20 text-stone-200 font-mono capitalize">
              Role: {userRole}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Interactive Regional Threat Scanner
          </h1>
          <p className="text-xs sm:text-sm text-brand-100/90 leading-relaxed">
            Drag a rectangle or trace a polygon over any Tamil Nadu agricultural zone.
            AgriGuard instantly indexes every registered farm within the boundary, runs real-time
            risk aggregation, and computes dominant pest threats.
          </p>
        </div>

        {/* Quick Region Presets */}
        <div className="flex flex-wrap items-center gap-1.5 bg-black/25 backdrop-blur-sm p-2 rounded-2xl border border-white/10">
          <span className="text-[11px] font-bold text-brand-300 px-1.5 flex items-center gap-1">
            <Navigation size={12} /> Zone Jump:
          </span>
          {REGIONAL_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => jumpToPreset(p)}
              className="text-[11px] px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
            >
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Main Map Container */}
      <div className="relative">
        <DrawableMap
          center={mapCenter}
          zoom={mapZoom}
          farms={scanResult?.farms || []}
          finalizedPolygon={finalizedPolygon}
          onShapeFinalized={handleShapeFinalized}
          onClear={handleClear}
          colorMode={colorMode}
          onChangeColorMode={setColorMode}
        />

        {/* Dynamic Map Legend Badge */}
        <div className="mt-2.5 p-3 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-stone-700">Active Map Layer:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-extrabold uppercase text-[10px] ${
              colorMode === 'vegetation'
                ? 'bg-brand-100 text-brand-800 border border-brand-300'
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}>
              {colorMode === 'vegetation' ? '🛰️ Sentinel-2 NDVI Canopy Health' : '🚨 Climate Pest Outbreak Risk'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-600 font-medium">
            {colorMode === 'vegetation' ? (
              <>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block"></span> Vigorous (NDVI &ge; 0.60)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> Moderate/Declining (0.40–0.60)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-900 inline-block"></span> Stressed Canopy (&lt; 0.40)</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span> High Risk (&ge; 65%)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> Medium Risk (35–65%)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block"></span> Low Risk (&lt; 35%)</span>
              </>
            )}
          </div>
        </div>

        {/* Bottom Sheet for Scan Results */}
        <RegionalResultSheet
          scanResult={scanResult}
          loading={loading}
          error={error}
          errorTitle={errorKind === 'too_large' ? 'Zone Scan Exceeded' : 'Scan failed'}
          onRetry={errorKind === 'failed' && finalizedPolygon ? () => runScan(finalizedPolygon) : undefined}
          userRole={userRole}
          polygonGeoJSON={finalizedPolygon}
          onClear={handleClear}
        />
      </div>
    </div>
  )
}
