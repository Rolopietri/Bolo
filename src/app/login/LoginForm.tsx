"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Acceso con cuenta propia: el usuario crea su correo + contraseña (registro) o
 * entra con ellos. Por debajo usa Supabase Auth (email + password); la sesión
 * se guarda en cookies y el middleware deja pasar.
 *
 * Modo "recuperar": recuperación de contraseña con CÓDIGO de 6 dígitos (no
 * enlace). Flujo en dos pasos:
 *   1) Pedir: el usuario escribe su correo -> resetPasswordForEmail envía un
 *      código de 6 dígitos (requiere que la plantilla "Reset Password" de
 *      Supabase incluya {{ .Token }}).
 *   2) Código: el usuario escribe el código -> verifyOtp({ type: "recovery" })
 *      abre una sesión de recuperación y lo mandamos a /restablecer para poner
 *      la contraseña nueva. Así verificamos que de verdad tenga acceso al correo
 *      antes de dejar cambiar la clave, y no depende de enlaces que se rompen.
 *
 * Nota: para que el registro entre de una (sin confirmar por correo), hay que
 * desactivar "Confirm email" en Supabase → Authentication.
 */
type Modo = "entrar" | "registro" | "recuperar";
type PasoRec = "pedir" | "codigo";

export function LoginForm() {
  const search = useSearchParams();
  const next = search.get("next") || "/";

  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pasoRec, setPasoRec] = useState<PasoRec>("pedir");
  const [status, setStatus] = useState<"idle" | "checking">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [aviso, setAviso] = useState("");

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setErrorMsg("");
    setAviso("");
    setPasoRec("pedir");
    setCodigo("");
  }

  async function enviarCodigo(correo: string) {
    setStatus("checking");
    setErrorMsg("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(correo);
      if (error) throw error;
      setStatus("idle");
      setPasoRec("codigo");
      setAviso(
        "Si ese correo tiene una cuenta, te enviamos un código de 6 dígitos. Revisa tu bandeja de entrada (y la carpeta de spam). Vence en una hora.",
      );
    } catch {
      setStatus("idle");
      setErrorMsg("No se pudo enviar el código. Intenta de nuevo en un momento.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setAviso("");

    const correo = email.trim().toLowerCase();

    // --- Recuperar contraseña ---
    if (modo === "recuperar") {
      if (!correo.includes("@") || !correo.includes(".")) {
        setErrorMsg("Escribe un correo válido.");
        return;
      }
      // Paso 1: pedir el código
      if (pasoRec === "pedir") {
        await enviarCodigo(correo);
        return;
      }
      // Paso 2: verificar el código
      const token = codigo.trim();
      if (token.length < 6) {
        setErrorMsg("Escribe el código de 6 dígitos que te llegó al correo.");
        return;
      }
      setStatus("checking");
      try {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.verifyOtp({
          email: correo,
          token,
          type: "recovery",
        });
        if (error) throw error;
        // Código correcto: ya hay sesión de recuperación -> a poner la clave.
        window.location.href = "/restablecer";
      } catch {
        setStatus("idle");
        setErrorMsg("Código incorrecto o vencido. Revisa el correo o pide uno nuevo.");
      }
      return;
    }

    // --- Entrar / Registro: necesitan correo + contraseña ---
    if (!correo.includes("@") || !correo.includes(".")) {
      setErrorMsg("Escribe un correo válido.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setStatus("checking");
    try {
      const supabase = createSupabaseBrowserClient();

      if (modo === "registro") {
        const { data, error } = await supabase.auth.signUp({
          email: correo,
          password,
        });
        if (error) throw error;
        // Si Supabase pide confirmar por correo, no hay sesión todavía.
        if (!data.session) {
          setStatus("idle");
          setAviso(
            "¡Cuenta creada! Te enviamos un correo para confirmarla. Ábrelo y luego entra con tu contraseña.",
          );
          setModo("entrar");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: correo,
          password,
        });
        if (error) throw error;
      }

      // Recarga completa para que el servidor tome la sesión (cookies).
      window.location.href = next;
    } catch (err) {
      setStatus("idle");
      setErrorMsg(mensajeError(err, modo));
    }
  }

  const esRegistro = modo === "registro";
  const esRecuperar = modo === "recuperar";

  // --- Vista de recuperar contraseña (sin pestañas) ---
  if (esRecuperar) {
    const enPaso2 = pasoRec === "codigo";
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="font-cinzel text-lg font-bold text-cacao">
            Recuperar contraseña
          </h2>
          <p className="mt-1 text-sm text-cacao-soft">
            {enPaso2
              ? "Escribe el código de 6 dígitos que te llegó al correo."
              : "Escribe tu correo y te enviamos un código de verificación."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <label className="block">
            <span className="text-sm font-semibold text-cacao">Correo</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus={!enPaso2}
              disabled={enPaso2}
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta disabled:bg-marfil-light disabled:text-cacao-soft"
            />
          </label>

          {enPaso2 && (
            <label className="block">
              <span className="text-sm font-semibold text-cacao">
                Código de verificación
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={6}
                placeholder="______"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-center text-2xl font-bold tracking-[0.5em] text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={status === "checking"}
            className="w-full rounded-xl bg-terracotta text-white py-3 text-base font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
          >
            {status === "checking"
              ? enPaso2
                ? "Verificando..."
                : "Enviando..."
              : enPaso2
                ? "Verificar código"
                : "Enviarme el código"}
          </button>

          {aviso && (
            <div className="rounded-lg bg-[#E7F2EA] ring-1 ring-[#BFE0CB] p-3 text-sm text-[#2F7A49]">
              {aviso}
            </div>
          )}
          {errorMsg && (
            <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
              {errorMsg}
            </div>
          )}

          {enPaso2 && (
            <button
              type="button"
              onClick={() => {
                const correo = email.trim().toLowerCase();
                if (correo.includes("@")) enviarCodigo(correo);
              }}
              disabled={status === "checking"}
              className="w-full text-sm font-semibold text-terracotta hover:text-terracotta-deep disabled:opacity-50"
            >
              Reenviar código
            </button>
          )}
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => cambiarModo("entrar")}
            className="text-sm font-semibold text-terracotta hover:text-terracotta-deep"
          >
            ← Volver a entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cambio entre Entrar / Crear cuenta */}
      <div className="flex gap-1.5 rounded-2xl bg-marfil-light ring-1 ring-marfil p-1.5">
        <button
          type="button"
          onClick={() => cambiarModo("entrar")}
          className={
            "flex-1 rounded-xl py-2.5 font-bold text-sm transition-colors " +
            (!esRegistro ? "bg-white text-cacao shadow-sm" : "text-cacao-soft")
          }
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => cambiarModo("registro")}
          className={
            "flex-1 rounded-xl py-2.5 font-bold text-sm transition-colors " +
            (esRegistro ? "bg-white text-cacao shadow-sm" : "text-cacao-soft")
          }
        >
          Crear mi acceso
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
      >
        <label className="block">
          <span className="text-sm font-semibold text-cacao">Correo</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-cacao">Contraseña</span>
          <input
            type="password"
            autoComplete={esRegistro ? "new-password" : "current-password"}
            required
            placeholder={esRegistro ? "Crea tu contraseña" : "Tu contraseña"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
          />
          {esRegistro && (
            <span className="mt-1 block text-xs text-cacao-mute">
              Mínimo 6 caracteres. Anótala en un lugar seguro.
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={status === "checking"}
          className="w-full rounded-xl bg-terracotta text-white py-3 text-base font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
        >
          {status === "checking"
            ? esRegistro
              ? "Creando..."
              : "Entrando..."
            : esRegistro
              ? "Crear mi acceso"
              : "Entrar"}
        </button>

        {aviso && (
          <div className="rounded-lg bg-[#E7F2EA] ring-1 ring-[#BFE0CB] p-3 text-sm text-[#2F7A49]">
            {aviso}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
            {errorMsg}
          </div>
        )}
      </form>

      {/* ¿Olvidaste tu contraseña? — solo tiene sentido al entrar */}
      {!esRegistro && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => cambiarModo("recuperar")}
            className="text-sm font-semibold text-terracotta hover:text-terracotta-deep"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      )}
    </div>
  );
}

function mensajeError(err: unknown, modo: Modo): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("already registered") || msg.includes("already been registered")) {
    return "Ese correo ya tiene una cuenta. Entra con tu contraseña.";
  }
  if (msg.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (msg.includes("email not confirmed")) {
    return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada.";
  }
  if (msg.includes("password")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  return modo === "registro"
    ? "No se pudo crear la cuenta. Intenta de nuevo."
    : "No se pudo entrar. Revisa tus datos e intenta de nuevo.";
}
