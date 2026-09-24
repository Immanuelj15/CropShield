import React from 'react'
import { motion } from 'framer-motion'

export default function ConfidenceIndicator({
  confidencePct,
  size = 'md',
  showLabel = true,
  className = '',
}) {
  const pct = Math.max(0, Math.min(100, Math.round(confidencePct || 0)))

  // Neutral blue-to-slate grading (avoiding red/green pest-alert colors)
  // Low confidence is just uncertainty, not bad news/danger!
  let strokeColor = '#0284c7' // sky-600 (High)
  let trackColor = '#e0f2fe' // sky-100
  let labelText = 'High Certainty'
  let textColor = 'text-sky-800'

  if (pct < 55) {
    strokeColor = '#64748b' // slate-500
    trackColor = '#f1f5f9' // slate-100
    labelText = 'High Uncertainty'
    textColor = 'text-slate-600'
  } else if (pct < 75) {
    strokeColor = '#0ea5e9' // sky-500
    trackColor = '#f0f9ff' // sky-50
    labelText = 'Moderate Certainty'
    textColor = 'text-sky-700'
  }

  const dimensions = size === 'sm' ? 40 : size === 'lg' ? 72 : 56
  const strokeWidth = size === 'sm' ? 3.5 : size === 'lg' ? 5.5 : 4.5
  const radius = (dimensions - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div className="relative inline-flex items-center justify-center" style={{ width: dimensions, height: dimensions }}>
        <svg
          width={dimensions}
          height={dimensions}
          viewBox={`0 0 ${dimensions} ${dimensions}`}
          className="transform -rotate-90"
        >
          {/* Track Circle */}
          <circle
            cx={dimensions / 2}
            cy={dimensions / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated Progress Circle */}
          <motion.circle
            cx={dimensions / 2}
            cy={dimensions / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span className={`absolute font-black font-mono ${size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-sm' : 'text-xs'} ${textColor}`}>
          {pct}%
        </span>
      </div>

      {showLabel && (
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Model Certainty</span>
          <span className={`text-xs font-black ${textColor}`}>{labelText}</span>
        </div>
      )}
    </div>
  )
}
