import { useEffect, useId } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import clsx from 'clsx'

// One consistent z-index for every overlay in the app (previously z-50/z-[1000]/z-[1100]/z-[9999] scattered).
export const MODAL_Z_INDEX = 50

export default function Modal({ isOpen, onClose, title, children, size = 'md', sheet = false }) {
  const sizeCls = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size] || 'max-w-lg'
  const titleId = useId()

  // Escape closes the dialog (keyboard users had no way out when there was no title bar).
  useEffect(() => {
    if (!isOpen || !onClose) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0" style={{ zIndex: MODAL_Z_INDEX }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className={clsx('absolute inset-0 flex p-4 pointer-events-none', sheet ? 'items-end sm:items-center justify-center' : 'items-center justify-center')}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              initial={sheet ? { opacity: 0, y: 40 } : { opacity: 0, scale: 0.96 }}
              animate={sheet ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1 }}
              exit={sheet ? { opacity: 0, y: 40 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className={clsx(
                'relative w-full bg-white shadow-lg max-h-[90vh] overflow-y-auto pointer-events-auto',
                sheet ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-2xl',
                sizeCls
              )}
            >
              {title && (
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-stone-100 sticky top-0 bg-white rounded-t-2xl z-10">
                  <h3 id={titleId} className="text-lg font-bold text-stone-900">{title}</h3>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              <div className="p-6">{children}</div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
