import clsx from 'clsx'

export function SkeletonBlock({ className = '', rounded = 'rounded-xl' }) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'animate-pulse',
        // Only apply the default fill when the caller didn't pass its own bg-* (two bg utilities conflict).
        !/(^|\s)bg-/.test(className) && 'bg-stone-200/80',
        rounded,
        className
      )}
    />
  )
}

export function WarningCardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-stone-100">
        <div className="space-y-2">
          <SkeletonBlock className="w-48 h-6 rounded-lg" />
          <SkeletonBlock className="w-32 h-4 rounded-md" />
        </div>
        <SkeletonBlock className="w-16 h-10 rounded-xl" />
      </div>

      {/* Alert message placeholder */}
      <SkeletonBlock className="w-full h-16 rounded-2xl" />

      {/* Microclimate Grid (4 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-center space-y-2">
            <SkeletonBlock className="w-6 h-6 mx-auto rounded-full" />
            <SkeletonBlock className="w-12 h-3 mx-auto" />
            <SkeletonBlock className="w-16 h-5 mx-auto" />
          </div>
        ))}
      </div>

      {/* SHAP section placeholder */}
      <div className="space-y-3 pt-2">
        <SkeletonBlock className="w-40 h-4 rounded-md" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <SkeletonBlock key={i} className="w-full h-10 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function CounterfactualSkeleton() {
  return (
    <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-stone-900 rounded-3xl p-6 text-white shadow-lg border border-brand-500/40 space-y-5 animate-pulse">
      <SkeletonBlock className="w-44 h-6 rounded-full bg-brand-700/60" />
      <SkeletonBlock className="w-56 h-7 rounded-lg bg-brand-700/60" />
      <SkeletonBlock className="w-full h-12 rounded-xl bg-brand-700/40" />
      <div className="space-y-3">
        {[1, 2].map(i => (
          <SkeletonBlock key={i} className="w-full h-14 rounded-2xl bg-brand-700/50" />
        ))}
      </div>
    </div>
  )
}
