import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Leaf, AlertTriangle, Clock, Menu, X, Sprout, Map, Mic, ShieldCheck, Lock, LogOut, User as UserIcon, Settings, Compass, MapPin } from 'lucide-react'
import { useState, useEffect } from 'react'
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
import VoiceAssistantModal from './components/VoiceAssistantModal'
import ChatbotWidget from './components/ChatbotWidget'
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

function getNavItemsForRole(role) {
  if (role === 'agronomist') {
    return [
      { to: '/agronomist/dashboard', label: 'Threat Queue & Risk', icon: ShieldCheck },
      { to: '/regional-scan', label: 'Draw-to-Scan', icon: MapPin },
      { to: '/outbreak', label: 'Outbreak Map', icon: Map },
      { to: '/expert', label: 'AI Review Desk', icon: Compass },
      { to: '/yield', label: 'Yield Impact', icon: Sprout },
    ]
  }
  if (role === 'admin') {
    return [
      { to: '/admin/dashboard', label: 'Admin Command', icon: Settings },
      { to: '/regional-scan', label: 'Draw-to-Scan', icon: MapPin },
      { to: '/agronomist/dashboard', label: 'Agronomist Desk', icon: ShieldCheck },
      { to: '/farmer/today', label: 'Farmer Portal', icon: AlertTriangle },
      { to: '/outbreak', label: 'Regional Map', icon: Map },
    ]
  }
  // Default: farmer
  return [
    { to: '/farmer/today', label: "Today's Warning", icon: AlertTriangle },
    { to: '/regional-scan', label: 'Draw-to-Scan', icon: MapPin },
    { to: '/yield', label: 'Yield Predictor', icon: Sprout },
    { to: '/outbreak', label: 'Outbreak Map', icon: Map },
    { to: '/history', label: 'Field History', icon: Clock },
  ]
}

function Navbar() {
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

  const roleLabels = {
    farmer: 'Farmer',
    agronomist: 'Agronomist',
    admin: 'System Admin',
  }

  const roleBadges = {
    farmer: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    agronomist: 'bg-blue-50 text-blue-800 border-blue-200',
    admin: 'bg-purple-50 text-purple-800 border-purple-200',
  }

  const navItems = getNavItemsForRole(currentUser?.role)

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <NavLink to={currentUser ? '/' : '/login'} className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-700 to-teal-600 flex items-center justify-center shadow-md shrink-0">
                <Leaf size={20} className="text-white" />
              </div>
              <div className="leading-tight">
                <span className="font-bold text-lg sm:text-xl tracking-tight text-stone-900 whitespace-nowrap">
                  AgriGuard <span className="text-emerald-600">AI</span>
                </span>
                <span className="hidden xl:block text-[11px] text-stone-500 whitespace-nowrap">
                  Pure-Software Spatial Pest & Disease Warning · Tamil Nadu
                </span>
              </div>
            </NavLink>

            {/* Desktop Navigation Links — Dynamic per role */}
            {currentUser && !isLoginPage && (
              <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 flex-1 justify-center">
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => clsx(
                      'nav-link flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-xl text-xs xl:text-sm font-semibold transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 font-bold shadow-xs'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>
            )}

            {/* Right Action Buttons */}
            <div className="hidden lg:flex items-center gap-2.5 shrink-0">
              {isLoginPage ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <ShieldCheck size={14} className="text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-800 tracking-wide">
                    Authentication Gateway
                  </span>
                </div>
              ) : currentUser ? (
                <>
                  {/* User Role Badge */}
                  <div className={clsx("flex items-center gap-2 px-3 py-1 rounded-xl border", roleBadges[currentUser.role] || 'bg-stone-100 border-stone-200 text-stone-700')}>
                    <UserIcon size={14} className="shrink-0" />
                    <div className="text-left leading-none">
                      <span className="block text-[11px] font-bold uppercase tracking-wider">
                        {roleLabels[currentUser.role] || 'User'}
                      </span>
                    </div>
                  </div>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    title="Sign Out"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs xl:text-sm font-semibold text-stone-600 hover:text-red-700 hover:bg-red-50 border border-stone-200 hover:border-red-200 transition-all whitespace-nowrap"
                  >
                    <LogOut size={14} className="shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) => clsx(
                    'flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs xl:text-sm font-bold transition-all whitespace-nowrap border',
                    isActive
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                  )}
                >
                  <Lock size={14} className="shrink-0" />
                  <span>Sign In</span>
                </NavLink>
              )}

              {/* Tamil Voice Assistant Button */}
              <button
                onClick={() => setVoiceOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs xl:text-sm font-bold shadow-md hover:bg-emerald-700 transition-all whitespace-nowrap"
              >
                <Mic size={15} className="shrink-0" />
                <span>வேளாண் வழிகாட்டி</span>
              </button>
            </div>

            {/* Mobile / Tablet Controls */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setVoiceOpen(true)}
                className="p-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap"
              >
                <Mic size={16} /> <span className="hidden sm:inline">Voice</span>
              </button>
              <button
                className="p-2 rounded-lg text-stone-600 hover:bg-stone-100"
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
          <div className="lg:hidden border-t border-stone-200 bg-white px-4 py-3 flex flex-col gap-1 shadow-lg">
            {currentUser ? (
              <>
                <div className="px-3 py-2 bg-emerald-50 rounded-lg text-xs font-bold text-emerald-800 mb-1 flex items-center justify-between">
                  <span>Signed in as: {roleLabels[currentUser.role] || 'User'}</span>
                  <span className="text-[10px] text-stone-500">{currentUser.email}</span>
                </div>
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap',
                      isActive ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-stone-700 hover:bg-stone-50'
                    )}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                ))}
                <div className="pt-2 border-t border-stone-100 mt-1">
                  <button
                    onClick={() => { setOpen(false); handleLogout() }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 text-left"
                  >
                    <LogOut size={18} className="shrink-0" />
                    <span>Sign Out</span>
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 text-white"
              >
                <Lock size={18} className="shrink-0" />
                <span>Sign In to Access Dashboard</span>
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
  return (
    <footer className="mt-16 border-t border-stone-200 bg-white py-8 text-center text-xs text-stone-500 space-y-1">
      <p className="font-semibold text-stone-700">AgriGuard AI — Pure Software Multi-Role Architecture v2.0.0 · Tamil Nadu & India</p>
      <p>
        NASA POWER Satellite Reanalysis (1980–2025) · Tree-SHAP XAI · Prescriptive Counterfactual Engine · Haversine Spatial Clustering
      </p>
      <p className="text-[11px] text-stone-400">Pure-Software Implementation · No Hardware/IoT Sensor Dependencies · TNAU & ICAR Knowledge Integrations</p>
    </footer>
  )
}

export default function App() {
  return (
    <BrowserRouter>
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
