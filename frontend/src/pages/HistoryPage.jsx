import { useState, useEffect, useCallback } from 'react'
import { Clock, RefreshCw, Filter, AlertTriangle, CheckCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getHistory } from '../utils/api'
import { RiskBadge, LoadingState, ErrorState } from '../components'

const CROPS      = ['All', 'Cotton', 'Sorghum', 'Millets', 'Rice', 'Sugarcane', 'Pulses']
const RISK_COLORS = { Low: '#16a34a', Medium: '#d97706', High: '#dc2626' }

export default function HistoryPage() {
  const [items,   setItems]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [crop,    setCrop]    = useState('All')
  const [page,    setPage]    = useState(0)
  const limit = 15

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = { limit, offset: page * limit }
      if (crop !== 'All') params.crop = crop
      const res = await getHistory(params)
      setItems(res.items); setTotal(res.total)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [crop, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)
  const highCount  = items.filter(p => p.risk_level === 'High').length
  const warnCount  = items.filter(p => p.is_warning).length

  const chartData = (() => {
    const g = items.reduce((a, p) => {
      a[p.risk_level] = (a[p.risk_level] || 0) + 1
      return a
    }, {})
    return Object.entries(g).map(([level, count]) => ({ level, count }))
  })()

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900 flex items-center gap-3">
            <Clock className="text-stone-600" size={28} /> Warning History
          </h1>
          <p className="text-stone-600 mt-1">{total} warnings on record</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm px-4 py-2">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Warnings', value: total,     Icon: Clock,         color: 'text-stone-600' },
          { label: 'Active Warnings', value: warnCount, Icon: AlertTriangle,  color: 'text-amber-600' },
          { label: 'High Risk',       value: highCount,  Icon: AlertTriangle,  color: 'text-red-600' },
          { label: 'Safe Days',       value: items.filter(p => p.risk_level === 'Low').length,
            Icon: CheckCircle, color: 'text-green-600' },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="card p-4">
            <div className={`mb-2 ${color}`}><Icon size={18} /></div>
            <p className="text-2xl font-display font-bold text-stone-900">{value}</p>
            <p className="text-xs text-stone-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter + Chart */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={15} className="text-stone-500" />
            <span className="font-semibold text-stone-700 text-sm">Filter by Crop</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {CROPS.map(c => (
              <button key={c} onClick={() => { setCrop(c); setPage(0) }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  crop === c
                    ? 'bg-leaf-600 text-white border-leaf-600'
                    : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                }`}>{c}</button>
            ))}
          </div>
        </div>

        <div className="card p-5 md:col-span-2">
          <h3 className="font-semibold text-stone-700 text-sm mb-3">Risk Distribution (current page)</h3>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <XAxis dataKey="level" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={RISK_COLORS[d.level] || '#888'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      {loading ? <LoadingState message="Loading history…" /> : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  {['#', 'Date', 'Crop', 'Location', 'Zone', 'Risk Score', 'Level', 'Warning'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-stone-600 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-stone-500 py-12">No warnings yet.</td></tr>
                )}
                {items.map(p => (
                  <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-stone-400">{p.id}</td>
                    <td className="px-4 py-3 text-stone-700 font-medium whitespace-nowrap">
                      {String(p.warning_date)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-stone-800">{p.crop}</td>
                    <td className="px-4 py-3 text-stone-600">{p.location}</td>
                    <td className="px-4 py-3 text-stone-500 text-xs">{p.climate_zone || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-stone-200 rounded-full h-1.5 flex-shrink-0">
                          <div className="h-1.5 rounded-full"
                            style={{ width: `${Math.round(p.risk_score * 100)}%`,
                                     background: RISK_COLORS[p.risk_level] || '#888' }} />
                        </div>
                        <span className="font-mono text-xs">{Math.round(p.risk_score * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><RiskBadge level={p.risk_level} /></td>
                    <td className="px-4 py-3">
                      {p.is_warning
                        ? <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"><AlertTriangle size={10} /> Active</span>
                        : <span className="text-xs text-stone-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 bg-stone-50">
              <p className="text-xs text-stone-500">Page {page + 1} of {totalPages}</p>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 disabled:opacity-40 hover:bg-stone-100">← Prev</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 disabled:opacity-40 hover:bg-stone-100">Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
