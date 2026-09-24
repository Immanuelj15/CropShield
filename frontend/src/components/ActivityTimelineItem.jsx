import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Droplets, Sprout, Search, Wheat, CheckCircle2, Circle,
  Calendar, ArrowRight, Clock, AlertTriangle, ExternalLink
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
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200',
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
    color: 'text-purple-700',
    bg: 'bg-purple-100',
    border: 'border-purple-200',
    label: 'Harvest Window',
  },
}

export default function ActivityTimelineItem({
  activity,
  onComplete,
  isFirst = false,
  isLast = false,
}) {
  const [completing, setCompleting] = useState(false)

  const config = TYPE_CONFIG[activity.activity_type] || TYPE_CONFIG.irrigation
  const Icon = config.icon
  const status = activity.status || 'upcoming'
  const isCompleted = status === 'completed'

  const handleMarkComplete = async () => {
    if (isCompleted || completing) return
    setCompleting(true)
    try {
      await onComplete(activity.activity_id)
    } finally {
      setCompleting(false)
    }
  }

  const formattedDate = activity.scheduled_date
    ? new Date(activity.scheduled_date).toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : ''

  return (
    <motion.div
      layout
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={clsx(
        'relative flex items-start gap-4 transition-all',
        isCompleted ? 'opacity-70' : 'opacity-100'
      )}
    >
      {/* Vertical Spine Line */}
      {!isLast && (
        <span
          className={clsx(
            'absolute left-5 top-10 bottom-0 w-0.5 -ml-px',
            isCompleted ? 'bg-emerald-300' : 'bg-stone-200'
          )}
          aria-hidden="true"
        />
      )}

      {/* Activity Icon Bubble */}
      <div
        className={clsx(
          'relative z-10 w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all shadow-sm',
          isCompleted
            ? 'bg-emerald-600 text-white border-emerald-700'
            : clsx(config.bg, config.color, config.border)
        )}
      >
        {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={18} />}
      </div>

      {/* Activity Card */}
      <div
        className={clsx(
          'flex-1 bg-white rounded-2xl border p-4 shadow-sm transition-all mb-4',
          status === 'due_today'
            ? 'border-emerald-300 ring-2 ring-emerald-100 shadow-md'
            : status === 'overdue'
            ? 'border-rose-300 ring-1 ring-rose-50'
            : 'border-stone-200/90'
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={clsx(
                'text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider',
                status === 'due_today'
                  ? 'bg-emerald-100 text-emerald-800 animate-pulse'
                  : status === 'overdue'
                  ? 'bg-rose-100 text-rose-800'
                  : status === 'completed'
                  ? 'bg-stone-100 text-stone-600 line-through'
                  : 'bg-stone-100 text-stone-600'
              )}
            >
              {status.replace('_', ' ')}
            </span>
            <span className="text-[10px] text-stone-400 font-bold uppercase">
              {config.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-mono font-semibold">
            <Calendar size={13} className="text-stone-400" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="mt-2.5 space-y-1.5">
          <h4
            className={clsx(
              'text-xs font-bold text-stone-900',
              isCompleted && 'line-through text-stone-400'
            )}
          >
            {activity.title}
          </h4>

          {activity.details?.note && (
            <p className="text-[11px] text-stone-600 leading-relaxed">
              {activity.details.note}
            </p>
          )}

          {/* Type-specific details */}
          {activity.activity_type === 'irrigation' && activity.details?.growth_stage && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 border border-sky-100 rounded-lg text-[10.5px] font-semibold text-sky-800">
              <Droplets size={12} className="text-sky-600" />
              <span>Target stage: {activity.details.growth_stage}</span>
            </div>
          )}

          {activity.activity_type === 'fertilizer' && activity.details?.stage && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg text-[10.5px] font-semibold text-emerald-800">
              <Sprout size={12} className="text-emerald-600" />
              <span>{activity.details.stage}</span>
            </div>
          )}

          {activity.details?.pipeline_link && (
            <div className="pt-1">
              <Link
                to={activity.details.pipeline_link}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
              >
                <span>Launch in AgriGuard</span>
                <ExternalLink size={11} />
              </Link>
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between">
          <span className="text-[10px] text-stone-400 font-mono">
            ID: {activity.activity_id}
          </span>

          {!isCompleted ? (
            <button
              onClick={handleMarkComplete}
              disabled={completing}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm',
                status === 'due_today' || status === 'overdue'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              )}
            >
              <CheckCircle2 size={13} className={completing ? 'animate-spin' : ''} />
              <span>{completing ? 'Saving...' : 'Mark as Done'}</span>
            </button>
          ) : (
            <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={13} />
              <span>Completed {activity.completed_at ? new Date(activity.completed_at).toLocaleDateString('en-IN') : ''}</span>
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
