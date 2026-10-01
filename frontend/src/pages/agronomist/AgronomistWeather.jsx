import { useState, useEffect, useCallback } from 'react'
import { CloudRain, Thermometer, Droplets, Wind, Gauge, MapPin } from 'lucide-react'
import StatCard from '../../components/ui/StatCard'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'
import { farmIdOf, farmNameOf } from '../../utils/farms'

const num = (v, digits = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : null)
const withUnit = (v, unit, digits) => {
  const n = num(v, digits)
  return n === null ? '—' : `${n}${unit}`
}

export default function AgronomistWeather() {
  const [fieldWeather, setFieldWeather] = useState(null)
  const [farms, setFarms] = useState([])
  const [farmId, setFarmId] = useState('')
  const [farmsLoading, setFarmsLoading] = useState(true)
  const [farmsError, setFarmsError] = useState('')
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const loadFarms = useCallback(async () => {
    setFarmsLoading(true)
    setFarmsError('')
    try {
      // GET /farms returns all farms for agronomists/admins (serialize_farm shape with GeoJSON `location`)
      const list = await apiFetch('/farms?limit=500')
      const withLocation = (Array.isArray(list) ? list : []).filter((f) => f.location?.coordinates?.length >= 2 && farmIdOf(f))
      setFarms(withLocation)
      setFarmId((prev) => (prev && withLocation.some((f) => farmIdOf(f) === prev) ? prev : (withLocation[0] ? farmIdOf(withLocation[0]) : '')))
    } catch (e) {
      setFarmsError(e.message || 'Could not load farms.')
    } finally {
      setFarmsLoading(false)
    }
  }, [])

  useEffect(() => { loadFarms() }, [loadFarms])

  useEffect(() => {
    if (!farmId) return undefined
    let cancelled = false
    setFieldWeather(null)
    setWeatherError('')
    setWeatherLoading(true)
    ;(async () => {
      try {
        const data = await apiFetch(`/weather/${encodeURIComponent(farmId)}`)
        if (!cancelled) setFieldWeather(data)
      } catch (e) {
        if (!cancelled) setWeatherError(e.message || 'Could not load weather for this farm.')
      } finally {
        if (!cancelled) setWeatherLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [farmId, reloadKey])

  const m = fieldWeather?.current_metrics || {}

  return (
    <div className="card p-5 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="min-w-0">
          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Satellite climate data</span>
          <h2 className="text-xl font-bold text-stone-900 mt-1">Field microclimate (NASA POWER)</h2>
          <p className="text-sm text-stone-600 mt-0.5">
            Latest daily temperature, humidity, rainfall, wind and vapour pressure deficit for a registered farm.
          </p>
        </div>
        {farms.length > 0 && (
          <div className="w-full sm:w-72 shrink-0">
            <label htmlFor="agronomist-weather-farm" className="label">Farm</label>
            <select
              id="agronomist-weather-farm"
              value={farmId}
              onChange={(e) => setFarmId(e.target.value)}
              className="input-field text-sm py-2.5"
            >
              {farms.map((f) => (
                <option key={farmIdOf(f)} value={farmIdOf(f)}>
                  {farmNameOf(f, farmIdOf(f))}{f.district ? ` · ${f.district}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {farmsLoading ? (
        <LoadingState message="Loading farms…" />
      ) : farmsError ? (
        <ErrorState message={farmsError} onRetry={loadFarms} />
      ) : farms.length === 0 ? (
        <EmptyState icon={MapPin} title="No farms with GPS" message="No registered farms with a GPS location yet." />
      ) : weatherLoading ? (
        <LoadingState message="Fetching satellite weather…" />
      ) : weatherError ? (
        <ErrorState message={weatherError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : fieldWeather ? (
        <>
          {fieldWeather.data_quality?.is_synthetic && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
              Estimated weather: live NASA POWER data is unavailable for this farm right now, so climatology estimates are shown.
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard icon={Thermometer} accent="amber" label="Air temperature" value={withUnit(m.temperature_c, '°C')}
              trend={`Max ${withUnit(m.max_temperature_c, '°C')} · Min ${withUnit(m.min_temperature_c, '°C')}`} />
            <StatCard icon={Droplets} accent="sky" label="Relative humidity" value={withUnit(m.humidity_pct, '%')} trend="At 2 m height" />
            <StatCard icon={CloudRain} accent="sky" label="Rainfall" value={withUnit(m.rainfall_mm, ' mm')} trend="Latest day" />
            <StatCard icon={Gauge} accent="brand" label="Vapour pressure deficit" value={withUnit(m.vapour_pressure_deficit_kpa, ' kPa', 2)} trend="Calculated" />
            <StatCard icon={Wind} accent="brand" label="Wind speed" value={withUnit(m.wind_speed_ms, ' m/s')} trend="At 2 m height" />
          </div>

          <p className="text-xs text-stone-500">
            Source: {fieldWeather.data_source || 'NASA POWER'}
            {fieldWeather.gps_coordinates ? ` · ${num(fieldWeather.gps_coordinates.latitude, 4)}, ${num(fieldWeather.gps_coordinates.longitude, 4)}` : ''}
          </p>
        </>
      ) : null}
    </div>
  )
}

export const weatherMeta = { icon: CloudRain, label: 'Field Microclimate View' }
