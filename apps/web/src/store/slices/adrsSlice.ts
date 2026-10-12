import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { Adr, AdrStatus } from "@/types";

export const fetchAdrs = createAsyncThunk(
  "adrs/fetchAdrs",
  async (teamId: string) => {
    const { data, error } = await getSupabase()
      .from("adrs")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as Adr[];
  }
);

export interface AdrInput {
  title: string;
  context: string;
  decision: string;
  status: AdrStatus;
}

export const createAdr = createAsyncThunk(
  "adrs/createAdr",
  async ({ teamId, input }: { teamId: string; input: AdrInput }) => {
    const { data, error } = await getSupabase()
      .from("adrs")
      .insert({ ...input, team_id: teamId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Adr;
  }
);

export const updateAdr = createAsyncThunk(
  "adrs/updateAdr",
  async ({ id, changes }: { id: string; changes: Partial<AdrInput> }) => {
    const { data, error } = await getSupabase()
      .from("adrs")
      .update(changes)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Adr;
  }
);

export const deleteAdr = createAsyncThunk(
  "adrs/deleteAdr",
  async (id: string) => {
    const { error } = await getSupabase().from("adrs").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return id;
  }
);

interface AdrsState {
  items: Adr[];
  fetchError: string | null;
  loading: boolean;
  statusFilter: AdrStatus | "all";
  saving: boolean;
  actionError: string | null;
}

const initialState: AdrsState = {
  items: [],
  fetchError: null,
  loading: false,
  statusFilter: "all",
  saving: false,
  actionError: null,
};

const adrsSlice = createSlice({
  name: "adrs",
  initialState,
  reducers: {
    setStatusFilter(state, action: PayloadAction<AdrStatus | "all">) {
      state.statusFilter = action.payload;
    },
    clearAdrActionError(state) {
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdrs.pending, (state) => {
        state.loading = true;
        state.fetchError = null;
      })
      .addCase(fetchAdrs.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
        state.fetchError = null;
      })
      .addCase(fetchAdrs.rejected, (state, action) => {
        state.loading = false;
        state.fetchError =
          action.error.message ?? "Não foi possível carregar as ADRs.";
      })
      .addCase(createAdr.pending, (state) => {
        state.saving = true;
        state.actionError = null;
      })
      .addCase(createAdr.fulfilled, (state, action) => {
        state.saving = false;
        state.items.unshift(action.payload);
      })
      .addCase(createAdr.rejected, (state, action) => {
        state.saving = false;
        state.actionError =
          action.error.message ?? "Não foi possível criar a ADR.";
      })
      .addCase(updateAdr.pending, (state) => {
        state.saving = true;
        state.actionError = null;
      })
      .addCase(updateAdr.fulfilled, (state, action) => {
        state.saving = false;
        state.items = state.items.map((a) =>
          a.id === action.payload.id ? action.payload : a
        );
      })
      .addCase(updateAdr.rejected, (state, action) => {
        state.saving = false;
        state.actionError =
          action.error.message ?? "Não foi possível atualizar a ADR.";
      })
      .addCase(deleteAdr.pending, (state) => {
        state.saving = true;
        state.actionError = null;
      })
      .addCase(deleteAdr.fulfilled, (state, action) => {
        state.saving = false;
        state.items = state.items.filter((a) => a.id !== action.payload);
      })
      .addCase(deleteAdr.rejected, (state, action) => {
        state.saving = false;
        state.actionError =
          action.error.message ?? "Não foi possível excluir a ADR.";
      });
  },
});

export const { setStatusFilter, clearAdrActionError } = adrsSlice.actions;
export default adrsSlice.reducer;
