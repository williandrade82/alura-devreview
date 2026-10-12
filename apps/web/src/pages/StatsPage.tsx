import { useEffect } from "react";
import {
  Activity,
  CheckCircle2,
  GitPullRequest,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/shared/StatCard";
import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { BarList } from "@/components/stats/BarList";
import { StackedBar } from "@/components/stats/StackedBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchStats, setStatsPeriod } from "@/store/slices/statsSlice";
import {
  AUTO_APPROVE_MAX_FALSE_APPROVE_RATE,
  AUTO_APPROVE_MIN_DECIDED,
  STATS_PERIODS,
  agreementCounts,
  percent,
  readiness,
} from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/types";

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  approve: "Aprovar",
  request_changes: "Solicitar mudanças",
  comment: "Apenas comentar",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  unspecified: "Não informada",
};

function SectionTitle({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div>
      <h2 id={id} className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-0.5 text-sm text-gray-400">{description}</p>
    </div>
  );
}

function CriterionRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-400" aria-label="Atendido" />
      ) : (
        <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" aria-label="Não atendido" />
      )}
      <span className="text-gray-300">{children}</span>
    </li>
  );
}

export function StatsPage() {
  const dispatch = useAppDispatch();
  const teamId = useAppSelector((s) => s.auth.teamId);
  const { days, overview, references, calibration, loading, error } = useAppSelector((s) => s.stats);

  useEffect(() => {
    if (teamId) dispatch(fetchStats({ teamId, days }));
  }, [dispatch, teamId, days]);

  function handleRefresh() {
    if (teamId) dispatch(fetchStats({ teamId, days }));
  }

  const resolvedCount = overview ? overview.findings_by_status.resolved : 0;
  const calibrationReadiness = calibration ? readiness(calibration.matrix) : null;
  const agreement = calibration ? agreementCounts(calibration.matrix) : null;

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header
        title="Estatísticas"
        action={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => dispatch(setStatsPeriod(Number(v)))}>
              <SelectTrigger aria-label="Período" className="w-40 border-gray-700 bg-gray-900 text-sm">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="border-gray-700 bg-gray-900">
                {STATS_PERIODS.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    Últimos {p} dias
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800 hover:text-white"
              disabled={loading || !teamId}
              onClick={handleRefresh}
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {loading ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-8 p-6">
        {error && (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {!overview || !references || !calibration ? (
          !error && <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <>
            {/* 1. Visão geral */}
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

            {/* 4. Regras e ADRs */}
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
                  {overview.reviews_total === 0 && " Sem revisões no período, todas aparecem aqui."}
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
              </div>
            </section>

            {/* 6. Calibração do modelo */}
            <section className="space-y-4" aria-labelledby="stats-calibration">
              <SectionTitle
                id="stats-calibration"
                title="Calibração do modelo"
                description="A recomendação do modelo (modo sombra) contra o que os revisores humanos decidiram no GitHub."
              />
              {calibration.total === 0 ? (
                <p className="rounded-lg border border-gray-800 bg-gray-900 p-5 text-sm text-gray-400">
                  Ainda não há recomendações no período. Elas são gravadas pelo <code>record_review</code> a cada revisão;
                  o desfecho humano é preenchido pela tool <code>sync_review_outcomes</code>.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      title="Recomendações"
                      value={calibration.total}
                      icon={Sparkles}
                      iconColor="bg-indigo-500/20 text-indigo-400"
                      description="Revisões com recomendação"
                    />
                    <StatCard
                      title="Com desfecho humano"
                      value={percent(calibration.with_human_outcome, calibration.total)}
                      icon={CheckCircle2}
                      iconColor="bg-green-500/20 text-green-400"
                      description={`${calibration.with_human_outcome} de ${calibration.total} (cobertura)`}
                    />
                    <StatCard
                      title="Concordância"
                      value={agreement ? percent(agreement.agree, agreement.judged) : "—"}
                      icon={Target}
                      iconColor="bg-blue-500/20 text-blue-400"
                      description={`${agreement?.agree ?? 0} de ${agreement?.judged ?? 0} decididas`}
                    />
                    <StatCard
                      title="Falsos aprovados"
                      value={calibration.agreement.false_approve}
                      icon={TriangleAlert}
                      iconColor="bg-red-500/20 text-red-400"
                      description="Modelo aprovaria; humano pediu mudanças"
                    />
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
                    <h3 className="text-sm font-semibold text-white">Recomendação × desfecho humano</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      "Pendente" ainda não foi sincronizado com o GitHub; "Sem decisão" é PR sem aprovação nem pedido de
                      mudança.
                    </p>
                    <Table className="mt-3">
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="text-gray-400">Modelo recomendou</TableHead>
                          <TableHead className="text-right text-gray-400">Humano aprovou</TableHead>
                          <TableHead className="text-right text-gray-400">Humano pediu mudanças</TableHead>
                          <TableHead className="text-right text-gray-400">Sem decisão</TableHead>
                          <TableHead className="text-right text-gray-400">Pendente</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(Object.keys(RECOMMENDATION_LABEL) as Recommendation[]).map((rec) => {
                          const row = calibration.matrix[rec];
                          return (
                            <TableRow key={rec} className="border-gray-800 hover:bg-gray-800/40">
                              <TableCell className="font-medium text-white">{RECOMMENDATION_LABEL[rec]}</TableCell>
                              <TableCell className={cn("text-right", rec === "request_changes" && row.approved > 0 && "text-amber-400")}>
                                {row.approved}
                              </TableCell>
                              <TableCell className={cn("text-right", rec === "approve" && row.changes_requested > 0 && "text-red-400")}>
                                {row.changes_requested}
                              </TableCell>
                              <TableCell className="text-right text-gray-400">{row.none}</TableCell>
                              <TableCell className="text-right text-gray-400">{row.pending}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
                      <h3 className="text-sm font-semibold text-white">Concordância por confiança</h3>
                      <Table className="mt-3">
                        <TableHeader>
                          <TableRow className="border-gray-800 hover:bg-transparent">
                            <TableHead className="text-gray-400">Confiança</TableHead>
                            <TableHead className="text-right text-gray-400">Revisões</TableHead>
                            <TableHead className="text-right text-gray-400">Decididas</TableHead>
                            <TableHead className="text-right text-gray-400">Concordância</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calibration.by_confidence.map((c) => (
                            <TableRow key={c.confidence} className="border-gray-800 hover:bg-gray-800/40">
                              <TableCell className="text-white">
                                {CONFIDENCE_LABEL[c.confidence] ?? c.confidence}
                              </TableCell>
                              <TableCell className="text-right">{c.total}</TableCell>
                              <TableCell className="text-right">{c.with_human_outcome}</TableCell>
                              <TableCell className="text-right">{percent(c.agree, c.with_human_outcome)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {calibrationReadiness && (
                      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
                        <h3 className="text-sm font-semibold text-white">Prontidão para aprovação automática</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Indicativo: nada é aprovado automaticamente. Considera só as recomendações "aprovar" já
                          decididas por humanos.
                        </p>
                        <ul className="mt-4 space-y-2">
                          <CriterionRow ok={calibrationReadiness.enoughData}>
                            Pelo menos {AUTO_APPROVE_MIN_DECIDED} aprovações recomendadas com decisão humana (
                            {calibrationReadiness.decidedApprovals} até agora).
                          </CriterionRow>
                          <CriterionRow ok={calibrationReadiness.lowFalseApproveRate}>
                            Falsos aprovados em no máximo {AUTO_APPROVE_MAX_FALSE_APPROVE_RATE * 100}% (hoje{" "}
                            {percent(calibrationReadiness.falseApprovals, calibrationReadiness.decidedApprovals)}).
                          </CriterionRow>
                        </ul>
                        <p
                          className={cn(
                            "mt-4 text-sm font-medium",
                            calibrationReadiness.ready ? "text-green-400" : "text-gray-400"
                          )}
                        >
                          {calibrationReadiness.ready
                            ? "Critérios atendidos: vale avaliar a aprovação automática."
                            : "Ainda não atende aos critérios."}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
