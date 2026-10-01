import { useEffect, useState, useCallback } from 'react'
import { Sliders, Save, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import Toggle from '../../components/ui/Toggle'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

// Risk-score boundaries (0–100) persisted by the backend (GET/PUT /admin/thresholds).
//   score <= low_max              → Low
//   low_max < score <= medium_max → Medium
//   score >  medium_max           → High
function validate(lowMax, mediumMax) {
  const low = Number(lowMax)
  const med = Number(mediumMax)
  if (lowMax === '' || mediumMax === '' || !Number.isFinite(low) || !Number.isFinite(med)) {
    return 'Both thresholds are required numbers.'
  }
  if (!(low > 0)) return 'Low boundary must be greater than 0.'
  if (!(med < 100)) return 'Medium boundary must be less than 100.'
  if (!(low < med)) return 'Low boundary must be lower than the Medium boundary.'
  return null
}

// Notification settings live on the legacy /admin/alert-thresholds endpoint
// (radius 1–25 km, frequency 1–48 h). Only these fields are sent so the risk boundaries are untouched.
function validateAlerts(a) {
  const r = Number(a.haversine_cluster_radius_km)
  const h = Number(a.notification_frequency_hours)
  if (a.haversine_cluster_radius_km === '' || !Number.isFinite(r) || r < 1 || r > 25) return 'Alert radius must be between 1 and 25 km.'
  if (a.notification_frequency_hours === '' || !Number.isInteger(h) || h < 1 || h > 48) return 'Notification frequency must be a whole number between 1 and 48 hours.'
  return null
}

export default function AdminThresholds() {
  const toast = useToast()
  const [lowMax, setLowMax] = useState('')
  const [mediumMax, setMediumMax] = useState('')
  const [saved, setSaved] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [savedAlerts, setSavedAlerts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAlerts, setSavingAlerts] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [data, legacy] = await Promise.all([
        apiFetch('/admin/thresholds'),
        apiFetch('/admin/alert-thresholds'),
      ])
      setLowMax(String(data?.low_max ?? ''))
      setMediumMax(String(data?.medium_max ?? ''))
      setSaved(data)
      const a = {
        haversine_cluster_radius_km: String(legacy?.haversine_cluster_radius_km ?? 5),
        notification_frequency_hours: String(legacy?.notification_frequency_hours ?? 12),
        preemptive_alert_enabled: legacy?.preemptive_alert_enabled !== false,
      }
      setAlerts(a)
      setSavedAlerts(a)
    } catch (e) {
      setLoadError(e.message || 'Could not load thresholds.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const validationError = validate(lowMax, mediumMax)
  const dirty = saved && (Number(lowMax) !== Number(saved.low_max) || Number(mediumMax) !== Number(saved.medium_max))
  const alertsError = alerts ? validateAlerts(alerts) : null
  const alertsDirty = alerts && savedAlerts && JSON.stringify(alerts) !== JSON.stringify(savedAlerts)

  const handleSave = async (e) => {
    e.preventDefault()
    if (saving || validationError) return
    setSaving(true)
    try {
      const data = await apiFetch('/admin/thresholds', {
        method: 'PUT',
        json: { low_max: Number(lowMax), medium_max: Number(mediumMax) },
      })
      const next = data && data.low_max !== undefined ? data : { low_max: Number(lowMax), medium_max: Number(mediumMax) }
      setSaved(next)
      setLowMax(String(next.low_max))
      setMediumMax(String(next.medium_max))
      toast.success('Risk thresholds saved. Live predictions use them immediately.')
    } catch (err) {
      toast.error(err.message || 'Failed to save thresholds.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAlerts = async (e) => {
    e.preventDefault()
    if (savingAlerts || alertsError) return
    setSavingAlerts(true)
    try {
      const data = await apiFetch('/admin/alert-thresholds', {
        method: 'PUT',
        json: {
          haversine_cluster_radius_km: Number(alerts.haversine_cluster_radius_km),
          notification_frequency_hours: Number(alerts.notification_frequency_hours),
          preemptive_alert_enabled: !!alerts.preemptive_alert_enabled,
        },
      })
      const cur = data?.current_thresholds
      const next = cur
        ? {
          haversine_cluster_radius_km: String(cur.haversine_cluster_radius_km),
          notification_frequency_hours: String(cur.notification_frequency_hours),
          preemptive_alert_enabled: cur.preemptive_alert_enabled !== false,
        }
        : alerts
      setAlerts(next)
      setSavedAlerts(next)
      toast.success('Alert settings saved.')
    } catch (err) {
      toast.error(err.message || 'Failed to save alert settings.')
    } finally {
      setSavingAlerts(false)
    }
  }

  if (loading && !saved) return <div className="card p-5"><LoadingState message="Loading thresholds…" /></div>
  if (loadError && !saved) return <div className="card p-5"><ErrorState message={loadError} onRetry={load} /></div>

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="card p-5 sm:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Risk level boundaries</h2>
            <p className="text-sm text-stone-600 mt-0.5">
              Risk-score boundaries (0–100) that classify predictions as Low, Medium or High.
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} aria-label="Reload thresholds"
            className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-sm" noValidate>
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label htmlFor="th-low" className="min-w-0">
              <span className="font-semibold text-stone-900 block">Low risk upper boundary</span>
              <span className="text-xs text-stone-500">Scores at or below this are Low risk</span>
            </label>
            <input id="th-low" type="number" min="0" max="100" step="any" value={lowMax}
              onChange={(e) => setLowMax(e.target.value)} disabled={loading}
              className="input-field sm:w-28 py-2 text-right font-bold text-amber-700" />
          </div>

          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label htmlFor="th-med" className="min-w-0">
              <span className="font-semibold text-stone-900 block">Medium risk upper boundary</span>
              <span className="text-xs text-stone-500">Scores above this are High risk (immediate alerts)</span>
            </label>
            <input id="th-med" type="number" min="0" max="100" step="any" value={mediumMax}
              onChange={(e) => setMediumMax(e.target.value)} disabled={loading}
              className="input-field sm:w-28 py-2 text-right font-bold text-red-600" />
          </div>

          {validationError && <p className="text-xs text-red-600 font-medium" role="alert">{validationError}</p>}

          <div className="flex justify-end">
            <Button type="submit" icon={Save} loading={saving} disabled={loading || !!validationError || !dirty} className={FOCUS}>
              Save thresholds
            </Button>
          </div>
        </form>
      </div>

      {alerts && (
        <div className="card p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">Alert & notification rules</h2>
            <p className="text-sm text-stone-600 mt-0.5">Neighbour-alert radius, notification frequency and pre-emptive warnings.</p>
          </div>
          <form onSubmit={handleSaveAlerts} className="space-y-4 text-sm" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="al-radius" className="label">Alert radius (km)</label>
                <input id="al-radius" type="number" min="1" max="25" step="0.5" className="input-field text-sm py-2.5"
                  value={alerts.haversine_cluster_radius_km}
                  onChange={(e) => setAlerts({ ...alerts, haversine_cluster_radius_km: e.target.value })} />
                <p className="mt-1 text-xs text-stone-500">1–25 km</p>
              </div>
              <div>
                <label htmlFor="al-freq" className="label">Notification frequency (hours)</label>
                <input id="al-freq" type="number" min="1" max="48" step="1" className="input-field text-sm py-2.5"
                  value={alerts.notification_frequency_hours}
                  onChange={(e) => setAlerts({ ...alerts, notification_frequency_hours: e.target.value })} />
                <p className="mt-1 text-xs text-stone-500">1–48 hours</p>
              </div>
            </div>
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
              <Toggle
                checked={!!alerts.preemptive_alert_enabled}
                onChange={(v) => setAlerts({ ...alerts, preemptive_alert_enabled: v })}
                label={<span className="text-sm font-semibold text-stone-800">Pre-emptive neighbour warnings</span>}
              />
            </div>
            {alertsError && <p className="text-xs text-red-600 font-medium" role="alert">{alertsError}</p>}
            <div className="flex justify-end">
              <Button type="submit" icon={Save} loading={savingAlerts} disabled={!!alertsError || !alertsDirty} className={FOCUS}>
                Save alert rules
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export const thresholdsMeta = { icon: Sliders, label: 'Alert Thresholds' }
