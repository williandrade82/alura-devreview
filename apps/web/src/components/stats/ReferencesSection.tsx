import { BarList } from "@/components/stats/BarList";
import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { SectionTitle } from "@/components/stats/SectionTitle";
import type { ReferenceStats } from "@/types";

interface ReferencesSectionProps {
  references: ReferenceStats;
  /** Revisões do período (sem elas, todas as regras ativas aparecem como "nunca dispararam"). */
  reviewsTotal: number;
}

/** Regras mais violadas, ADRs mais citados e regras ativas que nunca dispararam. */
export function ReferencesSection({ references, reviewsTotal }: ReferencesSectionProps) {
  return (
    <section className="space-y-4" aria-labelledby="stats-references">
      <SectionTitle
        id="stats-references"
        title="Regras e ADRs"
        description="O que mais aparece nas revisões. Achados dispensados em uma regra podem indicar falso positivo."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList
          title="Regras mais violadas"
          items={references.rules.map((r) => ({
            id: r.rule_id,
            label: r.rule ?? "Regra removida",
            value: r.total,
            note: r.dismissed > 0 ? `${r.dismissed} dispensado${r.dismissed > 1 ? "s" : ""}` : undefined,
          }))}
          emptyText="Nenhum achado ligado a uma regra no período."
        />
        <BarList
          title="ADRs mais citados"
          barColor="bg-purple-500"
          items={references.adrs.map((a) => ({
            id: a.adr_id,
            label: a.title ?? "ADR removido",
            value: a.total,
          }))}
          emptyText="Nenhum achado baseado em ADR no período."
        />
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-white">Regras ativas que nunca dispararam</h3>
        <p className="mt-1 text-xs text-gray-500">
          Candidatas a revisão: podem estar bem atendidas ou difíceis de detectar.
          {reviewsTotal === 0 && " Sem revisões no período, todas aparecem aqui."}
        </p>
        {references.never_triggered.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">Todas as regras ativas dispararam no período.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-800">
            {references.never_triggered.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-200" title={r.rule}>
                  {r.rule}
                </span>
                <CategoryBadge category={r.category} />
              </li>
            ))}
          </ul>
        )}
        {references.never_triggered_total > references.never_triggered.length && (
          <p className="mt-3 text-xs text-gray-500">
            e mais {references.never_triggered_total - references.never_triggered.length} regra
            {references.never_triggered_total - references.never_triggered.length > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </section>
  );
}
