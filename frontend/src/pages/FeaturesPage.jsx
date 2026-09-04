import { useState } from 'react'
import { BarChart3, Send } from 'lucide-react'
import { getFeatures } from '../utils/api'
import { WeatherCard, SoilCard, LoadingState, ErrorState } from '../components'

const CROPS = ['Cotton', 'Sorghum', 'Millets', 'Rice', 'Sugarcane', 'Pulses']
const ZONES = ['Dryland', 'Irrigated', 'Delta', 'Semi-arid', 'Humid']
const LOCS  = [
  { name: 'Kovilpatti',  lat: 9.1728,  lon: 77.8710, zone: 'Dryland' },
  { name: 'Thanjavur',   lat: 10.7870, lon: 79.1378, zone: 'Delta' },
  { name: 'Trichy',      lat: 10.7905, lon: 78.7047, zone: 'Irrigated' },
  { name: 'Coimbatore',  lat: 11.0168, lon: 76.9558, zone: 'Humid' },
  { name: 'Vellore',     lat: 12.9165, lon: 79.1325, zone: 'Semi-arid' },
]

function FeatureRow({ label, value, unit = '', highlight = false }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-stone-100 last:border-0 ${highlight ? 'bg-amber-50 -mx-2 px-2 rounded' : ''}`}>
      <span className="text-sm text-stone-600">{label}</span>
      <span className="font-mono text-sm font-semibold text-stone-800">
        {typeof value === 'number' ? value.toFixed(2) : (value ?? '—')}{unit}
      </span>
    </div>
  )
}

function FeatureGroup({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="font-display text-base font-bold text-stone-900 mb-3">{title}</h3>
      {children}
    </div>
  )
}

export default function FeaturesPage() {
  const [form, setForm] = useState({ location: 'Kovilpatti', crop: 'Cotton', climate_zone: 'Dryland' })
  const [loading, setLoading] = useState(false)
  const [data,    setData]    = useState(null)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const loc = LOCS.find(l => l.name === form.location) || LOCS[0]
      const res = await getFeatures({
        latitude: loc.lat, longitude: loc.lon,
        location: form.location, crop: form.crop, climate_zone: form.climate_zone,
      })
      setData(res)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-stone-900 flex items-center gap-3">
          <BarChart3 className="text-stone-600" size={28} /> Live Feature Values
        </h1>
        <p className="text-stone-600 mt-1">
          Inspect all engineered features used as model inputs for today's warning.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 flex flex-wrap items-end gap-4">
        {[
          { label: 'Location', key: 'location', options: LOCS.map(l => l.name) },
          { label: 'Crop',         key: 'crop',         options: CROPS },
          { label: 'Climate Zone', key: 'climate_zone', options: ZONES },
        ].map(({ label, key, options }) => (
          <div key={key} className="flex-1 min-w-[160px]">
            <label className="label">{label}</label>
            <select className="input-field" value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
              {options.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <button type="submit" disabled={loading}
          className="btn-primary flex items-center gap-2 text-sm px-5 py-3">
          {loading
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Send size={15} />}
          Load Features
        </button>
      </form>

      {loading && <LoadingState message="Fetching NASA POWER data and engineering features…" />}
      {error   && <ErrorState message={error} onRetry={() => setError(null)} />}

      {data && !loading && (
        <div className="animate-slide-up space-y-6">
          {/* Current weather */}
          <FeatureGroup title="📡 Current Weather (NASA POWER)">
            <WeatherCard data={{
              temperature_c:  data.weather.t2m,
              max_temp_c:     data.weather.t2m_max,
              min_temp_c:     data.weather.t2m_min,
              humidity_pct:   data.weather.rh2m,
              wind_speed_ms:  data.weather.ws2m,
              rain_rolling_7d_mm: data.rolling.rain_rolling_7d,
              solar_rad_mj:   data.weather.allsky_sfc_sw_dwn,
              et0_mm:         data.weather.et0,
              consecutive_dry_days: data.derived.consecutive_dry_days,
              humidity_trend_7d:    data.derived.rh_trend_7d,
            }} />
            <p className="text-xs text-stone-400 mt-2">Date: {data.weather.date} · Source: NASA POWER</p>
          </FeatureGroup>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Rolling features */}
            <FeatureGroup title="🔄 Rolling Weather Features">
              {[
                ['3-day Avg Temp',    data.rolling.t2m_rolling_3d,   '°C'],
                ['7-day Avg Temp',    data.rolling.t2m_rolling_7d,   '°C', true],
                ['14-day Avg Temp',   data.rolling.t2m_rolling_14d,  '°C'],
                ['3-day Avg RH',      data.rolling.rh2m_rolling_3d,  '%'],
                ['7-day Avg RH',      data.rolling.rh2m_rolling_7d,  '%', true],
                ['14-day Avg RH',     data.rolling.rh2m_rolling_14d, '%'],
                ['3-day Rain Sum',    data.rolling.rain_rolling_3d,  ' mm'],
                ['7-day Rain Sum',    data.rolling.rain_rolling_7d,  ' mm', true],
                ['14-day Rain Sum',   data.rolling.rain_rolling_14d, ' mm'],
              ].map(([l, v, u, h]) => <FeatureRow key={l} label={l} value={v} unit={u} highlight={!!h} />)}
            </FeatureGroup>

            {/* Derived features */}
            <FeatureGroup title="🧮 Derived Features">
              {[
                ['Temperature Range',        data.derived.temp_range,           '°C', true],
                ['Heat Index',               data.derived.heat_index,           '°C', true],
                ['Vapour Pressure Deficit',  data.derived.vpd,                  ' kPa'],
                ['Consecutive Dry Days',     data.derived.consecutive_dry_days, ' days', true],
                ['Consecutive Wet Days',     data.derived.consecutive_wet_days, ' days'],
                ['RH Trend 7d (slope)',      data.derived.rh_trend_7d,          '%/day'],
                ['Temp Trend 7d (slope)',    data.derived.temp_trend_7d,        '°C/day'],
                ['30-day Rain Sum',          data.derived.rain_rolling_30d,     ' mm'],
              ].map(([l, v, u, h]) => <FeatureRow key={l} label={l} value={v} unit={u} highlight={!!h} />)}
            </FeatureGroup>
          </div>

          {/* Soil */}
          <FeatureGroup title="🌱 Soil Profile (Research-based, Static)">
            <SoilCard soil={data.soil} />
            <p className="text-xs text-stone-400 mt-3">
              Source: MASU Journal Vol.64(8) 2023 · ResearchGate TN Soil Quality 2023
            </p>
          </FeatureGroup>
        </div>
      )}
    </div>
  )
}
