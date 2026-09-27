"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Acceso simple por contraseña. Por debajo inicia sesión en una cuenta
 * compartida de Supabase (así se conserva la seguridad de los datos por RLS),
 * pero para el usuario es solo escribir una contraseña.
 * El correo es fijo; la contraseña la define quien crea la cuenta en Supabase.
 */
const CUENTA_ACCESO = "acceso@bolo.app";

export function LoginForm() {
  const search = useSearchParams();
  const next = search.get("next") || "/";

  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setStatus("checking");
    setErrorMsg("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: CUENTA_ACCESO,
        password,
      });
      if (error) throw error;
      // Recarga completa para que el servidor tome la sesión (cookies).
      window.location.href = next;
    } catch {
      setStatus("error");
      setErrorMsg("Contraseña incorrecta. Intenta de nuevo.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
    >
      <label className="block">
        <span className="text-sm font-semibold text-cacao">Contraseña</span>
        <input
          type="password"
          required
          autoFocus
          placeholder="Escribe la contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
        />
      </label>

      <button
        type="submit"
        disabled={status === "checking"}
        className="w-full rounded-xl bg-terracotta text-white py-3 text-base font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
      >
        {status === "checking" ? "Entrando..." : "Entrar"}
      </button>

      {errorMsg && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
