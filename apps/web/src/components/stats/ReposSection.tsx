import { SectionTitle } from "@/components/stats/SectionTitle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RepoStat, RuleCategory } from "@/types";

const CATEGORIES: { key: RuleCategory; label: string }[] = [
  { key: "style", label: "Estilo" },
  { key: "architecture", label: "Arquitetura" },
  { key: "security", label: "Segurança" },
  { key: "performance", label: "Performance" },
];

interface ReposSectionProps {
  days: number;
  repos: RepoStat[];
}

/** Repositórios do time com revisões, issues e um mapa de calor de achados por categoria. */
export function ReposSection({ days, repos }: ReposSectionProps) {
  const maxCell = Math.max(1, ...repos.flatMap((r) => CATEGORIES.map((c) => r.by_category[c.key])));

  return (
    <section className="space-y-4" aria-labelledby="stats-repos">
      <SectionTitle
        id="stats-repos"
        title="Repositórios"
        description={`Onde as revisões encontram mais problemas nos últimos ${days} dias.`}
      />
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        {repos.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma revisão no período.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400">Repositório</TableHead>
                  <TableHead className="text-right text-gray-400">Revisões</TableHead>
                  <TableHead className="text-right text-gray-400">Issues</TableHead>
                  <TableHead className="text-right text-gray-400">Média</TableHead>
                  {CATEGORIES.map((c) => (
                    <TableHead key={c.key} className="text-right text-gray-400">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {repos.map((r) => (
                  <TableRow key={r.repo} className="border-gray-800 hover:bg-gray-800/40">
                    <TableCell className="max-w-[16rem] truncate font-medium text-white" title={r.repo}>
                      {r.repo}
                    </TableCell>
                    <TableCell className="text-right">{r.reviews}</TableCell>
                    <TableCell className="text-right">{r.issues}</TableCell>
                    <TableCell className="text-right">{r.avg_issues}</TableCell>
                    {CATEGORIES.map((c) => {
                      const n = r.by_category[c.key];
                      return (
                        <TableCell
                          key={c.key}
                          className="text-right"
                          style={n > 0 ? { backgroundColor: `rgba(99, 102, 241, ${0.1 + 0.5 * (n / maxCell)})` } : undefined}
                        >
                          {n}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-gray-500">
              Issues = erros e avisos. As colunas de categoria contam todos os achados (inclusive info); quanto mais
              escura a célula, mais achados. Revisões antigas, sem achados estruturados, aparecem com zeros.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
