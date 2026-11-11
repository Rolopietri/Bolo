"use client";

// Conteo físico (reconciliación de inventario). Lista todos los insumos activos
// con su stock actual y un campo para el conteo real. Al guardar, fija el stock
// de cada uno al valor contado (RPC ajustar_stock_conteo, registra el ajuste).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Insumo } from "@/lib/types";
import { stockLibre } from "@/lib/types";
import { listInsumos } from "@/lib/data/cocina";
import { ajustarStockConteo } from "@/lib/data/stock-movimientos";
import { ultimaVentaFecha } from "@/lib/data/ventas";
import { ErrorBanner } from "@/components/ErrorBanner";
import { extractError } from "@/lib/data/error";
import { ErrorCarga } from "@/components/ErrorCarga";
import { ChevronIcon } from "@/components/icons";

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
  /** Error al CARGAR la pantalla (distinto de los errores al guardar). */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [search, setSearch] = useState("");
  const [soloDif, setSoloDif] = useState(false);
  // Acordeón: al entrar no se muestra ninguna categoría. "Todas las categorías"
  // abre la lista de categorías; cada categoría abre sus insumos. Los conteos
  // viven en `conteos`, no en el input, así que cerrar no los borra.
  const [listaAbierta, setListaAbierta] = useState(false);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
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
        if (!cancel) setErrorCarga(extractError(e, "Error cargando insumos"));
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

  // Diferencia (nuevo - actual) para un insumo, o null si no hay conteo válido.
  function delta(ins: Insumo): number | null {
    const n = parse(conteos[ins.id] ?? "");
    if (n === null) return null;
    return n - ins.stockTotal;
  }

  const consulta = search.trim().toLowerCase();
  // La búsqueda y "solo con diferencia" muestran filas aunque el acordeón
  // siga cerrado. Si no hay ninguna de las dos, las filas dependen del toque.
  const revelarFilas = consulta !== "" || soloDif;

  const filtrados = useMemo(() => {
    return items
      .filter((i) => (consulta ? i.nombre.toLowerCase().includes(consulta) : true))
      .filter((i) => {
        if (!soloDif) return true;
        const d = delta(i);
        return d !== null && Math.abs(d) > 0.0001;
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, consulta, soloDif, conteos]);

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
      // El Excel pre-llena el formulario: abre esas categorías para poder revisarlas.
      setListaAbierta(true);
      setAbiertas((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(nuevos)) {
          const ins = items.find((i) => i.id === id);
          if (ins) next[catDe(ins)] = true;
        }
        return next;
      });
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
  if (errorCarga) {
    return (
      <ErrorCarga
        que="los insumos para el conteo"
        detalle={errorCarga}
        onReintentar={reintentarCarga}
      />
    );
  }


  const mostrarCategorias = listaAbierta || revelarFilas;

  function toggleCategoria(cat: string) {
    setAbiertas((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Una sola caja al entrar: buscar, categorías y guardar. El listado
          queda abajo y cerrado hasta que la persona lo pida. */}
      <section className="z-20 overflow-hidden rounded-2xl bg-white/95 ring-1 ring-marfil backdrop-blur lg:sticky lg:top-16">
        <div className="border-b border-[#E8D9B0] bg-[#FBF3E2] px-3 py-2 text-[12px] text-[#7A5A18]">
          {ultimaVenta ? (
            <>Ventas importadas hasta el <b>{fFecha(ultimaVenta)}</b> — el stock del sistema refleja las ventas hasta esa fecha. </>
          ) : (
            <>Aún no hay ventas importadas. </>
          )}
          Para una merma exacta, cuenta <b>antes de abrir</b>, después de importar el día anterior (así el sistema y el estante coinciden).
        </div>

        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar insumos"
              aria-label="Buscar insumos"
              className="min-h-11 min-w-[160px] flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-marfil"
            />
            <button
              type="button"
              aria-expanded={listaAbierta}
              aria-controls="conteo-categorias"
              onClick={() => setListaAbierta((v) => !v)}
              // #c94316 es el naranja de bolo, un poco más oscuro que el acento
              // para que el texto blanco tenga contraste suficiente.
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#c94316] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#9a3410] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a3410]"
            >
              Todas las categorías
              <ChevronIcon className={`size-4 transition-transform ${listaAbierta ? "rotate-90" : ""}`} />
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-cacao-soft">
              <input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} className="accent-cacao" />
              Solo con diferencia
            </label>
          </div>
          {/* Conteo por Excel: exportar plantilla → llenar 'conteo_fisico' → importar. */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={exportarPlantilla} className="rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-widest text-cacao ring-1 ring-marfil hover:bg-marfil-soft">Exportar plantilla (Excel)</button>
            <label className="cursor-pointer rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-widest text-cacao ring-1 ring-marfil hover:bg-marfil-soft">
              Importar conteo (Excel)
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarConteo(f); e.target.value = ""; }} />
            </label>
            <span className="text-[10px] text-cacao-mute">Exporta → llena la columna <b>conteo_fisico</b> → importa. Empareja por id.</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-cacao-soft">
              <span className="font-medium text-cacao">{resumen.conConteo}</span> con conteo ·{" "}
              <span className={resumen.conDif > 0 ? "font-medium text-terracotta" : "text-cacao-soft"}>{resumen.conDif}</span> con diferencia
            </p>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || resumen.conDif === 0}
              className="rounded-lg bg-cacao px-4 py-2 text-xs uppercase tracking-widest text-white hover:bg-terracotta disabled:opacity-40"
            >
              {guardando ? "Guardando…" : `Guardar conteo${resumen.conDif > 0 ? ` (${resumen.conDif})` : ""}`}
            </button>
          </div>
          {resultado && (
            <div className="rounded-lg bg-[#F1F4ED] px-3 py-2 text-sm text-[#2F4A1F] ring-1 ring-[#C9D6BC]">{resultado}</div>
          )}
          {!mostrarCategorias && items.length > 0 && (
            <p className="text-[11px] text-cacao-mute">
              Toca <b className="text-cacao">Todas las categorías</b> o busca un insumo. Lo que anotes se conserva al cerrar.
            </p>
          )}
        </div>
      </section>

      {mostrarCategorias && (
        <p className="px-1 text-[11px] text-cacao-mute">
          Escribe lo que tienes físicamente (en la unidad indicada). Deja en blanco lo
          que no cuentes — solo se ajustan los que escribas y difieran del actual.
          {/* Solo hay stock reservado cuando se usan Planes de producción. */}
          {items.some((i) => i.stockComprometido > 0) &&
            " El comprometido (reservado por planes) no se toca."}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center font-serif italic text-cacao-soft ring-1 ring-marfil">
          Aún no tienes insumos para contar.{" "}
          <Link href="/cocina/insumos" className="font-semibold not-italic underline hover:text-terracotta">
            Crear el primer insumo
          </Link>
        </div>
      ) : mostrarCategorias && grupos.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center font-serif italic text-cacao-soft ring-1 ring-marfil">
          {soloDif && consulta === "" ? "Ningún insumo con diferencia." : "Sin insumos que coincidan."}
        </div>
      ) : mostrarCategorias ? (
        <div id="conteo-categorias" className="space-y-3">
          {grupos.map(([cat, list]) => {
            const abierta = revelarFilas || !!abiertas[cat];
            const anotados = list.filter((i) => (conteos[i.id] ?? "").trim() !== "").length;
            return (
              <section key={cat} className="overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
                <h2>
                  <button
                    type="button"
                    aria-expanded={abierta}
                    onClick={() => toggleCategoria(cat)}
                    className="flex w-full items-center gap-2 bg-marfil-soft/50 px-4 py-3 text-left hover:bg-marfil-soft"
                  >
                    <ChevronIcon className={`size-4 shrink-0 text-cacao-soft transition-transform ${abierta ? "rotate-90" : ""}`} />
                    <span className="font-display text-xs uppercase tracking-[0.3em] text-cacao">{cat}</span>
                    <span className="text-[11px] text-cacao-mute">{list.length}</span>
                    {anotados > 0 && (
                      <span className="ml-auto text-[11px] text-cacao-soft">
                        {anotados} anotado{anotados === 1 ? "" : "s"}
                      </span>
                    )}
                  </button>
                </h2>
                {abierta && (
                  <div className="overflow-x-auto border-t border-marfil">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-widest text-cacao-mute">
                          <th className="px-3 py-2 font-normal">Insumo</th>
                          <th className="px-3 py-2 text-right font-normal">Físico (app)</th>
                          <th className="px-3 py-2 font-normal">Conteo real</th>
                          <th className="px-3 py-2 text-right font-normal">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((ins) => {
                          const d = delta(ins);
                          const libre = stockLibre(ins);
                          return (
                            <tr key={ins.id} className="border-t border-marfil">
                              <td className="px-3 py-1.5 text-cacao">
                                {ins.nombre}
                                {ins.stockComprometido > 0 && (
                                  <span className="block text-[10px] text-cacao-mute">
                                    libre {fNum(libre)} · reservado {fNum(ins.stockComprometido)}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-cacao-soft">
                                {fNum(ins.stockTotal)} <span className="text-xs text-cacao-mute">{ins.unidadBase}</span>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    inputMode="decimal"
                                    value={conteos[ins.id] ?? ""}
                                    onChange={(e) => setConteos((prev) => ({ ...prev, [ins.id]: e.target.value }))}
                                    placeholder="—"
                                    aria-label={`Conteo de ${ins.nombre}`}
                                    className="w-24 rounded-lg px-2 py-1 text-right text-sm tabular-nums ring-1 ring-marfil focus:ring-cacao"
                                  />
                                  <span className="text-xs text-cacao-mute">{ins.unidadBase}</span>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
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
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
