import { useEffect } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAppDispatch } from "@/store/hooks";
import {
  linkFailed,
  recoveryStarted,
  restoreSession,
  sessionEnded,
} from "@/store/slices/authSlice";

/**
 * Link de e-mail inválido ou expirado chega na URL como
 * `#error=...&error_code=...&error_description=...`.
 * Devolve a mensagem para exibir, ou `null` se a URL não tem erro.
 */
function readLinkError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("error")) return null;
  return params.get("error_code") === "otp_expired"
    ? "O link expirou ou já foi usado. Solicite um novo."
    : (params.get("error_description") ?? "Link inválido.");
}

/**
 * Inicializa a autenticação: restaura a sessão, trata erro de link de e-mail
 * e acompanha eventos do Supabase Auth (logout em outra aba, recuperação de senha).
 */
export function useAuthBootstrap(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const linkError = readLinkError(window.location.hash);
    if (linkError) {
      dispatch(linkFailed(linkError));
      window.history.replaceState(null, "", window.location.pathname);
    }

    dispatch(restoreSession());
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") dispatch(sessionEnded());
      if (event === "PASSWORD_RECOVERY") dispatch(recoveryStarted());
    });
    return () => data.subscription.unsubscribe();
  }, [dispatch]);
}
