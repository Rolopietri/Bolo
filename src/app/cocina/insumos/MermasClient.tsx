"use client";

// Mermas y pérdidas de insumos en un solo lugar (pestaña de Insumos):
//  1. Pérdidas registradas a mano (botón "Pérdida" del catálogo): mal estado,
//     vencimiento, merma, etc. Valoradas al precio base y con "deshacer".
//  2. Merma por conteo: lo que faltó entre el sistema y el conteo físico.

import { useEffect, useMemo, useState } from "react";
import { TIPOS_PERDIDA, type Insumo, type StockMovimiento } from "@/lib/types";
import { listInsumos } from "@/lib/data/cocina";
import { listMovimientos, deleteMovimiento } from "@/lib/data/stock-movimientos";
import { displayCantidad } from "@/lib/units";
import { hoyISO } from "@/lib/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ErrorCarga } from "@/components/ErrorCarga";
import { extractError } from "@/lib/data/error";
import { MermaConteoClient } from "./MermaConteoClient";

const TIPOS = new Set<string>(TIPOS_PERDIDA.map((t) => t.value));
const tipoLabel = (t: string) =>
  TIPOS_PERDIDA.find((x) => x.value === t)?.label ?? t;

type Periodo = "30" | "90" | "todo";

function fUSD(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
/** Fecha ISO (YYYY-MM-DD) de hace `dias` días. */
function haceDias(hoy: string, dias: number): string {
  const d = new Date(`${hoy}T12:00:00`);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export function MermasClient() {
  const [movs, setMovs] = useState<StockMovimiento[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Error al CARGAR (distinto de los errores al deshacer). */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [pendienteBorrar, setPendienteBorrar] = useState<string | null>(null);
  const [devolverStock, setDevolverStock] = useState(true);
  const hoy = useMemo(() => hoyISO(), []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [mv, ins] = await Promise.all([
          listMovimientos({ limit: 500 }),
          listInsumos(),
        ]);
        if (!cancel) {
          setMovs(mv.filter((m) => TIPOS.has(m.tipo)));
          setInsumos(ins);
        }
      } catch (e) {
        if (!cancel) setErrorCarga(extractError(e, "Error cargando las pérdidas"));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [intento]);

  function reintentarCarga() {
    setLoading(true);
    setErrorCarga(null);
    setIntento((n) => n + 1);
  }

  const insumoById = useMemo(() => new Map(insumos.map((i) => [i.id, i] as const)), [insumos]);
  const valorDe = (m: StockMovimiento) => {
    const p = insumoById.get(m.insumoId)?.precioBaseUsd;
    return p != null ? Math.abs(m.cantidad) * p : null;
  };

  const enPeriodo = useMemo(() => {
    if (periodo === "todo") return movs;
    const desde = haceDias(hoy, Number(periodo));
    return movs.filter((m) => m.fecha >= desde);
  }, [movs, periodo, hoy]);

  const resumen = useMemo(() => {
    let total = 0;
    let sinCosto = 0;
    const porTipo = new Map<string, number>();
    const porInsumo = new Map<string, number>();
    for (const m of enPeriodo) {
      const p = insumoById.get(m.insumoId)?.precioBaseUsd;
      if (p == null) { sinCosto++; continue; }
      const v = Math.abs(m.cantidad) * p;
      total += v;
      porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + v);
      porInsumo.set(m.insumoId, (porInsumo.get(m.insumoId) ?? 0) + v);
    }
    const top = Array.from(porInsumo.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { total, sinCosto, porTipo, top };
  }, [enPeriodo, insumoById]);

  async function borrar(id: string, devolver: boolean) {
    try {
      await deleteMovimiento(id, { devolverStock: devolver });
      setMovs((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  return (
    <div className="space-y-8">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ── Pérdidas registradas ─────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
              Pérdidas registradas
            </h2>
            <p className="mt-1 text-[12px] text-cacao-soft">
              Lo que das de baja a mano con el botón <b>Pérdida</b> del catálogo
              (mal estado, vencimiento, merma…), valorado al precio base.
            </p>
          </div>
          <div className="flex gap-1">
            {([
              ["30", "30 días"],
              ["90", "90 días"],
              ["todo", "Todo"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setPeriodo(v)}
                className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
                  periodo === v
                    ? "bg-cacao text-white ring-cacao"
                    : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
            Cargando…
          </div>
        ) : errorCarga ? (
          <ErrorCarga
            que="las pérdidas"
            detalle={errorCarga}
            onReintentar={reintentarCarga}
          />
        ) : enPeriodo.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center font-serif italic text-cacao-soft">
            No hay pérdidas registradas en este período.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white ring-1 ring-marfil p-4">
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Valor perdido
                </div>
                <div className="mt-1 text-2xl font-cinzel text-terracotta tabular-nums">
                  {fUSD(resumen.total)}
                </div>
                <div className="text-[11px] text-cacao-mute">
                  {enPeriodo.length} registro(s)
                  {resumen.sinCosto > 0 && ` · ${resumen.sinCosto} sin precio`}
                </div>
              </div>
              <div className="rounded-2xl bg-white ring-1 ring-marfil p-4">
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Por tipo
                </div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {TIPOS_PERDIDA.filter((t) => resumen.porTipo.has(t.value)).map((t) => (
                    <li key={t.value} className="flex justify-between gap-2">
                      <span className="text-cacao-soft">{t.label}</span>
                      <span className="text-cacao tabular-nums">{fUSD(resumen.porTipo.get(t.value)!)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl bg-white ring-1 ring-marfil p-4">
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Dónde más se pierde
                </div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {resumen.top.map(([id, v]) => (
                    <li key={id} className="flex justify-between gap-2">
                      <span className="text-cacao-soft truncate">{insumoById.get(id)?.nombre ?? "Insumo"}</span>
                      <span className="text-cacao tabular-nums">{fUSD(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <ul className="rounded-2xl bg-white ring-1 ring-marfil divide-y divide-marfil">
              {enPeriodo.map((m) => {
                const ins = insumoById.get(m.insumoId);
                const val = valorDe(m);
                return (
                  <li key={m.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-cacao truncate">{ins?.nombre ?? "Insumo"}</div>
                      <div className="text-xs text-cacao-soft">
                        {tipoLabel(m.tipo)} ·{" "}
                        {displayCantidad(Math.abs(m.cantidad), ins?.unidadBase ?? "")} ·{" "}
                        {fFecha(m.fecha)}
                        {m.motivo ? ` · ${m.motivo}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-terracotta tabular-nums">
                        {val != null ? fUSD(val) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDevolverStock(true);
                          setPendienteBorrar(m.id);
                        }}
                        className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta"
                        title="Deshacer si la registraste por error"
                      >
                        Deshacer
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ── Merma por conteo ─────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Merma por conteo físico
        </h2>
        <MermaConteoClient />
      </section>

      <ConfirmDialog
        open={pendienteBorrar !== null}
        title="¿Deshacer esta pérdida?"
        message={
          <label className="flex items-start gap-2 rounded-lg bg-marfil-soft ring-1 ring-marfil p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={devolverStock}
              onChange={(e) => setDevolverStock(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cacao"
            />
            <span className="text-sm text-cacao">
              Devolver la cantidad al stock
              <span className="block text-xs text-cacao-soft">
                Márcalo si registraste la pérdida por error. Déjalo sin marcar
                para solo borrar el registro sin tocar el stock.
              </span>
            </span>
          </label>
        }
        onConfirm={() => {
          if (pendienteBorrar) borrar(pendienteBorrar, devolverStock);
          setPendienteBorrar(null);
        }}
        onCancel={() => setPendienteBorrar(null)}
      />
    </div>
  );
}
