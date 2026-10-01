import clsx from 'clsx'

const fieldBase =
  'w-full px-3.5 py-2.5 rounded-lg border bg-white text-stone-800 text-sm placeholder:text-stone-400 transition-all duration-150 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ' +
  'disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed'

export function Label({ children, htmlFor, className = '' }) {
  return (
    <label htmlFor={htmlFor} className={clsx('block text-sm font-semibold text-stone-600 mb-1.5', className)}>
      {children}
    </label>
  )
}

export function FieldError({ children, id }) {
  if (!children) return null
  return <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-600">{children}</p>
}

export function Input({ className = '', error, ...rest }) {
  return (
    <input
      aria-invalid={error ? true : undefined}
      className={clsx(fieldBase, error ? 'border-red-400' : 'border-stone-300', className)}
      {...rest}
    />
  )
}

export function Textarea({ className = '', error, rows = 4, ...rest }) {
  return (
    <textarea
      rows={rows}
      aria-invalid={error ? true : undefined}
      className={clsx(fieldBase, error ? 'border-red-400' : 'border-stone-300', className)}
      {...rest}
    />
  )
}

export function Select({ className = '', error, children, ...rest }) {
  return (
    <select
      aria-invalid={error ? true : undefined}
      className={clsx(fieldBase, 'cursor-pointer', error ? 'border-red-400' : 'border-stone-300', className)}
      {...rest}
    >
      {children}
    </select>
  )
}

export default Input
