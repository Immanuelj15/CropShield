import React from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

// Create color-coded custom DivIcon for map pins
export function createRiskIcon(riskLevel = 'Low') {
  const isHigh = riskLevel === 'High'
  const isMed = riskLevel === 'Medium'

  const bgColor = isHigh ? '#dc2626' : isMed ? '#d97706' : '#16a34a'
  const ringColor = isHigh ? 'rgba(239, 68, 68, 0.4)' : isMed ? 'rgba(245, 158, 11, 0.4)' : 'rgba(34, 197, 94, 0.4)'
  const pulseClass = isHigh ? 'animate-ping' : ''

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

export default function RiskPin({ farm }) {
  const [lon, lat] = farm.location || [77.8710, 9.1728]
  const icon = createRiskIcon(farm.risk_level)

  const isHigh = farm.risk_level === 'High'
  const isMed = farm.risk_level === 'Medium'

  return (
    <Marker position={[lat, lon]} icon={icon}>
      <Popup className="farm-risk-popup">
        <div className="p-1 space-y-1.5 min-w-[170px] text-stone-800">
          <div className="flex items-center justify-between border-b border-stone-200 pb-1">
            <span className="font-bold text-xs truncate">{farm.name}</span>
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
          </div>

          <div className="text-[11px] space-y-0.5">
            <p className="text-stone-500">
              Crop: <strong className="text-stone-800">{farm.crop_type}</strong>
            </p>
            <p className="text-stone-500">
              Primary Threat: <strong className="text-stone-800">{farm.threat_name || 'None detected'}</strong>
            </p>
            <p className="text-[10px] text-stone-400 font-mono">
              GPS: {lat.toFixed(4)}, {lon.toFixed(4)}
            </p>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
