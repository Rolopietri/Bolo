"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Insumo, Receta, CocinaConfig } from "@/lib/types";
import { calcRentabilidad } from "@/lib/types";
import {
  listRecetas,
  createReceta,
  calcularCostoReceta,
} from "@/lib/data/recetas";
import { listInsumos } from "@/lib/data/cocina";
import { getCocinaConfig } from "@/lib/data/cocinaConfig";
import { UNIDADES_COMUNES } from "@/lib/units";

/**
 * Pantalla "Crear un plato y ver su costo".
 *
 * Puerta de entrada SIMPLE al recetario que ya existe: usa el mismo motor de
 * costo (`calcularCostoReceta`), la misma rentabilidad (`calcRentabilidad`) y
 * guarda con `createReceta`, así el plato aparece también en Costeo y
 * Rentabilidad. No reemplaza nada — es la vista fácil por encima.
 *
 * Dos vistas, como en presupuestos:
 *   • simple   → solo el resultado, sin matemática a la vista.
 *   • desglose → la cuenta paso a paso, editable.
 */

type Linea = {
  key: number;
  insumoId: string; // "" = a mano
  nombre: string;
  cantidad: string;
  unidad: string;
  precioManual: string; // precio por unidad, solo si es "a mano"
};

const nuevaLinea = (key: number): Linea => ({
  key,
  insumoId: "",
  nombre: "",
  cantidad: "",
  unidad: "",
  precioManual: "",
});

function money(n: number): string {
  if (!isFinite(n)) n = 0;
  return "$" + n.toFixed(2);
}

