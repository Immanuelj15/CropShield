import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Mail, Lock, ArrowRight, CheckCircle2, Sprout, ShieldAlert, Sparkles, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import LanguageSelector from '../components/LanguageSelector'
import { apiFetch, getUser, logout, setSession, isNetworkError } from '../utils/http'

// Role accents follow the design system: farmer = brand, agronomist = sky-700, admin = violet-700.
const DEMO_ACCOUNTS = {
  farmer: {
    labelKey: 'role_farmer',
    email: 'farmer@cropshield.org',
    password: 'farmer123',
    role: 'farmer',
    descKey: 'farmer_desc',
    desc: "View today's pest warning, scan leaves, track expenses and plan farm activities.",
    icon: Sprout,
    badgeColor: 'bg-brand-50 text-brand-700 border-brand-200',
    iconActive: 'bg-brand-600 text-white',
    cardActive: 'border-brand-600 bg-brand-50/70 ring-2 ring-brand-500/20',
  },
  agronomist: {
    labelKey: 'role_agronomist',
    email: 'agronomist@cropshield.org',
    password: 'agro123',
    role: 'agronomist',
    descKey: 'agronomist_desc',
    desc: 'Review the AI threat queue, verify predictions and answer farmer support requests.',
    icon: Shield,
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    iconActive: 'bg-sky-700 text-white',
    cardActive: 'border-sky-700 bg-sky-50/70 ring-2 ring-sky-500/20',
  },
  admin: {
    labelKey: 'role_admin',
    email: 'admin@cropshield.org',
    password: 'admin123',
    role: 'admin',
    descKey: 'admin_desc',
    desc: 'Manage users, farms, risk thresholds, advisories and model status.',
    icon: ShieldAlert,
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
    iconActive: 'bg-violet-700 text-white',
    cardActive: 'border-violet-700 bg-violet-50/70 ring-2 ring-violet-500/20',
  },
}

const ROLE_HOME = {
  farmer: '/farmer/today',
  agronomist: '/agronomist/dashboard',
  admin: '/admin/dashboard',
}

