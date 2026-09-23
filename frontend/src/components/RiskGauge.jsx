import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'

export default function RiskGauge({ riskScore = 0.45, riskLevel = 'Medium', size = 260 }) {
  const shouldReduceMotion = useReducedMotion()
  const scorePercent = Math.round(Math.min(1, Math.max(0, riskScore)) * 100)

  // Risk configurations based on traffic-light specification
  const configs = {
    Low: {
      color: '#16a34a',
      bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      label: 'Low Risk',
      Icon: ShieldCheck,
      description: 'Microclimate unfavorable for rapid pest multiplication.',
    },
    Medium: {
      color: '#d97706',
      bgClass: 'bg-amber-50 text-amber-800 border-amber-200',
      label: 'Medium Risk',
      Icon: AlertTriangle,
      description: 'Elevated temperature & humidity favorable for threshold growth.',
    },
    High: {
      color: '#dc2626',
      bgClass: 'bg-red-50 text-red-800 border-red-200',
      label: 'High Risk',
      Icon: ShieldAlert,
      description: 'Critical microclimate alert. Immediate field inspection recommended.',
    },
  }

  const currentCfg = configs[riskLevel] || configs.Medium
  const CurrentIcon = currentCfg.Icon

  // Gauge angle math: -90deg (0%) to +90deg (100%)
  const angle = -90 + (scorePercent / 100) * 180

  // Semi-circle SVG coordinates
  const radius = 90
  const strokeWidth = 16
  const center = 110
  const circumference = Math.PI * radius // ~282.74

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* SVG Arc Gauge */}
      <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.65 }}>
        <svg
          viewBox="0 0 220 140"
          className="w-full h-full overflow-visible"
          role="img"
          aria-label={`Risk gauge showing ${scorePercent}% ${riskLevel} risk`}
        >
          <defs>
            <linearGradient id="riskGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="45%" stopColor="#eab308" />
              <stop offset="70%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
          </defs>

          {/* Background track arc (180 degrees) */}
          <path
            d="M 20 110 A 90 90 0 0 1 200 110"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Animated active progress arc */}
          <motion.path
            d="M 20 110 A 90 90 0 0 1 200 110"
            fill="none"
            stroke="url(#riskGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{
              strokeDashoffset: circumference * (1 - scorePercent / 100),
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.4,
              ease: 'easeOut',
            }}
          />

          {/* Needle Pivot Center */}
          <circle cx={center} cy={110} r="7" fill="#1f2937" />
          <circle cx={center} cy={110} r="3" fill="#ffffff" />

          {/* Animated Needle */}
          <motion.g
            initial={{ rotate: shouldReduceMotion ? angle : -90 }}
            animate={{ rotate: angle }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.35,
              ease: 'easeOut',
            }}
            style={{ originX: `${center}px`, originY: '110px' }}
          >
            <line
              x1={center}
              y1={110}
              x2={center}
              y2={30}
              stroke="#111827"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <polygon
              points={`${center - 4},110 ${center + 4},110 ${center},24`}
              fill="#111827"
            />
          </motion.g>

          {/* Scale Labels */}
          <text x="15" y="132" fill="#16a34a" fontSize="11" fontWeight="bold">0% Low</text>
          <text x="96" y="15" fill="#d97706" fontSize="11" fontWeight="bold">50%</text>
          <text x="170" y="132" fill="#dc2626" fontSize="11" fontWeight="bold">100% High</text>
        </svg>
      </div>

      {/* Primary Numeric Score & Badge */}
      <div className="mt-2 text-center space-y-1.5">
        <motion.div
          initial={{ scale: shouldReduceMotion ? 1 : 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex items-center justify-center gap-2"
        >
          <span className="text-4xl font-black text-stone-900 tracking-tight">
            {scorePercent}%
          </span>
          <span
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 shadow-xs',
              currentCfg.bgClass
            )}
          >
            <CurrentIcon size={14} className="shrink-0" />
            {currentCfg.label}
          </span>
        </motion.div>

        <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
          {currentCfg.description}
        </p>
      </div>
    </div>
  )
}
