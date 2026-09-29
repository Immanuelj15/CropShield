import { AlertTriangle, Activity, Thermometer, Droplets, Wind, HelpCircle, Send, WifiOff, CloudOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import RiskGauge from '../../components/RiskGauge'
import CounterfactualCard from '../../components/CounterfactualCard'
import EconomicImpactCard from '../../components/EconomicImpactCard'
import VegetationHealthCard from '../../components/VegetationHealthCard'
import FusedHealthScoreCard from '../../components/FusedHealthScoreCard'
import { ConfidenceBadge } from '../../components/ConfidenceBadge'
import { WarningCardSkeleton, CounterfactualSkeleton } from '../../components/SkeletonLoader'

function getRiskBadge(level) {
  if (level === 'High') return 'bg-red-100 text-red-800 border-red-300'
  if (level === 'Medium') return 'bg-amber-100 text-amber-800 border-amber-300'
  return 'bg-green-100 text-green-800 border-green-300'
}

export default function FarmerWarningTab({
  warningData, loading, isOfflineCached, cachedTimestamp, farm, fetchTodayWarning,
  vegetationData, scanResult, supportQuery, setSupportQuery, supportSent, handleSendSupport,
  supportSending = false,
}) {
  const { t } = useTranslation(['farmer'])
  // Contract 8: weather came from the synthetic fallback, not NASA POWER
  const isSyntheticWeather = !!warningData?.data_quality?.is_synthetic
  // ML fallback: the pest model could not run, so the score is a documented rule index.
  const isRuleFallback = !!warningData && (warningData.model_version === 'rules-fallback-v2' || warningData.is_rule_fallback === true)
  const hasCalibration = !isRuleFallback && typeof warningData?.calibrated_confidence === 'number'
  // Contract 7: never feed an unavailable-model scan confidence into the fused score
  const reliableScanConfidence = scanResult && scanResult.model_available !== false && typeof scanResult.confidence === 'number'
    ? scanResult.confidence
    : undefined

  return (
    <div className="space-y-6">
      {isSyntheticWeather && !loading && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-2xl flex items-center gap-2.5 text-xs text-sky-900 font-semibold" role="status">
          <CloudOff size={16} className="text-sky-700 shrink-0" />
          <span>{t('farmer:synthetic_weather_notice', 'Estimated weather (live data unavailable). Treat this risk as indicative only.')}</span>
        </div>
      )}
      {isOfflineCached && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 font-semibold">
          <div className="flex items-center gap-2.5">
            <WifiOff size={18} className="text-amber-700 shrink-0" />
            <span>
              Showing cached early warning {cachedTimestamp ? `(recorded at ${cachedTimestamp})` : ''}. Operating in offline resilience mode for rural low-connectivity coverage.
            </span>
          </div>
          <button
            onClick={() => farm && fetchTodayWarning(farm)}
            className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 rounded-lg text-amber-950 text-xs font-bold transition-all shrink-0 self-start sm:self-auto"
          >
            Reconnect & Refresh
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8"><WarningCardSkeleton /></div>
          <div className="lg:col-span-4"><CounterfactualSkeleton /></div>
        </div>
      ) : warningData ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-stone-900">Today's Pest Risk Assessment</h2>
                  <span className={`text-xs px-3 py-1 rounded-full font-extrabold border uppercase tracking-wider ${getRiskBadge(warningData.risk_level)}`}>
                    {warningData.risk_level} Risk
                  </span>
                  {hasCalibration && (
                    <ConfidenceBadge
                      calibratedConfidence={warningData.calibrated_confidence}
                      confidenceBand={warningData.confidence_band}
                      rawConfidence={warningData.raw_confidence}
                    />
                  )}
                </div>
                {isRuleFallback && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1" role="status">
                    <AlertTriangle size={12} className="shrink-0" />
                    {t('farmer:rule_based_estimate', 'Rule-based estimate (model unavailable)')}
                  </p>
                )}
                <p className="text-xs text-stone-500 mt-1">
                  {isSyntheticWeather ? 'Estimated weather' : 'NASA POWER satellite observation'}: {warningData.data_date} · Model: {warningData.model_version}
                </p>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black text-stone-900">{Math.round((Number(warningData.risk_score) || 0) * 100)}%</span>
                <span className="text-[11px] text-stone-500 block">{isRuleFallback ? 'Rule-based risk index' : 'Risk Probability'}</span>
              </div>
            </div>

            <div className="bg-stone-50/70 rounded-2xl border border-stone-200/80 p-4">
              <RiskGauge riskScore={warningData.risk_score} riskLevel={warningData.risk_level} />
            </div>

            <div className={clsx(
              'p-4 rounded-2xl border text-sm font-semibold flex items-start gap-3',
              warningData.risk_level === 'High' ? 'bg-red-50 border-red-200 text-red-900' :
              warningData.risk_level === 'Medium' ? 'bg-amber-50 border-amber-200 text-amber-900' :
              'bg-green-50 border-green-200 text-green-900'
            )}>
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <p>{warningData.alert_message}</p>
            </div>

            <div>
              <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-3">Field Microclimate Snapshot (NASA Satellite)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <Thermometer size={16} className="mx-auto text-amber-600 mb-1" />
                  <span className="text-xs text-stone-500 block">Temperature</span>
                  <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.temperature_c}°C</span>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <Droplets size={16} className="mx-auto text-blue-600 mb-1" />
                  <span className="text-xs text-stone-500 block">Humidity</span>
                  <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.humidity_pct}%</span>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <Wind size={16} className="mx-auto text-teal-600 mb-1" />
                  <span className="text-xs text-stone-500 block">7-Day Rain</span>
                  <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.rain_rolling_7d_mm} mm</span>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <Activity size={16} className="mx-auto text-purple-600 mb-1" />
                  <span className="text-xs text-stone-500 block">Dry Days</span>
                  <span className="text-sm font-bold text-stone-900">{warningData.weather_snapshot?.consecutive_dry_days} Days</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">Explainable AI: Risk Feature Breakdown (SHAP)</h3>
                <span className="text-[11px] text-stone-500">{isRuleFallback ? 'Rule-based factors (no model SHAP)' : 'Tree-SHAP Attribution'}</span>
              </div>

              <div className="space-y-2.5">
                {warningData.top_features?.map((f, i) => {
                  const isPos = f.shap_value > 0
                  const pct = Math.min(100, Math.abs(f.shap_value) * 350)
                  return (
                    <div key={i} className="p-2.5 bg-stone-50 rounded-lg border border-stone-200/80">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="text-stone-800">{String(f.feature || '').replace(/_/g, ' ').toUpperCase()} ({f.value})</span>
                        <span className={isPos ? 'text-red-600' : 'text-green-700'}>
                          {isPos ? '+' : ''}{Math.round(f.shap_value * 100)}% Risk Impact
                        </span>
                      </div>
                      <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                        <div className={clsx('h-1.5 rounded-full', isPos ? 'bg-red-500' : 'bg-green-500')} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-stone-600 italic mt-3 bg-stone-100 p-2.5 rounded-lg border border-stone-200">
                💡 {warningData.shap_interpretation}
              </p>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <CounterfactualCard prescription={warningData.counterfactual_prescription} currentRiskScore={warningData.risk_score} />
            <EconomicImpactCard economicImpact={warningData.economic_impact} />

            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                <HelpCircle size={16} className="text-brand-600" />
                <span>Need Expert Agronomist Advice?</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Send your field symptoms directly to regional extension agronomists.
              </p>
              <form onSubmit={handleSendSupport} className="space-y-2.5">
                <textarea
                  rows={3}
                  value={supportQuery}
                  onChange={(e) => setSupportQuery(e.target.value)}
                  placeholder="Describe leaf spots, pest sightings, or soil conditions..."
                  className="w-full p-2.5 text-xs rounded-lg border border-stone-200 focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                />
                <button
                  type="submit"
                  disabled={!supportQuery.trim() || supportSending}
                  className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send size={13} /> Submit Diagnostic Request
                </button>
              </form>
              {supportSent && (
                <p className="text-[11px] text-green-700 font-bold bg-green-50 p-2 rounded-lg text-center">
                  ✓ Diagnostic request sent to your regional agronomists.
                </p>
              )}
            </div>
          </div>

          <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <FusedHealthScoreCard
              fusedData={vegetationData?.fused_health_score || warningData?.fused_health_score}
              climateRiskScore={warningData?.risk_score}
              ndviValue={vegetationData?.ndvi_value}
              imageConfidence={reliableScanConfidence}
            />
            <VegetationHealthCard vegetationData={vegetationData} />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-stone-500">
          {farm ? 'No warning generated yet. Click "Refresh" above.' : 'Register your farm in Manage My Farm to get a daily pest warning.'}
        </div>
      )}
    </div>
  )
}
