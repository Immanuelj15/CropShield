import { useState, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'

export default function RiskGauge({ riskScore = 0.45, riskLevel = 'Medium', size = 260 }) {
  const shouldReduceMotion = useReducedMotion()
  const numericScore = Number(riskScore)
  const scorePercent = Number.isFinite(numericScore) ? Math.round(Math.min(1, Math.max(0, numericScore)) * 100) : 0

  // Risk configurations based on traffic-light specification
  const configs = {
    Low: {
      color: '#16a34a',
      bgClass: 'bg-green-50 text-green-800 border-green-200',
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

  // Gauge angle math: -90deg (0% Low) to +90deg (100% High)
  const targetAngle = -90 + (scorePercent / 100) * 180

  // Semi-circle SVG coordinates
  const radius = 90
  const strokeWidth = 16
  const center = 110
  const circumference = Math.PI * radius // ~282.74

  // Animated needle angle with smooth spring-physics easing
  const [needleAngle, setNeedleAngle] = useState(shouldReduceMotion ? targetAngle : -90)
  const angleRef = useRef(needleAngle)

  useEffect(() => {
    if (shouldReduceMotion) {
      setNeedleAngle(targetAngle)
      angleRef.current = targetAngle
      return
    }

    const startAngle = angleRef.current
    const delta = targetAngle - startAngle
    const duration = 850 // ms
    const startTime = performance.now()
    let frameId

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)

      // easeOutBack curve gives an authentic responsive gauge bounce
      const c1 = 1.25
      const c3 = c1 + 1
      const ease = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2)

      const current = startAngle + delta * ease
      setNeedleAngle(current)
      angleRef.current = current

      if (progress < 1) {
        frameId = requestAnimationFrame(animate)
      } else {
        setNeedleAngle(targetAngle)
        angleRef.current = targetAngle
      }
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [targetAngle, shouldReduceMotion])

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* SVG Arc Gauge */}
      <div className="relative flex items-center justify-center" style={{ width: "100%", maxWidth: size, aspectRatio: "220 / 140" }}>
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
            <filter id="needleShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000000" floodOpacity="0.35" />
            </filter>
            <filter id="hubGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor={currentCfg.color} floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Background track arc (180 degrees) */}
          <path
            d="M 20 110 A 90 90 0 0 1 200 110"
            fill="none"
            stroke="#e7e5e4"
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
              duration: shouldReduceMotion ? 0 : 0.6,
              ease: 'easeOut',
            }}
          />

          {/* Animated Needle - Explicit SVG transform locked directly to pivot point (110, 110) */}
          <g transform={`rotate(${needleAngle.toFixed(2)}, ${center}, 110)`}>
            {/* Aerodynamic tapered pointer extending upwards to the gauge track */}
            <path
              d={`M ${center - 3.5} 110 L ${center - 1} 24 A 1 1 0 0 1 ${center + 1} 24 L ${center + 3.5} 110 Z`}
              fill="#1c1917"
              filter="url(#needleShadow)"
            />
            {/* Counterbalance tail extending below the pivot for perfect visual balance */}
            <path
              d={`M ${center - 3.5} 110 L ${center - 2} 122 A 2 2 0 0 0 ${center + 2} 122 L ${center + 3.5} 110 Z`}
              fill="#292524"
            />
            {/* Center color spine */}
            <line
              x1={center}
              y1={108}
              x2={center}
              y2={27}
              stroke={currentCfg.color}
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.95"
            />
            {/* Tip indicator bead */}
            <circle cx={center} cy={24} r="2" fill={currentCfg.color} />
          </g>

          {/* Center Pivot Hub ("The Hole") - Firmly clamping over the needle at (center, 110) */}
          <g filter="url(#hubGlow)">
            {/* Outer dark bezel */}
            <circle cx={center} cy={110} r="8.5" fill="#1c1917" stroke="#44403c" strokeWidth="1.5" />
            {/* Color-coded accent ring */}
            <circle cx={center} cy={110} r="5.5" fill={currentCfg.color} opacity="0.4" />
            {/* Center metallic eyelet hole */}
            <circle cx={center} cy={110} r="3" fill="#ffffff" />
            <circle cx={center} cy={110} r="1.5" fill="#1c1917" />
          </g>

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
              'px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 shadow-sm',
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
