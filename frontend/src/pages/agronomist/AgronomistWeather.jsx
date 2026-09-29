import { useState, useEffect } from 'react'
import { CloudRain, Thermometer, Droplets, Wind } from 'lucide-react'
import StatCard from '../../components/ui/StatCard'

import { apiFetch } from '../../utils/http'

export default function AgronomistWeather() {
  const [fieldWeather, setFieldWeather] = useState(null)
  const [farms, setFarms] = useState([])
  const [farmId, setFarmId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const list = await apiFetch('/farms')
        const withLocation = (Array.isArray(list) ? list : []).filter(f => f.location?.coordinates?.length >= 2)
        setFarms(withLocation)
        if (withLocation.length > 0) setFarmId(withLocation[0].farm_id)
        else setError('No registered farms with a GPS location yet.')
      } catch (e) { setError(e.message || 'Could not load farms.') }
    })()
  }, [])

  useEffect(() => {
    if (!farmId) return
    let cancelled = false
    setFieldWeather(null)
    setError('')
    ;(async () => {
      try {
        const data = await apiFetch(`/weather/${encodeURIComponent(farmId)}`)
        if (!cancelled) setFieldWeather(data)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load weather for this farm.')
      }
    })()
    return () => { cancelled = true }
  }, [farmId])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Pure Software Climate Telemetry</span>
          <h2 className="text-xl font-bold text-stone-900 mt-1">NASA POWER Satellite Agroclimatology View</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Real-time ambient temperature, humidity, rainfall, and VPD retrieved directly from NASA satellite reanalysis.
          </p>
        </div>
        {farms.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
            Farm
            <select
              id="agronomist-weather-farm"
              value={farmId}
              onChange={e => setFarmId(e.target.value)}
              className="px-3 py-1.5 border border-stone-200 rounded-lg text-xs bg-white"
            >
              {farms.map(f => (
                <option key={f.farm_id} value={f.farm_id}>{f.farm_name || f.farm_id}{f.district ? ` · ${f.district}` : ''}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">{error}</div>
      )}
      {fieldWeather?.data_quality?.is_synthetic && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
          Estimated weather: live NASA POWER data is unavailable for this farm right now.
        </div>
      )}

      {fieldWeather && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Thermometer} accent="amber" label="Surface Temp" value={`${fieldWeather.current_metrics?.temperature_c}°C`}
            trend={`Max: ${fieldWeather.current_metrics?.max_temperature_c}°C · Min: ${fieldWeather.current_metrics?.min_temperature_c}°C`} />
          <StatCard icon={Droplets} accent="sky" label="Relative Humidity" value={`${fieldWeather.current_metrics?.humidity_pct}%`} trend="NASA 2m Reanalysis" />
          <StatCard icon={Wind} accent="sky" label="Vapour Pressure" value={`${fieldWeather.current_metrics?.vapour_pressure_deficit_kpa} kPa`} trend="Calculated VPD" />
          <StatCard icon={Wind} accent="violet" label="Wind Velocity" value={`${fieldWeather.current_metrics?.wind_speed_ms} m/s`} trend="Surface dispersion rate" />
        </div>
      )}

      {fieldWeather?.microclimate_status && (
        <div className="p-4 bg-sky-50 rounded-2xl border border-sky-200 text-xs text-sky-900 leading-relaxed">
          <strong>Agro-Climatic Interpretation:</strong> {fieldWeather.microclimate_status}
        </div>
      )}
    </div>
  )
}

export const weatherMeta = { icon: CloudRain, label: 'Field Microclimate View' }
