import clsx from 'clsx'

const COLORS = {
  online: 'bg-green-500',
  offline: 'bg-stone-400',
  syncing: 'bg-amber-500 animate-pulse',
  error: 'bg-red-500',
}

export default function StatusIndicator({ status = 'offline', label, className = '' }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600', className)}>
      <span className={clsx('w-2 h-2 rounded-full shrink-0', COLORS[status] || COLORS.offline)} />
      {label}
    </span>
  )
}
