"use client";

import { useEffect, useState } from "react";
import { getTasaBcvActual } from "@/lib/data/cocina";
import { extractError } from "@/lib/data/error";
import type { TasaBcv } from "@/lib/types";

/** Estado de la consulta de la tasa: así "cargando", "no hay tasa" y "falló la
 *  consulta" nunca se confunden. */
type Estado = "cargando" | "listo" | "error";

export function BcvRateBanner() {
  const [tasa, setTasa] = useState<TasaBcv | null>(null);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El botón "Actualizar ahora" falló: lo que se ve es la última tasa leída. */
  const [actualizacionFallida, setActualizacionFallida] = useState(false);

  async function load() {
    try {
      const t = await getTasaBcvActual();
      setTasa(t);
      setError(null);
      setEstado("listo");
      return true;
    } catch (e) {
      setError(extractError(e, "Error cargando tasa"));
      setEstado("error");
      return false;
    }
  }

  useEffect(() => {
    // Carga inicial de la tasa al montar (fetch, no un setState síncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function reintentar() {
    setEstado("cargando");
    setError(null);
    await load();
  }

  async function refreshNow() {
    setRefreshing(true);
    setActualizacionFallida(false);
    try {
      const res = await fetch("/api/cron/bcv");
      if (!res.ok) throw new Error("No se pudo actualizar la tasa");
      if (!(await load())) setActualizacionFallida(true);
    } catch {
      setActualizacionFallida(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-[11px] tracking-[0.3em] text-cacao-mute">
            Tasa de cambio
          </div>
          {tasa ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-4">
              <div>
                <span className="font-cinzel text-2xl text-cacao">
                  Bs {tasa.usdBs.toFixed(2)}
                </span>
                <span className="ml-2 text-sm text-cacao-soft">/ USD</span>
              </div>
              {tasa.eurBs ? (
                <div className="text-sm text-cacao-soft">
                  Bs {tasa.eurBs.toFixed(2)} / EUR
                </div>
              ) : null}
              {tasa.paralelaBs ? (
                <div className="text-sm text-cacao-soft">
                  Bs {tasa.paralelaBs.toFixed(2)} / USD <span className="text-xs">(paralela)</span>
                </div>
              ) : null}
            </div>
          ) : estado === "cargando" ? (
            <div className="mt-1 text-sm text-cacao-mute italic font-serif">
              Cargando tasa…
            </div>
          ) : estado === "error" ? (
            <div className="mt-1 text-sm text-[#7A2419]">
              No se pudo consultar la tasa.{" "}
              <button
                type="button"
                onClick={reintentar}
                className="underline hover:text-cacao"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <div className="mt-1 text-sm text-cacao-soft italic font-serif">
              Sin tasa registrada todavía.
            </div>
          )}
          <div className="mt-1 text-xs text-cacao-mute">
            {tasa
              ? `Actualizado ${new Date(tasa.fecha + "T00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long" })} · fuente: ${tasa.fuente}`
              : estado === "listo"
                ? "Auto-actualiza diariamente a las 9 AM"
                : null}
          </div>
        </div>
        <button
          onClick={refreshNow}
          disabled={refreshing || estado === "cargando"}
          className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao disabled:opacity-50"
        >
          {refreshing ? "Actualizando..." : "Actualizar ahora →"}
        </button>
      </div>
      {actualizacionFallida && (
        <div className="mt-3 text-sm text-[#7A2419]">
          {tasa
            ? "No se pudo actualizar la tasa. Se muestra la última registrada, que puede no estar al día."
            : "No se pudo actualizar la tasa. Inténtalo de nuevo más tarde."}
        </div>
      )}
      {estado === "error" && error && !actualizacionFallida && (
        <div className="mt-2 text-xs text-cacao-mute break-words">{error}</div>
      )}
    </section>
  );
}
