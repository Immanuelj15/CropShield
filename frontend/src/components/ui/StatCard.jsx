import clsx from 'clsx'

// One canonical "icon + number + label" stat card — replaces 5-6 hand-copied variants
// (HistoryPage, TodayPage, FarmerDashboard, AgronomistDashboard, AdminDashboard).
export default function StatCard({ icon: Icon, label, value, trend, accent = 'brand', className = '' }) {
  const accentCls = {
    brand: 'bg-brand-50 text-brand-700',
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }[accent] || 'bg-brand-50 text-brand-700'

  return (
    <div className={clsx('bg-white rounded-2xl border border-stone-200 shadow-sm p-5 flex items-start gap-3', className)}>
      {Icon && (
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', accentCls)}>
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-bold text-stone-900 leading-tight mt-0.5">{value}</p>
        {trend != null && <p className="text-xs text-stone-500 mt-1">{trend}</p>}
      </div>
    </div>
  )
}
