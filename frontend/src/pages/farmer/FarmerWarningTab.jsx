import { NavLink } from 'react-router-dom'
import { AlertTriangle, Thermometer, Droplets, CloudRain, Sun, HelpCircle, Send, WifiOff, CloudOff, Bug, MessageSquare, Sprout } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import RiskGauge from '../../components/RiskGauge'
import CounterfactualCard from '../../components/CounterfactualCard'
import EconomicImpactCard from '../../components/EconomicImpactCard'
import VegetationHealthCard from '../../components/VegetationHealthCard'
import FusedHealthScoreCard from '../../components/FusedHealthScoreCard'
import { ConfidenceBadge } from '../../components/ConfidenceBadge'
import { WarningCardSkeleton, CounterfactualSkeleton } from '../../components/SkeletonLoader'
import { LikelyPestCard, ErrorState, friendlyName } from '../../components/index'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'

const SUPPORT_MIN = 5
const SUPPORT_MAX = 4000

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
// Render a weather value with its unit, or an em dash when the backend sent nothing usable
const fmt = (v, unit = '') => (isNum(v) ? `${Number(v)}${unit}` : '—')

const RISK_LABEL_KEY = { Low: 'risk_level_low', Medium: 'risk_level_medium', High: 'risk_level_high' }

const SUPPORT_STATUS = {
  pending: { status: 'warning', label: 'Awaiting reply' },
  resolved: { status: 'success', label: 'Answered' },
  responded: { status: 'success', label: 'Answered' },
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FarmerWarningTab({
  warningData, loading, isOfflineCached, cachedTimestamp, farm, farmMissing = false, fetchTodayWarning,
  warningError = null,
  vegetationData, vegetationError = null, supportQuery, setSupportQuery, supportSent, handleSendSupport,
  supportSending = false, supportRequests = [], supportRequestsError = null, onRetrySupportRequests,
}) {
  const { t } = useTranslation(['farmer'])
  // Contract 8: weather came from the synthetic fallback, not NASA POWER
  const isSyntheticWeather = !!warningData?.data_quality?.is_synthetic
  // ML fallback: the pest model could not run, so the score is a documented rule index.
  const isRuleFallback = !!warningData && (warningData.model_version === 'rules-fallback-v2' || warningData.is_rule_fallback === true)
  const hasCalibration = !isRuleFallback && isNum(warningData?.calibrated_confidence)
  const riskScore = isNum(warningData?.risk_score) ? Number(warningData.risk_score) : null
  const riskLevel = warningData?.risk_level || null
  const weather = warningData?.weather_snapshot || {}
  const topFeatures = Array.isArray(warningData?.top_features) ? warningData.top_features : []
  const likelyPests = Array.isArray(warningData?.likely_pests) ? warningData.likely_pests : []
  const myRequests = Array.isArray(supportRequests) ? supportRequests : []
  const trimmedQuery = (supportQuery || '').trim()
  const queryTooShort = trimmedQuery.length > 0 && trimmedQuery.length < SUPPORT_MIN
  const riskLabel = riskLevel
    ? t(`farmer:${RISK_LABEL_KEY[riskLevel] || 'risk_level_medium'}`, `${riskLevel} Risk`)
    : null

  return (
    <div className="space-y-6">
      {isSyntheticWeather && !loading && (
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-2xl flex items-center gap-2.5 text-xs text-sky-900 font-semibold" role="status">
          <CloudOff size={16} className="text-sky-700 shrink-0" aria-hidden="true" />
          <span>{t('farmer:synthetic_weather_notice', 'Estimated weather (live data unavailable). Treat this risk as indicative only.')}</span>
        </div>
      )}
      {isOfflineCached && warningData && !loading && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 font-semibold" role="status">
          <div className="flex items-center gap-2.5">
            <WifiOff size={18} className="text-amber-700 shrink-0" aria-hidden="true" />
            <span>
              {t('farmer:cached_warning_notice', 'Showing your last saved warning')}
              {cachedTimestamp ? ` (${cachedTimestamp})` : ''}. {t('farmer:cached_warning_hint', 'A live update could not be loaded.')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => farm && fetchTodayWarning(farm)}
            disabled={!farm}
            className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 rounded-lg text-amber-950 text-xs font-bold transition-all shrink-0 self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {t('farmer:reconnect_refresh', 'Reconnect & Refresh')}
          </button>
        </div>
      )}

      {loading && !warningData ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8"><WarningCardSkeleton /></div>
          <div className="lg:col-span-4"><CounterfactualSkeleton /></div>
        </div>
      ) : warningData ? (
        <div className={clsx('grid grid-cols-1 lg:grid-cols-12 gap-6', loading && 'opacity-60 pointer-events-none')} aria-busy={loading}>
          <div className="lg:col-span-8 card p-6 space-y-6 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-stone-800">{t('farmer:today_assessment_title', "Today's Pest Risk Assessment")}</h2>
                  {riskLevel && <Badge status={riskLevel}>{riskLabel}</Badge>}
                  {hasCalibration && (
                    <ConfidenceBadge
                      calibratedConfidence={Number(warningData.calibrated_confidence)}
                      confidenceBand={warningData.confidence_band}
                      rawConfidence={isNum(warningData.raw_confidence) ? Number(warningData.raw_confidence) : null}
                      calibrationMethod={warningData.calibration_method}
                    />
                  )}
                </div>
                {isRuleFallback && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1" role="status">
                    <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
                    {t('farmer:rule_based_estimate', 'Rule-based estimate (model unavailable)')}
                  </p>
                )}
                <p className="text-xs text-stone-500 mt-1">
                  {isSyntheticWeather
                    ? t('farmer:weather_source_estimated', 'Estimated weather')
                    : t('farmer:weather_source_nasa', 'NASA POWER satellite observation')}
                  {warningData.data_date ? `: ${warningData.data_date}` : ''}
                  {warningData.model_version ? ` · ${t('farmer:model_label', 'Model')}: ${warningData.model_version}` : ''}
                </p>
              </div>
            </div>

            <div className="bg-stone-50/70 rounded-2xl border border-stone-200/80 p-2 sm:p-4">
              <RiskGauge riskScore={riskScore ?? 0} riskLevel={riskLevel || 'Medium'} />
              <p className="text-center text-xs text-stone-500 -mt-2">
                {isRuleFallback
                  ? t('farmer:rule_risk_index', 'Rule-based risk index')
                  : t('farmer:risk_probability', 'Model risk score')}
              </p>
            </div>

            {warningData.alert_message && (
              <div className={clsx(
                'p-4 rounded-2xl border text-sm font-semibold flex items-start gap-3',
                riskLevel === 'High' ? 'bg-red-50 border-red-200 text-red-900' :
                riskLevel === 'Medium' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                'bg-green-50 border-green-200 text-green-900'
              )} role={riskLevel === 'High' ? 'alert' : undefined}>
                <AlertTriangle size={20} className="shrink-0 mt-0.5" aria-hidden="true" />
                <p>{warningData.alert_message}</p>
              </div>
            )}

            <div>
              <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-3">
                {t('farmer:microclimate_title', 'Field Microclimate Snapshot')}
                <span className="normal-case font-semibold text-stone-500">
                  {' '}({isSyntheticWeather ? t('farmer:weather_source_estimated', 'Estimated weather') : 'NASA POWER'})
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <Thermometer size={16} className="mx-auto text-amber-600 mb-1" aria-hidden="true" />
                  <span className="text-xs text-stone-500 block">{t('farmer:temperature', 'Temperature')}</span>
                  <span className="text-sm font-bold text-stone-900">{fmt(weather.temperature_c, '°C')}</span>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <Droplets size={16} className="mx-auto text-sky-600 mb-1" aria-hidden="true" />
                  <span className="text-xs text-stone-500 block">{t('farmer:humidity', 'Humidity')}</span>
                  <span className="text-sm font-bold text-stone-900">{fmt(weather.humidity_pct, '%')}</span>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <CloudRain size={16} className="mx-auto text-sky-700 mb-1" aria-hidden="true" />
                  <span className="text-xs text-stone-500 block">{t('farmer:rain_7d', '7-Day Rain')}</span>
                  <span className="text-sm font-bold text-stone-900">{fmt(weather.rain_rolling_7d_mm, ' mm')}</span>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <Sun size={16} className="mx-auto text-amber-500 mb-1" aria-hidden="true" />
                  <span className="text-xs text-stone-500 block">{t('farmer:dry_days', 'Dry Days')}</span>
                  <span className="text-sm font-bold text-stone-900">
                    {isNum(weather.consecutive_dry_days) ? t('farmer:days_count', '{{count}} days', { count: Number(weather.consecutive_dry_days) }) : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Likely pests today (rule engine) — returned by /predict-today as likely_pests[] */}
            <div>
              <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Bug size={14} className="text-stone-500" aria-hidden="true" />
                {t('farmer:likely_pests_title', 'Pests Favoured by Today\'s Weather')}
              </h3>
              {likelyPests.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {likelyPests.map((p, i) => (
                    <LikelyPestCard key={`${p.pest_name || 'pest'}-${i}`} pest={p} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-lg p-3">
                  {t('farmer:no_likely_pests', 'No pest is currently favoured by today\'s weather. Continue routine scouting.')}
                </p>
              )}
            </div>

            <div className="pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">{t('farmer:view_shap_breakdown', 'Why is this happening? (Tree-SHAP Explanation)')}</h3>
                <span className="text-xs text-stone-500">{isRuleFallback ? t('farmer:rule_factors', 'Rule-based factors (no model SHAP)') : 'Tree-SHAP'}</span>
              </div>

              {topFeatures.length > 0 ? (
                <div className="space-y-2.5">
                  {topFeatures.map((f, i) => {
                    const shap = isNum(f?.shap_value) ? Number(f.shap_value) : 0
                    const isPos = shap > 0
                    const pct = Math.min(100, Math.abs(shap) * 350)
                    const value = isNum(f?.value) ? Math.round(Number(f.value) * 100) / 100 : null
                    const name = f?.feature ? friendlyName(f.feature) : '—'
                    return (
                      <div key={`${f?.feature || 'f'}-${i}`} className="p-2.5 bg-stone-50 rounded-lg border border-stone-200/80">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs font-semibold mb-1">
                          <span className="text-stone-800">{name}{value !== null ? ` (${value})` : ''}</span>
                          <span className={isPos ? 'text-red-700' : 'text-green-700'}>
                            {isPos ? '+' : ''}{Math.round(shap * 100)}% {t('farmer:risk_impact', 'risk impact')}
                          </span>
                        </div>
                        <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                          <div className={clsx('h-1.5 rounded-full', isPos ? 'bg-red-500' : 'bg-green-500')} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-lg p-3">
                  {t('farmer:no_shap', 'No factor breakdown is available for this prediction.')}
                </p>
              )}
              {warningData.shap_interpretation && (
                <p className="text-xs text-stone-600 italic mt-3 bg-stone-100 p-2.5 rounded-lg border border-stone-200">
                  {warningData.shap_interpretation}
                </p>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6 min-w-0">
            <CounterfactualCard prescription={warningData.counterfactual_prescription} currentRiskScore={riskScore} />
            <EconomicImpactCard economicImpact={warningData.economic_impact} />

            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                <HelpCircle size={16} className="text-brand-600" aria-hidden="true" />
                <span>{t('farmer:expert_help_title', 'Need Expert Agronomist Advice?')}</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                {t('farmer:expert_help_sub', 'Send your field symptoms directly to regional extension agronomists.')}
              </p>
              <form onSubmit={handleSendSupport} className="space-y-2.5">
                <label htmlFor="support-query" className="sr-only">{t('farmer:expert_help_title', 'Need Expert Agronomist Advice?')}</label>
                <textarea
                  id="support-query"
                  rows={3}
                  value={supportQuery}
                  maxLength={SUPPORT_MAX}
                  onChange={(e) => setSupportQuery(e.target.value)}
                  placeholder={t('farmer:expert_help_placeholder', 'Describe leaf spots, pest sightings, or soil conditions...')}
                  aria-invalid={queryTooShort}
                  className="w-full p-2.5 text-sm rounded-lg border border-stone-200 focus:ring-2 focus:ring-brand-500 outline-none resize-none"
                />
                {queryTooShort && (
                  <p className="text-xs text-amber-700">{t('farmer:expert_help_min', 'Please write at least 5 characters.')}</p>
                )}
                <button
                  type="submit"
                  disabled={trimmedQuery.length < SUPPORT_MIN || supportSending}
                  className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  <Send size={13} aria-hidden="true" /> {supportSending ? t('farmer:sending', 'Sending…') : t('farmer:expert_help_submit', 'Submit Diagnostic Request')}
                </button>
              </form>
              {supportSent && (
                <p className="text-xs text-green-700 font-bold bg-green-50 p-2 rounded-lg text-center" role="status">
                  ✓ {t('farmer:expert_help_sent', 'Diagnostic request sent to your regional agronomists.')}
                </p>
              )}

              {/* My questions and agronomist replies (GET /support/requests/me) */}
              <div className="pt-3 border-t border-stone-100 space-y-2">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-stone-500" aria-hidden="true" />
                  {t('farmer:my_questions_title', 'My Questions')}
                </h4>
                {supportRequestsError ? (
                  <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
                    <span>{supportRequestsError}</span>
                    {onRetrySupportRequests && (
                      <button type="button" onClick={onRetrySupportRequests} className="font-bold underline shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                        {t('farmer:retry', 'Retry')}
                      </button>
                    )}
                  </div>
                ) : myRequests.length === 0 ? (
                  <p className="text-xs text-stone-500">{t('farmer:my_questions_empty', 'You have not asked any questions yet.')}</p>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto">
                    {myRequests.slice(0, 5).map((r, i) => {
                      const st = SUPPORT_STATUS[String(r.status || '').toLowerCase()] || { status: 'neutral', label: r.status || '—' }
                      return (
                        <li key={r.id || i} className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-stone-500">{formatDate(r.created_at)}</span>
                            <Badge status={st.status} icon={false}>{st.label}</Badge>
                          </div>
                          <p className="text-stone-800 break-words">{r.query_text}</p>
                          {r.response_text && (
                            <p className="text-stone-700 bg-white border border-brand-100 rounded-md p-2 break-words">
                              <strong className="text-brand-700">{r.agronomist_name || t('farmer:agronomist', 'Agronomist')}:</strong> {r.response_text}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {vegetationData?.fused_health_score ? (
              <FusedHealthScoreCard fusedData={vegetationData.fused_health_score} />
            ) : null}
            <VegetationHealthCard vegetationData={vegetationData} unavailableReason={vegetationError} />
          </div>
        </div>
      ) : warningError ? (
        <div className="card">
          <ErrorState message={warningError} onRetry={farm ? () => fetchTodayWarning(farm) : undefined} />
        </div>
      ) : farmMissing ? (
        <div className="card p-2">
          <EmptyState
            icon={Sprout}
            title={t('farmer:no_farm_title', 'No farm registered yet')}
            message={t('farmer:no_farm_warning_hint', 'Register your farm in Manage My Farm to get a daily pest warning.')}
          />
          <div className="flex justify-center pb-6">
            <NavLink
              to="/farmer/manage-farms"
              className="btn-primary text-sm px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {t('farmer:no_farm_cta', 'Register your farm in Manage My Farm')}
            </NavLink>
          </div>
        </div>
      ) : (
        <div className="card p-12 text-center text-sm text-stone-600">
          {farm
            ? t('farmer:no_warning_yet', 'No warning generated yet. Tap "Refresh" above.')
            : t('farmer:loading_farm', 'Loading your farm…')}
        </div>
      )}
    </div>
  )
}
