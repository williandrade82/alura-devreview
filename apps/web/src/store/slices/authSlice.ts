import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { Team, TeamMember, TeamRole } from "@/types";

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "recovery"
  | "pending-approval"
  | "no-membership"
  | "ready";

interface Membership {
  email: string;
  teamId: string | null;
  role: TeamRole | null;
  hasPending: boolean;
}

/** Busca o time/papel do usuário logado. O RLS só devolve as linhas dele. */
async function loadMembership(
  userId: string,
  email: string
): Promise<Membership> {
  const { data, error } = await getSupabase()
    .from("team_members")
    .select("team_id, role, status")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Pick<TeamMember, "team_id" | "role" | "status">[];
  // Prefere um vínculo aprovado; senão mostra que há pedido pendente.
  const approved = rows.find((r) => r.status === "approved");
  const pending = rows.find((r) => r.status === "pending");
  return {
    email,
    teamId: approved?.team_id ?? null,
    role: approved?.role ?? null,
    hasPending: !approved && Boolean(pending),
  };
}

export const restoreSession = createAsyncThunk(
  "auth/restoreSession",
  async (): Promise<Membership | null> => {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw new Error(error.message);
    const user = data.session?.user;
    if (!user) return null;
    return loadMembership(user.id, user.email ?? "");
  }
);

export const signIn = createAsyncThunk(
  "auth/signIn",
  async ({ email, password }: { email: string; password: string }) => {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return loadMembership(data.user.id, data.user.email ?? email);
  }
);

export const fetchTeams = createAsyncThunk("auth/fetchTeams", async () => {
  const { data, error } = await getSupabase()
    .from("teams")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return data as Team[];
});

export const signUp = createAsyncThunk(
  "auth/signUp",
  async ({
    email,
    password,
    teamId,
  }: {
    email: string;
    password: string;
    teamId: string;
  }): Promise<{ membership: Membership | null }> => {
    // O trigger em auth.users cria o vínculo pendente a partir do team_id.
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: { team_id: teamId } },
    });
    if (error) throw new Error(error.message);
    // Sem sessão = confirmação de e-mail pendente.
    if (!data.session || !data.user) return { membership: null };
    return { membership: await loadMembership(data.user.id, email) };
  }
);

/**
 * Passo 1 do "esqueci minha senha": envia o e-mail com o link de recuperação.
 * O link volta para a própria origem do app e dispara PASSWORD_RECOVERY.
 */
export const requestPasswordReset = createAsyncThunk(
  "auth/requestPasswordReset",
  async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
  }
);

/** Passo 3: grava a nova senha usando a sessão temporária do link. */
export const updatePassword = createAsyncThunk(
  "auth/updatePassword",
  async (password: string) => {
    const { data, error } = await getSupabase().auth.updateUser({ password });
    if (error) throw new Error(error.message);
    return loadMembership(data.user.id, data.user.email ?? "");
  }
);

export const signOut = createAsyncThunk("auth/signOut", async () => {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(error.message);
});

interface AuthState {
  status: AuthStatus;
  email: string | null;
  teamId: string | null;
  role: TeamRole | null;
  teams: Team[];
  submitting: boolean;
  error: string | null;
  /** Cadastro enviado, aguardando confirmação de e-mail. */
  signUpDone: boolean;
  /** E-mail de recuperação solicitado. */
  resetEmailSent: boolean;
  /** Link de recuperação inválido ou expirado. */
  linkError: string | null;
}

const initialState: AuthState = {
  status: "loading",
  email: null,
  teamId: null,
  role: null,
  teams: [],
  submitting: false,
  error: null,
  signUpDone: false,
  resetEmailSent: false,
  linkError: null,
};

function applyMembership(state: AuthState, m: Membership | null) {
  if (!m) {
    Object.assign(state, {
      status: "unauthenticated",
      email: null,
      teamId: null,
      role: null,
    });
    return;
  }
  state.email = m.email;
  state.teamId = m.teamId;
  state.role = m.role;
  state.status = m.teamId
    ? "ready"
    : m.hasPending
      ? "pending-approval"
      : "no-membership";
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /** Sessão encerrada fora do app (outra aba, token expirado). */
    sessionEnded(state) {
      applyMembership(state, null);
    },
    clearAuthMessages(state) {
      state.error = null;
      state.signUpDone = false;
      state.resetEmailSent = false;
      state.linkError = null;
    },
    /** O usuário abriu o link do e-mail de recuperação (PASSWORD_RECOVERY). */
    recoveryStarted(state) {
      state.status = "recovery";
      state.error = null;
      state.linkError = null;
    },
    /** O link do e-mail veio com erro (expirado, já usado...). */
    linkFailed(state, action: PayloadAction<string>) {
      state.linkError = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.fulfilled, (state, action) => {
        // A sessão do link de recuperação não pode "logar" o usuário sem nova senha.
        if (state.status === "recovery") return;
        applyMembership(state, action.payload);
      })
      .addCase(requestPasswordReset.pending, (state) => {
        state.submitting = true;
        state.error = null;
        state.resetEmailSent = false;
      })
      .addCase(requestPasswordReset.fulfilled, (state) => {
        state.submitting = false;
        state.resetEmailSent = true;
      })
      .addCase(requestPasswordReset.rejected, (state, action) => {
        state.submitting = false;
        state.error =
          action.error.message ?? "Não foi possível enviar o e-mail.";
      })
      .addCase(updatePassword.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(updatePassword.fulfilled, (state, action) => {
        state.submitting = false;
        applyMembership(state, action.payload);
      })
      .addCase(updatePassword.rejected, (state, action) => {
        state.submitting = false;
        state.error =
          action.error.message ?? "Não foi possível alterar a senha.";
      })
      .addCase(restoreSession.rejected, (state, action) => {
        state.status = "unauthenticated";
        state.error = action.error.message ?? "Falha ao restaurar a sessão.";
      })
      .addCase(signIn.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.submitting = false;
        applyMembership(state, action.payload);
      })
      .addCase(signIn.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.error.message ?? "Não foi possível entrar.";
      })
      .addCase(fetchTeams.fulfilled, (state, action) => {
        state.teams = action.payload;
      })
      .addCase(signUp.pending, (state) => {
        state.submitting = true;
        state.error = null;
        state.signUpDone = false;
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.submitting = false;
        if (action.payload.membership) {
          applyMembership(state, action.payload.membership);
        } else {
          state.signUpDone = true;
        }
      })
      .addCase(signUp.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.error.message ?? "Não foi possível cadastrar.";
      })
      .addCase(signOut.fulfilled, (state) => {
        state.error = null;
        applyMembership(state, null);
      })
      .addCase(signOut.rejected, (state, action) => {
        state.error = action.error.message ?? "Não foi possível sair.";
      });
  },
});

export const { sessionEnded, clearAuthMessages, recoveryStarted, linkFailed } =
  authSlice.actions;
export default authSlice.reducer;
