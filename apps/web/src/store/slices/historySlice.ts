import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { FindingStatus, ReviewFinding, ReviewHistory } from "@/types";

export const fetchHistory = createAsyncThunk(
  "history/fetchHistory",
  async (teamId: string) => {
    const { data, error } = await getSupabase()
      .from("review_history")
      .select("*")
      .eq("team_id", teamId)
      .order("reviewed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as ReviewHistory[];
  }
);

const FINDING_COLUMNS =
  "id, review_id, severity, category, rule_id, rule_text, file_path, line_start, line_end, message, suggestion, code_snippet, status, resolved_at";

/** Carrega os achados estruturados de uma revisão. */
export const fetchFindings = createAsyncThunk(
  "history/fetchFindings",
  async (reviewId: string) => {
    const { data, error } = await getSupabase()
      .from("review_findings")
      .select(FINDING_COLUMNS)
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { reviewId, findings: data as ReviewFinding[] };
  }
);

/** Marca um achado como resolvido, dispensado ou reaberto (só líderes, garantido pelo RLS). */
export const updateFindingStatus = createAsyncThunk(
  "history/updateFindingStatus",
  async ({ id, status }: { id: string; status: FindingStatus }) => {
    const { data, error } = await getSupabase()
      .from("review_findings")
      .update({ status })
      .eq("id", id)
      .select(FINDING_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as ReviewFinding;
  }
);

export interface FindingsEntry {
  items: ReviewFinding[];
  loading: boolean;
  error: string | null;
}

interface HistoryState {
  items: ReviewHistory[];
  fetchError: string | null;
  loading: boolean;
  repoFilter: string;
  findingsByReview: Record<string, FindingsEntry>;
  findingActionError: string | null;
}

const initialState: HistoryState = {
  items: [],
  fetchError: null,
  loading: false,
  repoFilter: "",
  findingsByReview: {},
  findingActionError: null,
};

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    setRepoFilter(state, action: PayloadAction<string>) {
      state.repoFilter = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHistory.pending, (state) => {
        state.loading = true;
        state.fetchError = null;
      })
      .addCase(fetchHistory.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
        state.fetchError = null;
      })
      .addCase(fetchHistory.rejected, (state, action) => {
        state.loading = false;
        state.fetchError =
          action.error.message ?? "Não foi possível carregar o histórico.";
      })
      .addCase(fetchFindings.pending, (state, action) => {
        const prev = state.findingsByReview[action.meta.arg];
        state.findingsByReview[action.meta.arg] = {
          items: prev?.items ?? [],
          loading: true,
          error: null,
        };
      })
      .addCase(fetchFindings.fulfilled, (state, action) => {
        state.findingsByReview[action.payload.reviewId] = {
          items: action.payload.findings,
          loading: false,
          error: null,
        };
      })
      .addCase(fetchFindings.rejected, (state, action) => {
        state.findingsByReview[action.meta.arg] = {
          items: [],
          loading: false,
          error:
            action.error.message ?? "Não foi possível carregar os achados.",
        };
      })
      .addCase(updateFindingStatus.pending, (state) => {
        state.findingActionError = null;
      })
      .addCase(updateFindingStatus.fulfilled, (state, action) => {
        const entry = state.findingsByReview[action.payload.review_id];
        if (entry) {
          entry.items = entry.items.map((f) =>
            f.id === action.payload.id ? action.payload : f
          );
        }
      })
      .addCase(updateFindingStatus.rejected, (state, action) => {
        state.findingActionError =
          action.error.message ?? "Não foi possível atualizar o achado.";
      });
  },
});

export const { setRepoFilter } = historySlice.actions;
export default historySlice.reducer;
