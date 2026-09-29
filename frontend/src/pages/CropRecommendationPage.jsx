import { useState, useEffect, useRef } from 'react'
import {
  Sprout, Coins, Droplets, MapPin, Calendar, Sparkles,
  RefreshCw, AlertCircle, Info, Layers, FileSpreadsheet, Scale
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import CropRecommendationCard from '../components/CropRecommendationCard'
import { formatINR } from '../components/ProfitRangeDisplay'

import { apiFetch, isNetworkError } from '../utils/http'
import { farmIdOf } from '../utils/farms'

const BUDGET_PRESETS = [
  { label: '₹25,000', value: 25000 },
  { label: '₹50,000', value: 50000 },
  { label: '₹1,00,000', value: 100000 },
  { label: '₹1,50,000', value: 150000 },
  { label: '₹2,50,000', value: 250000 },
]

export default function CropRecommendationPage() {
  const { t } = useTranslation(['farmer', 'common', 'validation'])

  // Farm Auto-Fill Profile State
  const [farm, setFarm] = useState(null)
  const [district, setDistrict] = useState('Thoothukudi')
  const [soilType, setSoilType] = useState('Black Cotton Soil')
  const [landAreaAcres, setLandAreaAcres] = useState(2.5)

  // User Interactive Inputs
  const [budget, setBudget] = useState(60000)
  const [waterAvailability, setWaterAvailability] = useState('Medium')
  const [season, setSeason] = useState('Kharif')

  // Execution State
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [demoScenarios, setDemoScenarios] = useState([])
  const [activeScenarioId, setActiveScenarioId] = useState(null)

  // P2-8: only the latest /generate response may update the screen
  const requestIdRef = useRef(0)

  // Fetch initial farm profile and demo scenarios, then run exactly ONE /generate on mount
  useEffect(() => {
    const currentSeason = determineCurrentSeason()
    fetchDemoScenarios()
    fetchFarmProfile().then((ranWithProfile) => {
      if (!ranWithProfile) executeRecommendation({ season: currentSeason })
    })
  }, [])

  const determineCurrentSeason = () => {
    const month = new Date().getMonth() + 1
    let value = 'Summer'
    if (month >= 6 && month <= 10) value = 'Kharif'
    else if (month === 11 || month === 12 || month <= 2) value = 'Rabi'
    setSeason(value)
    return value
  }

  // Returns true when it already triggered a recommendation with the farm's context
  const fetchFarmProfile = async () => {
    try {
      const data = await apiFetch('/farmer/profile')
      {
        if (data?.farm) {
          setFarm(data.farm)
          const farmDist = data.farm.district || district
          const farmSoil = data.farm.soil_type || soilType
          const farmWater = data.farm.water_availability || waterAvailability
          let farmAcres = landAreaAcres

          if (data.farm.district) setDistrict(farmDist)
          if (data.farm.soil_type) setSoilType(farmSoil)
          if (data.farm.area_hectares) {
            farmAcres = Math.round(data.farm.area_hectares * 2.471 * 10) / 10
            setLandAreaAcres(farmAcres)
          }
          if (data.farm.water_availability) {
            setWaterAvailability(farmWater)
          }

          // Scale budget proportionally so larger farms don't trigger empty results
          const scaledBudget = Math.max(60000, Math.round(farmAcres * 25000))
          setBudget(scaledBudget)

          // Re-run with profile context
          executeRecommendation({
            farm_id: farmIdOf(data.farm) || null,
            season: determineCurrentSeason(),
            district: farmDist,
            soil_type: farmSoil,
            water_availability: farmWater,
            land_area_acres: farmAcres,
            budget: scaledBudget,
          })
          return true
        }
      }
    } catch (e) {
      console.debug('Farm profile auto-fill fallback:', e)
    }
    return false
  }

  const fetchDemoScenarios = async () => {
    try {
      const data = await apiFetch('/crop-recommendation/demo-scenarios?limit=8')
      setDemoScenarios(Array.isArray(data) ? data : [])
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

    // Trigger recommendation with scenario values
    executeRecommendation({
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
    try {
      const rawBudget = overrides.budget !== undefined ? Number(overrides.budget) : Number(budget)
      const rawArea = overrides.land_area_acres !== undefined ? Number(overrides.land_area_acres) : Number(landAreaAcres)

      const payload = {
        farm_id: overrides.farm_id !== undefined ? overrides.farm_id : (farmIdOf(farm) || null),
        budget: isNaN(rawBudget) || rawBudget <= 0 ? 60000 : rawBudget,
        water_availability: overrides.water_availability || waterAvailability || 'Medium',
        season: overrides.season || season || 'Kharif',
        district: overrides.district || district || 'Thoothukudi',
        soil_type: overrides.soil_type || soilType || 'Black Cotton Soil',
        land_area_acres: isNaN(rawArea) || rawArea <= 0 ? 2.5 : rawArea,
      }

      const data = await apiFetch('/crop-recommendation/generate', { method: 'POST', json: payload })
      if (!isCurrent()) return
      setResults(data)
    } catch (err) {
      if (!isCurrent()) return
      setError(isNetworkError(err)
        ? 'Backend communication error. Please ensure AgriGuard server is running.'
        : (err.message || 'Failed to generate crop recommendations.'))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fadeIn pb-24 lg:pb-12 max-w-6xl mx-auto px-4">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-brand-900 via-teal-900 to-stone-900 rounded-3xl p-8 sm:p-10 text-white shadow-xl relative overflow-hidden border border-brand-800/40">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-500/20 text-brand-300 text-xs font-semibold rounded-full border border-brand-400/30">
            <Sprout size={14} /> Pre-Season Agricultural Decision Support
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            AI Crop Recommendation & <span className="text-brand-400">Profit Range Engine</span>
          </h1>
          <p className="text-stone-300 text-xs sm:text-sm leading-relaxed">
            Which crop is truly worth planting before you sow? Analyzes soil taxonomy, irrigation capacity, seasonal monsoon windows, cultivation costs, and mandi price volatility across 15 Tamil Nadu crops.
          </p>
        </div>
      </div>

      {/* 1-Click Demo Scenarios Carousel from 10,000-row Dataset */}
      {demoScenarios.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileSpreadsheet size={15} className="text-brand-600" />
              1-Click Demo Scenarios (from 10,000 Scenario Dataset):
            </span>
            <span className="text-[11px] text-stone-400 font-mono">15 Crops Benchmark</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {demoScenarios.map((sc) => (
              <button
                key={sc.scenario_id}
                onClick={() => handleApplyScenario(sc)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 border text-left shrink-0 ${
                  activeScenarioId === sc.scenario_id
                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                }`}
              >
                <span className="font-bold">{sc.district}</span>
                <span className="opacity-75">· {sc.recommended_crop} ({sc.soil_type.split(' ')[0]})</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-white/20">
                  {sc.suitability_score}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Formulation Card */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Farm Profile & Pre-Season Criteria</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Auto-filled from your registered farm profile. Adjust budget and water tier for the upcoming season.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-brand-50 text-brand-800 rounded-full border border-brand-200">
            {farm ? `Farm: ${farm.farm_name}` : 'Custom Farm Simulation'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
            {/* Location / District (Auto-filled) */}
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <MapPin size={14} className="text-brand-600" /> District / Agro-Climatic Zone
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                required
                className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. Thoothukudi, Madurai, Coimbatore"
              />
            </div>

            {/* Soil Type (Auto-filled) */}
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Layers size={14} className="text-brand-600" /> Soil Classification
              </label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="Black Cotton Soil">Black Cotton Soil (Vertisol)</option>
                <option value="Red Sandy Loam">Red Sandy Loam</option>
                <option value="Red Loam">Red Loam</option>
                <option value="Alluvial Clay">Alluvial Clay</option>
                <option value="Coastal Alluvial">Coastal Alluvial</option>
                <option value="Black Clay Loam">Black Clay Loam</option>
                <option value="Lateritic Hill Soil">Lateritic Hill Soil</option>
              </select>
            </div>

            {/* Land Area (Auto-filled) */}
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Scale size={14} className="text-brand-600" /> Plot Area (Acres)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.2"
                value={landAreaAcres}
                onChange={(e) => setLandAreaAcres(e.target.value)}
                required
                className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
            </div>

            {/* Water Availability (Dynamic Input) */}
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Droplets size={14} className="text-blue-600" /> Water Availability / Irrigation
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Low', 'Medium', 'High'].map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setWaterAvailability(tier)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs transition border ${
                      waterAvailability === tier
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Season Window (Dynamic Input) */}
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar size={14} className="text-amber-600" /> Cultivation Season
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Kharif', 'Rabi', 'Summer'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeason(s)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs transition border ${
                      season === s
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget Input & Presets (Dynamic Input) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Coins size={14} className="text-brand-600" /> Available Cultivation Budget
                </label>
                <span className="font-bold text-brand-800 text-xs font-mono">
                  ₹{formatINR(budget)}
                </span>
              </div>
              <input
                type="number"
                min="5000"
                step="5000"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                required
                className="w-full p-2.5 rounded-xl border border-stone-200 font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
              <div className="flex items-center gap-1 mt-1.5 overflow-x-auto">
                {BUDGET_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setBudget(p.value)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 hover:bg-brand-100 text-stone-600 hover:text-brand-900 font-bold font-mono transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-stone-500">
              Evaluates all 15 real crop suitability rules with soil, water tier, CACP cost templates, and market volatility.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-600 to-teal-600 hover:from-brand-700 hover:to-teal-700 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Evaluating 15 Crops...
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
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Section */}
      {results && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200">
            <div>
              <h2 className="text-xl font-extrabold text-stone-900">
                Top Recommended Crops for {district} ({season} Season)
              </h2>
              <p className="text-xs text-stone-500">
                Sorted by agronomic suitability score (0-100). Yield and profit are strictly presented as estimated ranges.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-stone-500 bg-stone-100 px-3 py-1 rounded-full self-start">
              {results.recommendations?.length || 0} Crops Qualified
            </span>
          </div>

          {/* Empty / Low Budget State */}
          {results.recommendations?.length === 0 ? (
            <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-base font-bold text-stone-900">
                No crops matched your budget of ₹{formatINR(budget)}
              </h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Cultivation costs for this land area ({landAreaAcres} acres) exceed your current budget threshold. Try increasing your budget, selecting a hardy low-input crop (Millets, Sorghum, Sesamum), or adjusting water availability.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const newB = Math.max(budget * 2, Math.round(Number(landAreaAcres) * 28000))
                    setBudget(newB)
                    executeRecommendation({ budget: newB })
                  }}
                  className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold shadow hover:bg-brand-700 transition"
                >
                  Adjust Budget for {landAreaAcres} Acres & Re-evaluate
                </button>
              </div>
            </div>
          ) : (
            /* Ranked Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.recommendations.map((rec, idx) => (
                <CropRecommendationCard
                  key={rec.crop_type}
                  rec={rec}
                  rank={idx + 1}
                  isTop={idx === 0}
                />
              ))}
            </div>
          )}

          {/* Global Disclaimer Footer */}
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 text-[11px] text-stone-500 flex items-start gap-2.5">
            <Info size={16} className="text-stone-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-stone-700 block">Pre-Season Decision-Support Architecture:</span>
              <p>
                {results.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
