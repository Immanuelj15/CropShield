import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import clsx from 'clsx'
import { MODAL_Z_INDEX } from './Modal'
import { normalizeError } from '../../utils/http'

const ToastContext = createContext(null)

const VARIANTS = {
  success: { cls: 'bg-green-600', Icon: CheckCircle2 },
  error: { cls: 'bg-red-600', Icon: XCircle },
  info: { cls: 'bg-stone-800', Icon: Info },
}

// Replaces window.alert() everywhere in the app with a dismissible, non-blocking, brandable toast.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message, { variant = 'info', duration = 4000 } = {}) => {
    const id = Date.now() + Math.random()
    // Never render raw objects/arrays (e.g. FastAPI 422 `detail`) as a React child.
    const text = typeof message === 'string' ? message : normalizeError(message)
    setToasts((prev) => [...prev, { id, message: text, variant }])
    if (duration) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  // Stable identity so consumers can safely list `toast` in effect/callback deps.
  const toast = useMemo(() => ({
    show: showToast,
    success: (msg, opts) => showToast(msg, { ...opts, variant: 'success' }),
    error: (msg, opts) => showToast(msg, { ...opts, variant: 'error' }),
    info: (msg, opts) => showToast(msg, { ...opts, variant: 'info' }),
  }), [showToast])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="fixed bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 items-stretch sm:items-end"
        style={{ zIndex: MODAL_Z_INDEX + 10 }}
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map(({ id, message, variant }) => {
            const cfg = VARIANTS[variant] || VARIANTS.info
            const Icon = cfg.Icon
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className={clsx('flex items-center gap-2.5 text-white rounded-lg shadow-lg px-4 py-3 sm:max-w-sm', cfg.cls)}
              >
                <Icon size={18} className="shrink-0" />
                <p className="text-sm font-medium flex-1">{message}</p>
                <button type="button" onClick={() => dismiss(id)} className="shrink-0 rounded opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Dismiss">
                  <X size={16} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
