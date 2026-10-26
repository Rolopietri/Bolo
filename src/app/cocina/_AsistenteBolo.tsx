"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronIcon } from "@/components/icons";
import { CaraAgente } from "@/components/CaraAgente";
import { DESTINOS, EVENTO_ABRIR, EVENTO_GUIAR, type ClaveDestino } from "./_destinos";
import { publicarGuia, type RellenoGuia } from "./_guiaAccion";
import { interpretarAtajo } from "./_atajosAsistente";
import { anotarSeguimiento, type SeguimientoNuevo } from "./_seguimientos";

// Burbuja del asistente. Conversación con /api/asistente y un cursor que
// señala la pantalla ("Te muestro"). Las preguntas de camino se responden
// al instante; las de cifras van al modelo.

type EstadoConexion = "ok" | "sin_clave" | "clave_invalida" | "error" | null;

type Mensaje = {
  role: "user" | "assistant";
  content: string;
  destino?: ClaveDestino;
  rellenar?: RellenoGuia;
};

const SALUDO =
  "¡Hola! Soy bolo. Te ayudo a armar la cocina y te llevo a la pantalla. ¿Qué quieres hacer?";

const SUGERENCIAS = [
  "¿Por dónde empiezo?",
  "Quiero agregar un proveedor",
  "¿Cómo guardo un insumo que me venden en gramos?",
  "¿Qué me falta y qué está bajo?",
];

function llevar(destino: ClaveDestino, rellenar?: RellenoGuia) {
  const d = DESTINOS[destino];
  if (!d) return;
  if (d.preparar || rellenar) publicarGuia({ preparar: d.preparar, relleno: rellenar });
  else publicarGuia(null);
  window.dispatchEvent(new CustomEvent(EVENTO_GUIAR, { detail: destino }));
}

function aplicarSeguimientos(lista: unknown, extra?: SeguimientoNuevo) {
  if (Array.isArray(lista)) {
    for (const s of lista) {
      if (!s || typeof s !== "object") continue;
      const row = s as { titulo?: unknown; detalle?: unknown; destino?: unknown };
      if (typeof row.titulo !== "string" || typeof row.detalle !== "string") continue;
      const destino =
        typeof row.destino === "string" && row.destino in DESTINOS
          ? (row.destino as ClaveDestino)
          : undefined;
      anotarSeguimiento({ titulo: row.titulo, detalle: row.detalle, destino });
    }
  }
  if (extra) anotarSeguimiento(extra);
}

