import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, User, Lock, ArrowRight, CheckCircle2, Sprout, ShieldAlert, Sparkles } from 'lucide-react'

const DEMO_ACCOUNTS = {
  farmer: {
    label: 'Farmer',
    email: 'farmer@cropshield.org',
    password: 'farmer123',
    role: 'farmer',
    desc: 'Access personal farm warning cards, satellite microclimate, and counterfactual advice.',
    icon: Sprout,
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  agronomist: {
    label: 'Agronomist / Expert',
    email: 'agronomist@cropshield.org',
    password: 'agro123',
    role: 'agronomist',
    desc: 'Verify field pest outbreaks, review image scans, and approve district advisories.',
    icon: Shield,
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  admin: {
    label: 'System Admin',
    email: 'admin@cropshield.org',
    password: 'admin123',
    role: 'admin',
    desc: 'Manage regional risk grids, user permissions, and institutional data pipelines.',
    icon: ShieldAlert,
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState('farmer')
  const [email, setEmail] = useState(DEMO_ACCOUNTS.farmer.email)
  const [password, setPassword] = useState(DEMO_ACCOUNTS.farmer.password)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [activeUser, setActiveUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem('cropshield_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const handleRoleSelect = (roleKey) => {
    setSelectedRole(roleKey)
    setEmail(DEMO_ACCOUNTS[roleKey].email)
    setPassword(DEMO_ACCOUNTS[roleKey].password)
    setError(null)
  }

  const handleLogoutExisting = () => {
    sessionStorage.clear()
    localStorage.removeItem('cropshield_token')
    localStorage.removeItem('cropshield_user')
    setActiveUser(null)
    window.dispatchEvent(new Event('cropshield_auth_changed'))
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, email: email, password: password }),
      })

      if (response.ok) {
        const data = await response.json()
        const userObj = {
          email: data.username || email,
          role: data.role || selectedRole,
          name: DEMO_ACCOUNTS[selectedRole]?.label || 'User',
        }
        sessionStorage.setItem('cropshield_token', data.access_token)
        sessionStorage.setItem('cropshield_user', JSON.stringify(userObj))
        // Clean out legacy localStorage so no stale tokens persist
        localStorage.removeItem('cropshield_token')
        localStorage.removeItem('cropshield_user')

        setActiveUser(userObj)
        window.dispatchEvent(new Event('cropshield_auth_changed'))
        setSuccess(`Logged in successfully! Redirecting to dashboard...`)
        
        setTimeout(() => {
          if (userObj.role === 'farmer') {
            navigate('/farmer/today', { replace: true })
          } else if (userObj.role === 'agronomist') {
            navigate('/agronomist/dashboard', { replace: true })
          } else if (userObj.role === 'admin') {
            navigate('/admin/dashboard', { replace: true })
          } else {
            navigate('/farmer/today', { replace: true })
          }
        }, 500)

      } else {
        const errData = await response.json().catch(() => ({}))
        setError(errData.detail || 'Invalid email or password. Please check your credentials.')
      }
    } catch (err) {
      setError('Unable to connect to AgriGuard backend. Please check server status.')
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="max-w-4xl mx-auto py-6 px-4 animate-fadeIn">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-emerald-950 to-stone-900 rounded-3xl p-8 sm:p-10 text-white shadow-2xl relative overflow-hidden mb-8 border border-emerald-900/40">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-semibold rounded-full border border-emerald-400/30 mb-3">
            <Sparkles size={14} /> AgriGuard AI Security & Role-Based Access
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Sign In to <span className="text-emerald-400">AgriGuard</span>
          </h1>
          <p className="mt-3 text-stone-300 text-sm leading-relaxed">
            Explainable AI-based pest risk prediction, NASA POWER climate intelligence, and
            counterfactual agronomic decision support for farmers and experts across India.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Role Selector Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wider mb-4">
              Select Demo Role
            </h3>
            <div className="space-y-3">
              {Object.entries(DEMO_ACCOUNTS).map(([key, item]) => {
                const Icon = item.icon
                const isSelected = selectedRole === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleRoleSelect(key)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-stone-900">{item.label}</span>
                        {isSelected && <CheckCircle2 size={16} className="text-emerald-600" />}
                      </div>
                      <p className="text-xs text-stone-500 mt-1 leading-snug">{item.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Login Form Card */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-stone-900">Sign In</h2>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${DEMO_ACCOUNTS[selectedRole].badgeColor}`}>
                  {DEMO_ACCOUNTS[selectedRole].label}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1">Enter your credentials or click a role on the left to auto-fill.</p>
            </div>

            {activeUser && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-emerald-900 block">Currently Signed In</span>
                  <span className="text-stone-600">{activeUser.email} ({activeUser.role})</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeUser.role === 'agronomist') navigate('/agronomist/dashboard')
                      else if (activeUser.role === 'admin') navigate('/admin/dashboard')
                      else navigate('/farmer/today')
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-sm"
                  >
                    Go to Dashboard
                  </button>

                  <button
                    type="button"
                    onClick={handleLogoutExisting}
                    className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 font-semibold text-xs hover:bg-stone-50"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" /> {success}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Email Address / Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                    <User size={16} />
                  </div>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="name@cropshield.org"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                    <Lock size={16} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all flex items-center justify-center gap-2 mt-2"
              >
                {loading ? 'Authenticating...' : `Sign In as ${DEMO_ACCOUNTS[selectedRole].label}`}
                <ArrowRight size={16} />
              </button>
            </form>

            <div className="pt-4 border-t border-stone-100 text-center">
              <p className="text-xs text-stone-400">
                MongoDB Motor/Beanie Authentication Layer · JWT Secret Encryption
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
