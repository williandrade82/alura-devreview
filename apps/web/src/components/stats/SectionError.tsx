interface SectionErrorProps {
  title: string;
  message?: string;
}

/** Aviso no lugar de uma seção cuja consulta falhou, sem derrubar as demais seções da tela. */
export function SectionError({ title, message }: SectionErrorProps) {
  return (
    <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      Não foi possível carregar "{title}"{message ? `: ${message}` : "."}
    </p>
  );
}
