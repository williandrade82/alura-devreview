import { severityConfig } from "@/components/shared/SeverityBadge";
import { cn } from "@/lib/utils";
import { ReviewKeyword } from "@/types";

/**
 * Principais assuntos analisados na revisão, em linha, do mais importante para o menos.
 * A cor segue a severidade (a mesma dos issues); o rótulo da severidade fica para leitores de tela.
 */
export function KeywordChips({ keywords }: { keywords: ReviewKeyword[] }) {
  if (keywords.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-gray-300">Assuntos analisados</h3>
      <ul className="flex flex-wrap gap-1.5">
        {keywords.map(({ id, keyword, severity }) => (
          <li
            key={id}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              severityConfig[severity].className
            )}
          >
            {keyword}
            <span className="sr-only"> ({severityConfig[severity].label})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
