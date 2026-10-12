import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_STATS_PERIOD } from "@/lib/stats";
import type { RecommendationStats, ReferenceStats, StatsOverview } from "@/types";

const MS_PER_DAY = 86_400_000;
const REFERENCE_LIMIT = 10;

/** Carrega as três agregações da tela de estatísticas (feitas no banco, com RLS do usuário). */
export const fetchStats = createAsyncThunk(
  "stats/fetchStats",
  async ({ teamId, days }: { teamId: string; days: number }) => {
    const supabase = getSupabase();
    const since = new Date(Date.now() - days * MS_PER_DAY).toISOString();
    const [overview, references, calibration] = await Promise.all([
      supabase.rpc("get_team_stats_overview", { p_team_id: teamId, p_since: since }),
      supabase.rpc("get_team_reference_stats", {
        p_team_id: teamId,
        p_since: since,
        p_limit: REFERENCE_LIMIT,
      }),
      supabase.rpc("get_team_recommendation_stats", { p_team_id: teamId, p_since: since }),
    ]);
    const failed = overview.error ?? references.error ?? calibration.error;
    if (failed) throw new Error(failed.message);
    return {
      overview: overview.data as StatsOverview,
      references: references.data as ReferenceStats,
      calibration: calibration.data as RecommendationStats,
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
  loading: boolean;
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
        }
        state.loading = true;
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchStats.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.overview = action.payload.overview;
        state.references = action.payload.references;
        state.calibration = action.payload.calibration;
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
