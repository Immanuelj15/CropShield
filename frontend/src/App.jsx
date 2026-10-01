import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Leaf, AlertTriangle, Clock, Menu, X, Sprout, Map, Mic, ShieldCheck, Lock, LogOut, Settings, Compass, MapPin, Bell, Sparkles, Calendar, Wallet, Camera, Satellite, FlaskConical, BarChart3 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import YieldPage from './pages/YieldPage'
import OutbreakMapPage from './pages/OutbreakMapPage'
import RegionalScanPage from './pages/RegionalScanPage'
import HistoryPage from './pages/HistoryPage'
import FeaturesPage from './pages/FeaturesPage'
import ExpertPortalPage from './pages/ExpertPortalPage'
import LoginPage from './pages/LoginPage'
import FarmerDashboard from './pages/FarmerDashboard'
import AgronomistDashboard from './pages/AgronomistDashboard'
import AdminDashboard from './pages/AdminDashboard'
import NotificationSettingsPage from './pages/NotificationSettingsPage'
import CropRecommendationPage from './pages/CropRecommendationPage'
import FarmActivityPlannerPage from './pages/FarmActivityPlannerPage'
import SoilHealthAnalyzerPage from './pages/SoilHealthAnalyzerPage'
import ExpenseTrackerPage from './pages/ExpenseTrackerPage'
import ManageMyFarmPage from './pages/ManageMyFarmPage'
import DiseaseScanPage from './pages/DiseaseScanPage'
import VoiceAssistantModal from './components/VoiceAssistantModal'
import ChatbotWidget from './components/ChatbotWidget'
import OfflineBanner from './components/OfflineBanner'
import LanguageSelector from './components/LanguageSelector'
import Sidebar from './components/ui/Sidebar'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { getToken, getUser, getUserCacheId, logout, AUTH_CHANGED_EVENT } from './utils/http'
import clsx from 'clsx'

// Ensure stale localStorage tokens from previous sessions do not bypass login
try {
  if (!getToken()) {
    localStorage.removeItem('cropshield_token')
    localStorage.removeItem('cropshield_user')
  }
  // Legacy unscoped warning cache could belong to a previous user on a shared phone
  localStorage.removeItem('cropshield_last_warning')
} catch {
  // Ignore storage access errors
}

// Single source of truth for the session lives in utils/http.js
const getAuthToken = getToken
const getAuthUser = getUser

function ProtectedRoute({ children }) {
  const location = useLocation()
  const token = getAuthToken()
  const user = getAuthUser()

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

function RoleRoute({ children, allowedRoles }) {
  const location = useLocation()
  const token = getAuthToken()
  const user = getAuthUser()

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'farmer') return <Navigate to="/farmer/today" replace />
    if (user.role === 'agronomist') return <Navigate to="/agronomist/dashboard" replace />
    if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />
    return <Navigate to="/login" replace />
  }

  return children
}

function HomeRedirect() {
  const token = getAuthToken()
  const user = getAuthUser()
  if (!token || !user) return <Navigate to="/login" replace />
  if (user.role === 'farmer') return <Navigate to="/farmer/today" replace />
  if (user.role === 'agronomist') return <Navigate to="/agronomist/dashboard" replace />
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Navigate to="/farmer/today" replace />
}

