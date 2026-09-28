import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'

// Replaces the chevron-toggle disclosure pattern reimplemented independently in
// FertilizerCard, IrrigationCard, EconomicImpactCard, CropRecommendationCard, FusedHealthScoreCard.
export default function Accordion({ title, children, defaultOpen = false, className = '' }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={clsx('border-t border-stone-100', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-3 text-sm font-semibold text-stone-700 hover:text-stone-900"
      >
        <span>{title}</span>
        <ChevronDown size={16} className={clsx('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
