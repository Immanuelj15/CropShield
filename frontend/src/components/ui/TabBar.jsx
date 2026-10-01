import clsx from 'clsx'

// Extracted from the horizontal pill tab bar copy-pasted 3x across FarmerDashboard/AgronomistDashboard/AdminDashboard.
// Designed for dark hero backgrounds (inactive tabs are translucent white).
// `tabs`: [{ id, label, icon, badge? }]
export default function TabBar({ tabs = [], activeId, onSelect, activeCls = 'bg-white text-stone-950', className = '', ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={clsx('flex items-center gap-2 overflow-x-auto no-scrollbar pb-1', className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeId === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect && onSelect(tab.id)}
            className={clsx(
              'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
              isActive ? clsx(activeCls, 'shadow-md') : 'bg-white/10 text-stone-100 hover:bg-white/20'
            )}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span className={clsx('text-xs leading-none px-1.5 py-0.5 rounded-full font-extrabold', isActive ? 'bg-brand-100 text-brand-900' : 'bg-white/20 text-white')}>
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
