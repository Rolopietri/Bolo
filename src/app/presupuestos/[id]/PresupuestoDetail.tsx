"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ESTADOS_PRESUPUESTO,
  unidadLabel,
  type Presupuesto,
  type EstadoPresupuesto,
} from "@/lib/types";
import {
  getPresupuesto,
  updatePresupuestoEstado,
  updatePresupuestoEvento,
  deletePresupuesto,
  crearEventoDesdePresupuesto,
  listVersionesPresupuesto,
  type PresupuestoVersion,
} from "@/lib/data/presupuestos";
import { ConfirmDialog } from "@/components/ConfirmDialog";

function fechaLarga(iso?: string): string {
  if (!iso) return "Por definir";
  return new Date(iso + "T00:00").toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PresupuestoDetail({ id }: { id: string }) {
  const router = useRouter();
  const [p, setP] = useState<Presupuesto | null>(null);
  const [versiones, setVersiones] = useState<PresupuestoVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** Versión expandida en el historial (para ver detalle). */
  const [versionAbierta, setVersionAbierta] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Editor de datos del evento / logística
  const [editingEvento, setEditingEvento] = useState(false);
  const [savingEvento, setSavingEvento] = useState(false);
  const [ev, setEv] = useState({
    eventoNombre: "",
    eventoFecha: "",
    eventoHora: "",
    cantidadPersonas: "",
    montajeFecha: "",
    montajeHora: "",
    desmontajeFecha: "",
    desmontajeHora: "",
  });

  function abrirEditorEvento() {
    if (!p) return;
    setEv({
      eventoNombre: p.eventoNombre ?? "",
      eventoFecha: p.eventoFecha ?? "",
      eventoHora: p.eventoHora ?? "",
      cantidadPersonas:
        p.cantidadPersonas != null ? String(p.cantidadPersonas) : "",
      montajeFecha: p.montajeFecha ?? "",
      montajeHora: p.montajeHora ?? "",
      desmontajeFecha: p.desmontajeFecha ?? "",
      desmontajeHora: p.desmontajeHora ?? "",
    });
    setEditingEvento(true);
  }

  async function guardarEvento() {
    if (!p) return;
    if (!ev.eventoNombre.trim()) {
      setError("El nombre del evento no puede quedar vacío.");
      return;
    }
    setSavingEvento(true);
    setError(null);
    try {
      await updatePresupuestoEvento(p.id, {
        eventoNombre: ev.eventoNombre.trim(),
        eventoFecha: ev.eventoFecha || undefined,
        eventoHora: ev.eventoHora.trim() || undefined,
        cantidadPersonas: ev.cantidadPersonas
          ? Number(ev.cantidadPersonas)
          : undefined,
        montajeFecha: ev.montajeFecha || undefined,
        montajeHora: ev.montajeHora.trim() || undefined,
        desmontajeFecha: ev.desmontajeFecha || undefined,
        desmontajeHora: ev.desmontajeHora.trim() || undefined,
      });
      const fresh = await getPresupuesto(p.id);
      setP(fresh);
      setEditingEvento(false);
      setInfo("Datos del evento actualizados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSavingEvento(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getPresupuesto(id);
        if (!cancelled) setP(data);
        // El historial es opcional — si la tabla aún no existe (SQL pendiente)
        // no rompemos la pantalla.
        try {
          const v = await listVersionesPresupuesto(id);
          if (!cancelled) setVersiones(v);
        } catch {
          // silent
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "No encontrado");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function changeEstado(estado: EstadoPresupuesto) {
    if (!p) return;
    try {
      await updatePresupuestoEstado(p.id, estado);
      setP({ ...p, estado });
      setInfo("Estado actualizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error actualizando");
    }
  }

  async function generarEvento() {
    if (!p) return;
    if (
      !confirm(
        "¿Crear un evento en la página de Eventos a partir de este presupuesto?",
      )
    )
      return;
    try {
      const eventoId = await crearEventoDesdePresupuesto(p);
      setInfo("Evento creado. Yendo a la lista de eventos...");
      setTimeout(() => router.push(`/eventos`), 800);
      void eventoId;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando evento");
    }
  }

  async function handleDelete() {
    if (!p) return;
    try {
      await deletePresupuesto(p.id);
      router.push("/presupuestos/lista");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando presupuesto...
      </div>
    );
  }

  if (error || !p) {
    return (
      <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
        {error || "No encontrado"}{" "}
        <Link href="/presupuestos/lista" className="underline ml-2">
          Volver
        </Link>
      </div>
    );
  }

  const estado = ESTADOS_PRESUPUESTO.find((e) => e.value === p.estado)!;

  return (
    <div className="space-y-6">
      {info && (
        <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F]">
          {info}
        </div>
      )}

      <section>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              {p.numero}
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] text-cacao">
              {p.eventoNombre}
            </h1>
            <p className="mt-2 font-serif italic text-cacao-soft">
              Cliente: {p.clienteNombre}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-block px-3 py-1 rounded-full ring-1 text-xs ${estado.color}`}
            >
              {estado.label}
            </span>
            <div className="mt-2 text-2xl font-cinzel text-cacao">
              ${p.total.toFixed(2)}
            </div>
            <div className="text-xs text-cacao-soft">Total USD</div>
          </div>
        </div>
      </section>

      {/* Acciones de PDF */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
            Documento PDF
          </div>
          <div className="text-sm text-cacao-soft mt-1 font-serif italic">
            Genera versión resumida (sin desglose) o detallada (con cada línea).
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/presupuestos/${p.id}/pdf?modo=resumido`}
            target="_blank"
            rel="noopener"
            className="rounded-xl ring-1 ring-cacao px-4 py-2 text-cacao hover:bg-marfil-soft text-sm"
          >
            PDF resumido
          </a>
          <a
            href={`/api/presupuestos/${p.id}/pdf?modo=detallado`}
            target="_blank"
            rel="noopener"
            className="rounded-xl bg-cacao text-white px-4 py-2 hover:bg-terracotta text-sm font-medium"
          >
            PDF detallado
          </a>
        </div>
      </section>

      {/* Datos */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
            Datos
          </h2>
          {!editingEvento && (
            <button
              onClick={abrirEditorEvento}
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              Editar datos del evento
            </button>
          )}
        </div>

        {editingEvento ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Nombre del evento"
              value={ev.eventoNombre}
              onChange={(e) => setEv({ ...ev, eventoNombre: e.target.value })}
              className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-cacao">
                Fecha del evento
                <input
                  type="date"
                  value={ev.eventoFecha}
                  onChange={(e) =>
                    setEv({ ...ev, eventoFecha: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="text-sm text-cacao">
                Hora del evento
                <input
                  type="text"
                  placeholder="7pm–11pm"
                  value={ev.eventoHora}
                  onChange={(e) => setEv({ ...ev, eventoHora: e.target.value })}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="text-sm text-cacao">
                Personas esperadas
                <input
                  type="number"
                  min="0"
                  placeholder="Ej: 80"
                  value={ev.cantidadPersonas}
                  onChange={(e) =>
                    setEv({ ...ev, cantidadPersonas: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
            </div>

            <div className="border-t border-marfil pt-3">
              <p className="text-[11px] uppercase tracking-widest text-cacao-mute mb-2">
                Montaje y desmontaje (opcional)
              </p>
              <p className="text-xs text-cacao-soft mb-3 font-serif italic">
                Si los dejas vacíos, el PDF usa la fecha y hora del evento.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm text-cacao">
                  Fecha de montaje
                  <input
                    type="date"
                    value={ev.montajeFecha}
                    onChange={(e) =>
                      setEv({ ...ev, montajeFecha: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                </label>
                <label className="text-sm text-cacao">
                  Hora de montaje
                  <input
                    type="text"
                    placeholder="Ej: PM, 2pm–6pm"
                    value={ev.montajeHora}
                    onChange={(e) =>
                      setEv({ ...ev, montajeHora: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                </label>
                <label className="text-sm text-cacao">
                  Fecha de desmontaje
                  <input
                    type="date"
                    value={ev.desmontajeFecha}
                    onChange={(e) =>
                      setEv({ ...ev, desmontajeFecha: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                </label>
                <label className="text-sm text-cacao">
                  Hora de desmontaje
                  <input
                    type="text"
                    placeholder="Ej: PM, 11pm–1am"
                    value={ev.desmontajeHora}
                    onChange={(e) =>
                      setEv({ ...ev, desmontajeHora: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-1">
              <button
                onClick={() => setEditingEvento(false)}
                disabled={savingEvento}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-sm text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarEvento}
                disabled={savingEvento}
                className="rounded-xl bg-cacao text-white px-4 py-2 text-sm font-medium hover:bg-terracotta disabled:opacity-50"
              >
                {savingEvento ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        ) : (
        <>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
          <div>
            <dt className="text-cacao-soft">Cliente</dt>
            <dd className="text-cacao">{p.clienteNombre}</dd>
          </div>
          {p.clienteTelefono && (
            <div>
              <dt className="text-cacao-soft">Teléfono</dt>
              <dd className="text-cacao">{p.clienteTelefono}</dd>
            </div>
          )}
          {p.clienteEmail && (
            <div>
              <dt className="text-cacao-soft">Correo</dt>
              <dd className="text-cacao">{p.clienteEmail}</dd>
            </div>
          )}
          {p.clienteRif && (
            <div>
              <dt className="text-cacao-soft">RIF / Cédula</dt>
              <dd className="text-cacao">{p.clienteRif}</dd>
            </div>
          )}
          {p.eventoFecha && (
            <div>
              <dt className="text-cacao-soft">Fecha del evento</dt>
              <dd className="text-cacao">
                {new Date(p.eventoFecha + "T00:00").toLocaleDateString("es-VE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
          )}
          {p.eventoHora && (
            <div>
              <dt className="text-cacao-soft">Hora</dt>
              <dd className="text-cacao">{p.eventoHora}</dd>
            </div>
          )}
          {p.cantidadPersonas != null && (
            <div>
              <dt className="text-cacao-soft">Personas esperadas</dt>
              <dd className="text-cacao">{p.cantidadPersonas}</dd>
            </div>
          )}
          {(p.montajeFecha || p.montajeHora) && (
            <div>
              <dt className="text-cacao-soft">Montaje</dt>
              <dd className="text-cacao">
                {fechaLarga(p.montajeFecha ?? p.eventoFecha)}
                {(p.montajeHora ?? p.eventoHora)
                  ? ` · ${p.montajeHora ?? p.eventoHora}`
                  : ""}
              </dd>
            </div>
          )}
          {(p.desmontajeFecha || p.desmontajeHora) && (
            <div>
              <dt className="text-cacao-soft">Desmontaje</dt>
              <dd className="text-cacao">
                {fechaLarga(p.desmontajeFecha ?? p.eventoFecha)}
                {(p.desmontajeHora ?? p.eventoHora)
                  ? ` · ${p.desmontajeHora ?? p.eventoHora}`
                  : ""}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-cacao-soft">Validez</dt>
            <dd className="text-cacao">{p.validezDias} días</dd>
          </div>
          <div>
            <dt className="text-cacao-soft">Creado</dt>
            <dd className="text-cacao">
              {new Date(p.createdAt).toLocaleDateString("es-VE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
        {p.notas && (
          <div className="mt-4 border-t border-marfil pt-3">
            <div className="text-xs uppercase tracking-widest text-cacao-soft mb-1">
              Notas
            </div>
            <div className="text-sm text-cacao font-serif italic">{p.notas}</div>
          </div>
        )}
        </>
        )}
      </section>

      {/* Líneas */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Líneas
        </h2>
        <ul className="divide-y divide-marfil">
          {p.items.map((l) => (
            <li
              key={l.id}
              className="py-2 grid grid-cols-12 gap-2 items-baseline"
            >
              <div className="col-span-6 text-cacao text-sm">{l.nombre}</div>
              <div className="col-span-2 text-cacao-soft text-xs">
                {l.cantidad} × {unidadLabel(l.unidad)}
              </div>
              <div className="col-span-2 text-cacao-soft text-xs text-right">
                ${l.precioUnitario.toFixed(2)}
              </div>
              <div className="col-span-2 text-cacao text-sm text-right font-medium">
                ${l.subtotal.toFixed(2)}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-marfil pt-3 text-right space-y-1">
          <div className="text-sm text-cacao-soft">
            Subtotal: <span className="text-cacao">${p.subtotal.toFixed(2)}</span>
          </div>
          {p.descuento > 0 && (
            <div className="text-sm text-cacao-soft">
              Descuento:{" "}
              <span className="text-cacao">−${p.descuento.toFixed(2)}</span>
            </div>
          )}
          <div className="text-xl font-cinzel tracking-wide text-cacao">
            Total: ${p.total.toFixed(2)} USD
          </div>
        </div>
      </section>

      {/* Acciones */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Estado
        </h2>
        <div className="flex flex-wrap gap-2">
          {ESTADOS_PRESUPUESTO.map((e) => (
            <button
              key={e.value}
              onClick={() => changeEstado(e.value)}
              disabled={p.estado === e.value}
              className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-widest ring-1 transition-colors ${
                p.estado === e.value
                  ? "bg-cacao text-white ring-cacao"
                  : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        {p.estado === "aprobado" && !p.eventoId && (
          <button
            onClick={generarEvento}
            className="mt-4 rounded-xl bg-[#758F5F] text-white px-5 py-2.5 font-medium hover:opacity-90 transition-opacity"
          >
            + Crear evento en Eventos →
          </button>
        )}
        {p.eventoId && (
          <p className="mt-4 text-sm text-cacao-soft font-serif italic">
            Evento ya creado en la página de Eventos.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3 justify-between items-center">
          <Link
            href="/presupuestos/lista"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver al historial
          </Link>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/presupuestos/${p.id}/editar`}
              className="rounded-xl ring-1 ring-cacao px-4 py-2 text-xs uppercase tracking-widest text-cacao hover:bg-marfil-soft"
            >
              ✎ Editar presupuesto
            </Link>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta"
            >
              Eliminar presupuesto
            </button>
          </div>
        </div>
      </section>

      {/* Historial de cambios */}
      {versiones.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
            Historial de cambios
          </h2>
          <p className="text-xs text-cacao-soft italic font-serif mb-4">
            Cada vez que se edita este presupuesto se guarda el estado anterior
            como una versión. Click sobre cualquier versión para ver el detalle.
          </p>
          <ul className="divide-y divide-marfil">
            {versiones.map((v) => {
              const fecha = new Date(v.createdAt).toLocaleString("es-VE", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const abierto = versionAbierta === v.id;
              const snap = v.snapshot;
              return (
                <li key={v.id} className="py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setVersionAbierta(abierto ? null : v.id)
                    }
                    className="w-full text-left flex items-baseline justify-between gap-3 hover:bg-marfil-soft -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    <div>
                      <span className="text-cacao font-medium">
                        Versión {v.versionNumero}
                      </span>
                      <span className="text-xs text-cacao-soft ml-2">
                        · {fecha}
                      </span>
                      {v.motivo && (
                        <div className="text-xs text-cacao-soft italic font-serif mt-0.5">
                          {v.motivo}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-cacao text-sm font-medium">
                        ${snap.total?.toFixed?.(2) ?? "—"}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                        {snap.items?.length ?? 0} líneas
                      </div>
                    </div>
                  </button>
                  {abierto && (
                    <div className="mt-3 pl-4 border-l-2 border-marfil text-sm space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-cacao-soft">Cliente: </span>
                          <span className="text-cacao">
                            {snap.clienteNombre ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-cacao-soft">Evento: </span>
                          <span className="text-cacao">
                            {snap.eventoNombre ?? "—"}
                          </span>
                        </div>
                        {snap.eventoFecha && (
                          <div>
                            <span className="text-cacao-soft">Fecha: </span>
                            <span className="text-cacao">
                              {snap.eventoFecha}
                            </span>
                          </div>
                        )}
                        {snap.cantidadPersonas != null && (
                          <div>
                            <span className="text-cacao-soft">Personas: </span>
                            <span className="text-cacao">
                              {snap.cantidadPersonas}
                            </span>
                          </div>
                        )}
                        {snap.descuento > 0 && (
                          <div>
                            <span className="text-cacao-soft">Descuento: </span>
                            <span className="text-cacao">
                              ${snap.descuento.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                      {snap.items && snap.items.length > 0 && (
                        <div className="rounded-lg ring-1 ring-marfil overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-marfil-soft text-cacao-mute uppercase tracking-widest text-[10px]">
                              <tr>
                                <th className="px-2 py-1.5 text-left">
                                  Descripción
                                </th>
                                <th className="px-2 py-1.5 text-right">Cant.</th>
                                <th className="px-2 py-1.5 text-right">P.U.</th>
                                <th className="px-2 py-1.5 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-marfil">
                              {snap.items.map(
                                (it: Presupuesto["items"][number], i: number) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1.5 text-cacao">
                                      {it.nombre}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-cacao-soft">
                                      {it.cantidad}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-cacao-soft">
                                      ${Number(it.precioUnitario).toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-cacao">
                                      $
                                      {(
                                        Number(it.cantidad) *
                                        Number(it.precioUnitario)
                                      ).toFixed(2)}
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {snap.notas && (
                        <div className="text-xs text-cacao-soft italic font-serif">
                          Notas: {snap.notas}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="¿Eliminar presupuesto?"
        message={<>¿Eliminar el presupuesto {p.numero}? No se puede revertir.</>}
        confirmLabel="Sí, eliminar"
        onConfirm={() => {
          setConfirmingDelete(false);
          handleDelete();
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
