import { AlertTriangle, Camera, FileText, Shield, Bell } from 'lucide-react'
import clsx from 'clsx'

export default function FarmerBottomNav({ activeTab, onSelectTab, treatmentCount = 0, alertCount = 0 }) {
  const tabs = [
    { id: 'warning', label: 'Today', icon: AlertTriangle },
    { id: 'disease', label: 'Scan Leaf', icon: Camera },
    { id: 'treatments', label: 'Treatments', icon: FileText, badge: treatmentCount },
    { id: 'advisories', label: 'Advisories', icon: Shield },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alertCount },
  ]

  return (
    <nav
      aria-label="Farmer Quick Navigation"
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-2xl px-2 py-1.5 flex items-center justify-around lg:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={clsx(
              'flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1 rounded-xl transition-all relative',
              isActive
                ? 'text-emerald-700 font-extrabold scale-105'
                : 'text-stone-500 hover:text-stone-800'
            )}
          >
            <div className="relative">
              <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
              {tab.badge > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">
              {tab.label}
            </span>
            {isActive && (
              <span className="w-1 h-1 bg-emerald-600 rounded-full mt-0.5" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
