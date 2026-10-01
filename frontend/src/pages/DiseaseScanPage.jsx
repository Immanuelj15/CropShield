import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Camera, CheckCircle2, Leaf, Cpu,
  AlertTriangle, RefreshCw, Sparkles, FileImage,
  ShieldCheck, Droplets
} from 'lucide-react'
import api from '../utils/api'
import { apiFetch } from '../utils/http'
import { farmIdOf } from '../utils/farms'
import { compressImage } from '../utils/imageCompression'

export default function DiseaseScanPage() {
  const [selectedCrop, setSelectedCrop] = useState('Cotton')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [compressionInfo, setCompressionInfo] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const fileInputRef = useRef(null)
  const [farmId, setFarmId] = useState(null)

  // Link scans to the caller's farm when they have one (P2-3). Failure is non-fatal.
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/farms/me', { signal: controller.signal })
      .then((farm) => setFarmId(farmIdOf(farm) || null))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // Revoke preview object URLs when replaced and on unmount (P3-9)
  const previewRef = useRef(null)
  const setPreview = (url) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = url
    setImagePreview(url)
  }
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErrorMsg(null)
    setResult(null)
    setUploadProgress(0)

    // Format validation
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    if (!validTypes.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setErrorMsg('Unsupported file format. Please upload a JPG, PNG, or WebP photo.')
      return
    }

    // Size limit check (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File size exceeds the 10MB limit. Please select a smaller photo.')
      return
    }

    try {
      setPreview(URL.createObjectURL(file))
      
      // Perform client-side compression immediately
      const { file: compressedFile, meta } = await compressImage(file)
      setCompressionInfo(meta)
      setImageFile(compressedFile)
    } catch (err) {
      setErrorMsg('Failed to process image preview. Please try another photo.')
    }
  }

  const runScan = async () => {
    if (loading) return
    if (!imageFile) {
      setErrorMsg('Please select or capture a leaf photo first.')
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setUploadProgress(5)

    const formData = new FormData()
    // Append compressed blob as JPEG
    formData.append('file', imageFile, 'leaf_scan.jpg')
    formData.append('crop_hint', selectedCrop)
    if (farmId) formData.append('farm_id', farmId)

    try {
      // Shared axios instance: Bearer token from sessionStorage + 401 redirect + normalized errors
      const res = await api.post('/disease/detect', formData, {
        timeout: 60000,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setUploadProgress(percent)
          }
        },
      })

      setResult(res.data)
      setUploadProgress(100)
    } catch (err) {
      const message = err.message

      if (err.status === 400 || err.status === 413) {
        setErrorMsg(`Upload rejected: ${message}`)
      } else {
        setErrorMsg(message || 'Could not reach the disease diagnosis service. Please check your connection and try again.')
      }
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const resetScan = () => {
    setImageFile(null)
    setPreview(null)
    setCompressionInfo(null)
    setResult(null)
    setErrorMsg(null)
    setUploadProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-brand-900 via-brand-800 to-stone-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-brand-400/20 text-brand-200 text-xs font-semibold rounded-full border border-brand-400/30 flex items-center gap-1.5">
              <Sparkles size={12} className="text-brand-300" /> AI Leaf Diagnosis · PlantVillage-trained model
            </span>
            <span className="px-3 py-1 bg-white/10 text-brand-100 text-xs font-medium rounded-full border border-white/20">
              Rural 2G/3G Optimized
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Leaf Disease Vision Scanner</h1>
          <p className="text-brand-100/90 max-w-2xl text-sm leading-relaxed">
            Upload or capture a leaf photo. AgriGuard AI's transfer-learning model classifies common leaf diseases,
            estimates severity and shows organic & chemical treatment advice when a reliable diagnosis is possible.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Upload & Compression Controls (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Camera className="text-brand-600" size={18} /> 1. Select Crop & Photo
              </h2>
              {imagePreview && (
                <button
                  type="button"
                  onClick={resetScan}
                  className="text-xs font-medium text-stone-500 hover:text-stone-800 flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Clear
                </button>
              )}
            </div>

            {/* Target Crop Selection */}
            <div>
              <label htmlFor="scan-crop" className="label text-xs">Target Crop Species</label>
              <select
                id="scan-crop"
                value={selectedCrop}
                onChange={(e) => setSelectedCrop(e.target.value)}
                className="input-field text-sm font-medium"
              >
                <option value="Cotton">Cotton (பருத்தி)</option>
                <option value="Tomato">Tomato (தக்காளி)</option>
                <option value="Potato">Potato (உருளைக்கிழங்கு)</option>
                <option value="Rice">Rice / Paddy (நெல்)</option>
                <option value="Corn (maize)">Corn / Maize (மக்காச்சோளம்)</option>
              </select>
            </div>

            {/* Upload Drag & Drop Area */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a leaf photo"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                imagePreview
                  ? 'border-brand-400 bg-brand-50/20'
                  : 'border-stone-300 hover:border-brand-500 bg-stone-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="hidden"
                id="leaf-scan-input"
              />

              {imagePreview ? (
                <div className="space-y-3">
                  <div className="relative inline-block rounded-xl overflow-hidden shadow-md border border-stone-200 max-h-56">
                    <img
                      src={imagePreview}
                      alt="Leaf Preview"
                      className="object-contain max-h-56 mx-auto rounded-lg"
                    />
                    <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white px-2 py-0.5 rounded text-xs font-mono">
                      {compressionInfo?.dimensions || 'Processed'}
                    </div>
                  </div>
                  <p className="text-xs text-brand-700 font-medium flex items-center justify-center gap-1">
                    <CheckCircle2 size={13} /> Photo ready for diagnostic analysis
                  </p>
                </div>
              ) : (
                <div className="space-y-3 py-6">
                  <div className="w-14 h-14 rounded-2xl bg-brand-100/70 text-brand-700 flex items-center justify-center mx-auto shadow-inner">
                    <Upload size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">Tap to upload leaf photo</p>
                    <p className="text-xs text-stone-500 mt-1">JPEG, PNG, or WebP up to 10MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* Compression Telemetry Card */}
            {compressionInfo && (
              <div className="bg-stone-50 rounded-xl p-3 border border-stone-200 text-xs space-y-1">
                <div className="flex items-center justify-between text-stone-600">
                  <span className="flex items-center gap-1 font-medium">
                    <FileImage size={13} className="text-stone-500" /> Client Resizing:
                  </span>
                  <span className="font-semibold text-brand-700">
                    {compressionInfo.origKB} KB → {compressionInfo.compKB} KB (-{compressionInfo.savedPct}%)
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Downscaled to max 1024px JPEG 80% to ensure instant upload on rural networks.
                </p>
              </div>
            )}

            {/* Error Message Alert */}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Upload Progress Bar */}
            {loading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-stone-600 font-medium">
                  <span>Uploading & analysing photo...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Scan Action Button */}
            <button
              type="button"
              onClick={runScan}
              disabled={loading || (!imageFile && !imagePreview)}
              className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-brand-700/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Cpu className="animate-spin" size={17} /> Diagnosing Pathogen...
                </span>
              ) : (
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Leaf size={17} /> Run Leaf Diagnosis
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Diagnosis & Treatment Results (7 Cols) */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {result && result.model_available === false ? (
              <motion.div
                key="model-unavailable-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="card p-7 space-y-3 border-l-4 border-amber-500 shadow-lg"
                role="alert"
              >
                <h3 className="text-xl font-black text-amber-900 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-amber-600" /> Disease model unavailable — result not reliable
                </h3>
                <p className="text-sm text-stone-700 leading-relaxed">
                  {result.message || 'The leaf-disease model is not loaded on the server, so no diagnosis, confidence or treatment can be given for this photo.'}
                </p>
                <p className="text-xs text-stone-500">Do not apply any treatment based on this scan. Ask an agronomist through the support desk instead.</p>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="card p-7 space-y-6 border-l-4 border-brand-600 shadow-lg"
              >
                {/* Result Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 pb-5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-brand-100 text-brand-800 text-xs font-bold rounded-full uppercase tracking-wider">
                        {result.crop || selectedCrop} Diagnosis
                      </span>
                      {result.severity_level && (
                        <span
                          className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                            result.severity_level === 'High'
                              ? 'bg-red-100 text-red-800'
                              : result.severity_level === 'Medium'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {result.severity_level} Severity
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-black text-stone-900 tracking-tight">
                      {result.disease_name || String(result.predicted_class || 'Unknown').replace(/___/g, ' · ').replace(/_/g, ' ')}
                    </h3>
                    {result.is_heuristic && (
                      <p className="text-xs font-semibold text-amber-700">Heuristic estimate — confirm with an agronomist.</p>
                    )}
                    {result.pathogen && (
                      <p className="text-xs text-stone-500 font-mono italic">
                        Pathogen: {result.pathogen}
                      </p>
                    )}
                  </div>

                  {/* Animated Confidence Gauge */}
                  {typeof result.confidence === 'number' && (
                  <div className="text-right">
                    <span className="text-xs text-stone-500 font-medium">Model Confidence</span>
                    <p className="text-3xl font-black text-brand-700">
                      {Math.round(result.confidence * 100)}%
                    </p>
                    {result.model_name && (
                      <span className="text-[11px] text-stone-500 font-mono">{result.model_name}</span>
                    )}
                  </div>
                  )}
                </div>

                {/* Differential Diagnosis (Top-K) */}
                {result.top_k && result.top_k.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu size={14} className="text-brand-600" /> Differential Diagnosis (Top-K Matches)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {result.top_k.map((item, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border text-xs ${
                            idx === 0
                              ? 'bg-brand-50/80 border-brand-300 font-semibold text-brand-900'
                              : 'bg-stone-50 border-stone-200 text-stone-600'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="truncate pr-1 text-[11px] font-mono">
                              {String(item.class || '').split('___').pop().replace(/_/g, ' ')}
                            </span>
                            <span className="font-bold text-brand-800 shrink-0">
                              {typeof item.confidence === 'number' ? `${(item.confidence * 100).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          <div className="w-full bg-stone-200/80 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${
                                idx === 0 ? 'bg-brand-600' : 'bg-stone-400'
                              }`}
                              style={{ width: `${Math.min(100, (Number(item.confidence) || 0) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Treatment Advisories Grid */}
                {(result.organic_treatment || result.chemical_treatment) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Organic Solution */}
                  {result.organic_treatment && (
                  <div className="p-5 rounded-2xl bg-brand-50/70 border border-brand-200/80 space-y-2">
                    <h4 className="font-bold text-brand-900 text-sm flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-brand-700" /> Organic & Bio-Control Solution
                    </h4>
                    <p className="text-xs text-brand-900 leading-relaxed">
                      {result.organic_treatment}
                    </p>
                  </div>
                  )}

                  {/* Chemical Recommendation */}
                  {result.chemical_treatment && (
                  <div className="p-5 rounded-2xl bg-sky-50/70 border border-sky-200/80 space-y-2">
                    <h4 className="font-bold text-sky-950 text-sm flex items-center gap-2">
                      <Droplets size={16} className="text-sky-700" /> Targeted Chemical Treatment
                    </h4>
                    <p className="text-xs text-sky-900 leading-relaxed">
                      {result.chemical_treatment}
                    </p>
                  </div>
                  )}
                </div>
                )}

                {/* Agronomic Prevention Tips */}
                {result.prevention && (
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900">
                      <ShieldCheck size={14} className="text-amber-700" /> Agronomic Prevention & Sanitation
                    </div>
                    <p className="leading-relaxed">{result.prevention}</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="placeholder-card"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="card p-12 text-center text-stone-500 space-y-4 border-dashed border-2 flex flex-col items-center justify-center min-h-[380px]"
              >
                <div className="w-16 h-16 rounded-3xl bg-stone-100 flex items-center justify-center text-stone-500">
                  <Leaf size={32} className="animate-pulse text-brand-600/70" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="text-stone-700 font-semibold text-base">Awaiting Leaf Photo</p>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Select your crop and upload a leaf image on the left. The leaf-disease classifier
                    checks symptom patterns and shows treatment advice when the diagnosis is reliable.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
