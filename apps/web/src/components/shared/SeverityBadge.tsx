import { RuleSeverity } from "@/types";
import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  severity: RuleSeverity;
  className?: string;
}

/** Rótulo e cores de cada severidade (reutilizado por outros componentes, ex.: chips de palavra-chave). */
export const severityConfig: Record<RuleSeverity, { label: string; className: string }> = {
  error: {
    label: "Erro",
    className:
      "bg-red-500/20 text-red-400 border border-red-500/30",
  },
  warning: {
    label: "Aviso",
    className:
      "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  },
  info: {
    label: "Info",
    className:
      "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  },
};

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const { label, className: severityClass } = severityConfig[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        severityClass,
        className
      )}
    >
      {label}
    </span>
  );
}
