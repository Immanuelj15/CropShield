import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: `${BASE}/api/v1`,
  timeout: 35000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(cfg => {
  const token = sessionStorage.getItem('cropshield_token')
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  if (import.meta.env.DEV) console.log(`[API] ${cfg.method?.toUpperCase()} ${cfg.url}`)
  return cfg
})

api.interceptors.response.use(
  res => res,
  err => Promise.reject(new Error(err.response?.data?.detail || err.message || 'API error'))
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

export default api
