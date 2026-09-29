import { useState, useEffect } from 'react'
import { Database } from 'lucide-react'
import clsx from 'clsx'
import { useLocalizedField, getLocalizedText } from '../../utils/useLocalizedField'

import { apiFetch } from '../../utils/http'
const LANGS = ['en', 'ta', 'hi', 'te', 'ml']

export default function AdminPests() {
  const { currentLang } = useLocalizedField()
  const [pests, setPests] = useState([])
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/admin/pests-diseases')
        setPests(Array.isArray(data) ? data : [])
      } catch (e) {
        console.error(e)
        setLoadError(e.message || 'Could not load data.')
      }
    })()
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4">
      {loadError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</p>}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Pest & Disease Knowledge Base</h2>
          <p className="text-xs text-stone-500">Manage digital pest taxonomy and TNAU management recommendations.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase font-bold">
            <tr>
              <th className="p-3">Pest / Pathogen</th>
              <th className="p-3">Crop</th>
              <th className="p-3">Organic Recommendation</th>
              <th className="p-3">Chemical Recommendation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {pests.map(p => {
              const pestName = getLocalizedText(p.pest_or_disease, currentLang)
              const cropName = getLocalizedText(p.crop_type, currentLang)
              const organic = getLocalizedText(p.organic_treatment, currentLang)
              const chemical = getLocalizedText(p.chemical_treatment, currentLang)

              const availableLangs = LANGS.filter(code => {
                if (typeof p.pest_or_disease === 'object' && p.pest_or_disease !== null) {
                  return Boolean(p.pest_or_disease[code])
                }
                return code === 'en'
              })

              return (
                <tr key={p.id} className="hover:bg-stone-50 transition-colors">
                  <td className="p-3 whitespace-nowrap">
                    <span className="font-bold text-stone-900 block">{pestName}</span>
                    <div className="flex items-center gap-1 mt-1">
                      {LANGS.map(code => {
                        const isPresent = availableLangs.includes(code)
                        return (
                          <span
                            key={code}
                            className={clsx(
                              'text-[9px] uppercase px-1 py-0.2 rounded font-mono font-bold',
                              isPresent ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-stone-100 text-stone-400 border border-stone-200'
                            )}
                          >
                            {code}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td className="p-3 font-semibold text-brand-800 whitespace-nowrap">{cropName}</td>
                  <td className="p-3 text-stone-600 max-w-xs truncate">{organic || '—'}</td>
                  <td className="p-3 text-stone-500 max-w-xs truncate">{chemical || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const pestsMeta = { icon: Database, label: 'Pest & Disease DB' }
