import { ReferenceHoverCard } from "@/components/history/ReferenceHoverCard";
import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { useAppSelector } from "@/store/hooks";
import { ReviewFinding } from "@/types";

/**
 * Nome da regra que gerou o achado. O card (hover, foco ou clique no título para fixá-lo)
 * mostra os detalhes da regra atual: categoria, severidade, situação e texto completo.
 */
export function RuleReference({ finding }: { finding: ReviewFinding }) {
  const rule = useAppSelector((s) =>
    finding.rule_id
      ? s.rules.items.find((r) => r.id === finding.rule_id)
      : undefined
  );
  const rulesLoading = useAppSelector((s) => s.rules.loading);

  const label = rule?.rule ?? finding.rule_text;
  if (!label) return null;

  // O texto da regra pode ter sido editado depois da revisão.
  const changed = rule && finding.rule_text && rule.rule !== finding.rule_text;

  return (
    <ReferenceHoverCard
      prefix="Regra:"
      label={label}
      header={
        rule && (
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={rule.category} />
            <SeverityBadge severity={rule.severity} />
            <span
              className={
                rule.active
                  ? "text-xs text-green-400"
                  : "text-xs text-gray-500"
              }
            >
              {rule.active ? "Ativa" : "Desativada"}
            </span>
          </div>
        )
      }
    >
      {rule ? (
        <div className="space-y-3">
          <p className="text-gray-200">{rule.rule}</p>
          {changed && (
            <div className="space-y-1 border-t border-gray-800 pt-2 text-xs">
              <p className="text-amber-400">
                O texto da regra mudou desde esta revisão.
              </p>
              <p className="text-gray-500">
                Na revisão: {finding.rule_text}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <p className="text-gray-300">
            {rulesLoading
              ? "Carregando detalhes da regra..."
              : "Esta regra não está mais cadastrada no time (pode ter sido excluída)."}
          </p>
          {!rulesLoading && (
            <p className="text-gray-500">Texto na revisão: {label}</p>
          )}
        </div>
      )}
    </ReferenceHoverCard>
  );
}
