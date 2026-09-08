import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Leaf, AlertTriangle, Clock, BarChart3, Menu, X, Sprout, Map, Mic, ShieldCheck, Lock } from 'lucide-react'
import { useState } from 'react'
import TodayPage from './pages/TodayPage'
import YieldPage from './pages/YieldPage'
import OutbreakMapPage from './pages/OutbreakMapPage'
import HistoryPage from './pages/HistoryPage'
import FeaturesPage from './pages/FeaturesPage'
import ExpertPortalPage from './pages/ExpertPortalPage'
import LoginPage from './pages/LoginPage'
import VoiceAssistantModal from './components/VoiceAssistantModal'
import clsx from 'clsx'

const navItems = [
  { to: '/',         label: "Today's Warning", icon: AlertTriangle, end: true },
  { to: '/yield',    label: 'Yield Predictor', icon: Sprout },
  { to: '/outbreak', label: 'Outbreak Map',    icon: Map },
  { to: '/expert',   label: 'Expert Portal',   icon: ShieldCheck },
  { to: '/history',  label: 'History',          icon: Clock },
]

function Navbar() {
  const [open, setOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-700 to-teal-600 flex items-center justify-center shadow-md shrink-0">
                <Leaf size={20} className="text-white" />
              </div>
              <div className="leading-tight">
                <span className="font-bold text-lg sm:text-xl tracking-tight text-stone-900 whitespace-nowrap">
                  AgriGuard <span className="text-emerald-600">AI</span>
                </span>
                <span className="hidden xl:block text-[11px] text-stone-500 whitespace-nowrap">
                  Location-Based Pest & Disease Early Warning · Tamil Nadu
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 flex-1 justify-center">
              {navItems.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => clsx(
                    'nav-link flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-xl text-xs xl:text-sm font-semibold transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 font-bold'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Right Action Buttons */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <NavLink
                to="/login"
                className={({ isActive }) => clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs xl:text-sm font-semibold transition-all whitespace-nowrap border',
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-700 hover:text-stone-900 border-stone-200'
                )}
              >
                <Lock size={14} className="shrink-0" />
                <span>Sign In</span>
              </NavLink>

              <button
                onClick={() => setVoiceOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs xl:text-sm font-bold shadow-md hover:bg-emerald-700 transition-all whitespace-nowrap"
              >
                <Mic size={15} className="shrink-0" />
                <span>வேளாண் வழிகாட்டி</span>
              </button>
            </div>

            {/* Mobile / Tablet Toggle Buttons */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setVoiceOpen(true)}
                className="p-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap"
              >
                <Mic size={16} /> <span className="hidden sm:inline">Tamil Voice</span>
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
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
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
              <NavLink
                to="/login"
                onClick={() => setOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap',
                  isActive ? 'bg-emerald-600 text-white' : 'text-stone-700 hover:bg-stone-50'
                )}
              >
                <Lock size={18} className="shrink-0" />
                <span>Sign In (Account)</span>
              </NavLink>
            </div>
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
      <p className="font-semibold text-stone-700">AgriGuard AI — Production Platform v2.0.0 · Tamil Nadu & India</p>
      <p>
        NASA POWER Reanalysis (1980–2025) · Multi-Model Ensemble (XGBoost/LightGBM/CatBoost/RF) · Tree-SHAP XAI · Haversine Spatial Clustering
      </p>
      <p className="text-[11px] text-stone-400">Patent Pending Specifications (Claims 1–15) · TNAU & ICAR Extension Advisory Integrations</p>
    </footer>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/"         element={<TodayPage />} />
          <Route path="/yield"    element={<YieldPage />} />
          <Route path="/outbreak" element={<OutbreakMapPage />} />
          <Route path="/expert"   element={<ExpertPortalPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/history"  element={<HistoryPage />} />
          <Route path="/login"    element={<LoginPage />} />
        </Routes>

      </main>
      <Footer />
    </BrowserRouter>
  )
}
