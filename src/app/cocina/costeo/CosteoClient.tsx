"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WarningIcon } from "@/components/icons";
import {
  calcRentabilidad,
  frescuraPrecio,
  precioConIva,
  precioSinIva,
  PRECIO_VIEJO_DIAS,
  SECCIONES,
  type Receta,
  type Insumo,
  type CocinaConfig,
  type Seccion,
} from "@/lib/types";
import { hoyISO, pillClass } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  listRecetas,
  calcularCostoReceta,
  setPrecioSugeridoUsd,
} from "@/lib/data/recetas";
import { listInsumos } from "@/lib/data/cocina";
import { getCocinaConfig, updateCocinaConfig } from "@/lib/data/cocinaConfig";
import { normalizarBusqueda } from "@/lib/text";
import { extractError } from "@/lib/data/error";

type OrdenarPor = "nombre" | "costo_desc" | "precio_desc";

export function CosteoClient() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [config, setConfig] = useState<CocinaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [filterSec, setFilterSec] = useState<Seccion | "todas">("todas");
  const [orden, setOrden] = useState<OrdenarPor>("nombre");
  const [q, setQ] = useState("");

  // Editor de config (food cost + IVA)
  const [editingConfig, setEditingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, ins, cfg] = await Promise.all([
          listRecetas(),
          listInsumos(),
          getCocinaConfig(),
        ]);
        if (cancelled) return;
        setRecetas(r);
        setInsumos(ins);
        setConfig(cfg);
      } catch (e) {
        if (!cancelled) setError(extractError(e, "Error cargando"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-cerrar banner de info
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 3000);
    return () => clearTimeout(t);
  }, [info]);

  // Filas con costo + rentabilidad — excluyendo subrecetas (no se venden directo)
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
      .filter(({ receta }) => {
        if (
          filterSec !== "todas" &&
          receta.seccion !== filterSec &&
          receta.seccion !== "ambos"
        )
          return false;
        if (q && !normalizarBusqueda(receta.nombre).includes(normalizarBusqueda(q)))
          return false;
        return true;
      })
      .sort((a, b) => {
        if (orden === "nombre")
          return a.receta.nombre.localeCompare(b.receta.nombre);
        if (orden === "costo_desc")
          return b.rent.costoPorPorcion - a.rent.costoPorPorcion;
        // precio_desc — sin precio al final
        const pa = a.rent.precioVentaUsd;
        const pb = b.rent.precioVentaUsd;
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pb - pa;
      });
  }, [recetas, insumos, config, filterSec, orden, q]);

  // Separar las recetas que tienen precio definido de las que no, para
  // mostrarlas en dos secciones distintas y resaltar las que faltan cargar.
  const filasConPrecio = useMemo(
    () => filas.filter((f) => f.rent.precioVentaUsd !== null),
    [filas],
  );
  const filasSinPrecio = useMemo(
    () => filas.filter((f) => f.rent.precioVentaUsd === null),
    [filas],
  );

  // Insumos cuyo precio ya está viejo (economía volátil): el costeo que ves
  // puede estar basado en precios desactualizados. La frescura se mide contra
  // `precioActualizado`; si no existe, contra la fecha de la última compra.
  const hoy = useMemo(() => hoyISO(), []);
  const insumosViejos = useMemo(
    () =>
      insumos.filter(
        (i) =>
          i.precioBaseUsd !== null &&
          frescuraPrecio(i.precioActualizado ?? i.ultimaFecha, hoy).nivel ===
            "viejo",
      ),
    [insumos, hoy],
  );

  async function handlePrecioChange(recetaId: string, sinIvaUsd: number | null) {
    setError(null);
    try {
      await setPrecioSugeridoUsd(recetaId, sinIvaUsd);
      // Actualizar local
      setRecetas((prev) =>
        prev.map((r) =>
          r.id === recetaId
            ? { ...r, precioSugeridoUsd: sinIvaUsd ?? undefined }
            : r,
        ),
      );
      setInfo("Precio actualizado.");
    } catch (e) {
      setError(extractError(e, "Error guardando precio"));
    }
  }

  async function handleSaveConfig(patch: Partial<CocinaConfig>) {
    setSavingConfig(true);
    try {
      const updated = await updateCocinaConfig(patch);
      setConfig(updated);
      setEditingConfig(false);
      setInfo("Parámetros guardados.");
    } catch (e) {
      setError(extractError(e, "Error guardando parámetros"));
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

  return (
    <div className="space-y-6">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {info && (
        <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F]">
          {info}
        </div>
      )}

      {insumosViejos.length > 0 && (
        <ErrorBanner>
          <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
          {insumosViejos.length} insumo
          {insumosViejos.length === 1 ? "" : "s"} con precio de más de{" "}
          {PRECIO_VIEJO_DIAS} días. El costeo puede estar desactualizado —{" "}
          <Link href="/cocina/insumos" className="underline hover:text-cacao">
            revisá y actualizá precios en el Catálogo
          </Link>
          .
        </ErrorBanner>
      )}

      {/* CONFIG: food cost objetivo + IVA */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
              Parámetros del costeo
            </h2>
            <p className="text-xs text-cacao-soft italic font-serif mt-1">
              Estos números definen el precio sugerido y el IVA de carta.
              Análisis de margen y semáforos en{" "}
              <Link
                href="/cocina/rentabilidad"
                className="underline hover:text-cacao"
              >
                Rentabilidad (M4)
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingConfig((v) => !v)}
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            {editingConfig ? "Cancelar" : "Editar"}
          </button>
        </div>

        {!editingConfig ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                Food cost objetivo
              </div>
              <div className="text-cacao font-medium mt-0.5">
                {config.foodCostObjetivoPorc}%
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                IVA carta
              </div>
              <div className="text-cacao font-medium mt-0.5">
                {config.ivaPorc}%
              </div>
            </div>
          </div>
        ) : (
          <ConfigEditor
            initial={config}
            saving={savingConfig}
            onSave={handleSaveConfig}
          />
        )}
      </section>

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
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-widest text-cacao-mute">
            Ordenar:
          </span>
          {(
            [
              { v: "nombre", l: "Nombre A→Z" },
              { v: "costo_desc", l: "Mayor costo primero" },
              { v: "precio_desc", l: "Mayor precio primero" },
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

      {/* TABLA — Con precio definido */}
      {filasConPrecio.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil overflow-x-auto">
          <header className="px-4 py-3 border-b border-marfil flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao">
              Recetas con precio definido
            </h2>
            <span className="text-[10px] uppercase tracking-widest text-cacao-mute">
              {filasConPrecio.length} receta
              {filasConPrecio.length === 1 ? "" : "s"}
            </span>
          </header>
          <CosteoTable
            filas={filasConPrecio}
            ivaPorc={config.ivaPorc}
            onPrecioChange={handlePrecioChange}
          />
        </section>
      )}

      {/* TABLA — Sin precio (resaltado) */}
      {filasSinPrecio.length > 0 && (
        <section className="rounded-2xl bg-amber-50/40 ring-1 ring-amber-200 overflow-x-auto">
          <header className="px-4 py-3 border-b border-amber-200 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display text-xs tracking-[0.3em] uppercase text-amber-900">
                Sin precio definido — requieren atención
              </h2>
              <p className="text-xs text-amber-800/80 italic font-serif mt-0.5">
                Estas recetas no tienen precio de venta cargado. Usá el
                sugerido como guía o escribí tu propio precio.
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-amber-900">
              {filasSinPrecio.length} receta
              {filasSinPrecio.length === 1 ? "" : "s"}
            </span>
          </header>
          <CosteoTable
            filas={filasSinPrecio}
            ivaPorc={config.ivaPorc}
            onPrecioChange={handlePrecioChange}
          />
        </section>
      )}

      {filasConPrecio.length === 0 && filasSinPrecio.length === 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft italic font-serif">
          Sin resultados con los filtros actuales.
        </div>
      )}

      <p className="text-xs text-cacao-soft italic font-serif text-center">
        Para ver márgenes y semáforos →{" "}
        <Link
          href="/cocina/rentabilidad"
          className="underline hover:text-cacao"
        >
          Rentabilidad (M4)
        </Link>
      </p>
    </div>
  );
}

