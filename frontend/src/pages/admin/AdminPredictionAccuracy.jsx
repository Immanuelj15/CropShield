import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, RefreshCw, Sparkles, Sprout, MapPin } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'

import { apiFetch } from '../../utils/http'

export default function AdminPredictionAccuracy() {
  const [predictionAccuracy, setPredictionAccuracy] = useState(null)

  const fetchPredictionAccuracy = useCallback(async () => {
    try {
      setPredictionAccuracy(await apiFetch('/admin/prediction-accuracy'))
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { fetchPredictionAccuracy() }, [fetchPredictionAccuracy])

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-800 text-xs font-bold border border-green-200 mb-2">
            <Sparkles size={13} className="text-green-600" />
            <span>Pre-Season vs Actual Economic Validation</span>
          </div>
          <h2 className="text-xl font-black text-stone-900">Crop Profit Prediction Accuracy Engine</h2>
          <p className="text-xs text-stone-500 mt-1 max-w-2xl leading-relaxed">
            Aggregated accuracy computed from real farmer-logged expenses and harvest revenue.
            A season is considered <strong>accurate</strong> when actual net profit falls within the AI pre-season predicted range [min, max].
          </p>
        </div>

        <button
          onClick={fetchPredictionAccuracy}
          className="px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold flex items-center gap-2 transition-all self-start md:self-auto cursor-pointer"
        >
          <RefreshCw size={14} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard accent="brand" label="Overall Accuracy Rate" value={`${predictionAccuracy?.accuracy_rate_pct ?? '—'}%`} trend="Within Predicted Range" />
        <StatCard label="Average Deviation" value={`${predictionAccuracy?.average_deviation_pct ?? '—'}%`} trend="Mean absolute error %" />
        <StatCard label="Total Validated Seasons" value={predictionAccuracy?.total_seasons ?? '—'} trend="Real farmer logs" />
        <StatCard accent="violet" label="In-Range Outcomes" value={predictionAccuracy?.within_range_count ?? '—'} trend="Predicted accurately" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
              <Sprout size={16} className="text-green-600" /> Accuracy by Crop Variety
            </h3>
            <span className="text-[11px] text-stone-400 font-medium">Model Calibration</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">Crop</th>
                  <th className="pb-2 text-center">Seasons</th>
                  <th className="pb-2 text-center">Within Range</th>
                  <th className="pb-2 text-right">Accuracy %</th>
                  <th className="pb-2 text-right">Avg Dev %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {predictionAccuracy?.crop_breakdown &&
                  Object.entries(predictionAccuracy.crop_breakdown).map(([crop, data]) => (
                    <tr key={crop} className="hover:bg-stone-50">
                      <td className="py-2.5 font-bold text-stone-900">{crop}</td>
                      <td className="py-2.5 text-center font-mono text-stone-600">{data.total}</td>
                      <td className="py-2.5 text-center font-mono text-green-700 font-bold">{data.within_range}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-stone-900">
                        <span className={clsx('px-2 py-0.5 rounded-full text-[11px]', data.accuracy_pct >= 60 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800')}>
                          {data.accuracy_pct}%
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-stone-600">{data.avg_deviation_pct}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
              <MapPin size={16} className="text-teal-600" /> Accuracy by District
            </h3>
            <span className="text-[11px] text-stone-400 font-medium">Regional Generalization</span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 font-bold uppercase text-[10px]">
                  <th className="pb-2">District</th>
                  <th className="pb-2 text-center">Seasons</th>
                  <th className="pb-2 text-center">Within Range</th>
                  <th className="pb-2 text-right">Accuracy %</th>
                  <th className="pb-2 text-right">Avg Dev %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {predictionAccuracy?.district_breakdown &&
                  Object.entries(predictionAccuracy.district_breakdown).map(([district, data]) => (
                    <tr key={district} className="hover:bg-stone-50">
                      <td className="py-2.5 font-bold text-stone-900">{district}</td>
                      <td className="py-2.5 text-center font-mono text-stone-600">{data.total}</td>
                      <td className="py-2.5 text-center font-mono text-green-700 font-bold">{data.within_range}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-stone-900">
                        <span className={clsx('px-2 py-0.5 rounded-full text-[11px]', data.accuracy_pct >= 60 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800')}>
                          {data.accuracy_pct}%
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-stone-600">{data.avg_deviation_pct}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export const predictionAccuracyMeta = { icon: TrendingUp, label: 'AI Profit Validation' }
