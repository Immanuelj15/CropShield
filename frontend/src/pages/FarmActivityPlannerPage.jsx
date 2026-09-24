import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Droplets, Sprout, Search, Wheat, RefreshCw,
  Plus, CheckCircle2, AlertTriangle, Lightbulb, MapPin,
  ChevronRight, Filter, Compass, Bell, ShieldCheck, Sparkles
} from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import IrrigationCard from '../components/IrrigationCard'
import FertilizerCard from '../components/FertilizerCard'
import ActivityTimelineItem from '../components/ActivityTimelineItem'

const API_BASE = 'http://localhost:8000/api/v1'

const TAMIL_NADU_15_CROPS = [
  'Cotton', 'Rice', 'Sorghum', 'Millets', 'Sugarcane',
  'Pulses', 'Groundnut', 'Maize', 'Sesamum', 'Sunflower',
  'Banana', 'Turmeric', 'Chili', 'Onion', 'Coconut'
]

export default function FarmActivityPlannerPage() {
  const { t } = useTranslation(['farmer', 'common'])
  const [farms, setFarms] = useState([])
  const [selectedFarmId, setSelectedFarmId] = useState(null)
  const [activePlan, setActivePlan] = useState(null)
  const [irrigationData, setIrrigationData] = useState(null)
  const [fertilizerData, setFertilizerData] = useState(null)

  const [loadingFarms, setLoadingFarms] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [filterType, setFilterType] = useState('all') // 'all' | 'due' | 'irrigation' | 'fertilizer' | 'pest_check'
  const [showSetupModal, setShowSetupModal] = useState(false)

  // Plan generation form
  const [setupCrop, setSetupCrop] = useState('Cotton')
  const [setupSowingDate, setSetupSowingDate] = useState(new Date().toISOString().split('T')[0])
  const [actionSuccess, setActionSuccess] = useState(null)

  // 1. Fetch user's farms
  useEffect(() => {
    fetchFarms()
  }, [])

  const fetchFarms = async () => {
    setLoadingFarms(true)
    try {
      const res = await fetch(`${API_BASE}/farms`)
      if (res.ok) {
        const data = await res.json()
        setFarms(data)
        if (data.length > 0) {
          const firstId = data[0].id || data[0]._id
          setSelectedFarmId(firstId)
          setSetupCrop(data[0].crop_type || 'Cotton')
        }
      }
    } catch (e) {
      console.error('Error fetching farms:', e)
    } finally {
      setLoadingFarms(false)
    }
  }

  // 2. Fetch active plan & telemetry whenever selected farm changes
  useEffect(() => {
    if (selectedFarmId) {
      fetchFarmPlanAndTelemetry(selectedFarmId)
    }
  }, [selectedFarmId])

  const fetchFarmPlanAndTelemetry = async (farmId) => {
    setLoadingPlan(true)
    try {
      // Parallel requests for plan, irrigation, and fertilizer
      const [planRes, irrigRes, fertRes] = await Promise.all([
        fetch(`${API_BASE}/activity-planner/${farmId}`),
        fetch(`${API_BASE}/irrigation/${farmId}`),
        fetch(`${API_BASE}/fertilizer/${farmId}`),
      ])

      if (planRes.ok) {
        const pData = await planRes.json()
        if (pData.active && pData.plan) {
          setActivePlan(pData.plan)
        } else {
          setActivePlan(null)
        }
      }

      if (irrigRes.ok) {
        setIrrigationData(await irrigRes.json())
      } else {
        setIrrigationData(null)
      }

      if (fertRes.ok) {
        setFertilizerData(await fertRes.json())
      } else {
        setFertilizerData(null)
      }
    } catch (e) {
      console.error('Error loading farm plan:', e)
    } finally {
      setLoadingPlan(false)
    }
  }

  // 3. Generate New Activity Plan
  const handleGeneratePlan = async (e) => {
    if (e) e.preventDefault()
    if (!selectedFarmId) return

    setGenerating(true)
    try {
      const res = await fetch(`${API_BASE}/activity-planner/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farm_id: selectedFarmId,
          crop_type: setupCrop,
          sowing_date: setupSowingDate,
        }),
      })

      if (res.ok) {
        const newPlan = await res.json()
        setActivePlan(newPlan)
        setShowSetupModal(false)
        setActionSuccess(`Generated full-season plan for ${setupCrop}!`)
        setTimeout(() => setActionSuccess(null), 3500)
        // Refresh telemetry
        fetchFarmPlanAndTelemetry(selectedFarmId)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.detail || 'Failed to generate plan.')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  // 4. Mark activity as completed
  const handleCompleteActivity = async (activityId) => {
    try {
      const res = await fetch(
        `${API_BASE}/activity-planner/${selectedFarmId}/activities/${activityId}/complete`,
        { method: 'POST' }
      )
      if (res.ok) {
        // Optimistic UI update
        setActivePlan((prev) => {
          if (!prev) return prev
          const updatedTimeline = prev.timeline.map((act) =>
            act.activity_id === activityId
              ? { ...act, status: 'completed', completed_at: new Date().toISOString() }
              : act
          )
          return { ...prev, timeline: updatedTimeline }
        })
      }
    } catch (e) {
      console.error('Failed to mark complete:', e)
    }
  }

  const selectedFarm = farms.find((f) => (f.id || f._id) === selectedFarmId)

  // Timeline filtering
  const timeline = activePlan?.timeline || []
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Farm Selector */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-stone-900 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-bold backdrop-blur-sm">
              <Sparkles size={13} />
              <span>Full-Season Agronomic Orchestration</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight">
              AI Farm Activity Planner
            </h1>
            <p className="text-xs text-stone-300 max-w-xl">
              Connected season-long timeline coordinating FAO-56 smart irrigation, ICAR/TNAU fertilizer splits, routine pest surveillance, and harvesting windows.
            </p>
          </div>

          {/* Farm Switcher & New Plan Button */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {farms.length > 0 && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-1.5 border border-white/10 flex items-center gap-2">
                <MapPin size={15} className="text-emerald-300 ml-2" />
                <select
                  value={selectedFarmId || ''}
                  onChange={(e) => setSelectedFarmId(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold outline-none pr-3 py-1 cursor-pointer"
                >
                  {farms.map((f) => (
                    <option key={f.id || f._id} value={f.id || f._id} className="text-stone-900">
                      {f.farm_name} ({f.crop_type} · {f.district})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => {
                if (selectedFarm) setSetupCrop(selectedFarm.crop_type || 'Cotton')
                setShowSetupModal(true)
              }}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-stone-950 rounded-2xl text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5"
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
              <span className="text-[10px] text-stone-400 uppercase font-bold block">Current Crop</span>
              <span className="text-sm font-black text-white">{activePlan.crop_type}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-bold block">Growth Stage</span>
              <span className="text-sm font-black text-emerald-300">{activePlan.current_stage}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-bold block">Sowing / Harvest</span>
              <span className="text-xs font-semibold text-stone-200">
                {activePlan.sowing_date} → {activePlan.estimated_harvest_date}
              </span>
            </div>
            <div>
              <div className="flex justify-between items-center text-[10px] text-stone-300 font-bold mb-1">
                <span>Season Progress</span>
                <span className="font-mono text-emerald-300">{progressPct}%</span>
              </div>
              <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2 animate-fadeIn shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Sustainable Farming Advisor Recommendations Banner */}
      {activePlan?.tips && activePlan.tips.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-emerald-50 border border-emerald-200/80 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-600 text-white rounded-xl">
              <Lightbulb size={16} />
            </span>
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
              Sustainable Farming Advisor
            </h3>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
              Integrated Agronomic Tips
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {activePlan.tips.map((tip, idx) => (
              <div
                key={idx}
                className="bg-white/90 border border-emerald-100 p-3.5 rounded-2xl shadow-xs text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">{tip.title}</span>
                  <span
                    className={clsx(
                      'text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full',
                      tip.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    )}
                  >
                    {tip.priority}
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  {tip.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-Time Connected Telemetry Cards (Smart Irrigation & Fertilizer) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <IrrigationCard data={irrigationData} loading={loadingPlan} />
        <FertilizerCard data={fertilizerData} loading={loadingPlan} />
      </div>

      {/* Actionable Today & Overdue Quick Tray */}
      {dueOrOverdue.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 via-white to-stone-50 border-2 border-amber-300 rounded-3xl p-5 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-500 text-white rounded-xl animate-pulse">
                <Bell size={16} />
              </span>
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
                Action Required Today & Overdue ({dueOrOverdue.length})
              </h3>
            </div>
            <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
              High Priority Checkpoints
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dueOrOverdue.map((act) => (
              <div
                key={act.activity_id}
                className={clsx(
                  'p-3.5 rounded-2xl border bg-white flex items-center justify-between gap-3 shadow-xs',
                  act.status === 'due_today' ? 'border-amber-300 ring-1 ring-amber-100' : 'border-rose-300'
                )}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={clsx(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-extrabold uppercase',
                        act.status === 'due_today' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      )}
                    >
                      {act.status.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] font-bold text-stone-900">{act.title}</span>
                  </div>
                  <p className="text-[10.5px] text-stone-500 truncate max-w-xs">{act.details?.note}</p>
                </div>
                <button
                  onClick={() => handleCompleteActivity(act.activity_id)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors shadow-xs flex items-center gap-1"
                >
                  <CheckCircle2 size={13} />
                  <span>Done</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seasonal Activity Timeline */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-6 shadow-sm space-y-6">
        {/* Timeline Header & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
          <div>
            <h2 className="text-base font-black text-stone-900">
              Season Timeline & Schedule
            </h2>
            <p className="text-xs text-stone-500">
              {timeline.length} total agronomic checkpoints across the crop cycle
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { id: 'all', label: `All (${timeline.length})` },
              { id: 'due', label: `Due / Overdue (${dueOrOverdue.length})` },
              { id: 'irrigation', label: 'Irrigation 💧' },
              { id: 'fertilizer', label: 'Fertilizer 🌱' },
              { id: 'pest_check', label: 'Pest Scan 🔍' },
              { id: 'completed', label: `Done (${completedCount})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                  filterType === f.id
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Items List */}
        {activePlan ? (
          <div className="relative pt-2">
            {filteredTimeline.length > 0 ? (
              filteredTimeline.map((activity, idx) => (
                <ActivityTimelineItem
                  key={activity.activity_id}
                  activity={activity}
                  onComplete={handleCompleteActivity}
                  isFirst={idx === 0}
                  isLast={idx === filteredTimeline.length - 1}
                />
              ))
            ) : (
              <div className="text-center py-8 text-xs text-stone-400 font-semibold">
                No activities matched the selected filter.
              </div>
            )}
          </div>
        ) : (
          /* Empty State: No Active Plan */
          <div className="p-10 border-2 border-dashed border-stone-200 rounded-3xl text-center space-y-3">
            <Compass size={32} className="mx-auto text-emerald-600" />
            <h3 className="text-sm font-bold text-stone-900">
              No Active Seasonal Plan for this Farm Plot
            </h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Generate an automated timeline to schedule FAO-56 irrigation checkpoints, ICAR/TNAU fertilizer splits, and routine pest scans based on your sowing date.
            </p>
            <button
              onClick={() => {
                if (selectedFarm) setSetupCrop(selectedFarm.crop_type || 'Cotton')
                setShowSetupModal(true)
              }}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl text-xs font-bold shadow-md transition-all inline-flex items-center gap-2"
            >
              <Plus size={15} />
              <span>Generate AI Season Plan</span>
            </button>
          </div>
        )}
      </div>

      {/* Setup Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Calendar size={18} />
                </span>
                <h3 className="text-sm font-black text-stone-900">
                  Configure Season Plan
                </h3>
              </div>
              <button
                onClick={() => setShowSetupModal(false)}
                className="text-stone-400 hover:text-stone-700 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGeneratePlan} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">
                  Selected Farm Plot
                </label>
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 font-semibold text-stone-800 flex justify-between items-center">
                  <span>{selectedFarm?.farm_name || 'Farm Plot'}</span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {selectedFarm?.district} · {selectedFarm?.area_hectares} ha
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">
                  Crop Type *
                </label>
                <select
                  value={setupCrop}
                  onChange={(e) => setSetupCrop(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 font-semibold text-stone-800 outline-none focus:bg-white focus:border-emerald-600"
                >
                  {TAMIL_NADU_15_CROPS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">
                  Sowing / Planting Date *
                </label>
                <input
                  type="date"
                  value={setupSowingDate}
                  onChange={(e) => setSetupSowingDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50 font-mono text-xs text-stone-800 outline-none focus:bg-white focus:border-emerald-600"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  Activity checkpoints will be calculated sequentially from this date.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
                  <span>{generating ? 'Generating Plan...' : 'Generate Plan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
