import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { bucketForPeriod, DEFAULT_STATS_PERIOD } from "@/lib/stats";
import type {
  KeywordTrend,
  RecommendationStats,
  ReferenceStats,
  RepoStats,
  StatsOverview,
  TimeseriesPoint,
} from "@/types";

const MS_PER_DAY = 86_400_000;
const REFERENCE_LIMIT = 10;
const THEMES_LIMIT = 10;
const REPOS_LIMIT = 10;

/** Seções da tela de estatísticas, cada uma com a sua consulta (e o seu erro). */
export type StatsSection = "overview" | "references" | "calibration" | "timeseries" | "themes" | "repos";
export type StatsSectionErrors = Partial<Record<StatsSection, string>>;

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

/** Dado de uma seção, ou null se a consulta falhou (o erro vai para `errors`, só dessa seção). */
function pick<T>(section: StatsSection, result: RpcResult, errors: StatsSectionErrors): T | null {
  if (result.error) {
    errors[section] = result.error.message;
    return null;
  }
  return result.data as T;
}

/**
 * Carrega as seis agregações da tela de estatísticas (feitas no banco, com RLS do usuário):
 * visão geral, regras e ADRs, calibração, série temporal, temas e repositórios. Uma consulta
 * que falha afeta só a sua seção; as demais continuam disponíveis.
 */
export const fetchStats = createAsyncThunk(
  "stats/fetchStats",
  async ({ teamId, days }: { teamId: string; days: number }) => {
    const supabase = getSupabase();
    const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();
    const [overview, references, calibration, timeseries, themes, repos] = await Promise.all([
      supabase.rpc("get_team_stats_overview", { p_team_id: teamId, p_since: since }),
      supabase.rpc("get_team_reference_stats", {
        p_team_id: teamId,
        p_since: since,
        p_limit: REFERENCE_LIMIT,
      }),
      supabase.rpc("get_team_recommendation_stats", { p_team_id: teamId, p_since: since }),
      supabase.rpc("get_team_stats_timeseries", {
        p_team_id: teamId,
        p_since: since,
        p_bucket: bucketForPeriod(days),
      }),
      supabase.rpc("get_team_keyword_trends", { p_team_id: teamId, p_since: since, p_limit: THEMES_LIMIT }),
      supabase.rpc("get_team_repo_stats", { p_team_id: teamId, p_since: since, p_limit: REPOS_LIMIT }),
    ]);
    const errors: StatsSectionErrors = {};
    return {
      overview: pick<StatsOverview>("overview", overview, errors),
      references: pick<ReferenceStats>("references", references, errors),
      calibration: pick<RecommendationStats>("calibration", calibration, errors),
      timeseries: pick<TimeseriesPoint[]>("timeseries", timeseries, errors),
      themes: pick<KeywordTrend[]>("themes", themes, errors),
      repos: pick<RepoStats>("repos", repos, errors),
      errors,
    };
  }
);

interface StatsState {
  /** Time dos dados carregados: ao trocar de time, os dados do anterior são descartados. */
  teamId: string | null;
  days: number;
  overview: StatsOverview | null;
  references: ReferenceStats | null;
  calibration: RecommendationStats | null;
  timeseries: TimeseriesPoint[] | null;
  themes: KeywordTrend[] | null;
  repos: RepoStats | null;
  /** Erro de cada seção cuja consulta falhou. */
  sectionErrors: StatsSectionErrors;
  loading: boolean;
  /** Falha geral (a chamada inteira falhou, ex.: sem rede). */
  error: string | null;
  /** Só a resposta da última chamada vale (troca rápida de time ou período). */
  requestId: string | null;
}

const initialState: StatsState = {
  teamId: null,
  days: DEFAULT_STATS_PERIOD,
  overview: null,
  references: null,
  calibration: null,
  timeseries: null,
  themes: null,
  repos: null,
  sectionErrors: {},
  loading: false,
  error: null,
  requestId: null,
};

const statsSlice = createSlice({
  name: "stats",
  initialState,
  reducers: {
    setStatsPeriod(state, action: PayloadAction<number>) {
      state.days = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStats.pending, (state, action) => {
        if (state.teamId !== action.meta.arg.teamId) {
          state.teamId = action.meta.arg.teamId;
          state.overview = null;
          state.references = null;
          state.calibration = null;
          state.timeseries = null;
          state.themes = null;
          state.repos = null;
          state.sectionErrors = {};
        }
        state.loading = true;
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchStats.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        const { errors, ...data } = action.payload;
        Object.assign(state, data);
        state.sectionErrors = errors;
        state.loading = false;
      })
      .addCase(fetchStats.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.loading = false;
        state.error = action.error.message ?? "Não foi possível carregar as estatísticas.";
      });
  },
});

export const { setStatsPeriod } = statsSlice.actions;
export default statsSlice.reducer;
