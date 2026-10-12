import { cn } from "@/lib/utils";

export interface StackedSegment {
  label: string;
  value: number;
  /** Classe de cor de fundo (Tailwind) do segmento. */
  color: string;
}

interface StackedBarProps {
  title: string;
  segments: StackedSegment[];
}

/** Barra empilhada com legenda numérica (os números também ficam em texto, não só na cor). */
export function StackedBar({ title, segments }: StackedBarProps) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  const summary = segments.map((s) => `${s.label}: ${s.value}`).join(", ");

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {total === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Sem achados no período.</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${title}. ${summary}`}
            className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-gray-800"
          >
            {segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div key={s.label} className={cn("h-full", s.color)} style={{ width: `${(s.value / total) * 100}%` }} />
              ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
            {segments.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", s.color)} aria-hidden="true" />
                {s.label}: <span className="font-medium text-gray-200">{s.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
