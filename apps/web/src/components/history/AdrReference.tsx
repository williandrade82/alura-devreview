import { useEffect, useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchAdrs } from "@/store/slices/adrsSlice";
import { AdrStatus, ReviewFinding } from "@/types";

const STATUS_LABEL: Record<AdrStatus, { label: string; className: string }> = {
  proposed: { label: "Proposta", className: "text-yellow-400" },
  accepted: { label: "Aceita", className: "text-green-400" },
  deprecated: { label: "Depreciada", className: "text-gray-400" },
};

/** Garante que os ADRs do time ativo estejam carregados (busca só se ainda não estiverem). */
export function useEnsureTeamAdrs(enabled: boolean): void {
  const dispatch = useAppDispatch();
  const teamId = useAppSelector((s) => s.auth.teamId);
  const loadedForTeam = useAppSelector((s) =>
    s.adrs.items.some((a) => a.team_id === teamId)
  );

  useEffect(() => {
    if (enabled && teamId && !loadedForTeam) dispatch(fetchAdrs(teamId));
  }, [dispatch, enabled, teamId, loadedForTeam]);
}

/**
 * ADR que embasa o achado. Ao passar o mouse, focar ou tocar/clicar mostra o ADR atual:
 * status e decisão. Se o título mudou desde a revisão ou o ADR foi excluído, o card avisa.
 */
export function AdrReference({ finding }: { finding: ReviewFinding }) {
  const adr = useAppSelector((s) =>
    finding.adr_id ? s.adrs.items.find((a) => a.id === finding.adr_id) : undefined
  );
  const adrsLoading = useAppSelector((s) => s.adrs.loading);
  // Controlado para que o toque/clique também abra o card (o hover não existe em telas de toque).
  const [open, setOpen] = useState(false);

  const label = adr?.title ?? finding.adr_title;
  if (!label) return null;

  const renamed = adr && finding.adr_title && adr.title !== finding.adr_title;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <p className="text-xs text-gray-500">
          ADR:{" "}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="cursor-help text-left underline decoration-dotted underline-offset-2 hover:text-gray-300 focus-visible:text-gray-300 focus-visible:outline-none"
          >
            {label}
          </button>
        </p>
      </HoverCardTrigger>
      <HoverCardContent>
        {adr ? (
          <div className="space-y-3">
            <span className={`text-xs ${STATUS_LABEL[adr.status].className}`}>
              {STATUS_LABEL[adr.status].label}
            </span>
            <p className="font-medium text-gray-200">{adr.title}</p>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Decisão
              </p>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-gray-300">
                {adr.decision}
              </p>
            </div>
            {renamed && (
              <div className="space-y-1 border-t border-gray-800 pt-2 text-xs">
                <p className="text-amber-400">
                  O título do ADR mudou desde esta revisão.
                </p>
                <p className="text-gray-500">Na revisão: {finding.adr_title}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <p className="text-gray-300">
              {adrsLoading
                ? "Carregando detalhes do ADR..."
                : "Este ADR não está mais cadastrado no time (pode ter sido excluído)."}
            </p>
            {!adrsLoading && (
              <p className="text-gray-500">Título na revisão: {label}</p>
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
