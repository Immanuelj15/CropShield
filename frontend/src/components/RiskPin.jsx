import React from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

// Create color-coded custom DivIcon for map pins
export function createPinIcon(farm, colorMode = 'pest') {
  let bgColor = '#16a34a'
  let ringColor = 'rgba(34, 197, 94, 0.4)'
  let pulseClass = ''

  if (colorMode === 'vegetation') {
    // Distinct Green -> Amber -> Brown scale for NDVI vegetation health
    const status = farm.ndvi_status || (farm.ndvi_value !== undefined && farm.ndvi_value !== null
      ? (farm.ndvi_value < 0.4 ? 'stressed' : farm.ndvi_trend < -0.15 ? 'declining' : 'healthy')
      : 'healthy')

    if (status === 'stressed') {
      bgColor = '#92400e' // Earthy brown/rust
      ringColor = 'rgba(146, 64, 14, 0.4)'
      pulseClass = 'animate-ping'
    } else if (status === 'declining') {
      bgColor = '#d97706' // Amber/gold
      ringColor = 'rgba(217, 119, 6, 0.35)'
    } else {
      bgColor = '#15803d' // Forest green (vigorous)
      ringColor = 'rgba(21, 128, 61, 0.3)'
    }
  } else {
    // Standard Red / Amber / Green pest outbreak risk
    const isHigh = farm.risk_level === 'High'
    const isMed = farm.risk_level === 'Medium'

    bgColor = isHigh ? '#dc2626' : isMed ? '#d97706' : '#16a34a'
    ringColor = isHigh ? 'rgba(239, 68, 68, 0.4)' : isMed ? 'rgba(245, 158, 11, 0.4)' : 'rgba(34, 197, 94, 0.4)'
    pulseClass = isHigh ? 'animate-ping' : ''
  }

  const html = `
    <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
      <div class="${pulseClass}" style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${ringColor};"></div>
      <div style="width: 18px; height: 18px; border-radius: 50%; background: ${bgColor}; border: 2.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); z-index: 2;"></div>
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

export default function RiskPin({ farm, colorMode = 'pest' }) {
  const [lon, lat] = farm.location || [77.8710, 9.1728]
  const icon = createPinIcon(farm, colorMode)

  const isVegMode = colorMode === 'vegetation'
  const isHigh = farm.risk_level === 'High'
  const isMed = farm.risk_level === 'Medium'

  const vegStatus = farm.ndvi_status || (farm.ndvi_value < 0.4 ? 'stressed' : farm.ndvi_trend < -0.15 ? 'declining' : 'healthy')

  return (
    <Marker position={[lat, lon]} icon={icon}>
      <Popup className="farm-risk-popup">
        <div className="p-1 space-y-1.5 min-w-[180px] text-stone-800">
          <div className="flex items-center justify-between border-b border-stone-200 pb-1">
            <span className="font-bold text-xs truncate max-w-[110px]">{farm.name}</span>
            {isVegMode ? (
              <span
                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                  vegStatus === 'stressed'
                    ? 'bg-amber-900/20 text-amber-900 border border-amber-900/30'
                    : vegStatus === 'declining'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {vegStatus}
              </span>
            ) : (
              <span
                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                  isHigh
                    ? 'bg-red-100 text-red-700'
                    : isMed
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {farm.risk_level}
              </span>
            )}
          </div>

          <div className="text-[11px] space-y-0.5">
            <p className="text-stone-500">
              Crop: <strong className="text-stone-800">{farm.crop_type}</strong>
            </p>

            {isVegMode ? (
              <>
                <p className="text-stone-500">
                  Sentinel-2 NDVI: <strong className="text-stone-800">{farm.ndvi_value !== undefined && farm.ndvi_value !== null ? Number(farm.ndvi_value).toFixed(2) : '0.68 (Pending)'}</strong>
                </p>
                <p className="text-stone-500">
                  Trend (vs prior pass): <strong className={farm.ndvi_trend < 0 ? 'text-amber-800' : 'text-emerald-700'}>
                    {farm.ndvi_trend !== undefined && farm.ndvi_trend !== null ? (farm.ndvi_trend >= 0 ? `+${farm.ndvi_trend.toFixed(2)}` : farm.ndvi_trend.toFixed(2)) : 'Stable'}
                  </strong>
                </p>
              </>
            ) : (
              <p className="text-stone-500">
                Primary Threat: <strong className="text-stone-800">{farm.threat_name || 'None detected'}</strong>
              </p>
            )}

            <p className="text-[10px] text-stone-400 font-mono pt-0.5 border-t border-stone-100">
              GPS: {lat.toFixed(4)}, {lon.toFixed(4)}
            </p>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
