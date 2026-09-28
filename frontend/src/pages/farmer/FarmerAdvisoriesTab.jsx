import { Search } from 'lucide-react'
import { getLocalizedText } from '../../utils/useLocalizedField'
import { LoadingState, ErrorState } from '../../components/index'
import EmptyState from '../../components/ui/EmptyState'

export default function FarmerAdvisoriesTab({
  advisories, advisoriesLoading, advisoriesError, onRetry,
  advisorySearch, setAdvisorySearch, advisoryCrop, setAdvisoryCrop, currentLang, t,
}) {
  const filteredAdvisories = advisories.filter(a => {
    const pestName = String(getLocalizedText(a.pest_or_disease, currentLang) || '').toLowerCase()
    const cropName = String(getLocalizedText(a.crop_type, currentLang) || '').toLowerCase()
    const chem = String(getLocalizedText(a.chemical_treatment, currentLang) || '').toLowerCase()
    const org = String(getLocalizedText(a.organic_treatment, currentLang) || '').toLowerCase()
    const sym = String(getLocalizedText(a.symptoms, currentLang) || '').toLowerCase()

    const matchesCrop = advisoryCrop === 'All' || cropName.includes(advisoryCrop.toLowerCase())
    const q = (advisorySearch || '').toLowerCase()
    const matchesSearch = !advisorySearch || pestName.includes(q) || chem.includes(q) || org.includes(q) || sym.includes(q)
    return matchesCrop && matchesSearch
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Digital Pest & Disease Advisories</h2>
          <p className="text-xs text-stone-500 mt-0.5">TNAU & ICAR verified treatment and prevention guidance by crop and pest.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Search pest or symptoms..."
              value={advisorySearch}
              onChange={(e) => setAdvisorySearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 rounded-lg border border-stone-200 text-xs outline-none focus:ring-2 focus:ring-brand-500 w-52"
            />
          </div>
          <select
            value={advisoryCrop}
            onChange={(e) => setAdvisoryCrop(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold text-stone-700 outline-none"
          >
            <option value="All">All Crops</option>
            <option value="Cotton">Cotton</option>
            <option value="Rice">Rice</option>
            <option value="Sugarcane">Sugarcane</option>
            <option value="Millets">Millets</option>
            <option value="Pulses">Pulses</option>
          </select>
        </div>
      </div>

      {advisoriesLoading ? (
        <LoadingState message="Loading advisories…" />
      ) : advisoriesError ? (
        <ErrorState message={advisoriesError} onRetry={onRetry} />
      ) : filteredAdvisories.length === 0 ? (
        <EmptyState title="No matching advisories" message="Try a different search term or crop filter." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAdvisories.map((adv) => {
            const cropName = getLocalizedText(adv.crop_type, currentLang)
            const pestName = getLocalizedText(adv.pest_or_disease, currentLang)
            const org = getLocalizedText(adv.organic_treatment, currentLang)
            const chem = getLocalizedText(adv.chemical_treatment, currentLang)
            const symp = Array.isArray(adv.symptoms)
              ? adv.symptoms.map(s => getLocalizedText(s, currentLang)).filter(Boolean).join(', ')
              : getLocalizedText(adv.symptoms, currentLang)

            return (
              <div key={adv.id} className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-brand-700 uppercase tracking-wider">{cropName} {t('farmer:advisories_tab')}</span>
                    <h3 className="font-bold text-base text-stone-900">{pestName}</h3>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-bold">{adv.season || 'All Seasons'}</span>
                </div>

                <div className="space-y-2 text-xs">
                  {symp && <p className="text-stone-600"><strong>Symptoms:</strong> {symp}</p>}
                  {org && <div className="p-2.5 bg-green-50 rounded-lg text-green-900"><strong>🌿 Organic:</strong> {org}</div>}
                  {chem && <div className="p-2.5 bg-stone-50 rounded-lg text-stone-800"><strong>🧪 Chemical:</strong> {chem}</div>}
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
                  <span>Temp: {adv.favorable_temp_range || '24-34°C'}</span>
                  <span>RH: {adv.favorable_humidity_range || '65-85%'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
