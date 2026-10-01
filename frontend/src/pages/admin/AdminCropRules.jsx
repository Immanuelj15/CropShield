import { useState, useEffect, useCallback } from 'react'
import { Sprout, Scale, Coins, Droplets, Layers, AlertTriangle, Plus, Trash2, Pencil, Save, X } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const INPUT = 'input-field text-sm py-2.5'
const MIN_SOURCE = 5 // backend source_note min_length
const STAGES = ['Initial', 'Development', 'Mid-season', 'Late-season']
const COST_FIELDS = ['seeds', 'fertilizer', 'labor', 'irrigation', 'pesticides']

const EMPTY_RULE = {
  crop_type: '', suitable_soil_types: 'Red Sandy Loam, Black Cotton Soil', water_requirement: 'Medium',
  suitable_seasons: 'Kharif, Rabi', base_yield_per_acre_kg: '600', yield_variance_pct: '20',
  avoid_after_same_crop_seasons: '1', source_note: 'TNAU Crop Production Guide 2024 (agritech.tnau.ac.in)',
}
const EMPTY_COST = {
  crop_type: '', seeds: '2500', fertilizer: '6000', labor: '12000', irrigation: '4000', pesticides: '5000',
  source_note: 'CACP Cost of Cultivation of Principal Crops reports (desagri.gov.in)',
}
const EMPTY_WATER = {
  crop_type: '', source_note: 'FAO-56 Irrigation and Drainage Paper No. 56, Table 12',
  stages: STAGES.map((stage_name) => ({ stage_name, kc: '', duration_days: '' })),
}
const EMPTY_NUTRIENT = { crop_type: '', n: '', p: '', k: '', source_note: '', application_split: [] }

const idOf = (doc) => doc?.id || doc?._id
const sameCrop = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
const isNonNeg = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0
const rupees = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? `₹${Number(v).toLocaleString('en-IN')}` : '—')
const fixed = (v, d = 2) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v).toFixed(d) : '—')

function Field({ id, label, error, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label text-xs">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

function IconAction({ label, onClick, danger, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx('p-2 rounded-lg transition-colors text-stone-500', danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-stone-100 hover:text-stone-800', FOCUS)}
    >
      {children}
    </button>
  )
}

function TableState({ loading, error, onRetry, empty, colSpan, emptyText }) {
  if (loading) return <tr><td colSpan={colSpan}><LoadingState message="Loading…" /></td></tr>
  if (error) return <tr><td colSpan={colSpan}><ErrorState message={error} onRetry={onRetry} /></td></tr>
  if (empty) return <tr><td colSpan={colSpan} className="px-5 py-8 text-center text-sm text-stone-500">{emptyText}</td></tr>
  return null
}

function useCollection(path) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(path)
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message || 'Could not load data.')
    } finally {
      setLoading(false)
    }
  }, [path])
  useEffect(() => { load() }, [load])
  return { items, loading, error, load }
}

