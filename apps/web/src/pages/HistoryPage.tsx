import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchHistory, setRepoFilter } from "@/store/slices/historySlice";
import {
  issueSeverity,
  selectFilteredAvgIssues,
  selectFilteredHistory,
  selectFilteredTotalIssues,
} from "@/store/selectors";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function HistoryPage() {
  const dispatch = useAppDispatch();
  const repoFilter = useAppSelector((s) => s.history.repoFilter);
  const filtered = useAppSelector(selectFilteredHistory);
  const totalIssues = useAppSelector(selectFilteredTotalIssues);
  const avgIssues = useAppSelector(selectFilteredAvgIssues);

  const teamId = useAppSelector((s) => s.auth.teamId);

  useEffect(() => {
    if (teamId) dispatch(fetchHistory(teamId));
  }, [dispatch, teamId]);

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header title="Histórico de Reviews" />

      <div className="flex-1 space-y-4 p-6">
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs text-gray-400">Total de Reviews</p>
            <p className="mt-1 text-2xl font-bold text-white">
              {filtered.length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs text-gray-400">Total de Issues</p>
            <p className="mt-1 text-2xl font-bold text-white">{totalIssues}</p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <p className="text-xs text-gray-400">Média por PR</p>
            <p className="mt-1 text-2xl font-bold text-white">{avgIssues}</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <Input
            value={repoFilter}
            onChange={(e) => dispatch(setRepoFilter(e.target.value))}
            placeholder="Filtrar por repositório..."
            className="w-72 border-gray-700 bg-gray-900 text-white placeholder:text-gray-600"
          />
          <span className="ml-auto text-xs text-gray-500">
            {filtered.length} review{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-gray-800 bg-gray-900">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-400">PR</TableHead>
                <TableHead className="text-gray-400">Repositório</TableHead>
                <TableHead className="w-24 text-gray-400">Issues</TableHead>
                <TableHead className="text-gray-400">Resumo</TableHead>
                <TableHead className="w-28 text-gray-400">Data</TableHead>
                <TableHead className="w-12 text-gray-400" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((review) => (
                <TableRow
                  key={review.id}
                  className="border-gray-800 hover:bg-gray-800/50"
                >
                  <TableCell className="font-mono text-sm font-medium text-white">
                    #{review.pr_number}
                  </TableCell>
                  <TableCell className="text-sm text-gray-300">
                    {review.repo}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {review.issues_found}
                      </span>
                      <SeverityBadge severity={issueSeverity(review.issues_found)} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate text-sm text-gray-400">
                      {review.review_summary}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {formatDate(review.reviewed_at)}
                  </TableCell>
                  <TableCell>
                    <a
                      href={review.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-gray-500 hover:text-indigo-400 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow className="border-gray-800">
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-gray-500"
                  >
                    Nenhum review encontrado para este repositório.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
