import { useState, useEffect, useCallback, useMemo } from 'react'
import { Users, UserPlus, Pencil, RefreshCw, Search } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/ui/Toast'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import EmptyState from '../../components/ui/EmptyState'
import { LoadingState, ErrorState } from '../../components'
import { apiFetch, getUser } from '../../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const MIN_PASSWORD = 8 // backend MIN_PASSWORD_LENGTH
const ROLES = ['farmer', 'agronomist', 'admin']

// Role badges are the one place role accents are allowed (farmer = brand, agronomist = sky, admin = violet)
const ROLE_BADGE = {
  farmer: 'bg-brand-50 text-brand-700 border-brand-100',
  agronomist: 'bg-sky-50 text-sky-700 border-sky-200',
  admin: 'bg-violet-50 text-violet-700 border-violet-200',
}

const EMPTY_CREATE = { name: '', email: '', password: '', role: 'farmer', phone: '', district: '', region_assigned: '' }

function validateCreate(f) {
  const errors = {}
  if (!f.name.trim()) errors.name = 'Name is required.'
  const email = f.email.trim()
  if (!email) errors.email = 'Email is required.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
  if (f.password.length < MIN_PASSWORD) errors.password = `Password must be at least ${MIN_PASSWORD} characters.`
  if (f.phone && f.phone.length > 20) errors.phone = 'Phone number is too long.'
  return errors
}

function Field({ id, label, error, children, hint }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  )
}

