import clsx from 'clsx'
import Button from './Button'
import { Inbox } from 'lucide-react'

export default function EmptyState({ icon: Icon = Inbox, title, message, actionLabel, onAction, className = '' }) {
  return (
    <div className={clsx('flex flex-col items-center text-center gap-3 py-12 px-6 border-2 border-dashed border-stone-200 rounded-2xl', className)}>
      <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center" aria-hidden="true">
        <Icon size={24} className="text-stone-400" />
      </div>
      {title && <h3 className="text-base font-bold text-stone-800">{title}</h3>}
      {message && <p className="text-sm text-stone-500 max-w-sm">{message}</p>}
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction} className="mt-1">{actionLabel}</Button>
      )}
    </div>
  )
}
