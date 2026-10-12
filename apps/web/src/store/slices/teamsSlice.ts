import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { Team } from "@/types";

const UNIQUE_VIOLATION = "23505";

function teamErrorMessage(error: { code?: string; message: string }): string {
  return error.code === UNIQUE_VIOLATION
    ? "Já existe um time com esse nome."
    : error.message;
}

/** Cria um time (só administradores, garantido pelo RLS). */
export const createTeam = createAsyncThunk(
  "teams/createTeam",
  async (name: string) => {
    const { data, error } = await getSupabase()
      .from("teams")
      .insert({ name })
      .select("id, name")
      .single();
    if (error) throw new Error(teamErrorMessage(error));
    return data as Team;
  }
);

/** Renomeia um time (só administradores, garantido pelo RLS). */
export const renameTeam = createAsyncThunk(
  "teams/renameTeam",
  async ({ id, name }: { id: string; name: string }) => {
    const { data, error } = await getSupabase()
      .from("teams")
      .update({ name })
      .eq("id", id)
      .select("id, name")
      .single();
    if (error) throw new Error(teamErrorMessage(error));
    return data as Team;
  }
);

interface TeamsState {
  saving: boolean;
  error: string | null;
}

const initialState: TeamsState = { saving: false, error: null };

/**
 * Estado das operações de gestão de times. A lista de times em si fica em
 * `auth.teams`, que reage ao resultado destes thunks.
 */
const teamsSlice = createSlice({
  name: "teams",
  initialState,
  reducers: {
    clearTeamError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    for (const thunk of [createTeam, renameTeam]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.saving = true;
          state.error = null;
        })
        .addCase(thunk.fulfilled, (state) => {
          state.saving = false;
        })
        .addCase(thunk.rejected, (state, action) => {
          state.saving = false;
          state.error =
            action.error.message ?? "Não foi possível salvar o time.";
        });
    }
  },
});

export const { clearTeamError } = teamsSlice.actions;
export default teamsSlice.reducer;
