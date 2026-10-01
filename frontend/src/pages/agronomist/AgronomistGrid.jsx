import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import DemoDataBadge from '../../components/ui/DemoDataBadge'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch, isAbortError } from '../../utils/http'

export default function AgronomistGrid() {
  const [riskGrid, setRiskGrid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const controllerRef = useRef(null)

  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/outbreak/regional-grid', { signal: controller.signal })
      if (!controller.signal.aborted) setRiskGrid(data)
    } catch (e) {
      if (isAbortError(e)) return
      setError(e.message || 'Could not load the regional grid.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    return () => controllerRef.current?.abort()
  }, [load])

  const clusters = Array.isArray(riskGrid?.clusters) ? riskGrid.clusters : []

  return (
    <div className="card p-5 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900 flex flex-wrap items-center gap-2">
          Regional 5 km risk grid
          <DemoDataBadge show={!!riskGrid?.simulated} />
        </h2>
        <p className="text-sm text-stone-600 mt-0.5">
          Clusters of high and medium risk cases across Tamil Nadu agro-climatic zones.
        </p>
        {riskGrid?.simulated && (
          <p className="text-xs text-amber-800 mt-2">
            These clusters are static examples, not computed from live predictions.
          </p>
        )}
      </div>

      {loading && !riskGrid ? (
        <LoadingState message="Loading regional grid…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : clusters.length === 0 ? (
        <EmptyState icon={MapPin} title="No clusters" message="No regional risk clusters to show yet." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clusters.map((c) => (
            <div key={c.cluster_id} className="p-5 rounded-2xl border border-stone-200 bg-stone-50 space-y-3 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">{c.district}</span>
                  <h4 className="font-bold text-stone-900 text-sm break-words">{c.center_name}</h4>
                </div>
                <Badge status={c.risk_level}>{c.risk_level}</Badge>
              </div>

              <dl className="text-xs space-y-1 text-stone-600">
                <div><dt className="inline font-semibold text-stone-700">Primary threat: </dt><dd className="inline">{c.dominant_threat}</dd></div>
                <div><dt className="inline font-semibold text-stone-700">Monitored farms: </dt><dd className="inline">{c.active_farms ?? '—'} within {c.radius_km ?? 5} km</dd></div>
                <div><dt className="inline font-semibold text-stone-700">Average risk: </dt><dd className="inline">{Number.isFinite(Number(c.average_risk_score)) ? `${Math.round(Number(c.average_risk_score) * 100)}%` : '—'}</dd></div>
              </dl>

              {c.alert_status && (
                <div className="pt-2 border-t border-stone-200 text-xs font-semibold text-stone-700">
                  Status: {c.alert_status}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const gridMeta = { icon: MapPin, label: 'Regional 5km Risk Grid' }
