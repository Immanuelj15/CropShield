import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Upload, FileText, CheckCircle2, AlertTriangle, X, ShieldCheck,
  Building, Calendar, Beaker, ArrowRight
} from 'lucide-react'

export default function LabReportUpload({
  farmId,
  onSuccess,
  onCancel,
}) {
  const [file, setFile] = useState(null)
  const [ph, setPh] = useState('7.2')
  const [nitrogenKg, setNitrogenKg] = useState('42.0')
  const [phosphorusKg, setPhosphorusKg] = useState('18.5')
  const [potassiumKg, setPotassiumKg] = useState('32.0')
  const [organicCarbonPct, setOrganicCarbonPct] = useState('0.62')
  const [labName, setLabName] = useState('District Agricultural Soil Testing Laboratory')
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setErrorMsg('Please select a soil test report file (PDF, PNG, JPG).')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('ph', parseFloat(ph))
      formData.append('nitrogen_kg', parseFloat(nitrogenKg))
      formData.append('phosphorus_kg', parseFloat(phosphorusKg))
      formData.append('potassium_kg', parseFloat(potassiumKg))
      formData.append('organic_carbon_pct', parseFloat(organicCarbonPct))
      formData.append('lab_name', labName)
      formData.append('test_date', testDate)

      const targetId = farmId || 'demo_farm_default'
      const res = await fetch(`http://localhost:8000/api/v1/soil-health/${targetId}/upload-lab-report`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to upload and register lab soil report.')
      }

      const data = await res.json()
      if (onSuccess) {
        onSuccess(data.report)
      }
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 my-8"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-stone-900">
                Upload Verified Laboratory Soil Test Report
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Manual entry accompanied by supporting document for 100% agronomic fidelity
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Verification Precedence Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-700 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-900 leading-relaxed font-medium">
            Once submitted, these verified laboratory values permanently take precedence over satellite
            estimates across the Crop Recommendation Engine, Fertilizer Dosing, and Activity Schedules.
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 text-xs flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* File Upload Box */}
          <div className="border-2 border-dashed border-stone-300 hover:border-emerald-600 rounded-2xl p-5 text-center transition-colors bg-stone-50/50">
            <input
              type="file"
              id="labFileInput"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setFile(e.target.files[0])}
              className="hidden"
            />
            <label htmlFor="labFileInput" className="cursor-pointer block space-y-2">
              <div className="w-12 h-12 mx-auto bg-stone-100 text-stone-600 rounded-2xl flex items-center justify-center">
                <Upload size={20} />
              </div>
              <div>
                <span className="text-xs font-bold text-stone-800">
                  {file ? file.name : 'Click to select laboratory report (PDF, PNG, JPG)'}
                </span>
                <span className="text-[11px] text-stone-400 block mt-0.5">
                  Supporting document stored for audit and agronomist verification
                </span>
              </div>
            </label>
          </div>

          {/* Quantitative Manual Measurements Grid */}
          <div className="space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Beaker size={14} className="text-emerald-700" /> Enter Exact Lab Test Measurements
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-stone-600 block mb-1">Soil pH (0-14)</label>
                <input
                  type="number"
                  step="0.01"
                  min="3.5"
                  max="10.5"
                  value={ph}
                  onChange={(e) => setPh(e.target.value)}
                  required
                  className="w-full text-xs font-mono font-bold bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-600 block mb-1">Available N (kg/acre)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={nitrogenKg}
                  onChange={(e) => setNitrogenKg(e.target.value)}
                  required
                  className="w-full text-xs font-mono font-bold bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-600 block mb-1">Available P₂O₅ (kg/acre)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={phosphorusKg}
                  onChange={(e) => setPhosphorusKg(e.target.value)}
                  required
                  className="w-full text-xs font-mono font-bold bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-600 block mb-1">Available K₂O (kg/acre)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={potassiumKg}
                  onChange={(e) => setPotassiumKg(e.target.value)}
                  required
                  className="w-full text-xs font-mono font-bold bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-600 block mb-1">Organic Carbon (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={organicCarbonPct}
                  onChange={(e) => setOrganicCarbonPct(e.target.value)}
                  required
                  className="w-full text-xs font-mono font-bold bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-stone-600 block mb-1">Test Date</label>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  required
                  className="w-full text-xs font-mono bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-stone-600 block mb-1">Testing Authority / Facility</label>
            <input
              type="text"
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              placeholder="e.g. TNAU Soil Science Testing Lab, Coimbatore"
              required
              className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-600"
            />
          </div>

          {/* Form Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-stone-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {submitting ? 'Registering Lab Report...' : 'Save & Override Preliminary Estimate'}
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
