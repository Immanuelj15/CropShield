import { useEffect, useState } from 'react'
import { Sliders, Save, RefreshCw } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import { apiFetch } from '../../utils/http'

// Contract 11: risk-score boundaries (0–100) persisted by the backend.
//   score <= low_max           → Low
//   low_max < score <= medium_max → Medium
//   score >  medium_max        → High
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

export default function AdminThresholds() {
  const toast = useToast()
  const [lowMax, setLowMax] = useState('')
  const [mediumMax, setMediumMax] = useState('')
  const [saved, setSaved] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch('/admin/thresholds')
      setLowMax(String(data?.low_max ?? ''))
      setMediumMax(String(data?.medium_max ?? ''))
      setSaved(data)
    } catch (e) {
      console.error(e)
      setLoadError(e.message || 'Could not load thresholds.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const validationError = validate(lowMax, mediumMax)
  const dirty = saved && (Number(lowMax) !== Number(saved.low_max) || Number(mediumMax) !== Number(saved.medium_max))

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
      toast.success('Risk thresholds saved.')
    } catch (err) {
      toast.error(err.message || 'Failed to save thresholds.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Alert Sensitivity & Escalation Configuration</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Risk-score boundaries (0–100) used by inference to classify Low / Medium / High risk.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50" title="Reload">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loadError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</p>
      )}

      <form onSubmit={handleSave} className="space-y-4 text-xs">
        <label className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between gap-4">
          <div>
            <span className="font-bold text-stone-900 block">Low risk upper boundary (low_max)</span>
            <span className="text-stone-500">Scores at or below this are Low risk</span>
          </div>
          <input
            type="number" min="0" max="100" step="any"
            value={lowMax}
            onChange={(e) => setLowMax(e.target.value)}
            disabled={loading || !!loadError}
            className="w-24 p-2 rounded-lg border border-stone-200 text-right font-black text-amber-700"
          />
        </label>

        <label className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between gap-4">
          <div>
            <span className="font-bold text-stone-900 block">Medium risk upper boundary (medium_max)</span>
            <span className="text-stone-500">Scores above this are High risk (immediate alerts)</span>
          </div>
          <input
            type="number" min="0" max="100" step="any"
            value={mediumMax}
            onChange={(e) => setMediumMax(e.target.value)}
            disabled={loading || !!loadError}
            className="w-24 p-2 rounded-lg border border-stone-200 text-right font-black text-red-600"
          />
        </label>

        {validationError && !loading && !loadError && (
          <p className="text-xs text-red-700 font-semibold">{validationError}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || loading || !!loadError || !!validationError || !dirty}
            className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save thresholds'}
          </button>
        </div>
      </form>
    </div>
  )
}

export const thresholdsMeta = { icon: Sliders, label: 'Alert Thresholds' }
