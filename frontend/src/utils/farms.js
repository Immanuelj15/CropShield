import { apiFetch, getUser } from './http'

// Contract 3: farms expose `farm_id` / `farm_name`. Older payloads used `id` / `name` — accept both.
export const farmIdOf = (farm) => (farm ? String(farm.farm_id || farm.id || farm._id || '') : '')
export const farmNameOf = (farm, fallback = 'My Farm') => (farm && (farm.farm_name || farm.name)) || fallback

/** GET /farmer/farms (auth) → array of the caller's farms (admin: all). Never falls back to other users' farms. */
export async function fetchMyFarms({ signal } = {}) {
  const data = await apiFetch('/farmer/farms', { signal })
  const list = Array.isArray(data) ? data : Array.isArray(data?.farms) ? data.farms : []
  return list.filter((f) => farmIdOf(f))
}

/** True when the signed-in user may edit/delete this farm (owner or admin, contract 4). */
export function canManageFarm(farm, user = getUser()) {
  if (!farm || !user) return false
  if (user.role === 'admin') return true
  const me = user.user_id || user.id
  // /farmer/farms only returns the caller's own farms; when owner_id is present, double-check it.
  // The backend still enforces owner-or-admin with 403 (contract 4).
  if (!farm.owner_id) return true
  return !!me && String(farm.owner_id) === String(me)
}
