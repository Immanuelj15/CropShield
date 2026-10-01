import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Sprout, Coins, Droplets, MapPin, Calendar, Sparkles,
  RefreshCw, AlertCircle, Info, Layers, FileSpreadsheet, Scale, ShieldCheck
} from 'lucide-react'
import CropRecommendationCard from '../components/CropRecommendationCard'
import { formatINR } from '../components/ProfitRangeDisplay'
import DemoDataBadge from '../components/ui/DemoDataBadge'

import { apiFetch, isNetworkError } from '../utils/http'
import { farmIdOf, fetchMyFarms } from '../utils/farms'

const BUDGET_PRESETS = [
  { label: '₹25,000', value: 25000 },
  { label: '₹50,000', value: 50000 },
  { label: '₹1,00,000', value: 100000 },
  { label: '₹1,50,000', value: 150000 },
  { label: '₹2,50,000', value: 250000 },
]

const SOIL_OPTIONS = [
  { value: 'Black Cotton Soil', label: 'Black Cotton Soil (Vertisol)' },
  { value: 'Red Sandy Loam', label: 'Red Sandy Loam' },
  { value: 'Red Loam', label: 'Red Loam' },
  { value: 'Alluvial Clay', label: 'Alluvial Clay' },
  { value: 'Coastal Alluvial', label: 'Coastal Alluvial' },
  { value: 'Black Clay Loam', label: 'Black Clay Loam' },
  { value: 'Lateritic Hill Soil', label: 'Lateritic Hill Soil' },
]

const WATER_TIERS = ['Low', 'Medium', 'High']
const SEASONS = ['Kharif', 'Rabi', 'Summer']
const MIN_BUDGET = 1000 // backend: budget >= 1000

const FIELD_LABEL = 'text-xs font-semibold text-stone-700 mb-1.5 flex items-center gap-1.5'
const FIELD_INPUT = 'w-full p-2.5 rounded-xl border border-stone-200 bg-white text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-500'
const TOGGLE_BASE = 'py-2 px-2 rounded-xl font-semibold text-xs transition border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const TOGGLE_ON = 'bg-brand-600 text-white border-brand-600 shadow-sm'
const TOGGLE_OFF = 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'

function currentSeasonName() {
  const month = new Date().getMonth() + 1
  if (month >= 6 && month <= 10) return 'Kharif'
  if (month === 11 || month === 12 || month <= 2) return 'Rabi'
  return 'Summer'
}

// Values handed over from the Soil Health Analyzer ("See Crop Recommendations")
function readSoilHandoff(state) {
  if (!state || typeof state !== 'object') return {}
  const out = {}
  if (typeof state.district === 'string' && state.district.trim()) out.district = state.district.trim()
  if (typeof state.soil_type === 'string' && state.soil_type.trim()) out.soil_type = state.soil_type.trim()
  const area = Number(state.land_area_acres)
  if (Number.isFinite(area) && area > 0) out.land_area_acres = Math.round(area * 100) / 100
  if (WATER_TIERS.includes(state.water_availability)) out.water_availability = state.water_availability
  if (state.farm_id) out.farm_id = String(state.farm_id)
  return out
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-label="Loading recommendations">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4">
          <div className="h-6 w-1/2 bg-stone-100 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-stone-100 rounded animate-pulse" />
          <div className="h-24 bg-stone-100 rounded-2xl animate-pulse" />
          <div className="h-16 bg-stone-100 rounded-2xl animate-pulse" />
        </div>
      ))}
    </div>
  )
}

