"use client";

// Conteo físico (reconciliación de inventario). Lista todos los insumos activos
// con su stock actual y un campo para el conteo real. Al guardar, fija el stock
// de cada uno al valor contado (RPC ajustar_stock_conteo, registra el ajuste).

import { useEffect, useMemo, useState } from "react";
import type { Insumo } from "@/lib/types";
import { stockLibre } from "@/lib/types";
import { listInsumos } from "@/lib/data/cocina";
import { ajustarStockConteo } from "@/lib/data/stock-movimientos";
import { ultimaVentaFecha } from "@/lib/data/ventas";
import { ErrorBanner } from "@/components/ErrorBanner";

// Formatea una fecha ISO (YYYY-MM-DD) a dd/mm/yyyy.
function fFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

// Formatea una cantidad de stock: entero si aplica, si no hasta 2 decimales.
function fNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function parse(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
// Categoría de compra del insumo (etiqueta para agrupar/filtrar el conteo).
const catDe = (i: Insumo) => (i.categoriaCompra ?? "").trim() || "Sin categoría";

export function ConteoFisicoClient() {
  const [items, setItems] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("todas");
  const [soloDif, setSoloDif] = useState(false);
  // Conteos escritos por el usuario: insumoId -> texto del input.
  const [conteos, setConteos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  // Fecha de la última venta importada = "corte" del stock del sistema.
  const [ultimaVenta, setUltimaVenta] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [ins, uv] = await Promise.all([listInsumos(), ultimaVentaFecha()]);
        if (!cancel) { setItems(ins.filter((i) => i.activo)); setUltimaVenta(uv); }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error cargando insumos");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Diferencia (nuevo - actual) para un insumo, o null si no hay conteo válido.
  function delta(ins: Insumo): number | null {
    const n = parse(conteos[ins.id] ?? "");
    if (n === null) return null;
    return n - ins.stockTotal;
  }

  // Categorías presentes (para el filtro).
  const categoriasEnUso = useMemo(
    () => Array.from(new Set(items.map(catDe))).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => filterCat === "todas" || catDe(i) === filterCat)
      .filter((i) => (q ? i.nombre.toLowerCase().includes(q) : true))
      .filter((i) => {
        if (!soloDif) return true;
        const d = delta(i);
        return d !== null && Math.abs(d) > 0.0001;
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, filterCat, soloDif, conteos]);

  // Agrupar por categoría de insumo para contar por tipo de producto.
  const grupos = useMemo(() => {
    const m = new Map<string, Insumo[]>();
    filtrados.forEach((i) => {
      const c = catDe(i);
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(i);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  // Resumen: cuántos tienen conteo y cuántos difieren del stock actual.
  const resumen = useMemo(() => {
    let conConteo = 0, conDif = 0;
    for (const i of items) {
      const n = parse(conteos[i.id] ?? "");
      if (n === null) continue;
      conConteo++;
      if (Math.abs(n - i.stockTotal) > 0.0001) conDif++;
    }
    return { conConteo, conDif };
  }, [items, conteos]);

  async function guardar() {
    setError(null);
    setResultado(null);
    // Solo los que tienen conteo válido Y difieren del stock actual.
    const cambios = items
      .map((i) => ({ ins: i, nuevo: parse(conteos[i.id] ?? "") }))
      .filter((c): c is { ins: Insumo; nuevo: number } => c.nuevo !== null)
      .filter((c) => Math.abs(c.nuevo - c.ins.stockTotal) > 0.0001);

    if (cambios.length === 0) {
      setResultado("No hay diferencias que guardar.");
      return;
    }
    setGuardando(true);
    let ok = 0;
    const fallidos: string[] = [];
    for (const c of cambios) {
      try {
        const nuevoStock = await ajustarStockConteo(c.ins.id, c.nuevo);
        ok++;
        setItems((prev) => prev.map((x) => (x.id === c.ins.id ? { ...x, stockTotal: nuevoStock } : x)));
        setConteos((prev) => { const n = { ...prev }; delete n[c.ins.id]; return n; });
      } catch {
        fallidos.push(c.ins.nombre);
      }
    }
    setGuardando(false);
    setResultado(
      `${ok} insumo${ok === 1 ? "" : "s"} ajustado${ok === 1 ? "" : "s"} al conteo.` +
        (fallidos.length ? ` No se pudo con: ${fallidos.join(", ")}.` : ""),
    );
  }

  // Exporta la plantilla de conteo (.xlsx) con el stock actual: se llena la
  // columna `conteo_fisico` afuera y se vuelve a importar. Empareja por `id`.
  async function exportarPlantilla() {
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const filas = [...items]
        .sort((a, b) => catDe(a).localeCompare(catDe(b)) || a.nombre.localeCompare(b.nombre))
        .map((i) => ({
          id: i.id,
          categoria: catDe(i),
          nombre: i.nombre,
          unidad_base: i.unidadBase,
          total_sistema: i.stockTotal,
          comprometido: i.stockComprometido,
          libre_sistema: stockLibre(i),
          conteo_fisico: "",
        }));
      const ws = XLSX.utils.json_to_sheet(filas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "conteo");
      XLSX.writeFile(wb, `Conteo_Insumos_${new Date().toISOString().slice(0, 7)}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar la plantilla.");
    }
  }

  // Importa un conteo desde el .xlsx (la plantilla llena). Empareja por `id`,
  // lee la columna `conteo_fisico`, y PRE-LLENA el formulario (no guarda solo):
  // el usuario revisa las diferencias abajo y le da "Guardar conteo".
  async function importarConteo(file: File) {
    setError(null); setResultado(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("El archivo no tiene ninguna hoja.");
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const ids = new Set(items.map((i) => i.id));
      const nuevos: Record<string, string> = {};
      let ok = 0, sinValor = 0, noHallados = 0;
      for (const r of filas) {
        const id = String(r.id ?? r.ID ?? "").trim();
        const val = parse(String(r.conteo_fisico ?? r.conteo ?? r.conteo_real ?? ""));
        if (!id) continue;
        if (val === null) { sinValor++; continue; }
        if (!ids.has(id)) { noHallados++; continue; }
        nuevos[id] = String(val);
        ok++;
      }
      if (ok === 0) throw new Error("No encontré conteos válidos. Revisa que el archivo tenga las columnas 'id' y 'conteo_fisico'.");
      setConteos((prev) => ({ ...prev, ...nuevos }));
      setResultado(
        `Cargué ${ok} conteo${ok === 1 ? "" : "s"} del Excel.` +
          (noHallados ? ` ${noHallados} id(s) no coincidieron (insumo inactivo o borrado).` : "") +
          (sinValor ? ` ${sinValor} sin valor (ignoradas).` : "") +
          ` Revisa abajo y dale "Guardar conteo".`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }

  if (loading) {
    return <div className="rounded-2xl bg-white ring-1 ring-marfil p-10 text-center text-cacao-soft">Cargando insumos…</div>;
  }

  const selCls = "rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white";

  return (
    <div className="space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Corte de ventas: recordatorio de timing para que la merma sea exacta. */}
      <div className="rounded-xl bg-[#FBF3E2] ring-1 ring-[#E8D9B0] px-3 py-2 text-[12px] text-[#7A5A18]">
        {ultimaVenta ? (
          <>Ventas importadas hasta el <b>{fFecha(ultimaVenta)}</b> — el stock del sistema refleja las ventas hasta esa fecha. </>
        ) : (
          <>Aún no hay ventas importadas. </>
        )}
        Para una merma exacta, cuenta <b>antes de abrir</b>, después de importar el día anterior (así el sistema y el estante coinciden).
      </div>

      {/* Controles + resumen (sticky) */}
      <div className="sticky top-0 z-10 rounded-2xl bg-white/95 backdrop-blur ring-1 ring-marfil p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo…"
            className="flex-1 min-w-[160px] rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
          />
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className={selCls}>
            <option value="todas">Todas las categorías</option>
            {categoriasEnUso.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-cacao-soft cursor-pointer">
            <input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} className="accent-cacao" />
            Solo con diferencia
          </label>
        </div>
        {/* Conteo por Excel: exportar plantilla → llenar 'conteo_fisico' → importar. */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportarPlantilla} className="rounded-lg ring-1 ring-marfil text-cacao px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-marfil-soft">Exportar plantilla (Excel)</button>
          <label className="rounded-lg ring-1 ring-marfil text-cacao px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-marfil-soft cursor-pointer">
            Importar conteo (Excel)
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarConteo(f); e.target.value = ""; }} />
          </label>
          <span className="text-[10px] text-cacao-mute">Exporta → llena la columna <b>conteo_fisico</b> → importa. Empareja por id.</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-cacao-soft">
            <span className="text-cacao font-medium">{resumen.conConteo}</span> con conteo ·{" "}
            <span className={resumen.conDif > 0 ? "text-terracotta font-medium" : "text-cacao-soft"}>{resumen.conDif}</span> con diferencia
          </p>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || resumen.conDif === 0}
            className="rounded-lg bg-cacao text-white px-4 py-2 text-xs uppercase tracking-widest hover:bg-terracotta disabled:opacity-40"
          >
            {guardando ? "Guardando…" : `Guardar conteo${resumen.conDif > 0 ? ` (${resumen.conDif})` : ""}`}
          </button>
        </div>
        {resultado && (
          <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] px-3 py-2 text-sm text-[#2F4A1F]">{resultado}</div>
        )}
      </div>

      <p className="text-[11px] text-cacao-mute px-1">
        Escribí lo que tenés físicamente (en la unidad indicada). Deja en blanco lo
        que no cuentes — solo se ajustan los que escribas y difieran del actual.
        El comprometido (reservado por planes) no se toca.
      </p>

      {grupos.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-10 text-center font-serif italic text-cacao-soft">
          {soloDif ? "Ningún insumo con diferencia." : "Sin insumos que coincidan."}
        </div>
      ) : (
        grupos.map(([cat, list]) => (
          <section key={cat} className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden">
            <header className="px-4 py-2.5 border-b border-marfil bg-marfil-soft/50">
              <span className="font-display text-xs tracking-[0.3em] uppercase text-cacao">{cat}</span>
              <span className="text-[11px] text-cacao-mute ml-2">{list.length}</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cacao-mute uppercase tracking-widest text-[10px] text-left">
                    <th className="py-2 px-3 font-normal">Insumo</th>
                    <th className="py-2 px-3 font-normal text-right">Físico (app)</th>
                    <th className="py-2 px-3 font-normal">Conteo real</th>
                    <th className="py-2 px-3 font-normal text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((ins) => {
                    const d = delta(ins);
                    const libre = stockLibre(ins);
                    return (
                      <tr key={ins.id} className="border-t border-marfil">
                        <td className="py-1.5 px-3 text-cacao">
                          {ins.nombre}
                          {ins.stockComprometido > 0 && (
                            <span className="block text-[10px] text-cacao-mute">
                              libre {fNum(libre)} · reservado {fNum(ins.stockComprometido)}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-cacao-soft whitespace-nowrap">
                          {fNum(ins.stockTotal)} <span className="text-cacao-mute text-xs">{ins.unidadBase}</span>
                        </td>
                        <td className="py-1.5 px-3">
                          <div className="flex items-center gap-1">
                            <input
                              inputMode="decimal"
                              value={conteos[ins.id] ?? ""}
                              onChange={(e) => setConteos((prev) => ({ ...prev, [ins.id]: e.target.value }))}
                              placeholder="—"
                              className="w-24 rounded-lg ring-1 ring-marfil px-2 py-1 text-sm text-right tabular-nums focus:ring-cacao"
                            />
                            <span className="text-cacao-mute text-xs">{ins.unidadBase}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">
                          {d === null || Math.abs(d) < 0.0001 ? (
                            <span className="text-cacao-mute">—</span>
                          ) : (
                            <span className={d > 0 ? "text-oliva" : "text-terracotta"}>
                              {d > 0 ? "+" : ""}{fNum(d)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