function getNavItemsForRole(role, t) {
  if (role === 'agronomist') {
    return [
      { to: '/agronomist/dashboard', label: t('nav_threat_queue', 'Threat Queue'), icon: ShieldCheck },
      { to: '/expert', label: t('nav_review_desk', 'AI Review Desk'), icon: Compass },
      { to: '/regional-scan', label: t('nav_satellite_scan', 'Satellite Scan'), icon: Satellite },
      { to: '/outbreak', label: t('nav_outbreak', 'Outbreak Map'), icon: Map },
      { to: '/yield', label: t('nav_yield', 'Yield Predictor'), icon: Sprout },
      { to: '/features', label: t('nav_features', 'Model Features'), icon: BarChart3 },
    ]
  }
  if (role === 'admin') {
    return [
      { to: '/admin/dashboard', label: t('nav_admin_center', 'Admin Center'), icon: Settings },
      { to: '/agronomist/dashboard', label: t('nav_agronomist_ops', 'Agronomist Ops'), icon: ShieldCheck },
      { to: '/expert', label: t('nav_review_desk', 'AI Review Desk'), icon: Compass },
      { to: '/farmer/today', label: t('nav_farmer_view', 'Farmer View'), icon: Leaf },
      { to: '/regional-scan', label: t('nav_satellite_scan', 'Satellite Scan'), icon: Satellite },
      { to: '/outbreak', label: t('nav_outbreak', 'Outbreak Map'), icon: Map },
      { to: '/features', label: t('nav_features', 'Model Features'), icon: BarChart3 },
      { to: '/farmer/notifications', label: t('nav_delivery_pwa', 'Delivery & PWA'), icon: Bell },
    ]
  }
  // Default: farmer
  return [
    { to: '/farmer/today', label: t('nav_today', "Today's Warning"), icon: AlertTriangle },
    { to: '/farmer/detect', label: t('nav_disease_scan', 'Disease Scanner'), icon: Camera },
    { to: '/farmer/expenses', label: t('nav_pnl_tracker', 'P&L Tracker'), icon: Wallet },
    { to: '/farmer/manage-farms', label: t('nav_manage_farms', 'Manage Farms'), icon: MapPin },
    { to: '/farmer/soil-health', label: t('nav_soil_health', 'Soil Health'), icon: FlaskConical },
    { to: '/farmer/crop-recommendation', label: t('nav_crop_advisor', 'Crop Advisor'), icon: Sparkles },
    { to: '/farmer/activity-planner', label: t('nav_activity_planner', 'Activity Planner'), icon: Calendar },
    { to: '/regional-scan', label: t('nav_draw_scan', 'Draw-to-Scan'), icon: Satellite },
    { to: '/yield', label: t('nav_yield', 'Yield Predictor'), icon: Sprout },
    { to: '/outbreak', label: t('nav_outbreak', 'Outbreak Map'), icon: Map },
    { to: '/history', label: t('nav_history', 'Field History'), icon: Clock },
    { to: '/farmer/notifications', label: t('nav_alert_channels', 'Alert Channels'), icon: Bell },
  ]
}

// Role accents (design system): farmer = brand, agronomist = sky-700, admin = violet-700.
const ROLE_STYLES = {
  farmer: {
    badge: 'bg-brand-50 text-brand-700 border-brand-200',
    dot: 'bg-brand-600',
    active: 'bg-brand-50 text-brand-800 border-brand-200',
    icon: 'text-brand-600',
  },
  agronomist: {
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-700',
    active: 'bg-sky-50 text-sky-800 border-sky-200',
    icon: 'text-sky-700',
  },
  admin: {
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    dot: 'bg-violet-700',
    active: 'bg-violet-50 text-violet-800 border-violet-200',
    icon: 'text-violet-700',
  },
}

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'

