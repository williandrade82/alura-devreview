import { useEffect, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { SuccessBadge } from "@/components/shared/SuccessBadge";
import { AdrReference, useEnsureTeamAdrs } from "@/components/history/AdrReference";
import { RuleReference } from "@/components/history/RuleReference";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { issueSeverity } from "@/store/selectors";
import { fetchRules } from "@/store/slices/rulesSlice";
import {
  fetchFindings,
  updateFindingStatus,
} from "@/store/slices/historySlice";
import {
  FindingStatus,
  ReviewFinding,
  ReviewHistory,
  RuleSeverity,
} from "@/types";

const SEVERITY_ORDER: RuleSeverity[] = ["error", "warning", "info"];

const STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Aberto",
  resolved: "Resolvido",
  dismissed: "Dispensado",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLocation(finding: ReviewFinding): string | null {
  if (!finding.file_path) return null;
  if (finding.line_start === null) return finding.file_path;
  const lines =
    finding.line_end !== null && finding.line_end !== finding.line_start
      ? `${finding.line_start}-${finding.line_end}`
      : `${finding.line_start}`;
  return `${finding.file_path}:${lines}`;
}

function FindingCard({
  finding,
  canEdit,
}: {
  finding: ReviewFinding;
  canEdit: boolean;
}) {
  const dispatch = useAppDispatch();
  const location = formatLocation(finding);

  return (
    <li className="space-y-2 rounded-md border border-gray-800 bg-gray-800/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <CategoryBadge category={finding.category} />
        {location && (
          <code className="break-all text-xs text-gray-400">{location}</code>
        )}
        <div className="ml-auto">
          {canEdit ? (
            <Select
              value={finding.status}
              onValueChange={(status) =>
                dispatch(
                  updateFindingStatus({
                    id: finding.id,
                    status: status as FindingStatus,
                  })
                )
              }
            >
              <SelectTrigger
                aria-label="Status do achado"
                className="h-7 w-32 border-gray-700 bg-gray-900 text-xs text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-gray-700 bg-gray-900">
                {(Object.keys(STATUS_LABEL) as FindingStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-gray-500">
              {STATUS_LABEL[finding.status]}
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-200">{finding.message}</p>

      <RuleReference finding={finding} />
      <AdrReference finding={finding} />
      {finding.suggestion && (
        <p className="text-xs text-gray-400">
          <span className="font-medium text-gray-300">Sugestão:</span>{" "}
          {finding.suggestion}
        </p>
      )}
      {finding.code_snippet && (
        <pre className="overflow-x-auto rounded bg-gray-950 p-2 text-xs text-gray-300">
          {finding.code_snippet}
        </pre>
      )}
    </li>
  );
}

interface ReviewDetailsDialogProps {
  review: ReviewHistory | undefined;
  onClose: () => void;
}

/** Detalhes de uma revisão do histórico: dados do PR, resumo e achados estruturados. */
export function ReviewDetailsDialog({
  review,
  onClose,
}: ReviewDetailsDialogProps) {
  const dispatch = useAppDispatch();
  const isLeader = useAppSelector((s) => s.auth.role === "leader");
  const entry = useAppSelector((s) =>
    review ? s.history.findingsByReview[review.id] : undefined
  );
  const actionError = useAppSelector((s) => s.history.findingActionError);
  const teamId = useAppSelector((s) => s.auth.teamId);
  const rulesLoadedForTeam = useAppSelector((s) =>
    s.rules.items.some((r) => r.team_id === teamId)
  );
  const reviewId = review?.id;

  useEffect(() => {
    if (reviewId) dispatch(fetchFindings(reviewId));
  }, [dispatch, reviewId]);

  // Os detalhes da regra (hover) vêm das regras do time: só busca se ainda não estiverem carregadas.
  useEffect(() => {
    if (reviewId && teamId && !rulesLoadedForTeam) dispatch(fetchRules(teamId));
  }, [dispatch, reviewId, teamId, rulesLoadedForTeam]);

  const grouped = useMemo(
    () =>
      SEVERITY_ORDER.map((severity) => ({
        severity,
        findings: (entry?.items ?? []).filter((f) => f.severity === severity),
      })).filter((group) => group.findings.length > 0),
    [entry?.items]
  );

  const hasFindings = (entry?.items.length ?? 0) > 0;

  // Os detalhes do ADR (hover) vêm dos ADRs do time.
  useEnsureTeamAdrs(Boolean(reviewId));

  return (
    <Dialog open={Boolean(review)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-gray-800 bg-gray-900 text-white sm:max-w-2xl">
        {review && (
          <>
            <DialogHeader>
              <DialogTitle>Revisão do PR #{review.pr_number}</DialogTitle>
            </DialogHeader>

            <dl className="space-y-4 py-2 text-sm">
              {review.pr_title && (
                <div className="grid grid-cols-4 gap-2">
                  <dt className="text-gray-500">Título</dt>
                  <dd className="col-span-3 text-gray-200">{review.pr_title}</dd>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                <dt className="text-gray-500">Repositório</dt>
                <dd className="col-span-3 break-all text-gray-200">
                  {review.repo}
                </dd>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <dt className="text-gray-500">Revisado em</dt>
                <dd className="col-span-3 text-gray-200">
                  {formatDateTime(review.reviewed_at)}
                  {review.reviewer && (
                    <span className="text-gray-500"> · {review.reviewer}</span>
                  )}
                </dd>
              </div>
              {review.commit_sha && (
                <div className="grid grid-cols-4 gap-2">
                  <dt className="text-gray-500">Commit</dt>
                  <dd className="col-span-3 font-mono text-gray-200">
                    {review.commit_sha.slice(0, 7)}
                  </dd>
                </div>
              )}
              <div className="space-y-1">
                <dt className="text-gray-500">Resumo</dt>
                <dd className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-800 bg-gray-800/50 px-3 py-2 text-gray-300">
                  {review.review_summary || "Sem resumo registrado."}
                </dd>
              </div>
            </dl>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-300">Issues</h3>
                {review.issues_found === 0 ? (
                  <SuccessBadge />
                ) : (
                  <>
                    <span className="text-sm font-medium text-white">
                      {review.issues_found}
                    </span>
                    <SeverityBadge
                      severity={issueSeverity(review.issues_found)}
                    />
                  </>
                )}
              </div>

              {entry?.loading && !hasFindings && (
                <p className="text-sm text-gray-500">Carregando achados...</p>
              )}
              {entry?.error && (
                <p className="text-sm text-red-400">{entry.error}</p>
              )}
              {actionError && (
                <p className="text-sm text-red-400">{actionError}</p>
              )}

              {review.issues_found === 0 && !entry?.loading && (
                <p className="text-sm text-gray-400">
                  Revisão concluída sem problemas encontrados.
                </p>
              )}

              {review.issues_found > 0 &&
                !hasFindings &&
                entry &&
                !entry.loading &&
                !entry.error && (
                  <p className="text-sm text-gray-500">
                    Detalhamento indisponível: esta revisão foi registrada
                    antes dos achados estruturados.
                  </p>
                )}

              {grouped.map(({ severity, findings }) => (
                <div key={severity} className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {severity === "error"
                      ? "Erros"
                      : severity === "warning"
                        ? "Avisos"
                        : "Informativos (não contam como issues)"}{" "}
                    ({findings.length})
                  </p>
                  <ul className="space-y-2">
                    {findings.map((finding) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        canEdit={isLeader}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                asChild
                variant="outline"
                className="gap-2 border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800 hover:text-white"
              >
                <a href={review.pr_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Abrir PR no GitHub
                </a>
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-500"
                onClick={onClose}
              >
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