/** Tabla reutilizable de costeo — misma estructura para "con precio" y "sin precio". */
function CosteoTable({
  filas,
  ivaPorc,
  onPrecioChange,
}: {
  filas: { receta: Receta; rent: ReturnType<typeof calcRentabilidad> }[];
  ivaPorc: number;
  onPrecioChange: (id: string, sinIvaUsd: number | null) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-marfil">
        <tr className="text-left text-[10px] uppercase tracking-widest text-cacao-mute">
          <th className="px-4 py-3">Receta</th>
          <th className="px-3 py-3">Sec.</th>
          <th className="px-3 py-3 text-right">Costo / porc.</th>
          <th className="px-3 py-3 text-right">Sugerido (al objetivo)</th>
          <th className="px-3 py-3 text-right w-44">
            Precio sin IVA (editable)
          </th>
          <th className="px-3 py-3 text-right w-44">
            Precio con IVA (editable)
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-marfil">
        {filas.map(({ receta, rent }) => (
          <tr
            key={receta.id}
            className="hover:bg-marfil-soft transition-colors"
          >
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
            <td className="px-3 py-3 text-right text-cacao font-medium">
              ${rent.costoPorPorcion.toFixed(2)}
            </td>
            <td className="px-3 py-3 text-right text-cacao-soft text-xs">
              <div>${rent.precioSugeridoAlObjetivo.toFixed(2)}</div>
              <div className="text-[10px] text-cacao-mute">
                ${rent.precioSugeridoAlObjetivoConIva.toFixed(2)} c/IVA
              </div>
            </td>
            <td className="px-3 py-3 text-right">
              <InlinePrecio
                valor={rent.precioVentaUsd}
                onSave={(v) => onPrecioChange(receta.id, v)}
                placeholder={rent.precioSugeridoAlObjetivo.toFixed(2)}
              />
            </td>
            <td className="px-3 py-3 text-right">
              <InlinePrecio
                valor={
                  rent.precioVentaUsd !== null
                    ? precioConIva(rent.precioVentaUsd, ivaPorc)
                    : null
                }
                onSave={(v) =>
                  onPrecioChange(
                    receta.id,
                    v === null ? null : precioSinIva(v, ivaPorc),
                  )
                }
                placeholder={rent.precioSugeridoAlObjetivoConIva.toFixed(2)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Input inline — usa onBlur + Enter para guardar, Escape para cancelar. */
function InlinePrecio({
  valor,
  onSave,
  placeholder,
}: {
  valor: number | null;
  onSave: (v: number | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(valor !== null ? valor.toFixed(2) : "");
  const [editing, setEditing] = useState(false);

  // Si cambia el valor desde afuera (y no estás editando), sincronizar el
  // campo. Se ajusta DURANTE el render —patrón recomendado por React— en vez
  // de en un efecto, que dispararía renders en cascada.
  const [prevValor, setPrevValor] = useState(valor);
  if (valor !== prevValor) {
    setPrevValor(valor);
    if (!editing) {
      setText(valor !== null ? valor.toFixed(2) : "");
    }
  }

  function commit() {
    setEditing(false);
    const trimmed = text.trim();
    const mostrado = valor !== null ? valor.toFixed(2) : "";
    // Si el texto es igual a lo que se mostró, no hubo cambio real → no guardar.
    // (Antes comparaba el "8.62" mostrado contra el "8.62068" real y "guardaba"
    //  la versión truncada con solo enfocar/desenfocar el campo.)
    if (trimmed === mostrado) return;
    if (trimmed === "") {
      if (valor !== null) onSave(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setText(mostrado);
      return;
    }
    onSave(n);
  }

  function cancel() {
    setEditing(false);
    setText(valor !== null ? valor.toFixed(2) : "");
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <span className="text-cacao-mute text-xs">$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder ?? "0.00"}
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancel();
            e.currentTarget.blur();
          }
        }}
        className="w-24 rounded ring-1 ring-marfil px-2 py-1 text-sm text-right focus:ring-cacao focus:outline-none transition-colors"
      />
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
  const [foodCost, setFoodCost] = useState(
    String(initial.foodCostObjetivoPorc),
  );
  const [iva, setIva] = useState(String(initial.ivaPorc));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
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
            Default 16% (Venezuela).
          </span>
        </label>
      </div>
      <div className="text-right">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave({
              foodCostObjetivoPorc: Number(foodCost) || 0,
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
