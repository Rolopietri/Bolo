"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailIcon } from "@/components/icons";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const errorParam = search.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState(errorParam || "");
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setErrorMsg("");
    try {
      const supabase = createSupabaseBrowserClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // Browser navigates to Google — no further code runs here.
    } catch (err) {
      setGoogleLoading(false);
      setErrorMsg(err instanceof Error ? err.message : "Error con Google");
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error enviando enlace");
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-6 text-center">
        <div className="mb-2 flex justify-center text-emerald-700">
          <MailIcon className="size-8" />
        </div>
        <h2 className="font-semibold text-stone-900">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-stone-700">
          Te enviamos un enlace mágico a <span className="font-medium">{email}</span>.
          Haz clic en el enlace y entrarás automáticamente.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
          }}
          className="mt-4 text-sm text-stone-600 underline"
        >
          Usar otro correo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 rounded-lg bg-white ring-1 ring-marfil py-2.5 font-medium text-cacao hover:bg-marfil-light disabled:opacity-50"
      >
        <GoogleIcon />
        {googleLoading ? "Conectando..." : "Entrar con Google"}
      </button>

      <div className="flex items-center gap-3 text-xs text-cacao-mute">
        <div className="flex-1 h-px bg-marfil" />
        <span className="uppercase tracking-widest">o</span>
        <div className="flex-1 h-px bg-marfil" />
      </div>

      <form
        onSubmit={handleEmail}
        className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
      >
        <label className="block">
          <span className="text-sm font-medium text-cacao">
            Enlace mágico por correo
          </span>
          <input
            type="email"
            required
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-cacao-soft"
          />
        </label>

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-lg bg-terracotta text-white py-2 font-medium hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
        >
          {status === "sending" ? "Enviando..." : "Enviar enlace"}
        </button>
      </form>

      {errorMsg && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {errorMsg}
        </div>
      )}

      <p className="text-xs text-cacao-soft text-center">
        Solo correos autorizados pueden entrar.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.93h5.5c-.24 1.42-1.69 4.18-5.5 4.18-3.31 0-6.01-2.74-6.01-6.12s2.7-6.12 6.01-6.12c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.83 3.5 14.62 2.5 12 2.5 6.99 2.5 2.95 6.54 2.95 11.55s4.04 9.05 9.05 9.05c5.22 0 8.69-3.67 8.69-8.83 0-.59-.07-1.04-.15-1.5H12z"
      />
    </svg>
  );
}
