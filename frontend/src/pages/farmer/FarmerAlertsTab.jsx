import { Bell } from 'lucide-react'
import { LoadingState, ErrorState } from '../../components/index'
import EmptyState from '../../components/ui/EmptyState'

export default function FarmerAlertsTab({ alerts, alertsLoading, alertsError, onRetry }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-800">Regional Outbreak Alerts (5 km)</h2>
        <p className="text-xs text-stone-500 mt-0.5">Automatic warnings sent when a farm within 5 km of yours records high pest risk on real (NASA POWER) weather data.</p>
      </div>

      {alertsLoading ? (
        <LoadingState message="Loading alerts…" />
      ) : alertsError ? (
        <ErrorState message={alertsError} onRetry={onRetry} />
      ) : alerts.length === 0 ? (
        <EmptyState icon={Bell} title="All clear" message="No active outbreak alerts in your 5km cluster." />
      ) : (
        <div className="space-y-3">
          {alerts.map((al) => (
            <div key={al.id || `${al.type}-${al.created_at}`} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-red-50 text-red-700 rounded-lg shrink-0">
                <Bell size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-red-800 uppercase tracking-wider">{String(al.type || 'alert').replace(/_/g, ' ')}</span>
                  <span className="text-xs text-stone-500 shrink-0">{al.created_at && !Number.isNaN(new Date(al.created_at).getTime()) ? new Date(al.created_at).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-sm font-semibold text-stone-800 mt-1 break-words">{al.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
