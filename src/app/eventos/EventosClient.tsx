"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClockIcon, PinIcon, UsersIcon } from "@/components/icons";
import {
  ESTADOS_EVENTO,
  type Evento,
  type EstadoEvento,
} from "@/lib/types";
import {
  listEventos,
  createEvento,
  updateEvento,
  deleteEvento,
  type EventoInput,
} from "@/lib/data/eventos";
import { tareasResumen } from "@/lib/data/evento-tareas";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function EventosClient() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [progresos, setProgresos] = useState<
    Map<string, { total: number; completadas: number }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendienteBorrar, setPendienteBorrar] = useState<string | null>(null);

  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horario, setHorario] = useState("");
  const [estado, setEstado] = useState<EstadoEvento>("por_confirmar");
  const [ubicacion, setUbicacion] = useState("");
  const [cliente, setCliente] = useState("");
  const [cantidadPersonas, setCantidadPersonas] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listEventos();
        if (cancelled) return;
        setEventos(data);
        // El resumen de tareas es opcional — si la tabla no existe aún,
        // simplemente no mostramos el badge de progreso.
        try {
          const prog = await tareasResumen(data.map((e) => e.id));
          if (!cancelled) setProgresos(prog);
        } catch {
          // silent — el resumen es decorativo
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error cargando eventos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetForm() {
    setTitulo("");
    setFecha("");
    setFechaFin("");
    setHorario("");
    setEstado("por_confirmar");
    setUbicacion("");
    setCliente("");
    setCantidadPersonas("");
    setDescripcion("");
    setNotas("");
    setEditingId(null);
    setAdding(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !fecha) return;
    // Validación: si hay fecha fin, debe ser igual o posterior a la inicio
    if (fechaFin && fechaFin < fecha) {
      setError("La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }
    // Importante: enviamos los strings vacíos como "" (no como undefined).
    // El data layer convierte "" a null antes de escribir en la BD. Así, vaciar
    // un campo y guardar realmente lo limpia (en lugar de dejar el valor viejo).
    const input: EventoInput = {
      titulo: titulo.trim(),
      fecha,
      fechaFin: fechaFin,
      horario: horario.trim(),
      estado,
      ubicacion: ubicacion.trim(),
      cliente: cliente.trim(),
      cantidadPersonas:
        cantidadPersonas.trim() === ""
          ? null
          : Number(cantidadPersonas) || null,
      descripcion: descripcion.trim(),
      notas: notas.trim(),
    };
    try {
      if (editingId) {
        const updated = await updateEvento(editingId, input);
        setEventos((prev) => prev.map((ev) => (ev.id === editingId ? updated : ev)));
      } else {
        const nuevo = await createEvento(input);
        setEventos((prev) => [...prev, nuevo]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando");
    }
  }

  function startEdit(ev: Evento) {
    setEditingId(ev.id);
    setTitulo(ev.titulo);
    setFecha(ev.fecha);
    setFechaFin(ev.fechaFin ?? "");
    setHorario(ev.horario ?? "");
    setEstado(ev.estado);
    setUbicacion(ev.ubicacion || "");
    setCliente(ev.cliente || "");
    setCantidadPersonas(
      ev.cantidadPersonas !== undefined ? String(ev.cantidadPersonas) : "",
    );
    setDescripcion(ev.descripcion || "");
    setNotas(ev.notas || "");
    setAdding(true);
  }

  async function handleDelete(id: string) {
    try {
      await deleteEvento(id);
      setEventos((prev) => prev.filter((ev) => ev.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando");
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const { proximos, pasados } = useMemo(() => {
    const sorted = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha));
    return {
      proximos: sorted.filter((e) => e.fecha >= today),
      pasados: sorted.filter((e) => e.fecha < today).reverse(),
    };
  }, [eventos, today]);

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full mb-5 rounded-xl bg-terracotta text-white py-3 font-medium hover:bg-terracotta-deep transition-colors"
        >
          + Nuevo evento
        </button>
      )}

      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="text-lg font-semibold text-cacao">
            {editingId ? "Editar evento" : "Nuevo evento"}
          </h2>
          <input
            type="text"
            placeholder="Nombre del evento"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
            required
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Fecha de inicio
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Fecha de fin{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <input
                type="date"
                value={fechaFin}
                min={fecha || undefined}
                onChange={(e) => setFechaFin(e.target.value)}
                placeholder="Solo si dura más de un día"
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              <span className="text-[10px] text-cacao-mute block mt-1">
                Déjalo vacío si es un solo día.
              </span>
            </label>
          </div>
          <label className="text-sm text-cacao block">
            Horarios
            <input
              type="text"
              placeholder='Ej: "9am–6pm" o "Día 1: 9-13h · Día 2: 10-14h"'
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Estado
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoEvento)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                {ESTADOS_EVENTO.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-cacao">
              Cantidad de personas
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Ej: 50"
                value={cantidadPersonas}
                onChange={(e) => setCantidadPersonas(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Ubicación
              <input
                type="text"
                placeholder="Sala expositiva, terraza..."
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Cliente
              <input
                type="text"
                placeholder="Nombre del cliente o marca"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>
          <label className="text-sm text-cacao block">
            Descripción del evento
            <textarea
              placeholder="Qué se va a hacer, contexto, objetivos..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <label className="text-sm text-cacao block">
            Notas internas
            <textarea
              placeholder="Logística, recordatorios..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-terracotta text-white py-2 font-medium hover:bg-terracotta-deep transition-colors"
            >
              {editingId ? "Guardar" : "Crear"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-light"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          Cargando...
        </div>
      ) : (
        <>
          <Section
            title="Próximos"
            empty="No hay eventos próximos."
            eventos={proximos}
            progresos={progresos}
            onEdit={startEdit}
            onDelete={(id) => setPendienteBorrar(id)}
          />
          {pasados.length > 0 && (
            <Section
              title="Pasados"
              empty=""
              eventos={pasados}
              progresos={progresos}
              onEdit={startEdit}
              onDelete={(id) => setPendienteBorrar(id)}
              faded
            />
          )}
        </>
      )}

      <ConfirmDialog
        open={pendienteBorrar !== null}
        title="¿Eliminar este evento?"
        onConfirm={() => {
          if (pendienteBorrar) handleDelete(pendienteBorrar);
          setPendienteBorrar(null);
        }}
        onCancel={() => setPendienteBorrar(null)}
      />
    </div>
  );
}

function Section({
  title,
  empty,
  eventos,
  progresos,
  onEdit,
  onDelete,
  faded,
}: {
  title: string;
  empty: string;
  eventos: Evento[];
  progresos: Map<string, { total: number; completadas: number }>;
  onEdit: (ev: Evento) => void;
  onDelete: (id: string) => void;
  faded?: boolean;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-cacao-soft mb-3">
        {title}
      </h2>
      {eventos.length === 0 && empty && (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-6 text-center text-cacao-soft">
          {empty}
        </div>
      )}
      <div className="space-y-2">
        {eventos.map((ev) => {
          const e = ESTADOS_EVENTO.find((s) => s.value === ev.estado)!;
          const date = new Date(ev.fecha + "T00:00");
          const dateFin = ev.fechaFin
            ? new Date(ev.fechaFin + "T00:00")
            : null;
          const multiDia = !!dateFin && ev.fechaFin !== ev.fecha;
          const p = progresos.get(ev.id);
          const pct =
            p && p.total > 0 ? Math.round((p.completadas / p.total) * 100) : 0;
          return (
            <div
              key={ev.id}
              className={`rounded-xl bg-white ring-1 ring-marfil p-4 flex items-start gap-4 ${
                faded ? "opacity-70" : ""
              }`}
            >
              <div className="flex-shrink-0 text-center w-14">
                <div className="text-xs uppercase tracking-wide text-cacao-soft">
                  {date.toLocaleDateString("es-VE", { month: "short" })}
                </div>
                <div className="text-2xl font-bold text-cacao">
                  {date.getDate()}
                </div>
                {multiDia && dateFin && (
                  <div className="text-[10px] uppercase tracking-wide text-cacao-mute mt-0.5">
                    → {dateFin.getDate()}{" "}
                    {dateFin.toLocaleDateString("es-VE", { month: "short" })}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/eventos/${ev.id}`}
                  className="block hover:opacity-80 transition-opacity"
                >
                  <div className="font-medium text-cacao">{ev.titulo}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full ring-1 inline-flex items-center gap-1.5 ${e.color}`}
                    >
                      <span className={`inline-block w-2 h-2 rounded-full ${e.dot}`} />
                      {e.label}
                    </span>
                    {ev.horario && (
                      <span className="text-cacao-soft inline-flex items-center gap-1">
                        <ClockIcon className="size-3.5" />
                        {ev.horario}
                      </span>
                    )}
                    {ev.ubicacion && (
                      <span className="text-cacao-soft inline-flex items-center gap-1">
                        <PinIcon className="size-3.5" />
                        {ev.ubicacion}
                      </span>
                    )}
                    {ev.cliente && (
                      <span className="text-cacao-soft">· {ev.cliente}</span>
                    )}
                    {ev.cantidadPersonas !== undefined &&
                      ev.cantidadPersonas > 0 && (
                        <span className="text-cacao-soft inline-flex items-center gap-1">
                          · <UsersIcon className="size-3.5" /> {ev.cantidadPersonas} pers.
                        </span>
                      )}
                    {p && p.total > 0 && (
                      <span className="text-cacao-soft">
                        · ✓ {p.completadas}/{p.total} ({pct}%)
                      </span>
                    )}
                  </div>
                  {ev.descripcion && (
                    <div className="mt-2 text-sm text-cacao-soft">
                      {ev.descripcion}
                    </div>
                  )}
                </Link>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <button
                  onClick={() => onEdit(ev)}
                  className="text-[10px] uppercase tracking-widest text-cacao-soft hover:text-cacao"
                >
                  Editar
                </button>
                <button
                  onClick={() => onDelete(ev.id)}
                  aria-label="Eliminar"
                  className="text-cacao-mute hover:text-red-600 p-1"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5Zm0 1.5h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4s-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
