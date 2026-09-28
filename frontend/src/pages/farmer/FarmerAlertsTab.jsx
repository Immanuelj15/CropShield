import { Bell } from 'lucide-react'
import { LoadingState, ErrorState } from '../../components/index'
import EmptyState from '../../components/ui/EmptyState'

export default function FarmerAlertsTab({ alerts, alertsLoading, alertsError, onRetry }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Regional Community Risk Grid Alerts</h2>
        <p className="text-xs text-stone-500 mt-0.5">Automated Haversine 5km spatial warnings triggered when neighbor plots detect high risk.</p>
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
            <div key={al.id} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-red-50 text-red-700 rounded-lg shrink-0">
                <Bell size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-800 uppercase tracking-wider">{al.type.replace(/_/g, ' ')}</span>
                  <span className="text-[11px] text-stone-400">{new Date(al.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-semibold text-stone-800 mt-1">{al.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
