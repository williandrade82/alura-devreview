import { CheckCircle2, Sparkles, Target, TriangleAlert } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { SectionTitle } from "@/components/stats/SectionTitle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AUTO_APPROVE_MAX_FALSE_APPROVE_RATE,
  AUTO_APPROVE_MIN_DECIDED,
  agreementCounts,
  percent,
  readiness,
} from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { Recommendation, RecommendationStats } from "@/types";

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

interface CalibrationSectionProps {
calibration: RecommendationStats;
}

/** Calibração do modelo: recomendação (modo sombra) contra a decisão humana no GitHub. */
export function CalibrationSection({ calibration }: CalibrationSectionProps) {
const calibrationReadiness = readiness(calibration.matrix);
const agreement = agreementCounts(calibration.matrix);

return (
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
              value={percent(agreement.agree, agreement.judged)}
              icon={Target}
              iconColor="bg-blue-500/20 text-blue-400"
              description={`${agreement.agree} de ${agreement.judged} decididas`}
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
                    <TableHead className="text-right text-gray-400">Decididas*</TableHead>
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
                      <TableCell className="text-right">{c.judged}</TableCell>
                      <TableCell className="text-right">{percent(c.agree, c.judged)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-gray-500">
                * Só recomendações "aprovar" e "solicitar mudanças" com decisão humana; "apenas comentar" não entra.
              </p>
            </div>

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
          </div>
        </>
      )}
    </section>
  );
}
