import { useState, useEffect } from 'react'
import { CloudRain, Thermometer, Droplets, Wind } from 'lucide-react'
import StatCard from '../../components/ui/StatCard'

const API_BASE = '/api/v1'

export default function AgronomistWeather() {
  const [fieldWeather, setFieldWeather] = useState(null)
  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/weather/farm_demo`, { headers: authHeaders })
        if (res.ok) setFieldWeather(await res.json())
      } catch (e) { console.error(e) }
    })()
  }, [])

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
        <span className="px-3 py-1 bg-green-50 text-green-800 border border-green-200 rounded-lg text-xs font-bold">
          Daily Reanalysis Feed Active
        </span>
      </div>

      {fieldWeather && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={Thermometer} accent="amber" label="Surface Temp" value={`${fieldWeather.current_metrics?.temperature_c}°C`}
            trend={`Max: ${fieldWeather.current_metrics?.max_temperature_c}°C · Min: ${fieldWeather.current_metrics?.min_temperature_c}°C`} />
          <StatCard icon={Droplets} accent="sky" label="Relative Humidity" value={`${fieldWeather.current_metrics?.humidity_pct}%`} trend="NASA 2m Reanalysis" />
          <StatCard icon={Wind} accent="sky" label="Vapour Pressure" value={`${fieldWeather.current_metrics?.vapour_pressure_deficit_kpa} kPa`} trend="Calculated VPD" />
          <StatCard icon={Wind} accent="violet" label="Wind Velocity" value={`${fieldWeather.current_metrics?.wind_speed_ms} m/s`} trend="Surface dispersion rate" />
        </div>
      )}

      <div className="p-4 bg-sky-50 rounded-2xl border border-sky-200 text-xs text-sky-900 leading-relaxed">
        <strong>Agro-Climatic Interpretation:</strong> {fieldWeather?.microclimate_status || "Elevated night humidity combined with moderate winds promotes microclimate dew retention, predisposing susceptible cotton squares to bollworm oviposition."}
      </div>
    </div>
  )
}

export const weatherMeta = { icon: CloudRain, label: 'Field Microclimate View' }
