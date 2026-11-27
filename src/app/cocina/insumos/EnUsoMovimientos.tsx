"use client";

// Historial corto de "pasó a en uso" en la ficha, para insumos que se usan
// por lotes (el almacén baja y lo usado queda en stock_procesado).

import { useEffect, useState } from "react";
import { listMovimientos } from "@/lib/data/stock-movimientos";
import { displayCantidad } from "@/lib/units";
import type { StockMovimiento } from "@/lib/types";

function horaLocal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-VE", {
    timeZone: "America/Caracas",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EnUsoMovimientos({
  insumoId,
  unidadBase,
}: {
  insumoId: string;
  unidadBase: string;
}) {
  const [movs, setMovs] = useState<StockMovimiento[] | null>(null);

  useEffect(() => {
    let vivo = true;
    listMovimientos({ insumoId, limit: 30 })
      .then((rows) => {
        if (!vivo) return;
        setMovs(rows.filter((m) => m.tipo === "en_uso"));
      })
      .catch(() => {
        if (vivo) setMovs([]);
      });
    return () => {
      vivo = false;
    };
  }, [insumoId]);

  if (!movs || movs.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 font-display text-xs uppercase tracking-[0.3em] text-cacao-mute">
        Salidas a en uso
      </h3>
      <ul className="divide-y divide-marfil border-y border-marfil text-sm text-cacao">
        {movs.map((m) => {
          const qty = Math.abs(m.cantidad);
          const [y, mo, d] = m.fecha.split("-");
          const fecha = d && mo && y ? `${d}/${mo}/${y}` : m.fecha;
          return (
            <li key={m.id} className="flex justify-between gap-3 py-2">
              <span className="text-cacao-soft">
                {fecha}
                {horaLocal(m.createdAt) ? `, ${horaLocal(m.createdAt)}` : ""}
                {m.nota ? ` · ${m.nota}` : ""}
              </span>
              <span className="tabular-nums">
                {displayCantidad(qty, unidadBase)} del almacén
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
