import React from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

// Pin colours follow the shared risk semantics (Tailwind palette hex values,
// because Leaflet DivIcons are raw HTML outside the Tailwind class pipeline):
// low = green-600, medium = amber-600, high = red-600.
const PEST_COLORS = {
  High:   { bg: '#dc2626', ring: 'rgba(220, 38, 38, 0.35)' },   // red-600
  Medium: { bg: '#d97706', ring: 'rgba(217, 119, 6, 0.35)' },   // amber-600
  Low:    { bg: '#16a34a', ring: 'rgba(22, 163, 74, 0.35)' },   // green-600
}

// NDVI vegetation layer: healthy = green-700, declining = amber-600, stressed = amber-800,
// no satellite data = stone-400 (never shown as "healthy" without a reading).
const VEG_COLORS = {
  healthy:   { bg: '#15803d', ring: 'rgba(21, 128, 61, 0.3)' },
  declining: { bg: '#d97706', ring: 'rgba(217, 119, 6, 0.35)' },
  stressed:  { bg: '#92400e', ring: 'rgba(146, 64, 14, 0.4)' },
  no_data:   { bg: '#a8a29e', ring: 'rgba(168, 162, 158, 0.3)' },
}

const hasNdvi = (farm) => farm?.ndvi_value !== undefined && farm?.ndvi_value !== null && Number.isFinite(Number(farm.ndvi_value))

// Mirrors backend ndvi_service.derive_vegetation_status (NDVI < 0.40 stressed; trend < -0.15 declining)
export function vegetationStatusOf(farm) {
  if (!hasNdvi(farm)) return 'no_data'
  if (farm.ndvi_status) return farm.ndvi_status
  const v = Number(farm.ndvi_value)
  if (v < 0.4) return 'stressed'
  if (farm.ndvi_trend != null && Number(farm.ndvi_trend) < -0.15) return 'declining'
  return 'healthy'
}

const VEG_LABELS = { healthy: 'Healthy', declining: 'Declining', stressed: 'Stressed', no_data: 'No NDVI data' }

// Create color-coded custom DivIcon for map pins
export function createPinIcon(farm, colorMode = 'pest') {
  let colors
  let pulse = false

  if (colorMode === 'vegetation') {
    const status = vegetationStatusOf(farm)
    colors = VEG_COLORS[status] || VEG_COLORS.no_data
    pulse = status === 'stressed'
  } else {
    colors = PEST_COLORS[farm?.risk_level] || PEST_COLORS.Low
    pulse = farm?.risk_level === 'High'
  }

  const html = `
    <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
      <div class="${pulse ? 'animate-ping' : ''}" style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${colors.ring};"></div>
      <div style="width: 18px; height: 18px; border-radius: 50%; background: ${colors.bg}; border: 2.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); z-index: 2;"></div>
    </div>
  `

  return L.divIcon({
    html,
    className: 'custom-risk-pin',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

// Backward-compatible alias
export const createRiskIcon = (riskLevel) => createPinIcon({ risk_level: riskLevel }, 'pest')

const RISK_BADGE = {
  High: 'bg-red-100 text-red-800',
  Medium: 'bg-amber-100 text-amber-800',
  Low: 'bg-green-100 text-green-800',
}

const VEG_BADGE = {
  stressed: 'bg-amber-100 text-amber-900 border border-amber-300',
  declining: 'bg-amber-50 text-amber-800 border border-amber-200',
  healthy: 'bg-green-100 text-green-800',
  no_data: 'bg-stone-100 text-stone-600',
}

export default function RiskPin({ farm, colorMode = 'pest' }) {
  const coords = Array.isArray(farm?.location) && farm.location.length >= 2 ? farm.location : null
  if (!coords) return null
  const [lon, lat] = coords.map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const icon = createPinIcon(farm, colorMode)
  const isVegMode = colorMode === 'vegetation'
  const vegStatus = vegetationStatusOf(farm)
  const trend = farm.ndvi_trend != null && Number.isFinite(Number(farm.ndvi_trend)) ? Number(farm.ndvi_trend) : null

  return (
    <Marker position={[lat, lon]} icon={icon}>
      <Popup className="farm-risk-popup">
        <div className="p-1 space-y-1.5 min-w-[180px] text-stone-800">
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-1">
            <span className="font-semibold text-xs truncate max-w-[120px]" title={farm.name}>{farm.name || 'Farm'}</span>
            {isVegMode ? (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${VEG_BADGE[vegStatus] || VEG_BADGE.no_data}`}>
                {VEG_LABELS[vegStatus] || vegStatus}
              </span>
            ) : (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${RISK_BADGE[farm.risk_level] || 'bg-stone-100 text-stone-600'}`}>
                {farm.risk_level || 'Unknown'}
              </span>
            )}
          </div>

          <div className="text-xs space-y-0.5">
            <p className="text-stone-500">
              Crop: <strong className="text-stone-800">{farm.crop_type || '—'}</strong>
            </p>

            {isVegMode ? (
              <>
                <p className="text-stone-500">
                  Sentinel-2 NDVI: <strong className="text-stone-800">{hasNdvi(farm) ? Number(farm.ndvi_value).toFixed(2) : 'Not available yet'}</strong>
                </p>
                {hasNdvi(farm) && (
                  <p className="text-stone-500">
                    Trend (vs prior pass): <strong className={trend != null && trend < 0 ? 'text-amber-800' : 'text-green-700'}>
                      {trend != null ? (trend >= 0 ? `+${trend.toFixed(2)}` : trend.toFixed(2)) : '—'}
                    </strong>
                  </p>
                )}
              </>
            ) : (
              <p className="text-stone-500">
                Primary threat: <strong className="text-stone-800">{farm.threat_name || 'None detected'}</strong>
              </p>
            )}

            <p className="text-xs text-stone-500 font-mono pt-0.5 border-t border-stone-100">
              GPS: {lat.toFixed(4)}, {lon.toFixed(4)}
            </p>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
