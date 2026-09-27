"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  calcRentabilidad,
  SECCIONES,
  type Receta,
  type Insumo,
  type CocinaConfig,
  type Seccion,
  type RentabilidadReceta,
} from "@/lib/types";
import { pillClass } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";
import { listRecetas, calcularCostoReceta } from "@/lib/data/recetas";
import { listInsumos } from "@/lib/data/cocina";
import { getCocinaConfig, updateCocinaConfig } from "@/lib/data/cocinaConfig";
import { normalizarBusqueda } from "@/lib/text";
import {
  listConfigHistorial,
  CAMPO_LABELS,
  type ConfigHistorialEntry,
} from "@/lib/data/cocinaConfigHistorial";

type FilterSemaforo = "todos" | "verde" | "amarillo" | "rojo" | "sin_precio";

const SEMAFORO_LABEL: Record<RentabilidadReceta["semaforo"], string> = {
  verde: "Verde",
  amarillo: "Amarillo",
  rojo: "Rojo",
  sin_precio: "Sin precio",
};

const SEMAFORO_CLASS: Record<RentabilidadReceta["semaforo"], string> = {
  verde: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amarillo: "bg-amber-50 text-amber-800 ring-amber-200",
  rojo: "bg-red-50 text-red-800 ring-red-200",
  sin_precio: "bg-stone-100 text-stone-600 ring-stone-200",
};

type OrdenarPor = "nombre" | "margen_asc" | "margen_desc" | "costo_desc";

