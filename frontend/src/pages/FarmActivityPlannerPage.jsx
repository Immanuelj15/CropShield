import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, RefreshCw,
  Plus, CheckCircle2, Lightbulb, MapPin,
  Compass, Bell, Sparkles, X
} from 'lucide-react'
import clsx from 'clsx'

import IrrigationCard from '../components/IrrigationCard'
import FertilizerCard from '../components/FertilizerCard'
import ActivityTimelineItem from '../components/ActivityTimelineItem'
import { localISODate } from '../components/QuickAddExpenseForm'
import { useToast } from '../components/ui/Toast'

import { apiFetch, isAbortError } from '../utils/http'
import { fetchMyFarms, farmIdOf, farmNameOf } from '../utils/farms'

// Must match the backend crop tables (Kc coefficients / NPK requirements).
const TAMIL_NADU_15_CROPS = [
  'Cotton', 'Rice', 'Sorghum', 'Millets', 'Sugarcane',
  'Pulses', 'Groundnut', 'Maize', 'Sesamum', 'Sunflower',
  'Banana', 'Turmeric', 'Chili', 'Onion', 'Coconut'
]

const STATUS_LABEL = { due_today: 'Due today', overdue: 'Overdue' }

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

// "YYYY-MM-DD" → "24 Sep 2026" (local calendar date)
function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!m) return value || '—'
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const cropForPlan = (farm) =>
  farm?.crop_type && TAMIL_NADU_15_CROPS.includes(farm.crop_type) ? farm.crop_type : 'Cotton'

