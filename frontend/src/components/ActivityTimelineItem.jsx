import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Droplets, Sprout, Search, Wheat, CheckCircle2,
  Calendar, ArrowRight
} from 'lucide-react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'

const TYPE_CONFIG = {
  irrigation: {
    icon: Droplets,
    color: 'text-sky-700',
    bg: 'bg-sky-100',
    border: 'border-sky-200',
    label: 'Irrigation',
  },
  fertilizer: {
    icon: Sprout,
    color: 'text-brand-700',
    bg: 'bg-brand-100',
    border: 'border-brand-200',
    label: 'Fertilizer',
  },
  pest_check: {
    icon: Search,
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    label: 'Pest Scan',
  },
  harvest: {
    icon: Wheat,
    color: 'text-violet-700',
    bg: 'bg-violet-100',
    border: 'border-violet-200',
    label: 'Harvest Window',
  },
}

const STATUS_LABEL = {
  due_today: 'Due today',
  overdue: 'Overdue',
  completed: 'Completed',
  upcoming: 'Upcoming',
}

// Backend links that don't match a frontend route (activity_planner_service) → real routes in App.jsx
const LINK_ALIASES = {
  '/farmer/scan': '/farmer/detect',
  '/scan': '/farmer/detect',
}
const LINK_LABELS = {
  '/farmer/today': "Open Today's Risk",
  '/farmer/detect': 'Scan a Leaf Photo',
  '/farmer/crop-recommendation': 'Open Crop Advisor',
}

// "YYYY-MM-DD" → local calendar date (new Date('YYYY-MM-DD') is UTC midnight and can shift a day)
function parseCalendarDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return null
}

// Backend timestamps are naive UTC ISO strings
function parseUtc(value) {
  if (!value) return null
  const s = String(value)
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function ActivityTimelineItem({
  activity,
  onComplete,
  isFirst = false,
  isLast = false,
  disabled = false,
}) {
  const [completing, setCompleting] = useState(false)

  const config = TYPE_CONFIG[activity.activity_type] || TYPE_CONFIG.irrigation
  const Icon = config.icon
  const status = activity.status || 'upcoming'
  const isCompleted = status === 'completed'
  const isActionable = status === 'due_today' || status === 'overdue'

  const handleMarkComplete = async () => {
    if (isCompleted || completing || !onComplete) return
    setCompleting(true)
    try {
      await onComplete(activity.activity_id)
    } finally {
      setCompleting(false)
    }
  }

  const scheduled = parseCalendarDate(activity.scheduled_date)
  const formattedDate = scheduled
    ? scheduled.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : (activity.scheduled_date || '')
  const completedAt = parseUtc(activity.completed_at)

  const rawLink = activity.details?.pipeline_link
  const link = rawLink ? (LINK_ALIASES[rawLink] || rawLink) : null
  const detailText = activity.details?.note || activity.details?.action

  return (
    <motion.div
      layout
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={clsx(
        'relative flex items-start gap-3 sm:gap-4 transition-all',
        isCompleted ? 'opacity-80' : 'opacity-100'
      )}
    >
      {/* Vertical Spine Line */}
      {!isLast && (
        <span
          className={clsx(
            'absolute left-5 top-10 bottom-0 w-0.5 -ml-px',
            isCompleted ? 'bg-brand-300' : 'bg-stone-200'
          )}
          aria-hidden="true"
        />
      )}

      {/* Activity Icon Bubble */}
      <div
        className={clsx(
          'relative z-10 w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all shadow-sm',
          isCompleted
            ? 'bg-brand-600 text-white border-brand-700'
            : clsx(config.bg, config.color, config.border)
        )}
        aria-hidden="true"
      >
        {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={18} />}
      </div>

      {/* Activity Card */}
      <div
        className={clsx(
          'flex-1 min-w-0 bg-white rounded-2xl border p-4 shadow-sm transition-all mb-4',
          status === 'due_today'
            ? 'border-amber-300 ring-2 ring-amber-100'
            : status === 'overdue'
            ? 'border-red-300 ring-1 ring-red-50'
            : 'border-stone-200'
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={clsx(
                'text-xs px-2 py-0.5 rounded-full font-bold',
                status === 'due_today'
                  ? 'bg-amber-100 text-amber-800'
                  : status === 'overdue'
                  ? 'bg-red-100 text-red-800'
                  : status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-stone-100 text-stone-600'
              )}
            >
              {STATUS_LABEL[status] || String(status).replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-stone-500 font-semibold uppercase">
              {config.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-stone-600 font-semibold">
            <Calendar size={13} className="text-stone-500" />
            <time dateTime={activity.scheduled_date || undefined}>{formattedDate}</time>
          </div>
        </div>

        {/* Content Body */}
        <div className="mt-2.5 space-y-1.5">
          <h4
            className={clsx(
              'text-sm font-bold text-stone-900 break-words',
              isCompleted && 'line-through text-stone-500'
            )}
          >
            {activity.title}
          </h4>

          {detailText && (
            <p className="text-xs text-stone-600 leading-relaxed">
              {detailText}
            </p>
          )}

          {/* Type-specific details */}
          {activity.activity_type === 'irrigation' && activity.details?.growth_stage && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 border border-sky-100 rounded-lg text-xs font-semibold text-sky-800">
              <Droplets size={12} className="text-sky-600" />
              <span>Growth stage: {activity.details.growth_stage}</span>
            </div>
          )}

          {activity.activity_type === 'fertilizer' && activity.details?.stage && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-50 border border-brand-100 rounded-lg text-xs font-semibold text-brand-800">
              <Sprout size={12} className="text-brand-600" />
              <span>{activity.details.stage}</span>
            </div>
          )}

          {link && link.startsWith('/') && (
            <div className="pt-1">
              <Link
                to={link}
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span>{LINK_LABELS[link] || 'Open in AgriGuard'}</span>
                <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-end">
          {!isCompleted ? (
            <button
              type="button"
              onClick={handleMarkComplete}
              disabled={completing || disabled}
              aria-label={`Mark "${activity.title}" as done`}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                isActionable
                  ? 'bg-brand-600 hover:bg-brand-700 text-white'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              )}
            >
              {completing ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <CheckCircle2 size={13} />
              )}
              <span>{completing ? 'Saving...' : 'Mark as Done'}</span>
            </button>
          ) : (
            <span className="text-xs font-bold text-green-700 flex items-center gap-1">
              <CheckCircle2 size={13} />
              <span>
                Completed{completedAt ? ` on ${completedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </span>
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
