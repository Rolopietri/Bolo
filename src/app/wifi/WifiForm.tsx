"use client";

import { useState } from "react";
import { ClaveWifi } from "./ClaveWifi";
import { INTERESES, validarRegistro, type WifiConfig } from "@/lib/wifi";

type Respuesta = WifiConfig & { nuevo: boolean; visitas: number; nombre: string };

export function WifiForm({ origen }: { origen: string | null }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [promos, setPromos] = useState(true);
  const [intereses, setIntereses] = useState<string[]>([]);
  const [estado, setEstado] = useState<"idle" | "enviando">("idle");
  const [error, setError] = useState("");
  const [ok, setOk] = useState<Respuesta | null>(null);

  function alternar(valor: string) {
    setIntereses((prev) =>
      prev.includes(valor) ? prev.filter((v) => v !== valor) : [...prev, valor],
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const registro = { nombre, email, telefono, cedula, promos, intereses };
    const errores = validarRegistro(registro);
    if (errores.length) {
      setError(errores[0]);
      return;
    }
    setEstado("enviando");
    setError("");
    try {
      const res = await fetch("/api/wifi/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...registro, origen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No pudimos registrarte.");
      setOk(data as Respuesta);
    } catch (err) {
      setEstado("idle");
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  if (ok) {
    return (
      <ClaveWifi
        credenciales={{ ssid: ok.ssid, clave: ok.clave, mensaje: ok.mensaje }}
        nombre={ok.nombre}
        visitas={ok.visitas}
      />
    );
  }

  return (
    <form
      onSubmit={enviar}
      className="rounded-2xl bg-white ring-1 ring-marfil p-6 space-y-4"
    >
      <p className="text-sm text-cacao-soft">
        Déjanos tus datos y te damos la clave del WiFi. Es una sola vez.
      </p>

      <Campo etiqueta="Nombre">
        <input
          type="text"
          required
          autoComplete="name"
          placeholder="María Pérez"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={CLASE_INPUT}
        />
      </Campo>

      <Campo etiqueta="Correo">
        <input
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={CLASE_INPUT}
        />
      </Campo>

      <Campo etiqueta="WhatsApp">
        <input
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="0414 123 4567"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className={CLASE_INPUT}
        />
      </Campo>

      <Campo etiqueta="Cédula">
        <input
          type="text"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="V-12345678"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          className={CLASE_INPUT}
        />
      </Campo>

      <fieldset>
        <legend className="text-sm font-medium text-cacao">¿A qué viniste?</legend>
        <p className="mt-0.5 text-xs text-cacao-mute">Puedes marcar varias.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {INTERESES.map((op) => {
            const activo = intereses.includes(op.valor);
            return (
              <button
                key={op.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => alternar(op.valor)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left ring-1 transition-colors ${
                  activo
                    ? "bg-terracotta text-white ring-terracotta"
                    : "bg-white text-cacao ring-marfil hover:ring-cacao-soft"
                }`}
              >
                <span aria-hidden="true">{op.emoji}</span>
                <span>{op.etiqueta}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex items-start gap-2.5 text-sm text-cacao-soft">
        <input
          type="checkbox"
          checked={promos}
          onChange={(e) => setPromos(e.target.checked)}
          className="mt-0.5 size-4 accent-[#B53727]"
        />
        <span>
          Quiero enterarme de los eventos y promociones de la Quinta.
        </span>
      </label>

      {error && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={estado === "enviando"}
        className="w-full rounded-lg bg-terracotta text-white py-2.5 font-medium hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
      >
        {estado === "enviando" ? "Conectando..." : "Ver la clave del WiFi"}
      </button>

      <p className="text-xs text-cacao-mute text-center leading-relaxed">
        Usamos tus datos solo para atenderte mejor e invitarte a lo que hacemos
        en la Quinta. No los compartimos con nadie.
      </p>
    </form>
  );
}

const CLASE_INPUT =
  "mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2.5 text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-cacao-soft";

function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-cacao">{etiqueta}</span>
      {children}
    </label>
  );
}
