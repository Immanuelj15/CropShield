import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Upload, CheckCircle2, AlertTriangle, X, ShieldCheck,
  Beaker, ArrowRight, Loader2
} from 'lucide-react'
import { apiFetch } from '../utils/http'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'] // backend LAB_REPORT_EXTENSIONS

const INPUT_CLS = 'w-full text-sm font-mono font-semibold bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500'
const LABEL_CLS = 'text-xs font-semibold text-stone-700 block mb-1'

const todayIso = () => new Date().toISOString().split('T')[0]

export default function LabReportUpload({
  farmId,
  onSuccess,
  onCancel,
}) {
  const [file, setFile] = useState(null)
  // Measurements start empty: they must be copied from the farmer's actual lab report
  const [ph, setPh] = useState('')
  const [nitrogenKg, setNitrogenKg] = useState('')
  const [phosphorusKg, setPhosphorusKg] = useState('')
  const [potassiumKg, setPotassiumKg] = useState('')
  const [organicCarbonPct, setOrganicCarbonPct] = useState('')
  const [labName, setLabName] = useState('')
  const [testDate, setTestDate] = useState(todayIso())
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Close with Escape (unless an upload is in flight)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null
    setErrorMsg(null)
    if (!f) { setFile(null); return }
    const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')).toLowerCase() : ''
    if (!ALLOWED_EXT.includes(ext)) {
      setFile(null)
      setErrorMsg('Unsupported file type. Upload a PDF, PNG, JPG or WEBP file.')
      return
    }
    if (f.size > MAX_BYTES) {
      setFile(null)
      setErrorMsg('File exceeds the 10 MB limit.')
      return
    }
    setFile(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!farmId) {
      setErrorMsg('Select or register your farm before uploading a lab report.')
      return
    }
    if (!file) {
      setErrorMsg('Please select a soil test report file (PDF, PNG, JPG or WEBP).')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('ph', String(parseFloat(ph)))
      formData.append('nitrogen_kg', String(parseFloat(nitrogenKg)))
      formData.append('phosphorus_kg', String(parseFloat(phosphorusKg)))
      formData.append('potassium_kg', String(parseFloat(potassiumKg)))
      if (organicCarbonPct !== '') formData.append('organic_carbon_pct', String(parseFloat(organicCarbonPct)))
      if (labName.trim()) formData.append('lab_name', labName.trim())
      if (testDate) formData.append('test_date', testDate)

      const data = await apiFetch(`/soil-health/${encodeURIComponent(farmId)}/upload-lab-report`, {
        method: 'POST',
        body: formData,
      })
      onSuccess?.(data?.report)
    } catch (err) {
      setErrorMsg(err.message || 'Failed to upload the lab soil report.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-stone-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lab-upload-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full p-5 sm:p-8 space-y-6 my-4 sm:my-8"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-brand-100 text-brand-800 rounded-2xl shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="min-w-0">
              <h3 id="lab-upload-title" className="text-lg font-semibold text-stone-900">
                Upload Verified Lab Soil Test Report
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Attach the report and copy its values exactly as printed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close lab report upload"
            className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Verification Precedence Banner */}
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-brand-700 mt-0.5 shrink-0" />
          <p className="text-xs text-brand-900 leading-relaxed">
            Once submitted, these laboratory values take precedence over satellite estimates in the
            Crop Recommendation Engine, fertilizer dosing and activity schedules.
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3 text-xs flex items-center gap-2" role="alert">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* File Upload Box */}
          <div className="border-2 border-dashed border-stone-300 hover:border-brand-600 focus-within:border-brand-600 rounded-2xl p-5 text-center transition-colors bg-stone-50/50">
            <input
              type="file"
              id="labFileInput"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleFileChange}
              className="sr-only"
            />
            <label htmlFor="labFileInput" className="cursor-pointer block space-y-2">
              <div className="w-12 h-12 mx-auto bg-stone-100 text-stone-600 rounded-2xl flex items-center justify-center">
                <Upload size={20} />
              </div>
              <div>
                <span className="text-sm font-semibold text-stone-800 break-all">
                  {file ? file.name : 'Select your laboratory report (PDF, PNG, JPG, WEBP · max 10 MB)'}
                </span>
                <span className="text-xs text-stone-500 block mt-0.5">
                  Stored with the report for audit and agronomist verification
                </span>
              </div>
            </label>
          </div>

          {/* Quantitative Manual Measurements Grid */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Beaker size={14} className="text-brand-700" /> Lab test measurements
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label htmlFor="lab-ph" className={LABEL_CLS}>Soil pH (0–14)</label>
                <input id="lab-ph" type="number" step="0.01" min="0" max="14" inputMode="decimal"
                  value={ph} onChange={(e) => setPh(e.target.value)} required placeholder="e.g. 7.2" className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="lab-n" className={LABEL_CLS}>Available N (kg/acre)</label>
                <input id="lab-n" type="number" step="0.1" min="0" max="10000" inputMode="decimal"
                  value={nitrogenKg} onChange={(e) => setNitrogenKg(e.target.value)} required placeholder="e.g. 42" className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="lab-p" className={LABEL_CLS}>Available P₂O₅ (kg/acre)</label>
                <input id="lab-p" type="number" step="0.1" min="0" max="10000" inputMode="decimal"
                  value={phosphorusKg} onChange={(e) => setPhosphorusKg(e.target.value)} required placeholder="e.g. 18.5" className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="lab-k" className={LABEL_CLS}>Available K₂O (kg/acre)</label>
                <input id="lab-k" type="number" step="0.1" min="0" max="10000" inputMode="decimal"
                  value={potassiumKg} onChange={(e) => setPotassiumKg(e.target.value)} required placeholder="e.g. 32" className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="lab-oc" className={LABEL_CLS}>Organic carbon (%) <span className="font-normal text-stone-500">optional</span></label>
                <input id="lab-oc" type="number" step="0.01" min="0" max="100" inputMode="decimal"
                  value={organicCarbonPct} onChange={(e) => setOrganicCarbonPct(e.target.value)} placeholder="e.g. 0.62" className={INPUT_CLS} />
              </div>

              <div>
                <label htmlFor="lab-date" className={LABEL_CLS}>Test date</label>
                <input id="lab-date" type="date" max={todayIso()}
                  value={testDate} onChange={(e) => setTestDate(e.target.value)} required className={INPUT_CLS} />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="lab-name" className={LABEL_CLS}>Testing laboratory</label>
            <input
              id="lab-name"
              type="text"
              maxLength={200}
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              placeholder="e.g. TNAU Soil Science Testing Lab, Coimbatore"
              required
              className={INPUT_CLS.replace('font-mono ', '')}
            />
          </div>

          {/* Form Actions */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3 border-t border-stone-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="btn-secondary px-4 py-2.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !farmId}
              className="btn-primary px-6 py-2.5 text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {submitting ? (
                <><Loader2 size={14} className="animate-spin" /> Saving lab report…</>
              ) : (
                <>Save &amp; Override Preliminary Estimate <ArrowRight size={14} /></>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
