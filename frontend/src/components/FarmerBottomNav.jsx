import { AlertTriangle, Camera, FileText, Shield, Bell, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

// Mobile counterpart of the FarmerDashboard TabBar — same tab ids (incl. `history`), short labels.
export default function FarmerBottomNav({ activeTab, onSelectTab, treatmentCount = 0, alertCount = 0 }) {
  const { t } = useTranslation('common')
  const tabs = [
    { id: 'warning', label: t('nav_short_today', 'Today'), icon: AlertTriangle },
    { id: 'disease', label: t('nav_short_scan', 'Scan Leaf'), icon: Camera },
    { id: 'treatments', label: t('nav_short_treatments', 'Treatments'), icon: FileText, badge: treatmentCount },
    { id: 'advisories', label: t('nav_short_advisories', 'Advisories'), icon: Shield },
    { id: 'alerts', label: t('nav_short_alerts', 'Alerts'), icon: Bell, badge: alertCount },
    { id: 'history', label: t('nav_short_history', 'History'), icon: Clock },
  ]

  return (
    <nav
      aria-label={t('quick_navigation', 'Quick navigation')}
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-lg px-1 py-1.5 flex items-stretch justify-around lg:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        const count = Number(tab.badge) || 0
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab && onSelectTab(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={count > 0 ? `${tab.label} (${count})` : undefined}
            className={clsx(
              'flex-1 min-w-0 flex flex-col items-center justify-center min-h-[48px] px-1 py-1 rounded-xl transition-colors relative',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              isActive ? 'text-brand-700 font-bold bg-brand-50' : 'text-stone-500 hover:text-stone-800'
            )}
          >
            <span className="relative" aria-hidden="true">
              <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
              {count > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-[10px] leading-none font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center border border-white">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </span>
            <span className="text-xs mt-0.5 leading-tight max-w-full truncate">
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
