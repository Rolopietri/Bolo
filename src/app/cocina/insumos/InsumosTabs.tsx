"use client";

// Inventario como una sola pantalla: arriba "¿cómo estoy?" (tablero) y abajo
// "¿qué hago?" (la lista de insumos). Lo de cada insumo vive en su Detalle; las
// vistas de todos los insumos (uso diario, pérdidas, cambios) se abren desde
// "Más" y vuelven con "← Volver al inventario". La vista abierta se refleja en
// ?vista= para que los enlaces viejos sigan funcionando.
import { useState } from "react";
import { InsumosClient } from "./InsumosClient";
import { MermasClient } from "./MermasClient";
import { AuditoriaClient } from "./AuditoriaClient";
import { UsoDiarioClient } from "./UsoDiarioClient";

/** "alertas" ya no es una vista aparte: abre la lista filtrada en "Para pedir". */
export type Vista = "catalogo" | "uso" | "alertas" | "mermas" | "auditoria";
type VistaGeneral = "uso" | "mermas" | "auditoria";

const TITULOS: Record<VistaGeneral, string> = {
  uso: "Uso diario de todos los insumos",
  mermas: "Pérdidas de todos los insumos",
  auditoria: "Cambios de stock de todos los insumos",
};

export function InsumosTabs({
  vistaInicial,
  insumoInicial = null,
}: {
  vistaInicial: Vista;
  /** Con vista "uso", abre el uso diario de este insumo; si no, su fila. */
  insumoInicial?: string | null;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial === "alertas" ? "catalogo" : vistaInicial);

  function ir(v: "catalogo" | VistaGeneral) {
    setVista(v);
    try {
      const url = new URL(window.location.href);
      if (v === "catalogo") url.searchParams.delete("vista");
      else url.searchParams.set("vista", v);
      url.searchParams.delete("insumo");
      window.history.replaceState(null, "", url);
    } catch {
      // sin URL no pasa nada: la vista ya cambió
    }
    window.scrollTo({ top: 0 });
  }

  if (vista === "uso" || vista === "mermas" || vista === "auditoria") {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-marfil pb-3">
          <h2 className="font-cinzel text-xl text-cacao">{TITULOS[vista]}</h2>
          <button
            type="button"
            onClick={() => ir("catalogo")}
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver al inventario
          </button>
        </div>
        {vista === "uso" && (
          <UsoDiarioClient insumoInicial={vistaInicial === "uso" ? insumoInicial : null} />
        )}
        {vista === "mermas" && <MermasClient />}
        {vista === "auditoria" && <AuditoriaClient />}
      </div>
    );
  }

  return (
    <InsumosClient
      insumoInicial={vistaInicial === "catalogo" ? insumoInicial : null}
      filtroInicial={vistaInicial === "alertas" ? "pedir" : null}
      onVerGeneral={ir}
    />
  );
}