const homeForRole = (role) => ROLE_HOME[role] || '/farmer/today'

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common', 'validation'])
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState('farmer')
  const [email, setEmail] = useState(DEMO_ACCOUNTS.farmer.email)
  const [password, setPassword] = useState(DEMO_ACCOUNTS.farmer.password)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('expired')
        ? t('auth:session_expired', 'Your session has expired. Please sign in again.')
        : null
    } catch {
      return null
    }
  })
  const [success, setSuccess] = useState(null)
  const [activeUser, setActiveUser] = useState(() => getUser())

  const selected = DEMO_ACCOUNTS[selectedRole]

  const handleRoleSelect = (roleKey) => {
    setSelectedRole(roleKey)
    setEmail(DEMO_ACCOUNTS[roleKey].email)
    setPassword(DEMO_ACCOUNTS[roleKey].password)
    setError(null)
  }

  const handleLogoutExisting = () => {
    logout()
    setActiveUser(null)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    setSuccess(null)

    // Backend logs in by email only (case-insensitive).
    const cleanEmail = email.trim()

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        json: { email: cleanEmail, password },
        auth: false,
        skipAuthRedirect: true,
      })
      if (!data?.access_token) {
        throw new Error(t('auth:invalid_credentials', 'Invalid email or password.'))
      }
      const role = data.role || 'farmer'
      const roleLabelKey = DEMO_ACCOUNTS[role]?.labelKey
      const userObj = {
        user_id: data.user_id || null,
        email: data.username || cleanEmail,
        role,
        name: data.name || (roleLabelKey ? t(`common:${roleLabelKey}`) : 'User'),
      }
      setSession(data.access_token, userObj)

      setActiveUser(userObj)
      setSuccess(t('auth:signing_in', 'Authenticating...'))

      setTimeout(() => navigate(homeForRole(userObj.role), { replace: true }), 500)
    } catch (err) {
      if (isNetworkError(err)) {
        setError(t('validation:network_error', 'Network error — check your connection and try again.'))
      } else {
        // err.message is the normalized FastAPI `detail` (string or 422 array → string)
        setError(err?.data?.detail ? err.message : t('auth:invalid_credentials', 'Invalid email or password.'))
      }
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 bg-white text-sm font-medium text-stone-800 placeholder:text-stone-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all disabled:bg-stone-100'

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6 animate-fade-in">
      {/* Prominent Language Bar for First-Launch / Pre-Login */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white border border-stone-200 rounded-2xl p-3 sm:px-5 shadow-sm gap-3">
        <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">
          {t('common:select_language', 'Language')}
        </span>
        <LanguageSelector variant="pill" />
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-brand-900 to-stone-900 rounded-3xl p-6 sm:p-10 text-white shadow-lg relative overflow-hidden border border-brand-900/40">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-500/20 text-brand-200 text-xs font-semibold rounded-full border border-brand-400/30 mb-3">
            <Sparkles size={14} aria-hidden="true" /> {t('common:app_name', 'AgriGuard AI')}
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            {t('auth:login_title', 'Sign In to AgriGuard AI')}
          </h1>
          <p className="mt-3 text-stone-300 text-sm leading-relaxed">
            {t('auth:login_subtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Role Selector Card */}
        <div className="lg:col-span-5">
          <div className="card p-5 sm:p-6">
            <h2 id="role-heading" className="font-bold text-stone-800 text-sm uppercase tracking-wider mb-4">
              {t('auth:role', 'Account Role')}
            </h2>
            <div role="radiogroup" aria-labelledby="role-heading" className="space-y-3">
              {Object.entries(DEMO_ACCOUNTS).map(([key, item]) => {
                const Icon = item.icon
                const isSelected = selectedRole === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleRoleSelect(key)}
                    className={clsx(
                      'w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                      isSelected ? clsx(item.cardActive, 'shadow-sm') : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    )}
                  >
                    <div className={clsx('p-2 rounded-lg shrink-0', isSelected ? item.iconActive : 'bg-stone-100 text-stone-600')} aria-hidden="true">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-stone-900">{t(`common:${item.labelKey}`)}</span>
                        {isSelected && <CheckCircle2 size={16} className="text-brand-600 shrink-0" aria-hidden="true" />}
                      </div>
                      <p className="text-xs text-stone-500 mt-1 leading-snug">{t(`common:${item.descKey}`, item.desc)}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Login Form Card */}
        <div className="lg:col-span-7">
          <div className="card p-5 sm:p-8 space-y-6">
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-stone-900">{t('auth:sign_in', 'Sign In')}</h2>
                <span className={clsx('text-xs px-2.5 py-1 rounded-full font-semibold border', selected.badgeColor)}>
                  {t(`common:${selected.labelKey}`)}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1">{t(`common:${selected.descKey}`, selected.desc)}</p>
            </div>

            {activeUser && (
              <div className="p-4 rounded-xl bg-brand-50 border border-brand-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-bold text-brand-900 block">{t('auth:already_signed_in', 'Already signed in')}</span>
                  <span className="text-stone-600 break-all">{activeUser.email} ({t(`common:role_${activeUser.role}`, activeUser.role)})</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(homeForRole(activeUser.role))}
                    className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-bold text-xs hover:bg-brand-700 shadow-sm focus-ring"
                  >
                    {t('auth:go_to_dashboard', 'Go to Dashboard')}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogoutExisting}
                    className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-700 font-semibold text-xs hover:bg-stone-50 focus-ring"
                  >
                    {t('auth:sign_out', 'Sign Out')}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {error}
              </div>
            )}

            {success && (
              <div role="status" className="p-3.5 rounded-xl bg-brand-50 border border-brand-200 text-brand-800 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 size={16} className="text-brand-600" aria-hidden="true" /> {success}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('auth:email_or_username', 'Email Address')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400" aria-hidden="true">
                    <Mail size={16} />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className={inputCls}
                    placeholder="name@cropshield.org"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  {t('auth:password', 'Password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400" aria-hidden="true">
                    <Lock size={16} />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className={clsx(inputCls, 'pr-11')}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth:hide_password', 'Hide password') : t('auth:show_password', 'Show password')}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-stone-500 hover:text-stone-800 rounded-r-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading || undefined}
                className="w-full py-3 px-4 rounded-xl bg-brand-600 text-white font-bold text-sm shadow-sm hover:bg-brand-700 active:bg-brand-800 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                {loading ? (
                  <>
                    <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    {t('auth:signing_in', 'Authenticating...')}
                  </>
                ) : (
                  <>
                    {`${t('auth:sign_in', 'Sign In')} (${t(`common:${selected.labelKey}`)})`}
                    <ArrowRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-stone-100 text-center">
              <p className="text-xs text-stone-500">
                {t('auth:demo_credentials_note', 'Demo accounts: credentials for the selected role are pre-filled.')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
