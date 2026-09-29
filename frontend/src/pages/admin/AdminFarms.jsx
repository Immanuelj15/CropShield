import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'

import { apiFetch } from '../../utils/http'

export default function AdminFarms() {
  const toast = useToast()
  const [farms, setFarms] = useState([])
  const [newFarm, setNewFarm] = useState({
    farm_name: '', owner_email: 'farmer@cropshield.org', district: 'Madurai',
    climate_zone: 'Dryland', crop_type: 'Cotton', soil_type: 'Black Soil (Vertisol)',
    area_hectares: 2.0, latitude: 9.9252, longitude: 78.1198,
  })
  const [saving, setSaving] = useState(false)

  const fetchFarms = async () => {
    try {
      const data = await apiFetch('/admin/farms')
      setFarms(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Could not load farms.')
    }
  }

  useEffect(() => { fetchFarms() }, [])

  const handleRegisterFarm = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await apiFetch('/admin/farms', { method: 'POST', json: newFarm })
      toast.success('Farm zone GPS boundary registered successfully (pure software).')
      fetchFarms()
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to register farm.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-stone-900">GPS Farm Registration</h3>
          <p className="text-xs text-stone-500">Pure software GPS coordinate mapping. No IoT sensor pairing.</p>
        </div>

        <form onSubmit={handleRegisterFarm} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Farm Name</label>
            <input
              type="text" required
              value={newFarm.farm_name}
              onChange={(e) => setNewFarm({ ...newFarm, farm_name: e.target.value })}
              placeholder="e.g. Tirunelveli Cotton Plot 4"
              className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Latitude</label>
              <input
                type="number" step="0.0001" required
                value={newFarm.latitude}
                onChange={(e) => setNewFarm({ ...newFarm, latitude: parseFloat(e.target.value) })}
                className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Longitude</label>
              <input
                type="number" step="0.0001" required
                value={newFarm.longitude}
                onChange={(e) => setNewFarm({ ...newFarm, longitude: parseFloat(e.target.value) })}
                className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">District</label>
              <input
                type="text" required
                value={newFarm.district}
                onChange={(e) => setNewFarm({ ...newFarm, district: e.target.value })}
                className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Crop Type</label>
              <select
                value={newFarm.crop_type}
                onChange={(e) => setNewFarm({ ...newFarm, crop_type: e.target.value })}
                className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none font-semibold"
              >
                <option value="Cotton">Cotton</option>
                <option value="Rice">Rice</option>
                <option value="Sugarcane">Sugarcane</option>
                <option value="Millets">Millets</option>
                <option value="Pulses">Pulses</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={saving} className="disabled:opacity-50 w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow transition-all">
            Register GPS Farm Zone
          </button>
        </form>
      </div>

      <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-stone-900">Registered Farm Zones ({farms.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase font-bold">
              <tr>
                <th className="p-3">Farm Name</th>
                <th className="p-3">District</th>
                <th className="p-3">Crop</th>
                <th className="p-3">GPS Coordinates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {farms.map(f => (
                <tr key={f.id} className="hover:bg-stone-50">
                  <td className="p-3 font-bold text-stone-900 whitespace-nowrap">{f.farm_name}</td>
                  <td className="p-3 text-stone-600 whitespace-nowrap">{f.district}</td>
                  <td className="p-3 font-semibold text-brand-800 whitespace-nowrap">{f.crop_type}</td>
                  <td className="p-3 text-stone-500 whitespace-nowrap">{f.gps_coordinates?.latitude}, {f.gps_coordinates?.longitude}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export const farmsMeta = { icon: MapPin, label: 'Farm GPS Registry' }
