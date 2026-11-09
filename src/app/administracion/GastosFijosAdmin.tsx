"use client";

// Gastos fijos: alquiler, nómina, servicios, gas u otro.
// Se anotan una vez. Si se repiten cada mes, no hay que volver a cargarlos.

import { useEffect, useState } from "react";
import { getTasaBcvPorFecha } from "@/lib/data/cocina";
import { hoyCaracas } from "@/lib/cierre-caja";
import {
  CATEGORIAS_GASTO,
  CRITERIO_SEMANA,
  etiquetaCategoria,
  usdDesdeMonto,
  type CategoriaGasto,
  type GastoFijo,
  type MonedaGasto,
} from "@/lib/gastos-fijos";
import { fmtBs, fmtUsd } from "@/lib/moneda";

type Borrador = {
  categoria: CategoriaGasto | "";
  monto: string;
  moneda: MonedaGasto;
  fecha: string;
  nota: string;
  recurrente: boolean;
};

const VACIO: Borrador = {
  categoria: "",
  monto: "",
  moneda: "USD",
  fecha: "",
  nota: "",
  recurrente: true,
};

export function GastosFijosAdmin() {
  const [gastos, setGastos] = useState<GastoFijo[]>([]);
  const [pendiente, setPendiente] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [modo, setModo] = useState<"lista" | "form">("lista");
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<Borrador>(VACIO);
  const [tasaInfo, setTasaInfo] = useState<{ fecha: string; usd: number; publicada: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/gastos-fijos", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudieron cargar los gastos fijos.");
      setGastos(d.gastos ?? []);
      setPendiente(!!d.pendiente);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los gastos fijos.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/gastos-fijos", { cache: "no-store" });
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok) throw new Error(d.error || "No se pudieron cargar los gastos fijos.");
        setGastos(d.gastos ?? []);
        setPendiente(!!d.pendiente);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudieron cargar los gastos fijos.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const pideTasa = f.moneda === "Bs" && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha);
  useEffect(() => {
    if (!pideTasa) return;
    let vivo = true;
    getTasaBcvPorFecha(f.fecha)
      .then((t) => {
        if (!vivo) return;
        setTasaInfo(t && t.usdBs > 0 ? { fecha: f.fecha, usd: t.usdBs, publicada: t.fecha } : null);
      })
      .catch(() => {
        if (vivo) setTasaInfo(null);
      });
    return () => {
      vivo = false;
    };
  }, [pideTasa, f.fecha]);
  const tasa = pideTasa && tasaInfo?.fecha === f.fecha ? tasaInfo.usd : null;
  const tasaFecha = tasa != null ? tasaInfo?.publicada ?? null : null;

  function abrirNuevo() {
    setEditId(null);
    setF({ ...VACIO, fecha: hoyCaracas() });
    setError(null);
    setMsg(null);
    setModo("form");
  }

  function abrirEdicion(g: GastoFijo) {
    setEditId(g.id);
    setF({
      categoria: g.categoria,
      monto: String(g.monto),
      moneda: g.moneda,
      fecha: g.fecha.slice(0, 10),
      nota: g.nota ?? "",
      recurrente: g.recurrente,
    });
    setError(null);
    setMsg(null);
    setModo("form");
  }

  const montoNum = Number(String(f.monto).replace(",", "."));
  const usdVista = Number.isFinite(montoNum) ? usdDesdeMonto(montoNum, f.moneda, f.moneda === "Bs" ? tasa : null) : null;

  async function guardar() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const cuerpo = {
        id: editId,
        categoria: f.categoria,
        monto: f.monto,
        moneda: f.moneda,
        fecha: f.fecha,
        nota: f.nota,
        recurrente: f.recurrente,
        tasa: f.moneda === "Bs" ? tasa : null,
      };
      const r = await fetch("/api/admin/gastos-fijos", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? cuerpo : { gasto: cuerpo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo guardar.");
      setMsg(editId ? "Gasto actualizado." : "Gasto fijo guardado.");
      setModo("lista");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function borrar(g: GastoFijo) {
    const nombre = etiquetaCategoria(g.categoria);
    if (!confirm(`¿Borrar ${nombre}${g.recurrente ? " de cada mes" : ""}? Deja de descontarse en Semana y en el estado de cuenta.`)) return;
    setError(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/gastos-fijos?id=${g.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo borrar.");
      setMsg("Gasto borrado.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-cacao-soft">
          El alquiler, la nómina y los servicios se anotan una vez. Si se repiten cada mes, Semana y el estado de cuenta los descuentan solos.
        </p>
        {modo === "lista" && (
          <button type="button" onClick={abrirNuevo} className="rounded-lg bg-cacao px-4 py-2 text-xs uppercase tracking-widest text-white hover:bg-terracotta">
            + Registrar gasto fijo
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-[#F9EBE7] p-3 text-sm text-[#7A2419] ring-1 ring-[#E8C5BC]">{error}</div>}
      {msg && <div className="rounded-lg bg-[#F1F4ED] p-3 text-sm text-[#2F4A1F] ring-1 ring-[#C9D6BC]">{msg}</div>}
      {pendiente && (
        <p className="rounded-2xl bg-[#FBF3E4] px-4 py-3 text-sm text-[#8A5A12] ring-1 ring-[#E6D3A8]">
          Falta aplicar la migración <span className="font-medium">supabase/admin-gastos-fijos.sql</span>. Cuando esté en la base, lo que anotes aquí se guarda y se descuenta.
        </p>
      )}

      {modo === "form" ? (
        <form
          className="max-w-lg space-y-3 rounded-2xl bg-white p-5 ring-1 ring-marfil"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <h2 className="font-display text-xs uppercase tracking-[0.3em] text-cacao-mute">{editId ? "Editar gasto fijo" : "Registrar gasto fijo"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-cacao">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-cacao-mute">Categoría</span>
              <select
                required
                value={f.categoria}
                onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaGasto | "" })}
                className="w-full rounded-lg border border-marfil bg-white px-2 py-2 text-sm text-cacao"
              >
                <option value="">Elegir…</option>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-cacao">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-cacao-mute">Fecha</span>
              <input
                required
                type="date"
                value={f.fecha}
                onChange={(e) => setF({ ...f, fecha: e.target.value })}
                className="w-full rounded-lg border border-marfil px-3 py-2 text-sm text-cacao"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-cacao">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-cacao-mute">Monto</span>
              <input
                required
                inputMode="decimal"
                value={f.monto}
                onChange={(e) => setF({ ...f, monto: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-lg border border-marfil px-3 py-2 text-sm text-cacao"
              />
            </label>
            <label className="block text-sm text-cacao">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-cacao-mute">Moneda</span>
              <select
                value={f.moneda}
                onChange={(e) => setF({ ...f, moneda: e.target.value as MonedaGasto })}
                className="w-full rounded-lg border border-marfil bg-white px-2 py-2 text-sm text-cacao"
              >
                <option value="USD">Dólares (USD)</option>
                <option value="Bs">Bolívares (Bs)</option>
              </select>
            </label>
          </div>
          {f.moneda === "Bs" && (
            <p className="text-[11px] leading-relaxed text-cacao-mute">
              {tasa
                ? `Tasa BCV del ${tasaFecha ?? f.fecha}: ${fmtBs(tasa)} por $1. Equivale a ${usdVista != null ? fmtUsd(usdVista) : "—"}.`
                : "Buscando la tasa BCV de esa fecha. Sin tasa no se puede pasar a dólares."}
            </p>
          )}
          {f.moneda === "USD" && usdVista != null && (
            <p className="text-[11px] text-cacao-mute">Se guarda {fmtUsd(usdVista)}.</p>
          )}
          <label className="flex items-start gap-2 text-sm text-cacao">
            <input
              type="checkbox"
              checked={f.recurrente}
              onChange={(e) => setF({ ...f, recurrente: e.target.checked })}
              className="mt-1"
            />
            <span>
              Se repite cada mes
              <span className="mt-0.5 block text-[11px] text-cacao-mute">El mismo monto entra todos los meses a partir de esta fecha. No hace falta cargarlo de nuevo.</span>
            </span>
          </label>
          <label className="block text-sm text-cacao">
            <span className="mb-1 block text-[10px] uppercase tracking-widest text-cacao-mute">Nota</span>
            <input
              value={f.nota}
              onChange={(e) => setF({ ...f, nota: e.target.value })}
              placeholder="Opcional. Por ejemplo, el local o la quincena."
              className="w-full rounded-lg border border-marfil px-3 py-2 text-sm text-cacao"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-cacao-mute">{CRITERIO_SEMANA}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || (f.moneda === "Bs" && usdVista == null)} className="rounded-lg bg-cacao px-4 py-2 text-xs uppercase tracking-widest text-white hover:bg-terracotta disabled:bg-marfil disabled:text-cacao-mute">
              {busy ? "Guardando…" : editId ? "Guardar cambios" : "Guardar gasto"}
            </button>
            <button type="button" onClick={() => setModo("lista")} className="rounded-lg px-4 py-2 text-xs uppercase tracking-widest text-cacao-soft ring-1 ring-marfil hover:bg-marfil-soft">
              Cancelar
            </button>
          </div>
        </form>
      ) : cargando ? (
        <p className="rounded-2xl bg-white p-5 font-serif italic text-cacao-soft ring-1 ring-marfil">Cargando…</p>
      ) : gastos.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-marfil">
          <p className="font-serif italic text-cacao-soft">Todavía no hay gastos fijos.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-cacao-soft">
            Anota el alquiler, la nómina y los servicios. Si marcas que se repiten cada mes, no tienes que cargarlos otra vez: la semana los reparte por día y el estado de cuenta descuenta el mes entero.
          </p>
          <button type="button" onClick={abrirNuevo} className="mt-4 rounded-full bg-cacao px-4 py-2 text-sm text-white hover:bg-terracotta">
            Registrar el primero
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-marfil overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
          {gastos.map((g) => (
            <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-cacao">
                  {etiquetaCategoria(g.categoria)}
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-marfil-soft px-2 py-0.5 align-middle text-[10px] uppercase tracking-widest text-cacao-soft">
                    <span className={`size-1.5 rounded-full ${g.recurrente ? "bg-terracotta" : "bg-cacao-mute"}`} />
                    {g.recurrente ? "Cada mes" : "Una vez"}
                  </span>
                </p>
                <p className="text-xs text-cacao-soft">
                  Desde {g.fecha.slice(0, 10)}
                  {g.moneda === "Bs" ? ` · ${fmtBs(g.monto)}` : ""}
                  {g.nota ? ` · ${g.nota}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-sm font-medium text-cacao">{fmtUsd(g.montoUsd)}</span>
                <button type="button" onClick={() => abrirEdicion(g)} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
                  Editar
                </button>
                <button type="button" onClick={() => void borrar(g)} className="text-sm text-cacao-soft hover:text-terracotta" aria-label="Borrar">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
