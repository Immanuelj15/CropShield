import { useState } from 'react'
import { Upload, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../components/ui/Toast'

import { apiFetch } from '../../utils/http'

const SUPPORTED_ADVISORY_LANGS = [
  { code: 'en', label: 'English', native: 'English', required: true },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
]

const EMPTY_FIELD = { en: '', ta: '', hi: '', te: '', ml: '' }

export default function AdminAdvisories() {
  const { t } = useTranslation(['admin', 'common', 'validation'])
  const toast = useToast()
  const [advisoryTabLang, setAdvisoryTabLang] = useState('en')
  const [newAdvisory, setNewAdvisory] = useState({
    pest_or_disease: { ...EMPTY_FIELD },
    crop_type: 'Cotton',
    season: 'Kharif',
    symptoms: { ...EMPTY_FIELD },
    organic_treatment: { ...EMPTY_FIELD },
    chemical_treatment: { ...EMPTY_FIELD },
    prevention: { ...EMPTY_FIELD },
  })

  const [saving, setSaving] = useState(false)

  const handleCreateAdvisory = async (e) => {
    e.preventDefault()
    if (!newAdvisory.pest_or_disease.en?.trim()) {
      toast.error(t('validation:field_required', { field: 'English Pest/Disease Name', defaultValue: 'English Pest or Disease Name is required as fallback.' }))
      return
    }
    if (saving) return
    setSaving(true)

    try {
      await apiFetch('/admin/advisories', {
        method: 'POST',
        json: {
          pest_or_disease: newAdvisory.pest_or_disease,
          crop_type: newAdvisory.crop_type,
          season: newAdvisory.season,
          symptoms: newAdvisory.symptoms,
          organic_treatment: newAdvisory.organic_treatment,
          chemical_treatment: newAdvisory.chemical_treatment,
          prevention: newAdvisory.prevention,
        },
      })
      toast.success('Expert multi-language advisory published successfully.')
      setNewAdvisory({
        pest_or_disease: { ...EMPTY_FIELD }, crop_type: 'Cotton', season: 'Kharif',
        symptoms: { ...EMPTY_FIELD }, organic_treatment: { ...EMPTY_FIELD },
        chemical_treatment: { ...EMPTY_FIELD }, prevention: { ...EMPTY_FIELD },
      })
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Failed to save advisory')
    } finally {
      setSaving(false)
    }
  }

  const setField = (field) => (e) => setNewAdvisory({ ...newAdvisory, [field]: { ...newAdvisory[field], [advisoryTabLang]: e.target.value } })

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 shadow-sm space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Multi-Language Knowledge Base</span>
          <h2 className="text-xl font-bold text-stone-900 mt-0.5">Upload Crop Advisory (5 Languages)</h2>
          <p className="text-xs text-stone-500">Publish research recommendations from TNAU / ICAR with English fallback and regional scripts.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-lg">
          <span className="text-xs font-bold text-stone-500 uppercase px-2">Active Script:</span>
          <span className="text-xs font-bold text-stone-900 bg-white px-2 py-0.5 rounded-lg shadow-sm">
            {SUPPORTED_ADVISORY_LANGS.find(l => l.code === advisoryTabLang)?.native} ({advisoryTabLang.toUpperCase()})
          </span>
        </div>
      </div>

      <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">Advisory Translation Language:</span>
          <span className="text-xs text-stone-500">English is required; missing languages fall back to English.</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SUPPORTED_ADVISORY_LANGS.map(lang => {
            const isSelected = advisoryTabLang === lang.code
            const hasPest = Boolean(newAdvisory.pest_or_disease[lang.code]?.trim())
            const hasOrganic = Boolean(newAdvisory.organic_treatment[lang.code]?.trim())
            const hasChemical = Boolean(newAdvisory.chemical_treatment[lang.code]?.trim())
            const isFullyFilled = hasPest && (hasOrganic || hasChemical)
            const isPartiallyFilled = hasPest || hasOrganic || hasChemical

            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => setAdvisoryTabLang(lang.code)}
                className={clsx(
                  'px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isSelected ? 'bg-brand-600 text-white border-brand-600 shadow-sm' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                )}
              >
                <span>{lang.native}</span>
                <span className="text-xs font-mono opacity-80">({lang.code.toUpperCase()})</span>
                {lang.required ? (
                  <span className={clsx('text-xs px-1.5 py-0.5 rounded font-extrabold', hasPest ? 'bg-green-200 text-green-950' : 'bg-red-200 text-red-950')}>
                    {hasPest ? '✓ EN' : '*Required'}
                  </span>
                ) : isFullyFilled ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-extrabold">✓ Complete</span>
                ) : isPartiallyFilled ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-extrabold">Partial</span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-stone-200 text-stone-500 font-semibold">Missing</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {advisoryTabLang !== 'en' && newAdvisory.pest_or_disease.en && (
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 space-y-1">
          <span className="font-bold block text-xs uppercase tracking-wider text-stone-600">English Reference Context:</span>
          <p><strong>Pest:</strong> {newAdvisory.pest_or_disease.en}</p>
          {newAdvisory.organic_treatment.en && <p><strong>Organic:</strong> {newAdvisory.organic_treatment.en}</p>}
        </div>
      )}

      <form onSubmit={handleCreateAdvisory} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-stone-700 uppercase">
              Pest or Disease Name ({SUPPORTED_ADVISORY_LANGS.find(l => l.code === advisoryTabLang)?.native} - {advisoryTabLang.toUpperCase()})
              {advisoryTabLang === 'en' && <span className="text-red-500 ml-1">*</span>}
            </label>
            {!newAdvisory.pest_or_disease[advisoryTabLang]?.trim() && advisoryTabLang !== 'en' && (
              <span className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                <AlertCircle size={12} /> Untranslated (falls back to EN)
              </span>
            )}
          </div>
          <input
            type="text"
            required={advisoryTabLang === 'en'}
            placeholder={
              advisoryTabLang === 'ta' ? 'எ.கா. பருத்தி வெள்ளை ஈ' :
              advisoryTabLang === 'hi' ? 'उदा. कपास सफेद मक्खी' :
              advisoryTabLang === 'te' ? 'ఉదా. పత్తి తెల్లదోమ' :
              advisoryTabLang === 'ml' ? 'ഉദാ. പരുത്തി വെളുത്ത ഈച്ച' :
              'e.g. Cotton Whitefly (Bemisia tabaci)'
            }
            value={newAdvisory.pest_or_disease[advisoryTabLang] || ''}
            onChange={setField('pest_or_disease')}
            className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Crop</label>
            <select
              value={newAdvisory.crop_type}
              onChange={(e) => setNewAdvisory({ ...newAdvisory, crop_type: e.target.value })}
              className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
            >
              <option value="Cotton">Cotton (பருத்தி / कपास)</option>
              <option value="Rice">Rice (நெல் / चावल)</option>
              <option value="Sugarcane">Sugarcane (கரும்பு / गन्ना)</option>
              <option value="Millets">Millets (தினை / बाजरा)</option>
              <option value="Pulses">Pulses (பருப்பு / दालें)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase mb-1">Season</label>
            <input
              type="text"
              value={newAdvisory.season}
              onChange={(e) => setNewAdvisory({ ...newAdvisory, season: e.target.value })}
              className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-stone-700 uppercase block mb-1">Symptoms ({advisoryTabLang.toUpperCase()})</label>
          <textarea
            rows={2}
            placeholder={
              advisoryTabLang === 'ta' ? 'இலைகளில் மஞ்சள் நிற புள்ளிகள், தேன் போன்ற திரவம்...' :
              advisoryTabLang === 'hi' ? 'पत्तियों पर पीले धब्बे, चिपचिपा स्राव...' :
              'Chlorotic spotting on upper leaf surfaces, honeydew excretion, sooty mold...'
            }
            value={newAdvisory.symptoms[advisoryTabLang] || ''}
            onChange={setField('symptoms')}
            className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none resize-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-stone-700 uppercase block mb-1">Organic / Bio-control Treatment ({advisoryTabLang.toUpperCase()})</label>
          <textarea
            rows={2}
            placeholder={
              advisoryTabLang === 'ta' ? 'வேப்ப எண்ணெய் தெளிப்பு (2%), மஞ்சள் ஒட்டும் பொறிகள் ஏக்கருக்கு 5...' :
              advisoryTabLang === 'hi' ? 'नीम तेल स्प्रे (2%), पीले चिपचिपे जाल प्रति एकड़ 5...' :
              'Neem oil spray (2%), yellow sticky traps (5/acre), release Chrysoperla carnea...'
            }
            value={newAdvisory.organic_treatment[advisoryTabLang] || ''}
            onChange={setField('organic_treatment')}
            className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none resize-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-stone-700 uppercase block mb-1">Chemical Treatment ({advisoryTabLang.toUpperCase()})</label>
          <textarea
            rows={2}
            placeholder={
              advisoryTabLang === 'ta' ? 'டைஃபென்துரான் 50 WP @ 2g/L அல்லது அசிடமிப்ரிட் 20 SP...' :
              advisoryTabLang === 'hi' ? 'डायफेंथियूरॉन 50 WP @ 2g/L या एसीटामिप्रिड 20 SP...' :
              'Diafenthiuron 50 WP @ 2g/L or Acetamiprid 20 SP @ 0.2g/L spray...'
            }
            value={newAdvisory.chemical_treatment[advisoryTabLang] || ''}
            onChange={setField('chemical_treatment')}
            className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none resize-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-stone-700 uppercase block mb-1">Cultural Prevention Advice ({advisoryTabLang.toUpperCase()})</label>
          <textarea
            rows={2}
            placeholder="Crop rotation, destroy alternate host weeds, avoid excess nitrogenous fertilizers..."
            value={newAdvisory.prevention[advisoryTabLang] || ''}
            onChange={setField('prevention')}
            className="w-full p-2.5 text-xs rounded-lg border border-stone-200 outline-none resize-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <button type="submit" disabled={saving} aria-busy={saving || undefined} className="disabled:opacity-50 disabled:cursor-not-allowed w-full py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Upload size={16} /> {saving ? 'Publishing…' : 'Publish multi-language advisory'}
        </button>
      </form>
    </div>
  )
}

export const advisoriesMeta = { icon: Upload, label: 'Upload Advisory' }
