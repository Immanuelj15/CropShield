/**
 * Shared auth + fetch layer for the AgriGuard PWA.
 *
 * - Session lives in sessionStorage (`cropshield_token`, `cropshield_user`).
 * - `apiFetch()` attaches the Bearer token, handles FormData, parses JSON safely,
 *   normalizes FastAPI error `detail` (string | [{msg, loc}]) into a readable string,
 *   and on 401 clears the session and redirects to /login exactly once.
 * - `logout()` clears the session plus per-user caches, API service-worker caches
 *   and (best effort) the push subscription.
 */

export const TOKEN_KEY = 'cropshield_token'
export const USER_KEY = 'cropshield_user'
export const AUTH_CHANGED_EVENT = 'cropshield_auth_changed'

const BASE = import.meta.env.VITE_API_BASE_URL || ''
export const API_PREFIX = `${BASE}/api/v1`

// Service-worker runtime caches that may hold API responses (see src/sw.js).
export const API_CACHE_NAMES = ['agriguard-advisory-library', 'agriguard-public-api']

// ── Session ──────────────────────────────────────────────────────────────────
export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getUser() {
  if (!getToken()) return null
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Stable per-user key used to namespace client-side caches. */
export function getUserCacheId(user = getUser()) {
  if (!user) return null
  return user.user_id || user.id || user.email || null
}

/** Build a localStorage key scoped to the current user (null when logged out). */
export function userScopedKey(base) {
  const id = getUserCacheId()
  return id ? `${base}:${id}` : null
}

export function setSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  // Clean out legacy localStorage so no stale tokens persist
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch { /* ignore */ }
  redirectingToLogin = false
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

export function authHeaders(extra = {}) {
  const token = getToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra }
}

// ── Error normalization (contract 12) ────────────────────────────────────────
function formatValidationItem(item) {
  if (item == null) return ''
  if (typeof item === 'string') return item
  if (typeof item === 'object') {
    const msg = item.msg || item.message || item.detail || ''
    const loc = Array.isArray(item.loc)
      ? item.loc.filter((p) => p !== 'body' && p !== 'query' && p !== 'path').join('.')
      : ''
    if (msg && loc) return `${loc}: ${msg}`
    if (msg) return String(msg)
    try { return JSON.stringify(item) } catch { return '' }
  }
  return String(item)
}

/**
 * Convert anything error-like (FastAPI `detail`, a response body, an Error, a string)
 * into a human readable string that is always safe to render as a React child.
 */
export function normalizeError(input, fallback = 'Something went wrong. Please try again.') {
  if (input == null || input === '') return fallback
  if (typeof input === 'string') return input
  if (Array.isArray(input)) {
    const parts = input.map(formatValidationItem).filter(Boolean)
    return parts.length ? parts.join('; ') : fallback
  }
  if (input instanceof Error) {
    if (input.name === 'AbortError') return 'Request was cancelled.'
    if (input.name === 'TypeError' && /fetch|network/i.test(input.message || '')) {
      return 'Network error — check your connection and try again.'
    }
    return input.message ? normalizeError(input.message, fallback) : fallback
  }
  if (typeof input === 'object') {
    if ('detail' in input) return normalizeError(input.detail, fallback)
    if ('message' in input) return normalizeError(input.message, fallback)
    if ('msg' in input) return formatValidationItem(input) || fallback
    if ('error' in input) return normalizeError(input.error, fallback)
    return fallback
  }
  return String(input)
}

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, isNetwork = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    this.isNetwork = isNetwork
  }
}

/** True when the request never reached the server (offline / DNS / CORS). */
export function isNetworkError(err) {
  return !!err && err instanceof ApiError && err.isNetwork
}

export function isAbortError(err) {
  return !!err && (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED')
}

// ── 401 handling ─────────────────────────────────────────────────────────────
let redirectingToLogin = false

function isLoginRequest(url) {
  return /\/auth\/login(\?|$)/.test(url)
}

/** Clear the session and send the user to /login. Runs at most once until the next login. */
export function handleUnauthorized() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  // Fire-and-forget: local cleanup is synchronous enough for the redirect.
  logout({ skipServerUnsubscribe: true }).finally(() => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login?expired=1')
    } else {
      redirectingToLogin = false
    }
  })
}

// ── Fetch wrapper ────────────────────────────────────────────────────────────
export function resolveApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/api/')) return `${BASE}${path}`
  return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`
}

async function parseBody(res) {
  if (res.status === 204) return null
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * apiFetch(path, opts) → parsed response body (JSON, text or null).
 * Throws ApiError (with .status, .data, .isNetwork) on network failures and non-2xx.
 * AbortError is re-thrown untouched so callers can ignore cancelled requests.
 *
 * opts: standard fetch options plus
 *   - json: object to send as JSON body
 *   - skipAuthRedirect: don't redirect to /login on 401
 *   - auth: false to omit the Authorization header
 */
export async function apiFetch(path, opts = {}) {
  const { json, skipAuthRedirect = false, auth = true, headers: extraHeaders, ...rest } = opts
  const url = resolveApiUrl(path)
  const headers = { ...(extraHeaders || {}) }

  let body = rest.body
  if (json !== undefined) {
    body = JSON.stringify(json)
    headers['Content-Type'] = 'application/json'
  } else if (body && !(body instanceof FormData) && typeof body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  // For FormData let the browser set the multipart boundary.
  if (body instanceof FormData) delete headers['Content-Type']

  const token = auth ? getToken() : null
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(url, { ...rest, headers, body })
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new ApiError('Network error — check your connection and try again.', { isNetwork: true })
  }

  const data = await parseBody(res)

  if (!res.ok) {
    if (res.status === 401 && !skipAuthRedirect && !isLoginRequest(url)) {
      handleUnauthorized()
    }
    const fallback = res.status === 401
      ? 'Your session has expired. Please sign in again.'
      : res.status === 403
        ? 'You do not have permission to do that.'
        : res.status === 404
          ? 'Not found.'
          : `Request failed (${res.status})`
    throw new ApiError(normalizeError(data, fallback), { status: res.status, data })
  }

  return data
}

// ── Logout ───────────────────────────────────────────────────────────────────
const PER_USER_CACHE_PREFIXES = ['cropshield_last_warning']

async function unsubscribePushBestEffort(token, skipServer) {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = await Promise.race([
      navigator.serviceWorker.getRegistration(),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null
    if (sub) await sub.unsubscribe()
    if (!skipServer && token) {
      await fetch(`${API_PREFIX}/notifications/unsubscribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  } catch { /* best effort */ }
}

async function clearApiCaches() {
  try {
    if (typeof caches === 'undefined') return
    await Promise.all(API_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)))
  } catch { /* ignore */ }
}

/**
 * Clear everything tied to the signed-in user.
 * - sessionStorage (token, user, chat pulse flags, …)
 * - legacy localStorage tokens and per-user caches (cropshield_last_warning[:id])
 * - service-worker API caches
 * - push subscription (best effort)
 */
export async function logout({ skipServerUnsubscribe = false } = {}) {
  const token = getToken()
  const cacheId = getUserCacheId()

  try { sessionStorage.clear() } catch { /* ignore */ }
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    for (const prefix of PER_USER_CACHE_PREFIXES) {
      localStorage.removeItem(prefix)
      if (cacheId) localStorage.removeItem(`${prefix}:${cacheId}`)
    }
  } catch { /* ignore */ }

  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))

  await Promise.all([
    clearApiCaches(),
    unsubscribePushBestEffort(token, skipServerUnsubscribe),
  ])
}
