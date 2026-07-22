"use client";

import { EMAIL_CONFIRMATION_PENDING_KEY } from "@/lib/auth-signup";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export default function EmailConfirmedPage() {
  const [state, setState] = useState<"confirming" | "confirmed" | "error">("confirming");
  const [message, setMessage] = useState("Confirming your email address...");

  useEffect(() => {
    let active = true;

    async function finishConfirmation() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const authError = hash.get("error_description");

      if (authError) {
        window.localStorage.removeItem(EMAIL_CONFIRMATION_PENDING_KEY);
        if (active) {
          setState("error");
          setMessage(authError.replace(/\+/g, " "));
        }
        return;
      }

      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user?.email_confirmed_at) {
        if (active) {
          setState("error");
          setMessage("This confirmation link is invalid or has expired. Request a new link from the login page.");
        }
        return;
      }

      await supabase.auth.signOut({ scope: "local" });
      window.localStorage.removeItem(EMAIL_CONFIRMATION_PENDING_KEY);
      window.history.replaceState(null, "", window.location.pathname);

      if (active) {
        setState("confirmed");
        setMessage("Email confirmed. You can close this tab and log in from your original RMI tab.");
      }
    }

    void finishConfirmation();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rmi-auth-surface mx-auto grid max-w-lg justify-items-center gap-4 p-7 text-center sm:p-9" role="status" aria-live="polite">
      {state === "confirmed" ? (
        <CheckCircle2 className="h-10 w-10 text-mint" aria-hidden="true" />
      ) : state === "error" ? (
        <XCircle className="h-10 w-10 text-ember" aria-hidden="true" />
      ) : (
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-cyan/25 border-t-cyan" aria-hidden="true" />
      )}
      <div>
        <p className="rmi-data-label text-cyan">RMI Account</p>
        <h1 className="mt-2 text-3xl font-bold">{state === "confirmed" ? "Email confirmed" : state === "error" ? "Confirmation failed" : "Confirming email"}</h1>
        <p className="mt-3 text-sm leading-6 text-paper/60">{message}</p>
      </div>
    </div>
  );
}
