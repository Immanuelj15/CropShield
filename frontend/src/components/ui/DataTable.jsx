import clsx from 'clsx'

// Renders a real <table> at md: and up; falls back to a stacked card list below md: so tabular data
// (farmer treatments/history, admin/agronomist tables) no longer requires horizontal scrolling on phones.
// `columns`: [{ key, header, render?(row), className? }]
export default function DataTable({ columns, rows, keyField = 'id', emptyMessage = 'No data available.', className = '' }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-stone-500 text-center py-8">{emptyMessage}</p>
  }

  return (
    <div className={className}>
      {/* Desktop / tablet: real table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200">
              {columns.map((col) => (
                <th key={col.key} className={clsx('text-left font-semibold text-stone-500 text-xs uppercase tracking-wide py-2.5 px-3', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[keyField]} className="border-b border-stone-100 hover:bg-stone-50/70">
                {columns.map((col) => (
                  <td key={col.key} className={clsx('py-3 px-3 text-stone-800', col.className)}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked card list */}
      <div className="md:hidden flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row[keyField]} className="rounded-2xl border border-stone-200 bg-white p-4 flex flex-col gap-2">
            {columns.map((col) => (
              <div key={col.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-stone-500 font-medium">{col.header}</span>
                <span className="text-stone-800 text-right">{col.render ? col.render(row) : row[col.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
