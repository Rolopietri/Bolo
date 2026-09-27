"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarIcon, CartIcon, WarningIcon } from "@/components/icons";
import {
  ESTADOS_PLAN_PRODUCCION,
  stockLibre,
  type Insumo,
  type PlanProduccion,
  type Receta,
  type Venta,
} from "@/lib/types";
import { listInsumos } from "@/lib/data/cocina";
import { listRecetas } from "@/lib/data/recetas";
import {
  listPlanesProduccion,
  createPlanProduccion,
  completarPlanProduccion,
  cancelarPlanProduccion,
  deletePlanProduccion,
  ajustarPlanCompletado,
  previewConsumo,
  recalcularStockComprometido,
} from "@/lib/data/planes-produccion";
import { listMermas, deleteVenta } from "@/lib/data/ventas";
import { extractError } from "@/lib/data/error";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MermaRecetaDialog } from "../../_MermaRecetaDialog";
import { displayCantidad } from "@/lib/units";
import { ErrorBanner } from "@/components/ErrorBanner";

export function PlanesClient() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [planes, setPlanes] = useState<PlanProduccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Form de nuevo plan
  const [creating, setCreating] = useState(false);
  const [formRecetaId, setFormRecetaId] = useState("");
  const [formRaciones, setFormRaciones] = useState("10");
  const [formFecha, setFormFecha] = useState("");
  const [formNota, setFormNota] = useState("");
  const [saving, setSaving] = useState(false);

  // Confirmaciones
  const [confirmAction, setConfirmAction] = useState<
    | { type: "completar" | "cancelar" | "borrar"; plan: PlanProduccion }
    | null
  >(null);
  const [actionRunning, setActionRunning] = useState(false);

  // Ajuste de un plan completado (raciones / consumidas)
  const [ajustePlan, setAjustePlan] = useState<PlanProduccion | null>(null);
  const [ajusteRaciones, setAjusteRaciones] = useState("");
  const [ajusteConsumidas, setAjusteConsumidas] = useState("");
  const [ajusteRunning, setAjusteRunning] = useState(false);

  function abrirAjuste(p: PlanProduccion) {
    setAjustePlan(p);
    setAjusteRaciones(String(p.raciones));
    setAjusteConsumidas(String(p.racionesConsumidas));
  }

  async function guardarAjuste() {
    if (!ajustePlan) return;
    const r = Number(ajusteRaciones);
    const c = Number(ajusteConsumidas);
    if (!Number.isFinite(r) || r <= 0) {
      setError("Las raciones deben ser un número mayor a 0.");
      return;
    }
    if (!Number.isFinite(c) || c < 0 || c > r) {
      setError("Las consumidas deben estar entre 0 y las raciones.");
      return;
    }
    setAjusteRunning(true);
    setError(null);
    try {
      await ajustarPlanCompletado(ajustePlan.id, r, c);
      await reload();
      setInfo("Plan ajustado. Stock y comprometido recalculados.");
      setAjustePlan(null);
    } catch (e) {
      setError(extractError(e, "Error ajustando el plan"));
    } finally {
      setAjusteRunning(false);
    }
  }

  // Vista de la lista: cronológica (default) o agrupada por receta
  const [vista, setVista] = useState<"receta" | "cronologico">("cronologico");
  const [mostrarCerrados, setMostrarCerrados] = useState(false);

  // Mermas de producción (una ración pre-producida que se perdió).
  const [mermas, setMermas] = useState<Venta[]>([]);
  const [mermaOpen, setMermaOpen] = useState(false);
  const [pendienteBorrarMerma, setPendienteBorrarMerma] = useState<
    string | null
  >(null);

  async function reload() {
    const [r, i, p] = await Promise.all([
      listRecetas(),
      listInsumos(),
      listPlanesProduccion(),
    ]);
    setRecetas(r);
    setInsumos(i);
    setPlanes(p);
  }

  // Tras registrar/borrar una merma: recalcular compromiso y recargar todo.
  async function refrescarTrasMerma() {
    try {
      await recalcularStockComprometido();
    } catch {
      // no crítico
    }
    await reload();
    try {
      setMermas(await listMermas());
    } catch {
      // tabla pendiente
    }
  }

  async function borrarMerma() {
    if (!pendienteBorrarMerma) return;
    setError(null);
    try {
      await deleteVenta(pendienteBorrarMerma);
      await refrescarTrasMerma();
      setInfo("Merma eliminada. Stock y compromiso restaurados.");
    } catch (e) {
      setError(extractError(e, "Error eliminando la merma"));
    } finally {
      setPendienteBorrarMerma(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, i] = await Promise.all([listRecetas(), listInsumos()]);
        if (cancelled) return;
        setRecetas(r);
        setInsumos(i);
        try {
          const p = await listPlanesProduccion();
          if (!cancelled) setPlanes(p);
        } catch {
          // tabla pendiente — seguimos sin historial
        }
        try {
          const me = await listMermas();
          if (!cancelled) setMermas(me);
        } catch {
          // tabla pendiente
        }
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

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);

  // Recetas seleccionables — incluye subrecetas (preparaciones base que también
  // se producen por adelantado, ej. base de mango). Mismo procedimiento:
  // reservar/comprometer sus insumos.
  const recetasOpciones = useMemo(
    () =>
      recetas
        .filter((r) => r.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [recetas],
  );

  // Map de insumos para mostrar nombres en compromisos
  const insumosMap = useMemo(
    () => new Map(insumos.map((i) => [i.id, i] as const)),
    [insumos],
  );

  // Vista cronológica: todos los planes, del más nuevo al más viejo.
  // Un plan está ACTIVO si aún reserva stock: pendiente/completado y con
  // raciones sin consumir. El resto (vendido, cancelado o agotado) va al
  // historial de cerrados.
  const esPlanActivo = (p: PlanProduccion) =>
    (p.estado === "pendiente" || p.estado === "completado") &&
    p.racionesConsumidas < p.raciones;

  const planesActivos = useMemo(() => planes.filter(esPlanActivo), [planes]);
  const planesCerrados = useMemo(
    () =>
      planes
        .filter((p) => !esPlanActivo(p))
        .sort((a, b) =>
          (b.completadoAt ?? b.canceladoAt ?? b.createdAt).localeCompare(
            a.completadoAt ?? a.canceladoAt ?? a.createdAt,
          ),
        ),
    [planes],
  );

  const planesCronologico = useMemo(
    () =>
      [...planesActivos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [planesActivos],
  );

  // Vista por receta: planes agrupados por receta, ordenados alfabéticamente.
  // Dentro de cada receta, del más viejo al más nuevo (= orden de venta FIFO).
  // `sinVender` = raciones aún comprometidas (pendiente/completado) de esa receta.
  const planesPorReceta = useMemo(() => {
    const map = new Map<string, PlanProduccion[]>();
    planesActivos.forEach((p) => {
      if (!map.has(p.recetaId)) map.set(p.recetaId, []);
      map.get(p.recetaId)!.push(p);
    });
    return Array.from(map.entries())
      .map(([recetaId, list]) => ({
        recetaId,
        recetaNombre: list[0].recetaNombre,
        planes: [...list].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
        sinVender: list
          .filter((p) => p.estado === "pendiente" || p.estado === "completado")
          .reduce(
            (acc, p) => acc + Math.max(0, p.raciones - p.racionesConsumidas),
            0,
          ),
      }))
      .sort((a, b) => a.recetaNombre.localeCompare(b.recetaNombre));
  }, [planesActivos]);

  // Preview de ingredientes a comprometer al elegir receta + raciones
  const preview = useMemo(() => {
    const rec = recetas.find((r) => r.id === formRecetaId);
    const raciones = Number(formRaciones) || 0;
    if (!rec || raciones <= 0) return [];
    return previewConsumo(rec, raciones, recetas, insumos);
  }, [formRecetaId, formRaciones, recetas, insumos]);

  // Receta seleccionada en el formulario (para mostrar su rendimiento).
  const formReceta = useMemo(
    () => recetas.find((r) => r.id === formRecetaId) ?? null,
    [recetas, formRecetaId],
  );

  function resetForm() {
    setFormRecetaId("");
    setFormRaciones("10");
    setFormFecha("");
    setFormNota("");
    setCreating(false);
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    const rec = recetas.find((r) => r.id === formRecetaId);
    const raciones = Number(formRaciones);
    if (!rec || raciones <= 0) {
      setError("Seleccioná una receta y un número de raciones válido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPlanProduccion({
        receta: rec,
        raciones,
        fechaObjetivo: formFecha || null,
        nota: formNota || null,
        recetas,
        insumos,
      });
      await reload();
      setInfo(
        `Plan creado: ${rec.nombre} × ${raciones} raciones. Stock comprometido.`,
      );
      resetForm();
    } catch (e) {
      setError(extractError(e, "Error creando plan"));
    } finally {
      setSaving(false);
    }
  }

  async function ejecutarAccion() {
    if (!confirmAction) return;
    setActionRunning(true);
    setError(null);
    try {
      if (confirmAction.type === "completar") {
        await completarPlanProduccion(confirmAction.plan.id);
        setInfo(
          "Producción marcada como terminada. El ingrediente sigue comprometido hasta vender o borrar el plan.",
        );
      } else if (confirmAction.type === "cancelar") {
        await cancelarPlanProduccion(confirmAction.plan.id);
        setInfo("Plan cancelado. Stock comprometido liberado.");
      } else {
        await deletePlanProduccion(confirmAction.plan.id);
        setInfo("Plan borrado.");
      }
      await reload();
      setConfirmAction(null);
    } catch (e) {
      setError(extractError(e, "Error ejecutando acción"));
    } finally {
      setActionRunning(false);
    }
  }

  // Validación de stock libre suficiente al armar el plan (preview)
  const previewWarnings = useMemo(() => {
    return preview
      .map(({ insumo, cantidad }) => {
        const libre = stockLibre(insumo);
        return { insumo, cantidad, libre, suficiente: libre >= cantidad };
      })
      .filter((p) => !p.suficiente);
  }, [preview]);

  // Render de una tarjeta de plan. `nested` = dentro de un grupo de receta
  // (oculta el nombre, que ya está en el encabezado del grupo, y usa un
  // contenedor liviano en vez de una tarjeta con anillo).
  function renderPlanCard(p: PlanProduccion, nested = false) {
    const est = ESTADOS_PLAN_PRODUCCION.find((e) => e.value === p.estado)!;
    const fechaFmt = p.fechaObjetivo
      ? new Date(p.fechaObjetivo + "T00:00").toLocaleDateString("es-VE", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : null;
    const creadoFmt = new Date(p.createdAt).toLocaleDateString("es-VE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "America/Caracas",
    });
    // Redondeo a 2 decimales para evitar artefactos de punto flotante
    // (ej. 0.7699999999999996 → 0.77) en la vista.
    const r2 = (n: number) => Number(n.toFixed(2));
    const perdidas = r2(p.racionesPerdidas ?? 0);
    const vendidas = r2(Math.max(0, p.racionesConsumidas - (p.racionesPerdidas ?? 0)));
    const sinVender = r2(Math.max(0, p.raciones - p.racionesConsumidas));
    return (
      <div
        key={p.id}
        className={`${
          nested
            ? "px-4 py-3"
            : "rounded-2xl bg-white ring-1 ring-marfil p-5"
        } ${p.estado !== "pendiente" ? "opacity-70" : ""}`}
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {!nested && (
                <span className="text-cacao font-medium">{p.recetaNombre}</span>
              )}
              <span className="text-cacao-soft text-sm">
                × {p.raciones} raciones
              </span>
              <span
                className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 ${est.color}`}
              >
                {est.label}
              </span>
            </div>
            <div className="text-xs text-cacao-soft mt-1">
              Creado {creadoFmt}
              {fechaFmt && (
                <span>
                  {" · "}
                  <CalendarIcon className="inline size-3.5 align-[-0.15em]" />{" "}
                  objetivo {fechaFmt}
                </span>
              )}{" "}
              ·{" "}
              {p.compromisos.length} ingrediente
              {p.compromisos.length === 1 ? "" : "s"}
            </div>
            {(vendidas > 0 || perdidas > 0) && p.estado !== "cancelado" && (
              <div className="text-xs mt-1">
                {vendidas > 0 && (
                  <span className="text-sky-700">
                    {vendidas} vendida{vendidas === 1 ? "" : "s"}
                  </span>
                )}
                {perdidas > 0 && (
                  <span className="text-terracotta">
                    {vendidas > 0 ? " · " : ""}
                    {perdidas} perdida{perdidas === 1 ? "" : "s"}
                  </span>
                )}
                {sinVender > 0 ? (
                  <span className="text-cacao-soft">
                    {" "}
                    · {sinVender} sin vender (aún comprometida
                    {sinVender === 1 ? "" : "s"})
                  </span>
                ) : (
                  <span className="text-cacao-soft">
                    {" "}
                    · agotado, compromiso liberado
                  </span>
                )}
              </div>
            )}
            {p.nota && (
              <div className="text-xs text-cacao-soft italic font-serif mt-1">
                {p.nota}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.estado === "pendiente" && (
              <>
                <Link
                  href={`/cocina/pedido?plan=${p.id}&receta=${p.recetaId}&raciones=${p.raciones}`}
                  className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-marfil text-cacao-soft hover:bg-marfil-soft"
                >
                  <CartIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                  Generar pedido
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: "completar", plan: p })}
                  className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  ✓ Completar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: "cancelar", plan: p })}
                  className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-marfil text-cacao-soft hover:bg-marfil-soft"
                >
                  Cancelar
                </button>
              </>
            )}
            {/* Un plan completado no se puede borrar (sus insumos ya son
                producto), pero SÍ se puede ajustar: cambiar raciones/consumidas
                cuando afinas una receta y el mismo lote rinde distinto. */}
            {(p.estado === "completado" || p.estado === "vendido") && (
              <button
                type="button"
                onClick={() => abrirAjuste(p)}
                className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-marfil text-cacao-soft hover:bg-marfil-soft"
              >
                ✎ Ajustar
              </button>
            )}
            {p.estado !== "completado" && (
              <button
                type="button"
                onClick={() => setConfirmAction({ type: "borrar", plan: p })}
                className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full text-cacao-soft hover:text-terracotta"
              >
                Borrar
              </button>
            )}
          </div>
        </header>

        {p.compromisos.length > 0 && (
          <ul className="mt-3 divide-y divide-marfil text-sm">
            {p.compromisos.map((c) => {
              const ins = insumosMap.get(c.insumoId);
              return (
                <li
                  key={c.id}
                  className="py-1.5 flex justify-between text-xs text-cacao-soft"
                >
                  <span>{ins?.nombre ?? "(insumo borrado)"}</span>
                  <span>
                    {displayCantidad(c.cantidad, c.unidadBase)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando planes...
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

      {/* Merma de producción (ración pre-producida que se perdió) */}
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
              Merma de producción
            </h2>
            <p className="text-xs text-cacao-soft font-serif italic mt-0.5">
              Una ración pre-producida que se perdió por un fallo interno.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMermaOpen(true)}
            className="shrink-0 rounded-lg ring-1 ring-marfil px-3 py-2 text-sm text-cacao hover:bg-marfil-soft"
          >
            + Registrar merma
          </button>
        </div>
        {mermas.length > 0 && (
          <details className="rounded-lg ring-1 ring-marfil bg-marfil-soft">
            <summary className="cursor-pointer px-3 py-2 text-sm text-cacao font-medium select-none">
              Mermas recientes ({mermas.length})
            </summary>
            <ul className="divide-y divide-marfil border-t border-marfil">
              {mermas.slice(0, 15).map((m) => (
                <li
                  key={m.id}
                  className="px-3 py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="text-cacao truncate">{m.recetaNombre}</div>
                    <div className="text-xs text-cacao-soft">
                      {Number(m.cantidad.toFixed(2))} ración
                      {m.cantidad === 1 ? "" : "es"} · {m.fecha}
                      {m.mermaMotivo ? ` · ${m.mermaMotivo}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendienteBorrarMerma(m.id)}
                    className="shrink-0 text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta"
                  >
                    Deshacer
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Botón / form nuevo plan */}
      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full rounded-xl bg-cacao text-white py-3 font-medium hover:bg-terracotta transition-colors"
        >
          + Nuevo plan de producción
        </button>
      ) : (
        <form
          onSubmit={handleCrear}
          className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
            Nuevo plan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Receta
              <select
                value={formRecetaId}
                onChange={(e) => setFormRecetaId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                <option value="">— Seleccioná —</option>
                {recetasOpciones.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                    {r.esSubreceta ? " · subreceta" : ` (${r.seccion})`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-cacao">
              Raciones a producir{" "}
              <span className="text-cacao-mute font-normal">
                (admite fracciones, ej. 0.5)
              </span>
              <input
                type="number"
                min="0"
                step="any"
                value={formRaciones}
                onChange={(e) => setFormRaciones(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              {formReceta && (
                <span className="mt-1 block text-xs text-cacao-soft">
                  Rinde {formReceta.porciones}{" "}
                  {formReceta.porciones === 1 ? "porción" : "porciones"} por receta
                  completa
                  {formReceta.rendimiento
                    ? ` (= ${formReceta.rendimiento} ${formReceta.rendimientoUnidad || "g"})`
                    : ""}
                  {Number(formRaciones) > 0 && formReceta.porciones > 0
                    ? ` · esta tanda: ${Number(formRaciones)} ${
                        Number(formRaciones) === 1 ? "ración" : "raciones"
                      } ≈ ${
                        Math.round(
                          (Number(formRaciones) / formReceta.porciones) * 100,
                        ) / 100
                      } receta(s)`
                    : ""}
                  {Number(formRaciones) > 0 &&
                  formReceta.porciones > 0 &&
                  formReceta.rendimiento
                    ? ` · ≈ ${Math.round(
                        (Number(formRaciones) * formReceta.rendimiento) /
                          formReceta.porciones,
                      )} ${formReceta.rendimientoUnidad || "g"}`
                    : ""}
                </span>
              )}
            </label>
            <label className="text-sm text-cacao">
              Fecha objetivo{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <input
                type="date"
                value={formFecha}
                onChange={(e) => setFormFecha(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Nota{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <input
                type="text"
                placeholder="Ej: para evento del sábado"
                value={formNota}
                onChange={(e) => setFormNota(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>

          {/* Preview de ingredientes que se comprometen */}
          {preview.length > 0 && (
            <div className="rounded-lg bg-marfil-soft ring-1 ring-marfil p-3 mt-2">
              <div className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-mute mb-2">
                Se comprometerán
              </div>
              <ul className="text-sm divide-y divide-marfil">
                {preview.map(({ insumo, cantidad }) => {
                  const libre = stockLibre(insumo);
                  const insuficiente = libre < cantidad;
                  return (
                    <li
                      key={insumo.id}
                      className="py-1.5 flex justify-between gap-2"
                    >
                      <span className="text-cacao">{insumo.nombre}</span>
                      <span
                        className={
                          insuficiente
                            ? "text-terracotta font-medium"
                            : "text-cacao-soft"
                        }
                      >
                        {displayCantidad(cantidad, insumo.unidadBase)}
                        {insuficiente && (
                          <span className="ml-2 text-[10px] uppercase tracking-widest">
                            · libre {displayCantidad(libre, insumo.unidadBase)}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {previewWarnings.length > 0 && (
                <div className="text-xs text-terracotta mt-2">
                  <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                  No tenés stock libre suficiente para{" "}
                  {previewWarnings.length} ingrediente
                  {previewWarnings.length === 1 ? "" : "s"}. Podes crear el
                  plan igual — el stock comprometido va a quedar mayor al total
                  y vas a verlo reflejado.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-cacao text-white py-2 font-medium hover:bg-terracotta disabled:opacity-50"
            >
              {saving ? "Creando..." : "Crear plan"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Toggle de vista */}
      {planes.length > 0 && (
        <div className="flex gap-2">
          {(
            [
              ["cronologico", "Cronológico"],
              ["receta", "Por receta"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setVista(value)}
              className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest ring-1 transition-colors ${
                vista === value
                  ? "bg-cacao text-white ring-cacao"
                  : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Lista de planes ACTIVOS */}
      {planes.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft italic font-serif">
          No hay planes registrados todavía.
        </div>
      ) : planesActivos.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft italic font-serif">
          No hay planes activos. Los planes cerrados están en el historial de
          abajo.
        </div>
      ) : vista === "cronologico" ? (
        <div className="space-y-3">
          {planesCronologico.map((p) => renderPlanCard(p))}
        </div>
      ) : (
        <div className="space-y-6">
          {planesPorReceta.map((g) => (
            <section
              key={g.recetaId}
              className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden"
            >
              <header className="px-4 py-3 border-b border-marfil flex items-center justify-between gap-2">
                <span className="font-display text-xs tracking-[0.3em] uppercase text-cacao">
                  {g.recetaNombre}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-cacao-mute">
                  {g.sinVender > 0 && (
                    <span className="text-sky-700">
                      {g.sinVender} sin vender ·{" "}
                    </span>
                  )}
                  {g.planes.length} plan{g.planes.length === 1 ? "" : "es"}
                </span>
              </header>
              <div className="divide-y divide-marfil">
                {g.planes.map((p) => renderPlanCard(p, true))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Historial de planes CERRADOS (colapsable) */}
      {planesCerrados.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setMostrarCerrados((v) => !v)}
            className="w-full flex items-center justify-between gap-2 rounded-xl bg-white ring-1 ring-marfil px-4 py-3 text-left hover:bg-marfil-soft transition-colors"
          >
            <span className="font-display text-xs tracking-[0.3em] uppercase text-cacao-soft">
              Historial · {planesCerrados.length} plan
              {planesCerrados.length === 1 ? "" : "es"} cerrado
              {planesCerrados.length === 1 ? "" : "s"}
            </span>
            <span className="text-cacao-mute text-sm">
              {mostrarCerrados ? "▲ ocultar" : "▼ ver"}
            </span>
          </button>
          {mostrarCerrados && (
            <div className="space-y-3 mt-3">
              {planesCerrados.map((p) => renderPlanCard(p))}
            </div>
          )}
        </div>
      )}

      {/* Confirmaciones */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !actionRunning && setConfirmAction(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              {confirmAction.type === "completar" && "¿Completar plan?"}
              {confirmAction.type === "cancelar" && "¿Cancelar plan?"}
              {confirmAction.type === "borrar" && "¿Borrar plan?"}
            </h2>
            <p className="mt-3 text-sm text-cacao-soft font-serif">
              {confirmAction.type === "completar" && (
                <>
                  Vas a marcar el plan{" "}
                  <strong className="text-cacao">
                    {confirmAction.plan.recetaNombre}
                  </strong>{" "}
                  como producción terminada. Es solo un cambio de estado — el
                  ingrediente <strong>sigue comprometido</strong> hasta que se
                  venda el producto (vía Xetux) o se borre el plan.
                </>
              )}
              {confirmAction.type === "cancelar" && (
                <>
                  Vas a cancelar el plan. Solo se libera el{" "}
                  <strong>stock comprometido</strong> — el stock total no se
                  toca (no se produjo nada).
                </>
              )}
              {confirmAction.type === "borrar" && (
                <>
                  Vas a borrar el plan del historial.{" "}
                  {confirmAction.plan.estado === "pendiente" && (
                    <span className="text-terracotta">
                      Como está pendiente, primero se libera el stock
                      comprometido.
                    </span>
                  )}
                </>
              )}
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={actionRunning}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarAccion}
                disabled={actionRunning}
                className={`rounded-xl text-white px-4 py-2 font-medium disabled:opacity-50 ${
                  confirmAction.type === "completar"
                    ? "bg-emerald-700 hover:bg-emerald-800"
                    : confirmAction.type === "borrar"
                      ? "bg-terracotta hover:bg-cacao"
                      : "bg-cacao hover:bg-terracotta"
                }`}
              >
                {actionRunning
                  ? "Procesando..."
                  : confirmAction.type === "completar"
                    ? "Sí, completar"
                    : confirmAction.type === "cancelar"
                      ? "Sí, cancelar"
                      : "Sí, borrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ajustar plan completado */}
      {ajustePlan && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !ajusteRunning && setAjustePlan(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              Ajustar plan completado
            </h2>
            <p className="mt-2 text-sm text-cacao-soft font-serif">
              <strong className="text-cacao">{ajustePlan.recetaNombre}</strong>.
              Cambia cuántas porciones rinde el lote y cuántas ya se consumieron
              — el sistema recalcula solo el stock físico y el comprometido.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm text-cacao">
                Raciones (rinde)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={ajusteRaciones}
                  onChange={(e) => setAjusteRaciones(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="text-sm text-cacao">
                Ya consumidas
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={ajusteConsumidas}
                  onChange={(e) => setAjusteConsumidas(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
            </div>
            {(() => {
              const r = Number(ajusteRaciones);
              const c = Number(ajusteConsumidas);
              const porVender =
                Number.isFinite(r) && Number.isFinite(c)
                  ? Math.max(0, r - c)
                  : null;
              return porVender !== null ? (
                <p className="mt-2 text-xs text-cacao-soft">
                  Quedarían{" "}
                  <strong className="text-cacao">
                    {Number(porVender.toFixed(2))}
                  </strong>{" "}
                  por vender (reservadas en el comprometido).
                </p>
              ) : null;
            })()}
            <p className="mt-3 text-[11px] text-cacao-mute">
              Si cambiaste el tamaño de la porción y ya habías vendido a la
              porción vieja, dale un vistazo al stock con un conteo por si acaso.
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setAjustePlan(null)}
                disabled={ajusteRunning}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarAjuste}
                disabled={ajusteRunning}
                className="rounded-xl bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
              >
                {ajusteRunning ? "Guardando..." : "Guardar ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mermaOpen && (
        <MermaRecetaDialog
          recetas={recetas}
          insumos={insumos}
          planes={planes}
          onClose={() => setMermaOpen(false)}
          onRegistered={(detalle) => {
            setInfo(detalle);
            refrescarTrasMerma();
          }}
        />
      )}

      <ConfirmDialog
        open={pendienteBorrarMerma !== null}
        title="¿Deshacer esta merma?"
        message={
          <>Se elimina el registro y se devuelven al stock los insumos que había
          descontado (y el compromiso del plan).</>
        }
        onConfirm={borrarMerma}
        onCancel={() => setPendienteBorrarMerma(null)}
      />
    </div>
  );
}
