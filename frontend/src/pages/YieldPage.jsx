import { useState } from 'react'
import { TrendingUp, Sprout, BarChart2, Check } from 'lucide-react'
import axios from 'axios'
import { ErrorState } from '../components'

export default function YieldPage() {
  const [crop, setCrop] = useState('Rice')
  const [temperature, setTemperature] = useState(28.5)
  const [humidity, setHumidity] = useState(75.0)
  const [rainfall, setRainfall] = useState(850.0)
  const [soilN, setSoilN] = useState(180.0)
  const [soilPh, setSoilPh] = useState(6.5)
  const [irrigation, setIrrigation] = useState('Drip')

  const [yieldResult, setYieldResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePredict = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post('/api/v1/yield/predict', {
        crop,
        temperature_c: parseFloat(temperature),
        humidity_pct: parseFloat(humidity),
        rainfall_mm: parseFloat(rainfall),
        soil_n: parseFloat(soilN),
        soil_ph: parseFloat(soilPh),
        irrigation_type: irrigation
      })
      setYieldResult(res.data)
    } catch (err) {
      setYieldResult(null)
      setError(err?.response?.data?.detail || err?.message || 'Could not reach the yield forecasting service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-900 to-teal-800 rounded-3xl p-8 text-white shadow-xl">
        <span className="px-3 py-1 bg-brand-500/30 text-brand-200 text-xs font-semibold rounded-full border border-brand-400/30">
          AI Yield Regression Engine
        </span>
        <h1 className="text-3xl font-bold tracking-tight mt-2">Crop Yield Predictor</h1>
        <p className="mt-2 text-brand-100 text-sm max-w-2xl">
          Forecast expected crop yield (tons/hectare & kg/acre) based on weather microclimate, soil NPK profiles, and irrigation management.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls */}
        <div className="card p-6 space-y-5 lg:col-span-1">
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Sprout className="text-brand-600" size={20} /> Field Parameters
          </h2>

          <div>
            <label className="label">Crop Variety</label>
            <select value={crop} onChange={(e) => setCrop(e.target.value)} className="input-field">
              <option value="Rice">Rice (Paddy)</option>
              <option value="Cotton">Cotton</option>
              <option value="Sugarcane">Sugarcane</option>
              <option value="Maize">Maize</option>
              <option value="Tomato">Tomato</option>
              <option value="Groundnut">Groundnut</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
              <span>Avg Temperature (°C)</span>
              <span>{temperature}°C</span>
            </div>
            <input type="range" min="15" max="42" step="0.5" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="w-full accent-brand-600" />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
              <span>Annual Rainfall (mm)</span>
              <span>{rainfall} mm</span>
            </div>
            <input type="range" min="200" max="2000" step="25" value={rainfall} onChange={(e) => setRainfall(e.target.value)} className="w-full accent-brand-600" />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
              <span>Soil Nitrogen N (kg/ha)</span>
              <span>{soilN} kg/ha</span>
            </div>
            <input type="range" min="50" max="300" step="5" value={soilN} onChange={(e) => setSoilN(e.target.value)} className="w-full accent-brand-600" />
          </div>

          <div>
            <label className="label">Irrigation System</label>
            <select value={irrigation} onChange={(e) => setIrrigation(e.target.value)} className="input-field">
              <option value="Drip">Drip Irrigation (Optimal)</option>
              <option value="Sprinkler">Sprinkler Irrigation</option>
              <option value="Flood">Traditional Flood</option>
            </select>
          </div>

          <button onClick={handlePredict} disabled={loading} className="w-full btn-primary py-3.5 flex items-center justify-center gap-2">
            {loading ? "Calculating..." : <><TrendingUp size={18} /> Forecast Crop Yield</>}
          </button>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-6">
          {error ? (
            <div className="card p-6">
              <ErrorState message={error} onRetry={handlePredict} />
            </div>
          ) : yieldResult ? (
            <div className="space-y-6">
              {/* Output Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card p-6 bg-gradient-to-br from-brand-50 to-teal-50 border-brand-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-700">EXPECTED YIELD (HA)</span>
                  <p className="text-4xl font-extrabold text-brand-900 mt-2">{yieldResult.expected_yield_tons_ha} <span className="text-lg font-normal">tons/ha</span></p>
                  <p className="text-xs text-brand-700 mt-1">Baseline: {yieldResult.base_yield_tons_ha} tons/ha</p>
                </div>

                <div className="card p-6 bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-700">EXPECTED YIELD (ACRE)</span>
                  <p className="text-4xl font-extrabold text-teal-950 mt-2">{yieldResult.expected_yield_kg_acre} <span className="text-lg font-normal">kg/acre</span></p>
                  <p className="text-xs text-teal-700 mt-1">Multiplier: {yieldResult.total_multiplier}x</p>
                </div>
              </div>

              {/* Factors */}
              <div className="card p-6 space-y-4">
                <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                  <BarChart2 size={16} className="text-brand-600" /> Yield Factor Attribution
                </h3>

                <div className="space-y-3">
                  {yieldResult.factor_contributions.map((fc, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-medium border-b border-stone-100 pb-2">
                      <span className="text-stone-700">{fc.factor}</span>
                      <span className={`font-bold ${fc.impact_pct >= 0 ? 'text-brand-600' : 'text-red-600'}`}>
                        {fc.impact_pct >= 0 ? `+${fc.impact_pct}%` : `${fc.impact_pct}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Advisory */}
              <div className="p-4 rounded-xl bg-brand-50 border border-brand-200 text-xs text-brand-900 flex items-start gap-3">
                <Check className="text-brand-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <span className="font-bold">Agronomical Optimization: </span>
                  {yieldResult.advice}
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center text-stone-400 space-y-3 border-dashed">
              <TrendingUp size={48} className="mx-auto text-stone-300 animate-pulse" />
              <p className="text-stone-600 font-medium">Adjust field parameters and click "Forecast Crop Yield"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
