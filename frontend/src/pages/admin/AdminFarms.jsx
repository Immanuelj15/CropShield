import { useState, useEffect, useCallback } from 'react'
import { MapPin, Trash2, RefreshCw, Plus } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const CROPS = ['Cotton', 'Rice', 'Sugarcane', 'Millets', 'Pulses', 'Sorghum']
const ZONES = ['Dryland', 'Irrigated', 'Delta', 'Semi-arid', 'Humid', 'Coastal', 'Hills']

const EMPTY_FARM = {
  farm_name: '', owner_email: '', district: '', climate_zone: 'Dryland', crop_type: 'Cotton',
  soil_type: 'Black Soil (Vertisol)', area_hectares: '2', latitude: '', longitude: '',
}

function validate(f) {
  const e = {}
  if (!f.farm_name.trim()) e.farm_name = 'Farm name is required.'
  if (!f.district.trim()) e.district = 'District is required.'
  const lat = Number(f.latitude)
  const lon = Number(f.longitude)
  if (f.latitude === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) e.latitude = 'Latitude must be between -90 and 90.'
  if (f.longitude === '' || !Number.isFinite(lon) || lon < -180 || lon > 180) e.longitude = 'Longitude must be between -180 and 180.'
  const area = Number(f.area_hectares)
  if (f.area_hectares === '' || !Number.isFinite(area) || area <= 0) e.area_hectares = 'Area must be greater than 0.'
  if (f.owner_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.owner_email.trim())) e.owner_email = 'Enter a valid email or leave blank.'
  return e
}

function Field({ id, label, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  )
}

const fmtCoord = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(4) : '—')

