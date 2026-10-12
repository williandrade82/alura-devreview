import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { CalibrationSection } from "@/components/stats/CalibrationSection";
import { EvolutionSection } from "@/components/stats/EvolutionSection";
import { OverviewSection } from "@/components/stats/OverviewSection";
import { ReferencesSection } from "@/components/stats/ReferencesSection";
import { ReposSection } from "@/components/stats/ReposSection";
import { SectionError } from "@/components/stats/SectionError";
import { ThemesSection } from "@/components/stats/ThemesSection";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchStats, setStatsPeriod } from "@/store/slices/statsSlice";
import { STATS_PERIODS } from "@/lib/stats";

/**
 * Tela de estatísticas do time no período escolhido: visão geral, evolução no tempo, temas,
 * regras e ADRs, repositórios e a calibração da recomendação do modelo. Cada seção carrega e
 * falha de forma independente.
 */
export function StatsPage() {
  const dispatch = useAppDispatch();
  const teamId = useAppSelector((s) => s.auth.teamId);
  const { days, dataDays, overview, references, calibration, timeseries, themes, repos, sectionErrors, loading, error } =
    useAppSelector((s) => s.stats);
  // Os títulos seguem o período dos dados exibidos, não o recém-selecionado (que ainda está carregando).
  const shownDays = dataDays ?? days;

  useEffect(() => {
    if (teamId) dispatch(fetchStats({ teamId, days }));
  }, [dispatch, teamId, days]);

  function handleRefresh() {
    if (teamId) dispatch(fetchStats({ teamId, days }));
  }

  const hasData = Boolean(overview || references || calibration || timeseries || themes || repos);
  const hasSectionErrors = Object.keys(sectionErrors).length > 0;

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header
        title="Estatísticas"
        action={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => dispatch(setStatsPeriod(Number(v)))}>
              <SelectTrigger aria-label="Período" className="w-40 border-gray-700 bg-gray-900 text-sm">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="border-gray-700 bg-gray-900">
                {STATS_PERIODS.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    Últimos {p} dias
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800 hover:text-white"
              disabled={loading || !teamId}
              onClick={handleRefresh}
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {loading ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-8 p-6">
        {error && (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {!hasData && !hasSectionErrors ? (
          !error && <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <>
            {overview ? (
              <OverviewSection days={shownDays} overview={overview} />
            ) : (
              <SectionError title="Visão geral" message={sectionErrors.overview} />
            )}
            {timeseries ? (
              <EvolutionSection days={shownDays} series={timeseries} />
            ) : (
              <SectionError title="Evolução no tempo" message={sectionErrors.timeseries} />
            )}
            {themes ? (
              <ThemesSection days={shownDays} themes={themes} />
            ) : (
              <SectionError title="Temas" message={sectionErrors.themes} />
            )}
            {references ? (
              <ReferencesSection references={references} reviewsTotal={overview?.reviews_total ?? 0} />
            ) : (
              <SectionError title="Regras e ADRs" message={sectionErrors.references} />
            )}
            {repos ? (
              <ReposSection days={shownDays} repos={repos} />
            ) : (
              <SectionError title="Repositórios" message={sectionErrors.repos} />
            )}
            {calibration ? (
              <CalibrationSection calibration={calibration} />
            ) : (
              <SectionError title="Calibração do modelo" message={sectionErrors.calibration} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
