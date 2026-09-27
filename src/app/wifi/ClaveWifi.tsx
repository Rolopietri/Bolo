"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, WifiIcon } from "@/components/icons";
import type { WifiConfig } from "@/lib/wifi";

export function ClaveWifi({
  credenciales,
  nombre,
  visitas,
  conocido = false,
}: {
  credenciales: WifiConfig;
  nombre?: string;
  visitas?: number;
  conocido?: boolean;
}) {
  const [copiado, setCopiado] = useState<"ssid" | "clave" | null>(null);

  async function copiar(texto: string, cual: "ssid" | "clave") {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles: el invitado puede leer y escribir la clave.
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-6 text-center">
        <div className="flex justify-center text-oliva">
          <WifiIcon className="size-9" />
        </div>
        <h2 className="mt-3 text-lg font-medium text-cacao">
          {nombre ? `¡Listo, ${nombre.split(" ")[0]}!` : conocido ? "Ya estás registrado" : "¡Listo!"}
        </h2>
        <p className="mt-1 text-sm text-cacao-soft">
          {visitas && visitas > 1
            ? `Gracias por volver — visita nº ${visitas}.`
            : "Conéctate con estos datos."}
        </p>

        <dl className="mt-6 space-y-3 text-left">
          <Dato
            etiqueta="Red (WiFi)"
            valor={credenciales.ssid}
            copiado={copiado === "ssid"}
            onCopiar={() => copiar(credenciales.ssid, "ssid")}
          />
          <Dato
            etiqueta="Clave"
            valor={credenciales.clave}
            mono
            copiado={copiado === "clave"}
            onCopiar={() => copiar(credenciales.clave, "clave")}
          />
        </dl>

        {credenciales.mensaje && (
          <p className="mt-5 font-serif italic text-sm text-cacao-soft whitespace-pre-line">
            {credenciales.mensaje.replace(
              /\{nombre\}/g,
              nombre ? nombre.trim().split(" ")[0] : "",
            )}
          </p>
        )}
      </div>

      <ol className="rounded-2xl bg-marfil-soft ring-1 ring-marfil-light p-5 text-sm text-cacao-soft space-y-1.5 list-decimal list-inside">
        <li>Abre los ajustes de WiFi de tu teléfono.</li>
        <li>
          Elige la red <span className="font-medium text-cacao">{credenciales.ssid}</span>.
        </li>
        <li>Pega o escribe la clave de arriba.</li>
      </ol>

      {conocido && (
        <p className="text-center text-xs text-cacao-mute">
          ¿No eres tú?{" "}
          <a href="/wifi?nuevo=1" className="underline">
            Registrar otra persona
          </a>
        </p>
      )}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  mono = false,
  copiado,
  onCopiar,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <div className="rounded-lg bg-marfil-soft px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className="font-display text-[10px] tracking-[0.25em] uppercase text-cacao-mute">
          {etiqueta}
        </dt>
        <dd
          className={`text-cacao break-all ${mono ? "font-mono text-base" : "text-base font-medium"}`}
        >
          {valor}
        </dd>
      </div>
      <button
        type="button"
        onClick={onCopiar}
        className="shrink-0 text-cacao-soft hover:text-terracotta transition-colors"
        aria-label={`Copiar ${etiqueta.toLowerCase()}`}
        title="Copiar"
      >
        {copiado ? (
          <CheckIcon className="size-5 text-oliva" />
        ) : (
          <CopyIcon className="size-5" />
        )}
      </button>
    </div>
  );
}
