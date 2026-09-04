import {
  Thermometer, Droplets, Wind, CloudRain, Sun, Zap,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  Info, ShieldAlert, ShieldCheck, ShieldQuestion
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, RadialBarChart, RadialBar, Cell
} from 'recharts'
import clsx from 'clsx'

// ── Spinner / Loading ────────────────────────────────────────
export function Spinner({ size = 'md', className = '' }) {
  const s = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return <div className={clsx('animate-spin rounded-full border-2 border-stone-200 border-t-leaf-600', s[size], className)} />
}

export function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Spinner size="lg" />
      <p className="text-stone-500">{message}</p>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
        <AlertTriangle size={24} className="text-red-500" />
      </div>
      <p className="text-stone-700 font-semibold text-center max-w-sm">{message || 'Something went wrong'}</p>
      {onRetry && <button onClick={onRetry} className="btn-secondary text-sm px-4 py-2">Try Again</button>}
    </div>
  )
}

// ── Risk Badge ────────────────────────────────────────────────
export function RiskBadge({ level, large = false }) {
  const cfg = {
    Low:    { cls: 'risk-badge-low',    Icon: CheckCircle },
    Medium: { cls: 'risk-badge-medium', Icon: Info },
    High:   { cls: 'risk-badge-high',   Icon: AlertTriangle },
  }[level] || { cls: 'risk-badge-low', Icon: CheckCircle }
  return (
    <span className={clsx(cfg.cls, large && 'text-base px-4 py-1.5')}>
      <cfg.Icon size={large ? 18 : 14} />
      {level} Risk
    </span>
  )
}

