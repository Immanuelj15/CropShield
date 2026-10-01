import clsx from 'clsx'

// Replaces the toggle-switch markup copy-pasted 3x verbatim in NotificationSettingsPage.
// Without a visible `label`, pass `ariaLabel` (or `aria-label`) so screen readers can name the switch.
export default function Toggle({ checked, onChange, label, ariaLabel, 'aria-label': ariaLabelAttr, disabled = false, className = '' }) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label ? undefined : ariaLabel || ariaLabelAttr}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        checked ? 'bg-brand-600' : 'bg-stone-300',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )

  if (!label) return control

  return (
    <label className={clsx('flex items-center justify-between gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer', className)}>
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {control}
    </label>
  )
}
