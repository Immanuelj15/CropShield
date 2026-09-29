import { useState } from 'react'
import { Shield } from 'lucide-react'
import AgronomistThreatQueue, { threatQueueMeta } from './agronomist/AgronomistThreatQueue'
import AgronomistWeather, { weatherMeta } from './agronomist/AgronomistWeather'
import AgronomistGrid, { gridMeta } from './agronomist/AgronomistGrid'
import AgronomistReports, { reportsMeta } from './agronomist/AgronomistReports'
import AgronomistSupport, { supportMeta } from './agronomist/AgronomistSupport'
import AgronomistFeedback, { feedbackMeta } from './agronomist/AgronomistFeedback'

const SECTIONS = [
  { key: 'threats', meta: threatQueueMeta, Component: AgronomistThreatQueue },
  { key: 'weather', meta: weatherMeta, Component: AgronomistWeather },
  { key: 'grid', meta: gridMeta, Component: AgronomistGrid },
  { key: 'reports', meta: reportsMeta, Component: AgronomistReports },
  { key: 'support', meta: supportMeta, Component: AgronomistSupport },
  { key: 'feedback', meta: feedbackMeta, Component: AgronomistFeedback },
]

export default function AgronomistDashboard() {
  const [activeSection, setActiveSection] = useState('threats')
  const ActiveComponent = SECTIONS.find((s) => s.key === activeSection)?.Component || AgronomistThreatQueue


  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="bg-gradient-to-r from-sky-950 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden border border-sky-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/20 text-sky-300 text-xs font-semibold rounded-full border border-sky-400/30 mb-2">
              <Shield size={14} /> Human-In-The-Loop Expert Verification Layer
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Agronomist Regional Operations Dashboard
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm mt-1">
              Assigned Agro-Climatic Zone: <span className="text-green-300 font-bold">Coimbatore & Western Agro-Plateau</span> · TNAU Extension Coordination
            </p>
          </div>
          <span className="px-3.5 py-1.5 bg-green-500/20 text-green-300 border border-green-400/30 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> Feedback Loop Active
          </span>
        </div>
      </div>

      {/* Section switcher (the App shell already renders the route Sidebar, so no second sidebar here) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {SECTIONS.map(({ key, meta }) => {
          const Icon = meta.icon
          const isActive = activeSection === key
          return (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                isActive ? 'bg-sky-600 text-white shadow-sm' : 'bg-white text-stone-600 border border-stone-200'
              }`}
            >
              <Icon size={14} />
              <span>{meta.label}</span>
            </button>
          )
        })}
      </div>

      <div className="min-w-0">
        <ActiveComponent />
      </div>
    </div>
  )
}
