import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { ReviewRule, RuleCategory, RuleSeverity } from "@/types";

/** Carrega as regras de review do time. */
export const fetchRules = createAsyncThunk(
  "rules/fetchRules",
  async (teamId: string) => {
    const { data, error } = await getSupabase()
      .from("review_rules")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as ReviewRule[];
  }
);

export interface RuleInput {
  rule: string;
  category: RuleCategory;
  severity: RuleSeverity;
}

/** Cria uma regra ativa no time (só líderes, garantido pelo RLS). */
export const createRule = createAsyncThunk(
  "rules/createRule",
  async ({ teamId, input }: { teamId: string; input: RuleInput }) => {
    const { data, error } = await getSupabase()
      .from("review_rules")
      .insert({ ...input, team_id: teamId, active: true })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReviewRule;
  }
);

/** Atualiza uma regra: texto, categoria, severidade ou ativação. */
export const updateRule = createAsyncThunk(
  "rules/updateRule",
  async ({
    id,
    changes,
  }: {
    id: string;
    changes: Partial<RuleInput> & { active?: boolean };
  }) => {
    const { data, error } = await getSupabase()
      .from("review_rules")
      .update(changes)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReviewRule;
  }
);

/** Exclui uma regra do time. */
export const deleteRule = createAsyncThunk(
  "rules/deleteRule",
  async (id: string) => {
    const { error } = await getSupabase()
      .from("review_rules")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return id;
  }
);

interface RulesState {
  items: ReviewRule[];
  fetchError: string | null;
  loading: boolean;
  categoryFilter: RuleCategory | "all";
  severityFilter: RuleSeverity | "all";
  isModalOpen: boolean;
  editingRuleId: string | null;
  saving: boolean;
  actionError: string | null;
}

const initialState: RulesState = {
  items: [],
  fetchError: null,
  loading: false,
  categoryFilter: "all",
  severityFilter: "all",
  isModalOpen: false,
  editingRuleId: null,
  saving: false,
  actionError: null,
};

const rulesSlice = createSlice({
  name: "rules",
  initialState,
  reducers: {
    setCategoryFilter(state, action: PayloadAction<RuleCategory | "all">) {
      state.categoryFilter = action.payload;
    },
    setSeverityFilter(state, action: PayloadAction<RuleSeverity | "all">) {
      state.severityFilter = action.payload;
    },
    openModal(state, action: PayloadAction<string | null>) {
      state.isModalOpen = true;
      state.editingRuleId = action.payload;
      state.actionError = null;
    },
    closeModal(state) {
      state.isModalOpen = false;
      state.editingRuleId = null;
      state.actionError = null;
    },
    clearActionError(state) {
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRules.pending, (state) => {
        state.loading = true;
        state.fetchError = null;
      })
      .addCase(fetchRules.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
        state.fetchError = null;
      })
      .addCase(fetchRules.rejected, (state, action) => {
        state.loading = false;
        state.fetchError =
          action.error.message ?? "Não foi possível carregar as regras.";
      })
      .addCase(createRule.pending, (state) => {
        state.saving = true;
        state.actionError = null;
      })
      .addCase(createRule.fulfilled, (state, action) => {
        state.saving = false;
        state.items.unshift(action.payload);
        state.isModalOpen = false;
        state.editingRuleId = null;
      })
      .addCase(createRule.rejected, (state, action) => {
        state.saving = false;
        state.actionError =
          action.error.message ?? "Não foi possível criar a regra.";
      })
      .addCase(updateRule.pending, (state) => {
        state.saving = true;
        state.actionError = null;
      })
      .addCase(updateRule.fulfilled, (state, action) => {
        state.saving = false;
        state.items = state.items.map((r) =>
          r.id === action.payload.id ? action.payload : r
        );
        state.isModalOpen = false;
        state.editingRuleId = null;
      })
      .addCase(updateRule.rejected, (state, action) => {
        state.saving = false;
        state.actionError =
          action.error.message ?? "Não foi possível atualizar a regra.";
      })
      .addCase(deleteRule.pending, (state) => {
        state.saving = true;
        state.actionError = null;
      })
      .addCase(deleteRule.fulfilled, (state, action) => {
        state.saving = false;
        state.items = state.items.filter((r) => r.id !== action.payload);
      })
      .addCase(deleteRule.rejected, (state, action) => {
        state.saving = false;
        state.actionError =
          action.error.message ?? "Não foi possível excluir a regra.";
      });
  },
});

export const {
  setCategoryFilter,
  setSeverityFilter,
  openModal,
  closeModal,
  clearActionError,
} = rulesSlice.actions;
export default rulesSlice.reducer;
