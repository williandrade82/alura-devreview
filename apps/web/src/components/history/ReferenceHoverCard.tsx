import { ReactNode, useEffect, useRef, useState } from "react";
import { Pin } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

const LINE_HEIGHT_PX = 16;

/**
 * Rolagem da roda do mouse aplicada à mão no card. O modal bloqueia a rolagem nativa de tudo que
 * está fora dele, e o card flutuante fica fora do modal. O listener é nativo e não passivo para
 * poder cancelar a rolagem nativa (sem rolar em dobro) e converte deltaMode em pixels: o Firefox
 * envia a roda em linhas (deltaY ~ 3), não em pixels.
 */
function useWheelScroll(node: HTMLElement | null) {
  useEffect(() => {
    if (!node) return;
    function onWheel(event: globalThis.WheelEvent) {
      if (!node || node.scrollHeight <= node.clientHeight) return;
      const unit =
        event.deltaMode === 1
          ? LINE_HEIGHT_PX
          : event.deltaMode === 2
            ? node.clientHeight
            : 1;
      event.preventDefault();
      node.scrollTop += event.deltaY * unit;
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [node]);
}

interface ReferenceHoverCardProps {
  /** Rótulo antes do título, ex.: "Regra:" ou "ADR:". */
  prefix: string;
  /** Título clicável (nome da regra, título do ADR). */
  label: string;
  /** Informação curta no topo do card (ex.: status do ADR), ao lado da dica de fixar. */
  header?: ReactNode;
  /** Conteúdo do card. */
  children: ReactNode;
}

/**
 * Título com card de detalhes. Passar o mouse (ou focar com o teclado) mostra o card, que some
 * ao sair; clicar/tocar no título FIXA o card, para poder rolar textos longos e selecioná-los.
 * Fixado, o card só fecha com novo clique no título, Esc ou clique fora dele.
 */
export function ReferenceHoverCard({
  prefix,
  label,
  header,
  children,
}: ReferenceHoverCardProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const titleRef = useRef<HTMLButtonElement>(null);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  useWheelScroll(card);

  function close() {
    setPinned(false);
    setOpen(false);
  }

  function togglePin() {
    if (pinned) {
      close();
    } else {
      setPinned(true);
      setOpen(true);
    }
  }

  return (
    <HoverCard
      open={open}
      onOpenChange={(next) => {
        // Fixado, sair com o mouse (ou o foco) não fecha o card.
        if (!next && pinned) return;
        setOpen(next);
      }}
      openDelay={150}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>
        <p className="text-xs text-gray-500">
          {prefix}{" "}
          <button
            ref={titleRef}
            type="button"
            aria-expanded={open}
            aria-pressed={pinned}
            onClick={togglePin}
            className="cursor-pointer text-left underline decoration-dotted underline-offset-2 hover:text-gray-300 focus-visible:text-gray-300 focus-visible:outline-none"
          >
            {label}
          </button>
        </p>
      </HoverCardTrigger>
      <HoverCardContent
        ref={setCard}
        onEscapeKeyDown={close}
        onPointerDownOutside={(event) => {
          // O clique no próprio título é tratado por togglePin.
          if (titleRef.current?.contains(event.target as Node)) return;
          close();
        }}
        className="max-h-[min(24rem,70vh)] overflow-y-auto"
      >
        {/* Topo fixo (sticky): a dica continua visível mesmo com o conteúdo rolado. */}
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 flex items-start justify-between gap-3 border-b border-gray-800 bg-gray-900 px-4 pb-2 pt-4">
          <div className="min-w-0">{header}</div>
          <p
            className="ml-auto flex flex-shrink-0 items-center gap-1 text-[11px] text-gray-500"
            title={
              pinned
                ? "Fixado. Esc, novo clique no título ou clique fora para fechar."
                : undefined
            }
          >
            <Pin className={pinned ? "h-3 w-3 text-indigo-400" : "h-3 w-3"} />
            {pinned ? "Fixado" : "Clique no título para fixar"}
          </p>
        </div>
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}
