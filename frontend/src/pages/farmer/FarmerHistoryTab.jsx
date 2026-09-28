import { Check } from 'lucide-react'
import { LoadingState, ErrorState } from '../../components/index'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'

export default function FarmerHistoryTab({ history, historyLoading, historyError, onRetry }) {
  const columns = [
    { key: 'date', header: 'Date' },
    { key: 'crop_type', header: 'Crop' },
    { key: 'risk_level', header: 'Risk Level', render: (h) => <Badge status={h.risk_level}>{h.risk_level}</Badge> },
    { key: 'risk_score', header: 'Probability', render: (h) => `${Math.round(h.risk_score * 100)}%` },
    { key: 'top_factor', header: 'Top Weather Factor', render: (h) => h.shap_explanation?.[0]?.feature?.replace(/_/g, ' ').toUpperCase() || 'NASA Climate' },
    { key: 'verified_by', header: 'Expert Verified', render: (h) => h.verified_by ? (
      <span className="text-green-700 font-bold flex items-center gap-1"><Check size={14} /> Verified</span>
    ) : 'AI Automated' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Farm Diagnostic & Risk History</h2>
        <p className="text-xs text-stone-500 mt-0.5">Audit log of all daily pest predictions generated for your farm.</p>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-2 sm:p-4 shadow-sm">
        {historyLoading ? (
          <LoadingState message="Loading history…" />
        ) : historyError ? (
          <ErrorState message={historyError} onRetry={onRetry} />
        ) : (
          <DataTable columns={columns} rows={history} emptyMessage="No past prediction logs recorded yet." />
        )}
      </div>
    </div>
  )
}