export function AsistenteBolo() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ role: "assistant", content: SALUDO }]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [conexion, setConexion] = useState<EstadoConexion>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const guiado = useRef(-1);
  const pathname = usePathname();

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, abierto, cargando]);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(EVENTO_ABRIR, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR, abrir);
  }, []);

  // Al responder con un destino, el cursor sale solo. "Te muestro" lo repite.
  useEffect(() => {
    const i = mensajes.length - 1;
    const m = mensajes[i];
    if (!abierto || !m || m.role !== "assistant" || !m.destino || i === 0) return;
    if (guiado.current === i) return;
    guiado.current = i;
    llevar(m.destino, m.rellenar);
  }, [mensajes, abierto]);

  async function enviar(pregunta: string) {
    const limpio = pregunta.trim();
    if (!limpio || cargando) return;
    const atajo = interpretarAtajo(limpio);
    const nuevos: Mensaje[] = [...mensajes, { role: "user", content: limpio }];
    setMensajes(nuevos);
    setTexto("");

    if (atajo && !atajo.requiereDatos) {
      if (atajo.seguimiento) anotarSeguimiento(atajo.seguimiento);
      setMensajes((prev) => [
        ...prev,
        {
          role: "assistant",
          content: atajo.respuesta,
          destino: atajo.destino,
          rellenar: atajo.rellenar,
        },
      ]);
      return;
    }

    setCargando(true);
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nuevos.filter((_, i) => i > 0), pagina: pathname }),
      });
      const data = await r.json().catch(() => ({}));
      const estado = data.estado as EstadoConexion;
      if (estado === "sin_clave" || estado === "clave_invalida" || estado === "error") {
        setConexion(estado);
      } else if (estado === "ok") {
        setConexion("ok");
      }

      const destinoApi: ClaveDestino | undefined =
        data.accion?.destino && data.accion.destino in DESTINOS ? data.accion.destino : undefined;
      const rellenarApi: RellenoGuia | undefined =
        data.accion?.rellenar && typeof data.accion.rellenar === "object"
          ? data.accion.rellenar
          : undefined;

      const usarAtajo = Boolean(atajo && estado && estado !== "ok");
      const destino = usarAtajo ? atajo?.destino : destinoApi;
      const rellenar = usarAtajo ? atajo?.rellenar : rellenarApi;
      const content = usarAtajo
        ? atajo?.respuesta
        : typeof data.reply === "string" && data.reply
          ? data.reply
          : "No pude responder. Inténtalo otra vez.";

      if (!usarAtajo) {
        const extra =
          rellenar?.nombre && destino
            ? {
                titulo: `Terminar: ${rellenar.nombre}`,
                detalle: "El formulario quedó listo. Falta que confirmes con el botón de guardar.",
                destino,
              }
            : undefined;
        aplicarSeguimientos(data.seguimientos, extra);
      } else if (atajo?.seguimiento) {
        anotarSeguimiento(atajo.seguimiento);
      }

      setMensajes((prev) => [
        ...prev,
        { role: "assistant", content: content ?? "No pude responder. Inténtalo otra vez.", destino, rellenar },
      ]);
    } catch {
      setConexion("error");
      setMensajes((prev) => [
        ...prev,
        {
          role: "assistant",
          content: atajo
            ? atajo.respuesta
            : "No pude conectar. Revisa tu internet e inténtalo otra vez.",
          destino: atajo?.destino,
          rellenar: atajo?.rellenar,
        },
      ]);
    } finally {
      setCargando(false);
    }
  }

  const aviso =
    conexion === "sin_clave"
      ? "El asistente inteligente no está conectado: falta ANTHROPIC_API_KEY en el servidor. Igual te llevo a cada pantalla."
      : conexion === "clave_invalida"
        ? "La clave del asistente no está funcionando. Hay que revisarla en Vercel. Igual te llevo a cada pantalla."
        : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? "Cerrar asistente" : "Abrir asistente"}
        aria-expanded={abierto}
        className="fixed bottom-5 right-5 z-40 flex h-14 items-center rounded-full bg-terracotta px-3 text-white shadow-lg transition-transform hover:scale-105 hover:bg-cacao focus:outline-none focus-visible:ring-2 focus-visible:ring-cacao focus-visible:ring-offset-2"
      >
        {abierto ? (
          <ChevronIcon className="mx-2 size-6 rotate-90" />
        ) : (
          <CaraAgente className="h-10 w-auto" title="Asistente bolo" />
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Asistente de bolo"
          className="fixed bottom-24 right-5 z-40 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-marfil"
          style={{ maxHeight: "min(32rem, calc(100vh - 8rem))" }}
        >
          <div className="flex items-center gap-2 bg-cacao px-4 py-3 text-white">
            <CaraAgente className="h-8 w-auto" title="bolo" />
            <div className="min-w-0">
              <p className="font-cinzel text-sm leading-none">Asistente</p>
              <p className="mt-0.5 text-[11px] text-marfil/80">Te llevo y te explico la cocina</p>
            </div>
          </div>

          {aviso && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-cacao">
              <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-900">
                <span className="inline-block size-1.5 rounded-full bg-amber-500" />
                {conexion === "clave_invalida" ? "Clave" : "Sin clave"}
              </span>
              {aviso}
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {mensajes.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}
              >
                <p
                  className={
                    m.role === "user"
                      ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-terracotta px-3.5 py-2 text-sm text-white"
                      : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-marfil-soft px-3.5 py-2 text-sm text-cacao"
                  }
                >
                  {m.content}
                </p>
                {m.destino && DESTINOS[m.destino] && (
                  <button
                    type="button"
                    onClick={() => llevar(m.destino!, m.rellenar)}
                    className="mt-1.5 inline-flex max-w-[95%] items-center gap-1.5 rounded-full bg-cacao px-3 py-1.5 text-left text-xs font-medium text-white transition-colors hover:bg-terracotta"
                  >
                    <CaraAgente className="h-4 w-auto" />
                    Te muestro: {DESTINOS[m.destino].etiqueta}
                  </button>
                )}
              </div>
            ))}

            {cargando && (
              <div className="flex justify-start">
                <p className="rounded-2xl rounded-bl-sm bg-marfil-soft px-3.5 py-2.5 text-sm text-cacao-soft">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex gap-1" aria-hidden>
                      <span className="size-1.5 animate-bounce rounded-full bg-cacao-mute [animation-delay:-0.3s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-cacao-mute [animation-delay:-0.15s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-cacao-mute" />
                    </span>
                    Estoy mirando tu cocina…
                  </span>
                </p>
              </div>
            )}

            {mensajes.length === 1 && !cargando && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => enviar(s)}
                    className="rounded-full bg-marfil px-3 py-1.5 text-left text-xs text-cacao-soft transition-colors hover:bg-marfil-soft hover:text-cacao"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={finRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
            className="flex items-center gap-2 border-t border-marfil px-3 py-3"
          >
            <input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pregúntame, por ejemplo: ¿cómo paso gramos a kilos?"
              className="min-w-0 flex-1 rounded-xl bg-marfil-soft px-3.5 py-2.5 text-sm text-cacao placeholder:text-cacao-mute focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            />
            <button
              type="submit"
              disabled={cargando || !texto.trim()}
              aria-label="Enviar"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-cacao text-white transition-colors hover:bg-terracotta disabled:opacity-40"
            >
              <ChevronIcon className="size-5 -rotate-90" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
