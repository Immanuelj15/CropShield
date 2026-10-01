import React from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle2, FileText, Upload,
  Mountain, ArrowUpRight, Info, Sprout, ShieldCheck
} from 'lucide-react'
import ConfidenceIndicator from './ConfidenceIndicator'

const isNum = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))
const show = (v, suffix = '') => (isNum(v) ? `${v}${suffix}` : '—')
const certainty = (pct) => (isNum(pct) ? `${Math.round(Number(pct))}% certainty` : 'Certainty n/a')

function phLabel(ph) {
  if (!isNum(ph)) return 'pH not available'
  const v = Number(ph)
  if (v < 5.5) return 'Strongly acidic'
  if (v < 6.5) return 'Slightly acidic'
  if (v > 8.5) return 'Strongly alkaline'
  if (v > 7.5) return 'Moderately alkaline'
  return 'Near neutral (optimal for most crops)'
}

function MeasuredTag() {
  return <span className="text-xs font-semibold text-green-800 bg-green-50 px-2 py-0.5 rounded-full">Measured</span>
}

function CertaintyTag({ pct }) {
  return <span className="text-xs font-mono text-sky-800 font-semibold whitespace-nowrap">{certainty(pct)}</span>
}

function PropertyCard({ title, tag, value, valueClass = 'text-2xl font-bold text-stone-900', description, footnote }) {
  return (
    <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">{title}</span>
        {tag}
      </div>
      <div className="min-w-0">
        <div className={`${valueClass} break-words`}>{value}</div>
        {description && <p className="text-xs text-stone-600 mt-1 leading-snug">{description}</p>}
      </div>
      {footnote && <div className="text-xs text-stone-500">{footnote}</div>}
    </div>
  )
}

