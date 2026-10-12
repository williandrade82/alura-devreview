export interface ColumnPoint {
  label: string;
  /** null = sem dado no período (ex.: média de uma semana sem revisões). */
  value: number | null;
  /** true no período em andamento: a coluna é desenhada mais clara. */
  partial?: boolean;
}

interface ColumnChartProps {
  title: string;
  description?: string;
  points: ColumnPoint[];
  /** Classe de cor de fundo (Tailwind) das colunas. */
  color?: string;
}

const MAX_X_LABELS = 8;

/** Gráfico de colunas em CSS, proporcional ao maior valor; os valores também ficam em texto (aria-label e tooltip). */
export function ColumnChart({ title, description, points, color = "bg-indigo-500" }: ColumnChartProps) {
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  // Mostra no máximo ~8 rótulos no eixo para não sobrepor texto em períodos longos.
  const step = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));
  const label = (p: ColumnPoint) => `${p.label}${p.partial ? " (em andamento)" : ""}: ${p.value ?? "sem dados"}`;
  const summary = points.map(label).join(", ");
  const hasPartial = points.some((p) => p.partial);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      {points.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Sem dados no período.</p>
      ) : (
        <div role="img" aria-label={`${title}. ${summary}`} className="mt-4">
          <div className="flex h-32 items-end gap-1">
            {points.map((p) => {
              const ratio = max === 0 || p.value === null ? 0 : p.value / max;
              return (
                <div
                  key={p.label}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={label(p)}
                >
                  {p.value === null || p.value === 0 ? (
                    <div className="h-px w-full bg-gray-700" />
                  ) : (
                    <div
                      className={`w-full rounded-t ${color} ${p.partial ? "opacity-50" : ""}`}
                      style={{ height: `${Math.max(ratio * 100, 4)}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1">
            {points.map((p, i) => (
              <span key={p.label} className="min-w-0 flex-1 text-center text-[10px] text-gray-500">
                {i % step === 0 ? p.label : ""}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Máximo: <span className="font-medium text-gray-300">{max}</span>
            {hasPartial && " · coluna mais clara = período em andamento"}
          </p>
        </div>
      )}
    </div>
  );
}