function Navbar() {
  const { t } = useTranslation(['common', 'auth'])
  const navigate = useNavigate()
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  const [open, setOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(getAuthUser())

  useEffect(() => {
    const handleAuthChange = () => {
      setCurrentUser(getAuthUser())
    }
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange)
    window.addEventListener('storage', handleAuthChange)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  // Close the mobile menu whenever the route changes (incl. browser back/forward).
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const handleLogout = () => {
    // Clears session, per-user caches, SW API caches and the push subscription (best effort).
    logout()
    setCurrentUser(null)
    navigate('/login', { replace: true })
  }

  const roleNames = {
    farmer: t('role_farmer', 'Farmer'),
    agronomist: t('role_agronomist', 'Agronomist'),
    admin: t('role_admin', 'System Admin'),
  }
  const roleStyle = ROLE_STYLES[currentUser?.role] || {
    badge: 'bg-stone-100 text-stone-700 border-stone-200',
    dot: 'bg-stone-500',
    active: 'bg-stone-100 text-stone-900 border-stone-200',
    icon: 'text-stone-600',
  }
  const roleName = roleNames[currentUser?.role] || currentUser?.role || 'User'

  const navItems = getNavItemsForRole(currentUser?.role, t)
  const showApp = !!currentUser && !isLoginPage
  const voiceLabel = t('ask_assistant', 'Voice Assistant')

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
        <div className="w-full max-w-[1550px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 gap-2 xl:gap-4">
            {/* Logo */}
            <NavLink to={currentUser ? '/' : '/login'} className={clsx('flex items-center gap-2.5 shrink-0 group rounded-xl', FOCUS_RING)} aria-label={t('app_name', 'AgriGuard AI')}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform shrink-0" aria-hidden="true">
                <Leaf size={19} className="text-white" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-stone-900 whitespace-nowrap">
                  AgriGuard <span className="text-brand-600">AI</span>
                </span>
                <span className="hidden 2xl:inline-flex items-center text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Tamil Nadu
                </span>
              </div>
            </NavLink>

            {/* Desktop Navigation Links — Farmer only; Agronomist/Admin get a Sidebar instead (see AppRoutes) */}
            {showApp && currentUser.role !== 'agronomist' && currentUser.role !== 'admin' && (
              <nav aria-label={t('main_navigation', 'Main navigation')} className="hidden lg:flex items-center gap-1 xl:gap-1.5 justify-start 2xl:justify-center flex-1 min-w-0 px-2 overflow-x-auto no-scrollbar py-1">
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={label}
                    className={({ isActive }) => clsx(
                      'flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-xl text-xs xl:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 border',
                      FOCUS_RING,
                      isActive
                        ? clsx(roleStyle.active, 'font-bold shadow-sm')
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 border-transparent'
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={15} className={clsx('shrink-0', isActive ? roleStyle.icon : 'text-stone-500')} aria-hidden="true" />
                        <span>{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            )}

            {/* Right Action Buttons — Language selector, role badge, voice, sign in/out */}
            <div className="hidden lg:flex items-center gap-2 xl:gap-2.5 shrink-0">
              <LanguageSelector />
              {isLoginPage ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-50 rounded-xl border border-brand-200">
                  <ShieldCheck size={14} className="text-brand-700" aria-hidden="true" />
                  <span className="text-xs font-bold text-brand-800 tracking-wide">
                    {t('secure_sign_in', 'Secure Sign-In')}
                  </span>
                </div>
              ) : currentUser ? (
                <>
                  {/* Role badge (hidden on smaller lg screens to preserve nav space) */}
                  <div
                    className={clsx('hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold tracking-wide select-none', roleStyle.badge)}
                    title={currentUser.email}
                  >
                    <span className={clsx('w-2 h-2 rounded-full shrink-0', roleStyle.dot)} aria-hidden="true" />
                    <span>{roleName}</span>
                  </div>

                  {/* Logout Button */}
                  <button
                    type="button"
                    onClick={handleLogout}
                    title={t('auth:sign_out', 'Sign Out')}
                    aria-label={t('auth:sign_out', 'Sign Out')}
                    className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-stone-600 hover:text-red-700 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition-colors whitespace-nowrap', FOCUS_RING)}
                  >
                    <LogOut size={14} className="shrink-0" aria-hidden="true" />
                    <span className="hidden xl:inline">{t('auth:sign_out', 'Sign Out')}</span>
                  </button>

                  {/* Voice Assistant Button (Tamil / English) */}
                  <button
                    type="button"
                    onClick={() => setVoiceOpen(true)}
                    title={`${voiceLabel} — வேளாண் வழிகாட்டி`}
                    className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-colors whitespace-nowrap shrink-0 group', FOCUS_RING)}
                  >
                    <Mic size={14} className="shrink-0 group-hover:scale-110 transition-transform" aria-hidden="true" />
                    <span className="hidden xl:inline">{voiceLabel}</span>
                    <span className="sr-only xl:hidden">{voiceLabel}</span>
                  </button>
                </>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) => clsx(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap border',
                    FOCUS_RING,
                    isActive
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'bg-brand-50 text-brand-700 hover:bg-brand-100 border-brand-200'
                  )}
                >
                  <Lock size={14} className="shrink-0" aria-hidden="true" />
                  <span>{t('auth:sign_in', 'Sign In')}</span>
                </NavLink>
              )}
            </div>

            {/* Mobile / Tablet Controls */}
            <div className="flex items-center gap-2 lg:hidden">
              {showApp && (
                <button
                  type="button"
                  onClick={() => setVoiceOpen(true)}
                  aria-label={voiceLabel}
                  title={voiceLabel}
                  className={clsx('p-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-1.5 shadow-sm', FOCUS_RING)}
                >
                  <Mic size={18} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className={clsx('p-2 rounded-lg text-stone-700 hover:bg-stone-100', FOCUS_RING)}
                onClick={() => setOpen(o => !o)}
                aria-label={open ? t('close_menu', 'Close menu') : t('open_menu', 'Open menu')}
                aria-expanded={open}
                aria-controls="mobile-menu"
              >
                {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu — same nav items as the desktop top-nav / sidebar for every role */}
        {open && (
          <div id="mobile-menu" className="lg:hidden border-t border-stone-200 bg-white px-4 py-3 flex flex-col gap-2 shadow-lg animate-fade-in max-h-[calc(100vh-4rem)] overflow-y-auto">
            {/* Language Selector in mobile menu */}
            <div className="pb-2 border-b border-stone-100">
              <LanguageSelector variant="pill" className="w-full" />
            </div>

            {currentUser ? (
              <>
                <div className={clsx('px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-between gap-3', roleStyle.badge)}>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={clsx('w-2 h-2 rounded-full', roleStyle.dot)} aria-hidden="true" />
                    <span>{roleName}</span>
                  </div>
                  <span className="text-xs font-normal truncate min-w-0">{currentUser.email}</span>
                </div>
                {!isLoginPage && (
                  <nav aria-label={t('main_navigation', 'Main navigation')} className="py-1 flex flex-col gap-1">
                    {navItems.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) => clsx(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors border',
                          FOCUS_RING,
                          isActive
                            ? clsx(roleStyle.active, 'font-bold')
                            : 'text-stone-700 hover:bg-stone-50 border-transparent'
                        )}
                      >
                        {({ isActive }) => (
                          <>
                            <Icon size={18} className={clsx('shrink-0', isActive ? roleStyle.icon : 'text-stone-500')} aria-hidden="true" />
                            <span className="truncate">{label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </nav>
                )}
                <div className="pt-2 border-t border-stone-100 flex flex-col gap-2 mt-1">
                  {!isLoginPage && (
                    <button
                      type="button"
                      onClick={() => { setOpen(false); setVoiceOpen(true) }}
                      className={clsx('w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold shadow-sm hover:bg-brand-700', FOCUS_RING)}
                    >
                      <Mic size={16} aria-hidden="true" />
                      <span>{voiceLabel}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setOpen(false); handleLogout() }}
                    className={clsx('w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50 border border-red-200', FOCUS_RING)}
                  >
                    <LogOut size={16} className="shrink-0" aria-hidden="true" />
                    <span>{t('auth:sign_out', 'Sign Out')}</span>
                  </button>
                </div>
              </>
            ) : isLoginPage ? (
              <div className="px-3 py-2 text-xs font-semibold text-brand-800 bg-brand-50 rounded-lg flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand-700 shrink-0" aria-hidden="true" />
                {t('secure_sign_in', 'Secure Sign-In')}
              </div>
            ) : (
              <NavLink
                to="/login"
                onClick={() => setOpen(false)}
                className={clsx('flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold bg-brand-600 text-white hover:bg-brand-700', FOCUS_RING)}
              >
                <Lock size={16} className="shrink-0" aria-hidden="true" />
                <span>{t('auth:sign_in', 'Sign In')}</span>
              </NavLink>
            )}
          </div>
        )}
      </header>

      {/* keyed by user so chat history never carries over to the next login */}
      <VoiceAssistantModal key={getUserCacheId(currentUser) || 'anon'} isOpen={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </>
  )
}

function Footer() {
  const { t } = useTranslation('common')
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white px-4 pt-8 pb-28 lg:pb-8 text-center text-xs text-stone-500 space-y-1">
      <p className="font-semibold text-stone-700">AgriGuard AI — {t('footer_subtitle', 'Pure Software Multi-Role Architecture v2.0.0 · Tamil Nadu & India')}</p>
      <p>
        {t('footer_tech', 'NASA POWER Satellite Reanalysis (1980–2025) · Tree-SHAP XAI · Prescriptive Counterfactual Engine · Haversine Spatial Clustering')}
      </p>
      <p className="text-xs text-stone-500">Pure-Software Implementation · No Hardware/IoT Sensor Dependencies · TNAU & ICAR Knowledge Integrations</p>
    </footer>
  )
}

// Per-route error boundary: a crash on one screen no longer blanks the whole app,
// and navigating to another route resets it.
function RouteErrorBoundary({ children }) {
  const location = useLocation()
  return (
    <ErrorBoundary variant="route" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  )
}

function AppRoutes() {
  const { t } = useTranslation('common')
  const [currentUser, setCurrentUser] = useState(getAuthUser())

  useEffect(() => {
    const handleAuthChange = () => setCurrentUser(getAuthUser())
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange)
    window.addEventListener('storage', handleAuthChange)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  const showSidebar = !!currentUser && !isLoginPage && (currentUser.role === 'agronomist' || currentUser.role === 'admin')
  const sidebarItems = showSidebar
    ? getNavItemsForRole(currentUser.role, t).map(({ to, label, icon }) => ({ to, label, icon }))
    : []

  const routes = (
    <Routes>
          {/* Public Authentication Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Dynamic Root Redirection based on role */}
          <Route path="/" element={<HomeRedirect />} />

          {/* Role-Specific Primary Dashboards */}
          <Route
            path="/farmer/today"
            element={
              <RoleRoute allowedRoles={['farmer', 'admin']}>
                <FarmerDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/farmer/notifications"
            element={
              <ProtectedRoute>
                <NotificationSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/soil-health"
            element={
              <RoleRoute allowedRoles={['farmer', 'admin']}>
                <SoilHealthAnalyzerPage />
              </RoleRoute>
            }
          />
          <Route
            path="/soil-health"
            element={<Navigate to="/farmer/soil-health" replace />}
          />
          <Route
            path="/farmer/crop-recommendation"
            element={
              <RoleRoute allowedRoles={['farmer', 'admin']}>
                <CropRecommendationPage />
              </RoleRoute>
            }
          />
          <Route
            path="/crop-recommendation"
            element={<Navigate to="/farmer/crop-recommendation" replace />}
          />
          <Route
            path="/farmer/expenses"
            element={
              <RoleRoute allowedRoles={['farmer', 'admin']}>
                <ExpenseTrackerPage />
              </RoleRoute>
            }
          />
          <Route
            path="/expenses"
            element={<Navigate to="/farmer/expenses" replace />}
          />
          <Route
            path="/farmer/manage-farms"
            element={
              <RoleRoute allowedRoles={['farmer', 'admin']}>
                <ManageMyFarmPage />
              </RoleRoute>
            }
          />
          <Route
            path="/manage-farms"
            element={<Navigate to="/farmer/manage-farms" replace />}
          />
          <Route
            path="/farmer/activity-planner"
            element={
              <RoleRoute allowedRoles={['farmer', 'admin']}>
                <FarmActivityPlannerPage />
              </RoleRoute>
            }
          />
          <Route
            path="/activity-planner"
            element={<Navigate to="/farmer/activity-planner" replace />}
          />
          <Route
            path="/agronomist/dashboard"
            element={
              <RoleRoute allowedRoles={['agronomist', 'admin']}>
                <AgronomistDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </RoleRoute>
            }
          />

          {/* Role Sub-Route Aliases */}
          <Route path="/farmer" element={<Navigate to="/farmer/today" replace />} />
          <Route path="/agronomist" element={<Navigate to="/agronomist/dashboard" replace />} />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Direct Leaf Disease Vision Scanner */}
          <Route path="/farmer/detect" element={<ProtectedRoute><DiseaseScanPage /></ProtectedRoute>} />
          <Route path="/detect" element={<Navigate to="/farmer/detect" replace />} />

          {/* Quick Route Aliases */}
          <Route path="/farmer/crops" element={<Navigate to="/farmer/crop-recommendation" replace />} />
          <Route path="/crops" element={<Navigate to="/farmer/crop-recommendation" replace />} />
          <Route path="/farmer/map" element={<Navigate to="/farmer/manage-farms" replace />} />
          <Route path="/map" element={<Navigate to="/farmer/manage-farms" replace />} />
          <Route path="/farmer/soil" element={<Navigate to="/farmer/soil-health" replace />} />
          <Route path="/soil" element={<Navigate to="/farmer/soil-health" replace />} />
          <Route path="/today" element={<Navigate to="/farmer/today" replace />} />

          {/* Shared Analytical & Diagnostic Tools */}
          <Route path="/regional-scan" element={<ProtectedRoute><RegionalScanPage /></ProtectedRoute>} />
          <Route path="/yield" element={<ProtectedRoute><YieldPage /></ProtectedRoute>} />
          <Route path="/outbreak" element={<ProtectedRoute><OutbreakMapPage /></ProtectedRoute>} />
          <Route path="/expert" element={<RoleRoute allowedRoles={['agronomist', 'admin']}><ExpertPortalPage /></RoleRoute>} />
          <Route path="/features" element={<ProtectedRoute><FeaturesPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />

          {/* Fallback to root router */}
          <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )

  return (
    <>
      <OfflineBanner />
      <Navbar />
      {showSidebar ? (
        <div className="flex items-start max-w-[1550px] mx-auto">
          <Sidebar
            items={sidebarItems}
            accent={currentUser.role === 'admin' ? 'violet' : 'sky'}
            className="sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-y-auto"
          />
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8"><RouteErrorBoundary>{routes}</RouteErrorBoundary></main>
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><RouteErrorBoundary>{routes}</RouteErrorBoundary></main>
      )}
      <Footer />
      {/* /chatbot/ask requires auth, so the widget is only offered to signed-in users (anonymous use always failed).
          Keyed by user so chatbot history resets on logout / user switch. */}
      {currentUser && !isLoginPage && <ChatbotWidget key={getUserCacheId(currentUser)} userRole={currentUser.role} />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  )
}
