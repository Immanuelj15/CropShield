import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Leaf, AlertTriangle, Clock, Menu, X, Sprout, Map, Mic, ShieldCheck, Lock, LogOut, User as UserIcon, Settings, Compass, MapPin, Bell, Sparkles, Calendar } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import TodayPage from './pages/TodayPage'
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
import VoiceAssistantModal from './components/VoiceAssistantModal'
import ChatbotWidget from './components/ChatbotWidget'
import OfflineBanner from './components/OfflineBanner'
import LanguageSelector from './components/LanguageSelector'
import clsx from 'clsx'

// Ensure stale localStorage tokens from previous sessions do not bypass login
try {
  if (!sessionStorage.getItem('cropshield_token')) {
    localStorage.removeItem('cropshield_token')
    localStorage.removeItem('cropshield_user')
  }
} catch {
  // Ignore storage access errors
}

function getAuthToken() {
  return sessionStorage.getItem('cropshield_token')
}

function getAuthUser() {
  const token = getAuthToken()
  if (!token) return null
  const rawUser = sessionStorage.getItem('cropshield_user')
  try {
    return rawUser ? JSON.parse(rawUser) : null
  } catch {
    return null
  }
}

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
      { to: '/regional-scan', label: t('nav_satellite_scan', 'Satellite Scan'), icon: MapPin },
      { to: '/outbreak', label: t('nav_outbreak', 'Outbreak Map'), icon: Map },
      { to: '/yield', label: t('nav_yield', 'Yield Impact'), icon: Sprout },
    ]
  }
  if (role === 'admin') {
    return [
      { to: '/admin/dashboard', label: t('nav_admin_center', 'Admin Center'), icon: Settings },
      { to: '/agronomist/dashboard', label: t('nav_agronomist_ops', 'Agronomist Ops'), icon: ShieldCheck },
      { to: '/farmer/today', label: t('nav_farmer_view', 'Farmer View'), icon: Leaf },
      { to: '/regional-scan', label: t('nav_satellite_scan', 'Spatial Scan'), icon: MapPin },
      { to: '/outbreak', label: t('nav_outbreak', 'Outbreak Map'), icon: Map },
      { to: '/farmer/notifications', label: t('nav_delivery_pwa', 'Delivery & PWA'), icon: Bell },
    ]
  }
  // Default: farmer
  return [
    { to: '/farmer/today', label: t('nav_today', "Today's Warning"), icon: AlertTriangle },
    { to: '/farmer/soil-health', label: t('nav_soil_health', 'Soil Health'), icon: Compass },
    { to: '/farmer/crop-recommendation', label: t('nav_crop_advisor', 'Crop Advisor'), icon: Sparkles },
    { to: '/farmer/activity-planner', label: t('nav_activity_planner', 'Activity Planner'), icon: Calendar },
    { to: '/regional-scan', label: t('nav_draw_scan', 'Draw-to-Scan'), icon: MapPin },
    { to: '/yield', label: t('nav_yield', 'Yield Predictor'), icon: Sprout },
    { to: '/outbreak', label: t('nav_outbreak', 'Outbreak Map'), icon: Map },
    { to: '/history', label: t('nav_history', 'Field History'), icon: Clock },
    { to: '/farmer/notifications', label: t('nav_alert_channels', 'Alert Channels'), icon: Bell },
  ]
}

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
    window.addEventListener('cropshield_auth_changed', handleAuthChange)
    window.addEventListener('storage', handleAuthChange)
    return () => {
      window.removeEventListener('cropshield_auth_changed', handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  const handleLogout = () => {
    sessionStorage.clear()
    localStorage.removeItem('cropshield_token')
    localStorage.removeItem('cropshield_user')
    setCurrentUser(null)
    window.dispatchEvent(new Event('cropshield_auth_changed'))
    navigate('/login', { replace: true })
  }

  const roleMeta = {
    farmer: {
      name: t('role_farmer', 'Farmer'),
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-300/80',
      dot: 'bg-emerald-500',
    },
    agronomist: {
      name: t('role_agronomist', 'Agronomist'),
      badge: 'bg-sky-50 text-sky-800 border-sky-300/80',
      dot: 'bg-sky-500',
    },
    admin: {
      name: t('role_admin', 'System Admin'),
      badge: 'bg-purple-50 text-purple-800 border-purple-300/80',
      dot: 'bg-purple-500',
    },
  }

  const currentRoleMeta = roleMeta[currentUser?.role] || {
    name: 'User',
    badge: 'bg-stone-100 text-stone-700 border-stone-200',
    dot: 'bg-stone-400',
  }

  const navItems = getNavItemsForRole(currentUser?.role, t)

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
        <div className="w-full max-w-[1550px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 gap-2 xl:gap-4">
            {/* Logo */}
            <NavLink to={currentUser ? '/' : '/login'} className="flex items-center gap-2.5 shrink-0 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-700 to-teal-600 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                <Leaf size={19} className="text-white" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-stone-900 whitespace-nowrap">
                  AgriGuard <span className="text-emerald-600">AI</span>
                </span>
                <span className="hidden 2xl:inline-flex items-center text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Tamil Nadu
                </span>
              </div>
            </NavLink>

            {/* Desktop Navigation Links — Dynamic per role with crisp spacing */}
            {currentUser && !isLoginPage && (
              <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 justify-center flex-1 min-w-0 px-2">
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => clsx(
                      'flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-xl text-xs xl:text-[13px] font-semibold transition-all whitespace-nowrap',
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-300/80 shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80 border border-transparent'
                    )}
                  >
                    <Icon size={15} className="shrink-0 text-emerald-600/90" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>
            )}

            {/* Right Action Buttons — Language selector, role badge, voice, sign in/out */}
            <div className="hidden lg:flex items-center gap-2 xl:gap-2.5 shrink-0">
              <LanguageSelector />
              {isLoginPage ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <ShieldCheck size={14} className="text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-800 tracking-wide">
                    Authentication Gateway
                  </span>
                </div>
              ) : currentUser ? (
                <>
                  {/* User Role Badge with Pulse Dot */}
                  <div className={clsx("flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold tracking-wide select-none", currentRoleMeta.badge)}>
                    <span className={clsx("w-2 h-2 rounded-full shrink-0 animate-pulse", currentRoleMeta.dot)} />
                    <span>{currentRoleMeta.name}</span>
                  </div>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    title="Sign Out"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-stone-600 hover:text-red-700 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <LogOut size={14} className="shrink-0" />
                    <span>{t('auth:sign_out', 'Sign Out')}</span>
                  </button>

                  {/* Tamil Voice Assistant Button */}
                  <button
                    onClick={() => setVoiceOpen(true)}
                    title="வேளாண் வழிகாட்டி — Tamil AI Voice Assistant"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all whitespace-nowrap shrink-0 group cursor-pointer"
                  >
                    <Mic size={14} className="shrink-0 group-hover:scale-110 transition-transform" />
                    <span>குரல் AI</span>
                  </button>
                </>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) => clsx(
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border',
                    isActive
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                  )}
                >
                  <Lock size={14} className="shrink-0" />
                  <span>{t('auth:sign_in', 'Sign In')}</span>
                </NavLink>
              )}
            </div>

            {/* Mobile / Tablet Controls */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setVoiceOpen(true)}
                title="குரல் AI"
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
              >
                <Mic size={14} />
                <span>குரல் AI</span>
              </button>
              <button
                className="p-2 rounded-lg text-stone-600 hover:bg-stone-100 cursor-pointer"
                onClick={() => setOpen(o => !o)}
                aria-label="Toggle Menu"
              >
                {open ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {open && (
          <div className="lg:hidden border-t border-stone-200 bg-white px-4 py-3 flex flex-col gap-2 shadow-lg animate-fadeIn">
            {/* Language Selector in mobile menu */}
            <div className="pb-1.5 border-b border-stone-100">
              <LanguageSelector variant="pill" className="w-full" />
            </div>

            {currentUser ? (
              <>
                <div className={clsx("px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-between", currentRoleMeta.badge)}>
                  <div className="flex items-center gap-2">
                    <span className={clsx("w-2 h-2 rounded-full animate-pulse", currentRoleMeta.dot)} />
                    <span>Role: {currentRoleMeta.name}</span>
                  </div>
                  <span className="text-[11px] font-normal opacity-75">{currentUser.email}</span>
                </div>
                <div className="py-1 flex flex-col gap-1">
                  {navItems.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) => clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors',
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/80'
                          : 'text-stone-700 hover:bg-stone-50 border border-transparent'
                      )}
                    >
                      <Icon size={18} className="shrink-0 text-emerald-600" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
                <div className="pt-2 border-t border-stone-100 flex flex-col gap-2 mt-1">
                  <button
                    onClick={() => { setOpen(false); setVoiceOpen(true) }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 cursor-pointer"
                  >
                    <Mic size={15} />
                    <span>வேளாண் வழிகாட்டி (குரல் AI Assistant)</span>
                  </button>
                  <button
                    onClick={() => { setOpen(false); handleLogout() }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 cursor-pointer"
                  >
                    <LogOut size={15} className="shrink-0" />
                    <span>{t('auth:sign_out', 'Sign Out')}</span>
                  </button>
                </div>
              </>
            ) : isLoginPage ? (
              <div className="px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 rounded-lg">
                Enter your credentials on the login screen below to access your role dashboard.
              </div>
            ) : (
              <NavLink
                to="/login"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white"
              >
                <Lock size={16} className="shrink-0" />
                <span>{t('auth:sign_in', 'Sign In to Access Dashboard')}</span>
              </NavLink>
            )}
          </div>
        )}
      </header>

      <VoiceAssistantModal isOpen={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </>
  )
}

function Footer() {
  const { t } = useTranslation('common')
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white py-8 text-center text-xs text-stone-500 space-y-1">
      <p className="font-semibold text-stone-700">AgriGuard AI — {t('footer_subtitle', 'Pure Software Multi-Role Architecture v2.0.0 · Tamil Nadu & India')}</p>
      <p>
        {t('footer_tech', 'NASA POWER Satellite Reanalysis (1980–2025) · Tree-SHAP XAI · Prescriptive Counterfactual Engine · Haversine Spatial Clustering')}
      </p>
      <p className="text-[11px] text-stone-400">Pure-Software Implementation · No Hardware/IoT Sensor Dependencies · TNAU & ICAR Knowledge Integrations</p>
    </footer>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <OfflineBanner />
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
      </main>
      <Footer />
      <ChatbotWidget />
    </BrowserRouter>
  )
}
