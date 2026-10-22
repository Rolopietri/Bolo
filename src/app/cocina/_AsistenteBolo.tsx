"use client";

import { useEffect, useRef, useState } from "react";
import { ChatIcon, SparkleIcon, ChevronIcon } from "@/components/icons";
import { DESTINOS, EVENTO_GUIAR, type ClaveDestino } from "./_destinos";

// Burbujita de ayuda presente en toda la sección de Cocina. Conversa con el
// asistente (/api/asistente), que responde dudas, consulta los datos del
// cliente cuando hace falta y puede GUIAR con un cursor en pantalla (botón
// "Te muestro"). Pensado para personas sin experiencia.

type Mensaje = {
  role: "user" | "assistant";
  content: string;
  /** Destino a señalar con el cursor-guía, si el AI ofreció mostrarlo. */
  destino?: ClaveDestino;
};

function guiarHacia(destino: ClaveDestino) {
  window.dispatchEvent(new CustomEvent(EVENTO_GUIAR, { detail: destino }));
}

const SALUDO =
  "¡Hola! Soy tu asistente. Te ayudo a montar tu cocina paso a paso y a resolver dudas. ¿En qué te echo una mano?";

const SUGERENCIAS = [
  "¿Por dónde empiezo?",
  "¿Qué es un proveedor?",
  "¿Qué me falta por configurar?",
  "¿Para qué sirven las recetas?",
];

export function AsistenteBolo() {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ role: "assistant", content: SALUDO }]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, abierto, cargando]);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  async function enviar(pregunta: string) {
    const limpio = pregunta.trim();
    if (!limpio || cargando) return;
    const nuevos: Mensaje[] = [...mensajes, { role: "user", content: limpio }];
    setMensajes(nuevos);
    setTexto("");
    setCargando(true);
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No mandamos el saludo inicial (no es parte real de la conversación).
        body: JSON.stringify({ messages: nuevos.filter((_, i) => i > 0) }),
      });
      const data = await r.json();
      const destino: ClaveDestino | undefined =
        data.accion?.destino && data.accion.destino in DESTINOS ? data.accion.destino : undefined;
      setMensajes((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "No pude responder, intenta de nuevo.", destino },
      ]);
    } catch {
      setMensajes((prev) => [
        ...prev,
        { role: "assistant", content: "Tuve un problema de conexión. Intenta de nuevo en un momento." },
      ]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? "Cerrar asistente" : "Abrir asistente"}
        aria-expanded={abierto}
        className="fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-terracotta text-white shadow-lg transition-transform hover:scale-105 hover:bg-cacao focus:outline-none focus-visible:ring-2 focus-visible:ring-cacao focus-visible:ring-offset-2"
      >
        {abierto ? <ChevronIcon className="size-6 rotate-90" /> : <ChatIcon className="size-6" />}
      </button>

      {/* Panel de chat */}
      {abierto && (
        <div
          role="dialog"
          aria-label="Asistente de bolo"
          className="fixed bottom-24 right-5 z-40 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-marfil"
          style={{ maxHeight: "min(32rem, calc(100vh - 8rem))" }}
        >
          {/* Cabecera */}
          <div className="flex items-center gap-2 bg-cacao px-4 py-3 text-white">
            <SparkleIcon className="size-5 text-marfil" />
            <div className="min-w-0">
              <p className="font-cinzel text-sm leading-none tracking-wide">Asistente</p>
              <p className="mt-0.5 text-[11px] text-marfil/80">Te ayudo con tu cocina</p>
            </div>
          </div>

          {/* Mensajes */}
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
                {m.destino && (
                  <button
                    type="button"
                    onClick={() => guiarHacia(m.destino!)}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-cacao px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-terracotta"
                  >
                    <SparkleIcon className="size-3.5" /> Te muestro
                  </button>
                )}
              </div>
            ))}

            {cargando && (
              <div className="flex justify-start">
                <p className="rounded-2xl rounded-bl-sm bg-marfil-soft px-3.5 py-2.5 text-sm text-cacao-soft">
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-cacao-mute [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-cacao-mute [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-cacao-mute" />
                  </span>
                </p>
              </div>
            )}

            {/* Sugerencias (solo al inicio) */}
            {mensajes.length === 1 && !cargando && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => enviar(s)}
                    className="rounded-full bg-marfil px-3 py-1.5 text-xs text-cacao-soft transition-colors hover:bg-marfil-soft hover:text-cacao"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={finRef} />
          </div>

          {/* Entrada */}
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
              placeholder="Escribe tu duda…"
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