export default function CropRecommendationPage() {
  const location = useLocation()
  const handoffRef = useRef(readSoilHandoff(location.state))

  // Farm Auto-Fill Profile State
  const [farm, setFarm] = useState(null)
  const [district, setDistrict] = useState(handoffRef.current.district || 'Thoothukudi')
  const [soilType, setSoilType] = useState(handoffRef.current.soil_type || 'Black Cotton Soil')
  const [landAreaAcres, setLandAreaAcres] = useState(handoffRef.current.land_area_acres || 2.5)

  // User Interactive Inputs
  const [budget, setBudget] = useState(60000)
  const [waterAvailability, setWaterAvailability] = useState(handoffRef.current.water_availability || 'Medium')
  const [season, setSeason] = useState(currentSeasonName)

  // Execution State
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [demoScenarios, setDemoScenarios] = useState([])
  const [activeScenarioId, setActiveScenarioId] = useState(null)

  // P2-8: only the latest /generate response may update the screen
  const requestIdRef = useRef(0)
  const lastPayloadRef = useRef(null)

  // Fetch initial farm profile and demo scenarios, then run exactly ONE /generate on mount
  useEffect(() => {
    const seasonNow = currentSeasonName()
    const handoff = handoffRef.current
    fetchDemoScenarios()
    fetchFarmProfile(handoff, seasonNow).then((ranWithProfile) => {
      if (!ranWithProfile) {
        executeRecommendation({
          season: seasonNow,
          ...(handoff.district ? { district: handoff.district } : {}),
          ...(handoff.soil_type ? { soil_type: handoff.soil_type } : {}),
          ...(handoff.land_area_acres ? { land_area_acres: handoff.land_area_acres } : {}),
          ...(handoff.water_availability ? { water_availability: handoff.water_availability } : {}),
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Returns true when it already triggered a recommendation with the farm's context
  const fetchFarmProfile = async (handoff, seasonNow) => {
    try {
      const data = await apiFetch('/farmer/profile')
      let targetFarm = data?.farm || null

      // The Soil Health Analyzer may hand over a different farm than the primary one
      if (handoff.farm_id && farmIdOf(targetFarm) !== handoff.farm_id) {
        try {
          const farms = await fetchMyFarms()
          targetFarm = farms.find((f) => farmIdOf(f) === handoff.farm_id) || targetFarm
        } catch {
          // keep the primary farm
        }
      }

      if (targetFarm) {
        setFarm(targetFarm)
        const farmDist = handoff.district || targetFarm.district || 'Thoothukudi'
        const farmSoil = handoff.soil_type || targetFarm.soil_type || 'Black Cotton Soil'
        const farmWater = handoff.water_availability
          || (WATER_TIERS.includes(targetFarm.water_availability) ? targetFarm.water_availability : 'Medium')
        let farmAcres = handoff.land_area_acres || 2.5
        if (!handoff.land_area_acres && targetFarm.area_hectares) {
          farmAcres = Math.round(targetFarm.area_hectares * 2.471 * 10) / 10
        }

        setDistrict(farmDist)
        setSoilType(farmSoil)
        setLandAreaAcres(farmAcres)
        setWaterAvailability(farmWater)

        // Scale budget proportionally so larger farms don't trigger empty results
        const scaledBudget = Math.max(60000, Math.round(farmAcres * 25000))
        setBudget(scaledBudget)

        executeRecommendation({
          farm_id: farmIdOf(targetFarm) || null,
          season: seasonNow,
          district: farmDist,
          soil_type: farmSoil,
          water_availability: farmWater,
          land_area_acres: farmAcres,
          budget: scaledBudget,
        })
        return true
      }
    } catch (e) {
      console.debug('Farm profile auto-fill fallback:', e)
    }
    return false
  }

  const fetchDemoScenarios = async () => {
    try {
      const data = await apiFetch('/crop-recommendation/demo-scenarios?limit=8')
      setDemoScenarios(Array.isArray(data) ? data.filter((s) => s && s.scenario_id) : [])
    } catch (e) {
      console.debug('Demo scenarios error:', e)
    }
  }

  const handleApplyScenario = (scenario) => {
    setActiveScenarioId(scenario.scenario_id)
    if (scenario.district) setDistrict(scenario.district)
    if (scenario.soil_type) setSoilType(scenario.soil_type)
    if (scenario.water_availability) setWaterAvailability(scenario.water_availability)
    if (scenario.season) setSeason(scenario.season)
    if (scenario.budget) setBudget(scenario.budget)
    if (scenario.land_area_acres) setLandAreaAcres(scenario.land_area_acres)

    // A sample scenario is a hypothetical plot — don't attribute it to the user's farm
    executeRecommendation({
      farm_id: null,
      district: scenario.district,
      soil_type: scenario.soil_type,
      water_availability: scenario.water_availability,
      season: scenario.season,
      budget: scenario.budget,
      land_area_acres: scenario.land_area_acres,
    })
  }

  const handleSubmit = (e) => {
    e?.preventDefault()
    setActiveScenarioId(null)
    executeRecommendation()
  }

  const executeRecommendation = async (overrides = {}) => {
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestId === requestIdRef.current
    setLoading(true)
    setError(null)

    const rawBudget = overrides.budget !== undefined ? Number(overrides.budget) : Number(budget)
    const rawArea = overrides.land_area_acres !== undefined ? Number(overrides.land_area_acres) : Number(landAreaAcres)

    const payload = {
      farm_id: overrides.farm_id !== undefined ? overrides.farm_id : (farmIdOf(farm) || null),
      budget: !Number.isFinite(rawBudget) || rawBudget < MIN_BUDGET ? 60000 : rawBudget,
      water_availability: overrides.water_availability || waterAvailability || 'Medium',
      season: overrides.season || season || 'Kharif',
      district: overrides.district || district || 'Thoothukudi',
      soil_type: overrides.soil_type || soilType || 'Black Cotton Soil',
      land_area_acres: !Number.isFinite(rawArea) || rawArea <= 0 ? 2.5 : rawArea,
    }
    lastPayloadRef.current = payload

    try {
      const data = await apiFetch('/crop-recommendation/generate', { method: 'POST', json: payload })
      if (!isCurrent()) return
      setResults(data)
    } catch (err) {
      if (!isCurrent()) return
      if (isNetworkError(err)) {
        setError('Could not reach the AgriGuard server. Check your connection and try again.')
      } else if (err.status === 500) {
        setError('The recommendation engine could not complete this request. If your budget is low for this plot size, try a higher budget or a smaller area.')
      } else {
        setError(err.message || 'Failed to generate crop recommendations.')
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  const retryLast = () => {
    if (lastPayloadRef.current) executeRecommendation(lastPayloadRef.current)
    else executeRecommendation()
  }

  const profile = results?.input_profile || {}
  const effectiveSoil = profile.effective_soil_data
  const recs = Array.isArray(results?.recommendations) ? results.recommendations : []
  const allOverBudget = recs.length > 0 && recs.every((r) => r.exceeds_budget)
  const soilInList = SOIL_OPTIONS.some((o) => o.value === soilType)

  return (
    <div className="space-y-6 animate-fade-in pb-24 lg:pb-12 max-w-6xl mx-auto">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-brand-800 to-brand-600 rounded-3xl p-6 sm:p-8 text-white shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 text-brand-50 text-xs font-semibold rounded-full border border-white/20">
            <Sprout size={14} /> Pre-Season Agricultural Decision Support
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            AI Crop Recommendation &amp; <span className="text-brand-100">Profit Range Engine</span>
          </h1>
          <p className="text-brand-50 text-sm leading-relaxed">
            Which crop is worth planting before you sow? Compares soil type, irrigation capacity, season,
            cultivation costs and mandi price bands across Tamil Nadu crops.
          </p>
        </div>
      </div>

      {/* Sample scenarios from the bundled demo dataset */}
      {demoScenarios.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
              <FileSpreadsheet size={15} className="text-brand-600" />
              Try a sample scenario
            </span>
            <DemoDataBadge title="Sample plots from the bundled demo scenario dataset — not your farm." />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {demoScenarios.map((sc) => (
              <button
                type="button"
                key={sc.scenario_id}
                onClick={() => handleApplyScenario(sc)}
                aria-pressed={activeScenarioId === sc.scenario_id}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 border text-left shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeScenarioId === sc.scenario_id ? TOGGLE_ON : TOGGLE_OFF
                }`}
              >
                <span className="font-bold">{sc.district || '—'}</span>
                <span className="opacity-80">· {sc.recommended_crop || '—'}{sc.soil_type ? ` (${String(sc.soil_type).split(' ')[0]})` : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Formulation Card */}
      <div className="card p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Farm Profile &amp; Pre-Season Criteria</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {farm
                ? 'Auto-filled from your registered farm. Adjust budget and water tier for the upcoming season.'
                : 'No registered farm found — enter your plot details to simulate a recommendation.'}
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-brand-50 text-brand-800 rounded-full border border-brand-200 self-start sm:self-auto max-w-full truncate">
            {farm ? `Farm: ${farm.farm_name || 'My farm'}` : 'Custom plot simulation'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Location / District */}
            <div>
              <label htmlFor="crop-district" className={FIELD_LABEL}>
                <MapPin size={14} className="text-brand-600" /> District
              </label>
              <input
                id="crop-district"
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                required
                maxLength={100}
                className={FIELD_INPUT}
                placeholder="e.g. Thoothukudi, Madurai, Coimbatore"
              />
            </div>

            {/* Soil Type */}
            <div>
              <label htmlFor="crop-soil" className={FIELD_LABEL}>
                <Layers size={14} className="text-brand-600" /> Soil classification
              </label>
              <select
                id="crop-soil"
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className={FIELD_INPUT}
              >
                {!soilInList && soilType && <option value={soilType}>{soilType}</option>}
                {SOIL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Land Area */}
            <div>
              <label htmlFor="crop-area" className={FIELD_LABEL}>
                <Scale size={14} className="text-brand-600" /> Plot area (acres)
              </label>
              <input
                id="crop-area"
                type="number"
                step="0.1"
                min="0.1"
                max="100000"
                value={landAreaAcres}
                onChange={(e) => setLandAreaAcres(e.target.value)}
                required
                className={`${FIELD_INPUT} font-mono`}
              />
            </div>

            {/* Water Availability */}
            <div>
              <span className={FIELD_LABEL} id="crop-water-label">
                <Droplets size={14} className="text-sky-600" /> Water availability
              </span>
              <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="crop-water-label">
                {WATER_TIERS.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setWaterAvailability(tier)}
                    aria-pressed={waterAvailability === tier}
                    className={`${TOGGLE_BASE} ${waterAvailability === tier ? TOGGLE_ON : TOGGLE_OFF}`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Season Window */}
            <div>
              <span className={FIELD_LABEL} id="crop-season-label">
                <Calendar size={14} className="text-brand-600" /> Cultivation season
              </span>
              <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="crop-season-label">
                {SEASONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeason(s)}
                    aria-pressed={season === s}
                    className={`${TOGGLE_BASE} ${season === s ? TOGGLE_ON : TOGGLE_OFF}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget Input & Presets */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="crop-budget" className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <Coins size={14} className="text-brand-600" /> Cultivation budget
                </label>
                <span className="font-semibold text-brand-800 text-xs font-mono">
                  ₹{formatINR(budget)}
                </span>
              </div>
              <input
                id="crop-budget"
                type="number"
                min={MIN_BUDGET}
                step="1000"
                value={budget}
                onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className={`${FIELD_INPUT} font-mono`}
              />
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {BUDGET_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setBudget(p.value)}
                    className="text-xs px-2 py-0.5 rounded-md bg-stone-100 hover:bg-brand-100 text-stone-700 hover:text-brand-900 font-semibold font-mono transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-stone-500">
              Scores every crop suitability rule against your soil, water tier, season, cost templates and market price bands.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full sm:w-auto px-6 py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Evaluating crops…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Run Pre-Season Recommendation
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error Feedback */}
      {error && !loading && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
          <div className="flex items-start gap-2 flex-1">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={retryLast}
            className="btn-secondary text-xs px-4 py-2 self-start sm:self-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !results && <ResultsSkeleton />}

      {/* Results Section */}
      {results && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`} aria-busy={loading}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-stone-800">
                Top Recommended Crops for {profile.district || district} ({profile.season || season} season)
              </h2>
              <p className="text-xs text-stone-500">
                Sorted by agronomic suitability score (0–100) for {profile.land_area_acres ?? landAreaAcres} acres of {profile.soil_type || soilType}.
                Yield and profit are shown as estimated ranges.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-stone-600 bg-stone-100 px-3 py-1 rounded-full self-start whitespace-nowrap">
              {recs.length} of {results.total_candidates_analyzed ?? recs.length} crops shown
            </span>
          </div>

          {effectiveSoil?.source_badge && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900">
              <ShieldCheck size={14} className="shrink-0 mt-0.5 text-sky-700" />
              <span>
                Soil data on file for this farm: <strong>{effectiveSoil.source_badge}</strong>
                {effectiveSoil.soil_type ? ` (${effectiveSoil.soil_type})` : ''}. The soil type you select above takes precedence.
              </span>
            </div>
          )}

          {allOverBudget && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-700" />
              <span>
                No crop fits a budget of ₹{formatINR(profile.budget ?? budget)} for this plot. The crops below are the closest agronomic fits and exceed your budget.
              </span>
            </div>
          )}

          {/* Empty / Low Budget State */}
          {recs.length === 0 ? (
            <div className="card p-8 sm:p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-base font-semibold text-stone-900">
                No crops matched ₹{formatINR(profile.budget ?? budget)}
              </h3>
              <p className="text-sm text-stone-600 max-w-md mx-auto">
                Cultivation costs for {profile.land_area_acres ?? landAreaAcres} acres exceed this budget, or no crop suits this soil, water and season combination.
                Try a higher budget, a different water tier, or a hardy low-input crop such as millets, sorghum or sesamum.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const area = Number(profile.land_area_acres ?? landAreaAcres) || 2.5
                    const newB = Math.max(Number(budget || 0) * 2, Math.round(area * 28000), MIN_BUDGET)
                    setBudget(newB)
                    executeRecommendation({ budget: newB })
                  }}
                  className="btn-primary px-4 py-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  Raise budget for {profile.land_area_acres ?? landAreaAcres} acres &amp; re-evaluate
                </button>
              </div>
            </div>
          ) : (
            /* Ranked Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recs.map((rec, idx) => (
                <CropRecommendationCard
                  key={`${rec.crop_type}-${idx}`}
                  rec={rec}
                  rank={idx + 1}
                  isTop={idx === 0 && !rec.exceeds_budget}
                />
              ))}
            </div>
          )}

          {/* Global Disclaimer Footer */}
          {results.disclaimer && (
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs text-stone-600 flex items-start gap-2.5">
              <Info size={16} className="text-stone-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-stone-700 block">About these estimates</span>
                <p>{results.disclaimer}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
