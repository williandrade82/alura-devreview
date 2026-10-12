import { SectionTitle } from "@/components/stats/SectionTitle";
import type { KeywordTrend } from "@/types";

interface ThemesSectionProps {
  days: number;
  themes: KeywordTrend[];
}

/** Variação do tema contra o período anterior de mesma duração. */
function Delta({ total, previous }: { total: number; previous: number }) {
  if (previous === 0) {
    return <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-400">novo</span>;
  }
  const diff = total - previous;
  if (diff === 0) return <span className="text-xs text-gray-500">= {previous}</span>;
  return (
    <span className={diff > 0 ? "text-xs text-amber-400" : "text-xs text-green-400"}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      <span className="sr-only"> {diff > 0 ? "a mais" : "a menos"} que no período anterior</span>
    </span>
  );
}

/** Ranking de temas (palavras-chave das revisões) com a severidade e a variação no período. */
export function ThemesSection({ days, themes }: ThemesSectionProps) {
  const max = Math.max(1, ...themes.map((t) => t.total));

  return (
    <section className="space-y-4" aria-labelledby="stats-themes">
      <SectionTitle
        id="stats-themes"
        title="Temas"
        description={`Assuntos mais analisados nos últimos ${days} dias, comparados aos ${days} dias anteriores.`}
      />
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        {themes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum tema registrado no período.</p>
        ) : (
          <ul className="space-y-3">
            {themes.map((t) => (
              <li key={t.keyword}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-gray-200" title={t.keyword}>
                    {t.keyword}
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3 text-xs">
                    <Delta total={t.total} previous={t.previous_total} />
                    <span className="font-medium text-white">{t.total}</span>
                  </span>
                </div>
                <div
                  role="img"
                  aria-label={`${t.keyword}: ${t.errors} erros, ${t.warnings} avisos, ${t.infos} infos`}
                  className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-gray-800"
                  style={{ width: `${(t.total / max) * 100}%` }}
                >
                  {t.errors > 0 && <div className="bg-red-500" style={{ flex: t.errors }} />}
                  {t.warnings > 0 && <div className="bg-amber-500" style={{ flex: t.warnings }} />}
                  {t.infos > 0 && <div className="bg-blue-500" style={{ flex: t.infos }} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-gray-500">
          Cores: <span className="text-red-400">erro</span> · <span className="text-amber-400">aviso</span> ·{" "}
          <span className="text-blue-400">info</span> (severidade do pior achado do tema em cada revisão).
        </p>
      </div>
    </section>
  );
}