// ── Today's Warning Hero Card ─────────────────────────────────
export function TodayWarningCard({ result }) {
  if (!result) return null
  const { risk_level, risk_score, is_warning, alert_message,
          warning_date, crop, location, data_date } = result

  const configs = {
    High:   { bg: 'from-red-600 to-red-800',   badge: 'bg-red-100 text-red-900',   Icon: ShieldAlert },
    Medium: { bg: 'from-amber-500 to-amber-700',badge: 'bg-amber-100 text-amber-900',Icon: ShieldQuestion },
    Low:    { bg: 'from-leaf-600 to-leaf-800',  badge: 'bg-leaf-100 text-leaf-900', Icon: ShieldCheck },
  }
  const cfg = configs[risk_level] || configs.Low

  return (
    <div className={clsx('rounded-2xl bg-gradient-to-br text-white p-6 relative overflow-hidden', cfg.bg)}>
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: 'radial-gradient(circle at 70% 40%, white 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-white/70 text-sm font-semibold mb-1">
              Today's Pest Warning · {warning_date || data_date}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
              {risk_level} Pest Risk
            </h2>
            <p className="text-white/80 mt-1">
              {crop} · {location}
            </p>
          </div>
          <div className="shrink-0">
            <cfg.Icon size={52} className="text-white/30" />
          </div>
        </div>

        {/* Score bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-white/70">Risk Score</span>
            <span className="font-mono font-bold">{Math.round(risk_score * 100)}%</span>
          </div>
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-700"
              style={{ width: `${Math.round(risk_score * 100)}%` }}
            />
          </div>
        </div>

        <p className="text-white/90 text-sm leading-relaxed">{alert_message}</p>
      </div>
    </div>
  )
}

// ── Risk Gauge (radial) ───────────────────────────────────────
export function RiskGauge({ score, level }) {
  const pct   = Math.round(score * 100)
  const color = { High: '#dc2626', Medium: '#d97706', Low: '#16a34a' }[level] || '#16a34a'
  const data  = [{ value: pct, fill: color }, { value: 100 - pct, fill: '#f5f5f4' }]
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-26">
        <ResponsiveContainer width="100%" height={110}>
          <RadialBarChart cx="50%" cy="100%" innerRadius="60%" outerRadius="100%"
            startAngle={180} endAngle={0} data={data}>
            <RadialBar dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="font-display text-3xl font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <RiskBadge level={level} large />
    </div>
  )
}

// ── Weather Snapshot Grid ─────────────────────────────────────
export function WeatherCard({ data }) {
  if (!data) return null
  const items = [
    { Icon: Thermometer, label: 'Mean Temp',   value: `${data.temperature_c ?? data.t2m ?? '--'}°C`, color: 'text-orange-500' },
    { Icon: Thermometer, label: 'Max / Min',   value: `${data.max_temp_c ?? '--'} / ${data.min_temp_c ?? '--'}°C`, color: 'text-red-400' },
    { Icon: Droplets,    label: 'Humidity',    value: `${data.humidity_pct ?? data.rh2m ?? '--'}%`, color: 'text-blue-500' },
    { Icon: CloudRain,   label: '7-day Rain',  value: `${data.rain_rolling_7d_mm ?? '--'} mm`, color: 'text-indigo-500' },
    { Icon: CloudRain,   label: '14-day Rain', value: `${data.rain_rolling_14d_mm ?? '--'} mm`, color: 'text-violet-500' },
    { Icon: Wind,        label: 'Wind Speed',  value: `${data.wind_speed_ms ?? data.ws2m ?? '--'} m/s`, color: 'text-teal-500' },
    { Icon: Sun,         label: 'Solar Rad.',  value: `${data.solar_rad_mj ?? data.allsky_sfc_sw_dwn ?? '--'} MJ/m²`, color: 'text-yellow-500' },
    { Icon: Zap,         label: 'ET₀',         value: `${data.et0_mm ?? data.et0 ?? '--'} mm`, color: 'text-purple-500' },
    { Icon: AlertTriangle, label: 'Dry Days',  value: `${data.consecutive_dry_days ?? '--'} days`, color: 'text-amber-500' },
    { Icon: TrendingUp,  label: 'RH Trend',    value: data.humidity_trend_7d != null ? `${data.humidity_trend_7d > 0 ? '+' : ''}${data.humidity_trend_7d}/day` : '--', color: 'text-sky-500' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(({ Icon, label, value, color }) => (
        <div key={label} className="card p-3 flex items-center gap-2.5">
          <div className={clsx('p-2 rounded-lg bg-stone-50 shrink-0', color)}>
            <Icon size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-stone-500 truncate">{label}</p>
            <p className="text-sm font-semibold text-stone-800 truncate">{value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── SHAP Feature Chart ────────────────────────────────────────
export function ShapChart({ features }) {
  if (!features?.length) return null
  const data = features.slice(0, 10)
    .map(f => ({
      name:   friendlyName(f.feature),
      value:  Math.abs(f.shap_value),
      raw:    f.shap_value,
      impact: f.impact,
    }))
    .sort((a, b) => a.value - b.value)

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs text-stone-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Increases risk</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Reduces risk</span>
      </div>
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={148} />
          <Tooltip formatter={(v, n, p) => [p.payload.raw.toFixed(4), 'SHAP']} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.impact === 'positive' ? '#dc2626' : '#2563eb'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Likely Pest Card ──────────────────────────────────────────
export function LikelyPestCard({ pest }) {
  const stColors = {
    Confirmed: 'border-red-300 bg-red-50',
    Suspected: 'border-amber-300 bg-amber-50',
    None:      'border-stone-200 bg-stone-50',
  }
  const stBadge = {
    Confirmed: 'bg-red-100 text-red-800',
    Suspected: 'bg-amber-100 text-amber-800',
    None:      'bg-stone-100 text-stone-600',
  }
  const s = pest.detection_status || 'Suspected'
  return (
    <div className={clsx('rounded-xl border p-4', stColors[s])}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h4 className="font-semibold text-stone-900">{pest.pest_name}</h4>
          <p className="text-xs text-stone-500">{pest.pest_type}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', stBadge[s])}>{s}</span>
          <span className="text-xs text-stone-500">{Math.round((pest.confidence || 0) * 100)}% conf.</span>
        </div>
      </div>
      {pest.management_advice && (
        <div className="mt-2 bg-white/70 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-stone-700 mb-0.5">Management:</p>
          <p className="text-xs text-stone-600">{pest.management_advice}</p>
        </div>
      )}
    </div>
  )
}

// ── Pest Alert Card (detect page) ────────────────────────────
export function PestAlertCard({ pest }) {
  return <LikelyPestCard pest={pest} />
}

// ── Soil Info Card ────────────────────────────────────────────
export function SoilCard({ soil }) {
  if (!soil) return null
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {[
        ['Soil Type', soil.soil_type],
        ['pH', soil.ph],
        ['EC (dS/m)', soil.ec],
        ['Organic C (%)', soil.organic_carbon],
        ['N (kg/ha)', soil.nitrogen],
        ['P (kg/ha)', soil.phosphorus],
        ['K (kg/ha)', soil.potassium],
      ].map(([label, value]) => (
        <div key={label}>
          <span className="text-xs text-stone-500">{label}</span>
          <p className="font-semibold text-stone-800">{value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Trend ─────────────────────────────────────────────────────
export function Trend({ value, suffix = '' }) {
  if (value > 0) return <span className="text-red-500 flex items-center gap-0.5 text-xs"><TrendingUp size={12} />+{value}{suffix}</span>
  if (value < 0) return <span className="text-green-600 flex items-center gap-0.5 text-xs"><TrendingDown size={12} />{value}{suffix}</span>
  return <span className="text-stone-400 flex items-center gap-0.5 text-xs"><Minus size={12} />—</span>
}

// ── Helpers ───────────────────────────────────────────────────
export function friendlyName(feature) {
  const m = {
    t2m: 'Mean Temp', rh2m: 'Humidity', t2m_max: 'Max Temp', t2m_min: 'Min Temp',
    rain_rolling_3d: '3-day Rain', rain_rolling_7d: '7-day Rain',
    rain_rolling_14d: '14-day Rain', rain_rolling_30d: '30-day Rain',
    rain_monthly_cumul: 'Monthly Rain',
    t2m_rolling_3d: '3-day Avg Temp', t2m_rolling_7d: '7-day Avg Temp',
    t2m_rolling_14d: '14-day Avg Temp',
    rh2m_rolling_3d: '3-day Avg RH', rh2m_rolling_7d: '7-day Avg RH',
    rh2m_rolling_14d: '14-day Avg RH',
    t2m_lag1: 'Temp Yesterday', t2m_lag3: 'Temp 3d Ago',
    rh2m_lag1: 'RH Yesterday', rain_lag1: 'Rain Yesterday',
    consecutive_dry_days: 'Dry Spell', consecutive_wet_days: 'Wet Spell',
    rh_trend_7d: 'RH Trend 7d', temp_trend_7d: 'Temp Trend 7d',
    heat_index: 'Heat Index', temp_range: 'Temp Range', vpd: 'Vapour Press. Deficit',
    et0: 'ET₀', ws2m: 'Wind Speed', allsky_sfc_sw_dwn: 'Solar Rad.',
    month_sin: 'Season (sin)', month_cos: 'Season (cos)',
    soil_oc: 'Soil Org. Carbon', soil_ph: 'Soil pH', soil_clay_pct: 'Clay %',
  }
  for (const [k, v] of Object.entries(m)) if (feature.includes(k)) return v
  return feature.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
