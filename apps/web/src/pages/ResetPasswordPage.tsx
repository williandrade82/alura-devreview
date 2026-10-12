import { FormEvent, useState } from "react";
import { GitPullRequest } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { signOut, updatePassword } from "@/store/slices/authSlice";

const MIN_PASSWORD_LENGTH = 8;

/** Passo 3 do "esqueci minha senha": o usuário chegou pelo link do e-mail. */
export function ResetPasswordPage() {
  const dispatch = useAppDispatch();
  const { submitting, error } = useAppSelector((s) => s.auth);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const tooShort = password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = !submitting && !tooShort && password === confirm;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) dispatch(updatePassword(password));
  }

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

        <h1 className="text-sm font-medium text-gray-300">Definir nova senha</h1>

        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-gray-300">
            Nova senha
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-gray-700 bg-gray-800 text-white"
          />
          <p className="text-xs text-gray-500">
            Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password" className="text-gray-300">
            Confirmar nova senha
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="border-gray-700 bg-gray-800 text-white"
          />
          {mismatch && (
            <p className="text-xs text-red-400">As senhas não coincidem.</p>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-indigo-600 hover:bg-indigo-500"
        >
          {submitting ? "Salvando..." : "Salvar nova senha"}
        </Button>

        <button
          type="button"
          onClick={() => dispatch(signOut())}
          className="w-full text-center text-sm text-gray-400 hover:text-white"
        >
          Cancelar
        </button>
      </form>
    </div>
  );
}
