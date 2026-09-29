import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import clsx from 'clsx'

import { apiFetch } from '../../utils/http'
const ROLE_BADGE = {
  farmer: 'bg-green-100 text-green-800',
  agronomist: 'bg-blue-100 text-blue-800',
  admin: 'bg-violet-100 text-violet-800',
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/admin/users')
        setUsers(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error(e)
        setLoadError(e.message || 'Could not load data.')
      }
    })()
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
      {loadError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</p>}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div>
          <h2 className="text-lg font-bold text-stone-900">User Account & Role Management</h2>
          <p className="text-xs text-stone-500">Manage Farmer, Agronomist, and Admin privileges.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase font-bold">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Assigned Region</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-stone-50">
                <td className="p-3 font-bold text-stone-900">{u.name}</td>
                <td className="p-3 text-stone-600">{u.email}</td>
                <td className="p-3">
                  <span className={clsx('px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase', ROLE_BADGE[u.role] || ROLE_BADGE.farmer)}>
                    {u.role}
                  </span>
                </td>
                <td className="p-3 text-stone-500">{u.region_assigned || u.district || '—'}</td>
                <td className="p-3"><span className="text-green-700 font-bold">Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const usersMeta = { icon: Users, label: 'User Accounts' }
