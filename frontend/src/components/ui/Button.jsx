import clsx from 'clsx'

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm focus-visible:ring-brand-500',
  secondary: 'bg-stone-100 text-stone-700 hover:bg-stone-200 focus-visible:ring-brand-500',
  ghost: 'bg-transparent text-stone-600 hover:bg-stone-100 focus-visible:ring-brand-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm focus-visible:ring-red-500',
}

const SIZES = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-6 py-3 gap-2.5',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  as: Component = 'button',
  icon: Icon,
  loading = false,
  children,
  disabled,
  type,
  ...rest
}) {
  const isNativeButton = Component === 'button'
  return (
    <Component
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        className
      )}
      // Never submit a surrounding form by accident: pass type="submit" explicitly when needed.
      type={isNativeButton ? type || 'button' : type}
      disabled={isNativeButton ? disabled || loading : undefined}
      aria-disabled={!isNativeButton && (disabled || loading) ? true : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : Icon ? (
        <Icon size={size === 'lg' ? 18 : size === 'sm' ? 14 : 16} className="shrink-0" aria-hidden="true" />
      ) : null}
      {children}
    </Component>
  )
}