export default function AdminCropRules() {
  const toast = useToast()
  const [section, setSection] = useState('rules')
  const rules = useCollection('/crop-recommendation/rules')
  const costs = useCollection('/crop-recommendation/cost-templates')
  const water = useCollection('/irrigation/coefficients/all')
  const nutrients = useCollection('/fertilizer/requirements/all')

  const [ruleForm, setRuleForm] = useState(EMPTY_RULE)
  const [ruleEditId, setRuleEditId] = useState(null)
  const [ruleErrors, setRuleErrors] = useState({})
  const [costForm, setCostForm] = useState(EMPTY_COST)
  const [costEditId, setCostEditId] = useState(null)
  const [costErrors, setCostErrors] = useState({})
  const [waterForm, setWaterForm] = useState(EMPTY_WATER)
  const [waterEditing, setWaterEditing] = useState(false)
  const [waterErrors, setWaterErrors] = useState({})
  const [nutrientForm, setNutrientForm] = useState(EMPTY_NUTRIENT)
  const [nutrientEditing, setNutrientEditing] = useState(false)
  const [nutrientErrors, setNutrientErrors] = useState({})
  const [saving, setSaving] = useState(null) // 'rule' | 'cost' | 'water' | 'nutrient'
  const [confirmTarget, setConfirmTarget] = useState(null) // { type, id, label }

  // ── Suitability rules (POST create, PUT update) ─────────────
  const resetRule = () => { setRuleForm(EMPTY_RULE); setRuleEditId(null); setRuleErrors({}) }
  const editRule = (r) => {
    setRuleEditId(idOf(r))
    setRuleErrors({})
    setRuleForm({
      crop_type: r.crop_type || '',
      suitable_soil_types: (r.suitable_soil_types || []).join(', '),
      water_requirement: r.water_requirement || 'Medium',
      suitable_seasons: (r.suitable_seasons || []).join(', '),
      base_yield_per_acre_kg: String(r.base_yield_per_acre_kg ?? ''),
      yield_variance_pct: String(r.yield_variance_pct ?? ''),
      avoid_after_same_crop_seasons: String(r.avoid_after_same_crop_seasons ?? ''),
      source_note: r.source_note || '',
    })
  }
  const saveRule = async (e) => {
    e.preventDefault()
    if (saving) return
    const f = ruleForm
    const errs = {}
    if (!f.crop_type.trim()) errs.crop_type = 'Crop is required.'
    if (!splitList(f.suitable_soil_types).length) errs.suitable_soil_types = 'Add at least one soil type.'
    if (!splitList(f.suitable_seasons).length) errs.suitable_seasons = 'Add at least one season.'
    if (!isNonNeg(f.base_yield_per_acre_kg)) errs.base_yield_per_acre_kg = '≥ 0'
    if (!isNonNeg(f.yield_variance_pct)) errs.yield_variance_pct = '≥ 0'
    if (!isNonNeg(f.avoid_after_same_crop_seasons) || !Number.isInteger(Number(f.avoid_after_same_crop_seasons))) errs.avoid_after_same_crop_seasons = 'Whole number'
    if (f.source_note.trim().length < MIN_SOURCE) errs.source_note = 'A citable source (TNAU / ICAR) is required.'
    setRuleErrors(errs)
    if (Object.keys(errs).length) return
    const payload = {
      crop_type: f.crop_type.trim(),
      suitable_soil_types: splitList(f.suitable_soil_types),
      water_requirement: f.water_requirement,
      suitable_seasons: splitList(f.suitable_seasons),
      base_yield_per_acre_kg: Number(f.base_yield_per_acre_kg),
      yield_variance_pct: Number(f.yield_variance_pct),
      avoid_after_same_crop_seasons: Number(f.avoid_after_same_crop_seasons),
      source_note: f.source_note.trim(),
    }
    // Backend POST returns 409 for an existing crop → update that rule instead
    const targetId = ruleEditId || idOf(rules.items.find((r) => sameCrop(r.crop_type, payload.crop_type)))
    setSaving('rule')
    try {
      if (targetId) await apiFetch(`/crop-recommendation/rules/${encodeURIComponent(targetId)}`, { method: 'PUT', json: payload })
      else await apiFetch('/crop-recommendation/rules', { method: 'POST', json: payload })
      toast.success(`Suitability rule for ${payload.crop_type} ${targetId ? 'updated' : 'created'}.`)
      resetRule()
      rules.load()
    } catch (err) {
      toast.error(err.message || 'Failed to save rule.')
    } finally {
      setSaving(null)
    }
  }

  // ── Cost templates (POST create, PUT update) ────────────────
  const costTotal = COST_FIELDS.reduce((sum, k) => sum + (Number(costForm[k]) || 0), 0)
  const resetCost = () => { setCostForm(EMPTY_COST); setCostEditId(null); setCostErrors({}) }
  const editCost = (c) => {
    setCostEditId(idOf(c))
    setCostErrors({})
    const b = c.cost_breakdown_per_acre || {}
    setCostForm({
      crop_type: c.crop_type || '',
      ...Object.fromEntries(COST_FIELDS.map((k) => [k, String(b[k] ?? 0)])),
      source_note: c.source_note || '',
    })
  }
  const saveCost = async (e) => {
    e.preventDefault()
    if (saving) return
    const f = costForm
    const errs = {}
    if (!f.crop_type.trim()) errs.crop_type = 'Crop is required.'
    COST_FIELDS.forEach((k) => { if (!isNonNeg(f[k])) errs[k] = '≥ 0' })
    if (!Object.keys(errs).length && !(costTotal > 0)) errs.total = 'Total cost must be greater than 0.'
    if (f.source_note.trim().length < MIN_SOURCE) errs.source_note = 'A citable source (CACP / ICAR) is required.'
    setCostErrors(errs)
    if (Object.keys(errs).length) return
    const payload = {
      crop_type: f.crop_type.trim(),
      cost_breakdown_per_acre: Object.fromEntries(COST_FIELDS.map((k) => [k, Number(f[k])])),
      total_cost_per_acre: costTotal,
      source_note: f.source_note.trim(),
    }
    const targetId = costEditId || idOf(costs.items.find((c) => sameCrop(c.crop_type, payload.crop_type)))
    setSaving('cost')
    try {
      if (targetId) await apiFetch(`/crop-recommendation/cost-templates/${encodeURIComponent(targetId)}`, { method: 'PUT', json: payload })
      else await apiFetch('/crop-recommendation/cost-templates', { method: 'POST', json: payload })
      toast.success(`Cost template for ${payload.crop_type} ${targetId ? 'updated' : 'created'}.`)
      resetCost()
      costs.load()
    } catch (err) {
      toast.error(err.message || 'Failed to save cost template.')
    } finally {
      setSaving(null)
    }
  }

  // ── FAO-56 water coefficients (POST upserts by crop) ─────────
  const resetWater = () => { setWaterForm(EMPTY_WATER); setWaterEditing(false); setWaterErrors({}) }
  const editWater = (c) => {
    const stages = c.growth_stages || []
    setWaterEditing(true)
    setWaterErrors({})
    setWaterForm({
      crop_type: c.crop_type || '',
      source_note: c.source_note || '',
      stages: STAGES.map((name, i) => {
        const s = stages.find((x) => x.stage_name === name) || stages[i] || {}
        return { stage_name: name, kc: String(s.kc ?? ''), duration_days: String(s.duration_days ?? '') }
      }),
    })
  }
  const setStage = (i, key, value) => setWaterForm((f) => ({ ...f, stages: f.stages.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }))
  const saveWater = async (e) => {
    e.preventDefault()
    if (saving) return
    const f = waterForm
    const errs = {}
    if (!f.crop_type.trim()) errs.crop_type = 'Crop is required.'
    f.stages.forEach((s, i) => {
      if (!isNonNeg(s.kc) || Number(s.kc) > 3) errs[`kc${i}`] = 'Kc 0–3'
      if (!isNonNeg(s.duration_days) || !Number.isInteger(Number(s.duration_days))) errs[`d${i}`] = 'Whole days'
    })
    if (f.source_note.trim().length < MIN_SOURCE) errs.source_note = 'A citable source (e.g. FAO-56 Table 12) is required.'
    setWaterErrors(errs)
    if (Object.keys(errs).length) return
    setSaving('water')
    try {
      await apiFetch('/irrigation/coefficients', {
        method: 'POST',
        json: {
          crop_type: f.crop_type.trim(),
          growth_stages: f.stages.map((s) => ({ stage_name: s.stage_name, kc: Number(s.kc), duration_days: Number(s.duration_days) })),
          source_note: f.source_note.trim(),
        },
      })
      toast.success(`Water coefficients for ${f.crop_type.trim()} saved.`)
      resetWater()
      water.load()
    } catch (err) {
      toast.error(err.message || 'Failed to save water coefficients.')
    } finally {
      setSaving(null)
    }
  }

  // ── NPK requirements (POST upserts by crop) ──────────────────
  const resetNutrient = () => { setNutrientForm(EMPTY_NUTRIENT); setNutrientEditing(false); setNutrientErrors({}) }
  const editNutrient = (r) => {
    setNutrientEditing(true)
    setNutrientErrors({})
    setNutrientForm({
      crop_type: r.crop_type || '',
      n: String(r.n_required_kg_per_acre ?? ''),
      p: String(r.p_required_kg_per_acre ?? ''),
      k: String(r.k_required_kg_per_acre ?? ''),
      source_note: r.source_note || '',
      application_split: Array.isArray(r.application_split) ? r.application_split : [],
    })
  }
  const saveNutrient = async (e) => {
    e.preventDefault()
    if (saving) return
    const f = nutrientForm
    const errs = {}
    if (!f.crop_type.trim()) errs.crop_type = 'Crop is required.'
    ;['n', 'p', 'k'].forEach((k) => { if (!isNonNeg(f[k]) || Number(f[k]) > 10000) errs[k] = '0–10000' })
    if (f.source_note.trim().length < MIN_SOURCE) errs.source_note = 'Cite the ICAR handbook / TNAU bulletin (volume and year).'
    setNutrientErrors(errs)
    if (Object.keys(errs).length) return
    // Keep an existing stage split when updating the same crop
    const existing = nutrients.items.find((r) => sameCrop(r.crop_type, f.crop_type))
    const split = f.application_split.length ? f.application_split : (existing?.application_split || [])
    setSaving('nutrient')
    try {
      await apiFetch('/fertilizer/requirements', {
        method: 'POST',
        json: {
          crop_type: f.crop_type.trim(),
          n_required_kg_per_acre: Number(f.n),
          p_required_kg_per_acre: Number(f.p),
          k_required_kg_per_acre: Number(f.k),
          application_split: split,
          source_note: f.source_note.trim(),
        },
      })
      toast.success(`Nutrient requirement for ${f.crop_type.trim()} saved.`)
      resetNutrient()
      nutrients.load()
    } catch (err) {
      toast.error(err.message || 'Failed to save nutrient requirement.')
    } finally {
      setSaving(null)
    }
  }

  // ── Delete (all four collections) ───────────────────────────
  const runConfirmedDelete = async () => {
    const target = confirmTarget
    if (!target) return
    setConfirmTarget(null)
    const paths = {
      rule: ['/crop-recommendation/rules/', rules],
      cost: ['/crop-recommendation/cost-templates/', costs],
      water: ['/irrigation/coefficients/', water],
      nutrient: ['/fertilizer/requirements/', nutrients],
    }
    const [base, coll] = paths[target.type] || []
    if (!base) return
    try {
      await apiFetch(`${base}${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      toast.success(`Deleted ${target.label}.`)
      coll.load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete item.')
    }
  }

  const sections = [
    { key: 'rules', label: `Suitability rules (${rules.items.length})`, icon: Scale },
    { key: 'costs', label: `Cost templates (${costs.items.length})`, icon: Coins },
    { key: 'water', label: `FAO-56 water Kc (${water.items.length})`, icon: Droplets },
    { key: 'nutrients', label: `NPK requirements (${nutrients.items.length})`, icon: Layers },
  ]

  const formActions = (kind, editing, onCancel, label) => (
    <div className="flex flex-wrap items-end gap-2">
      <Button type="submit" icon={editing ? Save : Plus} loading={saving === kind} disabled={!!saving && saving !== kind} className={FOCUS}>
        {editing ? 'Update' : label}
      </Button>
      {editing && (
        <Button type="button" variant="secondary" icon={X} onClick={onCancel} className={FOCUS}>Cancel edit</Button>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-brand-50 text-brand-700 rounded-lg"><Sprout size={18} /></span>
            <h3 className="text-lg font-semibold text-stone-800">Pre-season crop rules & cost knowledge base</h3>
          </div>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Rules for {rules.items.length || 'the'} Tamil Nadu crops used to recommend crops and compute yield, cost and profit ranges.
            Every entry must cite an extension source (TNAU / ICAR / CACP / FAO).
          </p>
        </div>

        <div className="flex flex-wrap items-center bg-stone-100 p-1.5 rounded-2xl gap-1.5 border border-stone-200" role="tablist" aria-label="Knowledge base sections">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={section === key}
              onClick={() => setSection(key)}
              className={clsx(
                'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2',
                FOCUS,
                section === key ? 'bg-brand-600 text-white shadow-sm' : 'text-stone-600 hover:text-stone-900 hover:bg-white'
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {section === 'rules' && (
        <div className="space-y-6">
          <div className="card p-5 sm:p-6 space-y-4">
            <h4 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
              {ruleEditId ? <Pencil size={14} className="text-brand-600" /> : <Plus size={14} className="text-brand-600" />}
              <span>{ruleEditId ? `Edit suitability rule: ${ruleForm.crop_type}` : 'Add a suitability rule'}</span>
            </h4>
            <form onSubmit={saveRule} className="grid grid-cols-1 md:grid-cols-3 gap-4" noValidate>
              <Field id="cr-crop" label="Crop *" error={ruleErrors.crop_type}>
                <input id="cr-crop" type="text" maxLength={100} placeholder="e.g. Cotton, Paddy, Groundnut" value={ruleForm.crop_type}
                  onChange={(e) => setRuleForm({ ...ruleForm, crop_type: e.target.value })} className={INPUT} />
              </Field>
              <Field id="cr-water" label="Water requirement *">
                <select id="cr-water" value={ruleForm.water_requirement} onChange={(e) => setRuleForm({ ...ruleForm, water_requirement: e.target.value })} className={INPUT}>
                  <option value="Low">Low (drought-tolerant / rainfed)</option>
                  <option value="Medium">Medium (moderate irrigation)</option>
                  <option value="High">High (abundant water / wetland)</option>
                </select>
              </Field>
              <Field id="cr-seasons" label="Suitable seasons (comma-separated) *" error={ruleErrors.suitable_seasons}>
                <input id="cr-seasons" type="text" placeholder="Kharif, Rabi, Summer" value={ruleForm.suitable_seasons}
                  onChange={(e) => setRuleForm({ ...ruleForm, suitable_seasons: e.target.value })} className={INPUT} />
              </Field>
              <Field id="cr-soils" label="Suitable soil types (comma-separated) *" error={ruleErrors.suitable_soil_types} className="md:col-span-2">
                <input id="cr-soils" type="text" placeholder="Red Sandy Loam, Black Cotton Soil, Clay Loam" value={ruleForm.suitable_soil_types}
                  onChange={(e) => setRuleForm({ ...ruleForm, suitable_soil_types: e.target.value })} className={INPUT} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field id="cr-yield" label="Yield (kg/ac)" error={ruleErrors.base_yield_per_acre_kg}>
                  <input id="cr-yield" type="number" min="0" step="any" value={ruleForm.base_yield_per_acre_kg}
                    onChange={(e) => setRuleForm({ ...ruleForm, base_yield_per_acre_kg: e.target.value })} className={clsx(INPUT, 'px-2 font-mono')} />
                </Field>
                <Field id="cr-var" label="Variance ±%" error={ruleErrors.yield_variance_pct}>
                  <input id="cr-var" type="number" min="0" step="any" value={ruleForm.yield_variance_pct}
                    onChange={(e) => setRuleForm({ ...ruleForm, yield_variance_pct: e.target.value })} className={clsx(INPUT, 'px-2 font-mono')} />
                </Field>
                <Field id="cr-rot" label="Rotation gap" error={ruleErrors.avoid_after_same_crop_seasons}>
                  <input id="cr-rot" type="number" min="0" step="1" value={ruleForm.avoid_after_same_crop_seasons}
                    onChange={(e) => setRuleForm({ ...ruleForm, avoid_after_same_crop_seasons: e.target.value })} className={clsx(INPUT, 'px-2 font-mono')} />
                </Field>
              </div>
              <Field id="cr-src" label="Citable source *" error={ruleErrors.source_note} className="md:col-span-2">
                <input id="cr-src" type="text" placeholder="e.g. TNAU Agritech Portal 2024 / ICAR package of practices" value={ruleForm.source_note}
                  onChange={(e) => setRuleForm({ ...ruleForm, source_note: e.target.value })} className={INPUT} />
              </Field>
              {formActions('rule', !!ruleEditId, resetRule, 'Save rule')}
            </form>
            <p className="text-xs text-stone-500">Saving a crop that already has a rule updates the existing rule.</p>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-stone-800">Existing suitability rules ({rules.items.length})</h4>
              <span className="text-xs text-stone-500">Yield variance builds the min/max profit range</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3">Crop</th><th scope="col" className="px-5 py-3">Water</th><th scope="col" className="px-5 py-3">Seasons</th>
                    <th scope="col" className="px-5 py-3">Suitable soils</th><th scope="col" className="px-5 py-3">Base yield (kg/ac)</th>
                    <th scope="col" className="px-5 py-3">Source</th><th scope="col" className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <TableState loading={rules.loading && !rules.items.length} error={rules.error} onRetry={rules.load}
                    empty={!rules.items.length} colSpan={7} emptyText="No suitability rules yet." />
                  {!rules.error && rules.items.map((rule) => (
                    <tr key={idOf(rule)} className={clsx('hover:bg-stone-50 transition-colors', ruleEditId === idOf(rule) && 'bg-brand-50')}>
                      <td className="px-5 py-3.5 font-semibold text-stone-900">{rule.crop_type}</td>
                      <td className="px-5 py-3.5">
                        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-bold',
                          rule.water_requirement === 'Low' ? 'bg-amber-100 text-amber-800'
                            : rule.water_requirement === 'High' ? 'bg-sky-200 text-sky-900' : 'bg-sky-100 text-sky-800')}>
                          {rule.water_requirement}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {(rule.suitable_seasons || []).map((s) => (
                            <span key={s} className="px-1.5 py-0.5 bg-stone-100 text-stone-700 rounded text-xs font-semibold">{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs text-xs text-stone-600"><span className="line-clamp-2" title={(rule.suitable_soil_types || []).join(', ')}>{(rule.suitable_soil_types || []).join(', ')}</span></td>
                      <td className="px-5 py-3.5 font-mono whitespace-nowrap">
                        <span className="font-bold text-stone-900">{rule.base_yield_per_acre_kg}</span>
                        <span className="text-stone-500 text-xs ml-1">±{rule.yield_variance_pct}%</span>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs text-xs text-stone-600 italic"><span className="line-clamp-2" title={rule.source_note}>{rule.source_note}</span></td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          <IconAction label={`Edit ${rule.crop_type} rule`} onClick={() => editRule(rule)}><Pencil size={16} /></IconAction>
                          <IconAction danger label={`Delete ${rule.crop_type} rule`} onClick={() => setConfirmTarget({ type: 'rule', id: idOf(rule), label: `the "${rule.crop_type}" suitability rule` })}><Trash2 size={16} /></IconAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'costs' && (
        <div className="space-y-6">
          <div className="card p-5 sm:p-6 space-y-4">
            <h4 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
              {costEditId ? <Pencil size={14} className="text-brand-600" /> : <Plus size={14} className="text-brand-600" />}
              <span>{costEditId ? `Edit cost template: ${costForm.crop_type}` : 'Add a cultivation cost template'}</span>
            </h4>
            <form onSubmit={saveCost} className="grid grid-cols-2 md:grid-cols-6 gap-3" noValidate>
              <Field id="cc-crop" label="Crop *" error={costErrors.crop_type} className="col-span-2 md:col-span-1">
                <input id="cc-crop" type="text" maxLength={100} placeholder="e.g. Cotton" value={costForm.crop_type}
                  onChange={(e) => setCostForm({ ...costForm, crop_type: e.target.value })} className={INPUT} />
              </Field>
              {COST_FIELDS.map((field) => (
                <Field key={field} id={`cc-${field}`} label={`${field[0].toUpperCase()}${field.slice(1)} (₹/ac)`} error={costErrors[field]}>
                  <input id={`cc-${field}`} type="number" min="0" step="any" value={costForm[field]}
                    onChange={(e) => setCostForm({ ...costForm, [field]: e.target.value })} className={clsx(INPUT, 'px-2 font-mono')} />
                </Field>
              ))}
              <Field id="cc-src" label="Citable source *" error={costErrors.source_note} className="col-span-2 md:col-span-3">
                <input id="cc-src" type="text" placeholder="e.g. CACP Cost of Cultivation of Principal Crops / ICAR" value={costForm.source_note}
                  onChange={(e) => setCostForm({ ...costForm, source_note: e.target.value })} className={INPUT} />
              </Field>
              <div className="col-span-2 md:col-span-1 flex flex-col justify-end">
                <span className="text-xs font-semibold text-stone-500">Total</span>
                <span className="text-base font-bold text-brand-700 font-mono">{rupees(costTotal)}/ac</span>
                {costErrors.total && <span className="text-xs font-medium text-red-600">{costErrors.total}</span>}
              </div>
              <div className="col-span-2">{formActions('cost', !!costEditId, resetCost, 'Save template')}</div>
            </form>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-stone-800">Cultivation cost templates ({costs.items.length})</h4>
              <span className="text-xs text-stone-500">All costs per acre</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3">Crop</th><th scope="col" className="px-4 py-3">Seeds</th><th scope="col" className="px-4 py-3">Fertilizer</th>
                    <th scope="col" className="px-4 py-3">Labor</th><th scope="col" className="px-4 py-3">Irrigation</th><th scope="col" className="px-4 py-3">Pesticides</th>
                    <th scope="col" className="px-4 py-3">Total / acre</th><th scope="col" className="px-5 py-3">Source</th><th scope="col" className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <TableState loading={costs.loading && !costs.items.length} error={costs.error} onRetry={costs.load}
                    empty={!costs.items.length} colSpan={9} emptyText="No cost templates yet." />
                  {!costs.error && costs.items.map((cost) => (
                    <tr key={idOf(cost)} className={clsx('hover:bg-stone-50 transition-colors', costEditId === idOf(cost) && 'bg-brand-50')}>
                      <td className="px-5 py-3.5 font-semibold text-stone-900">{cost.crop_type}</td>
                      {COST_FIELDS.map((k) => (
                        <td key={k} className="px-4 py-3.5 font-mono text-stone-600 whitespace-nowrap">{rupees(cost.cost_breakdown_per_acre?.[k])}</td>
                      ))}
                      <td className="px-4 py-3.5 font-mono font-bold text-brand-700 whitespace-nowrap">{rupees(cost.total_cost_per_acre)}</td>
                      <td className="px-5 py-3.5 max-w-xs text-xs text-stone-600 italic"><span className="line-clamp-2" title={cost.source_note}>{cost.source_note}</span></td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          <IconAction label={`Edit ${cost.crop_type} cost template`} onClick={() => editCost(cost)}><Pencil size={16} /></IconAction>
                          <IconAction danger label={`Delete ${cost.crop_type} cost template`} onClick={() => setConfirmTarget({ type: 'cost', id: idOf(cost), label: `the "${cost.crop_type}" cost template` })}><Trash2 size={16} /></IconAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'water' && (
        <div className="space-y-6">
          <div className="card p-5 sm:p-6 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                <Droplets className="text-sky-600" size={16} />
                <span>{waterEditing ? `Edit water coefficients: ${waterForm.crop_type}` : 'Add or update FAO-56 crop water coefficients'}</span>
              </h4>
              <p className="text-xs text-stone-500 mt-1">
                Four-stage crop coefficients (Kc) and stage lengths from FAO-56, used for ETc = ET0 × Kc irrigation scheduling. Saving an existing crop replaces it.
              </p>
            </div>
            <form onSubmit={saveWater} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field id="wc-crop" label="Crop *" error={waterErrors.crop_type}>
                  <input id="wc-crop" type="text" maxLength={100} value={waterForm.crop_type} disabled={waterEditing}
                    onChange={(e) => setWaterForm({ ...waterForm, crop_type: e.target.value })} className={INPUT} />
                </Field>
                <Field id="wc-src" label="Citable source *" error={waterErrors.source_note} className="md:col-span-2">
                  <input id="wc-src" type="text" value={waterForm.source_note}
                    onChange={(e) => setWaterForm({ ...waterForm, source_note: e.target.value })} className={INPUT} />
                </Field>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {waterForm.stages.map((s, i) => (
                  <fieldset key={s.stage_name} className="p-3 rounded-xl border border-stone-200 bg-stone-50 space-y-2">
                    <legend className="text-xs font-bold text-stone-700 px-1">{s.stage_name}</legend>
                    <Field id={`wc-kc-${i}`} label="Kc" error={waterErrors[`kc${i}`]}>
                      <input id={`wc-kc-${i}`} type="number" min="0" max="3" step="0.01" value={s.kc}
                        onChange={(e) => setStage(i, 'kc', e.target.value)} className={clsx(INPUT, 'px-2 font-mono')} />
                    </Field>
                    <Field id={`wc-d-${i}`} label="Days" error={waterErrors[`d${i}`]}>
                      <input id={`wc-d-${i}`} type="number" min="0" step="1" value={s.duration_days}
                        onChange={(e) => setStage(i, 'duration_days', e.target.value)} className={clsx(INPUT, 'px-2 font-mono')} />
                    </Field>
                  </fieldset>
                ))}
              </div>
              {formActions('water', waterEditing, resetWater, 'Save coefficients')}
            </form>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <h4 className="text-sm font-semibold text-stone-800">Crop Kc baselines ({water.items.length})</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-stone-50 text-stone-500 font-bold uppercase text-xs tracking-wider border-b border-stone-200">
                  <tr>
                    <th scope="col" className="px-5 py-3">Crop</th>
                    {STAGES.map((s) => <th key={s} scope="col" className="px-4 py-3">{s}</th>)}
                    <th scope="col" className="px-4 py-3">Total cycle</th>
                    <th scope="col" className="px-5 py-3">Source</th><th scope="col" className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <TableState loading={water.loading && !water.items.length} error={water.error} onRetry={water.load}
                    empty={!water.items.length} colSpan={8} emptyText="No water coefficients yet." />
                  {!water.error && water.items.map((coeff) => {
                    const stages = coeff.growth_stages || []
                    const isApproximated = String(coeff.source_note || '').includes('APPROXIMATED')
                    return (
                      <tr key={idOf(coeff)} className="hover:bg-stone-50 transition-colors">
                        <td className="px-5 py-3.5 font-semibold text-stone-900">{coeff.crop_type}</td>
                        {STAGES.map((name, i) => {
                          const s = stages.find((x) => x.stage_name === name) || stages[i] || {}
                          return (
                            <td key={name} className="px-4 py-3.5 font-mono text-stone-700">
                              <span className="font-semibold text-stone-900">{fixed(s.kc)}</span>
                              <span className="text-xs text-stone-500 block">{s.duration_days ?? '—'} days</span>
                            </td>
                          )
                        })}
                        <td className="px-4 py-3.5 font-mono font-bold text-brand-700">{coeff.total_duration_days ? `${coeff.total_duration_days} d` : '—'}</td>
                        <td className="px-5 py-3.5 max-w-sm">
                          {isApproximated && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 mb-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle size={12} /> Approximated category
                            </span>
                          )}
                          <span className={clsx('text-xs italic block line-clamp-2', isApproximated ? 'text-amber-800' : 'text-stone-600')} title={coeff.source_note}>{coeff.source_note}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1">
                            <IconAction label={`Edit ${coeff.crop_type} coefficients`} onClick={() => editWater(coeff)}><Pencil size={16} /></IconAction>
                            <IconAction danger label={`Delete ${coeff.crop_type} coefficients`} onClick={() => setConfirmTarget({ type: 'water', id: idOf(coeff), label: `the "${coeff.crop_type}" water coefficients` })}><Trash2 size={16} /></IconAction>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'nutrients' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-700 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              NPK recommendation rates must be verified against the <strong>ICAR Handbook of Agriculture</strong> or <strong>TNAU Crop Production Guide</strong>.
              Cite the bulletin volume and year before entries reach farmer advisories.
            </p>
          </div>

          <div className="card p-5 sm:p-6 space-y-4">
            <h4 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
              <Layers size={16} className="text-brand-600" />
              <span>{nutrientEditing ? `Edit NPK requirement: ${nutrientForm.crop_type}` : 'Add or update an NPK requirement'}</span>
            </h4>
            <form onSubmit={saveNutrient} className="grid grid-cols-3 md:grid-cols-6 gap-3" noValidate>
              <Field id="nr-crop" label="Crop *" error={nutrientErrors.crop_type} className="col-span-3 md:col-span-2">
                <input id="nr-crop" type="text" maxLength={100} value={nutrientForm.crop_type} disabled={nutrientEditing}
                  onChange={(e) => setNutrientForm({ ...nutrientForm, crop_type: e.target.value })} className={INPUT} />
              </Field>
              {[['n', 'N (kg/ac)'], ['p', 'P₂O₅ (kg/ac)'], ['k', 'K₂O (kg/ac)']].map(([k, label]) => (
                <Field key={k} id={`nr-${k}`} label={label} error={nutrientErrors[k]}>
                  <input id={`nr-${k}`} type="number" min="0" max="10000" step="any" value={nutrientForm[k]}
                    onChange={(e) => setNutrientForm({ ...nutrientForm, [k]: e.target.value })} className={clsx(INPUT, 'px-2 font-mono')} />
                </Field>
              ))}
              <Field id="nr-src" label="Citable source *" error={nutrientErrors.source_note} className="col-span-3 md:col-span-6">
                <input id="nr-src" type="text" placeholder="e.g. TNAU Crop Production Guide 2020, Vol. 1, p. 45" value={nutrientForm.source_note}
                  onChange={(e) => setNutrientForm({ ...nutrientForm, source_note: e.target.value })} className={INPUT} />
              </Field>
              <div className="col-span-3 md:col-span-6 flex flex-wrap items-center justify-between gap-2">
                {formActions('nutrient', nutrientEditing, resetNutrient, 'Save requirement')}
                <span className="text-xs text-stone-500">Existing stage splits are kept when updating a crop.</span>
              </div>
            </form>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <h4 className="text-sm font-semibold text-stone-800">NPK recommendations & stage splits ({nutrients.items.length})</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-stone-50 text-stone-500 font-bold uppercase text-xs tracking-wider border-b border-stone-200">
                  <tr>
                    <th scope="col" className="px-5 py-3">Crop</th><th scope="col" className="px-4 py-3">N (kg/ac)</th><th scope="col" className="px-4 py-3">P₂O₅ (kg/ac)</th>
                    <th scope="col" className="px-4 py-3">K₂O (kg/ac)</th><th scope="col" className="px-5 py-3">Application split</th>
                    <th scope="col" className="px-5 py-3">Source</th><th scope="col" className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <TableState loading={nutrients.loading && !nutrients.items.length} error={nutrients.error} onRetry={nutrients.load}
                    empty={!nutrients.items.length} colSpan={7} emptyText="No nutrient requirements yet. Add a verified ICAR/TNAU entry above." />
                  {!nutrients.error && nutrients.items.map((req) => (
                    <tr key={idOf(req)} className="hover:bg-stone-50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-stone-900">{req.crop_type}</td>
                      <td className="px-4 py-3.5 font-mono font-bold text-stone-800">{req.n_required_kg_per_acre ?? '—'}</td>
                      <td className="px-4 py-3.5 font-mono font-bold text-stone-800">{req.p_required_kg_per_acre ?? '—'}</td>
                      <td className="px-4 py-3.5 font-mono font-bold text-stone-800">{req.k_required_kg_per_acre ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {(req.application_split || []).length === 0 && <span className="text-xs text-stone-500">—</span>}
                          {(req.application_split || []).map((split, i) => (
                            <span key={`${split.stage}-${i}`} className="inline-block px-2 py-0.5 rounded bg-stone-100 text-xs font-mono text-stone-700">
                              {split.stage}: {split.n_pct}%N / {split.p_pct}%P / {split.k_pct}%K ({split.days_after_sowing}d)
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs text-xs text-stone-600 italic"><span className="line-clamp-2" title={req.source_note}>{req.source_note}</span></td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          <IconAction label={`Edit ${req.crop_type} requirement`} onClick={() => editNutrient(req)}><Pencil size={16} /></IconAction>
                          <IconAction danger label={`Delete ${req.crop_type} requirement`} onClick={() => setConfirmTarget({ type: 'nutrient', id: idOf(req), label: `the "${req.crop_type}" nutrient requirement` })}><Trash2 size={16} /></IconAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmTarget}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={runConfirmedDelete}
        title="Delete this item?"
        message={confirmTarget ? `This will permanently remove ${confirmTarget.label}. Crop recommendations and advisories that rely on it will change.` : ''}
        confirmLabel="Delete"
      />
    </div>
  )
}

export const cropRulesMeta = { icon: Sprout, label: 'Crop Rules & Costs' }
