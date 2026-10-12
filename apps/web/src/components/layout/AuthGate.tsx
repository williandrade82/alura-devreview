import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { restoreSession, signOut } from "@/store/slices/authSlice";

// Telas de auth carregadas sob demanda: usuário já logado não baixa esse código.
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  }))
);

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

  useAuthBootstrap();

  if (!isSupabaseConfigured) {
    // Mantém a mensagem de configuração já exibida pelo app.
    return <>{children}</>;
  }

  if (status === "loading") {
    return <FullScreenMessage>Carregando...</FullScreenMessage>;
  }

  if (status === "recovery" || status === "unauthenticated") {
    return (
      <Suspense fallback={<FullScreenMessage>Carregando...</FullScreenMessage>}>
        {status === "recovery" ? <ResetPasswordPage /> : <LoginPage />}
      </Suspense>
    );
  }

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
