"use client";

// Reporte de merma por conteo (Fase 1). Lee los ajustes de conteo físico
// (stock_movimientos tipo 'ajuste', motivo 'Conteo físico') y muestra, por cada
// conteo, cuánto faltó (merma) o sobró, valorado al precio base del insumo.

import { useEffect, useMemo, useState } from "react";
import { listAjustesConteo, type AjusteConteo } from "@/lib/data/stock-movimientos";
import { ErrorBanner } from "@/components/ErrorBanner";

function fNum(n: number): string {
  const a = Math.abs(n);
  return Number.isInteger(a) ? a.toLocaleString("en-US") : a.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function fUSD(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
const valorDe = (a: AjusteConteo) => (a.precioBase != null ? Math.abs(a.cantidad) * a.precioBase : null);

export function MermaClient() {
  const [items, setItems] = useState<AjusteConteo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const d = await listAjustesConteo();
        if (!cancel) setItems(d);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error cargando la merma");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Agrupar por fecha (cada conteo es una fecha).
  const conteos = useMemo(() => {
    const m = new Map<string, AjusteConteo[]>();
    for (const a of items) {
      const arr = m.get(a.fecha) ?? [];
      arr.push(a);
      m.set(a.fecha, arr);
    }
    return Array.from(m.entries())
      .map(([fecha, rows]) => {
        let valMerma = 0, sinCosto = 0, nMerma = 0, nSobra = 0;
        for (const r of rows) {
          const val = valorDe(r);
          if (r.cantidad < 0) { nMerma++; if (val != null) valMerma += val; else sinCosto++; }
          else if (r.cantidad > 0) { nSobra++; }
        }
        return { fecha, rows, valMerma, sinCosto, nMerma, nSobra };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [items]);

  if (loading) {
    return <div className="rounded-2xl bg-white ring-1 ring-marfil p-10 text-center text-cacao-soft">Cargando…</div>;
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p className="text-[12px] text-cacao-soft">
        La <b>merma</b> es lo que faltó frente a lo que el sistema esperaba (stock − conteo real):
        desperdicio, sobre-porción, daño o error. Se valora al precio base del insumo. Un
        <b> sobrante</b> (contaste más) suele ser una receta que descuenta de más o una compra sin registrar.
      </p>

      {conteos.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-10 text-center font-serif italic text-cacao-soft">
          Aún no hay conteos registrados. Haz un conteo físico (Inventario → Conteo físico) y aquí verás la merma de cada uno.
        </div>
      ) : (
        conteos.map((c) => {
          const open = abierto === c.fecha;
          const rowsOrd = [...c.rows].sort((a, b) => (valorDe(b) ?? 0) - (valorDe(a) ?? 0));
          return (
            <section key={c.fecha} className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden">
              <button type="button" onClick={() => setAbierto(open ? null : c.fecha)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                <div>
                  <span className="font-cinzel text-base text-cacao">Conteo {fFecha(c.fecha)}</span>
                  <span className="block text-[11px] text-cacao-mute">{c.nMerma} con merma · {c.nSobra} con sobrante</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="block text-[9px] uppercase tracking-widest text-cacao-mute">Merma valorada</span>
                    <span className="text-terracotta font-medium tabular-nums">{fUSD(c.valMerma)}</span>
                  </div>
                  <span className={`text-cacao-mute transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                </div>
              </button>
              {open && (
                <div className="border-t border-marfil overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-cacao-mute uppercase tracking-widest text-[10px] text-left">
                        <th className="py-2 px-3 font-normal">Insumo</th>
                        <th className="py-2 px-3 font-normal text-right">Diferencia</th>
                        <th className="py-2 px-3 font-normal text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsOrd.map((r) => {
                        const val = valorDe(r);
                        const merma = r.cantidad < 0;
                        return (
                          <tr key={r.id} className="border-t border-marfil">
                            <td className="py-1.5 px-3 text-cacao">
                              {r.insumoNombre}
                              {r.categoria && <span className="block text-[10px] text-cacao-mute">{r.categoria}</span>}
                            </td>
                            <td className={`py-1.5 px-3 text-right tabular-nums whitespace-nowrap ${merma ? "text-terracotta" : "text-oliva"}`}>
                              {merma ? "−" : "+"}{fNum(r.cantidad)} <span className="text-cacao-mute text-xs">{r.unidad}</span>
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-cacao-soft whitespace-nowrap">
                              {val != null && merma ? fUSD(val) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {c.sinCosto > 0 && (
                    <p className="px-3 py-2 text-[11px] text-cacao-mute">{c.sinCosto} insumo(s) sin precio base — su merma no se valoró en $.</p>
                  )}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
