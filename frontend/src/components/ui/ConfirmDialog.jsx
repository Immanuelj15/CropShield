import Modal from './Modal'
import Button from './Button'
import { AlertTriangle } from 'lucide-react'

// Replaces window.confirm() call sites so destructive actions get a styled, on-brand confirmation.
export default function ConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="sm">
      <div className="flex flex-col items-center text-center gap-3">
        <div className={danger ? 'w-12 h-12 rounded-full bg-red-100 flex items-center justify-center' : 'w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center'}>
          <AlertTriangle size={22} className={danger ? 'text-red-600' : 'text-brand-700'} />
        </div>
        <h3 className="text-base font-bold text-stone-900">{title}</h3>
        {message && <p className="text-sm text-stone-600">{message}</p>}
        <div className="flex gap-2 w-full mt-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}
