import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MIN_PASSWORD_LENGTH, PROFILE_NAME_MAX_LENGTH } from "@/lib/limits";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { changePassword, updateProfileName } from "@/store/slices/authSlice";

type Feedback = { kind: "success" | "error"; text: string } | null;

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      className={
        feedback.kind === "error"
          ? "text-sm text-red-400"
          : "text-sm text-green-400"
      }
    >
      {feedback.text}
    </p>
  );
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function NameForm() {
  const dispatch = useAppDispatch();
  const currentName = useAppSelector((s) => s.auth.name);
  const [name, setName] = useState(currentName ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const unchanged = name.trim() === (currentName ?? "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || unchanged) return;
    setSaving(true);
    setFeedback(null);
    try {
      await dispatch(updateProfileName(name)).unwrap();
      setFeedback({ kind: "success", text: "Nome atualizado." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: errorText(error, "Não foi possível salvar o nome."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name" className="text-gray-300">
          Nome
        </Label>
        <Input
          id="profile-name"
          autoComplete="name"
          maxLength={PROFILE_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como você quer ser chamado"
          className="border-gray-700 bg-gray-800 text-white"
        />
        <p className="text-xs text-gray-500">
          Aparece no menu no lugar do e-mail. Deixe em branco para voltar a
          mostrar o e-mail.
        </p>
      </div>
      <FeedbackMessage feedback={feedback} />
      <Button
        type="submit"
        disabled={saving || unchanged}
        className="bg-indigo-600 hover:bg-indigo-500"
      >
        {saving ? "Salvando..." : "Salvar nome"}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const dispatch = useAppDispatch();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const tooShort = newPassword.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const same = newPassword.length > 0 && newPassword === currentPassword;
  const canSubmit =
    !saving &&
    currentPassword.length > 0 &&
    !tooShort &&
    !same &&
    newPassword === confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setFeedback(null);
    try {
      await dispatch(changePassword({ currentPassword, newPassword })).unwrap();
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setFeedback({ kind: "success", text: "Senha alterada." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: errorText(error, "Não foi possível alterar a senha."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-medium text-gray-300">Trocar senha</h3>
      <div className="space-y-1.5">
        <Label htmlFor="current-password" className="text-gray-300">
          Senha atual
        </Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="border-gray-700 bg-gray-800 text-white"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password" className="text-gray-300">
          Nova senha
        </Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="border-gray-700 bg-gray-800 text-white"
        />
        <p className="text-xs text-gray-500">
          Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
        </p>
        {same && (
          <p className="text-xs text-red-400">
            A nova senha deve ser diferente da atual.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password" className="text-gray-300">
          Confirmar nova senha
        </Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="border-gray-700 bg-gray-800 text-white"
        />
        {mismatch && (
          <p className="text-xs text-red-400">As senhas não coincidem.</p>
        )}
      </div>
      <FeedbackMessage feedback={feedback} />
      <Button
        type="submit"
        disabled={!canSubmit}
        className="bg-indigo-600 hover:bg-indigo-500"
      >
        {saving ? "Alterando..." : "Alterar senha"}
      </Button>
    </form>
  );
}

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Perfil do usuário logado: e-mail (somente leitura), nome de exibição e troca de senha. */
export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const email = useAppSelector((s) => s.auth.email);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-gray-800 bg-gray-900 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription className="break-all text-gray-400">
            {email}
          </DialogDescription>
        </DialogHeader>
        <NameForm />
        <Separator className="bg-gray-800" />
        <PasswordForm />
      </DialogContent>
    </Dialog>
  );
}
