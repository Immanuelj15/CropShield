import { useState } from 'react'
import { TrendingUp, Sprout, BarChart2, Check } from 'lucide-react'
import api from '../utils/api'
import { ErrorState, LoadingState } from '../components'

export default function YieldPage() {
  const [crop, setCrop] = useState('Rice')
  const [temperature, setTemperature] = useState(28.5)
  const [humidity, setHumidity] = useState(75.0)
  const [rainfall, setRainfall] = useState(850.0)
  const [soilN, setSoilN] = useState(180.0)
  const [soilPh, setSoilPh] = useState(6.5)
  const [irrigation, setIrrigation] = useState('Drip')
  const [soilP, setSoilP] = useState(45.0)
  const [soilK, setSoilK] = useState(150.0)
  const [organicCarbon, setOrganicCarbon] = useState(0.65)

  const [yieldResult, setYieldResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePredict = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/yield/predict', {
        crop,
        temperature_c: parseFloat(temperature),
        humidity_pct: parseFloat(humidity),
        rainfall_mm: parseFloat(rainfall),
        soil_n: parseFloat(soilN),
        soil_p: parseFloat(soilP),
        soil_k: parseFloat(soilK),
        soil_ph: parseFloat(soilPh),
        organic_carbon: parseFloat(organicCarbon),
        irrigation_type: irrigation
      })
      setYieldResult(res.data)
    } catch (err) {
      setYieldResult(null)
      setError(err?.message || 'Could not reach the yield forecasting service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-stone-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <span className="px-3 py-1 bg-brand-500/30 text-brand-200 text-xs font-semibold rounded-full border border-brand-400/30">
          Formula-based Yield Estimate · TN state averages
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">Crop Yield Predictor</h1>
        <p className="mt-2 text-brand-100 text-sm max-w-2xl">
          Forecast expected crop yield (tons/hectare & kg/acre) based on weather microclimate, soil NPK profiles, and irrigation management.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="card p-6 space-y-5 lg:col-span-1">
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Sprout className="text-brand-600" size={20} /> Field Parameters
          </h2>

          <div>
            <label htmlFor="yield-crop" className="label">Crop</label>
            <select id="yield-crop" value={crop} onChange={(e) => setCrop(e.target.value)} className="input-field">
              <option value="Rice">Rice (Paddy)</option>
              <option value="Cotton">Cotton</option>
              <option value="Sugarcane">Sugarcane</option>
              <option value="Maize">Maize</option>
              <option value="Tomato">Tomato</option>
              <option value="Groundnut">Groundnut</option>
              <option value="Sorghum">Sorghum</option>
              <option value="Millets">Millets</option>
              <option value="Pulses">Pulses</option>
              <option value="Cassava">Cassava (Tapioca)</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
              <span>Avg Temperature (°C)</span>
              <span>{temperature}°C</span>
            </div>
            <input type="range" aria-label="Average temperature in degrees Celsius" min="15" max="42" step="0.5" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="w-full accent-brand-600" />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
              <span>Annual Rainfall (mm)</span>
              <span>{rainfall} mm</span>
            </div>
            <input type="range" aria-label="Annual rainfall in millimetres" min="200" max="2000" step="25" value={rainfall} onChange={(e) => setRainfall(e.target.value)} className="w-full accent-brand-600" />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
              <span>Soil Nitrogen N (kg/ha)</span>
              <span>{soilN} kg/ha</span>
            </div>
            <input type="range" aria-label="Soil nitrogen in kilograms per hectare" min="50" max="500" step="5" value={soilN} onChange={(e) => setSoilN(e.target.value)} className="w-full accent-brand-600" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
                <span>Phosphorus P (kg/ha)</span>
                <span>{soilP}</span>
              </div>
              <input type="range" aria-label="Soil phosphorus in kilograms per hectare" min="5" max="80" step="1" value={soilP} onChange={(e) => setSoilP(e.target.value)} className="w-full accent-brand-600" />
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
                <span>Potassium K (kg/ha)</span>
                <span>{soilK}</span>
              </div>
              <input type="range" aria-label="Soil potassium in kilograms per hectare" min="50" max="400" step="5" value={soilK} onChange={(e) => setSoilK(e.target.value)} className="w-full accent-brand-600" />
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
                <span>Soil pH</span>
                <span>{soilPh}</span>
              </div>
              <input type="range" aria-label="Soil pH" min="4.5" max="9" step="0.1" value={soilPh} onChange={(e) => setSoilPh(e.target.value)} className="w-full accent-brand-600" />
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
                <span>Organic Carbon (%)</span>
                <span>{organicCarbon}</span>
              </div>
              <input type="range" aria-label="Soil organic carbon percent" min="0.1" max="2" step="0.05" value={organicCarbon} onChange={(e) => setOrganicCarbon(e.target.value)} className="w-full accent-brand-600" />
            </div>
          </div>

          <div>
            <label htmlFor="yield-irrigation" className="label">Irrigation System</label>
            <select id="yield-irrigation" value={irrigation} onChange={(e) => setIrrigation(e.target.value)} className="input-field">
              <option value="Drip">Drip Irrigation</option>
              <option value="Sprinkler">Sprinkler Irrigation</option>
              <option value="Surface">Surface / Flood (Traditional)</option>
            </select>
          </div>

          <button type="button" onClick={handlePredict} disabled={loading} aria-busy={loading} className="w-full btn-primary py-3.5 flex items-center justify-center gap-2">
            {loading ? "Calculating..." : <><TrendingUp size={18} /> Forecast Crop Yield</>}
          </button>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-6">
          {loading && !yieldResult ? (
            <div className="card p-6">
              <LoadingState message="Calculating yield estimate…" />
            </div>
          ) : error ? (
            <div className="card p-6">
              <ErrorState message={error} onRetry={handlePredict} />
            </div>
          ) : yieldResult ? (
            <div className="space-y-6">
              {/* Output Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card p-6 bg-brand-50 border-brand-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-700">EXPECTED YIELD (HA)</span>
                  <p className="text-3xl sm:text-4xl font-extrabold text-brand-900 mt-2">{Number(yieldResult.expected_yield_tons_ha).toLocaleString('en-IN')} <span className="text-lg font-normal">tons/ha</span></p>
                  <p className="text-xs text-brand-700 mt-1">Baseline: {yieldResult.base_yield_tons_ha} tons/ha</p>
                </div>

                <div className="card p-6 bg-stone-50">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-600">EXPECTED YIELD (ACRE)</span>
                  <p className="text-3xl sm:text-4xl font-extrabold text-stone-900 mt-2">{Number(yieldResult.expected_yield_kg_acre).toLocaleString('en-IN')} <span className="text-lg font-normal">kg/acre</span></p>
                  <p className="text-xs text-stone-600 mt-1">Multiplier: {yieldResult.total_multiplier}x</p>
                </div>
              </div>

              {/* Model confidence: the formula model has no validated confidence (may be null) */}
              <div className="card p-4 text-xs flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-stone-700 uppercase tracking-wider">Model Confidence</span>
                <span className="font-bold text-stone-900">
                  {typeof yieldResult.confidence_score === 'number'
                    ? `${Math.round(yieldResult.confidence_score * 100)}%`
                    : 'Not available'}
                </span>
                {(yieldResult.is_heuristic || yieldResult.source) && (
                  <p className="w-full text-[11px] text-stone-500">
                    {yieldResult.is_heuristic ? 'Formula-based estimate, not a validated ML prediction.' : ''}
                    {yieldResult.source ? ` Source: ${yieldResult.source}` : ''}
                  </p>
                )}
              </div>

              {/* Factors */}
              <div className="card p-6 space-y-4">
                <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                  <BarChart2 size={16} className="text-brand-600" /> Yield Factor Attribution
                </h3>

                <div className="space-y-3">
                  {(yieldResult.factor_contributions || []).map((fc, i) => (
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
                  <span className="font-bold">How this was calculated: </span>
                  {yieldResult.advice}
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center text-stone-500 space-y-3 border-dashed">
              <TrendingUp size={48} className="mx-auto text-stone-400" aria-hidden="true" />
              <p className="text-stone-600 font-medium">Adjust field parameters and click "Forecast Crop Yield"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
