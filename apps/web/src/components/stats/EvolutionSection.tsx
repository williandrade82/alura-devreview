import { ColumnChart } from "@/components/stats/ColumnChart";
import { SectionTitle } from "@/components/stats/SectionTitle";
import { bucketForPeriod, formatBucket } from "@/lib/stats";
import type { TimeseriesPoint } from "@/types";

interface EvolutionSectionProps {
  days: number;
  series: TimeseriesPoint[];
}

/** Evolução no tempo: revisões e média de issues por dia (períodos curtos) ou por semana. */
export function EvolutionSection({ days, series }: EvolutionSectionProps) {
  const bucket = bucketForPeriod(days);
  const unit = bucket === "day" ? "dia" : "semana";
  const hasReviews = series.some((p) => p.reviews > 0);

  return (
    <section className="space-y-4" aria-labelledby="stats-evolution">
      <SectionTitle
        id="stats-evolution"
        title="Evolução no tempo"
        description={`Por ${unit}, nos últimos ${days} dias. Responde se o time está melhorando.`}
      />
      {!hasReviews ? (
        <p className="rounded-lg border border-gray-800 bg-gray-900 p-5 text-sm text-gray-400">
          Nenhuma revisão no período.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ColumnChart
            title="Revisões"
            description={`Quantidade de PRs revisados por ${unit}`}
            points={series.map((p) => ({ label: formatBucket(p.bucket_start), value: p.reviews, partial: p.in_progress }))}
          />
          <ColumnChart
            title="Média de issues"
            description={`Erros e avisos por PR, por ${unit} (sem coluna = sem revisões)`}
            color="bg-amber-500"
            points={series.map((p) => ({ label: formatBucket(p.bucket_start), value: p.avg_issues, partial: p.in_progress }))}
          />
        </div>
      )}
    </section>
  );
}
