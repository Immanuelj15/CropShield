import { useState } from 'react'
import { UserCheck, ShieldCheck, FileCheck, CheckCircle2, Clock, ThumbsUp } from 'lucide-react'

export default function ExpertPortalPage() {
  const [activeTab, setActiveTab] = useState('scans')

  const pendingScans = [
    { id: 101, farmer: "Kannan M.", location: "Kovilpatti", crop: "Cotton", flag_reason: "High whitefly vector count", date: "2026-07-24", status: "Pending Review" },
    { id: 102, farmer: "Murugan S.", location: "Thanjavur", crop: "Rice", flag_reason: "Severe bacterial leaf streak", date: "2026-07-25", status: "Pending Review" }
  ]

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-gradient-to-r from-stone-900 to-emerald-950 rounded-3xl p-8 text-white shadow-xl">
        <span className="px-3 py-1 bg-emerald-500/30 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-400/30">
          Role-Based Access Control (RBAC) · Expert Validation Portal
        </span>
        <h1 className="text-3xl font-bold tracking-tight mt-2">Agriculture Expert & Admin Dashboard</h1>
        <p className="mt-2 text-stone-300 text-sm max-w-2xl">
          Review automated AI diagnosis, confirm field pathogen scan reports, and approve custom extension advisories.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation / Metrics */}
        <div className="card p-6 space-y-4 lg:col-span-1">
          <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wider">Expert Management</h3>
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('scans')}
              className={`w-full text-left px-4 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between ${
                activeTab === 'scans' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <span>Pending Reviews</span>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px]">2</span>
            </button>
            <button
              onClick={() => setActiveTab('verified')}
              className={`w-full text-left px-4 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-between ${
                activeTab === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <span>Verified Advisories</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px]">48</span>
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="lg:col-span-3 card p-6 space-y-6">
          <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <FileCheck className="text-emerald-600" size={20} /> Pathology Diagnostic Reviews
          </h3>

          <div className="space-y-4">
            {pendingScans.map((scan) => (
              <div key={scan.id} className="p-5 rounded-2xl border border-stone-200 bg-white space-y-3 shadow-sm hover:border-emerald-300 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">{scan.farmer} — {scan.location}</h4>
                    <p className="text-xs text-stone-500">Target Crop: {scan.crop} · Date: {scan.date}</p>
                  </div>
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                    {scan.status}
                  </span>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-700">
                  <span className="font-bold text-stone-900">AI Detection Trigger: </span>
                  {scan.flag_reason}
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1">
                    <CheckCircle2 size={14} /> Validate & Approve Advisory
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