export default function SoilReportCard({
  report,
  onOpenLabUpload,
  onNavigateToCropRecommendation,
}) {
  if (!report) return null

  const isLabVerified = report.report_type === 'lab_verified' || report.is_lab_verified
  const props = report.estimated_properties || {}
  const ph = props.ph || {}
  const n = props.nitrogen || {}
  const p = props.phosphorus || {}
  const k = props.potassium || {}
  const oc = props.organic_carbon || {}

  const phRangeStr = Array.isArray(ph.value_range) && ph.value_range.length === 2
    ? `${ph.value_range[0]} – ${ph.value_range[1]}`
    : show(ph.mean)
  const phValue = isLabVerified ? show(ph.mean ?? ph.value_range?.[0]) : phRangeStr

  return (
    <div className="space-y-6">
      {/* PART A: MANDATORY PERSISTENT DISCLAIMER BANNER (Not dismissible) */}
      {!isLabVerified && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex items-start gap-3 sm:gap-4"
          role="note"
        >
          <div className="p-2.5 bg-amber-100 rounded-xl shrink-0">
            <AlertTriangle size={20} className="text-amber-700" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-900">
              Preliminary satellite &amp; regional soil estimate
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed">
              This is a preliminary soil estimate based on satellite and regional data. It is
              not a replacement for laboratory soil testing. For accurate pH and nutrient
              measurements, upload a verified soil-test report.
            </p>
          </div>
        </motion.div>
      )}

      {/* Main Report Header Card */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-100">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="text-xs font-mono font-semibold text-stone-600">Plot assessment</span>
              {isLabVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                  <ShieldCheck size={13} /> Lab Verified Analysis
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
                  <AlertTriangle size={13} className="text-amber-700" /> Estimated (SoilGrids + DEM)
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold text-stone-900 break-words">
              {report.soil_type_declared || 'Agricultural soil profile'}
            </h3>
            <p className="text-xs text-stone-600 mt-1">
              Field area: <span className="font-semibold text-stone-900 font-mono">{show(report.area_acres, ' acres')}</span>
              {report.district && ` • District: ${report.district}`}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-stone-50 p-3 rounded-2xl border border-stone-100 self-start md:self-auto">
            {isLabVerified ? (
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle2 size={24} className="text-green-700" />
                <div>
                  <span className="text-xs font-semibold block text-green-800">Confidence</span>
                  <span className="text-xs font-bold">Direct measurement</span>
                </div>
              </div>
            ) : isNum(report.overall_confidence_pct) ? (
              <ConfidenceIndicator confidencePct={Number(report.overall_confidence_pct)} size="md" />
            ) : (
              <span className="text-xs text-stone-500">Overall confidence not available</span>
            )}
          </div>
        </div>

        {/* Property Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
          <PropertyCard
            title="Soil reaction (pH)"
            tag={isLabVerified ? <MeasuredTag /> : <CertaintyTag pct={ph.confidence_pct} />}
            value={phValue}
            valueClass="text-2xl font-bold text-stone-900 font-mono"
            description={phLabel(ph.mean ?? ph.value_range?.[0])}
            footnote={!isLabVerified ? 'Shown as an uncertainty interval derived from SoilGrids 5th–95th quantiles.' : null}
          />

          <PropertyCard
            title="Available nitrogen (N)"
            tag={isLabVerified ? <MeasuredTag /> : <CertaintyTag pct={n.confidence_pct} />}
            value={isLabVerified ? show(n.value_kg_per_acre, ' kg/acre') : (n.level || '—')}
            description={isLabVerified ? 'Laboratory measurement' : 'Qualitative band derived from SoilGrids topsoil nitrogen.'}
            footnote={!isLabVerified ? 'Exact kg/acre values come only from a verified lab report.' : null}
          />

          <PropertyCard
            title="Available phosphorus (P₂O₅)"
            tag={isLabVerified
              ? <MeasuredTag />
              : <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full whitespace-nowrap">Not modelled</span>}
            value={isLabVerified ? show(p.value_kg_per_acre, ' kg/acre') : 'Not available from satellite'}
            valueClass={isLabVerified ? 'text-2xl font-bold text-stone-900 font-mono' : 'text-sm font-semibold text-amber-900'}
            description={isLabVerified
              ? 'Laboratory measurement'
              : 'SoilGrids does not model phosphorus. Upload a lab report for measured P₂O₅ — no estimate is fabricated.'}
          />

          <PropertyCard
            title="Available potassium (K₂O)"
            tag={isLabVerified ? <MeasuredTag /> : <CertaintyTag pct={k.confidence_pct} />}
            value={isLabVerified ? show(k.value_kg_per_acre, ' kg/acre') : (k.level || '—')}
            description={isLabVerified ? 'Laboratory measurement' : 'Qualitative band derived from regional exchangeable bases.'}
            footnote="Important for drought and pest resilience."
          />

          <PropertyCard
            title="Organic carbon (SOC)"
            tag={isLabVerified ? <MeasuredTag /> : <CertaintyTag pct={oc.confidence_pct} />}
            value={isLabVerified ? show(oc.value_pct, ' %') : (oc.level || '—')}
            description={isLabVerified ? 'Laboratory measurement' : 'Reflects biological fertility and water retention capacity.'}
            footnote="Higher organic carbon reduces irrigation frequency."
          />

          {isLabVerified ? (
            <PropertyCard
              title={<span className="flex items-center gap-1.5"><Mountain size={14} className="text-stone-500" /> Topography &amp; slope</span>}
              tag={<span className="text-xs text-stone-500 font-semibold">Not in lab report</span>}
              value="—"
              valueClass="text-2xl font-bold text-stone-400 font-mono"
              description="Lab reports do not include elevation or slope. Run a satellite analysis of the boundary for terrain estimates."
            />
          ) : (
            <PropertyCard
              title={<span className="flex items-center gap-1.5"><Mountain size={14} className="text-stone-500" /> Topography &amp; slope</span>}
              tag={<span className="text-xs font-mono text-stone-600 font-semibold">Estimated</span>}
              value={show(report.elevation_m, ' m')}
              valueClass="text-2xl font-bold text-stone-900 font-mono"
              description={<>Estimated plot slope: <span className="font-semibold text-stone-800 font-mono">{show(report.terrain_slope_pct, '%')}</span></>}
              footnote="SRTM elevation when satellite access is available, otherwise a regional terrain approximation."
            />
          )}
        </div>

        {/* Data Sources and Methodology */}
        <div className="mt-6 pt-5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-600">
          <div className="flex items-start gap-2 min-w-0">
            <Info size={14} className="text-stone-500 shrink-0 mt-0.5" />
            <span className="break-words">
              Sources: {Array.isArray(report.data_sources) && report.data_sources.length
                ? report.data_sources.join(' • ')
                : 'Not recorded'}
            </span>
          </div>
          {report.lab_report_file_url && (
            <a
              href={report.lab_report_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800 underline shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <FileText size={13} /> View attached lab report
            </a>
          )}
        </div>
      </div>

      {/* CTA ACTIONS BANNER */}
      <div className="bg-gradient-to-r from-brand-800 to-brand-600 rounded-3xl p-5 sm:p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-base font-semibold flex items-center gap-2">
            <Sprout size={18} />
            <span>Ready for season crop &amp; profit planning</span>
          </h4>
          <p className="text-xs text-brand-50 max-w-xl leading-relaxed">
            Carry this soil profile into the Crop Recommendation &amp; Profit Engine to rank crops
            matched to your soil, water availability and market profit potential.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isLabVerified && onOpenLabUpload && (
            <button
              type="button"
              onClick={onOpenLabUpload}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all flex items-center gap-2 border border-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Upload size={14} /> Upload Lab Report
            </button>
          )}

          {onNavigateToCropRecommendation && (
            <button
              type="button"
              onClick={onNavigateToCropRecommendation}
              className="px-5 py-2.5 rounded-xl bg-white text-brand-800 hover:bg-brand-50 text-xs font-bold transition-all flex items-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>See Crop Recommendations</span>
              <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
