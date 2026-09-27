"use client";

import { useEffect, useState } from "react";
import { getTasaBcvActual } from "@/lib/data/cocina";
import type { TasaBcv } from "@/lib/types";

export function BcvRateBanner() {
  const [tasa, setTasa] = useState<TasaBcv | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const t = await getTasaBcvActual();
      setTasa(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando tasa");
    }
  }

  useEffect(() => {
    // Carga inicial de la tasa al montar (fetch, no un setState síncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function refreshNow() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/cron/bcv");
      if (!res.ok) throw new Error("No se pudo actualizar la tasa");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error actualizando");
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
          ) : (
            <div className="mt-1 text-sm text-cacao-soft italic font-serif">
              Sin tasa registrada todavía.
            </div>
          )}
          <div className="mt-1 text-xs text-cacao-mute">
            {tasa
              ? `Actualizado ${new Date(tasa.fecha + "T00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long" })} · fuente: ${tasa.fuente}`
              : "Auto-actualiza diariamente a las 9 AM"}
          </div>
        </div>
        <button
          onClick={refreshNow}
          disabled={refreshing}
          className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao disabled:opacity-50"
        >
          {refreshing ? "Actualizando..." : "Actualizar ahora →"}
        </button>
      </div>
      {error && (
        <div className="mt-3 text-sm text-[#7A2419]">{error}</div>
      )}
    </section>
  );
}
