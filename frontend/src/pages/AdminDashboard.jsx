import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import Sidebar from '../components/ui/Sidebar'
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
  const sidebarItems = SECTIONS.map(({ key, meta }) => ({ key, label: meta.label, icon: meta.icon }))

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <div className="bg-gradient-to-r from-violet-950 via-stone-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden border border-violet-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-500/20 text-violet-300 text-xs font-semibold rounded-full border border-violet-400/30 mb-2">
              <ShieldAlert size={14} /> Platform Administration & Data Governance
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">AgriGuard System Admin Center</h1>
            <p className="text-stone-300 text-xs sm:text-sm mt-1">
              Pure-software infrastructure · GPS Farm Mapping · Role RBAC · NASA POWER Monitor · Model Management
            </p>
          </div>
        </div>
      </div>

      {/* Mobile/tablet section switcher (Sidebar is lg:+ only) */}
      <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {SECTIONS.map(({ key, meta }) => {
          const Icon = meta.icon
          const isActive = activeSection === key
          return (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                isActive ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-stone-600 border border-stone-200'
              }`}
            >
              <Icon size={14} />
              <span>{meta.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-start gap-6">
        <Sidebar items={sidebarItems} accent="violet" activeKey={activeSection} onSelect={setActiveSection} className="border rounded-2xl" />
        <div className="flex-1 min-w-0">
          <ActiveComponent />
        </div>
      </div>
    </div>
  )
}