export default function FarmActivityPlannerPage() {
  const [farms, setFarms] = useState([])
  const [selectedFarmId, setSelectedFarmId] = useState(null)
  const [activePlan, setActivePlan] = useState(null)
  const [irrigationData, setIrrigationData] = useState(null)
  const [fertilizerData, setFertilizerData] = useState(null)
  const [irrigationError, setIrrigationError] = useState(null)
  const [fertilizerError, setFertilizerError] = useState(null)

  const [loadingFarms, setLoadingFarms] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [filterType, setFilterType] = useState('all') // 'all' | 'due' | 'irrigation' | 'fertilizer' | 'pest_check' | 'completed'
  const [showSetupModal, setShowSetupModal] = useState(false)
  const toast = useToast()

  // Plan generation form
  const [setupCrop, setSetupCrop] = useState('Cotton')
  const [setupSowingDate, setSetupSowingDate] = useState(() => localISODate())
  const [actionSuccess, setActionSuccess] = useState(null)

  const [farmsError, setFarmsError] = useState(null)
  const [planError, setPlanError] = useState(null)
  const [completingId, setCompletingId] = useState(null)

  const selectedFarmIdRef = useRef(selectedFarmId)
  selectedFarmIdRef.current = selectedFarmId

  // 1. Fetch the caller's own farms
  useEffect(() => {
    const controller = new AbortController()
    fetchFarms(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchFarms = async (signal) => {
    setLoadingFarms(true)
    setFarmsError(null)
    try {
      const data = await fetchMyFarms({ signal })
      setFarms(data)
      if (data.length > 0) {
        setSelectedFarmId((prev) => (data.some((f) => farmIdOf(f) === prev) ? prev : farmIdOf(data[0])))
        setSetupCrop(cropForPlan(data[0]))
      } else {
        setSelectedFarmId(null)
      }
    } catch (e) {
      if (isAbortError(e)) return
      console.error('Error fetching farms:', e)
      setFarmsError(e.message || 'Could not load your farms.')
    } finally {
      if (!signal?.aborted) setLoadingFarms(false)
    }
  }

  // 2. Fetch active plan & telemetry whenever selected farm changes.
  // P2-8: clear the previous farm's plan immediately and ignore stale responses,
  // so "Complete" can never post farm A's activity ids against farm B.
  const planRequestRef = useRef({ id: 0, controller: null })

  useEffect(() => {
    setActivePlan(null)
    setIrrigationData(null)
    setFertilizerData(null)
    setIrrigationError(null)
    setFertilizerError(null)
    setPlanError(null)
    if (selectedFarmId) {
      fetchFarmPlanAndTelemetry(selectedFarmId)
    }
    return () => planRequestRef.current.controller?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFarmId])

  // Close the setup modal with Escape
  useEffect(() => {
    if (!showSetupModal) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && !generating) setShowSetupModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSetupModal, generating])

  const fetchFarmPlanAndTelemetry = async (farmId) => {
    if (!farmId) return
    planRequestRef.current.controller?.abort()
    const controller = new AbortController()
    const requestId = planRequestRef.current.id + 1
    planRequestRef.current = { id: requestId, controller }
    const isCurrent = () => planRequestRef.current.id === requestId

    setLoadingPlan(true)
    setPlanError(null)
    setIrrigationError(null)
    setFertilizerError(null)
    const id = encodeURIComponent(farmId)
    const opts = { signal: controller.signal }
    try {
      // Parallel requests for plan, irrigation, and fertilizer
      const [planRes, irrigRes, fertRes] = await Promise.allSettled([
        apiFetch(`/activity-planner/${id}`, opts),
        apiFetch(`/irrigation/${id}`, opts),
        apiFetch(`/fertilizer/${id}`, opts),
      ])
      if (!isCurrent()) return

      if (planRes.status === 'fulfilled') {
        const pData = planRes.value
        setActivePlan(pData?.active && pData?.plan ? pData.plan : null)
      } else {
        setActivePlan(null)
        if (!isAbortError(planRes.reason) && planRes.reason?.status !== 404) {
          setPlanError(planRes.reason?.message || 'Could not load the activity plan.')
        }
      }

      if (irrigRes.status === 'fulfilled') {
        setIrrigationData(irrigRes.value)
      } else {
        setIrrigationData(null)
        if (!isAbortError(irrigRes.reason)) {
          setIrrigationError(irrigRes.reason?.message || 'Could not load irrigation advice.')
        }
      }

      if (fertRes.status === 'fulfilled') {
        setFertilizerData(fertRes.value)
      } else {
        setFertilizerData(null)
        if (!isAbortError(fertRes.reason)) {
          setFertilizerError(fertRes.reason?.message || 'Could not load fertilizer advice.')
        }
      }
    } catch (e) {
      if (isAbortError(e) || !isCurrent()) return
      console.error('Error loading farm plan:', e)
      setActivePlan(null)
      setPlanError(e.message || 'Could not load the activity plan.')
    } finally {
      if (isCurrent()) setLoadingPlan(false)
    }
  }

  const selectedFarm = farms.find((f) => farmIdOf(f) === selectedFarmId)

  const openSetupModal = () => {
    if (!selectedFarmId) return
    setSetupCrop(activePlan?.crop_type && TAMIL_NADU_15_CROPS.includes(activePlan.crop_type)
      ? activePlan.crop_type
      : cropForPlan(selectedFarm))
    setShowSetupModal(true)
  }

  // 3. Generate New Activity Plan
  const handleGeneratePlan = async (e) => {
    if (e) e.preventDefault()
    if (!selectedFarmId || generating) return
    if (!setupSowingDate) {
      toast.error('Please choose the sowing date.')
      return
    }
    const farmIdAtRequest = selectedFarmId

    setGenerating(true)
    try {
      const newPlan = await apiFetch('/activity-planner/generate', {
        method: 'POST',
        json: {
          farm_id: farmIdAtRequest,
          crop_type: setupCrop,
          sowing_date: setupSowingDate,
        },
      })
      if (farmIdAtRequest !== selectedFarmIdRef.current) return // farm switched meanwhile
      setActivePlan(newPlan)
      setFilterType('all')
      setShowSetupModal(false)
      setActionSuccess(`Season plan created for ${setupCrop}.`)
      setTimeout(() => setActionSuccess(null), 3500)
      // Refresh telemetry (irrigation stage depends on the plan's sowing date)
      fetchFarmPlanAndTelemetry(farmIdAtRequest)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to generate plan.')
    } finally {
      setGenerating(false)
    }
  }

  // 4. Mark activity as completed (only for the plan currently shown for this farm)
  const handleCompleteActivity = async (activityId) => {
    if (!selectedFarmId || !activePlan || completingId) return
    const farmIdAtRequest = selectedFarmId
    setCompletingId(activityId)
    try {
      await apiFetch(
        `/activity-planner/${encodeURIComponent(farmIdAtRequest)}/activities/${encodeURIComponent(activityId)}/complete`,
        { method: 'POST' }
      )
      if (farmIdAtRequest !== selectedFarmIdRef.current) return
      setActivePlan((prev) => {
        if (!prev) return prev
        const updatedTimeline = (prev.timeline || []).map((act) =>
          act.activity_id === activityId
            ? { ...act, status: 'completed', completed_at: new Date().toISOString() }
            : act
        )
        return { ...prev, timeline: updatedTimeline }
      })
      toast.success('Marked as done.')
    } catch (e) {
      console.error('Failed to mark complete:', e)
      toast.error(e.message || 'Could not mark the activity as completed.')
    } finally {
      setCompletingId(null)
    }
  }

  // Timeline filtering
  const timeline = Array.isArray(activePlan?.timeline) ? activePlan.timeline : []
  const dueOrOverdue = timeline.filter(
    (act) => act.status === 'due_today' || act.status === 'overdue'
  )
  const completedCount = timeline.filter((act) => act.status === 'completed').length
  const progressPct = timeline.length > 0 ? Math.round((completedCount / timeline.length) * 100) : 0

  const filteredTimeline = timeline.filter((act) => {
    if (filterType === 'all') return true
    if (filterType === 'due') return act.status === 'due_today' || act.status === 'overdue'
    if (filterType === 'completed') return act.status === 'completed'
    return act.activity_type === filterType
  })

  const countType = (type) => timeline.filter((a) => a.activity_type === type).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Farm Selector */}
      <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-stone-900 rounded-3xl p-5 sm:p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-brand-200 text-xs font-bold backdrop-blur-sm">
              <Sparkles size={13} />
              <span>Full-Season Planner</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Farm Activity Planner
            </h1>
            <p className="text-sm text-stone-200 max-w-xl">
              One season-long schedule for irrigation (FAO-56), fertilizer splits (ICAR/TNAU), pest scouting and harvest.
            </p>
          </div>

          {/* Farm Switcher & New Plan Button */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {farms.length > 0 && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-1.5 border border-white/10 flex items-center gap-2 min-w-0 max-w-full focus-within:ring-2 focus-within:ring-white/70">
                <MapPin size={15} className="text-brand-300 ml-2 shrink-0" />
                <select
                  aria-label="Select farm"
                  value={selectedFarmId || ''}
                  onChange={(e) => setSelectedFarmId(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold outline-none pr-3 py-1 cursor-pointer min-w-0 max-w-[16rem] truncate"
                >
                  {farms.map((f) => (
                    <option key={farmIdOf(f)} value={farmIdOf(f)} className="text-stone-900">
                      {farmNameOf(f)} ({[f.crop_type, f.district].filter(Boolean).join(' · ')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={openSetupModal}
              disabled={!selectedFarmId || loadingPlan}
              className="disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 bg-white hover:bg-brand-50 text-brand-800 rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus size={14} />
              <span>{activePlan ? 'Re-plan Season' : 'Create Plan'}</span>
            </button>
          </div>
        </div>

        {/* Season Overview Bar (if active plan exists) */}
        {activePlan && (
          <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-xs text-stone-300 uppercase font-bold block">Crop</span>
              <span className="text-sm font-bold text-white">{activePlan.crop_type}</span>
            </div>
            <div>
              <span className="text-xs text-stone-300 uppercase font-bold block">Growth Stage</span>
              <span className="text-sm font-bold text-brand-200">{activePlan.current_stage || '—'}</span>
            </div>
            <div>
              <span className="text-xs text-stone-300 uppercase font-bold block">Sowing → Harvest</span>
              <span className="text-xs font-semibold text-stone-100">
                {formatDate(activePlan.sowing_date)} → {formatDate(activePlan.estimated_harvest_date)}
              </span>
            </div>
            <div>
              <div className="flex justify-between items-center text-xs text-stone-200 font-bold mb-1">
                <span>Season Progress</span>
                <span className="font-mono text-brand-200">{progressPct}%</span>
              </div>
              <div
                className="w-full bg-white/20 h-2 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Season progress"
              >
                <div
                  className="bg-brand-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {loadingFarms && (
        <div className="card p-8 text-center" role="status">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-semibold">Loading your farms...</p>
        </div>
      )}

      {(farmsError || planError) && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-semibold rounded-2xl flex flex-wrap items-center justify-between gap-2" role="alert">
          <span>{farmsError || planError}</span>
          <button
            type="button"
            onClick={() => (farmsError ? fetchFarms() : fetchFarmPlanAndTelemetry(selectedFarmId))}
            className={`px-3 py-1 rounded-lg bg-white border border-red-200 hover:bg-red-100 text-xs font-bold ${FOCUS_RING}`}
          >
            Retry
          </button>
        </div>
      )}

      {!loadingFarms && !farmsError && farms.length === 0 && (
        <div className="card p-8 text-center text-sm text-stone-600 space-y-3">
          <Compass size={32} className="mx-auto text-brand-600" />
          <p className="font-bold text-stone-800">No farm registered yet</p>
          <p className="text-sm">Register your farm to create a season plan.</p>
          <Link
            to="/farmer/manage-farms"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm ${FOCUS_RING}`}
          >
            <Plus size={14} /> Go to Manage My Farms
          </Link>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-sm font-semibold rounded-2xl flex items-center gap-2 animate-fade-in shadow-sm" role="status">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Sustainable Farming Advisor Recommendations Banner */}
      {Array.isArray(activePlan?.tips) && activePlan.tips.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-brand-50 border border-brand-200/80 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 bg-brand-600 text-white rounded-xl">
              <Lightbulb size={16} />
            </span>
            <h3 className="text-sm font-bold text-stone-900">
              Sustainable Farming Tips
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {activePlan.tips.map((tip, idx) => (
              <div
                key={`${tip.tip_type || 'tip'}-${idx}`}
                className="bg-white/90 border border-brand-100 p-3.5 rounded-2xl shadow-sm text-xs space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-stone-900 text-sm">{tip.title}</span>
                  {tip.priority && (
                    <span
                      className={clsx(
                        'text-xs font-bold px-2 py-0.5 rounded-full shrink-0',
                        tip.priority === 'High'
                          ? 'bg-amber-100 text-amber-800'
                          : tip.priority === 'Medium'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-green-100 text-green-800'
                      )}
                    >
                      {tip.priority}
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {tip.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Irrigation & Fertilizer advice */}
      {selectedFarmId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <IrrigationCard
            data={irrigationData}
            loading={loadingPlan}
            error={irrigationError}
            onRetry={() => fetchFarmPlanAndTelemetry(selectedFarmId)}
          />
          <FertilizerCard
            data={fertilizerData}
            loading={loadingPlan}
            error={fertilizerError}
            onRetry={() => fetchFarmPlanAndTelemetry(selectedFarmId)}
          />
        </div>
      )}

      {/* Actionable Today & Overdue Quick Tray */}
      {dueOrOverdue.length > 0 && (
        <div className="bg-amber-50/70 border-2 border-amber-300 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-500 text-white rounded-xl">
                <Bell size={16} />
              </span>
              <h3 className="text-sm font-bold text-stone-900">
                Due Today &amp; Overdue ({dueOrOverdue.length})
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dueOrOverdue.map((act) => (
              <div
                key={act.activity_id}
                className={clsx(
                  'p-3.5 rounded-2xl border bg-white flex items-center justify-between gap-3 shadow-sm',
                  act.status === 'due_today' ? 'border-amber-300 ring-1 ring-amber-100' : 'border-red-300'
                )}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={clsx(
                        'text-xs px-2 py-0.5 rounded-full font-bold',
                        act.status === 'due_today' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      )}
                    >
                      {STATUS_LABEL[act.status] || act.status}
                    </span>
                    <span className="text-sm font-bold text-stone-900 break-words">{act.title}</span>
                  </div>
                  <p className="text-xs text-stone-600 truncate">
                    {formatDate(act.scheduled_date)}{(act.details?.note || act.details?.action) ? ` · ${act.details?.note || act.details?.action}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCompleteActivity(act.activity_id)}
                  disabled={!!completingId}
                  aria-label={`Mark "${act.title}" as done`}
                  className={`disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors shadow-sm flex items-center gap-1 ${FOCUS_RING}`}
                >
                  {completingId === act.activity_id ? (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  <span>Done</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seasonal Activity Timeline */}
      {selectedFarmId && (
      <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 shadow-sm space-y-6">
        {/* Timeline Header & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
          <div>
            <h2 className="text-lg font-semibold text-stone-800">
              Season Timeline
            </h2>
            <p className="text-xs text-stone-500">
              {timeline.length} {timeline.length === 1 ? 'activity' : 'activities'} across the crop cycle
            </p>
          </div>

          {/* Filter Pills */}
          {activePlan && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filter activities">
              {[
                { id: 'all', label: `All (${timeline.length})` },
                { id: 'due', label: `Due / Overdue (${dueOrOverdue.length})` },
                { id: 'irrigation', label: `Irrigation (${countType('irrigation')})` },
                { id: 'fertilizer', label: `Fertilizer (${countType('fertilizer')})` },
                { id: 'pest_check', label: `Pest Scan (${countType('pest_check')})` },
                { id: 'completed', label: `Done (${completedCount})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filterType === f.id}
                  onClick={() => setFilterType(f.id)}
                  className={clsx(
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                    FOCUS_RING,
                    filterType === f.id
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeline Items List */}
        {loadingPlan && !activePlan ? (
          <div className="space-y-3 animate-pulse" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-stone-100" />)}
          </div>
        ) : activePlan ? (
          <div className="relative pt-2">
            {filteredTimeline.length > 0 ? (
              filteredTimeline.map((activity, idx) => (
                <ActivityTimelineItem
                  key={activity.activity_id || idx}
                  activity={activity}
                  onComplete={handleCompleteActivity}
                  disabled={!!completingId && completingId !== activity.activity_id}
                  isFirst={idx === 0}
                  isLast={idx === filteredTimeline.length - 1}
                />
              ))
            ) : (
              <div className="text-center py-8 text-sm text-stone-500 font-medium">
                No activities match this filter.
              </div>
            )}
          </div>
        ) : !planError ? (
          /* Empty State: No Active Plan */
          <div className="p-8 sm:p-10 border-2 border-dashed border-stone-200 rounded-3xl text-center space-y-3">
            <Compass size={32} className="mx-auto text-brand-600" />
            <h3 className="text-base font-bold text-stone-900">
              No Season Plan for This Farm Yet
            </h3>
            <p className="text-sm text-stone-600 max-w-md mx-auto">
              Create a plan from your sowing date to schedule irrigation checks, fertilizer splits, pest scouting and the harvest window.
            </p>
            <button
              type="button"
              onClick={openSetupModal}
              disabled={!selectedFarmId}
              className={`px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all inline-flex items-center gap-2 disabled:opacity-50 ${FOCUS_RING}`}
            >
              <Plus size={15} />
              <span>Create Season Plan</span>
            </button>
          </div>
        ) : null}
      </div>
      )}

      {/* Setup Modal */}
      {showSetupModal && (
        <div
          className="fixed inset-0 z-[1100] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-stone-950/50 backdrop-blur-sm animate-fade-in overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-modal-title"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 my-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-brand-100 text-brand-800 rounded-xl">
                  <Calendar size={18} />
                </span>
                <h3 id="plan-modal-title" className="text-base font-bold text-stone-900">
                  {activePlan ? 'Re-plan Season' : 'Create Season Plan'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                disabled={generating}
                aria-label="Close"
                className={`p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 disabled:opacity-50 ${FOCUS_RING}`}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGeneratePlan} className="space-y-4 text-sm">
              <div>
                <span className="label">Farm</span>
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 font-semibold text-stone-800 flex flex-wrap justify-between items-center gap-1">
                  <span className="break-words">{farmNameOf(selectedFarm, 'Farm')}</span>
                  <span className="text-xs text-stone-500">
                    {[selectedFarm?.district, selectedFarm?.area_hectares != null ? `${selectedFarm.area_hectares} ha` : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="plan-crop" className="label">Crop *</label>
                <select
                  id="plan-crop"
                  value={setupCrop}
                  onChange={(e) => setSetupCrop(e.target.value)}
                  required
                  className="input-field"
                >
                  {TAMIL_NADU_15_CROPS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="plan-sowing" className="label">Sowing / Planting Date *</label>
                <input
                  id="plan-sowing"
                  type="date"
                  value={setupSowingDate}
                  onChange={(e) => setSetupSowingDate(e.target.value)}
                  required
                  className="input-field"
                />
                <span className="text-xs text-stone-500 mt-1 block">
                  All activities are scheduled from this date.
                </span>
              </div>

              {activePlan && (
                <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  This replaces the current plan for this farm. Activities you already marked as done will not carry over.
                </p>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  disabled={generating}
                  className={`px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 font-semibold disabled:opacity-50 ${FOCUS_RING}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className={`px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
                >
                  <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
                  <span>{generating ? 'Creating Plan...' : activePlan ? 'Replace Plan' : 'Create Plan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
