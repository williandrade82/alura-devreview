import { FormEvent, useEffect, useState } from "react";
import { GitPullRequest } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearAuthMessages,
  fetchTeams,
  requestPasswordReset,
  signIn,
  signUp,
} from "@/store/slices/authSlice";


export function LoginPage() {
  const dispatch = useAppDispatch();
  const { submitting, error, teams, signUpDone, resetEmailSent, linkError } =
    useAppSelector((s) => s.auth);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamId, setTeamId] = useState("");

  const isSignUp = mode === "signup";
  const isForgot = mode === "forgot";

  useEffect(() => {
    if (isSignUp && teams.length === 0) dispatch(fetchTeams());
  }, [dispatch, isSignUp, teams.length]);

  function switchMode(next: "signin" | "signup" | "forgot") {
    dispatch(clearAuthMessages());
    setMode(next);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (isForgot) {
      dispatch(requestPasswordReset(trimmed));
    } else if (isSignUp) {
      if (!teamId) return;
      dispatch(signUp({ email: trimmed, password, teamId }));
    } else {
      dispatch(signIn({ email: trimmed, password }));
    }
  }

  const canSubmit =
    !submitting && (!isSignUp || (teamId !== "" && password.length >= MIN_PASSWORD_LENGTH));

  return (
    <div className="flex h-screen items-center justify-center bg-gray-950 p-4 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-gray-800 bg-gray-900 p-6"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <GitPullRequest className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-semibold tracking-tight">
            DevReview
          </span>
        </div>

        {resetEmailSent ? (
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              Se existir uma conta para <strong>{email.trim()}</strong>, você
              receberá um e-mail com o link para redefinir a senha.
            </p>
            <p className="text-xs text-gray-500">
              Confira também a caixa de spam. O link expira em pouco tempo.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode("signin")}
            >
              Voltar ao login
            </Button>
          </div>
        ) : signUpDone ? (
          <div className="space-y-3 text-sm text-gray-300">
            <p>Cadastro enviado! Confirme seu e-mail para ativar a conta.</p>
            <p>
              Depois, o acesso ao time depende da aprovação de um líder.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode("signin")}
            >
              Voltar ao login
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-sm font-medium text-gray-300">
              {isForgot
                ? "Recuperar senha"
                : isSignUp
                  ? "Criar conta"
                  : "Entrar"}
            </h1>

            {linkError && !isForgot && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {linkError}
              </p>
            )}

            {isForgot && (
              <p className="text-sm text-gray-400">
                Informe o e-mail da sua conta para receber o link de
                redefinição.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-gray-300">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-gray-700 bg-gray-800 text-white"
              />
            </div>

            {!isForgot && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-300">
                  Senha
                </Label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-gray-700 bg-gray-800 text-white"
              />
              {isSignUp && (
                <p className="text-xs text-gray-500">
                  Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
                </p>
              )}
            </div>
            )}

            {isSignUp && (
              <div className="space-y-1.5">
                <Label className="text-gray-300">Seu time</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger className="border-gray-700 bg-gray-800 text-white">
                    <SelectValue placeholder="Selecione o time" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-900">
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Um líder do time precisa aprovar seu acesso.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-indigo-600 hover:bg-indigo-500"
            >
              {isForgot
                ? submitting
                  ? "Enviando..."
                  : "Enviar link de recuperação"
                : submitting
                  ? isSignUp
                    ? "Cadastrando..."
                    : "Entrando..."
                  : isSignUp
                    ? "Cadastrar"
                    : "Entrar"}
            </Button>

            <button
              type="button"
              onClick={() => switchMode(isSignUp || isForgot ? "signin" : "signup")}
              className="w-full text-center text-sm text-indigo-400 hover:text-indigo-300"
            >
              {isForgot
                ? "Voltar ao login"
                : isSignUp
                  ? "Já tenho conta — entrar"
                  : "Não tenho conta — cadastrar"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
