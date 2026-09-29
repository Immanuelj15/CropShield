import { FlaskConical } from 'lucide-react'
import clsx from 'clsx'

// Contract 10: shown wherever an API response carries `simulated: true`
// (values not computed from real data).
export default function DemoDataBadge({ show = true, className = '', title }) {
  if (!show) return null
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300',
        className
      )}
      title={title || 'These values are simulated, not computed from real field data.'}
    >
      <FlaskConical size={11} /> Demo data
    </span>
  )
}
