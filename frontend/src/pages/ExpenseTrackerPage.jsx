import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet, TrendingUp, Plus, Receipt,
  Calendar, Filter, Trash2, Eye, Download,
  RefreshCw, MapPin, Sparkles, Building2
} from 'lucide-react'
import clsx from 'clsx'
import PnLSummaryCard from '../components/PnLSummaryCard'
import QuickAddExpenseForm from '../components/QuickAddExpenseForm'
import QuickAddRevenueForm from '../components/QuickAddRevenueForm'
import { formatINR } from '../components/ProfitRangeDisplay'
import { ErrorState } from '../components'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { apiFetch, isAbortError } from '../utils/http'
import { fetchMyFarms, farmIdOf, farmNameOf } from '../utils/farms'

const SEASONS = [
  'Kharif 2026',
  'Rabi 2025-26',
  'Zaid 2025',
  'Kharif 2025',
  'Rabi 2024-25',
]

const CATEGORY_META = {
  seeds: { label: 'Seeds', icon: '🌱', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  fertilizer: { label: 'Fertilizer', icon: '🌾', color: 'bg-brand-100 text-brand-800 border-brand-300' },
  labor: { label: 'Labor', icon: '👷', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  irrigation: { label: 'Irrigation', icon: '💧', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  pesticides: { label: 'Pesticides', icon: '🧪', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  other: { label: 'Other', icon: '📦', color: 'bg-stone-100 text-stone-800 border-stone-300' },
}

export default function ExpenseTrackerPage() {
  const [farms, setFarms] = useState([])
  const [selectedFarmId, setSelectedFarmId] = useState('')
  const [selectedSeason, setSelectedSeason] = useState('Kharif 2026')
  const [loadingFarms, setLoadingFarms] = useState(true)

  // Data states
  const [pnlSummary, setPnlSummary] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [revenues, setRevenues] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState(null)

  // UI tabs & modals
  const [activeTab, setActiveTab] = useState('expenses') // 'expenses' | 'revenues'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddRevenue, setShowAddRevenue] = useState(false)
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState(null)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const toast = useToast()

  const [farmsError, setFarmsError] = useState(null)

  // 1. Fetch the caller's own farms (P0-6: authenticated, no fallback to other users' farms)
  const loadFarms = useCallback(async (signal) => {
    setLoadingFarms(true)
    setFarmsError(null)
    try {
      const list = await fetchMyFarms({ signal })
      setFarms(list)
      setSelectedFarmId((prev) => (list.some((f) => farmIdOf(f) === prev) ? prev : (list[0] ? farmIdOf(list[0]) : '')))
    } catch (err) {
      if (isAbortError(err)) return
      console.error('Failed to load farms:', err)
      setFarms([])
      setSelectedFarmId('')
      setFarmsError(err.message || 'Unable to load your farms.')
    } finally {
      if (!signal?.aborted) setLoadingFarms(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadFarms(controller.signal)
    return () => controller.abort()
  }, [loadFarms])

  const currentFarm = farms.find((f) => farmIdOf(f) === String(selectedFarmId)) || null
  const currentFarmName = farmNameOf(currentFarm, 'My Farm')
  const currentFarmAcres = currentFarm?.area_hectares ? (Number(currentFarm.area_hectares) * 2.471).toFixed(1) : null

  // 2. Fetch PnL summary, expenses, and revenues (P2-8: stale responses are ignored)
  const requestIdRef = useRef(0)
  const abortRef = useRef(null)

  const loadPnlData = useCallback(async () => {
    if (!selectedFarmId) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestId === requestIdRef.current

    setLoadingData(true)
    setError(null)
    try {
      const farmIdStr = encodeURIComponent(selectedFarmId)
      const seasonParam = encodeURIComponent(selectedSeason)
      const opts = { signal: controller.signal }

      const [pnlRes, expRes, revRes] = await Promise.allSettled([
        apiFetch(`/farm-pnl/${farmIdStr}?season=${seasonParam}`, opts),
        apiFetch(`/expenses/${farmIdStr}?season=${seasonParam}`, opts),
        apiFetch(`/revenue/${farmIdStr}?season=${seasonParam}`, opts),
      ])
      if (!isCurrent()) return

      const firstError = [pnlRes, expRes, revRes]
        .filter((r) => r.status === 'rejected' && !isAbortError(r.reason) && r.reason?.status !== 404)
        .map((r) => r.reason)[0]

      setPnlSummary(pnlRes.status === 'fulfilled' ? pnlRes.value : null)

      if (expRes.status === 'fulfilled') {
        const expData = expRes.value
        setExpenses(Array.isArray(expData) ? expData : (Array.isArray(expData?.expenses) ? expData.expenses : []))
      } else {
        setExpenses([])
      }

      if (revRes.status === 'fulfilled') {
        const revData = revRes.value
        setRevenues(Array.isArray(revData) ? revData : (Array.isArray(revData?.revenues) ? revData.revenues : []))
      } else {
        setRevenues([])
      }

      if (firstError) setError(firstError.message || 'Unable to load farm records. Please try again.')
    } catch (err) {
      if (isAbortError(err) || !isCurrent()) return
      console.error('Error fetching PnL data:', err)
      setError(err.message || 'Unable to load farm records. Please try again.')
    } finally {
      if (isCurrent()) setLoadingData(false)
    }
  }, [selectedFarmId, selectedSeason])

  useEffect(() => {
    // Clear the previous farm/season's records so they never show under the new selection
    setPnlSummary(null)
    setExpenses([])
    setRevenues([])
    if (selectedFarmId) {
      loadPnlData()
    }
    return () => abortRef.current?.abort()
  }, [selectedFarmId, selectedSeason, loadPnlData])

  // Handle delete expense
  const handleDeleteExpense = async (expenseId) => {
    try {
      await apiFetch(`/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' })
      toast.success('Expense entry removed.')
      loadPnlData()
    } catch (err) {
      console.error('Delete error:', err)
      toast.error(err.message || 'Failed to delete expense.')
    } finally {
      setDeleteTargetId(null)
    }
  }

  // Filtered expenses safely
  const expenseList = Array.isArray(expenses) ? expenses : []
  const filteredExpenses = expenseList.filter((e) => {
    if (categoryFilter === 'all') return true
    return e.category === categoryFilter
  })

  // Export current season table to CSV
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,'
    if (activeTab === 'expenses') {
      csvContent += 'Date,Category,Amount,Notes,Receipt\n'
      filteredExpenses.forEach((exp) => {
        csvContent += `"${exp.date}","${exp.category}","${exp.amount}","${(exp.notes || '').replace(/"/g, '""')}","${exp.receipt_photo_url || ''}"\n`
      })
    } else {
      csvContent += 'Sale Date,Crop,Quantity (kg),Price per kg,Total Revenue,Buyer/Mandi\n'
      const revenueList = Array.isArray(revenues) ? revenues : []
      revenueList.forEach((rev) => {
        csvContent += `"${rev.sale_date}","${rev.crop_type}","${rev.quantity_sold_kg}","${rev.price_per_kg}","${rev.total_revenue}","${(rev.buyer_or_mandi || '').replace(/"/g, '""')}"\n`
      })
    }
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${farmNameOf(currentFarm, 'farm')}_${selectedSeason}_${activeTab}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header & Farm/Season Selector */}
      <div className="bg-gradient-to-br from-brand-900 via-teal-900 to-stone-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 border border-brand-400/30 text-brand-300 text-xs font-bold tracking-wide">
              <Sparkles size={13} />
              <span>AgriGuard AI — Reality Validation Ledger</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Wallet className="text-brand-400 shrink-0" size={32} />
              Farm Profit & Expense Tracker
            </h1>
            <p className="text-sm text-brand-100/80 max-w-2xl leading-relaxed">
              Log actual seasonal cultivation expenses and crop sales. AgriGuard compares your real financial outcome
              against pre-season AI profit predictions to calibrate our regional models for Tamil Nadu.
            </p>
          </div>

          {/* Quick Selectors & Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Farm Selector */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2 flex items-center gap-2">
              <MapPin size={16} className="text-brand-300 shrink-0" />
              <select
                aria-label="Select Farm"
                value={selectedFarmId}
                onChange={(e) => setSelectedFarmId(e.target.value)}
                className="bg-transparent text-white text-xs sm:text-sm font-bold focus:outline-none cursor-pointer pr-4"
              >
                {farms.length === 0 && (
                  <option value="" className="text-stone-900">{loadingFarms ? 'Loading farms…' : 'No farm yet'}</option>
                )}
                {farms.map((f) => (
                  <option key={farmIdOf(f)} value={farmIdOf(f)} className="text-stone-900">
                    {farmNameOf(f)} ({f.crop_type || 'General'})
                  </option>
                ))}
              </select>
            </div>

            {/* Season Selector */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2 flex items-center gap-2">
              <Calendar size={16} className="text-brand-300 shrink-0" />
              <select
                aria-label="Select Season"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="bg-transparent text-white text-xs sm:text-sm font-bold focus:outline-none cursor-pointer pr-4"
              >
                {SEASONS.map((s) => (
                  <option key={s} value={s} className="text-stone-900">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadPnlData}
              disabled={loadingData || !selectedFarmId}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all cursor-pointer"
              title="Refresh Records"
            >
              <RefreshCw size={16} className={clsx(loadingData && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Action Triggers Bar */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-brand-200">
            <span className="font-semibold text-white">{currentFarm ? currentFarmName : 'No farm selected'}</span>
            {currentFarm?.district && (<><span>·</span><span>{currentFarm.district}</span></>)}
            {currentFarmAcres && (<><span>·</span><span className="font-mono text-brand-300">{currentFarmAcres} Acres</span></>)}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddExpense(true)}
              disabled={!selectedFarmId}
              className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-brand-500 to-teal-500 text-stone-950 font-black text-xs sm:text-sm hover:from-brand-400 hover:to-teal-400 shadow-lg shadow-brand-900/30 transition-all cursor-pointer"
            >
              <Plus size={16} className="stroke-[3]" />
              <span>Log Expense</span>
            </button>
            <button
              onClick={() => setShowAddRevenue(true)}
              disabled={!selectedFarmId}
              className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-brand-900 font-black text-xs sm:text-sm hover:bg-brand-50 shadow-lg transition-all cursor-pointer"
            >
              <TrendingUp size={16} className="text-brand-700 stroke-[3]" />
              <span>Log Harvest Sale</span>
            </button>
          </div>
        </div>
      </div>

      {farmsError && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm">
          <ErrorState message={farmsError} onRetry={() => loadFarms()} />
        </div>
      )}

      {!loadingFarms && !farmsError && farms.length === 0 && (
        <div className="bg-white rounded-3xl border border-stone-200 p-10 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-brand-50 flex items-center justify-center mx-auto text-brand-600">
            <MapPin size={32} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-stone-800">Register your farm first</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Expenses and harvest sales are recorded against your own farm. Add your farm boundary to start tracking profit &amp; loss.
            </p>
          </div>
          <Link
            to="/farmer/manage-farms"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800 transition-all shadow-sm"
          >
            <Plus size={14} />
            <span>Go to Manage My Farm</span>
          </Link>
        </div>
      )}

      {error && selectedFarmId && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm">
          <ErrorState message={error} onRetry={loadPnlData} />
        </div>
      )}

      {selectedFarmId && (<>
      {/* Main PnL Summary Card with Real-time Count-up & Prediction Accuracy */}
      <PnLSummaryCard
        summary={pnlSummary}
        season={selectedSeason}
        cropType={currentFarm?.crop_type || 'General'}
        farmName={currentFarmName}
      />

      {/* Transactions Section */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-6">
        {/* Navigation Tabs & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('expenses')}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer',
                activeTab === 'expenses'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
              )}
            >
              <Receipt size={16} />
              <span>Expenses ({expenses.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('revenues')}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer',
                activeTab === 'revenues'
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
              )}
            >
              <TrendingUp size={16} />
              <span>Harvest Sales ({revenues.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {activeTab === 'expenses' && (
              <div className="flex items-center gap-1.5 bg-stone-100 rounded-xl px-2.5 py-1.5 border border-stone-200">
                <Filter size={13} className="text-stone-500" />
                <select
                  aria-label="Filter expenses by category"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-stone-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {Object.keys(CATEGORY_META).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_META[cat].label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-xs font-bold text-stone-700 transition-colors cursor-pointer"
              title="Download CSV report"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Expenses Table */}
        {activeTab === 'expenses' && (
          <div>
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                  <Receipt size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-stone-800">No Expenses Recorded Yet</h3>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    Record seeds, fertilizers, tractor labor, or electricity bills for {selectedSeason} to track your total investment.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800 transition-all cursor-pointer shadow-sm"
                >
                  <Plus size={14} />
                  <span>Log First Expense</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500 font-bold text-[11px] uppercase tracking-wider">
                      <th className="pb-3 px-3">Date</th>
                      <th className="pb-3 px-3">Category</th>
                      <th className="pb-3 px-3">Notes</th>
                      <th className="pb-3 px-3">Receipt</th>
                      <th className="pb-3 px-3 text-right">Amount</th>
                      <th className="pb-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredExpenses.map((exp) => {
                      const meta = CATEGORY_META[exp.category] || CATEGORY_META.other
                      return (
                        <tr key={exp.id || exp._id} className="hover:bg-stone-50/70 transition-colors">
                          <td className="py-3.5 px-3 font-medium text-stone-600 whitespace-nowrap">
                            {exp.date}
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border', meta.color)}>
                              <span>{meta.icon}</span>
                              <span>{meta.label}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-stone-700 max-w-xs truncate">
                            {exp.notes || <span className="text-stone-400 italic">No notes</span>}
                          </td>
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {exp.receipt_photo_url ? (
                              <button
                                onClick={() => setPreviewReceiptUrl(exp.receipt_photo_url)}
                                className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 font-semibold underline text-xs cursor-pointer"
                              >
                                <Eye size={13} />
                                <span>View Bill</span>
                              </button>
                            ) : (
                              <span className="text-stone-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-right font-black font-mono text-stone-900 whitespace-nowrap">
                            ₹{formatINR(exp.amount)}
                          </td>
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => setDeleteTargetId(exp.id || exp._id)}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete entry"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Harvest Sales / Revenue Table */}
        {activeTab === 'revenues' && (
          <div>
            {(!Array.isArray(revenues) || revenues.length === 0) ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-brand-50 flex items-center justify-center mx-auto text-brand-500">
                  <TrendingUp size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-stone-800">No Harvest Sales Logged Yet</h3>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    Sold your produce at the local mandi or trader? Log the sale to compute your final profit and AI accuracy.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddRevenue(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800 transition-all cursor-pointer shadow-sm"
                >
                  <Plus size={14} />
                  <span>Log Harvest Sale</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500 font-bold text-[11px] uppercase tracking-wider">
                      <th className="pb-3 px-3">Sale Date</th>
                      <th className="pb-3 px-3">Crop</th>
                      <th className="pb-3 px-3">Quantity</th>
                      <th className="pb-3 px-3">Price / kg</th>
                      <th className="pb-3 px-3">Buyer / Mandi</th>
                      <th className="pb-3 px-3 text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {(Array.isArray(revenues) ? revenues : []).map((rev) => (
                      <tr key={rev.id || rev._id} className="hover:bg-stone-50/70 transition-colors">
                        <td className="py-3.5 px-3 font-medium text-stone-600 whitespace-nowrap">
                          {rev.sale_date}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-stone-900 whitespace-nowrap">
                          {rev.crop_type}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-stone-700 whitespace-nowrap">
                          {Number(rev.quantity_sold_kg || 0).toLocaleString('en-IN')} kg
                          <span className="text-[11px] text-stone-400 ml-1">
                            ({(Number(rev.quantity_sold_kg || 0) / 100).toFixed(1)} qtl)
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-stone-700 whitespace-nowrap">
                          ₹{rev.price_per_kg}/kg
                        </td>
                        <td className="py-3.5 px-3 text-stone-700 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 text-stone-800 text-xs font-semibold">
                            <Building2 size={12} className="text-stone-500" />
                            <span>{rev.buyer_or_mandi || 'Local Mandi'}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right font-black font-mono text-brand-700 whitespace-nowrap text-base">
                          ₹{formatINR(rev.total_revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      </>)}

      {/* Modal: Quick Add Expense */}
      <AnimatePresence>
        {showAddExpense && selectedFarmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md"
            >
              <QuickAddExpenseForm
                farmId={selectedFarmId}
                season={selectedSeason}
                cropType={currentFarm?.crop_type || 'General'}
                district={currentFarm?.district || 'Tamil Nadu'}
                onClose={() => setShowAddExpense(false)}
                onSuccess={() => {
                  setShowAddExpense(false)
                  loadPnlData()
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Quick Add Revenue */}
      <AnimatePresence>
        {showAddRevenue && selectedFarmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md"
            >
              <QuickAddRevenueForm
                farmId={selectedFarmId}
                season={selectedSeason}
                cropType={currentFarm?.crop_type || 'General'}
                district={currentFarm?.district || 'Tamil Nadu'}
                onClose={() => setShowAddRevenue(false)}
                onSuccess={() => {
                  setShowAddRevenue(false)
                  loadPnlData()
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Receipt Image Viewer */}
      <AnimatePresence>
        {previewReceiptUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md"
            onClick={() => setPreviewReceiptUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-4 max-w-xl w-full shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <span className="font-bold text-sm text-stone-800 flex items-center gap-2">
                  <Receipt size={16} className="text-brand-700" />
                  Expense Receipt / Bill Proof
                </span>
                <button
                  onClick={() => setPreviewReceiptUrl(null)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 max-h-[70vh] overflow-auto rounded-2xl border border-stone-200 flex items-center justify-center bg-stone-50">
                <img
                  src={previewReceiptUrl}
                  alt="Receipt Preview"
                  className="max-w-full h-auto object-contain rounded-xl"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        isOpen={!!deleteTargetId}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => handleDeleteExpense(deleteTargetId)}
        title="Remove this expense entry?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
