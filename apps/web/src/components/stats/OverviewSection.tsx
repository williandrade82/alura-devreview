import { Activity, CheckCircle2, GitPullRequest, ShieldAlert, Target } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { SectionTitle } from "@/components/stats/SectionTitle";
import { StackedBar } from "@/components/stats/StackedBar";
import { percent } from "@/lib/stats";
import type { StatsOverview } from "@/types";

interface OverviewSectionProps {
  days: number;
  overview: StatsOverview;
}

/** Visão geral do período: totais de revisões e achados, por severidade e por status. */
export function OverviewSection({ days, overview }: OverviewSectionProps) {
  const resolvedCount = overview.findings_by_status.resolved;

  return (
    <section className="space-y-4" aria-labelledby="stats-overview">
      <SectionTitle
        id="stats-overview"
        title="Visão geral"
        description={`Revisões e achados dos últimos ${days} dias.`}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Revisões"
          value={overview.reviews_total}
          icon={GitPullRequest}
          iconColor="bg-blue-500/20 text-blue-400"
          description="PRs revisados no período"
        />
        <StatCard
          title="Média de issues"
          value={overview.avg_issues}
          icon={Activity}
          iconColor="bg-amber-500/20 text-amber-400"
          description="Por PR (erros e avisos)"
        />
        <StatCard
          title="PRs sem problemas"
          value={percent(overview.reviews_clean, overview.reviews_total)}
          icon={CheckCircle2}
          iconColor="bg-green-500/20 text-green-400"
          description={`${overview.reviews_clean} de ${overview.reviews_total}`}
        />
        <StatCard
          title="Achados resolvidos"
          value={percent(resolvedCount, overview.findings_total)}
          icon={Target}
          iconColor="bg-purple-500/20 text-purple-400"
          description={`${resolvedCount} de ${overview.findings_total} achados`}
        />
        <StatCard
          title="Suspeitas de injeção"
          value={overview.injection_suspected}
          icon={ShieldAlert}
          iconColor="bg-red-500/20 text-red-400"
          description="PRs com tentativa de manipulação"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StackedBar
          title="Achados por severidade"
          segments={[
            { label: "Erro", value: overview.findings_by_severity.error, color: "bg-red-500" },
            { label: "Aviso", value: overview.findings_by_severity.warning, color: "bg-amber-500" },
            { label: "Info", value: overview.findings_by_severity.info, color: "bg-blue-500" },
          ]}
        />
        <StackedBar
          title="Achados por status"
          segments={[
            { label: "Abertos", value: overview.findings_by_status.open, color: "bg-gray-500" },
            { label: "Resolvidos", value: overview.findings_by_status.resolved, color: "bg-green-500" },
            { label: "Dispensados", value: overview.findings_by_status.dismissed, color: "bg-purple-500" },
          ]}
        />
      </div>
    </section>
  );
}
