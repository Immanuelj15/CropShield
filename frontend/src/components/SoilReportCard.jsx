import React from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle2, FileText, Upload, Sparkles,
  Mountain, ArrowUpRight, Info, Compass, Sprout, ShieldCheck, HelpCircle
} from 'lucide-react'
import ConfidenceIndicator from './ConfidenceIndicator'

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

  const phRangeStr = ph.value_range ? `${ph.value_range[0]} – ${ph.value_range[1]}` : (ph.mean ?? '6.8')

  return (
    <div className="space-y-6">
      {/* PART A: MANDATORY PERSISTENT DISCLAIMER BANNER (Not dismissible) */}
      {!isLabVerified && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50/90 border border-amber-300 rounded-3xl p-5 shadow-sm flex items-start gap-4"
        >
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl shrink-0 mt-0.5">
            <AlertTriangle size={22} className="text-amber-700" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">
              Preliminary Satellite & Regional Soil Estimate
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              ⚠️ This is a preliminary soil estimate based on satellite and regional data. It is
              not a replacement for laboratory soil testing. For accurate pH and nutrient
              measurements, upload a verified soil-test report.
            </p>
          </div>
        </motion.div>
      )}

      {/* Main Report Header Card */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs font-mono font-bold text-stone-600">Plot Assessment</span>
              {isLabVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-700 text-white shadow-sm">
                  <ShieldCheck size={13} /> Lab Verified Analysis
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-900 border border-amber-300">
                  <AlertTriangle size={13} className="text-amber-700" /> Estimated (SoilGrids + DEM)
                </span>
              )}
            </div>
            <h3 className="text-xl font-black text-stone-900 flex items-center gap-2">
              <span>{report.soil_type_declared || 'Agricultural Soil Profile'}</span>
            </h3>
            <p className="text-xs text-stone-600 mt-1">
              Field Area: <span className="font-bold text-stone-900 font-mono">{report.area_acres} Acres</span>
              {report.district && ` • District: ${report.district}`}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-stone-50 p-3 rounded-2xl border border-stone-100 self-start md:self-auto">
            {isLabVerified ? (
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 size={24} className="text-emerald-700" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider block text-emerald-800">Confidence</span>
                  <span className="text-xs font-black">Direct Measurement</span>
                </div>
              </div>
            ) : (
              <ConfidenceIndicator
                confidencePct={report.overall_confidence_pct || 65}
                size="md"
              />
            )}
          </div>
        </div>

        {/* Property Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
          {/* 1. Soil pH */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-stone-600">Soil Reaction (pH)</span>
              {isLabVerified ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">Measured</span>
              ) : (
                <span className="text-[10px] font-mono text-sky-800 font-bold">{ph.confidence_pct ?? 85}% certainty</span>
              )}
            </div>
            <div>
              <div className="text-2xl font-black text-stone-900 font-mono">
                {isLabVerified ? ph.mean ?? ph.value_range?.[0] : phRangeStr}
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                {parseFloat(ph.mean || 7.0) < 6.5 ? 'Slightly Acidic' : parseFloat(ph.mean || 7.0) > 7.5 ? 'Moderately Alkaline' : 'Near Neutral (Optimal for most crops)'}
              </p>
            </div>
            {!isLabVerified && (
              <div className="text-[10px] text-stone-600 italic">
                Reported as uncertainty interval from SoilGrids 5th–95th quantiles.
              </div>
            )}
          </div>

          {/* 2. Available Nitrogen */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-stone-600">Available Nitrogen (N)</span>
              {isLabVerified ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">Measured</span>
              ) : (
                <span className="text-[10px] font-mono text-sky-800 font-bold">{n.confidence_pct ?? 65}% certainty</span>
              )}
            </div>
            <div>
              <div className="text-2xl font-black text-stone-900">
                {isLabVerified ? `${n.value_kg_per_acre ?? '--'} kg/acre` : (n.level || 'Medium')}
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                {isLabVerified ? 'Laboratory titrimetric Kjeldahl test' : 'Qualitative band derived from SoilGrids topsoil nitrogen.'}
              </p>
            </div>
            <div className="text-[10px] text-stone-600">
              Precise kg/ha figures reserved for verified lab reports.
            </div>
          </div>

          {/* 3. Available Phosphorus (Honest limitation handling) */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-stone-600">Available Phosphorus (P₂O₅)</span>
              {isLabVerified ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">Measured</span>
              ) : (
                <span className="text-[10px] font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-bold">Unmodeled</span>
              )}
            </div>
            <div>
              <div className={`text-base font-bold ${isLabVerified ? 'text-2xl text-stone-900 font-mono' : 'text-amber-900 text-sm'}`}>
                {isLabVerified ? `${p.value_kg_per_acre ?? '--'} kg/acre` : 'Not available from satellite'}
              </div>
              <p className="text-[11px] text-stone-600 mt-1 leading-snug">
                {isLabVerified
                  ? 'Laboratory Olsen / Bray extractable P'
                  : 'SoilGrids does not directly model phosphorus. Upload lab report for measured P₂O₅.'}
              </p>
            </div>
            <div className="text-[10px] text-stone-600">
              {isLabVerified ? 'Direct lab determination' : 'Honest transparency: no fabricated P estimates.'}
            </div>
          </div>

          {/* 4. Available Potassium */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-stone-600">Available Potassium (K₂O)</span>
              {isLabVerified ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">Measured</span>
              ) : (
                <span className="text-[10px] font-mono text-sky-800 font-bold">{k.confidence_pct ?? 60}% certainty</span>
              )}
            </div>
            <div>
              <div className="text-2xl font-black text-stone-900">
                {isLabVerified ? `${k.value_kg_per_acre ?? '--'} kg/acre` : (k.level || 'Medium')}
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                {isLabVerified ? 'Laboratory neutral ammonium acetate extraction' : 'Qualitative band derived from regional exchangeable bases.'}
              </p>
            </div>
            <div className="text-[10px] text-stone-600">
              Essential for drought and pest resilience.
            </div>
          </div>

          {/* 5. Soil Organic Carbon */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-stone-600">Organic Carbon (SOC)</span>
              {isLabVerified ? (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">Measured</span>
              ) : (
                <span className="text-[10px] font-mono text-sky-800 font-bold">{oc.confidence_pct ?? 55}% certainty</span>
              )}
            </div>
            <div>
              <div className="text-2xl font-black text-stone-900">
                {isLabVerified ? `${oc.value_pct ?? '--'} %` : (oc.level || 'Medium')}
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                {isLabVerified ? 'Walkley-Black chromic acid wet oxidation' : 'Reflects biological fertility and water retention capacity.'}
              </p>
            </div>
            <div className="text-[10px] text-stone-600">
              Higher OC reduces irrigation frequency.
            </div>
          </div>

          {/* 6. Topography & Elevation */}
          <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                <Mountain size={14} className="text-stone-500" /> Topography & Slope
              </span>
              <span className="text-[10px] font-mono text-stone-600 font-bold">SRTM 30m</span>
            </div>
            <div>
              <div className="text-2xl font-black text-stone-900 font-mono">
                {report.elevation_m} m
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                Estimated plot slope: <span className="font-bold text-stone-800 font-mono">{report.terrain_slope_pct}%</span>
              </p>
            </div>
            <div className="text-[10px] text-stone-600">
              Informs water runoff, drainage, and erosion risk.
            </div>
          </div>
        </div>

        {/* Data Sources and Methodology */}
        <div className="mt-6 pt-5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-600">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-stone-500 shrink-0" />
            <span>
              Sources: {report.data_sources?.join(' • ') || 'ISRIC SoilGrids v2.0 • NASA POWER • SRTM'}
            </span>
          </div>
          {report.lab_report_file_url && (
            <a
              href={`http://localhost:8000${report.lab_report_file_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-bold text-emerald-800 hover:text-emerald-950 underline"
            >
              <FileText size={13} /> View Attached Lab Report Document
            </a>
          )}
        </div>
      </div>

      {/* CTA ACTIONS BANNER */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-800 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-base font-black flex items-center gap-2">
            <Sprout size={18} />
            <span>Ready for Season Crop & Profit Planning</span>
          </h4>
          <p className="text-xs text-emerald-100 max-w-xl leading-relaxed">
            Feed this soil profile directly into the Crop Recommendation & Profit Engine to rank candidate crops
            matched to your soil reaction, water needs, and market profit potential.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isLabVerified && (
            <button
              type="button"
              onClick={onOpenLabUpload}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-2 border border-white/20"
            >
              <Upload size={14} /> Upload Lab Report
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateToCropRecommendation}
            className="px-5 py-2.5 rounded-xl bg-white text-emerald-950 hover:bg-emerald-50 text-xs font-black transition-all flex items-center gap-2 shadow-sm"
          >
            <span>See Crop Recommendations</span>
            <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
