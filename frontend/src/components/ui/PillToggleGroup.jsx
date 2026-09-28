import clsx from 'clsx'

// Consolidates the 3+ "pill toggle group" implementations (CropRecommendationPage season/water/budget,
// FarmActivityPlannerPage filter pills, OutbreakMapPage risk filter) into one component.
// `options`: [{ value, label }]. Single-select unless `multi` is set (value/onChange become arrays).
export default function PillToggleGroup({ options, value, onChange, multi = false, size = 'md', className = '' }) {
  const isSelected = (optValue) => (multi ? (value || []).includes(optValue) : value === optValue)

  const handleClick = (optValue) => {
    if (!multi) {
      onChange(optValue)
      return
    }
    const current = value || []
    onChange(current.includes(optValue) ? current.filter((v) => v !== optValue) : [...current, optValue])
  }

  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => handleClick(opt.value)}
          className={clsx(
            'rounded-lg font-semibold border transition-all duration-150',
            size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2',
            isSelected(opt.value)
              ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
              : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