export default function AdminFarms() {
  const toast = useToast()
  const [farms, setFarms] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [newFarm, setNewFarm] = useState(EMPTY_FARM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null)

  const fetchFarms = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch('/admin/farms')
      setFarms(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e.message || 'Could not load farms.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFarms() }, [fetchFarms])

  const set = (k) => (e) => setNewFarm({ ...newFarm, [k]: e.target.value })

  const handleRegisterFarm = async (e) => {
    e.preventDefault()
    if (saving) return
    const v = validate(newFarm)
    setErrors(v)
    if (Object.keys(v).length) return
    setSaving(true)
    try {
      await apiFetch('/admin/farms', {
        method: 'POST',
        json: {
          farm_name: newFarm.farm_name.trim(),
          owner_email: newFarm.owner_email.trim().toLowerCase() || null,
          district: newFarm.district.trim(),
          climate_zone: newFarm.climate_zone,
          crop_type: newFarm.crop_type,
          soil_type: newFarm.soil_type.trim() || null,
          area_hectares: Number(newFarm.area_hectares),
          latitude: Number(newFarm.latitude),
          longitude: Number(newFarm.longitude),
        },
      })
      toast.success(`${newFarm.farm_name.trim()} registered.`)
      setNewFarm(EMPTY_FARM)
      setErrors({})
      fetchFarms()
    } catch (err) {
      if (err.status === 404 && /owner/i.test(err.message || '')) setErrors({ owner_email: 'No account exists with this email.' })
      else toast.error(err.message || 'Failed to register farm.')
    } finally {
      setSaving(false)
    }
  }

  const runDelete = async () => {
    const target = confirmTarget
    if (!target) return
    setConfirmTarget(null)
    try {
      // Admins pass the owner-or-admin check on DELETE /farms/{id}
      await apiFetch(`/farms/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      toast.success(`${target.name} deleted.`)
      fetchFarms()
    } catch (err) {
      toast.error(err.message || 'Could not delete the farm.')
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-5 card p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-stone-800">Register a farm</h3>
          <p className="text-sm text-stone-600">GPS coordinate registration (no sensor hardware needed).</p>
        </div>

        <form onSubmit={handleRegisterFarm} className="grid grid-cols-2 gap-3" noValidate>
          <Field id="af-name" label="Farm name *" error={errors.farm_name} className="col-span-2">
            <input id="af-name" type="text" maxLength={200} value={newFarm.farm_name} onChange={set('farm_name')}
              placeholder="e.g. Tirunelveli Cotton Plot 4" className="input-field text-sm py-2.5" />
          </Field>
          <Field id="af-owner" label="Owner email" error={errors.owner_email} hint="Optional. Leave blank for a reference / zone farm." className="col-span-2">
            <input id="af-owner" type="email" maxLength={254} value={newFarm.owner_email} onChange={set('owner_email')}
              placeholder="farmer@example.com" className="input-field text-sm py-2.5" />
          </Field>
          <Field id="af-lat" label="Latitude *" error={errors.latitude}>
            <input id="af-lat" type="number" step="0.0001" inputMode="decimal" value={newFarm.latitude} onChange={set('latitude')}
              placeholder="9.9252" className="input-field text-sm py-2.5" />
          </Field>
          <Field id="af-lon" label="Longitude *" error={errors.longitude}>
            <input id="af-lon" type="number" step="0.0001" inputMode="decimal" value={newFarm.longitude} onChange={set('longitude')}
              placeholder="78.1198" className="input-field text-sm py-2.5" />
          </Field>
          <Field id="af-district" label="District *" error={errors.district}>
            <input id="af-district" type="text" maxLength={100} value={newFarm.district} onChange={set('district')}
              placeholder="Madurai" className="input-field text-sm py-2.5" />
          </Field>
          <Field id="af-crop" label="Crop">
            <select id="af-crop" value={newFarm.crop_type} onChange={set('crop_type')} className="input-field text-sm py-2.5">
              {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="af-zone" label="Climate zone">
            <select id="af-zone" value={newFarm.climate_zone} onChange={set('climate_zone')} className="input-field text-sm py-2.5">
              {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <Field id="af-area" label="Area (hectares) *" error={errors.area_hectares}>
            <input id="af-area" type="number" min="0.01" step="any" value={newFarm.area_hectares} onChange={set('area_hectares')}
              className="input-field text-sm py-2.5" />
          </Field>
          <Field id="af-soil" label="Soil type" className="col-span-2">
            <input id="af-soil" type="text" maxLength={100} value={newFarm.soil_type} onChange={set('soil_type')} className="input-field text-sm py-2.5" />
          </Field>
          <div className="col-span-2">
            <Button type="submit" icon={Plus} loading={saving} className={clsx('w-full', FOCUS)}>Register farm</Button>
          </div>
        </form>
      </div>

      <div className="xl:col-span-7 card p-5 sm:p-6 space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-stone-800">Registered farms ({farms.length})</h3>
          <button type="button" onClick={fetchFarms} disabled={loading} aria-label="Refresh farms"
            className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}>
            <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
          </button>
        </div>

        {loading && farms.length === 0 ? (
          <LoadingState message="Loading farms…" />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={fetchFarms} />
        ) : farms.length === 0 ? (
          <EmptyState icon={MapPin} title="No farms yet" message="Register the first farm with the form." />
        ) : (
          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500 uppercase font-bold">
                <tr>
                  <th scope="col" className="p-3">Farm name</th>
                  <th scope="col" className="p-3">District</th>
                  <th scope="col" className="p-3">Crop</th>
                  <th scope="col" className="p-3">Area (ha)</th>
                  <th scope="col" className="p-3">GPS</th>
                  <th scope="col" className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {farms.map((f) => (
                  <tr key={f.id} className="hover:bg-stone-50">
                    <td className="p-3 font-semibold text-stone-900">
                      {f.farm_name}
                      {!f.owner_id && <span className="block text-xs font-normal text-stone-500">No owner (reference farm)</span>}
                    </td>
                    <td className="p-3 text-stone-600 whitespace-nowrap">{f.district || '—'}</td>
                    <td className="p-3 font-semibold text-brand-700 whitespace-nowrap">{f.crop_type || '—'}</td>
                    <td className="p-3 text-stone-600 whitespace-nowrap">{f.area_hectares ?? '—'}</td>
                    <td className="p-3 text-stone-600 whitespace-nowrap font-mono text-xs">
                      {fmtCoord(f.gps_coordinates?.latitude)}, {fmtCoord(f.gps_coordinates?.longitude)}
                    </td>
                    <td className="p-3 text-right">
                      <button type="button" onClick={() => setConfirmTarget({ id: f.id, name: f.farm_name || 'This farm' })}
                        aria-label={`Delete ${f.farm_name || 'farm'}`}
                        className={clsx('p-2 hover:bg-red-50 text-stone-500 hover:text-red-600 rounded-lg transition-colors', FOCUS)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmTarget}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={runDelete}
        title="Delete this farm?"
        message={confirmTarget ? `${confirmTarget.name} will be permanently deleted. Its owner will lose access to its warnings and plans.` : ''}
        confirmLabel="Delete farm"
      />
    </div>
  )
}

export const farmsMeta = { icon: MapPin, label: 'Farm GPS Registry' }
