import { Camera, Activity, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

export default function FarmerDiseaseTab({
  previewUrl, selectedFile, scanResult, scanLoading, scanError, handleFileChange, handleDiseaseScan,
}) {
  const { t } = useTranslation(['farmer'])
  // Contract 7: when the disease model is unavailable the result is not reliable —
  // never show a confidence % or a treatment.
  const modelUnavailable = scanResult?.model_available === false
  const confidencePct = typeof scanResult?.confidence === 'number' ? Math.round(scanResult.confidence * 100) : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-6 bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Leaf Disease Vision Scan</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Upload a photo taken on your mobile phone for an AI leaf-disease diagnosis.
          </p>
        </div>

        <div className="border-2 border-dashed border-stone-200 hover:border-brand-500 rounded-2xl p-6 text-center transition-all">
          {previewUrl ? (
            <div className="space-y-3">
              <img src={previewUrl} alt="Leaf Preview" className="max-h-56 mx-auto rounded-lg shadow-md object-contain" />
              <p className="text-xs text-stone-600 font-medium">{selectedFile?.name}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Camera size={36} className="mx-auto text-stone-500" />
              <p className="text-xs font-bold text-stone-700">Take or upload a photo of an affected leaf</p>
              <p className="text-[11px] text-stone-500">Supports JPG, PNG from phone camera or gallery</p>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            aria-label="Upload or capture a leaf photo"
            onChange={handleFileChange}
            className="mt-4 block w-full text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
          />
        </div>

        {scanError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <span>{scanError}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleDiseaseScan}
          disabled={scanLoading}
          className="w-full py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {scanLoading ? (
            <><Activity size={16} className="animate-spin" /> Analyzing leaf photo...</>
          ) : (
            <><Camera size={16} /> Run Disease Diagnosis</>
          )}
        </button>
      </div>

      <div className="lg:col-span-6">
        {scanResult && modelUnavailable ? (
          <div className="bg-amber-50 rounded-2xl border border-amber-300 p-6 shadow-sm space-y-2" role="alert">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle size={20} className="shrink-0" />
              <h3 className="text-base font-bold">{t('farmer:model_unavailable', 'Disease model unavailable — result not reliable')}</h3>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              {scanResult.message || 'The leaf-disease model is not loaded on the server, so no diagnosis, confidence or treatment can be given for this photo.'}
            </p>
            <p className="text-xs text-amber-700">Please ask an agronomist via the support desk before applying any treatment.</p>
          </div>
        ) : scanResult ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">AI Leaf Diagnosis</span>
                <h3 className="text-xl font-bold text-stone-900 mt-0.5">{scanResult.disease_name || String(scanResult.predicted_class || 'Unknown').replace(/___/g, ' · ').replace(/_/g, ' ')}</h3>
                <span className="text-xs text-stone-500 font-medium">{scanResult.pathogen}</span>
              </div>
              {scanResult.severity_level && (
                <span className={clsx(
                  'text-xs px-3 py-1 font-bold rounded-full border shrink-0',
                  scanResult.severity_level === 'High' ? 'bg-red-100 text-red-800 border-red-200' :
                  scanResult.severity_level === 'Medium' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-green-100 text-green-800 border-green-200'
                )}>
                  {scanResult.severity_level} Severity
                </span>
              )}
            </div>

            {confidencePct !== null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-600">Model Confidence</span>
                <span className="font-bold text-brand-700">{confidencePct}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${confidencePct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="bg-brand-600 h-full rounded-full"
                />
              </div>
            </div>
            )}
            {scanResult.is_heuristic && (
              <p className="text-[11px] text-amber-700 font-semibold">Heuristic estimate — confirm with an agronomist.</p>
            )}

            {scanResult.top_k && scanResult.top_k.length > 1 && (
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                <span className="text-[11px] font-bold text-stone-600 uppercase block mb-1.5">Differential Diagnoses (Top Alternatives)</span>
                <div className="space-y-1">
                  {scanResult.top_k.slice(1).map((alt, idx) => (
                    <div key={idx} className="flex items-center justify-between text-stone-600">
                      <span>{String(alt.class || '').replace(/___/g, ' · ').replace(/_/g, ' ')}</span>
                      <span className="font-bold">{typeof alt.confidence === 'number' ? `${Math.round(alt.confidence * 100)}%` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              {/* Only show treatments the server actually returned — no invented defaults */}
              {scanResult.organic_treatment && (
              <div className="p-3.5 bg-green-50 rounded-lg border border-green-200 text-xs">
                <span className="font-bold text-green-900 block mb-1">🌿 TNAU Bio-Control Recommendation:</span>
                <p className="text-green-800 leading-relaxed">{scanResult.organic_treatment}</p>
              </div>
              )}
              {scanResult.chemical_treatment && (
              <div className="p-3.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                <span className="font-bold text-stone-900 block mb-1">🧪 ICAR Chemical Intervention:</span>
                <p className="text-stone-700 leading-relaxed">{scanResult.chemical_treatment}</p>
              </div>
              )}
              {scanResult.prevention && (
                <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs">
                  <span className="font-bold text-sky-900 block mb-0.5">🛡️ Cultural Prevention:</span>
                  <p className="text-sky-800">{scanResult.prevention}</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="bg-stone-50 rounded-2xl border border-stone-200/80 p-12 text-center text-stone-500">
            <Camera size={36} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold">Diagnosis results will appear here after scanning a leaf photo.</p>
            <p className="text-xs text-stone-500 mt-1">Accepts mobile photos up to 10MB (automatically compressed for rural connectivity).</p>
          </div>
        )}
      </div>
    </div>
  )
}
