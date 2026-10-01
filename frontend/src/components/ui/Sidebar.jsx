import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import clsx from 'clsx'
import SidebarNavItem from './SidebarNavItem'

// Collapsible sidebar for the data-dense Agronomist/Admin consoles (Farmer keeps top-nav + FarmerBottomNav).
// `items`: [{ to, label, icon }] for route-driven nav (used in App.jsx), or pass `activeKey`/`onSelect`
// alongside items shaped [{ key, label, icon }] to drive in-page section state instead (dashboard shells).
export default function Sidebar({ items = [], accent = 'brand', activeKey, onSelect, className = '', ariaLabel }) {
  const { t } = useTranslation('common')
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={clsx(
        'hidden lg:flex flex-col shrink-0 bg-white border-r border-stone-200 py-4 transition-all duration-200',
        collapsed ? 'w-[68px] px-2' : 'w-60 px-3',
        className
      )}
    >
      <nav aria-label={ariaLabel || t('main_navigation', 'Main navigation')} className="flex flex-col gap-1 flex-1">
        {items.map((item) => (
          <SidebarNavItem
            key={item.key || item.to}
            to={item.to}
            active={item.key === activeKey}
            onClick={item.key ? () => onSelect?.(item.key) : undefined}
            icon={item.icon}
            label={item.label}
            accent={accent}
            collapsed={collapsed}
          />
        ))}
      </nav>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t('expand_sidebar', 'Expand sidebar') : t('collapse_sidebar', 'Collapse sidebar')}
        className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {collapsed ? (
          <ChevronsRight size={16} aria-hidden="true" />
        ) : (
          <>
            <ChevronsLeft size={16} aria-hidden="true" /> {t('collapse', 'Collapse')}
          </>
        )}
      </button>
    </aside>
  )
}
