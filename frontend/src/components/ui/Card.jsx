import clsx from 'clsx'

export default function Card({ children, className = '', hover = false, padding = 'p-5 sm:p-6', as: Component = 'div', ...rest }) {
  return (
    <Component
      className={clsx(
        'bg-white rounded-2xl border border-stone-200 shadow-sm',
        hover && 'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
        padding,
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}
