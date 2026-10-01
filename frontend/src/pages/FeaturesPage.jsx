import { useState } from 'react'
import { BarChart3, Send, CloudSun, RefreshCw, Calculator, Layers, Info } from 'lucide-react'
import { getFeatures } from '../utils/api'
import { WeatherCard, SoilCard, LoadingState, ErrorState } from '../components'
import EmptyState from '../components/ui/EmptyState'

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
    <div className={`flex items-center justify-between gap-3 py-2 border-b border-stone-100 last:border-0 ${highlight ? 'bg-amber-50 -mx-2 px-2 rounded' : ''}`}>
      <span className="text-sm text-stone-600">{label}</span>
      <span className="font-mono text-sm font-semibold text-stone-800 whitespace-nowrap">
        {typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : (value ?? '—')}{value != null ? unit : ''}
      </span>
    </div>
  )
}

function FeatureGroup({ title, icon: Icon, children }) {
  return (
    <div className="card p-5">
      <h3 className="text-lg font-semibold text-stone-800 mb-3 flex items-center gap-2">
        {Icon && <Icon size={18} className="text-brand-600 shrink-0" />}
        {title}
      </h3>
      {children}
    </div>
  )
}

export default function FeaturesPage() {
  const [form, setForm] = useState({ location: 'Kovilpatti', crop: 'Cotton', climate_zone: 'Dryland' })
  const [loading, setLoading] = useState(false)
  const [data,    setData]    = useState(null)
  const [error,   setError]   = useState(null)

  async function loadFeatures() {
    setLoading(true); setError(null)
    try {
      const loc = LOCS.find(l => l.name === form.location) || LOCS[0]
      const res = await getFeatures({
        latitude: loc.lat, longitude: loc.lon,
        location: form.location, crop: form.crop, climate_zone: form.climate_zone,
      })
      setData(res)
    } catch (err) {
      setError(err?.message || 'Could not load feature values. Please try again.')
    } finally { setLoading(false) }
  }

  function handleSubmit(e) {
    e.preventDefault()
    loadFeatures()
  }

  function handleChange(key, value) {
    setForm(f => {
      const next = { ...f, [key]: value }
      // Picking a location pre-selects its documented agro-climatic zone (still editable)
      if (key === 'location') {
        const loc = LOCS.find(l => l.name === value)
        if (loc) next.climate_zone = loc.zone
      }
      return next
    })
  }

  const weather = data?.weather || {}
  const rolling = data?.rolling || {}
  const derived = data?.derived || {}

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-3">
          <BarChart3 className="text-brand-600" size={26} /> Live Feature Values
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Inspect the engineered weather features the risk model uses as inputs for today's warning.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 flex flex-wrap items-end gap-4">
        {[
          { label: 'Location',     key: 'location',     options: LOCS.map(l => l.name) },
          { label: 'Crop',         key: 'crop',         options: CROPS },
          { label: 'Climate Zone', key: 'climate_zone', options: ZONES },
        ].map(({ label, key, options }) => (
          <div key={key} className="flex-1 min-w-[160px]">
            <label className="label" htmlFor={`features-${key}`}>{label}</label>
            <select
              id={`features-${key}`}
              className="input-field"
              value={form[key]}
              onChange={e => handleChange(key, e.target.value)}
            >
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex items-center justify-center gap-2 text-sm px-5 py-3 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {loading
            ? <RefreshCw size={15} className="animate-spin" />
            : <Send size={15} />}
          {loading ? 'Loading…' : 'Load Features'}
        </button>
      </form>

      {loading && <LoadingState message="Fetching NASA POWER data and engineering features…" />}
      {error && !loading && <ErrorState message={error} onRetry={loadFeatures} />}

      {!data && !loading && !error && (
        <EmptyState
          icon={BarChart3}
          title="No features loaded yet"
          message="Choose a location, crop and climate zone, then select Load Features to see today's model inputs."
        />
      )}

      {data && !loading && !error && (
        <div className="animate-slide-up space-y-6">
          {/* Current weather */}
          <FeatureGroup title="Current Weather" icon={CloudSun}>
            <WeatherCard data={{
              temperature_c:  weather.t2m,
              max_temp_c:     weather.t2m_max,
              min_temp_c:     weather.t2m_min,
              humidity_pct:   weather.rh2m,
              wind_speed_ms:  weather.ws2m,
              rain_rolling_7d_mm:  rolling.rain_rolling_7d,
              rain_rolling_14d_mm: rolling.rain_rolling_14d,
              solar_rad_mj:   weather.allsky_sfc_sw_dwn,
              et0_mm:         weather.et0,
              consecutive_dry_days: derived.consecutive_dry_days,
              humidity_trend_7d:    derived.rh_trend_7d,
            }} />
            <p className="text-xs text-stone-500 mt-3 flex items-start gap-1.5">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                Date: {weather.date || '—'} · Source: NASA POWER daily reanalysis. If NASA POWER is unreachable the
                server substitutes estimated climatology, so treat values as indicative.
              </span>
            </p>
          </FeatureGroup>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Rolling features */}
            <FeatureGroup title="Rolling Weather Features" icon={RefreshCw}>
              {[
                ['3-day Avg Temp',    rolling.t2m_rolling_3d,   '°C'],
                ['7-day Avg Temp',    rolling.t2m_rolling_7d,   '°C', true],
                ['14-day Avg Temp',   rolling.t2m_rolling_14d,  '°C'],
                ['3-day Avg RH',      rolling.rh2m_rolling_3d,  '%'],
                ['7-day Avg RH',      rolling.rh2m_rolling_7d,  '%', true],
                ['14-day Avg RH',     rolling.rh2m_rolling_14d, '%'],
                ['3-day Rain Sum',    rolling.rain_rolling_3d,  ' mm'],
                ['7-day Rain Sum',    rolling.rain_rolling_7d,  ' mm', true],
                ['14-day Rain Sum',   rolling.rain_rolling_14d, ' mm'],
              ].map(([l, v, u, h]) => <FeatureRow key={l} label={l} value={v} unit={u} highlight={!!h} />)}
            </FeatureGroup>

            {/* Derived features */}
            <FeatureGroup title="Derived Features" icon={Calculator}>
              {[
                ['Temperature Range',        derived.temp_range,           '°C', true],
                ['Heat Index',               derived.heat_index,           '°C', true],
                ['Vapour Pressure Deficit',  derived.vpd,                  ' kPa'],
                ['Consecutive Dry Days',     derived.consecutive_dry_days, ' days', true],
                ['Consecutive Wet Days',     derived.consecutive_wet_days, ' days'],
                ['RH Trend 7d (slope)',      derived.rh_trend_7d,          ' %/day'],
                ['Temp Trend 7d (slope)',    derived.temp_trend_7d,        ' °C/day'],
                ['30-day Rain Sum',          derived.rain_rolling_30d,     ' mm'],
              ].map(([l, v, u, h]) => <FeatureRow key={l} label={l} value={v} unit={u} highlight={!!h} />)}
            </FeatureGroup>
          </div>

          {/* Soil */}
          <FeatureGroup title="Soil Profile (Research-based, Static)" icon={Layers}>
            <SoilCard soil={data.soil} />
            <p className="text-xs text-stone-500 mt-3">
              Zone-level reference profile, not a measurement of your field. Source: MASU Journal Vol.64(8) 2023 · ResearchGate TN Soil Quality 2023.
            </p>
          </FeatureGroup>
        </div>
      )}
    </div>
  )
}
