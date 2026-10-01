import { Check } from 'lucide-react'
import { LoadingState, ErrorState, friendlyName } from '../../components/index'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'

export default function FarmerHistoryTab({ history, historyLoading, historyError, onRetry }) {
  const columns = [
    { key: 'date', header: 'Date' },
    { key: 'crop_type', header: 'Crop' },
    { key: 'risk_level', header: 'Risk Level', render: (h) => (h.risk_level ? <Badge status={h.risk_level}>{h.risk_level}</Badge> : '—') },
    { key: 'risk_score', header: 'Risk Score', render: (h) => (typeof h.risk_score === 'number' && Number.isFinite(h.risk_score) ? `${Math.round(h.risk_score * 100)}%` : '—') },
    { key: 'top_factor', header: 'Top Weather Factor', render: (h) => (Array.isArray(h.shap_explanation) && h.shap_explanation[0]?.feature ? friendlyName(h.shap_explanation[0].feature) : '—') },
    { key: 'verified_by', header: 'Expert Verified', render: (h) => h.verified_by ? (
      <span className="text-green-700 font-bold flex items-center gap-1"><Check size={14} /> Verified</span>
    ) : <span className="text-stone-500">Not yet reviewed</span> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-stone-800">Farm Diagnostic & Risk History</h2>
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
