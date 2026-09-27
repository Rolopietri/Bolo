"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, ChevronIcon, SaveIcon } from "@/components/icons";
import { ErrorBanner } from "@/components/ErrorBanner";
import type {
  Receta,
  Insumo,
  Proveedor,
  PedidoCocina,
  EstadoPedidoCocina,
  PlanProduccion,
} from "@/lib/types";
import { ESTADOS_PEDIDO_COCINA } from "@/lib/types";
import { listRecetas } from "@/lib/data/recetas";
import { listInsumos, listProveedores } from "@/lib/data/cocina";
import {
  listPlanesProduccion,
  createPlanProduccion,
} from "@/lib/data/planes-produccion";
import { calcularPedidoSugerido } from "@/lib/data/ventas";
import {
  listPedidosCocina,
  createPedidoCocina,
  updatePedidoCocina,
  deletePedidoCocina,
} from "@/lib/data/pedidos-cocina";
import { extractError } from "@/lib/data/error";

type Objetivo = { recetaId: string; raciones: string };

export function PedidoSugeridoClient() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [pedidosGuardados, setPedidosGuardados] = useState<PedidoCocina[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  // Cuál pedido guardado está desplegado (mostrando sus recetas e insumos).
  const [pedidoExpandido, setPedidoExpandido] = useState<string | null>(null);
  const [planes, setPlanes] = useState<PlanProduccion[]>([]);
  /** Modo manual: comparar contra el stock FÍSICO (total), ignorando TODO lo
   *  reservado por planes. Para pedidos armados a mano. */
  const [ignorarReservas, setIgnorarReservas] = useState(false);
  /** Id del plan que originó el pedido (cuando se llega desde "Generar pedido").
   *  En ese caso descontamos SOLO la reserva de ese plan, así el faltante es
   *  exactamente lo que falta para producirlo sin pisar otras reservas. */
  const [planOrigenId, setPlanOrigenId] = useState<string | null>(null);

  // Modal de guardado
  const [savingModal, setSavingModal] = useState(false);
  const [saveNombre, setSaveNombre] = useState("");
  const [saveFecha, setSaveFecha] = useState("");
  const [saveNota, setSaveNota] = useState("");
  const [savingPedido, setSavingPedido] = useState(false);

  // Confirmación de borrado
  const [confirmDelete, setConfirmDelete] = useState<PedidoCocina | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, i, p] = await Promise.all([
          listRecetas(),
          listInsumos(),
          listProveedores(),
        ]);
        if (cancelled) return;
        setRecetas(r);
        setInsumos(i);
        setProveedores(p);
        // Planes de producción (para el modo "generar pedido desde un plan").
        try {
          const pl = await listPlanesProduccion();
          if (!cancelled) setPlanes(pl);
        } catch {
          // silent — sin planes seguimos normal
        }
        // El listado de pedidos guardados es opcional — si la tabla aún
        // no existe (SQL pendiente), no rompemos toda la pantalla.
        try {
          const pg = await listPedidosCocina();
          if (!cancelled) setPedidosGuardados(pg);
        } catch {
          // silent
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

  // Auto-cerrar banner de info
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);

  // Pre-cargar desde el botón "Generar pedido" de un plan de producción.
  // Lee ?receta=<id>&raciones=<n> de la URL y arma el objetivo automáticamente.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const receta = params.get("receta");
    if (!receta) return;
    const raciones = params.get("raciones");
    // Inicialización única desde la URL al montar (no se puede en useState
    // inicial porque en SSR no existe window).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObjetivos([
      {
        recetaId: receta,
        raciones: raciones && Number(raciones) > 0 ? raciones : "10",
      },
    ]);
    setPlanOrigenId(params.get("plan"));
  }, []);

  function addObjetivo() {
    setObjetivos((prev) => [...prev, { recetaId: "", raciones: "10" }]);
  }
  function updateObjetivo(idx: number, patch: Partial<Objetivo>) {
    setObjetivos((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    );
  }
  function removeObjetivo(idx: number) {
    setObjetivos((prev) => prev.filter((_, i) => i !== idx));
  }

  // Plan de origen (si se llegó desde "Generar pedido"), ya cargado.
  const planOrigen = useMemo(
    () => (planOrigenId ? planes.find((p) => p.id === planOrigenId) : undefined),
    [planOrigenId, planes],
  );

  const pedido = useMemo(() => {
    const validos = objetivos
      .filter((o) => o.recetaId && Number(o.raciones) > 0)
      .map((o) => ({
        recetaId: o.recetaId,
        raciones: Number(o.raciones),
      }));

    let insumosCalc = insumos;
    if (planOrigen) {
      // Desde un plan: descontar SOLO la reserva de ESTE plan del comprometido,
      // así el faltante = lo que falta para producirlo, respetando las reservas
      // de otros planes que comparten ingredientes.
      const propio = new Map<string, number>();
      planOrigen.compromisos.forEach((c) =>
        propio.set(c.insumoId, (propio.get(c.insumoId) ?? 0) + c.cantidad),
      );
      insumosCalc = insumos.map((i) => ({
        ...i,
        stockComprometido: Math.max(
          0,
          i.stockComprometido - (propio.get(i.id) ?? 0),
        ),
      }));
    } else if (ignorarReservas) {
      // Modo manual: comparar contra el stock físico (comprometido = 0).
      insumosCalc = insumos.map((i) => ({ ...i, stockComprometido: 0 }));
    }

    return calcularPedidoSugerido(validos, recetas, insumosCalc, proveedores);
  }, [objetivos, recetas, insumos, proveedores, ignorarReservas, planOrigen]);

  const porProveedor = useMemo(() => {
    const map = new Map<string, typeof pedido.items>();
    pedido.items.forEach((it) => {
      const k = it.proveedorNombre ?? "Sin proveedor";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries());
  }, [pedido]);

  // ── Guardar pedido ──────────────────────────────────────────
  function abrirModalGuardar() {
    // Pre-llenar nombre con fecha de hoy
    const hoy = new Date().toLocaleDateString("es-VE", {
      day: "numeric",
      month: "short",
    });
    setSaveNombre(`Pedido ${hoy}`);
    setSaveFecha("");
    setSaveNota("");
    setSavingModal(true);
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!saveNombre.trim()) return;
    const validos = objetivos
      .filter((o) => o.recetaId && Number(o.raciones) > 0)
      .map((o) => {
        const r = recetas.find((x) => x.id === o.recetaId);
        return {
          recetaId: o.recetaId,
          recetaNombre: r?.nombre ?? "Receta",
          raciones: Number(o.raciones),
        };
      });
    if (validos.length === 0) {
      setError("Agrega al menos una receta antes de guardar.");
      return;
    }
    setSavingPedido(true);
    setError(null);
    try {
      const nuevo = await createPedidoCocina({
        nombre: saveNombre.trim(),
        fechaNecesaria: saveFecha || null,
        nota: saveNota.trim() || null,
        estado: "pendiente",
        recetas: validos,
      });
      setPedidosGuardados((prev) => [nuevo, ...prev]);
      setSavingModal(false);
      setInfo("Pedido guardado.");
    } catch (e) {
      setError(extractError(e, "Error guardando pedido"));
    } finally {
      setSavingPedido(false);
    }
  }

  // Insumos (lista de compra) de un pedido guardado, recalculados contra el
  // stock actual — igual que la calculadora, pero sin cargarlo al form.
  function itemsDePedido(pg: PedidoCocina) {
    const validos = pg.recetas
      .filter((r) => r.recetaId && r.raciones > 0)
      .map((r) => ({ recetaId: r.recetaId!, raciones: r.raciones }));
    if (validos.length === 0)
      return [] as ReturnType<typeof calcularPedidoSugerido>["items"];
    return calcularPedidoSugerido(validos, recetas, insumos, proveedores).items;
  }

  // ── Cargar pedido guardado en el form (para editarlo) ─────
  function cargarPedido(pg: PedidoCocina) {
    const nuevosObjetivos: Objetivo[] = pg.recetas
      .filter((r) => r.recetaId) // solo las que siguen existiendo
      .map((r) => ({
        recetaId: r.recetaId!,
        raciones: String(r.raciones),
      }));
    setObjetivos(nuevosObjetivos);
    const huerfanas = pg.recetas.filter((r) => !r.recetaId).length;
    setInfo(
      `Cargado: "${pg.nombre}" (${nuevosObjetivos.length} recetas${huerfanas > 0 ? ` · ${huerfanas} huérfanas omitidas` : ""}).`,
    );
    // Scroll suave al form
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ── Cambiar estado / borrar pedidos guardados ─────────────
  async function setEstadoPedido(id: string, estado: EstadoPedidoCocina) {
    try {
      const pedido = pedidosGuardados.find((p) => p.id === id);
      // Al marcar "comprado" por primera vez, generar un plan de producción
      // PENDIENTE por cada receta del pedido (reserva sus insumos). El flag
      // planesGenerados evita duplicarlos si se cambia el estado ida y vuelta.
      const generarPlanes =
        estado === "comprado" && !!pedido && !pedido.planesGenerados;

      let creados = 0;
      const sinReceta: string[] = [];
      const fallidos: string[] = [];
      if (generarPlanes && pedido) {
        for (const linea of pedido.recetas) {
          const rec = linea.recetaId
            ? recetas.find((r) => r.id === linea.recetaId)
            : undefined;
          if (!rec || linea.raciones <= 0) {
            sinReceta.push(linea.recetaNombre);
            continue;
          }
          try {
            await createPlanProduccion({
              receta: rec,
              raciones: linea.raciones,
              nota: `Desde pedido: ${pedido.nombre}`,
              recetas,
              insumos,
            });
            creados++;
          } catch {
            fallidos.push(linea.recetaNombre);
          }
        }
      }

      const marcarFlag = generarPlanes && creados > 0;
      await updatePedidoCocina(id, { estado });
      // El flag es best-effort: si la columna aún no existe (SQL sin correr), el
      // estado igual se guardó y los planes ya se crearon.
      if (marcarFlag) {
        try {
          await updatePedidoCocina(id, { planesGenerados: true });
        } catch {
          /* noop */
        }
      }
      setPedidosGuardados((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, estado, planesGenerados: p.planesGenerados || marcarFlag }
            : p,
        ),
      );

      if (generarPlanes) {
        const partes: string[] = [];
        if (creados > 0)
          partes.push(
            `${creados} plan${creados === 1 ? "" : "es"} de producción creado${creados === 1 ? "" : "s"} (pendiente${creados === 1 ? "" : "s"}, reservan insumos)`,
          );
        if (sinReceta.length)
          partes.push(`sin plan (receta no encontrada): ${sinReceta.join(", ")}`);
        if (fallidos.length) partes.push(`no se pudo con: ${fallidos.join(", ")}`);
        if (partes.length)
          setInfo(
            `${partes.join(" · ")}. Míralos en Inventario → Planes de producción.`,
          );
        // Refrescar planes en memoria (afectan el cálculo del pedido sugerido).
        try {
          setPlanes(await listPlanesProduccion());
        } catch {
          /* noop */
        }
      }
    } catch (e) {
      setError(extractError(e, "Error actualizando"));
    }
  }
  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deletePedidoCocina(confirmDelete.id);
      setPedidosGuardados((prev) =>
        prev.filter((p) => p.id !== confirmDelete.id),
      );
      setConfirmDelete(null);
      setInfo("Pedido borrado.");
    } catch (e) {
      setError(extractError(e, "Error borrando pedido"));
    }
  }

  if (loading) {
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

      {/* ─── Pedidos guardados ─── */}
      {pedidosGuardados.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
            Pedidos guardados
          </h2>
          <ul className="divide-y divide-marfil">
            {pedidosGuardados.map((pg) => {
              const est = ESTADOS_PEDIDO_COCINA.find(
                (e) => e.value === pg.estado,
              )!;
              const fechaFmt = pg.fechaNecesaria
                ? new Date(pg.fechaNecesaria + "T00:00").toLocaleDateString(
                    "es-VE",
                    { weekday: "short", day: "numeric", month: "short" },
                  )
                : null;
              const expandido = pedidoExpandido === pg.id;
              const itemsPg = expandido ? itemsDePedido(pg) : [];
              return (
                <li
                  key={pg.id}
                  className={`py-3 grid grid-cols-12 gap-3 items-start ${
                    pg.estado !== "pendiente" ? "opacity-60" : ""
                  }`}
                >
                  {/* Encabezado: toda el área es un toggle para desplegar */}
                  <button
                    type="button"
                    onClick={() =>
                      setPedidoExpandido(expandido ? null : pg.id)
                    }
                    className="col-span-12 sm:col-span-6 min-w-0 text-left flex items-start gap-2"
                    aria-expanded={expandido}
                  >
                    <ChevronIcon
                      className={`size-4 mt-1 shrink-0 text-cacao-mute transition-transform ${
                        expandido ? "rotate-90" : ""
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-cacao font-medium">
                          {pg.nombre}
                        </span>
                        <span
                          className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 ${est.color}`}
                        >
                          {est.label}
                        </span>
                      </span>
                      <span className="block text-xs text-cacao-soft mt-0.5">
                        {fechaFmt && (
                          <span>
                            <CalendarIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                            {fechaFmt} ·{" "}
                          </span>
                        )}
                        {pg.recetas.length} receta
                        {pg.recetas.length === 1 ? "" : "s"}
                        {pg.planesGenerados && (
                          <span className="text-sky-700"> · planes creados</span>
                        )}
                      </span>
                      {pg.nota && (
                        <span className="block text-xs text-cacao-soft italic font-serif mt-1">
                          {pg.nota}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="col-span-12 sm:col-span-6 flex flex-wrap gap-1.5 sm:justify-end">
                    {pg.estado === "pendiente" && (
                      <button
                        type="button"
                        onClick={() => setEstadoPedido(pg.id, "comprado")}
                        title={
                          pg.planesGenerados
                            ? "Marcar como comprado"
                            : "Marcar como comprado y crear sus planes de producción (pendientes, reservan insumos)"
                        }
                        className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-marfil text-cacao-soft hover:bg-marfil-soft"
                      >
                        ✓ Comprado{!pg.planesGenerados ? " + plan" : ""}
                      </button>
                    )}
                    {pg.estado === "comprado" && (
                      <button
                        type="button"
                        onClick={() => setEstadoPedido(pg.id, "pendiente")}
                        className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-marfil text-cacao-soft hover:bg-marfil-soft"
                      >
                        ↺ Reabrir
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(pg)}
                      className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full text-cacao-soft hover:text-terracotta"
                    >
                      Borrar
                    </button>
                  </div>

                  {/* Panel desplegado: recetas + lista de compra recalculada */}
                  {expandido && (
                    <div className="col-span-12 mt-1 rounded-xl bg-marfil-soft/60 ring-1 ring-marfil p-3 space-y-3">
                      <div>
                        <div className="font-display text-[10px] tracking-[0.25em] uppercase text-cacao-mute mb-1.5">
                          Recetas
                        </div>
                        <ul className="space-y-0.5">
                          {pg.recetas.map((r) => (
                            <li
                              key={r.id}
                              className="text-xs text-cacao-soft flex justify-between gap-3"
                            >
                              <span className={r.recetaId ? "" : "italic"}>
                                {r.recetaNombre}
                                {!r.recetaId && " (borrada)"}
                              </span>
                              <span className="text-cacao tabular-nums">
                                {r.raciones} rac.
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="font-display text-[10px] tracking-[0.25em] uppercase text-cacao-mute mb-1.5">
                          Insumos a comprar{" "}
                          <span className="text-cacao-soft normal-case tracking-normal font-serif italic">
                            (vs. stock actual)
                          </span>
                        </div>
                        {itemsPg.length === 0 ? (
                          <p className="text-xs text-cacao-soft italic font-serif">
                            No falta nada — el stock cubre estas raciones.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {itemsPg.map((it) => (
                              <li
                                key={it.insumoId}
                                className="text-xs flex justify-between gap-3"
                              >
                                <span className="text-cacao">
                                  {it.insumoNombre}
                                  <span className="text-cacao-mute">
                                    {" "}
                                    · falta {it.faltante.toFixed(2)}{" "}
                                    {it.unidadBase}
                                  </span>
                                </span>
                                <span className="text-cacao tabular-nums whitespace-nowrap">
                                  {it.empaquesNecesarios}× {it.unidadCompra}
                                  {it.precioCompraUsd !== null &&
                                    ` · $${it.costoTotalEstimado.toFixed(2)}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => cargarPedido(pg)}
                        className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-marfil text-cacao-soft hover:bg-white"
                      >
                        ✎ Editar en la calculadora
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ─── Form objetivos ─── */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Raciones objetivo
        </h2>
        <p className="text-xs text-cacao-soft italic font-serif">
          ¿Cuántas raciones quieres preparar de cada receta? La plataforma resta
          el stock actual y arma la lista de compras.
        </p>

        {planOrigen ? (
          <div className="rounded-lg bg-sky-50 ring-1 ring-sky-200 p-3 text-xs text-sky-900">
            Faltante para el plan de{" "}
            <strong>{planOrigen.recetaNombre}</strong> (× {planOrigen.raciones}{" "}
            raciones). Calculado descontando solo la reserva de este plan: es
            exactamente lo que falta comprar para poder producirlo.
          </div>
        ) : (
          <label className="flex items-start gap-2 text-xs text-cacao-soft cursor-pointer">
            <input
              type="checkbox"
              checked={ignorarReservas}
              onChange={(e) => setIgnorarReservas(e.target.checked)}
              className="mt-0.5 accent-cacao"
            />
            <span>
              Comparar contra el <strong>stock físico</strong> (ignorar lo
              reservado por planes de producción), en vez de contra el stock
              libre.
            </span>
          </label>
        )}

        {objetivos.length === 0 ? (
          <p className="text-sm text-cacao-soft italic font-serif">
            Agrega la primera receta abajo.
          </p>
        ) : (
          <div className="space-y-2">
            {objetivos.map((o, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center rounded-lg ring-1 ring-marfil p-3"
              >
                <select
                  value={o.recetaId}
                  onChange={(e) =>
                    updateObjetivo(idx, { recetaId: e.target.value })
                  }
                  className="col-span-12 sm:col-span-7 rounded ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">— Selecciona receta —</option>
                  {recetas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} ({r.seccion})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={o.raciones}
                  onChange={(e) =>
                    updateObjetivo(idx, { raciones: e.target.value })
                  }
                  className="col-span-8 sm:col-span-3 rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                />
                <div className="col-span-3 sm:col-span-1 text-xs text-cacao-mute">
                  raciones
                </div>
                <button
                  type="button"
                  onClick={() => removeObjetivo(idx)}
                  className="col-span-1 text-cacao-soft hover:text-terracotta"
                  aria-label="Quitar"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            onClick={addObjetivo}
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            + Agregar receta
          </button>
          {objetivos.some(
            (o) => o.recetaId && Number(o.raciones) > 0,
          ) && (
            <button
              type="button"
              onClick={abrirModalGuardar}
              className="ml-auto text-xs uppercase tracking-widest rounded-lg bg-cacao text-white px-3 py-1.5 hover:bg-terracotta"
            >
              <SaveIcon className="inline size-3.5 align-[-0.15em] mr-1.5" />
              Guardar pedido
            </button>
          )}
        </div>
      </section>

      {/* ─── Resultado del pedido sugerido ─── */}
      {pedido.items.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          {objetivos.length === 0
            ? "Agrega recetas arriba para ver qué insumos comprar."
            : "Con el stock actual, alcanza para preparar todo. No hace falta comprar nada."}
        </div>
      ) : (
        <section className="space-y-4">
          <div className="rounded-2xl bg-marfil-soft ring-1 ring-marfil p-5 text-right">
            <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
              Costo estimado del pedido
            </div>
            <div className="font-cinzel text-3xl text-cacao mt-1">
              ${pedido.costoTotalEstimado.toFixed(2)} USD
            </div>
          </div>

          {porProveedor.map(([nombreProv, items]) => {
            const subtotal = items.reduce(
              (s, i) => s + i.costoTotalEstimado,
              0,
            );
            return (
              <div
                key={nombreProv}
                className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden"
              >
                <div className="flex items-baseline justify-between p-4 border-b border-marfil">
                  <h3 className="font-display text-xs tracking-[0.3em] uppercase text-cacao">
                    {nombreProv}
                  </h3>
                  <div className="text-sm text-cacao font-medium">
                    ${subtotal.toFixed(2)}
                  </div>
                </div>
                <ul className="divide-y divide-marfil">
                  {items.map((it) => (
                    <li
                      key={it.insumoId}
                      className="p-4 grid grid-cols-12 gap-2 items-baseline"
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <div className="text-cacao font-medium">
                          {it.insumoNombre}
                        </div>
                        <div className="text-[10px] text-cacao-mute">
                          libre: {it.stockLibre.toFixed(2)} {it.unidadBase}{" "}
                          · necesito {it.cantidadNecesaria.toFixed(2)}{" "}
                          {it.unidadBase}
                        </div>
                      </div>
                      <div className="col-span-6 sm:col-span-3 text-sm">
                        <span className="text-cacao font-medium">
                          {it.empaquesNecesarios}× {it.unidadCompra}
                        </span>
                      </div>
                      <div className="col-span-6 sm:col-span-2 text-xs text-cacao-soft">
                        falta {it.faltante.toFixed(2)} {it.unidadBase}
                      </div>
                      <div className="col-span-12 sm:col-span-2 text-right text-sm text-cacao">
                        {it.precioCompraUsd !== null
                          ? `$${it.costoTotalEstimado.toFixed(2)}`
                          : "— sin precio"}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="text-xs text-cacao-soft italic font-serif">
            Cuando recibas el pedido, registra cada compra en{" "}
            <a href="/cocina/compras" className="underline">
              Compras
            </a>{" "}
            para que el stock se actualice automáticamente.
          </div>
        </section>
      )}

      {/* ─── Modal: guardar pedido ─── */}
      {savingModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !savingPedido && setSavingModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleGuardar}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl space-y-3"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              Guardar pedido
            </h2>
            <p className="text-xs text-cacao-soft font-serif italic">
              Guarda las recetas y raciones que elegiste para retomar el pedido
              después. El cálculo de insumos se vuelve a hacer con el stock
              actualizado cuando lo cargues.
            </p>
            <label className="text-sm text-cacao block">
              Nombre del pedido
              <input
                type="text"
                value={saveNombre}
                onChange={(e) => setSaveNombre(e.target.value)}
                required
                autoFocus
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao block">
              Para qué fecha{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <input
                type="date"
                value={saveFecha}
                onChange={(e) => setSaveFecha(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              <span className="text-[10px] text-cacao-mute block mt-1">
                Ej: día del evento, día de preparación.
              </span>
            </label>
            <label className="text-sm text-cacao block">
              Nota{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <textarea
                placeholder="Para qué evento, recordatorios, contexto..."
                value={saveNota}
                onChange={(e) => setSaveNota(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSavingModal(false)}
                disabled={savingPedido}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingPedido}
                className="flex-1 rounded-xl bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
              >
                {savingPedido ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal: confirmar borrado ─── */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              ¿Borrar pedido?
            </h2>
            <p className="mt-3 text-sm text-cacao-soft font-serif">
              Vas a borrar{" "}
              <span className="text-cacao font-medium">
                {confirmDelete.nombre}
              </span>
              .{" "}
              <span className="text-terracotta">
                Esta acción no se puede deshacer.
              </span>
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-xl bg-terracotta text-white px-4 py-2 font-medium hover:bg-cacao"
              >
                Sí, borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
