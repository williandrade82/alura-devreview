import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { getSupabase } from "@/lib/supabase";
import { Team, TeamMember, TeamRole } from "@/types";
import { createTeam, renameTeam } from "./teamsSlice";

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "recovery"
  | "pending-approval"
  | "no-membership"
  | "ready";

/** Chave do nome de exibição em user_metadata do Supabase Auth. */
const NAME_METADATA_KEY = "full_name";

/** Nome de exibição guardado no metadata do usuário (`null` se não definiu). */
function readName(user: { user_metadata?: Record<string, unknown> }): string | null {
  const value = user.user_metadata?.[NAME_METADATA_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

interface Membership {
  email: string;
  name: string | null;
  isAdmin: boolean;
  /** Papel do usuário em cada time onde ele está aprovado. */
  memberships: Record<string, TeamRole>;
  /** Todos os times (a lista é pública; serve ao seletor e ao cadastro). */
  teams: Team[];
  hasPending: boolean;
}

/**
 * Carrega o perfil do usuário logado: se é administrador, em quais times está
 * aprovado e com qual papel. O RLS só devolve as linhas do próprio usuário.
 */
async function loadMembership(
  userId: string,
  email: string,
  name: string | null
): Promise<Membership> {
  const supabase = getSupabase();
  const [members, admin, teams] = await Promise.all([
    supabase
      .from("team_members")
      .select("team_id, role, status")
      .eq("user_id", userId),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId),
    supabase.from("teams").select("id, name").order("name"),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (admin.error) throw new Error(admin.error.message);
  if (teams.error) throw new Error(teams.error.message);

  const rows = (members.data ?? []) as Pick<
    TeamMember,
    "team_id" | "role" | "status"
  >[];
  const memberships: Record<string, TeamRole> = {};
  for (const row of rows) {
    if (row.status === "approved") memberships[row.team_id] = row.role;
  }
  return {
    email,
    name,
    isAdmin: (admin.data ?? []).length > 0,
    memberships,
    teams: (teams.data ?? []) as Team[],
    hasPending:
      Object.keys(memberships).length === 0 &&
      rows.some((r) => r.status === "pending"),
  };
}

/** Restaura a sessão salva e carrega o time e o papel do usuário. */
export const restoreSession = createAsyncThunk(
  "auth/restoreSession",
  async (): Promise<Membership | null> => {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw new Error(error.message);
    const user = data.session?.user;
    if (!user) return null;
    return loadMembership(user.id, user.email ?? "", readName(user));
  }
);

/** Entra com e-mail e senha e carrega o time e o papel do usuário. */
export const signIn = createAsyncThunk(
  "auth/signIn",
  async ({ email, password }: { email: string; password: string }) => {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return loadMembership(data.user.id, data.user.email ?? email, readName(data.user));
  }
);

/** Lista os times (id e nome) para a escolha na tela de cadastro. */
export const fetchTeams = createAsyncThunk("auth/fetchTeams", async () => {
  const { data, error } = await getSupabase()
    .from("teams")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return data as Team[];
});

/** Cadastra o usuário; o time escolhido vira um pedido pendente de aprovação por um líder. */
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
    return { membership: await loadMembership(data.user.id, email, readName(data.user)) };
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
    return loadMembership(data.user.id, data.user.email ?? "", readName(data.user));
  }
);

/**
 * Define o nome de exibição do usuário logado (vazio remove o nome).
 * Fica no metadata do Supabase Auth; o e-mail continua sendo o identificador.
 */
export const updateProfileName = createAsyncThunk(
  "auth/updateProfileName",
  async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    const { data, error } = await getSupabase().auth.updateUser({
      data: { [NAME_METADATA_KEY]: trimmed },
    });
    if (error) throw new Error(error.message);
    return readName(data.user);
  }
);

/**
 * Troca a senha do usuário logado. Confirma a senha atual antes, para que uma
 * sessão esquecida aberta não baste para trocar a senha.
 */
export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }) => {
    const supabase = getSupabase();
    const { data: current, error: userError } = await supabase.auth.getUser();
    if (userError || !current.user?.email) {
      throw new Error("Sessão expirada. Entre novamente.");
    }
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: current.user.email,
      password: currentPassword,
    });
    if (verifyError) throw new Error("A senha atual está incorreta.");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    // Encerra as outras sessões (outros dispositivos e abas); a atual continua ativa.
    // A senha já foi trocada: uma falha aqui não deve fazer a troca parecer ter falhado.
    await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
  }
);

export const signOut = createAsyncThunk("auth/signOut", async () => {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(error.message);
});

interface AuthState {
  status: AuthStatus;
  email: string | null;
  /** Nome de exibição (`null` enquanto o usuário não definir um). */
  name: string | null;
  teamId: string | null;
  /** Papel do usuário no time ativo (`null` para um admin fora do time). */
  role: TeamRole | null;
  isAdmin: boolean;
  /** Papel do usuário em cada time onde está aprovado. */
  memberships: Record<string, TeamRole>;
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
  name: null,
  teamId: null,
  role: null,
  isAdmin: false,
  memberships: {},
  teams: [],
  submitting: false,
  error: null,
  signUpDone: false,
  resetEmailSent: false,
  linkError: null,
};

function sortTeams(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function applyMembership(state: AuthState, m: Membership | null) {
  if (!m) {
    Object.assign(state, {
      status: "unauthenticated",
      email: null,
      name: null,
      teamId: null,
      role: null,
      isAdmin: false,
      memberships: {},
    });
    return;
  }
  state.email = m.email;
  state.name = m.name;
  state.isAdmin = m.isAdmin;
  state.memberships = m.memberships;
  state.teams = m.teams;

  // Mantém o time ativo se o usuário ainda tem acesso a ele; senão escolhe
  // o primeiro time dele (o admin, sem time, cai no primeiro da lista).
  const teamIds = Object.keys(m.memberships);
  const canAccess = (id: string | null) =>
    id !== null && (m.isAdmin ? m.teams.some((t) => t.id === id) : id in m.memberships);
  state.teamId = canAccess(state.teamId)
    ? state.teamId
    : (teamIds[0] ?? (m.isAdmin ? (m.teams[0]?.id ?? null) : null));
  state.role = state.teamId ? (m.memberships[state.teamId] ?? null) : null;

  state.status =
    state.teamId || m.isAdmin
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
    /** Troca o time em que o usuário está trabalhando (admin ou multi-time). */
    setActiveTeam(state, action: PayloadAction<string>) {
      const id = action.payload;
      const allowed = state.isAdmin
        ? state.teams.some((t) => t.id === id)
        : id in state.memberships;
      if (!allowed) return;
      state.teamId = id;
      state.role = state.memberships[id] ?? null;
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
      .addCase(updateProfileName.fulfilled, (state, action) => {
        state.name = action.payload;
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
      .addCase(createTeam.fulfilled, (state, action) => {
        state.teams = sortTeams([...state.teams, action.payload]);
        // Primeiro time criado por um admin sem time: já o torna o ativo.
        if (!state.teamId) state.teamId = action.payload.id;
      })
      .addCase(renameTeam.fulfilled, (state, action) => {
        state.teams = sortTeams(
          state.teams.map((t) =>
            t.id === action.payload.id ? action.payload : t
          )
        );
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

export const {
  sessionEnded,
  setActiveTeam,
  clearAuthMessages,
  recoveryStarted,
  linkFailed,
} =
  authSlice.actions;
export default authSlice.reducer;
