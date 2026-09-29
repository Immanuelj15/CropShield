import axios from 'axios'
import { API_PREFIX, getToken, handleUnauthorized, normalizeError } from './http'

const api = axios.create({
  baseURL: API_PREFIX,
  timeout: 35000,
  headers: { 'Content-Type': 'application/json' },
})

// Same token source as utils/http.js (sessionStorage.cropshield_token)
api.interceptors.request.use(cfg => {
  const token = getToken()
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  if (typeof FormData !== 'undefined' && cfg.data instanceof FormData && cfg.headers) {
    // Let the browser set the multipart boundary
    delete cfg.headers['Content-Type']
  }
  if (import.meta.env.DEV) console.log(`[API] ${cfg.method?.toUpperCase()} ${cfg.url}`)
  return cfg
})

api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status
    const url = err.config?.url || ''
    if (status === 401 && !/\/auth\/login/.test(url)) {
      handleUnauthorized()
    }
    const message = err.response
      ? normalizeError(err.response.data, `Request failed (${status})`)
      : normalizeError(err, 'Network error — check your connection and try again.')
    const wrapped = new Error(message)
    wrapped.status = status || 0
    wrapped.data = err.response?.data
    wrapped.isNetwork = !err.response && err.code !== 'ERR_CANCELED'
    wrapped.name = err.code === 'ERR_CANCELED' ? 'CanceledError' : 'ApiError'
    return Promise.reject(wrapped)
  }
)

// ── Primary: Today's pest warning ────────────────────────────
export const getTodayWarning = (payload) =>
  api.post('/predict-today', payload).then(r => r.data)

// ── Detection ─────────────────────────────────────────────────
export const detectPests = (payload) =>
  api.post('/detect', payload).then(r => r.data)

// ── Features ──────────────────────────────────────────────────
export const getFeatures = (params) =>
  api.get('/features', { params }).then(r => r.data)

// ── Weather ───────────────────────────────────────────────────
export const getCurrentWeather = (params) =>
  api.get('/weather/current', { params }).then(r => r.data)

// ── History ───────────────────────────────────────────────────
export const getHistory = (params) =>
  api.get('/history', { params }).then(r => r.data)

// ── Multi-Channel Notification Delivery & PWA Web Push ────────
export const getVapidPublicKey = () =>
  api.get('/notifications/vapid-public-key').then(r => r.data)

export const getNotificationPreferences = () =>
  api.get('/notifications/preferences').then(r => r.data)

export const updateNotificationPreferences = (payload) =>
  api.put('/notifications/preferences', payload).then(r => r.data)

export const subscribePush = (subscription) =>
  api.post('/notifications/subscribe', subscription).then(r => r.data)

export const unsubscribePush = () =>
  api.post('/notifications/unsubscribe').then(r => r.data)

export const sendTestNotification = (payload = {}) =>
  api.post('/notifications/test', payload).then(r => r.data)

export const getNotificationLogs = (limit = 20) =>
  api.get('/notifications/logs', { params: { limit } }).then(r => r.data)

// ── User Language Preference ──────────────────────────────────
export const updateUserLanguage = (language) =>
  api.put('/users/me/language', { language }).then(r => r.data)

export default api
