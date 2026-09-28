import clsx from 'clsx'

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm',
  secondary: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
  ghost: 'bg-transparent text-stone-600 hover:bg-stone-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
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
  ...rest
}) {
  return (
    <Component
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : Icon ? (
        <Icon size={size === 'lg' ? 18 : size === 'sm' ? 14 : 16} className="shrink-0" />
      ) : null}
      {children}
    </Component>
  )
}
