import { useState, useEffect, useCallback, useMemo } from 'react'
import { Database, Plus, Trash2, RefreshCw, Search } from 'lucide-react'
import clsx from 'clsx'
import { useLocalizedField, getLocalizedText } from '../../utils/useLocalizedField'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const LANGS = ['en', 'ta', 'hi', 'te', 'ml']
const CROPS = ['Cotton', 'Rice', 'Sugarcane', 'Millets', 'Pulses', 'Sorghum']

const EMPTY_FORM = {
  pest_or_disease: '', crop_type: 'Cotton', season: 'All', symptoms: '',
  organic_treatment: '', chemical_treatment: '', prevention: '',
  favorable_temp_min: '', favorable_temp_max: '', favorable_rh_min: '', favorable_rh_max: '',
  treatment_cost_per_acre: '', treatment_effectiveness_pct: '75', cost_source_note: '',
}

const optNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

function validate(f) {
  const e = {}
  if (!f.pest_or_disease.trim()) e.pest_or_disease = 'Pest or disease name is required.'
  const nums = ['favorable_temp_min', 'favorable_temp_max', 'favorable_rh_min', 'favorable_rh_max', 'treatment_cost_per_acre', 'treatment_effectiveness_pct']
  nums.forEach((k) => { if (f[k] !== '' && !Number.isFinite(Number(f[k]))) e[k] = 'Must be a number.' })
  if (!e.favorable_temp_min && !e.favorable_temp_max && f.favorable_temp_min !== '' && f.favorable_temp_max !== '' && Number(f.favorable_temp_min) > Number(f.favorable_temp_max)) e.favorable_temp_max = 'Max must be ≥ min.'
  if (!e.favorable_rh_min && !e.favorable_rh_max && f.favorable_rh_min !== '' && f.favorable_rh_max !== '' && Number(f.favorable_rh_min) > Number(f.favorable_rh_max)) e.favorable_rh_max = 'Max must be ≥ min.'
  ;['favorable_rh_min', 'favorable_rh_max'].forEach((k) => { if (!e[k] && f[k] !== '' && (Number(f[k]) < 0 || Number(f[k]) > 100)) e[k] = '0–100 %.' })
  if (!e.treatment_cost_per_acre && f.treatment_cost_per_acre !== '' && Number(f.treatment_cost_per_acre) < 0) e.treatment_cost_per_acre = 'Cannot be negative.'
  if (!e.treatment_effectiveness_pct && f.treatment_effectiveness_pct !== '' && (Number(f.treatment_effectiveness_pct) < 0 || Number(f.treatment_effectiveness_pct) > 100)) e.treatment_effectiveness_pct = '0–100 %.'
  return e
}