export default function AdminUsers() {
  const toast = useToast()
  const me = getUser()
  const myId = me?.user_id || me?.id
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [createErrors, setCreateErrors] = useState({})
  const [creating, setCreating] = useState(false)

  const [editUser, setEditUser] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editErrors, setEditErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState(null) // user to activate/deactivate

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch('/admin/users')
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e.message || 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return [u.name, u.email, u.district, u.region_assigned].some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [users, query, roleFilter])

  const isSelf = (u) => !!myId && String(u.id) === String(myId)

  // ── Create ────────────────────────────────────────────────
  const openCreate = () => { setCreateForm(EMPTY_CREATE); setCreateErrors({}); setCreateOpen(true) }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (creating) return
    const errors = validateCreate(createForm)
    setCreateErrors(errors)
    if (Object.keys(errors).length) return
    setCreating(true)
    try {
      const payload = {
        name: createForm.name.trim(),
        email: createForm.email.trim().toLowerCase(),
        password: createForm.password,
        role: createForm.role,
        phone: createForm.phone.trim() || null,
        district: createForm.district.trim() || undefined,
        region_assigned: createForm.region_assigned.trim() || null,
      }
      await apiFetch('/admin/users', { method: 'POST', json: payload })
      toast.success(`Account created for ${payload.email}.`)
      setCreateOpen(false)
      load()
    } catch (err) {
      if (err.status === 400 && /already/i.test(err.message || '')) setCreateErrors({ email: err.message })
      else toast.error(err.message || 'Could not create the account.')
    } finally {
      setCreating(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditUser(u)
    setEditErrors({})
    setEditForm({ name: u.name || '', role: u.role || 'farmer', district: u.district || '', region_assigned: u.region_assigned || '' })
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    if (!editUser || saving) return
    if (!editForm.name.trim()) { setEditErrors({ name: 'Name is required.' }); return }
    if (isSelf(editUser) && editForm.role !== 'admin') { setEditErrors({ role: 'You cannot remove your own admin role.' }); return }
    setSaving(true)
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(editUser.id)}`, {
        method: 'PUT',
        json: {
          name: editForm.name.trim(),
          role: editForm.role,
          district: editForm.district.trim(),
          region_assigned: editForm.region_assigned.trim(),
        },
      })
      toast.success('User updated.')
      setEditUser(null)
      load()
    } catch (err) {
      toast.error(err.message || 'Could not update the user.')
    } finally {
      setSaving(false)
    }
  }

  const runStatusChange = async () => {
    const u = confirmStatus
    if (!u) return
    setConfirmStatus(null)
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(u.id)}`, { method: 'PUT', json: { is_active: !u.is_active } })
      toast.success(u.is_active ? `${u.email} deactivated.` : `${u.email} reactivated.`)
      load()
    } catch (err) {
      toast.error(err.message || 'Could not change account status.')
    }
  }

  return (
    <div className="card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">User accounts & roles</h2>
          <p className="text-sm text-stone-600">Create accounts, assign Farmer / Agronomist / Admin roles and deactivate access.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Refresh users"
            className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}
          >
            <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
          </button>
          <Button type="button" icon={UserPlus} onClick={openCreate} className={FOCUS}>New user</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or district"
            aria-label="Search users"
            className="input-field text-sm py-2.5 pl-9"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          className="input-field text-sm py-2.5 sm:w-44"
        >
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
        </select>
      </div>

      {loading && users.length === 0 ? (
        <LoadingState message="Loading users…" />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title={users.length ? 'No matching users' : 'No users yet'} message={users.length ? 'Try a different search or role filter.' : 'Create the first account with "New user".'} />
      ) : (
        <div className="overflow-x-auto -mx-5 sm:mx-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500 uppercase font-bold">
              <tr>
                <th scope="col" className="p-3">Name</th>
                <th scope="col" className="p-3">Email</th>
                <th scope="col" className="p-3">Role</th>
                <th scope="col" className="p-3">Region / district</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-stone-50">
                  <td className="p-3 font-semibold text-stone-900">{u.name}{isSelf(u) && <span className="ml-1 text-xs text-stone-500">(you)</span>}</td>
                  <td className="p-3 text-stone-600 break-all">{u.email}</td>
                  <td className="p-3">
                    <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-bold capitalize border', ROLE_BADGE[u.role] || 'bg-stone-100 text-stone-600 border-stone-200')}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3 text-stone-600">{u.region_assigned || u.district || '—'}</td>
                  <td className="p-3">
                    {u.is_active === false
                      ? <span className="text-red-700 font-semibold">Inactive</span>
                      : <span className="text-green-700 font-semibold">Active</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" size="sm" icon={Pencil} onClick={() => openEdit(u)} className={FOCUS} aria-label={`Edit ${u.email}`}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant={u.is_active === false ? 'secondary' : 'ghost'}
                        size="sm"
                        disabled={isSelf(u)}
                        title={isSelf(u) ? 'You cannot deactivate your own account' : undefined}
                        onClick={() => setConfirmStatus(u)}
                        className={clsx(FOCUS, u.is_active !== false && 'text-red-700 hover:bg-red-50')}
                      >
                        {u.is_active === false ? 'Reactivate' : 'Deactivate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create user */}
      <Modal isOpen={createOpen} onClose={() => !creating && setCreateOpen(false)} title="Create user account" size="md">
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="cu-name" label="Full name *" error={createErrors.name}>
              <input id="cu-name" className="input-field text-sm py-2.5" maxLength={150} value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </Field>
            <Field id="cu-email" label="Email *" error={createErrors.email}>
              <input id="cu-email" type="email" autoComplete="off" className="input-field text-sm py-2.5" maxLength={254} value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </Field>
            <Field id="cu-password" label="Temporary password *" error={createErrors.password} hint={`At least ${MIN_PASSWORD} characters.`}>
              <input id="cu-password" type="password" autoComplete="new-password" className="input-field text-sm py-2.5" maxLength={128} value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </Field>
            <Field id="cu-role" label="Role *">
              <select id="cu-role" className="input-field text-sm py-2.5 capitalize" value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field id="cu-phone" label="Phone" error={createErrors.phone}>
              <input id="cu-phone" type="tel" className="input-field text-sm py-2.5" maxLength={20} value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
            </Field>
            <Field id="cu-district" label="District" hint="Defaults to Coimbatore if empty.">
              <input id="cu-district" className="input-field text-sm py-2.5" maxLength={100} value={createForm.district}
                onChange={(e) => setCreateForm({ ...createForm, district: e.target.value })} />
            </Field>
            {createForm.role === 'agronomist' && (
              <div className="sm:col-span-2">
                <Field id="cu-region" label="Assigned region">
                  <input id="cu-region" className="input-field text-sm py-2.5" maxLength={100} value={createForm.region_assigned}
                    onChange={(e) => setCreateForm({ ...createForm, region_assigned: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating} className={FOCUS}>Cancel</Button>
            <Button type="submit" loading={creating} className={FOCUS}>Create account</Button>
          </div>
        </form>
      </Modal>

      {/* Edit user */}
      <Modal isOpen={!!editUser} onClose={() => !saving && setEditUser(null)} title={editUser ? `Edit ${editUser.email}` : 'Edit user'} size="md">
        {editForm && (
          <form onSubmit={handleEdit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="eu-name" label="Full name *" error={editErrors.name}>
                <input id="eu-name" className="input-field text-sm py-2.5" maxLength={150} value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </Field>
              <Field id="eu-role" label="Role" error={editErrors.role}>
                <select id="eu-role" className="input-field text-sm py-2.5 capitalize" value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field id="eu-district" label="District">
                <input id="eu-district" className="input-field text-sm py-2.5" maxLength={100} value={editForm.district}
                  onChange={(e) => setEditForm({ ...editForm, district: e.target.value })} />
              </Field>
              <Field id="eu-region" label="Assigned region">
                <input id="eu-region" className="input-field text-sm py-2.5" maxLength={100} value={editForm.region_assigned}
                  onChange={(e) => setEditForm({ ...editForm, region_assigned: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditUser(null)} disabled={saving} className={FOCUS}>Cancel</Button>
              <Button type="submit" loading={saving} className={FOCUS}>Save changes</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmStatus}
        onCancel={() => setConfirmStatus(null)}
        onConfirm={runStatusChange}
        danger={!!confirmStatus?.is_active}
        title={confirmStatus?.is_active ? 'Deactivate this account?' : 'Reactivate this account?'}
        message={confirmStatus
          ? (confirmStatus.is_active
            ? `${confirmStatus.email} will no longer be able to sign in.`
            : `${confirmStatus.email} will be able to sign in again.`)
          : ''}
        confirmLabel={confirmStatus?.is_active ? 'Deactivate' : 'Reactivate'}
      />
    </div>
  )
}

export const usersMeta = { icon: Users, label: 'User Accounts' }
