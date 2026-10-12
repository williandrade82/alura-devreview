interface SectionTitleProps {
  /** id do título; a seção o referencia em aria-labelledby. */
  id: string;
  title: string;
  description: string;
}

/** Título e descrição de uma seção da tela de estatísticas. */
export function SectionTitle({ id, title, description }: SectionTitleProps) {
  return (
    <div>
      <h2 id={id} className="text-base font-semibold text-white">
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-gray-400">{description}</p>
    </div>
  );
}
