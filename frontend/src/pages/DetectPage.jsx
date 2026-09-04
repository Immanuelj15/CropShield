import { useState } from 'react'
import { Bug, Send, CheckCircle, XCircle } from 'lucide-react'
import { detectPests } from '../utils/api'
import { PestAlertCard, LoadingState, ErrorState } from '../components'
import clsx from 'clsx'

const CROPS = ['Cotton', 'Sorghum', 'Millets', 'Rice', 'Sugarcane', 'Pulses']
const LOCS  = [
  { name: 'Kovilpatti',  lat: 9.1728,  lon: 77.8710 },
  { name: 'Tirunelveli', lat: 8.7139,  lon: 77.7567 },
  { name: 'Thanjavur',   lat: 10.7870, lon: 79.1378 },
  { name: 'Trichy',      lat: 10.7905, lon: 78.7047 },
  { name: 'Coimbatore',  lat: 11.0168, lon: 76.9558 },
  { name: 'Vellore',     lat: 12.9165, lon: 79.1325 },
  { name: 'Madurai',     lat: 9.9252,  lon: 78.1198 },
]

function StatusBanner({ status, message }) {
  const cfg = {
    Confirmed: { bg: 'bg-red-50 border-red-300',   Icon: XCircle,     ic: 'text-red-500',   tx: 'text-red-900' },
    Suspected: { bg: 'bg-amber-50 border-amber-300',Icon: Bug,         ic: 'text-amber-500', tx: 'text-amber-900' },
    None:      { bg: 'bg-green-50 border-green-300',Icon: CheckCircle, ic: 'text-green-500', tx: 'text-green-900' },
  }[status] || {}
  if (!cfg.Icon) return null
  return (
    <div className={clsx('rounded-xl border p-4 flex items-start gap-3', cfg.bg)}>
      <cfg.Icon size={20} className={clsx('shrink-0 mt-0.5', cfg.ic)} />
      <p className={clsx('font-semibold', cfg.tx)}>{message}</p>
    </div>
  )
}

export default function DetectPage() {
  const [form, setForm] = useState({ location: 'Kovilpatti', crop: 'Cotton' })
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null); setResult(null)
    try {
      const loc = LOCS.find(l => l.name === form.location) || LOCS[0]
      const res = await detectPests({ latitude: loc.lat, longitude: loc.lon,
        location: form.location, crop: form.crop })
      setResult(res)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-stone-900 flex items-center gap-3">
          <Bug className="text-amber-600" size={28} /> Pest Detection — Today
        </h1>
        <p className="text-stone-600 mt-1">
          Rule-based detection against today's live weather conditions.
          Evaluates 17 pests across 6 crops.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-1">
          <form onSubmit={handleSubmit} className="card p-5 space-y-4 sticky top-24">
            <h2 className="font-display text-base font-bold text-stone-900">Detection Inputs</h2>

            <div>
              <label className="label">Location</label>
              <select className="input-field" value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
                {LOCS.map(l => <option key={l.name}>{l.name}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Crop</label>
              <select className="input-field" value={form.crop}
                onChange={e => setForm(f => ({ ...f, crop: e.target.value }))}>
                {CROPS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              Each pest has documented favorable temperature, humidity, and rainfall thresholds.
              Current NASA POWER weather is matched against these thresholds with confidence scoring.
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Detecting…</>
                : <><Send size={15} /> Run Detection</>}
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-5">
          {loading && <LoadingState message="Fetching today's weather and running detection rules…" />}
          {error   && <ErrorState message={error} onRetry={() => setError(null)} />}

          {!loading && !error && !result && (
            <div className="card p-14 text-center">
              <Bug size={44} className="text-stone-200 mx-auto mb-4" />
              <p className="text-stone-500 font-semibold">Select crop and location to detect today's pests</p>
            </div>
          )}

          {result && !loading && (
            <div className="animate-slide-up space-y-5">
              <StatusBanner status={result.overall_status} message={result.alert_message} />

              <div className="card p-5">
                <p className="text-sm font-semibold text-stone-700 mb-3">Weather Context</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['Temp', `${result.weather_context?.temperature_c}°C`],
                    ['Humidity', `${result.weather_context?.humidity_pct}%`],
                    ['7-day Rain', `${result.weather_context?.rainfall_7d_mm} mm`],
                    ['Dry Days', `${result.weather_context?.consecutive_dry_days}`],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-stone-100 rounded-lg px-3 py-1.5">
                      <p className="text-xs text-stone-500">{l}</p>
                      <p className="text-sm font-semibold text-stone-800">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {result.detected_pests?.length > 0 ? (
                <div>
                  <h3 className="font-display text-lg font-bold text-stone-900 mb-3">
                    Detected Pests ({result.detected_pests.length})
                  </h3>
                  <div className="space-y-4">
                    {result.detected_pests.map((p, i) => <PestAlertCard key={i} pest={p} />)}
                  </div>
                </div>
              ) : (
                <div className="card p-10 text-center">
                  <CheckCircle size={38} className="text-green-500 mx-auto mb-3" />
                  <p className="font-semibold text-stone-800">No significant pest activity today</p>
                  <p className="text-stone-500 text-sm mt-1">Current conditions are not meeting pest outbreak thresholds.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