function Field({ id, label, error, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

export default function AdminPests() {
  const { currentLang } = useLocalizedField()
  const toast = useToast()
  const [pests, setPests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch('/admin/pests-diseases')
      setPests(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e.message || 'Could not load the knowledge base.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pests
      .map((p) => ({
        ...p,
        _name: getLocalizedText(p.pest_or_disease, currentLang),
        _crop: getLocalizedText(p.crop_type, currentLang),
        _organic: getLocalizedText(p.organic_treatment, currentLang),
        _chemical: getLocalizedText(p.chemical_treatment, currentLang),
      }))
      .filter((p) => !q || `${p._name} ${p._crop}`.toLowerCase().includes(q))
  }, [pests, query, currentLang])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleCreate = async (e) => {
    e.preventDefault()
    if (saving) return
    const v = validate(form)
    setErrors(v)
    if (Object.keys(v).length) return
    setSaving(true)
    try {
      const eff = optNum(form.treatment_effectiveness_pct)
      await apiFetch('/admin/pests-diseases', {
        method: 'POST',
        json: {
          pest_or_disease: { en: form.pest_or_disease.trim() },
          crop_type: form.crop_type,
          season: form.season.trim() || 'All',
          symptoms: form.symptoms.split(/\n|,/).map((s) => s.trim()).filter(Boolean),
          organic_treatment: form.organic_treatment.trim() ? { en: form.organic_treatment.trim() } : null,
          chemical_treatment: form.chemical_treatment.trim() ? { en: form.chemical_treatment.trim() } : null,
          prevention: form.prevention.trim() ? { en: form.prevention.trim() } : null,
          favorable_temp_min: optNum(form.favorable_temp_min),
          favorable_temp_max: optNum(form.favorable_temp_max),
          favorable_rh_min: optNum(form.favorable_rh_min),
          favorable_rh_max: optNum(form.favorable_rh_max),
          treatment_cost_per_acre: optNum(form.treatment_cost_per_acre),
          // Backend stores effectiveness as a 0–1 fraction (default 0.75)
          treatment_effectiveness_pct: eff === null ? 0.75 : eff / 100,
          cost_source_note: form.cost_source_note.trim() || null,
        },
      })
      toast.success(`${form.pest_or_disease.trim()} added to the knowledge base.`)
      setFormOpen(false)
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      toast.error(err.message || 'Could not save the record.')
    } finally {
      setSaving(false)
    }
  }

  const runDelete = async () => {
    const target = confirmTarget
    if (!target) return
    setConfirmTarget(null)
    try {
      await apiFetch(`/admin/pests-diseases/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      toast.success(`${target.name} deleted.`)
      load()
    } catch (err) {
      toast.error(err.message || 'Could not delete the record.')
    }
  }

  return (
    <div className="card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Pest & disease knowledge base</h2>
          <p className="text-sm text-stone-600">Pest taxonomy, treatment recommendations and treatment costs used by the economic engine.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading} aria-label="Refresh knowledge base"
            className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}>
            <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
          </button>
          <Button type="button" icon={Plus} onClick={() => { setForm(EMPTY_FORM); setErrors({}); setFormOpen(true) }} className={FOCUS}>
            Add record
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pest or crop"
          aria-label="Search knowledge base" className="input-field text-sm py-2.5 pl-9" />
      </div>

      {loading && pests.length === 0 ? (
        <LoadingState message="Loading knowledge base…" />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Database} title={pests.length ? 'No matches' : 'Knowledge base is empty'}
          message={pests.length ? 'Try a different search.' : 'Add the first pest or disease record.'} />
      ) : (
        <div className="overflow-x-auto -mx-5 sm:mx-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500 uppercase font-bold">
              <tr>
                <th scope="col" className="p-3">Pest / pathogen</th>
                <th scope="col" className="p-3">Crop</th>
                <th scope="col" className="p-3">Organic recommendation</th>
                <th scope="col" className="p-3">Chemical recommendation</th>
                <th scope="col" className="p-3">Cost / acre</th>
                <th scope="col" className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((p) => {
                const availableLangs = LANGS.filter((code) => (
                  typeof p.pest_or_disease === 'object' && p.pest_or_disease !== null ? Boolean(p.pest_or_disease[code]) : code === 'en'
                ))
                return (
                  <tr key={p.id} className="hover:bg-stone-50 transition-colors align-top">
                    <td className="p-3">
                      <span className="font-semibold text-stone-900 block">{p._name || '—'}</span>
                      <div className="flex flex-wrap items-center gap-1 mt-1" aria-label={`Translations: ${availableLangs.join(', ').toUpperCase()}`}>
                        {LANGS.map((code) => (
                          <span key={code} className={clsx(
                            'text-xs uppercase px-1 rounded font-mono font-bold border',
                            availableLangs.includes(code) ? 'bg-green-100 text-green-800 border-green-200' : 'bg-stone-100 text-stone-500 border-stone-200'
                          )}>
                            {code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-brand-700 whitespace-nowrap">{p._crop || '—'}</td>
                    <td className="p-3 text-stone-600 max-w-xs"><span className="line-clamp-2" title={p._organic || ''}>{p._organic || '—'}</span></td>
                    <td className="p-3 text-stone-600 max-w-xs"><span className="line-clamp-2" title={p._chemical || ''}>{p._chemical || '—'}</span></td>
                    <td className="p-3 text-stone-700 whitespace-nowrap">
                      {Number.isFinite(Number(p.treatment_cost_per_acre)) && p.treatment_cost_per_acre !== null
                        ? `₹${Number(p.treatment_cost_per_acre).toLocaleString('en-IN')}`
                        : '—'}
                    </td>
                    <td className="p-3 text-right">
                      <button type="button" onClick={() => setConfirmTarget({ id: p.id, name: p._name || 'This record' })}
                        aria-label={`Delete ${p._name || 'record'}`}
                        className={clsx('p-2 hover:bg-red-50 text-stone-500 hover:text-red-600 rounded-lg transition-colors', FOCUS)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-stone-500">
        Multi-language advisories (Tamil, Hindi, Telugu, Malayalam) can be published from the “Upload Advisory” section.
      </p>

      <Modal isOpen={formOpen} onClose={() => !saving && setFormOpen(false)} title="Add pest or disease record" size="lg">
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="pd-name" label="Pest / disease name (English) *" error={errors.pest_or_disease} className="sm:col-span-3">
              <input id="pd-name" className="input-field text-sm py-2.5" value={form.pest_or_disease} onChange={set('pest_or_disease')}
                placeholder="e.g. Cotton Whitefly (Bemisia tabaci)" />
            </Field>
            <Field id="pd-crop" label="Crop">
              <select id="pd-crop" className="input-field text-sm py-2.5" value={form.crop_type} onChange={set('crop_type')}>
                {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field id="pd-season" label="Season">
              <input id="pd-season" className="input-field text-sm py-2.5" value={form.season} onChange={set('season')} placeholder="All / Kharif / Rabi" />
            </Field>
            <Field id="pd-eff" label="Treatment effectiveness (%)" error={errors.treatment_effectiveness_pct}>
              <input id="pd-eff" type="number" min="0" max="100" step="any" className="input-field text-sm py-2.5" value={form.treatment_effectiveness_pct} onChange={set('treatment_effectiveness_pct')} />
            </Field>
            <Field id="pd-symptoms" label="Symptoms (one per line)" className="sm:col-span-3">
              <textarea id="pd-symptoms" rows={2} className="input-field text-sm resize-none" value={form.symptoms} onChange={set('symptoms')} />
            </Field>
            <Field id="pd-organic" label="Organic / bio-control treatment" className="sm:col-span-3">
              <textarea id="pd-organic" rows={2} className="input-field text-sm resize-none" value={form.organic_treatment} onChange={set('organic_treatment')} />
            </Field>
            <Field id="pd-chemical" label="Chemical treatment" className="sm:col-span-3">
              <textarea id="pd-chemical" rows={2} className="input-field text-sm resize-none" value={form.chemical_treatment} onChange={set('chemical_treatment')} />
            </Field>
            <Field id="pd-prevention" label="Prevention" className="sm:col-span-3">
              <textarea id="pd-prevention" rows={2} className="input-field text-sm resize-none" value={form.prevention} onChange={set('prevention')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field id="pd-tmin" label="Temp min (°C)" error={errors.favorable_temp_min}>
              <input id="pd-tmin" type="number" step="any" className="input-field text-sm py-2.5" value={form.favorable_temp_min} onChange={set('favorable_temp_min')} />
            </Field>
            <Field id="pd-tmax" label="Temp max (°C)" error={errors.favorable_temp_max}>
              <input id="pd-tmax" type="number" step="any" className="input-field text-sm py-2.5" value={form.favorable_temp_max} onChange={set('favorable_temp_max')} />
            </Field>
            <Field id="pd-rhmin" label="RH min (%)" error={errors.favorable_rh_min}>
              <input id="pd-rhmin" type="number" min="0" max="100" step="any" className="input-field text-sm py-2.5" value={form.favorable_rh_min} onChange={set('favorable_rh_min')} />
            </Field>
            <Field id="pd-rhmax" label="RH max (%)" error={errors.favorable_rh_max}>
              <input id="pd-rhmax" type="number" min="0" max="100" step="any" className="input-field text-sm py-2.5" value={form.favorable_rh_max} onChange={set('favorable_rh_max')} />
            </Field>
            <Field id="pd-cost" label="Treatment cost (₹/acre)" error={errors.treatment_cost_per_acre}>
              <input id="pd-cost" type="number" min="0" step="any" className="input-field text-sm py-2.5" value={form.treatment_cost_per_acre} onChange={set('treatment_cost_per_acre')} />
            </Field>
            <Field id="pd-costsrc" label="Cost source" className="col-span-2 sm:col-span-3">
              <input id="pd-costsrc" className="input-field text-sm py-2.5" value={form.cost_source_note} onChange={set('cost_source_note')} placeholder="e.g. TNAU Agritech price list 2024" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)} disabled={saving} className={FOCUS}>Cancel</Button>
            <Button type="submit" loading={saving} className={FOCUS}>Save record</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmTarget}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={runDelete}
        title="Delete this record?"
        message={confirmTarget ? `${confirmTarget.name} will be permanently removed from the knowledge base and farmer advisories.` : ''}
        confirmLabel="Delete"
      />
    </div>
  )
}

export const pestsMeta = { icon: Database, label: 'Pest & Disease DB' }
