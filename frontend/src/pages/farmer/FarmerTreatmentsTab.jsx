import { Plus, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import Modal from '../../components/ui/Modal'
import DataTable from '../../components/ui/DataTable'
import { LoadingState, ErrorState } from '../../components/index'

const TYPE_BADGE = {
  organic: 'bg-green-100 text-green-800',
  biological: 'bg-sky-100 text-sky-800',
  chemical: 'bg-amber-100 text-amber-800',
}

export default function FarmerTreatmentsTab({
  treatments, treatmentsLoading, treatmentsError, onRetry,
  showTreatmentModal, setShowTreatmentModal, newTreatment, setNewTreatment,
  treatmentSuccess, handleSaveTreatment, treatmentSaving = false, canLogTreatment = true,
}) {
  const columns = [
    { key: 'treatment_date', header: 'Date' },
    { key: 'treatment_type', header: 'Type', render: (t) => (
      <span className={clsx('px-2 py-0.5 rounded-md text-[11px] font-bold uppercase', TYPE_BADGE[t.treatment_type] || 'bg-stone-100 text-stone-700')}>
        {t.treatment_type}
      </span>
    ) },
    { key: 'product_name', header: 'Product Name' },
    { key: 'target_pest', header: 'Target Pest' },
    { key: 'dosage', header: 'Dosage', render: (t) => t.dosage || '—' },
    { key: 'notes', header: 'Notes', render: (t) => t.notes || '—' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Treatment & Application Log</h2>
          <p className="text-xs text-stone-500 mt-0.5">Keep an official digital log of all bio-pesticide and chemical applications.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTreatmentModal(true)}
          disabled={!canLogTreatment}
          title={canLogTreatment ? undefined : 'Register a farm first to log treatments'}
          className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 self-start disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Plus size={16} aria-hidden="true" /> Log New Treatment
        </button>
      </div>
      {!canLogTreatment && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          Register your farm in Manage My Farm before logging treatments — every log is attached to your farm.
        </p>
      )}

      <div className="bg-white rounded-2xl border border-stone-200 p-2 sm:p-4 shadow-sm">
        {treatmentsLoading ? (
          <LoadingState message="Loading treatments…" />
        ) : treatmentsError ? (
          <ErrorState message={treatmentsError} onRetry={onRetry} />
        ) : (
          <DataTable columns={columns} rows={treatments} emptyMessage='No treatments logged yet. Click "Log New Treatment" above.' />
        )}
      </div>

      <Modal isOpen={showTreatmentModal} onClose={() => setShowTreatmentModal(false)} title="Record Field Treatment">
        {treatmentSuccess ? (
          <div className="p-6 bg-green-50 rounded-2xl text-center space-y-2">
            <CheckCircle2 size={36} className="text-green-600 mx-auto" />
            <h4 className="font-bold text-green-900 text-base">Treatment Logged!</h4>
            <p className="text-xs text-green-700">The application record has been added to your farm history.</p>
          </div>
        ) : (
          <form onSubmit={handleSaveTreatment} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tr-date" className="block text-xs font-bold text-stone-700 uppercase mb-1">Date</label>
                <input id="tr-date"
                  type="date" required
                  value={newTreatment.treatment_date}
                  onChange={(e) => setNewTreatment({ ...newTreatment, treatment_date: e.target.value })}
                  className="w-full p-2 text-xs rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label htmlFor="tr-type" className="block text-xs font-bold text-stone-700 uppercase mb-1">Type</label>
                <select id="tr-type"
                  value={newTreatment.treatment_type}
                  onChange={(e) => setNewTreatment({ ...newTreatment, treatment_type: e.target.value })}
                  className="w-full p-2 text-xs rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
                >
                  <option value="organic">Organic / Botanical</option>
                  <option value="biological">Biological Agent</option>
                  <option value="chemical">Chemical Pesticide</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="tr-product" className="block text-xs font-bold text-stone-700 uppercase mb-1">Product Name</label>
              <input id="tr-product" maxLength={200}
                type="text" required
                placeholder="e.g. NeemAzal T/S 1% or Spinosad"
                value={newTreatment.product_name}
                onChange={(e) => setNewTreatment({ ...newTreatment, product_name: e.target.value })}
                className="w-full p-2 text-xs rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tr-pest" className="block text-xs font-bold text-stone-700 uppercase mb-1">Target Pest</label>
                <input id="tr-pest" maxLength={200}
                  type="text" required
                  placeholder="e.g. Pink Bollworm"
                  value={newTreatment.target_pest}
                  onChange={(e) => setNewTreatment({ ...newTreatment, target_pest: e.target.value })}
                  className="w-full p-2 text-xs rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label htmlFor="tr-dosage" className="block text-xs font-bold text-stone-700 uppercase mb-1">Dosage</label>
                <input id="tr-dosage" maxLength={200}
                  type="text"
                  placeholder="e.g. 2.5 ml / Litre"
                  value={newTreatment.dosage}
                  onChange={(e) => setNewTreatment({ ...newTreatment, dosage: e.target.value })}
                  className="w-full p-2 text-xs rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="tr-notes" className="block text-xs font-bold text-stone-700 uppercase mb-1">Observations / Notes</label>
              <textarea id="tr-notes" maxLength={2000}
                rows={2}
                placeholder="e.g. Applied in plot A at dawn with knapsack sprayer."
                value={newTreatment.notes}
                onChange={(e) => setNewTreatment({ ...newTreatment, notes: e.target.value })}
                className="w-full p-2 text-xs rounded-lg border border-stone-300 outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowTreatmentModal(false)} className="px-4 py-2 rounded-lg text-xs font-bold text-stone-600 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                Cancel
              </button>
              <button
                type="submit"
                disabled={treatmentSaving}
                className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                {treatmentSaving ? 'Saving…' : 'Save to Farm Log'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
