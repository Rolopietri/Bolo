"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Receta, Insumo, CocinaConfig } from "@/lib/types";
import { calcRentabilidad, categoriaRecetaLabel } from "@/lib/types";
import {
  getReceta,
  deleteReceta,
  setRecetaActivo,
  calcularCostoReceta,
  listRecetas,
} from "@/lib/data/recetas";
import { listInsumos } from "@/lib/data/cocina";
import { getCocinaConfig } from "@/lib/data/cocinaConfig";
import { ordenarPorCantidadDesc } from "@/lib/units";
import { RecetaForm } from "../RecetaForm";
import { ErrorBanner } from "@/components/ErrorBanner";

export function RecetaDetail({ id }: { id: string }) {
  const router = useRouter();
  const [receta, setReceta] = useState<Receta | null>(null);
  const [allRecetas, setAllRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [config, setConfig] = useState<CocinaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingActivo, setTogglingActivo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, all, ins, cfg] = await Promise.all([
          getReceta(id),
          listRecetas(),
          listInsumos(),
          getCocinaConfig(),
        ]);
        if (!cancelled) {
          setReceta(r);
          setAllRecetas(all);
          setInsumos(ins);
          setConfig(cfg);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "No encontrada");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDelete() {
    if (!receta) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteReceta(receta.id);
      router.push("/cocina/recetas");
      router.refresh();
    } catch (e) {
      // Mostrar detalles completos del error de Supabase
      const err = e as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      const msg = [
        err.message,
        err.details ? `Detalles: ${err.details}` : null,
        err.hint ? `Hint: ${err.hint}` : null,
        err.code ? `Código: ${err.code}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setError(msg || "Error eliminando");
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  async function toggleActivo(activo: boolean) {
    if (!receta) return;
    setError(null);
    setTogglingActivo(true);
    try {
      await setRecetaActivo(receta.id, activo);
      setReceta({ ...receta, activo });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Error al ${activo ? "reactivar" : "desactivar"}`,
      );
    } finally {
      setTogglingActivo(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando...
      </div>
    );
  }
  if (error || !receta) {
    return (
      <ErrorBanner>
        {error || "No encontrada"}{" "}
        <Link href="/cocina/recetas" className="underline ml-2">
          Volver
        </Link>
      </ErrorBanner>
    );
  }

  if (editing) {
    return (
      <div>
        <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft mb-2">
          Editar receta
        </p>
        <h1 className="font-cinzel text-2xl text-cacao mb-6">
          {receta.nombre}
        </h1>
        <RecetaForm
          existing={receta}
          onSaved={(updated) => {
            setReceta(updated);
            setEditing(false);
            // Scroll al top para que se vea claramente el detalle actualizado
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    );
  }

  const { total, porPorcion, lineas } = calcularCostoReceta(receta, insumos, allRecetas);
  const margen =
    receta.precioSugeridoUsd && receta.precioSugeridoUsd > 0 && porPorcion > 0
      ? ((receta.precioSugeridoUsd - porPorcion) / receta.precioSugeridoUsd) *
        100
      : null;
  const rent = config
    ? calcRentabilidad(porPorcion, receta.precioSugeridoUsd ?? null, config)
    : null;
  // Calculadora: sugerencias a varios food cost targets
  const presets = [25, 30, 35, 40];
  const sugerencias = presets.map((fc) => ({
    fc,
    precio: fc > 0 ? porPorcion / (fc / 100) : 0,
  }));

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              {receta.esSubreceta
                ? `sub-receta · ${receta.seccion}`
                : `${receta.categoria ? categoriaRecetaLabel(receta.categoria) : "receta"} · ${receta.seccion}`}
            </p>
            <h1 className="mt-2 font-cinzel text-3xl sm:text-4xl text-cacao tracking-[0.06em]">
              {receta.nombre}
              {!receta.activo && (
                <span className="align-middle ml-3 text-[11px] uppercase tracking-widest px-2 py-1 rounded-full bg-marfil-light text-cacao-soft ring-1 ring-marfil">
                  Inactiva
                </span>
              )}
            </h1>
            {receta.perfil && (
              <p className="mt-2 font-serif italic text-cacao-soft">
                {receta.perfil}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-cacao-mute uppercase tracking-widest">
              Costo / porción
            </div>
            <div className="text-2xl font-cinzel text-cacao">
              ${porPorcion.toFixed(2)}
            </div>
            {receta.precioSugeridoUsd && (
              <div className="text-xs text-cacao-soft mt-1">
                P. sugerido: ${receta.precioSugeridoUsd.toFixed(2)}
                {margen !== null && (
                  <span
                    className={`ml-2 ${margen >= (config?.margenVerdeMin ?? 70) ? "text-[#15803D]" : margen >= (config?.margenAmarilloMin ?? 50) ? "text-[#A16207]" : "text-terracotta"}`}
                  >
                    · margen {margen.toFixed(0)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {receta.fotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receta.fotoUrl}
            alt={receta.nombre}
            className="mt-4 w-full max-h-80 object-cover rounded-2xl ring-1 ring-marfil"
          />
        )}
      </section>

      {/* Acciones PDF */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
            Ficha técnica
          </div>
          <div className="text-sm text-cacao-soft mt-1 font-serif italic">
            Descarga la receta en PDF para la cocina (sin costos visibles).
          </div>
        </div>
        <a
          href={`/api/cocina/recetas/${receta.id}/pdf`}
          target="_blank"
          rel="noopener"
          className="rounded-xl bg-cacao text-white px-4 py-2 hover:bg-terracotta text-sm font-medium"
        >
          PDF para imprimir
        </a>
      </section>

      {/* Meta */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Información
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-cacao-mute uppercase text-[10px] tracking-widest">
              Porciones
            </div>
            <div className="text-cacao font-medium">{receta.porciones}</div>
          </div>
          {receta.rendimiento && receta.rendimiento > 0 && (
            <div>
              <div className="text-cacao-mute uppercase text-[10px] tracking-widest">
                Rendimiento
              </div>
              <div className="text-cacao font-medium">
                {receta.rendimiento}{" "}
                {receta.rendimientoUnidad ?? ""}
              </div>
            </div>
          )}
          {receta.tiempoPrepMin && (
            <div>
              <div className="text-cacao-mute uppercase text-[10px] tracking-widest">
                Prep
              </div>
              <div className="text-cacao font-medium">
                {receta.tiempoPrepMin} min
              </div>
            </div>
          )}
          {receta.tiempoCoccionMin && (
            <div>
              <div className="text-cacao-mute uppercase text-[10px] tracking-widest">
                Cocción
              </div>
              <div className="text-cacao font-medium">
                {receta.tiempoCoccionMin} min
              </div>
            </div>
          )}
          {receta.temperatura && (
            <div>
              <div className="text-cacao-mute uppercase text-[10px] tracking-widest">
                Temp
              </div>
              <div className="text-cacao font-medium">{receta.temperatura}</div>
            </div>
          )}
        </div>
      </section>

      {/* Ingredientes */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Ingredientes
        </h2>
        {(() => {
          // Insumos ordenados por cantidad (mayor a menor); las subrecetas van
          // aparte, en su propio grupo abajo, para no romper ese orden.
          const ordenadas = ordenarPorCantidadDesc(lineas);
          const insumosOrd = ordenadas.filter((l) => !l.subrecetaId);
          const subrecetasOrd = ordenadas.filter((l) => l.subrecetaId);
          const renderLinea = (i: (typeof lineas)[number]) => (
            <li
              key={i.id}
              className="py-2 grid grid-cols-12 gap-2 items-baseline"
            >
              <div className="col-span-7 text-cacao">
                {i.nombre}
                {i.observaciones && (
                  <span className="text-xs text-cacao-mute italic">
                    {" "}
                    · {i.observaciones}
                  </span>
                )}
                {!i.subrecetaId && !i.insumoId ? (
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-cacao-mute">
                    (ad-hoc)
                  </span>
                ) : null}
              </div>
              <div className="col-span-3 text-cacao-soft text-sm text-right">
                {i.cantidad} {i.unidad}
              </div>
              <div className="col-span-2 text-cacao-mute text-xs text-right">
                {i.costoSubtotal !== undefined && i.costoSubtotal > 0
                  ? `$${i.costoSubtotal.toFixed(3)}`
                  : ""}
              </div>
            </li>
          );
          return (
            <>
              <ul className="divide-y divide-marfil">
                {insumosOrd.map(renderLinea)}
              </ul>
              {subrecetasOrd.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-mute mb-1">
                    Sub-recetas
                  </h3>
                  <ul className="divide-y divide-marfil">
                    {subrecetasOrd.map(renderLinea)}
                  </ul>
                </div>
              )}
            </>
          );
        })()}
        <div className="mt-4 border-t border-marfil pt-3 text-right space-y-1">
          <div className="text-sm text-cacao-soft">
            Costo total: <span className="text-cacao">${total.toFixed(3)}</span>
          </div>
          <div className="text-lg font-cinzel tracking-wide text-cacao">
            Por porción: ${porPorcion.toFixed(2)}
          </div>
        </div>
      </section>

      {/* CALCULADORA DE PRECIO (M3 + M4) */}
      {config && porPorcion > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
              Calculadora de precio
            </h2>
            <Link
              href="/cocina/rentabilidad"
              className="text-[10px] uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              Panel completo →
            </Link>
          </div>
          <p className="text-xs text-cacao-soft italic font-serif mb-4">
            Precio que cobrarías según distintos % de food cost. Tu objetivo
            actual es <span className="font-medium">{config.foodCostObjetivoPorc}%</span>.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sugerencias.map((s) => {
              const isTarget = s.fc === config.foodCostObjetivoPorc;
              return (
                <div
                  key={s.fc}
                  className={`rounded-xl ring-1 p-4 ${isTarget ? "bg-marfil-soft ring-cacao" : "bg-white ring-marfil"}`}
                >
                  <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                    Food cost {s.fc}%
                  </div>
                  <div className="text-2xl font-cinzel text-cacao mt-1">
                    ${s.precio.toFixed(2)}
                  </div>
                  {isTarget && (
                    <div className="text-[10px] uppercase tracking-widest text-terracotta mt-1">
                      ← objetivo
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {rent && rent.precioVentaUsd !== null && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm border-t border-marfil pt-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Food cost real
                </div>
                <div className="text-cacao font-medium">
                  {rent.foodCostPorc?.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Margen bruto
                </div>
                <div className="text-cacao font-medium">
                  {rent.margenBrutoPorc?.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Margen neto
                </div>
                <div className="text-cacao font-medium">
                  {rent.margenNetoPorc?.toFixed(1)}%{" "}
                  <span className="text-[10px] text-cacao-mute">
                    (− {config.gastosOperativosPorc}% gastos op.)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  Semáforo
                </div>
                <div
                  className={`text-sm font-medium ${
                    rent.semaforo === "verde"
                      ? "text-[#15803D]"
                      : rent.semaforo === "amarillo"
                        ? "text-[#A16207]"
                        : "text-terracotta"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        rent.semaforo === "verde"
                          ? "bg-emerald-500"
                          : rent.semaforo === "amarillo"
                            ? "bg-amber-500"
                            : "bg-terracotta"
                      }`}
                    />
                    {rent.semaforo === "verde"
                      ? "Saludable"
                      : rent.semaforo === "amarillo"
                        ? "Aceptable"
                        : "Bajo margen"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Procedimiento + presentación + notas */}
      {receta.procedimiento && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
            Procedimiento
          </h2>
          <pre className="font-serif text-sm text-cacao whitespace-pre-wrap leading-relaxed">
            {receta.procedimiento}
          </pre>
        </section>
      )}
      {receta.presentacion && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
            Presentación
          </h2>
          <pre className="font-serif italic text-sm text-cacao-soft whitespace-pre-wrap leading-relaxed">
            {receta.presentacion}
          </pre>
        </section>
      )}
      {receta.notasChef && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
            Notas del chef
          </h2>
          <pre className="font-serif italic text-sm text-cacao-soft whitespace-pre-wrap leading-relaxed">
            {receta.notasChef}
          </pre>
        </section>
      )}
      {receta.variaciones && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
            Variaciones
          </h2>
          <pre className="font-serif text-sm text-cacao-soft whitespace-pre-wrap leading-relaxed">
            {receta.variaciones}
          </pre>
        </section>
      )}

      {/* Error visible si algo falla en cualquier acción */}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Acciones */}
      <section className="flex flex-wrap gap-3 justify-between items-center">
        <Link
          href="/cocina/recetas"
          className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
        >
          ← Todas las recetas
        </Link>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg ring-1 ring-cacao px-4 py-2 text-cacao hover:bg-marfil-soft text-sm"
          >
            Editar
          </button>
          {receta.activo ? (
            <button
              type="button"
              onClick={() => toggleActivo(false)}
              disabled={togglingActivo}
              className="rounded-lg ring-1 ring-cacao-soft px-4 py-2 text-cacao-soft hover:bg-marfil-soft text-sm disabled:opacity-50"
              title="Ocultar del recetario sin borrar (conserva el histórico). Se puede reactivar."
            >
              {togglingActivo ? "..." : "Desactivar"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => toggleActivo(true)}
                disabled={togglingActivo}
                className="rounded-lg ring-1 ring-cacao px-4 py-2 text-cacao hover:bg-marfil-soft text-sm font-medium disabled:opacity-50"
                title="Volver a activar esta receta"
              >
                {togglingActivo ? "..." : "Reactivar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirmDel(true);
                }}
                className="rounded-lg ring-1 ring-terracotta px-4 py-2 text-terracotta hover:bg-[#F9EBE7] text-sm font-medium"
              >
                Eliminar receta
              </button>
            </>
          )}
        </div>
      </section>

      {/* Modal de confirmación in-page (más confiable que confirm() nativo) */}
      {confirmDel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-cacao/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirmDel(false);
          }}
        >
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full">
            <h3 className="font-cinzel text-xl text-cacao">
              ¿Eliminar esta receta?
            </h3>
            <p className="mt-3 font-serif italic text-cacao-soft text-sm">
              Se va a eliminar <strong className="not-italic font-medium text-cacao">{receta.nombre}</strong>{" "}
              y todos sus ingredientes. Las ventas registradas con esta receta
              se conservan pero quedarán sin vínculo.
            </p>
            <p className="mt-2 text-xs text-terracotta uppercase tracking-widest">
              Esta acción no se puede revertir.
            </p>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                disabled={deleting}
                className="rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-terracotta text-white px-4 py-2 font-medium hover:bg-terracotta-deep text-sm disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
