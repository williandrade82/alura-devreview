import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { MemberStatus, TeamMember, TeamRole } from "@/types";

const COLUMNS = "team_id, user_id, email, role, status";

/** Carrega os vínculos do time, incluindo pedidos pendentes (só líderes veem os de outros). */
export const fetchMembers = createAsyncThunk(
  "members/fetchMembers",
  async (teamId: string) => {
    const { data, error } = await getSupabase()
      .from("team_members")
      .select(COLUMNS)
      .eq("team_id", teamId)
      .order("email");
    if (error) throw new Error(error.message);
    return data as TeamMember[];
  }
);

/** Aprova um pedido ou altera o papel de um membro. */
export const updateMember = createAsyncThunk(
  "members/updateMember",
  async ({
    teamId,
    userId,
    changes,
  }: {
    teamId: string;
    userId: string;
    changes: { role?: TeamRole; status?: MemberStatus };
  }) => {
    const { data, error } = await getSupabase()
      .from("team_members")
      .update(changes)
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as TeamMember;
  }
);

/**
 * Associa um usuário que já tem conta ao time, já aprovado (só administradores).
 * Se ele tinha um pedido pendente, o pedido é aprovado.
 */
export const addMember = createAsyncThunk(
  "members/addMember",
  async (
    { teamId, email, role }: { teamId: string; email: string; role: TeamRole },
    { dispatch }
  ) => {
    const { error } = await getSupabase().rpc("admin_add_member", {
      p_team_id: teamId,
      p_email: email,
      p_role: role,
    });
    if (error) throw new Error(error.message);
    await dispatch(fetchMembers(teamId));
  }
);

/** Recusa um pedido ou remove um membro do time. */
export const removeMember = createAsyncThunk(
  "members/removeMember",
  async ({ teamId, userId }: { teamId: string; userId: string }) => {
    const { error } = await getSupabase()
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return userId;
  }
);

interface MembersState {
  items: TeamMember[];
  loading: boolean;
  busy: boolean;
  error: string | null;
}

const initialState: MembersState = {
  items: [],
  loading: false,
  busy: false,
  error: null,
};

const membersSlice = createSlice({
  name: "members",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMembers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMembers.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchMembers.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message ?? "Não foi possível carregar os membros.";
      })
      .addCase(updateMember.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(updateMember.fulfilled, (state, action) => {
        state.busy = false;
        state.items = state.items.map((m) =>
          m.user_id === action.payload.user_id ? action.payload : m
        );
      })
      .addCase(updateMember.rejected, (state, action) => {
        state.busy = false;
        state.error =
          action.error.message ?? "Não foi possível atualizar o membro.";
      })
      .addCase(addMember.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(addMember.fulfilled, (state) => {
        state.busy = false;
      })
      .addCase(addMember.rejected, (state, action) => {
        state.busy = false;
        state.error =
          action.error.message ?? "Não foi possível adicionar o membro.";
      })
      .addCase(removeMember.pending, (state) => {
        state.busy = true;
        state.error = null;
      })
      .addCase(removeMember.fulfilled, (state, action) => {
        state.busy = false;
        state.items = state.items.filter((m) => m.user_id !== action.payload);
      })
      .addCase(removeMember.rejected, (state, action) => {
        state.busy = false;
        state.error =
          action.error.message ?? "Não foi possível remover o membro.";
      });
  },
});

export default membersSlice.reducer;
