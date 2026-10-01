import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, RefreshCw, Sprout, MapPin } from 'lucide-react'
import clsx from 'clsx'
import StatCard from '../../components/ui/StatCard'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const pctText = (v) => (Number.isFinite(Number(v)) && v !== null ? `${v}%` : '—')

function BreakdownTable({ title, icon: Icon, firstCol, data }) {
  const rows = data && typeof data === 'object' ? Object.entries(data) : []
  return (
    <div className="card p-5 space-y-4 min-w-0">
      <h3 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
        <Icon size={18} className="text-brand-600" /> {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">No validated seasons yet.</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-stone-200 text-stone-500 font-bold uppercase text-xs">
                <th scope="col" className="pb-2">{firstCol}</th>
                <th scope="col" className="pb-2 text-center">Seasons</th>
                <th scope="col" className="pb-2 text-center">Within range</th>
                <th scope="col" className="pb-2 text-right">Accuracy</th>
                <th scope="col" className="pb-2 text-right">Avg deviation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map(([key, d]) => (
                <tr key={key} className="hover:bg-stone-50">
                  <td className="py-2.5 font-semibold text-stone-900">{key}</td>
                  <td className="py-2.5 text-center font-mono text-stone-600">{d?.total ?? '—'}</td>
                  <td className="py-2.5 text-center font-mono text-green-700 font-bold">{d?.within_range ?? '—'}</td>
                  <td className="py-2.5 text-right">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-bold', Number(d?.accuracy_pct) >= 60 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800')}>
                      {pctText(d?.accuracy_pct)}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono text-stone-600">{pctText(d?.avg_deviation_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AdminPredictionAccuracy() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await apiFetch('/admin/prediction-accuracy'))
    } catch (e) {
      setError(e.message || 'Could not load prediction accuracy.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Pre-season vs actual</span>
          <h2 className="text-xl font-bold text-stone-900 mt-1">Crop profit prediction accuracy</h2>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Computed from farmer-logged expenses and harvest revenue. A season is <strong>accurate</strong> when the actual net
            profit falls inside the predicted [min, max] range. Non-production servers also include seeded demo P&L data.
          </p>
        </div>
        <Button type="button" variant="secondary" icon={RefreshCw} loading={loading} onClick={load} className="self-start md:self-auto">
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="card p-5"><LoadingState message="Loading accuracy metrics…" /></div>
      ) : error && !data ? (
        <div className="card p-5"><ErrorState message={error} onRetry={load} /></div>
      ) : !data || !data.total_seasons ? (
        <EmptyState icon={TrendingUp} title="No validated seasons yet" message="Accuracy appears once farmers log both expenses and harvest revenue for a season." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard accent="brand" label="Accuracy rate" value={pctText(data.accuracy_rate_pct)} trend="Within predicted range" />
            <StatCard accent="amber" label="Average deviation" value={pctText(data.average_deviation_pct)} trend="Mean absolute error" />
            <StatCard label="Validated seasons" value={data.total_seasons ?? '—'} trend="Farmer-logged seasons" />
            <StatCard accent="sky" label="In-range outcomes" value={data.within_range_count ?? '—'} trend="Predicted accurately" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownTable title="Accuracy by crop" icon={Sprout} firstCol="Crop" data={data.crop_breakdown} />
            <BreakdownTable title="Accuracy by district" icon={MapPin} firstCol="District" data={data.district_breakdown} />
          </div>
        </>
      )}
    </div>
  )
}

export const predictionAccuracyMeta = { icon: TrendingUp, label: 'AI Profit Validation' }
