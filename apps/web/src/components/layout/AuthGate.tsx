import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LoginPage } from "@/pages/LoginPage";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import {
  linkFailed,
  recoveryStarted,
  restoreSession,
  sessionEnded,
  signOut,
} from "@/store/slices/authSlice";

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-6 text-center text-sm text-gray-400">
      {children}
    </div>
  );
}

/** Só renderiza o app para usuários autenticados e vinculados a um time. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Link de e-mail inválido/expirado chega como #error=...&error_description=...
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.has("error")) {
      dispatch(
        linkFailed(
          hash.get("error_code") === "otp_expired"
            ? "O link expirou ou já foi usado. Solicite um novo."
            : hash.get("error_description") ?? "Link inválido."
        )
      );
      window.history.replaceState(null, "", window.location.pathname);
    }

    dispatch(restoreSession());
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") dispatch(sessionEnded());
      if (event === "PASSWORD_RECOVERY") dispatch(recoveryStarted());
    });
    return () => data.subscription.unsubscribe();
  }, [dispatch]);

  if (!isSupabaseConfigured) {
    // Mantém a mensagem de configuração já exibida pelo app.
    return <>{children}</>;
  }

  if (status === "loading") {
    return <FullScreenMessage>Carregando...</FullScreenMessage>;
  }

  if (status === "recovery") return <ResetPasswordPage />;

  if (status === "unauthenticated") return <LoginPage />;

  if (status === "pending-approval") {
    return (
      <FullScreenMessage>
        <p>Seu pedido de acesso foi enviado.</p>
        <p>Aguarde a aprovação de um líder do time.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => dispatch(restoreSession())}>
            Verificar novamente
          </Button>
          <Button variant="outline" onClick={() => dispatch(signOut())}>
            Sair
          </Button>
        </div>
      </FullScreenMessage>
    );
  }

  if (status === "no-membership") {
    return (
      <FullScreenMessage>
        <p>Sua conta ainda não está vinculada a nenhum time.</p>
        <p>Peça a um líder para adicionar você.</p>
        <Button variant="outline" onClick={() => dispatch(signOut())}>
          Sair
        </Button>
      </FullScreenMessage>
    );
  }

  return <>{children}</>;
}
