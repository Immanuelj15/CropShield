import { useState } from 'react'
import { Shield } from 'lucide-react'
import clsx from 'clsx'
import { getUser } from '../utils/http'
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
  const user = getUser()

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Hero uses the agronomist role accent (sky-700) */}
      <div className="bg-gradient-to-r from-sky-800 to-sky-700 rounded-2xl p-6 sm:p-8 text-white shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 text-white text-xs font-semibold rounded-full border border-white/25 mb-2">
          <Shield size={14} /> Human-in-the-loop expert verification
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Agronomist Operations Dashboard</h1>
        <p className="text-sky-100 text-sm mt-1">
          {user?.name ? `Signed in as ${user.name} · ` : ''}Verify AI warnings, answer farmer requests and monitor regional risk.
        </p>
      </div>

      {/* Section switcher (the App shell already renders the route Sidebar, so no second sidebar here) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Agronomist sections">
        {SECTIONS.map(({ key, meta }) => {
          const Icon = meta.icon
          const isActive = activeSection === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSection(key)}
              className={clsx(
                'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 border',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                isActive ? 'bg-sky-700 text-white border-sky-700 shadow-sm' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
              )}
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
