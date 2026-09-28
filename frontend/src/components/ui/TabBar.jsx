import clsx from 'clsx'

// Extracted from the horizontal pill tab bar copy-pasted 3x across FarmerDashboard/AgronomistDashboard/AdminDashboard.
// `tabs`: [{ id, label, icon, badge? }]
export default function TabBar({ tabs, activeId, onSelect, activeCls = 'bg-white text-stone-950', className = '' }) {
  return (
    <div className={clsx('flex items-center gap-2 overflow-x-auto no-scrollbar pb-1', className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeId === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={clsx(
              'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0',
              isActive ? clsx(activeCls, 'shadow-md scale-105') : 'bg-white/10 text-stone-200 hover:bg-white/20'
            )}
          >
            <Icon size={14} />
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={clsx('text-[10px] px-1.5 py-0.2 rounded-full font-extrabold', isActive ? 'bg-brand-100 text-brand-900' : 'bg-white/20 text-white')}>
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
