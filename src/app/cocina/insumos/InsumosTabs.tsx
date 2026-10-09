"use client";

// Insumos (M1) como un solo módulo: el catálogo y, como pestañas, lo que antes
// eran sub-módulos aparte — alertas de stock, mermas/pérdidas y auditoría.
// La pestaña activa se refleja en ?vista= para que los enlaces viejos
// (/cocina/alertas, /cocina/auditoria, …) caigan directo en la correcta.
import { useState } from "react";
import { InsumosClient } from "./InsumosClient";
import { AlertasClient } from "./AlertasClient";
import { MermasClient } from "./MermasClient";
import { AuditoriaClient } from "./AuditoriaClient";

export type Vista = "catalogo" | "alertas" | "mermas" | "auditoria";

const TABS: { id: Vista; label: string }[] = [
  { id: "catalogo", label: "Catálogo" },
  { id: "alertas", label: "Alertas" },
  { id: "mermas", label: "Mermas y pérdidas" },
  { id: "auditoria", label: "Auditoría" },
];

export function InsumosTabs({ vistaInicial }: { vistaInicial: Vista }) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  // Insumo con el que abrir la auditoría (desde "Historial" en el catálogo).
  const [auditoriaInsumo, setAuditoriaInsumo] = useState<string | null>(null);
  // Agotados + bajos, para el contador de la pestaña. Lo reportan el catálogo
  // y la vista de alertas cuando cargan.
  const [nAlertas, setNAlertas] = useState<number | null>(null);

  function ir(v: Vista, opts: { insumoId?: string } = {}) {
    setAuditoriaInsumo(opts.insumoId ?? null);
    setVista(v);
    try {
      const url = new URL(window.location.href);
      if (v === "catalogo") url.searchParams.delete("vista");
      else url.searchParams.set("vista", v);
      window.history.replaceState(null, "", url);
    } catch {
      // sin URL no pasa nada: la pestaña ya cambió
    }
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2" aria-label="Vistas de insumos">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => ir(t.id)}
            aria-current={vista === t.id ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs uppercase tracking-widest ring-1 ${
              vista === t.id
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            {t.label}
            {t.id === "alertas" && nAlertas != null && nAlertas > 0 && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] tracking-normal ${
                  vista === t.id
                    ? "bg-white/20 text-white"
                    : "bg-red-50 text-terracotta ring-1 ring-red-200"
                }`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                {nAlertas}
              </span>
            )}
          </button>
        ))}
      </nav>

      {vista === "catalogo" && (
        <InsumosClient
          onVerAlertas={() => ir("alertas")}
          onVerMermas={() => ir("mermas")}
          onVerHistorial={(id) => ir("auditoria", { insumoId: id })}
          onConteoAlertas={setNAlertas}
        />
      )}
      {vista === "alertas" && <AlertasClient onConteoAlertas={setNAlertas} />}
      {vista === "mermas" && <MermasClient />}
      {vista === "auditoria" && (
        <AuditoriaClient insumoInicial={auditoriaInsumo} />
      )}
    </div>
  );
}
