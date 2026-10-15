"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Página de "nueva contraseña". Se llega aquí desde el enlace del correo de
 * recuperación: el enlace pasa primero por /auth/callback (que canjea el código
 * y deja la sesión en cookies) y luego redirige aquí. Con esa sesión abierta,
 * supabase.auth.updateUser({ password }) guarda la contraseña nueva.
 *
 * Si no hay sesión (enlace vencido, o abierto en otro navegador/dispositivo
 * distinto al que pidió el cambio), se muestra un aviso para pedir otro enlace.
 */
type Estado = "verificando" | "sin-sesion" | "listo" | "guardando" | "ok";

export function RestablecerClient() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setEstado(data.session ? "listo" : "sin-sesion");
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setErrorMsg("Las dos contraseñas no coinciden.");
      return;
    }

    setEstado("guardando");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setEstado("ok");
      // Ya quedó con sesión abierta; lo llevamos al inicio.
      setTimeout(() => {
        window.location.href = "/";
      }, 1600);
    } catch {
      setEstado("listo");
      setErrorMsg(
        "No se pudo guardar. El enlace pudo vencer; vuelve a pedir uno desde “¿Olvidaste tu contraseña?”.",
      );
    }
  }

  if (estado === "verificando") {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-5 text-center text-cacao-soft">
        Verificando el enlace…
      </div>
    );
  }

  if (estado === "sin-sesion") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-2">
          <h2 className="font-cinzel text-lg font-bold text-cacao">
            Enlace no válido o vencido
          </h2>
          <p className="text-sm text-cacao-soft">
            Este enlace ya venció o se abrió en un navegador distinto al que pidió
            el cambio. Pide uno nuevo y ábrelo en el mismo dispositivo.
          </p>
        </div>
        <div className="text-center">
          <Link
            href="/login"
            className="text-sm font-semibold text-terracotta hover:text-terracotta-deep"
          >
            ← Volver al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  if (estado === "ok") {
    return (
      <div className="rounded-2xl bg-[#E7F2EA] ring-1 ring-[#BFE0CB] p-5 text-center text-sm text-[#2F7A49]">
        ✓ ¡Listo! Tu contraseña quedó guardada. Entrando…
      </div>
    );
  }

  const guardando = estado === "guardando";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
    >
      <label className="block">
        <span className="text-sm font-semibold text-cacao">Nueva contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          placeholder="Crea tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
        />
        <span className="mt-1 block text-xs text-cacao-mute">
          Mínimo 6 caracteres. Anótala en un lugar seguro.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-cacao">
          Repite la contraseña
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          placeholder="Escríbela otra vez"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
        />
      </label>

      <button
        type="submit"
        disabled={guardando}
        className="w-full rounded-xl bg-terracotta text-white py-3 text-base font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
      >
        {guardando ? "Guardando..." : "Guardar contraseña"}
      </button>

      {errorMsg && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {errorMsg}
        </div>
      )}
    </form>
  );
}
