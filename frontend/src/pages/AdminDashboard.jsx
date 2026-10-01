import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import AdminAnalytics, { analyticsMeta } from './admin/AdminAnalytics'
import AdminPredictionAccuracy, { predictionAccuracyMeta } from './admin/AdminPredictionAccuracy'
import AdminPests, { pestsMeta } from './admin/AdminPests'
import AdminCropRules, { cropRulesMeta } from './admin/AdminCropRules'
import AdminFarms, { farmsMeta } from './admin/AdminFarms'
import AdminUsers, { usersMeta } from './admin/AdminUsers'
import AdminThresholds, { thresholdsMeta } from './admin/AdminThresholds'
import AdminAdvisories, { advisoriesMeta } from './admin/AdminAdvisories'
import AdminApiHealth, { apiHealthMeta } from './admin/AdminApiHealth'
import AdminModels, { modelsMeta } from './admin/AdminModels'

const SECTIONS = [
  { key: 'analytics', meta: analyticsMeta, Component: AdminAnalytics },
  { key: 'prediction_accuracy', meta: predictionAccuracyMeta, Component: AdminPredictionAccuracy },
  { key: 'pests', meta: pestsMeta, Component: AdminPests },
  { key: 'crop_rules', meta: cropRulesMeta, Component: AdminCropRules },
  { key: 'farms', meta: farmsMeta, Component: AdminFarms },
  { key: 'users', meta: usersMeta, Component: AdminUsers },
  { key: 'thresholds', meta: thresholdsMeta, Component: AdminThresholds },
  { key: 'advisories', meta: advisoriesMeta, Component: AdminAdvisories },
  { key: 'api', meta: apiHealthMeta, Component: AdminApiHealth },
  { key: 'models', meta: modelsMeta, Component: AdminModels },
]

export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState('analytics')
  const ActiveComponent = SECTIONS.find((s) => s.key === activeSection)?.Component || AdminAnalytics

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Hero uses the admin role accent (violet-700) */}
      <div className="bg-gradient-to-r from-violet-800 to-violet-700 rounded-2xl p-6 sm:p-8 text-white shadow-sm">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 text-white text-xs font-semibold rounded-full border border-white/25 mb-2">
          <ShieldAlert size={14} /> Platform administration & data governance
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AgriGuard AI Admin Center</h1>
        <p className="text-violet-100 text-sm mt-1">
          Users & roles · Farm registry · Knowledge base · Alert thresholds · NASA POWER monitor · Model management
        </p>
      </div>

      {/* Section switcher (the App shell already renders the route Sidebar, so no second sidebar here) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Admin sections">
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
                isActive ? 'bg-violet-700 text-white border-violet-700 shadow-sm' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
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
