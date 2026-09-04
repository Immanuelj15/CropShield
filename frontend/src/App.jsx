import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Leaf, AlertTriangle, Clock, BarChart3, Menu, X, Sprout, Map, Mic, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import TodayPage from './pages/TodayPage'
import YieldPage from './pages/YieldPage'
import OutbreakMapPage from './pages/OutbreakMapPage'
import HistoryPage from './pages/HistoryPage'
import FeaturesPage from './pages/FeaturesPage'
import ExpertPortalPage from './pages/ExpertPortalPage'
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
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-stone-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-700 to-teal-600 flex items-center justify-center shadow-md">
                <Leaf size={22} className="text-white" />
              </div>
              <div>
                <span className="font-bold text-xl tracking-tight text-stone-900">AgriGuard <span className="text-emerald-600">AI</span></span>
                <span className="hidden sm:block text-xs text-stone-500 leading-none">
                  Location-Based Pest & Disease Early Warning · Tamil Nadu
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end}
                  className={({ isActive }) => clsx(
                    'nav-link flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 font-bold'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  )}>
                  <Icon size={16} />{label}
                </NavLink>
              ))}

              <button
                onClick={() => setVoiceOpen(true)}
                className="ml-2 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md hover:bg-emerald-700 transition-all"
              >
                <Mic size={15} /> வேளாண் வழிகாட்டி
              </button>
            </nav>

            <div className="flex items-center gap-2 md:hidden">
              <button
                onClick={() => setVoiceOpen(true)}
                className="p-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
              >
                <Mic size={16} /> Tamil Voice
              </button>
              <button className="p-2 rounded-lg text-stone-600 hover:bg-stone-100"
                onClick={() => setOpen(o => !o)}>
                {open ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-stone-200 bg-white px-4 py-3 flex flex-col gap-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
                className={({ isActive }) => clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold',
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-stone-700'
                )}>
                <Icon size={16} />{label}
              </NavLink>
            ))}
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
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  )
}
