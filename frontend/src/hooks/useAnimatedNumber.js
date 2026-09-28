import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

// Cubic ease-out count-up, used by any card animating a numeric/₹ value on mount/change.
// Previously duplicated independently in EconomicImpactCard (AnimatedRupee) and PnLSummaryCard (AnimatedNumber).
export function useAnimatedNumber(value, { duration = 800 } = {}) {
  const shouldReduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(shouldReduceMotion || value == null ? value : 0)

  useEffect(() => {
    if (value == null) {
      setDisplay(value)
      return
    }
    if (shouldReduceMotion) {
      setDisplay(Math.round(Number(value) || 0))
      return
    }

    const end = Math.round(Number(value) || 0)
    let startTime = null
    let frameId

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(end * eased))
      if (progress < 1) frameId = requestAnimationFrame(step)
    }

    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [value, duration, shouldReduceMotion])

  return display
}