/** minúsculas + sin acentos, para buscar sin que importe la tilde. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const SEMAFORO: Record<
  string,
  { pill: string; dot: string; texto: string }
> = {
  verde: {
    pill: "bg-[#e7f2ea] text-[#2f7a49]",
    dot: "bg-[#3f8f5b]",
    texto: "Buena ganancia",
  },
  amarillo: {
    pill: "bg-[#f7eed6] text-[#a9760f]",
    dot: "bg-[#c98a1e]",
    texto: "Cuidado, poca ganancia",
  },
  rojo: {
    pill: "bg-[#f6e2dc] text-[#a5341f]",
    dot: "bg-[#c0472f]",
    texto: "Ojo: casi no ganas",
  },
  sin_precio: {
    pill: "bg-marfil-light text-cacao-soft",
    dot: "bg-cacao-mute",
    texto: "Ponle un precio de venta",
  },
};

export function PlatoClient() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [cfg, setCfg] = useState<CocinaConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [nombre, setNombre] = useState("");
  const [porciones, setPorciones] = useState("1");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [precioVenta, setPrecioVenta] = useState("");
  const [vista, setVista] = useState<"simple" | "desglose">("simple");

  // Buscador de ingredientes
  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState("");
  const [catFiltro, setCatFiltro] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [guardadoId, setGuardadoId] = useState("");
  const [errorGuardar, setErrorGuardar] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [ins, recs, c] = await Promise.all([
          listInsumos(),
          listRecetas(),
          getCocinaConfig(),
        ]);
        if (!vivo) return;
        setInsumos(ins);
        setRecetas(recs);
        setCfg(c);
      } catch (e) {
        if (vivo)
          setErrorCarga(
            e instanceof Error ? e.message : "No se pudo cargar la información.",
          );
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Insumo>();
    for (const i of insumos) m.set(i.id, i);
    return m;
  }, [insumos]);

  // Categorías presentes en el catálogo (para los chips del buscador): la
  // misma categoría que se edita en Insumos.
  const categorias = useMemo(() => {
    const s = new Set<string>();
    for (const i of insumos) {
      const c = i.categoriaCompra?.trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }, [insumos]);

  // Resultado del buscador: por palabra y/o por categoría.
  const insumosFiltrados = useMemo(
    () =>
      insumos.filter(
        (i) =>
          (catFiltro === "" || i.categoriaCompra?.trim() === catFiltro) &&
          (query.trim() === "" || norm(i.nombre).includes(norm(query))),
      ),
    [insumos, catFiltro, query],
  );

  // Receta en memoria para el motor de costo (mismo que usa Costeo).
  const receta = useMemo<Receta>(
    () => ({
      id: "nuevo",
      nombre: nombre || "Plato sin nombre",
      porciones: Math.max(1, Number(porciones) || 1),
      esSubreceta: false,
      activo: true,
      createdAt: "",
      ingredientes: lineas.map((l, i) => ({
        id: "tmp" + l.key,
        insumoId: l.insumoId || undefined,
        nombre: l.nombre.trim() || byId.get(l.insumoId)?.nombre || "",
        cantidad: Number(l.cantidad) || 0,
        unidad: l.unidad || byId.get(l.insumoId)?.unidadBase || "",
        costoManualUsd: l.insumoId ? undefined : Number(l.precioManual) || undefined,
        orden: i,
      })),
    }),
    [nombre, porciones, lineas, byId],
  );

  const costo = useMemo(
    () => calcularCostoReceta(receta, insumos, recetas),
    [receta, insumos, recetas],
  );

  const rent = useMemo(
    () =>
      cfg
        ? calcRentabilidad(
            costo.porPorcion,
            precioVenta === "" ? null : Number(precioVenta),
            cfg,
          )
        : null,
    [cfg, costo.porPorcion, precioVenta],
  );

  const sem = SEMAFORO[rent?.semaforo ?? "sin_precio"] ?? SEMAFORO.sin_precio;
  const precioNum = precioVenta === "" ? 0 : Number(precioVenta) || 0;
  const ganancia = precioNum - costo.porPorcion;

  // ── Handlers de líneas ────────────────────────────────────────────
  function setLinea(key: number, patch: Partial<Linea>) {
    setLineas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }
  function agregarInsumo(insumoId: string) {
    const ins = byId.get(insumoId);
    setLineas((prev) => [
      ...prev,
      {
        key: (prev[prev.length - 1]?.key ?? 0) + 1,
        insumoId,
        nombre: ins?.nombre ?? "",
        cantidad: "",
        unidad: ins?.unidadBase ?? "",
        precioManual: "",
      },
    ]);
    setQuery("");
  }
  function agregarManual() {
    setLineas((prev) => [
      ...prev,
      nuevaLinea((prev[prev.length - 1]?.key ?? 0) + 1),
    ]);
    setBuscando(false);
    setQuery("");
    setCatFiltro("");
  }
  function quitarLinea(key: number) {
    setLineas((prev) =>
      prev.length > 1 ? prev.filter((l) => l.key !== key) : prev,
    );
  }
  function unidadesDe(l: Linea): string[] {
    const set = new Set<string>();
    const base = l.insumoId ? byId.get(l.insumoId)?.unidadBase : "";
    if (base) set.add(base);
    for (const u of UNIDADES_COMUNES) set.add(u);
    if (l.unidad) set.add(l.unidad);
    return Array.from(set);
  }

  // ── Guardar (crea la receta real) ─────────────────────────────────
  async function guardar() {
    setErrorGuardar("");
    if (!nombre.trim()) {
      setErrorGuardar("Ponle un nombre al plato.");
      return;
    }
    const ings = lineas
      .filter((l) => l.insumoId || l.nombre.trim())
      .map((l, i) => {
        const ins = l.insumoId ? byId.get(l.insumoId) : undefined;
        const precio = Number(l.precioManual) || 0;
        return {
          insumoId: l.insumoId || undefined,
          nombre: l.nombre.trim() || ins?.nombre || "Ingrediente",
          cantidad: Number(l.cantidad) || 0,
          unidad: l.unidad || ins?.unidadBase || "",
          costoManualUsd: l.insumoId ? undefined : precio || undefined,
          // Sin insumo y sin precio → línea informativa (no suma costo ni alerta).
          sinInsumoOk: !l.insumoId && precio <= 0 ? true : undefined,
          orden: i,
        };
      });
    if (ings.length === 0) {
      setErrorGuardar("Agrega al menos un ingrediente.");
      return;
    }
    setGuardando(true);
    try {
      const created = await createReceta({
        nombre: nombre.trim(),
        porciones: Math.max(1, Number(porciones) || 1),
        precioSugeridoUsd: precioVenta === "" ? undefined : Number(precioVenta),
        esSubreceta: false,
        ingredientes: ings,
      });
      setGuardadoId(created.id);
    } catch (e) {
      setErrorGuardar(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Intenta de nuevo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  // ── Estados de pantalla ───────────────────────────────────────────
  if (cargando) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando tus ingredientes…
      </div>
    );
  }
  if (errorCarga) {
    return (
      <div className="rounded-2xl bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-6 text-[#7A2419]">
        <p className="font-bold">No se pudo cargar la información.</p>
        <p className="mt-1 text-sm">{errorCarga}</p>
      </div>
    );
  }
  if (guardadoId) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-7 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e7f2ea] text-[#2f7a49] text-2xl">
          ✓
        </div>
        <h2 className="mt-4 font-cinzel text-2xl text-cacao">
          ¡Plato guardado!
        </h2>
        <p className="mt-2 text-cacao-soft">
          “{nombre}” quedó en tu recetario. Ya puedes verlo en Costeo y
          Rentabilidad.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/cocina/recetas?highlight=${guardadoId}`}
            className="rounded-xl bg-terracotta text-white py-3 font-bold hover:bg-terracotta-deep transition-colors"
          >
            Ver en el recetario
          </Link>
          <button
            onClick={() => {
              setGuardadoId("");
              setNombre("");
              setPorciones("1");
              setLineas([]);
              setPrecioVenta("");
              setVista("simple");
              setBuscando(false);
              setQuery("");
              setCatFiltro("");
            }}
            className="rounded-xl ring-1 ring-marfil py-3 font-bold text-cacao hover:bg-marfil-soft transition-colors"
          >
            Crear otro plato
          </button>
        </div>
      </div>
    );
  }

  const catalogoVacio = insumos.length === 0;

  // ── Formulario ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-cinzel text-3xl text-cacao">Crear un plato</h1>
        <p className="mt-1 text-cacao-soft">
          Escribe qué lleva. bolo saca el costo real y te dice a qué precio
          venderlo para ganar.
        </p>
      </header>

      {/* Nombre + porciones */}
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-4 shadow-sm space-y-3">
        <label className="block">
          <span className="text-sm font-bold text-cacao-soft">
            Nombre del plato
          </span>
          <input
            id="plato-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Hamburguesa clásica"
            className="mt-1.5 w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-lg font-cinzel text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
          />
        </label>
        <label className="flex items-center gap-3">
          <span className="text-sm font-bold text-cacao-soft">
            ¿Cuántos platos salen de esta receta?
          </span>
          <input
            id="plato-porciones"
            inputMode="numeric"
            value={porciones}
            onChange={(e) => setPorciones(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-16 rounded-xl ring-1 ring-marfil px-3 py-2 text-center font-bold text-cacao focus:outline-none focus:ring-2 focus:ring-terracotta tabular-nums"
          />
        </label>
      </div>

      {/* Vistas */}
      <div className="flex gap-1.5 rounded-2xl bg-marfil-light ring-1 ring-marfil p-1.5">
        <button
          onClick={() => setVista("simple")}
          aria-pressed={vista === "simple"}
          className={
            "flex-1 rounded-xl py-2.5 font-bold text-sm transition-colors " +
            (vista === "simple"
              ? "bg-white text-cacao shadow-sm"
              : "text-cacao-soft")
          }
        >
          Simple
        </button>
        <button
          onClick={() => setVista("desglose")}
          aria-pressed={vista === "desglose"}
          className={
            "flex-1 rounded-xl py-2.5 font-bold text-sm transition-colors " +
            (vista === "desglose"
              ? "bg-white text-cacao shadow-sm"
              : "text-cacao-soft")
          }
        >
          Ver el desglose
        </button>
      </div>

      {catalogoVacio && (
        <div className="rounded-xl bg-marfil-soft ring-1 ring-marfil px-4 py-3 text-sm text-cacao-soft">
          Aún no tienes ingredientes en tu catálogo. Puedes escribirlos a mano
          aquí (con su precio), o cargarlos en{" "}
          <Link href="/cocina/catalogo" className="font-bold text-terracotta-deep underline">
            Insumos e Inventario
          </Link>
          .
        </div>
      )}

      {/* SIMPLE */}
      {vista === "simple" && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-6 shadow-sm">
          <p className="text-sm font-bold text-cacao-soft">Tu plato cuesta</p>
          <p className="font-cinzel text-5xl text-cacao tabular-nums leading-none">
            {money(costo.porPorcion)}
          </p>
          <div
            className={
              "mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-2 font-bold text-sm " +
              sem.pill
            }
          >
            <span className={"h-2.5 w-2.5 rounded-full " + sem.dot} />
            {sem.texto}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-px bg-marfil rounded-xl overflow-hidden ring-1 ring-marfil">
            <Celda k="Precio sugerido" v={money(rent?.precioSugeridoAlObjetivo ?? 0)} orange />
            <Celda k="Tu precio de venta" v={precioVenta === "" ? "—" : money(precioNum)} />
            <Celda k="Ganas por plato" v={money(ganancia)} />
            <Celda
              k="El costo se lleva"
              v={
                rent && rent.foodCostPorc != null && rent.foodCostPorc > 0
                  ? Math.round(rent.foodCostPorc) + "%"
                  : "—"
              }
            />
          </div>
          {lineas.length === 0 ? (
            <button
              onClick={() => setVista("desglose")}
              className="mt-4 w-full rounded-xl ring-1 ring-marfil bg-marfil-soft py-3 font-bold text-terracotta-deep hover:ring-terracotta"
            >
              Agrega los ingredientes del plato →
            </button>
          ) : (
            <p className="mt-3 text-xs text-cacao-mute">
              Sin cuentas a la vista. Toca “Ver el desglose” para revisar de
              dónde sale cada número.
            </p>
          )}
        </section>
      )}

      {/* DESGLOSE */}
      {vista === "desglose" && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="font-bold text-cacao">Lo que lleva el plato</span>
            <span className="text-xs font-bold text-cacao-mute">
              Toca un número para cambiarlo
            </span>
          </div>

          {lineas.length === 0 && (
            <p className="border-t border-marfil-light px-4 py-6 text-center text-sm text-cacao-soft">
              Aún no agregaste ingredientes. Toca{" "}
              <b>“+ Agregar ingrediente”</b>.
            </p>
          )}

          <div>
            {lineas.map((l, i) => {
              const ins = l.insumoId ? byId.get(l.insumoId) : undefined;
              const subtotal = costo.lineas[i]?.costoSubtotal ?? 0;
              return (
                <div
                  key={l.key}
                  className="border-t border-marfil-light px-4 py-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    {l.insumoId ? (
                      <span className="font-bold text-cacao pt-1">
                        {byId.get(l.insumoId)?.nombre ?? l.nombre}
                      </span>
                    ) : (
                      <input
                        aria-label="Nombre del ingrediente"
                        value={l.nombre}
                        onChange={(e) =>
                          setLinea(l.key, { nombre: e.target.value })
                        }
                        placeholder="Nombre del ingrediente"
                        className="flex-1 min-w-0 rounded-lg ring-1 ring-marfil bg-marfil-soft px-2.5 py-2 font-bold text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
                      />
                    )}
                    <span className="font-cinzel text-lg text-cacao tabular-nums whitespace-nowrap pt-1">
                      {money(subtotal)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-cacao-mute">
                        Cantidad
                      </span>
                      <div className="flex items-center rounded-lg ring-1 ring-marfil bg-marfil-soft px-2">
                        <input
                          aria-label="Cantidad"
                          inputMode="decimal"
                          value={l.cantidad}
                          onChange={(e) =>
                            setLinea(l.key, {
                              cantidad: e.target.value
                                .replace(/[^0-9.,]/g, "")
                                .replace(/,/g, "."),
                            })
                          }
                          className="w-16 bg-transparent py-2 text-right font-bold text-cacao focus:outline-none tabular-nums"
                        />
                        <select
                          aria-label="Unidad"
                          value={l.unidad}
                          onChange={(e) => setLinea(l.key, { unidad: e.target.value })}
                          className="bg-transparent py-2 pl-1 text-sm font-bold text-cacao-soft focus:outline-none"
                        >
                          <option value="">u.</option>
                          {unidadesDe(l).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-cacao-mute">
                        {l.insumoId ? "Precio (del catálogo)" : "Precio por unidad"}
                      </span>
                      <div className="flex items-center rounded-lg ring-1 ring-marfil bg-marfil-soft px-2">
                        <span className="text-cacao-mute font-bold">$</span>
                        <input
                          aria-label="Precio"
                          inputMode="decimal"
                          disabled={!!l.insumoId}
                          value={
                            l.insumoId
                              ? ins?.precioBaseUsd != null
                                ? String(ins.precioBaseUsd)
                                : ""
                              : l.precioManual
                          }
                          onChange={(e) =>
                            setLinea(l.key, {
                              precioManual: e.target.value
                                .replace(/[^0-9.,]/g, "")
                                .replace(/,/g, "."),
                            })
                          }
                          className="w-20 bg-transparent py-2 text-right font-bold text-cacao focus:outline-none disabled:text-cacao-soft tabular-nums"
                        />
                        {l.insumoId && ins && (
                          <span className="pl-1 text-xs text-cacao-mute whitespace-nowrap">
                            /{ins.unidadBase}
                          </span>
                        )}
                      </div>
                    </label>

                    <button
                      onClick={() => quitarLinea(l.key)}
                      aria-label="Quitar ingrediente"
                      className="ml-auto rounded-lg px-2.5 py-2 text-cacao-mute hover:text-[#c0472f] hover:bg-marfil-soft"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {buscando ? (
            <div className="border-t border-marfil-light bg-marfil-soft p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  aria-label="Buscar ingrediente"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar ingrediente…"
                  className="flex-1 rounded-xl ring-1 ring-marfil bg-white px-3.5 py-2.5 text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
                />
                <button
                  onClick={() => {
                    setBuscando(false);
                    setQuery("");
                    setCatFiltro("");
                  }}
                  className="rounded-xl px-3 py-2.5 font-bold text-cacao-soft hover:text-cacao"
                >
                  Listo
                </button>
              </div>

              {categorias.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <Chip activo={catFiltro === ""} onClick={() => setCatFiltro("")}>
                    Todas
                  </Chip>
                  {categorias.map((c) => (
                    <Chip
                      key={c}
                      activo={catFiltro === c}
                      onClick={() => setCatFiltro(c)}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
              )}

              <div className="max-h-64 overflow-y-auto rounded-xl ring-1 ring-marfil bg-white divide-y divide-marfil-light">
                {insumosFiltrados.length === 0 && (
                  <p className="px-3 py-3 text-sm text-cacao-soft">
                    {insumos.length === 0
                      ? "Tu catálogo está vacío — escribe el ingrediente a mano."
                      : "No encontré ese ingrediente."}
                  </p>
                )}
                {insumosFiltrados.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => agregarInsumo(i.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-marfil-soft"
                  >
                    <span className="font-bold text-cacao">{i.nombre}</span>
                    <span className="text-xs text-cacao-mute whitespace-nowrap">
                      {[
                        i.categoriaCompra?.trim(),
                        i.precioBaseUsd != null
                          ? `$${i.precioBaseUsd}/${i.unidadBase}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={agregarManual}
                className="w-full rounded-xl ring-1 ring-marfil bg-white py-2.5 font-bold text-terracotta-deep hover:ring-terracotta"
              >
                ✎ Escribir uno a mano
              </button>
            </div>
          ) : (
            <button
              onClick={() => setBuscando(true)}
              className="w-full border-t border-marfil-light py-3 font-bold text-terracotta-deep hover:bg-marfil-soft"
            >
              + Agregar ingrediente
            </button>
          )}

          <div className="flex items-center justify-between border-t-2 border-marfil px-4 py-4">
            <span className="font-cinzel text-lg text-cacao">
              Costo del plato
            </span>
            <span className="font-cinzel text-2xl text-terracotta-deep tabular-nums">
              {money(costo.porPorcion)}
            </span>
          </div>
        </section>
      )}

      {/* Precio de venta (compartido) */}
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-bold text-cacao">Precio de venta</p>
            <p className="text-xs text-cacao-soft">Lo que le cobras al cliente</p>
          </div>
          <div className="flex items-center rounded-xl ring-1 ring-marfil bg-marfil-soft px-3 h-12">
            <span className="text-cacao-soft font-bold text-lg">$</span>
            <input
              id="plato-precio"
              inputMode="decimal"
              value={precioVenta}
              onChange={(e) =>
                setPrecioVenta(
                  e.target.value.replace(/[^0-9.,]/g, "").replace(/,/g, "."),
                )
              }
              placeholder="0.00"
              className="w-24 bg-transparent text-right font-cinzel text-2xl text-cacao focus:outline-none tabular-nums"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-marfil-soft px-3 py-2.5 text-sm font-bold text-cacao-soft">
          <span>
            Para ganar bien, véndelo a{" "}
            <b className="text-terracotta-deep">
              {money(rent?.precioSugeridoAlObjetivo ?? 0)}
            </b>{" "}
            o más
          </span>
          <button
            onClick={() =>
              setPrecioVenta(
                (rent?.precioSugeridoAlObjetivo ?? 0).toFixed(2),
              )
            }
            className="ml-auto rounded-full ring-1 ring-marfil bg-white px-3 py-1.5 text-xs font-bold text-terracotta-deep hover:ring-terracotta"
          >
            Usar
          </button>
        </div>
      </div>

      {errorGuardar && (
        <div className="rounded-xl bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {errorGuardar}
        </div>
      )}

      <button
        onClick={guardar}
        disabled={guardando}
        className="w-full rounded-2xl bg-terracotta text-white py-4 font-cinzel text-xl hover:bg-terracotta-deep disabled:opacity-50 transition-colors shadow-[0_4px_14px_rgba(248,144,0,.32)]"
      >
        {guardando ? "Guardando…" : "Guardar plato"}
      </button>
      <p className="text-center text-xs text-cacao-mute">
        Se guarda en tu recetario · también aparece en Costeo y Rentabilidad
      </p>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3 py-1.5 text-xs font-bold transition-colors " +
        (activo
          ? "bg-cacao text-white"
          : "bg-white ring-1 ring-marfil text-cacao-soft hover:text-cacao")
      }
    >
      {children}
    </button>
  );
}

function Celda({ k, v, orange }: { k: string; v: string; orange?: boolean }) {
  return (
    <div className="bg-white p-4">
      <p className="text-xs font-bold text-cacao-soft">{k}</p>
      <p
        className={
          "mt-0.5 font-cinzel text-xl tabular-nums " +
          (orange ? "text-terracotta-deep" : "text-cacao")
        }
      >
        {v}
      </p>
    </div>
  );
}
