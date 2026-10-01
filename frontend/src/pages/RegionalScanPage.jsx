import React, { useState } from 'react'
import { apiFetch, getUser } from '../utils/http'
import {
  Sparkles, Navigation, Satellite, AlertTriangle
} from 'lucide-react'
import DrawableMap from '../components/DrawableMap'
import RegionalResultSheet from '../components/RegionalResultSheet'

const REGIONAL_PRESETS = [
  { name: 'Kovilpatti', zone: 'Dryland', lat: 9.1768, lon: 77.9803, zoom: 11 },
  { name: 'Thanjavur', zone: 'Delta', lat: 10.7870, lon: 79.1378, zoom: 11 },
  { name: 'Madurai', zone: 'Irrigated', lat: 9.9252, lon: 78.1198, zoom: 11 },
  { name: 'Coimbatore', zone: 'Western', lat: 11.0168, lon: 76.9558, zoom: 11 },
  { name: 'Tirunelveli', zone: 'Southern', lat: 8.7139, lon: 77.7567, zoom: 11 },
]

function LegendDot({ className, children }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full inline-block ${className}`} />
      {children}
    </span>
  )
}

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
      if (err.status === 422 && /farms|too large|AREA_TOO_LARGE/i.test(err.message || '')) {
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
    <div className="space-y-6 animate-fade-in pb-24 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-brand-800 to-brand-600 rounded-3xl p-6 sm:p-7 text-white shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-white/15 text-brand-50 text-xs font-semibold rounded-full border border-white/20 flex items-center gap-1">
              <Sparkles size={12} />
              Interactive "Draw-to-Scan" · MongoDB 2dsphere Spatial Index
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-black/20 border border-white/20 text-white font-mono capitalize">
              Role: {userRole}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Interactive Regional Threat Scanner
          </h1>
          <p className="text-sm text-brand-50 leading-relaxed">
            Drag a rectangle or trace a polygon over any Tamil Nadu agricultural zone.
            AgriGuard finds every registered farm inside the boundary, aggregates each farm's latest
            risk assessment, and identifies the dominant pest threat.
          </p>
        </div>

        {/* Quick Region Presets */}
        <div className="flex flex-wrap items-center gap-1.5 bg-black/20 p-2 rounded-2xl border border-white/10">
          <span className="text-xs font-semibold text-brand-50 px-1.5 flex items-center gap-1">
            <Navigation size={12} /> Zone jump:
          </span>
          {REGIONAL_PRESETS.map((p) => (
            <button
              type="button"
              key={p.name}
              onClick={() => jumpToPreset(p)}
              title={`${p.name} (${p.zone})`}
              className="text-xs px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {p.name}
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

        {/* Map Legend — colours match RiskPin exactly */}
        <div className="mt-2.5 p-3 rounded-2xl bg-white border border-stone-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-700">Active map layer:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-semibold text-xs inline-flex items-center gap-1 ${
              colorMode === 'vegetation'
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}>
              {colorMode === 'vegetation'
                ? <><Satellite size={12} /> Sentinel-2 NDVI Canopy Health</>
                : <><AlertTriangle size={12} /> Climate Pest Outbreak Risk</>}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 font-medium">
            {colorMode === 'vegetation' ? (
              <>
                <LegendDot className="bg-green-700">Healthy (NDVI ≥ 0.40)</LegendDot>
                <LegendDot className="bg-amber-600">Declining (trend &lt; −0.15)</LegendDot>
                <LegendDot className="bg-amber-800">Stressed (NDVI &lt; 0.40)</LegendDot>
                <LegendDot className="bg-stone-400">No NDVI data</LegendDot>
              </>
            ) : (
              <>
                <LegendDot className="bg-red-600">High risk</LegendDot>
                <LegendDot className="bg-amber-600">Medium risk</LegendDot>
                <LegendDot className="bg-green-600">Low risk / no assessment</LegendDot>
              </>
            )}
          </div>
        </div>

        {/* Bottom Sheet for Scan Results */}
        <RegionalResultSheet
          scanResult={scanResult}
          loading={loading}
          error={error}
          errorTitle={errorKind === 'too_large' ? 'Zone too large to scan' : 'Scan failed'}
          onRetry={errorKind === 'failed' && finalizedPolygon ? () => runScan(finalizedPolygon) : undefined}
          userRole={userRole}
          polygonGeoJSON={finalizedPolygon}
          onClear={handleClear}
        />
      </div>
    </div>
  )
}
