import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FileCheck, ThumbsUp, Leaf, ArrowRight, RefreshCw, Compass } from 'lucide-react'
import clsx from 'clsx'
import EmptyState from '../components/ui/EmptyState'
import Badge from '../components/ui/Badge'
import DemoDataBadge from '../components/ui/DemoDataBadge'
import { LoadingState, ErrorState } from '../components'
import { apiFetch } from '../utils/http'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString()
}
const pct = (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100)}%` : '—')

// AI Review Desk: a read-only overview built from real agronomist endpoints.
//  - Pending AI warnings:  GET /detect/pending (verification happens in the Threat Queue)
//  - Recent leaf scans:    GET /disease/recent (staff see platform-wide scans)
//  - Answered requests:    GET /advisories/farmer-requests?status=resolved
const TABS = [
  { key: 'pending', label: 'Pending AI warnings', icon: FileCheck },
  { key: 'scans', label: 'Recent leaf scans', icon: Leaf },
  { key: 'answered', label: 'Answered requests', icon: ThumbsUp },
]

export default function ExpertPortalPage() {
  const [activeTab, setActiveTab] = useState('pending')
  const [pending, setPending] = useState(null)
  const [scans, setScans] = useState(null)
  const [answered, setAnswered] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [p, s, a] = await Promise.allSettled([
      apiFetch('/detect/pending?limit=50'),
      apiFetch('/disease/recent?limit=25'),
      apiFetch('/advisories/farmer-requests?status=resolved&limit=50'),
    ])
    setPending(p.status === 'fulfilled' ? p.value : null)
    setScans(s.status === 'fulfilled' && Array.isArray(s.value) ? s.value : null)
    setAnswered(a.status === 'fulfilled' && Array.isArray(a.value) ? a.value : null)
    const firstError = [p, s, a].find((r) => r.status === 'rejected')
    if (firstError) setError(firstError.reason?.message || 'Some data could not be loaded.')
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const pendingItems = Array.isArray(pending?.items) ? pending.items : []
  const counts = {
    pending: pending ? (pending.simulated ? 0 : pendingItems.length) : null,
    scans: scans ? scans.length : null,
    answered: answered ? answered.length : null,
  }

  const renderBody = () => {
    if (loading) return <LoadingState message="Loading review desk…" />
    if (activeTab === 'pending') {
      if (!pending) return <ErrorState message={error || 'Could not load pending warnings.'} onRetry={load} />
      if (pendingItems.length === 0) {
        return <EmptyState icon={FileCheck} title="Nothing to review" message="There are no unverified AI warnings right now." />
      }
      return (
        <div className="space-y-3">
          {pending.simulated && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
              <DemoDataBadge /> No real unverified warnings exist, so example cases are shown. They cannot be verified.
            </p>
          )}
          {pendingItems.map((item) => (
            <div key={item.log_id} className="p-4 rounded-2xl border border-stone-200 bg-white space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-stone-900 text-sm break-words">{item.detected_pest}</h4>
                  <p className="text-xs text-stone-500">{item.farm_name} ({item.district}) · {item.crop_type} · {item.date}</p>
                </div>
                <Badge status={item.ai_risk_level}>{item.ai_risk_level} risk</Badge>
              </div>
              <p className="text-sm text-stone-700 bg-stone-50 rounded-xl p-3">
                <span className="font-semibold text-stone-900">AI evidence: </span>{item.evidence_snippet}
              </p>
              <p className="text-xs text-stone-500">Risk score {pct(item.ai_risk_score)} · Pest confidence {pct(item.ai_confidence)}</p>
            </div>
          ))}
          <Link
            to="/agronomist/dashboard"
            className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm', FOCUS)}
          >
            Verify in Threat Queue <ArrowRight size={16} />
          </Link>
        </div>
      )
    }
    if (activeTab === 'scans') {
      if (!scans) return <ErrorState message={error || 'Could not load leaf scans.'} onRetry={load} />
      if (scans.length === 0) {
        return <EmptyState icon={Leaf} title="No leaf scans yet" message="Scans are stored only when the disease model produces a real diagnosis." />
      }
      return (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {scans.map((s) => (
            <li key={s.id} className="p-3 rounded-2xl border border-stone-200 bg-white flex gap-3 min-w-0">
              {s.image_url ? (
                <img src={s.image_url} alt={`Leaf scan: ${s.predicted_class || 'unknown'}`} className="w-16 h-16 rounded-lg object-cover border border-stone-200 shrink-0" loading="lazy" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-stone-100 flex items-center justify-center shrink-0"><Leaf size={20} className="text-stone-500" /></div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm text-stone-900 break-words">{s.predicted_class || 'Unclassified'}</p>
                <p className="text-xs text-stone-500">Confidence {pct(s.confidence)} · {fmtDate(s.created_at)}</p>
                {s.model_name && <p className="text-xs text-stone-500 truncate">Model: {s.model_name}</p>}
              </div>
            </li>
          ))}
        </ul>
      )
    }
    if (!answered) return <ErrorState message={error || 'Could not load answered requests.'} onRetry={load} />
    if (answered.length === 0) {
      return <EmptyState icon={ThumbsUp} title="No answered requests" message="Advisories sent to farmers will appear here." />
    }
    return (
      <ul className="space-y-3">
        {answered.map((r) => (
          <li key={r.id} className="p-4 rounded-2xl border border-stone-200 bg-white space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-sm text-stone-900">{r.farmer_name || 'Farmer'} · {r.crop_type || 'General'}</span>
              <span className="text-xs text-stone-500">{fmtDate(r.responded_at)} · {r.agronomist_name || 'Agronomist'}</span>
            </div>
            <p className="text-sm text-stone-600 break-words"><span className="font-semibold text-stone-800">Question: </span>{r.question}</p>
            <p className="text-sm text-stone-800 bg-brand-50 border border-brand-100 rounded-xl p-3 whitespace-pre-line break-words">{r.response_text}</p>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-sky-800 to-sky-700 rounded-2xl p-6 sm:p-8 text-white shadow-sm">
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 text-white text-xs font-semibold rounded-full border border-white/25">
          <Compass size={14} /> Expert review
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">AI Review Desk</h1>
        <p className="mt-2 text-sky-100 text-sm max-w-2xl">
          Overview of AI warnings awaiting verification, recent leaf-scan diagnoses and advisories already sent to farmers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <nav className="card p-4 sm:p-5 space-y-3 lg:col-span-1 h-fit" aria-label="Review desk sections">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-800">Sections</h2>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              aria-label="Refresh review desk"
              className={clsx('p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50', FOCUS)}
            >
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </button>
          </div>
          <div className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                aria-pressed={activeTab === key}
                className={clsx(
                  'shrink-0 lg:w-full text-left px-3 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-between gap-2',
                  FOCUS,
                  activeTab === key ? 'bg-sky-50 text-sky-800' : 'text-stone-600 hover:bg-stone-100'
                )}
              >
                <span className="flex items-center gap-2 whitespace-nowrap"><Icon size={16} /> {label}</span>
                {counts[key] !== null && (
                  <span className="px-2 py-0.5 bg-stone-100 text-stone-700 rounded-full text-xs">{counts[key]}</span>
                )}
              </button>
            ))}
          </div>
        </nav>

        <section className="lg:col-span-3 card p-5 sm:p-6 space-y-4 min-w-0">
          <h2 className="text-lg font-semibold text-stone-800">{TABS.find((t) => t.key === activeTab)?.label}</h2>
          {renderBody()}
        </section>
      </div>
    </div>
  )
}
