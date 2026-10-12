interface BarListItem {
  id: string;
  label: string;
  value: number;
  /** Texto extra à direita do valor (ex.: "2 dispensados"). */
  note?: string;
}

interface BarListProps {
  title: string;
  description?: string;
  items: BarListItem[];
  emptyText: string;
  barColor?: string;
}

/** Ranking em barras horizontais proporcionais ao maior valor da lista. */
export function BarList({ title, description, items, emptyText, barColor = "bg-indigo-500" }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-200" title={item.label}>
                  {item.label}
                </span>
                <span className="flex-shrink-0 text-xs text-gray-400">
                  {item.note && <span className="mr-2 text-amber-400">{item.note}</span>}
                  <span className="font-medium text-white">{item.value}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-800" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
