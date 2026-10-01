import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

// Role accents (design system): farmer = brand, agronomist = sky-700, admin = violet-700.
const ACCENT_ACTIVE = {
  sky: 'bg-sky-50 text-sky-800 border-sky-200',
  violet: 'bg-violet-50 text-violet-800 border-violet-200',
  brand: 'bg-brand-50 text-brand-800 border-brand-200',
}
const ACCENT_ICON = {
  sky: 'text-sky-700',
  violet: 'text-violet-700',
  brand: 'text-brand-600',
}
const ACCENT_RING = {
  sky: 'focus-visible:ring-sky-500',
  violet: 'focus-visible:ring-violet-500',
  brand: 'focus-visible:ring-brand-500',
}

// A nav item that either routes (via `to`) or drives in-page section state (via `active`/`onClick`) —
// AdminDashboard/AgronomistDashboard use the latter since their "tabs" are sections within one route.
export default function SidebarNavItem({ to, active, onClick, icon: Icon, label, accent = 'brand', collapsed = false }) {
  const activeCls = ACCENT_ACTIVE[accent] || ACCENT_ACTIVE.brand
  const iconCls = ACCENT_ICON[accent] || ACCENT_ICON.brand
  const wrapperCls = clsx('block w-full text-left rounded-lg focus:outline-none focus-visible:ring-2', ACCENT_RING[accent] || ACCENT_RING.brand)

  const content = (isActive) => (
    <span
      className={clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold border border-transparent transition-colors',
        isActive ? clsx(activeCls, 'font-bold') : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
      )}
      title={collapsed ? label : undefined}
    >
      {Icon && <Icon size={18} aria-hidden="true" className={clsx('shrink-0', isActive ? iconCls : 'text-stone-500')} />}
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </span>
  )

  if (to) {
    return (
      <NavLink to={to} className={wrapperCls}>
        {({ isActive }) => content(isActive)}
      </NavLink>
    )
  }

  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={wrapperCls}>
      {content(active)}
    </button>
  )
}
