import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { FindingStatus, ReviewFinding, ReviewHistory, ReviewKeyword } from "@/types";

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
  "id, review_id, severity, category, rule_id, rule_text, adr_id, adr_title, file_path, line_start, line_end, message, suggestion, code_snippet, status, resolved_at";

/** Carrega os achados estruturados e as palavras-chave (principais primeiro) de uma revisão. */
export const fetchFindings = createAsyncThunk(
  "history/fetchFindings",
  async (reviewId: string) => {
    const supabase = getSupabase();
    const [findings, keywords] = await Promise.all([
      supabase
        .from("review_findings")
        .select(FINDING_COLUMNS)
        .eq("review_id", reviewId)
        .order("created_at", { ascending: true }),
      supabase
        .from("review_keywords")
        .select("id, review_id, keyword, severity, position, reviewed_at")
        .eq("review_id", reviewId)
        .order("position", { ascending: true }),
    ]);
    if (findings.error) throw new Error(findings.error.message);
    // As palavras-chave são complementares: se falharem, a revisão ainda abre sem elas.
    return {
      reviewId,
      findings: findings.data as ReviewFinding[],
      keywords: (keywords.error ? [] : keywords.data) as ReviewKeyword[],
    };
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
  /** Palavras-chave da revisão, da mais importante para a menos. */
  keywords: ReviewKeyword[];
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
          keywords: prev?.keywords ?? [],
          loading: true,
          error: null,
        };
      })
      .addCase(fetchFindings.fulfilled, (state, action) => {
        state.findingsByReview[action.payload.reviewId] = {
          items: action.payload.findings,
          keywords: action.payload.keywords,
          loading: false,
          error: null,
        };
      })
      .addCase(fetchFindings.rejected, (state, action) => {
        state.findingsByReview[action.meta.arg] = {
          items: [],
          keywords: [],
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
