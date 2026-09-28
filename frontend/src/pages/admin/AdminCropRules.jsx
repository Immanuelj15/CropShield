import { useState, useEffect } from 'react'
import { Sprout, Scale, Coins, Droplets, Layers, AlertTriangle, Plus, Trash2, Database } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const API_BASE = '/api/v1'

const EMPTY_RULE = {
  crop_type: '', suitable_soil_types: 'Red Sandy Loam, Black Cotton Soil', water_requirement: 'Medium',
  suitable_seasons: 'Kharif, Rabi', base_yield_per_acre_kg: 600, yield_variance_pct: 20,
  avoid_after_same_crop_seasons: 1, source_note: 'TNAU Crop Production Guide 2024 (agritech.tnau.ac.in)',
}
const EMPTY_COST = {
  crop_type: '', seeds: 2500, fertilizer: 6000, labor: 12000, irrigation: 4000, pesticides: 5000,
  source_note: 'CACP Cost of Cultivation of Principal Crops reports (desagri.gov.in)',
}

export default function AdminCropRules() {
  const toast = useToast()
  const [cropTabSection, setCropTabSection] = useState('rules')
  const [cropRules, setCropRules] = useState([])
  const [cropCosts, setCropCosts] = useState([])
  const [cropWaterCoeffs, setCropWaterCoeffs] = useState([])
  const [cropNutrients, setCropNutrients] = useState([])
  const [newRule, setNewRule] = useState(EMPTY_RULE)
  const [newCost, setNewCost] = useState(EMPTY_COST)
  const [confirmTarget, setConfirmTarget] = useState(null) // { type, id, label }

  const token = sessionStorage.getItem('cropshield_token')
  const authHeaders = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

  const fetchCropRules = async () => {
    try { const res = await fetch(`${API_BASE}/crop-recommendation/rules`); if (res.ok) setCropRules(await res.json()) }
    catch (e) { console.debug('Error fetching crop rules:', e) }
  }
  const fetchCropCosts = async () => {
    try { const res = await fetch(`${API_BASE}/crop-recommendation/cost-templates`); if (res.ok) setCropCosts(await res.json()) }
    catch (e) { console.debug('Error fetching crop costs:', e) }
  }
  const fetchCropWaterCoeffs = async () => {
    try { const res = await fetch(`${API_BASE}/irrigation/coefficients/all`); if (res.ok) setCropWaterCoeffs(await res.json()) }
    catch (e) { console.debug('Error fetching crop water coeffs:', e) }
  }
  const fetchCropNutrients = async () => {
    try { const res = await fetch(`${API_BASE}/fertilizer/requirements/all`); if (res.ok) setCropNutrients(await res.json()) }
    catch (e) { console.debug('Error fetching crop nutrients:', e) }
  }

  useEffect(() => {
    fetchCropRules(); fetchCropCosts(); fetchCropWaterCoeffs(); fetchCropNutrients()
  }, [])

  const handleCreateRule = async (e) => {
    e.preventDefault()
    if (!newRule.source_note || newRule.source_note.trim().length < 5) {
      toast.error('Citable source_note is mandatory for agronomic compliance (e.g. TNAU guide).')
      return
    }
    try {
      const payload = {
        crop_type: newRule.crop_type,
        suitable_soil_types: newRule.suitable_soil_types.split(',').map(s => s.trim()).filter(Boolean),
        water_requirement: newRule.water_requirement,
        suitable_seasons: newRule.suitable_seasons.split(',').map(s => s.trim()).filter(Boolean),
        base_yield_per_acre_kg: Number(newRule.base_yield_per_acre_kg),
        yield_variance_pct: Number(newRule.yield_variance_pct),
        avoid_after_same_crop_seasons: Number(newRule.avoid_after_same_crop_seasons),
        source_note: newRule.source_note,
      }
      const res = await fetch(`${API_BASE}/crop-recommendation/rules`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) })
      if (res.ok) {
        toast.success(`Crop suitability rule for ${newRule.crop_type} registered.`)
        fetchCropRules()
        setNewRule({ ...newRule, crop_type: '' })
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Failed to save rule')
      }
    } catch (err) {
      console.error(err)
      toast.error('Network error while saving rule.')
    }
  }

  const handleCreateCost = async (e) => {
    e.preventDefault()
    if (!newCost.source_note || newCost.source_note.trim().length < 5) {
      toast.error('Citable source_note is mandatory for cost template (e.g. CACP report).')
      return
    }
    try {
      const seeds = Number(newCost.seeds), fertilizer = Number(newCost.fertilizer), labor = Number(newCost.labor)
      const irrigation = Number(newCost.irrigation), pesticides = Number(newCost.pesticides)
      const total = seeds + fertilizer + labor + irrigation + pesticides
      const payload = {
        crop_type: newCost.crop_type,
        cost_breakdown_per_acre: { seeds, fertilizer, labor, irrigation, pesticides },
        total_cost_per_acre: total,
        source_note: newCost.source_note,
      }
      const res = await fetch(`${API_BASE}/crop-recommendation/cost-templates`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) })
      if (res.ok) {
        toast.success(`Cultivation cost template for ${newCost.crop_type} registered.`)
        fetchCropCosts()
        setNewCost({ ...newCost, crop_type: '' })
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.detail || 'Failed to save cost template')
      }
    } catch (err) {
      console.error(err)
      toast.error('Network error while saving cost template.')
    }
  }

  const runConfirmedDelete = async () => {
    if (!confirmTarget) return
    const { type, id } = confirmTarget
    try {
      if (type === 'rule') {
        const res = await fetch(`${API_BASE}/crop-recommendation/rules/${id}`, { method: 'DELETE', headers: authHeaders })
        if (res.ok) fetchCropRules()
      } else if (type === 'cost') {
        const res = await fetch(`${API_BASE}/crop-recommendation/cost-templates/${id}`, { method: 'DELETE', headers: authHeaders })
        if (res.ok) fetchCropCosts()
      } else if (type === 'water') {
        const res = await fetch(`${API_BASE}/irrigation/coefficients/${id}`, { method: 'DELETE' })
        if (res.ok) fetchCropWaterCoeffs()
      } else if (type === 'nutrient') {
        const res = await fetch(`${API_BASE}/fertilizer/requirements/${id}`, { method: 'DELETE' })
        if (res.ok) fetchCropNutrients()
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete item.')
    } finally {
      setConfirmTarget(null)
    }
  }

  const sections = [
    { key: 'rules', label: `Suitability Rules (${cropRules.length})`, icon: Scale },
    { key: 'costs', label: `Cost Templates (${cropCosts.length})`, icon: Coins },
    { key: 'water', label: `FAO-56 Water Kc (${cropWaterCoeffs.length})`, icon: Droplets },
    { key: 'nutrients', label: `ICAR/TNAU Nutrients (${cropNutrients.length})`, icon: Layers },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-green-100 text-green-800 rounded-lg font-bold"><Sprout size={18} /></span>
            <h3 className="text-base font-extrabold text-stone-900">Pre-Season Crop Rules & Cost Knowledge Base</h3>
          </div>
          <p className="text-xs text-stone-500 mt-1 max-w-2xl">
            Configured for 15 primary Tamil Nadu crops. Recommends crops and computes yield/cost/profit ranges.
            <span className="font-semibold text-green-800 ml-1">Every rule & cost template strictly mandates a citable extension source (TNAU / CACP).</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center bg-stone-100 p-1.5 rounded-2xl gap-1.5 self-start md:self-auto border border-stone-200">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setCropTabSection(key)}
              className={clsx(
                'px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2',
                cropTabSection === key ? 'bg-green-700 text-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {cropTabSection === 'rules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <Plus size={14} className="text-green-600" /><span>Register or Update Suitability Rule</span>
            </h4>
            <form onSubmit={handleCreateRule} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Crop Type *</label>
                <input type="text" placeholder="e.g. Cotton, Paddy, Groundnut" value={newRule.crop_type}
                  onChange={(e) => setNewRule({ ...newRule, crop_type: e.target.value })} required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:border-green-600 outline-none font-semibold text-stone-800" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Water Requirement *</label>
                <select value={newRule.water_requirement} onChange={(e) => setNewRule({ ...newRule, water_requirement: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:border-green-600 outline-none font-semibold text-stone-800">
                  <option value="Low">Low (Drought-tolerant / Rainfed)</option>
                  <option value="Medium">Medium (Moderate irrigation)</option>
                  <option value="High">High (Abundant water / Wetland)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Suitable Seasons (comma-separated) *</label>
                <input type="text" placeholder="Kharif, Rabi, Summer" value={newRule.suitable_seasons}
                  onChange={(e) => setNewRule({ ...newRule, suitable_seasons: e.target.value })} required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:border-green-600 outline-none font-semibold text-stone-800" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Suitable Soil Types (comma-separated) *</label>
                <input type="text" placeholder="Red Sandy Loam, Black Cotton Soil, Clay Loam" value={newRule.suitable_soil_types}
                  onChange={(e) => setNewRule({ ...newRule, suitable_soil_types: e.target.value })} required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:border-green-600 outline-none font-semibold text-stone-800" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Yield (kg/ac)</label>
                  <input type="number" value={newRule.base_yield_per_acre_kg} onChange={(e) => setNewRule({ ...newRule, base_yield_per_acre_kg: e.target.value })} required
                    className="w-full px-3 py-2.5 rounded-lg border border-stone-200 bg-stone-50 font-mono text-xs outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Variance (±%)</label>
                  <input type="number" value={newRule.yield_variance_pct} onChange={(e) => setNewRule({ ...newRule, yield_variance_pct: e.target.value })} required
                    className="w-full px-3 py-2.5 rounded-lg border border-stone-200 bg-stone-50 font-mono text-xs outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Rotation Guard</label>
                  <input type="number" value={newRule.avoid_after_same_crop_seasons} onChange={(e) => setNewRule({ ...newRule, avoid_after_same_crop_seasons: e.target.value })} required
                    className="w-full px-3 py-2.5 rounded-lg border border-stone-200 bg-stone-50 font-mono text-xs outline-none" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5">
                  <span>Citable Source Note * (Mandatory for Evaluator/Patent Compliance)</span>
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-extrabold">Required</span>
                </label>
                <input type="text" placeholder="e.g. TNAU Agritech Portal 2024 / ICAR package of practices" value={newRule.source_note}
                  onChange={(e) => setNewRule({ ...newRule, source_note: e.target.value })} required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-amber-300 bg-amber-50/40 focus:bg-white focus:border-amber-600 outline-none font-medium text-stone-800" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full py-2.5 px-4 bg-green-700 hover:bg-green-800 text-white rounded-lg font-bold transition-all shadow-sm flex items-center justify-center gap-2">
                  <Plus size={15} /><span>Save Suitability Rule</span>
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-stone-700">Existing Suitability Rules ({cropRules.length} crops)</h4>
              <span className="text-[11px] text-stone-400">Yield variance builds the min/max profit range</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Crop</th><th className="px-5 py-3">Water</th><th className="px-5 py-3">Seasons</th>
                    <th className="px-5 py-3">Suitable Soils</th><th className="px-5 py-3">Base Yield (kg/ac)</th>
                    <th className="px-5 py-3">Source Note</th><th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {cropRules.map((rule) => (
                    <tr key={rule.id || rule._id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-stone-900">{rule.crop_type}</td>
                      <td className="px-5 py-3.5">
                        <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase',
                          rule.water_requirement === 'Low' ? 'bg-amber-100 text-amber-800' :
                          rule.water_requirement === 'Medium' ? 'bg-sky-100 text-sky-800' : 'bg-blue-100 text-blue-800')}>
                          {rule.water_requirement}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {rule.suitable_seasons?.map((s, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-stone-100 text-stone-700 rounded text-[10px] font-semibold">{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs truncate text-[11px] text-stone-600" title={rule.suitable_soil_types?.join(', ')}>
                        {rule.suitable_soil_types?.join(', ')}
                      </td>
                      <td className="px-5 py-3.5 font-mono">
                        <span className="font-bold text-stone-900">{rule.base_yield_per_acre_kg}</span>
                        <span className="text-stone-400 text-[10px] ml-1">±{rule.yield_variance_pct}%</span>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs text-[11px] text-green-800 italic" title={rule.source_note}>{rule.source_note}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => setConfirmTarget({ type: 'rule', id: rule.id || rule._id, label: `the "${rule.crop_type}" suitability rule` })}
                          className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-lg transition-colors" title="Delete rule">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {cropTabSection === 'costs' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <Plus size={14} className="text-green-600" /><span>Register or Update Cultivation Cost Template</span>
            </h4>
            <form onSubmit={handleCreateCost} className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Crop Type *</label>
                <input type="text" placeholder="e.g. Cotton, Paddy" value={newCost.crop_type}
                  onChange={(e) => setNewCost({ ...newCost, crop_type: e.target.value })} required
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:border-green-600 outline-none font-semibold text-stone-800" />
              </div>
              {['seeds', 'fertilizer', 'labor', 'irrigation', 'pesticides'].map((field) => (
                <div key={field}>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1 capitalize">{field} (₹/ac)</label>
                  <input type="number" value={newCost[field]} onChange={(e) => setNewCost({ ...newCost, [field]: e.target.value })} required
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 font-mono text-xs outline-none" />
                </div>
              ))}
              <div className="col-span-2 md:col-span-3">
                <label className="block text-[11px] font-bold text-stone-600 mb-1 flex items-center gap-1.5">
                  <span>Citable Source Note * (Mandatory for CACP/APEDA Audit)</span>
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-extrabold">Required</span>
                </label>
                <input type="text" placeholder="e.g. CACP Cost of Cultivation of Principal Crops / ICAR" value={newCost.source_note}
                  onChange={(e) => setNewCost({ ...newCost, source_note: e.target.value })} required
                  className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/40 focus:bg-white focus:border-amber-600 outline-none font-medium text-stone-800" />
              </div>
              <div className="col-span-2 md:col-span-2 flex items-center justify-between px-3 py-2 bg-stone-50 rounded-lg border border-stone-200">
                <span className="text-[11px] font-bold text-stone-500">Calculated Total:</span>
                <span className="text-sm font-black text-green-800 font-mono">
                  ₹{(Number(newCost.seeds) + Number(newCost.fertilizer) + Number(newCost.labor) + Number(newCost.irrigation) + Number(newCost.pesticides)).toLocaleString('en-IN')}/ac
                </span>
              </div>
              <div className="col-span-2 md:col-span-1 flex items-end">
                <button type="submit" className="w-full py-2.5 px-3 bg-green-700 hover:bg-green-800 text-white rounded-lg font-bold transition-all shadow-sm flex items-center justify-center gap-1 text-xs">
                  <Plus size={14} /><span>Save</span>
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-stone-700">Cultivation Cost Breakdown Templates ({cropCosts.length} crops)</h4>
              <span className="text-[11px] text-stone-400">All costs scaled per acre for farm budget budgeting</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Crop</th><th className="px-5 py-3">Seeds</th><th className="px-5 py-3">Fertilizer</th>
                    <th className="px-5 py-3">Labor</th><th className="px-5 py-3">Irrig.</th><th className="px-5 py-3">Pesticides</th>
                    <th className="px-5 py-3">Total / Acre</th><th className="px-5 py-3">Source Note</th><th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {cropCosts.map((cost) => (
                    <tr key={cost.id || cost._id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-stone-900">{cost.crop_type}</td>
                      <td className="px-5 py-3.5 font-mono text-stone-600">₹{cost.cost_breakdown_per_acre?.seeds?.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5 font-mono text-stone-600">₹{cost.cost_breakdown_per_acre?.fertilizer?.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5 font-mono text-stone-600">₹{cost.cost_breakdown_per_acre?.labor?.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5 font-mono text-stone-600">₹{cost.cost_breakdown_per_acre?.irrigation?.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5 font-mono text-stone-600">₹{cost.cost_breakdown_per_acre?.pesticides?.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5 font-mono font-black text-green-800">₹{cost.total_cost_per_acre?.toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5 max-w-xs text-[11px] text-green-800 italic" title={cost.source_note}>{cost.source_note}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => setConfirmTarget({ type: 'cost', id: cost.id || cost._id, label: `the "${cost.crop_type}" cost template` })}
                          className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-lg transition-colors" title="Delete template">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {cropTabSection === 'water' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-base font-black text-stone-900 flex items-center gap-2">
                <Droplets className="text-sky-600" size={18} /><span>FAO-56 Crop Water Coefficients & Growth Stages</span>
              </h4>
              <p className="text-xs text-stone-500 mt-1 max-w-2xl leading-relaxed">
                Standardized 4-stage coefficients (<code className="bg-stone-100 px-1 py-0.5 rounded font-mono">Kc_ini, Kc_dev, Kc_mid, Kc_late</code>)
                derived from FAO-56 Irrigation and Drainage Paper No. 56. Used for evapotranspiration (<code className="bg-stone-100 px-1 py-0.5 rounded font-mono">ETc = ET0 × Kc</code>) and precision irrigation scheduling.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold self-start md:self-auto">
              <Database size={13} className="text-sky-600" /><span>Production Seed: {cropWaterCoeffs.length} crops</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-stone-50/50">
              <span className="text-xs font-bold text-stone-700">Seeded Crop Kc Baselines</span>
              <span className="text-[11px] text-stone-500 font-mono">irrigation_fertilizer_demo_log_10000rows.csv is retained strictly for offline validation/demo benchmarks</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 font-black uppercase text-[10px] tracking-wider border-b border-stone-200">
                    <th className="px-5 py-3">Crop</th><th className="px-4 py-3">Initial Stage</th><th className="px-4 py-3">Development</th>
                    <th className="px-4 py-3">Mid-Season</th><th className="px-4 py-3">Late-Season</th><th className="px-4 py-3">Total Cycle</th>
                    <th className="px-5 py-3">Source & Category</th><th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {cropWaterCoeffs.map((coeff) => {
                    const stages = coeff.growth_stages || []
                    const sIni = stages.find(s => s.stage_name === 'Initial') || stages[0] || {}
                    const sDev = stages.find(s => s.stage_name === 'Development') || stages[1] || {}
                    const sMid = stages.find(s => s.stage_name === 'Mid-season') || stages[2] || {}
                    const sLate = stages.find(s => s.stage_name === 'Late-season') || stages[3] || {}
                    const isApproximated = coeff.source_note?.includes('APPROXIMATED')
                    return (
                      <tr key={coeff.id || coeff._id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-stone-900">{coeff.crop_type}</td>
                        <td className="px-4 py-3.5 font-mono text-stone-700">
                          <span className="font-semibold text-stone-900">{sIni.kc?.toFixed(2) ?? '--'}</span>
                          <span className="text-[10px] text-stone-400 block">{sIni.duration_days ?? '--'} days</span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-stone-700">
                          <span className="font-semibold text-stone-900">{sDev.kc?.toFixed(2) ?? '--'}</span>
                          <span className="text-[10px] text-stone-400 block">{sDev.duration_days ?? '--'} days</span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-stone-700">
                          <span className="font-semibold text-stone-900">{sMid.kc?.toFixed(2) ?? '--'}</span>
                          <span className="text-[10px] text-stone-400 block">{sMid.duration_days ?? '--'} days</span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-stone-700">
                          <span className="font-semibold text-stone-900">{sLate.kc?.toFixed(2) ?? '--'}</span>
                          <span className="text-[10px] text-stone-400 block">{sLate.duration_days ?? '--'} days</span>
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-green-800">{coeff.total_duration_days ? `${coeff.total_duration_days} d` : '--'}</td>
                        <td className="px-5 py-3.5 max-w-sm">
                          {isApproximated ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                <AlertTriangle size={11} className="text-amber-700" /> Approximated FAO-56 Category
                              </span>
                              <p className="text-[11px] text-amber-800 italic leading-snug">{coeff.source_note}</p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-stone-500 italic block leading-snug">{coeff.source_note}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button onClick={() => setConfirmTarget({ type: 'water', id: coeff.id || coeff._id, label: `the "${coeff.crop_type}" water coefficient` })}
                            className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-lg transition-colors" title="Delete coefficient">
                            <Trash2 size={14} />
                          </button>
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

      {cropTabSection === 'nutrients' && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl shrink-0"><AlertTriangle size={24} /></div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-amber-950 uppercase tracking-wide">Agronomic Dataset Verification & Manual Compilation Requirement</h4>
              <p className="text-xs text-amber-900 leading-relaxed">
                Official crop nutrient requirements (N-P-K recommendation rates in kg/acre and growth-stage application split schedules)
                must be compiled and verified directly against <strong>ICAR Handbooks of Agriculture</strong> and <strong>TNAU Crop Production Guides</strong>.
                Any dataset additions must cite specific bulletin volume and year before deployment to farmer-facing advisories.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <span className="text-xs font-bold text-stone-700">Compiled NPK Recommendations & Stage Splits ({cropNutrients.length} Crops)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 font-black uppercase text-[10px] tracking-wider border-b border-stone-200">
                    <th className="px-5 py-3">Crop</th><th className="px-4 py-3">N (kg/acre)</th><th className="px-4 py-3">P₂O₅ (kg/acre)</th>
                    <th className="px-4 py-3">K₂O (kg/acre)</th><th className="px-5 py-3">Application Split (% by Stage)</th>
                    <th className="px-5 py-3">Citation / Source Note</th><th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {cropNutrients.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-xs text-stone-400">No nutrient requirements loaded yet. Use scripts or manual compilation to insert ICAR/TNAU guidelines.</td></tr>
                  ) : (
                    cropNutrients.map((req) => (
                      <tr key={req.id || req._id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-stone-900">{req.crop_type}</td>
                        <td className="px-4 py-3.5 font-mono font-bold text-green-800">{req.n_required_kg_per_acre}</td>
                        <td className="px-4 py-3.5 font-mono font-bold text-blue-800">{req.p_required_kg_per_acre}</td>
                        <td className="px-4 py-3.5 font-mono font-bold text-amber-800">{req.k_required_kg_per_acre}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {req.application_split?.map((split, i) => (
                              <span key={i} className="inline-block px-2 py-0.5 rounded bg-stone-100 text-[10px] font-mono text-stone-700">
                                {split.stage}: {split.n_pct}%N / {split.p_pct}%P / {split.k_pct}%K ({split.days_after_sowing}d)
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 max-w-xs text-[11px] text-stone-500 italic">{req.source_note}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button onClick={() => setConfirmTarget({ type: 'nutrient', id: req.id || req._id, label: `the "${req.crop_type}" nutrient requirement` })}
                            className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-lg transition-colors" title="Delete requirement">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
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
        message={confirmTarget ? `This will permanently remove ${confirmTarget.label}.` : ''}
        confirmLabel="Delete"
      />
    </div>
  )
}

export const cropRulesMeta = { icon: Sprout, label: 'Crop Rules & Costs' }
