import { CheckCircle2 } from "lucide-react";

/** Revisão concluída sem nenhum problema encontrado. */
export function SuccessBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
      <CheckCircle2 className="h-3 w-3" />
      Sucesso
    </span>
  );
}
