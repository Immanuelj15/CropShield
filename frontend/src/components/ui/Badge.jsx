import clsx from 'clsx'
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'

// Single canonical color-map for every risk/status/category pill in the app.
// Replaces the 5-6 independently reimplemented Low/Medium/High and success/warning/error/info ternaries.
const VARIANTS = {
  low: { cls: 'bg-green-100 text-green-800', Icon: CheckCircle },
  success: { cls: 'bg-green-100 text-green-800', Icon: CheckCircle },
  medium: { cls: 'bg-amber-100 text-amber-800', Icon: Info },
  warning: { cls: 'bg-amber-100 text-amber-800', Icon: Info },
  high: { cls: 'bg-red-100 text-red-800', Icon: AlertTriangle },
  error: { cls: 'bg-red-100 text-red-800', Icon: XCircle },
  info: { cls: 'bg-sky-100 text-sky-800', Icon: Info },
  neutral: { cls: 'bg-stone-100 text-stone-600', Icon: null },
}

// Accept common aliases so call sites can pass their existing risk-level strings ("Low"/"High"/"Confirmed"/etc.)
const ALIASES = {
  low: 'low', optimal: 'low', confirmed: 'error', suspected: 'medium',
  medium: 'medium', moderate: 'medium',
  high: 'high', critical: 'high',
  none: 'neutral',
}

export default function Badge({ status, children, icon: showIcon = true, large = false, className = '' }) {
  const key = ALIASES[String(status).toLowerCase()] || String(status).toLowerCase()
  const cfg = VARIANTS[key] || VARIANTS.neutral
  const Icon = cfg.Icon
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        large ? 'text-sm px-3.5 py-1.5' : 'text-xs px-2.5 py-1',
        cfg.cls,
        className
      )}
    >
      {showIcon && Icon && <Icon size={large ? 14 : 12} className="shrink-0" />}
      {children ?? status}
    </span>
  )
}
