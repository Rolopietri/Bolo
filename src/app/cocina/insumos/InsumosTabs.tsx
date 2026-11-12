"use client";

// Insumos como una sola pantalla: el catálogo, y lo de cada insumo (uso diario,
// pérdidas, cambios de stock) dentro de su "Detalle". Para mirar varios
// insumos a la vez hay una línea de accesos arriba del catálogo, sin barra de
// pestañas. La vista abierta se refleja en ?vista= para que los enlaces viejos
// (/cocina/alertas, /cocina/auditoria, …) sigan cayendo en la correcta.
import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { InsumosClient } from "./InsumosClient";
import { AlertasClient } from "./AlertasClient";
import { MermasClient } from "./MermasClient";
import { AuditoriaClient } from "./AuditoriaClient";
import { UsoDiarioClient } from "./UsoDiarioClient";
import { CalendarIcon, ClipboardIcon, TrashIcon, WarningIcon } from "@/components/icons";

export type Vista = "catalogo" | "uso" | "alertas" | "mermas" | "auditoria";

const VISTAS_GENERALES: {
  id: Exclude<Vista, "catalogo">;
  label: string;
  titulo: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { id: "uso", label: "Uso diario", titulo: "Uso diario de todos los insumos", Icon: CalendarIcon },
  { id: "alertas", label: "Alertas", titulo: "Alertas de stock", Icon: WarningIcon },
  { id: "mermas", label: "Pérdidas", titulo: "Pérdidas de todos los insumos", Icon: TrashIcon },
  { id: "auditoria", label: "Cambios de stock", titulo: "Cambios de stock de todos los insumos", Icon: ClipboardIcon },
];

export function InsumosTabs({
  vistaInicial,
  insumoInicial = null,
}: {
  vistaInicial: Vista;
  /** Con vista "uso", abre el uso diario de este insumo; si no, su ficha. */
  insumoInicial?: string | null;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  // Agotados + bajos, para el número de Alertas. Lo reportan el catálogo y la
  // vista de alertas cuando cargan.
  const [nAlertas, setNAlertas] = useState<number | null>(null);

  function ir(v: Vista) {
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

  const general = VISTAS_GENERALES.find((x) => x.id === vista);

  if (general) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-marfil pb-3">
          <h2 className="font-cinzel text-xl text-cacao">{general.titulo}</h2>
          <button
            type="button"
            onClick={() => ir("catalogo")}
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver al catálogo
          </button>
        </div>
        {vista === "uso" && (
          <UsoDiarioClient insumoInicial={vistaInicial === "uso" ? insumoInicial : null} />
        )}
        {vista === "alertas" && <AlertasClient onConteoAlertas={setNAlertas} />}
        {vista === "mermas" && <MermasClient />}
        {vista === "auditoria" && <AuditoriaClient />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Vistas de todos los insumos: una línea simple, sin pestañas. */}
      <nav aria-label="Ver todos los insumos" className="border-y border-marfil">
        <p className="pt-2 text-[10px] uppercase tracking-[0.3em] text-cacao-mute">
          Ver de todos los insumos
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 py-2">
          {VISTAS_GENERALES.map(({ id, label, Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => ir(id)}
                className="group inline-flex min-h-10 items-center gap-2 text-sm text-cacao hover:text-terracotta"
              >
                <span className="grid size-8 place-items-center rounded-full bg-naranja-soft/60 text-terracotta transition-colors group-hover:bg-terracotta group-hover:text-white">
                  <Icon className="size-4" />
                </span>
                {label}
                {id === "alertas" && nAlertas != null && nAlertas > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-px text-[10px] text-terracotta ring-1 ring-red-200">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                    {nAlertas}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <InsumosClient
        insumoInicial={vistaInicial === "catalogo" ? insumoInicial : null}
        onVerAlertas={() => ir("alertas")}
        onVerMermas={() => ir("mermas")}
        onConteoAlertas={setNAlertas}
      />
    </div>
  );
}