export function RentabilidadClient() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [config, setConfig] = useState<CocinaConfig | null>(null);
  const [historial, setHistorial] = useState<ConfigHistorialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showingHistorial, setShowingHistorial] = useState(false);

  const [filterSec, setFilterSec] = useState<Seccion | "todas">("todas");
  const [filterSem, setFilterSem] = useState<FilterSemaforo>("todos");
  const [orden, setOrden] = useState<OrdenarPor>("margen_asc");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, ins, cfg] = await Promise.all([
          listRecetas(),
          listInsumos(),
          getCocinaConfig(),
        ]);
        if (!cancelled) {
          setRecetas(r);
          setInsumos(ins);
          setConfig(cfg);
          // Historial es opcional — si la tabla no existe aún, seguimos sin él
          try {
            const h = await listConfigHistorial(50);
            if (!cancelled) setHistorial(h);
          } catch {
            // silent
          }
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error cargando");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Calcular rentabilidad por receta (excluyendo sub-recetas — no se venden directo)
  const filas = useMemo(() => {
    if (!config) return [];
    return recetas
      .filter((r) => !r.esSubreceta)
      .map((r) => {
        const { porPorcion } = calcularCostoReceta(r, insumos, recetas);
        const rent = calcRentabilidad(
          porPorcion,
          r.precioSugeridoUsd ?? null,
          config,
        );
        return { receta: r, rent };
      })
      .filter(({ receta, rent }) => {
        if (
          filterSec !== "todas" &&
          receta.seccion !== filterSec &&
          receta.seccion !== "ambos"
        )
          return false;
        if (filterSem !== "todos" && rent.semaforo !== filterSem) return false;
        if (q && !normalizarBusqueda(receta.nombre).includes(normalizarBusqueda(q)))
          return false;
        return true;
      })
      .sort((a, b) => {
        if (orden === "nombre") return a.receta.nombre.localeCompare(b.receta.nombre);
        if (orden === "costo_desc")
          return b.rent.costoPorPorcion - a.rent.costoPorPorcion;
        // margen ordering: sin_precio al final
        const ma = a.rent.margenBrutoPorc;
        const mb = b.rent.margenBrutoPorc;
        if (ma === null && mb === null) return 0;
        if (ma === null) return 1;
        if (mb === null) return -1;
        return orden === "margen_asc" ? ma - mb : mb - ma;
      });
  }, [recetas, insumos, config, filterSec, filterSem, orden, q]);

  // Stats por semáforo (excluyendo subrecetas — no se venden directo)
  const stats = useMemo(() => {
    if (!config) return null;
    let verde = 0;
    let amarillo = 0;
    let rojo = 0;
    let sin = 0;
    const recetasNormales = recetas.filter((r) => !r.esSubreceta);
    recetasNormales.forEach((r) => {
      const { porPorcion } = calcularCostoReceta(r, insumos, recetas);
      const rent = calcRentabilidad(porPorcion, r.precioSugeridoUsd ?? null, config);
      if (rent.semaforo === "verde") verde++;
      else if (rent.semaforo === "amarillo") amarillo++;
      else if (rent.semaforo === "rojo") rojo++;
      else sin++;
    });
    return { verde, amarillo, rojo, sin, total: recetasNormales.length };
  }, [recetas, insumos, config]);

  async function handleSaveConfig(patch: Partial<CocinaConfig>) {
    setSavingConfig(true);
    try {
      const updated = await updateCocinaConfig(patch);
      setConfig(updated);
      setEditingConfig(false);
      // Refrescar historial silenciosamente si está disponible
      try {
        const h = await listConfigHistorial(50);
        setHistorial(h);
      } catch {
        // silent
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando config");
    } finally {
      setSavingConfig(false);
    }
  }

  if (loading || !config) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando...
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBanner>{error}</ErrorBanner>
    );
  }

  return (
    <div className="space-y-6">
      {/* CONFIG BANNER */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
              Parámetros de rentabilidad
            </h2>
            <p className="text-xs text-cacao-soft italic font-serif mt-1">
              Los números que definen el semáforo y el precio sugerido.
            </p>
          </div>
          <button
            onClick={() => setEditingConfig((v) => !v)}
            className={`text-xs uppercase tracking-widest rounded-full px-4 py-1.5 ring-1 transition-colors ${
              editingConfig
                ? "ring-marfil text-cacao-soft hover:bg-marfil-soft"
                : "ring-cacao bg-cacao text-white hover:bg-terracotta"
            }`}
          >
            {editingConfig ? "Cancelar" : "✎ Editar parámetros"}
          </button>
        </div>

        {!editingConfig ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <Stat label="Food cost objetivo" value={`${config.foodCostObjetivoPorc}%`} />
            <Stat label="Gastos operativos" value={`${config.gastosOperativosPorc}%`} />
            <Stat label="Verde (margen ≥)" value={`${config.margenVerdeMin}%`} />
            <Stat label="Amarillo (margen ≥)" value={`${config.margenAmarilloMin}%`} />
            <Stat label="IVA carta" value={`${config.ivaPorc}%`} />
          </div>
        ) : (
          <ConfigEditor
            initial={config}
            saving={savingConfig}
            onSave={handleSaveConfig}
          />
        )}

        {/* Historial de cambios de parámetros (M4 trazabilidad) */}
        {historial.length > 0 && (
          <div className="mt-4 pt-4 border-t border-marfil">
            <button
              type="button"
              onClick={() => setShowingHistorial((v) => !v)}
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              {showingHistorial ? "▼" : "▶"} Historial de cambios ({historial.length})
            </button>
            {showingHistorial && (
              <ul className="mt-3 divide-y divide-marfil text-xs">
                {historial.map((h) => {
                  const fecha = new Date(h.changedAt).toLocaleDateString(
                    "es-VE",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  );
                  const label = CAMPO_LABELS[h.campo] ?? h.campo;
                  return (
                    <li
                      key={h.id}
                      className="py-2 grid grid-cols-12 gap-2 items-baseline"
                    >
                      <span className="col-span-3 text-cacao-mute">{fecha}</span>
                      <span className="col-span-4 text-cacao">{label}</span>
                      <span className="col-span-5 text-cacao-soft text-right">
                        {h.valorAnterior !== null
                          ? `${h.valorAnterior}% → `
                          : "→ "}
                        <strong className="text-cacao">{h.valorNuevo}%</strong>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* STATS */}
      {stats && (
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} accent="bg-marfil-soft" />
          <StatCard label="Verde" value={stats.verde} accent="bg-emerald-50" dot="bg-emerald-500" />
          <StatCard label="Amarillo" value={stats.amarillo} accent="bg-amber-50" dot="bg-amber-500" />
          <StatCard label="Rojo" value={stats.rojo} accent="bg-red-50" dot="bg-red-500" />
          <StatCard label="Sin precio" value={stats.sin} accent="bg-stone-50" dot="bg-stone-400" />
        </section>
      )}

      {/* FILTROS */}
      <section className="space-y-3">
        <input
          type="text"
          placeholder="Buscar receta..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterSec("todas")}
            className={pillClass(filterSec === "todas")}
          >
            Todas las secciones
          </button>
          {SECCIONES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilterSec(s.value)}
              className={pillClass(filterSec === s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            ["todos", "verde", "amarillo", "rojo", "sin_precio"] as FilterSemaforo[]
          ).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSem(s)}
              className={pillClass(filterSem === s)}
            >
              {s === "todos" ? "Todos los estados" : SEMAFORO_LABEL[s as keyof typeof SEMAFORO_LABEL]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-cacao-mute">
            Ordenar:
          </span>
          {(
            [
              { v: "margen_asc", l: "Menor margen primero" },
              { v: "margen_desc", l: "Mayor margen primero" },
              { v: "costo_desc", l: "Mayor costo" },
              { v: "nombre", l: "Nombre A→Z" },
            ] as { v: OrdenarPor; l: string }[]
          ).map((o) => (
            <button
              key={o.v}
              onClick={() => setOrden(o.v)}
              className={pillClass(orden === o.v)}
            >
              {o.l}
            </button>
          ))}
        </div>
      </section>

      {/* TABLA */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil overflow-x-auto">
        {filas.length === 0 ? (
          <div className="p-8 text-center text-cacao-soft italic font-serif">
            Sin resultados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-marfil">
              <tr className="text-left text-[10px] uppercase tracking-widest text-cacao-mute">
                <th className="px-4 py-3">Receta</th>
                <th className="px-3 py-3">Sec.</th>
                <th className="px-3 py-3 text-right">Costo/porc</th>
                <th className="px-3 py-3 text-right">Precio actual</th>
                <th className="px-3 py-3 text-right">Food cost</th>
                <th className="px-3 py-3 text-right">Margen bruto</th>
                <th className="px-3 py-3 text-right">Neto</th>
                <th className="px-3 py-3">Semáforo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-marfil">
              {filas.map(({ receta, rent }) => (
                <tr key={receta.id} className="hover:bg-marfil-soft transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/cocina/recetas/${receta.id}`}
                      className="text-cacao font-medium hover:underline"
                    >
                      {receta.nombre}
                    </Link>
                    {receta.categoria && (
                      <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                        {receta.categoria}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-cacao-soft capitalize">
                    {receta.seccion}
                  </td>
                  <td className="px-3 py-3 text-right text-cacao">
                    ${rent.costoPorPorcion.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rent.precioVentaUsd !== null ? (
                      <>
                        <div className="text-cacao font-medium">
                          ${rent.precioVentaUsd.toFixed(2)}
                          <span className="text-[10px] text-cacao-mute ml-1">
                            s/IVA
                          </span>
                        </div>
                        <div className="text-[10px] text-cacao-soft">
                          ${rent.precioVentaConIvaUsd!.toFixed(2)} c/IVA
                        </div>
                      </>
                    ) : (
                      <span className="text-cacao-mute italic text-xs">sin definir</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-cacao-soft text-xs">
                    {rent.foodCostPorc !== null
                      ? `${rent.foodCostPorc.toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-cacao-soft text-xs">
                    {rent.margenBrutoPorc !== null
                      ? `${rent.margenBrutoPorc.toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-cacao-soft text-xs">
                    {rent.margenNetoPorc !== null
                      ? `${rent.margenNetoPorc.toFixed(0)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ring-1 whitespace-nowrap ${SEMAFORO_CLASS[rent.semaforo]}`}
                    >
                      {SEMAFORO_LABEL[rent.semaforo]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
        {label}
      </div>
      <div className="text-cacao font-medium mt-0.5">{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  dot,
}: {
  label: string;
  value: number;
  accent: string;
  dot?: string;
}) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ring-marfil ${accent}`}>
      <div className="text-[10px] uppercase tracking-widest text-cacao-mute flex items-center gap-1.5">
        {dot && <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className="text-2xl font-cinzel text-cacao mt-1">{value}</div>
    </div>
  );
}

function ConfigEditor({
  initial,
  saving,
  onSave,
}: {
  initial: CocinaConfig;
  saving: boolean;
  onSave: (patch: Partial<CocinaConfig>) => void;
}) {
  const [foodCost, setFoodCost] = useState(String(initial.foodCostObjetivoPorc));
  const [gastos, setGastos] = useState(String(initial.gastosOperativosPorc));
  const [verde, setVerde] = useState(String(initial.margenVerdeMin));
  const [amarillo, setAmarillo] = useState(String(initial.margenAmarilloMin));
  const [iva, setIva] = useState(String(initial.ivaPorc));

  // El semáforo pinta: margen ≥ verde → verde; ≥ amarillo → amarillo; resto → rojo.
  // Para que la franja amarilla sea alcanzable, verde tiene que ser ≥ amarillo.
  // Si se guardaran al revés, "amarillo" nunca se mostraría.
  const verdeN = Number(verde);
  const amarilloN = Number(amarillo);
  const ordenInvalido =
    Number.isFinite(verdeN) &&
    Number.isFinite(amarilloN) &&
    verdeN < amarilloN;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <label className="text-sm text-cacao">
          Food cost objetivo %
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={foodCost}
            onChange={(e) => setFoodCost(e.target.value)}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <span className="text-[10px] text-cacao-mute">
            Define el precio sugerido (costo / target).
          </span>
        </label>
        <label className="text-sm text-cacao">
          Gastos operativos %
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={gastos}
            onChange={(e) => setGastos(e.target.value)}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <span className="text-[10px] text-cacao-mute">
            Para calcular utilidad neta.
          </span>
        </label>
        <label className="text-sm text-cacao">
          Verde · margen ≥ %
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={verde}
            onChange={(e) => setVerde(e.target.value)}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
        <label className="text-sm text-cacao">
          Amarillo · margen ≥ %
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={amarillo}
            onChange={(e) => setAmarillo(e.target.value)}
            className={`mt-1 w-full rounded-lg px-3 py-2 ring-1 ${
              ordenInvalido ? "ring-terracotta" : "ring-marfil"
            }`}
          />
          {ordenInvalido && (
            <span className="text-[10px] text-terracotta block mt-1">
              El amarillo no puede ser mayor que el verde.
            </span>
          )}
        </label>
        <label className="text-sm text-cacao">
          IVA carta %
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={iva}
            onChange={(e) => setIva(e.target.value)}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <span className="text-[10px] text-cacao-mute">
            Aplicado al precio de carta. Default 16% (Venezuela).
          </span>
        </label>
      </div>

      <GastosOperativosCalculator
        onAplicar={(porc) => setGastos(porc.toFixed(1))}
      />

      <div className="text-right">
        <button
          type="button"
          disabled={saving || ordenInvalido}
          onClick={() =>
            onSave({
              foodCostObjetivoPorc: Number(foodCost) || 0,
              gastosOperativosPorc: Number(gastos) || 0,
              margenVerdeMin: Number(verde) || 0,
              margenAmarilloMin: Number(amarillo) || 0,
              ivaPorc: Number(iva) || 0,
            })
          }
          className="rounded-lg bg-cacao text-white px-4 py-2 text-sm font-medium hover:bg-terracotta disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar parámetros"}
        </button>
      </div>
    </div>
  );
}

/**
 * Calculadora plegable para estimar el % de gastos operativos a partir de
 * los totales mensuales de gastos y ventas. Permite agregar varias líneas
 * de gastos (alquiler, sueldos, luz, etc.) y suma todo.
 */
function GastosOperativosCalculator({
  onAplicar,
}: {
  onAplicar: (porcentaje: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lineas, setLineas] = useState<{ key: string; nombre: string; monto: string }[]>(
    [
      { key: "g1", nombre: "Alquiler", monto: "" },
      { key: "g2", nombre: "Sueldos", monto: "" },
      { key: "g3", nombre: "Luz / agua / gas", monto: "" },
    ],
  );
  const [ventasMensuales, setVentasMensuales] = useState("");

  const totalGastos = useMemo(
    () =>
      lineas.reduce((s, l) => {
        const n = Number(l.monto);
        return s + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0),
    [lineas],
  );
  const ventasNum = Number(ventasMensuales);
  const ventasValidas = Number.isFinite(ventasNum) && ventasNum > 0;
  const porcentaje =
    ventasValidas && totalGastos > 0 ? (totalGastos / ventasNum) * 100 : null;

  function addLinea() {
    setLineas((prev) => [
      ...prev,
      { key: Math.random().toString(36).slice(2, 8), nombre: "", monto: "" },
    ]);
  }
  function updateLinea(key: string, patch: Partial<{ nombre: string; monto: string }>) {
    setLineas((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }
  function removeLinea(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key));
  }

  return (
    <section className="rounded-xl ring-1 ring-marfil bg-marfil-soft">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-marfil transition-colors rounded-xl"
      >
        <div>
          <p className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-soft">
            Ayuda
          </p>
          <div className="text-sm font-medium text-cacao mt-0.5">
            Calculá tu % de gastos operativos
          </div>
          <p className="text-xs text-cacao-soft italic font-serif">
            Sumás tus gastos fijos mensuales y dividís por tu venta promedio.
          </p>
        </div>
        <span
          className={`text-cacao-soft text-xl transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>

      {open && (
        <div className="border-t border-marfil p-4 space-y-3">
          {/* Lista de gastos */}
          <div>
            <div className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-mute mb-2">
              Gastos mensuales (USD)
            </div>
            <div className="space-y-2">
              {lineas.map((l) => (
                <div key={l.key} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Concepto (ej: Alquiler)"
                    value={l.nombre}
                    onChange={(e) =>
                      updateLinea(l.key, { nombre: e.target.value })
                    }
                    className="col-span-7 rounded ring-1 ring-marfil px-3 py-1.5 text-sm bg-white"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={l.monto}
                    onChange={(e) =>
                      updateLinea(l.key, { monto: e.target.value })
                    }
                    className="col-span-4 rounded ring-1 ring-marfil px-3 py-1.5 text-sm text-right bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => removeLinea(l.key)}
                    className="col-span-1 text-cacao-soft hover:text-terracotta text-lg"
                    aria-label="Quitar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLinea}
              className="mt-2 text-[10px] uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              + Agregar gasto
            </button>
            <div className="mt-2 text-right text-sm">
              <span className="text-cacao-mute">Total gastos: </span>
              <span className="text-cacao font-medium">
                ${totalGastos.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Ventas mensuales */}
          <label className="block">
            <div className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-mute mb-1">
              Ventas mensuales promedio (USD)
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Ej: 25000"
              value={ventasMensuales}
              onChange={(e) => setVentasMensuales(e.target.value)}
              className="w-full rounded ring-1 ring-marfil px-3 py-2 text-sm bg-white"
            />
            <span className="text-[10px] text-cacao-mute mt-1 block">
              Usá un promedio realista de los últimos 3 meses.
            </span>
          </label>

          {/* Resultado */}
          {porcentaje !== null ? (
            <div className="rounded-lg bg-white ring-1 ring-cacao p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Gastos operativos
                </div>
                <div className="text-2xl font-cinzel text-cacao">
                  {porcentaje.toFixed(1)}%
                </div>
                <div className="text-[10px] text-cacao-soft italic font-serif mt-0.5">
                  ${totalGastos.toFixed(2)} ÷ ${ventasNum.toFixed(2)} × 100
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAplicar(porcentaje)}
                className="rounded-lg bg-cacao text-white px-4 py-2 text-sm font-medium hover:bg-terracotta"
              >
                Aplicar a gastos %
              </button>
            </div>
          ) : (
            <div className="text-xs text-cacao-mute italic font-serif">
              Cargá los gastos y la venta mensual para ver el porcentaje.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
