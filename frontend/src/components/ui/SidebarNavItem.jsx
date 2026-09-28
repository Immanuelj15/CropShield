import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

const ACCENT_ACTIVE = {
  sky: 'bg-sky-50 text-sky-800 border-sky-300/80',
  violet: 'bg-violet-50 text-violet-800 border-violet-300/80',
  brand: 'bg-brand-50 text-brand-800 border-brand-300/80',
}
const ACCENT_ICON = {
  sky: 'text-sky-600',
  violet: 'text-violet-600',
  brand: 'text-brand-600',
}

// A nav item that either routes (via `to`) or drives in-page section state (via `active`/`onClick`) —
// AdminDashboard/AgronomistDashboard use the latter since their "tabs" are sections within one route.
export default function SidebarNavItem({ to, active, onClick, icon: Icon, label, accent = 'brand', collapsed = false }) {
  const activeCls = ACCENT_ACTIVE[accent] || ACCENT_ACTIVE.brand
  const iconCls = ACCENT_ICON[accent] || ACCENT_ICON.brand

  const content = (isActive) => (
    <span
      className={clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold border border-transparent transition-colors',
        isActive ? clsx(activeCls, 'font-bold') : 'text-stone-600 hover:bg-stone-100'
      )}
      title={collapsed ? label : undefined}
    >
      <Icon size={18} className={clsx('shrink-0', isActive ? iconCls : 'text-stone-400')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </span>
  )

  if (to) {
    return <NavLink to={to}>{({ isActive }) => content(isActive)}</NavLink>
  }

  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      {content(active)}
    </button>
  )
}
