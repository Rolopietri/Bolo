"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarIcon, ClockIcon, PinIcon, UsersIcon } from "@/components/icons";
import {
  ESTADOS_EVENTO,
  FASES_EVENTO,
  ESTATUS_ACTIVIDAD,
  RESPONSABLES_EVENTO_SUGERIDOS,
  faseLabel,
  type Evento,
  type EventoTarea,
  type EventoActividad,
  type EventoPlantilla,
  type FaseEvento,
  type EstatusActividad,
} from "@/lib/types";
import { listEventos } from "@/lib/data/eventos";
import {
  listTareas,
  createTarea,
  updateTarea,
  deleteTarea,
} from "@/lib/data/evento-tareas";
import {
  listActividades,
  createActividad,
  updateActividad,
  deleteActividad,
} from "@/lib/data/evento-actividades";
import {
  listPlantillas,
  aplicarPlantilla,
  plantillaResumen,
} from "@/lib/data/evento-plantillas";
import { extractError } from "@/lib/data/error";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Tab = "resumen" | "checklist" | "cronograma";

export function EventoDetailClient({ id }: { id: string }) {
  const [evento, setEvento] = useState<Evento | null>(null);
  const [tareas, setTareas] = useState<EventoTarea[]>([]);
  const [actividades, setActividades] = useState<EventoActividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("resumen");

  // ── Carga inicial ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [evs, ts, as] = await Promise.all([
          listEventos(),
          listTareas(id),
          listActividades(id),
        ]);
        if (cancelled) return;
        const ev = evs.find((e) => e.id === id) ?? null;
        setEvento(ev);
        setTareas(ts);
        setActividades(as);
      } catch (e) {
        if (!cancelled) setError(extractError(e, "Error cargando evento"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Banner de info auto-cerrable ──────────────────────────
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando evento...
      </div>
    );
  }
  if (error || !evento) {
    return (
      <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-4 text-sm text-[#7A2419]">
        {error || "Evento no encontrado"}{" "}
        <Link href="/eventos" className="underline ml-2">
          Volver
        </Link>
      </div>
    );
  }

  const estado = ESTADOS_EVENTO.find((e) => e.value === evento.estado)!;
  const fechaFmt = new Date(evento.fecha + "T00:00").toLocaleDateString(
    "es-VE",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );
  // Rango de fechas para eventos multi-día
  const fechaFinFmt =
    evento.fechaFin && evento.fechaFin !== evento.fecha
      ? new Date(evento.fechaFin + "T00:00").toLocaleDateString("es-VE", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  const totalTareas = tareas.length;
  const tareasCompl = tareas.filter((t) => t.completada).length;
  const progresoPorc =
    totalTareas > 0 ? Math.round((tareasCompl / totalTareas) * 100) : 0;

  return (
    <div className="space-y-6">
      {info && (
        <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F]">
          {info}
        </div>
      )}

      {/* ── Cabecera ─────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <Link
            href="/eventos"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Eventos
          </Link>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.1em] text-cacao">
            {evento.titulo}
          </h1>
          <p className="mt-1 font-serif italic text-cacao-soft capitalize">
            {fechaFmt}
            {fechaFinFmt && <> → <span className="capitalize">{fechaFinFmt}</span></>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-0.5 rounded-full ring-1 inline-flex items-center gap-1.5 ${estado.color}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${estado.dot}`} />
              {estado.label}
            </span>
            {evento.horario && (
              <span className="text-cacao-soft inline-flex items-center gap-1">
                <ClockIcon className="size-3.5" />
                {evento.horario}
              </span>
            )}
            {evento.ubicacion && (
              <span className="text-cacao-soft inline-flex items-center gap-1">
                <PinIcon className="size-3.5" />
                {evento.ubicacion}
              </span>
            )}
            {evento.cliente && (
              <span className="text-cacao-soft">· {evento.cliente}</span>
            )}
            {evento.cantidadPersonas !== undefined &&
              evento.cantidadPersonas > 0 && (
                <span className="text-cacao-soft inline-flex items-center gap-1">
                  · <UsersIcon className="size-3.5" /> {evento.cantidadPersonas} personas
                </span>
              )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs uppercase tracking-widest text-cacao-mute">
            Progreso checklist
          </div>
          <div className="text-2xl font-cinzel text-cacao mt-1">
            {tareasCompl}/{totalTareas}
          </div>
          <div className="w-40 h-1.5 mt-2 bg-marfil-soft rounded-full overflow-hidden">
            <div
              className="h-full bg-terracotta transition-all"
              style={{ width: `${progresoPorc}%` }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-cacao-mute mt-1">
            {progresoPorc}%
          </div>
        </div>
      </header>

      {/* ── Tabs ─────────────────────────────────────────── */}
      <nav className="flex flex-wrap gap-1 border-b border-marfil">
        {(
          [
            { value: "resumen", label: "Resumen" },
            {
              value: "checklist",
              label: `Checklist (${totalTareas})`,
            },
            {
              value: "cronograma",
              label: `Cronograma (${actividades.length})`,
            },
          ] as { value: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-display uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              tab === t.value
                ? "border-cacao text-cacao"
                : "border-transparent text-cacao-soft hover:text-cacao"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Contenido ────────────────────────────────────── */}
      {tab === "resumen" && (
        <ResumenTab
          evento={evento}
          tareas={tareas}
          actividades={actividades}
        />
      )}
      {tab === "checklist" && (
        <ChecklistTab
          eventoId={id}
          eventoFecha={evento.fecha}
          tareas={tareas}
          setTareas={setTareas}
          setError={setError}
          setInfo={setInfo}
        />
      )}
      {tab === "cronograma" && (
        <CronogramaTab
          eventoId={id}
          eventoFecha={evento.fecha}
          actividades={actividades}
          setActividades={setActividades}
          setError={setError}
          setInfo={setInfo}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB · RESUMEN
// ═══════════════════════════════════════════════════════════════

function ResumenTab({
  evento,
  tareas,
  actividades,
}: {
  evento: Evento;
  tareas: EventoTarea[];
  actividades: EventoActividad[];
}) {
  const porFase = useMemo(() => {
    const map = new Map<string, { total: number; completadas: number }>();
    tareas.forEach((t) => {
      const cur = map.get(t.fase) ?? { total: 0, completadas: 0 };
      cur.total += 1;
      if (t.completada) cur.completadas += 1;
      map.set(t.fase, cur);
    });
    return map;
  }, [tareas]);

  const criticas = actividades.filter((a) => a.critica);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Datos
        </h2>
        <dl className="text-sm space-y-2.5">
          {evento.cliente && (
            <div>
              <dt className="text-cacao-soft text-xs">Cliente</dt>
              <dd className="text-cacao">{evento.cliente}</dd>
            </div>
          )}
          {evento.ubicacion && (
            <div>
              <dt className="text-cacao-soft text-xs">Ubicación</dt>
              <dd className="text-cacao">{evento.ubicacion}</dd>
            </div>
          )}
          {evento.horario && (
            <div>
              <dt className="text-cacao-soft text-xs">Horarios</dt>
              <dd className="text-cacao">{evento.horario}</dd>
            </div>
          )}
          {evento.cantidadPersonas !== undefined &&
            evento.cantidadPersonas > 0 && (
              <div>
                <dt className="text-cacao-soft text-xs">
                  Cantidad de personas
                </dt>
                <dd className="text-cacao">{evento.cantidadPersonas}</dd>
              </div>
            )}
          {evento.descripcion && (
            <div>
              <dt className="text-cacao-soft text-xs">Descripción</dt>
              <dd className="text-cacao whitespace-pre-wrap">
                {evento.descripcion}
              </dd>
            </div>
          )}
          {evento.notas && (
            <div>
              <dt className="text-cacao-soft text-xs">Notas internas</dt>
              <dd className="text-cacao whitespace-pre-wrap">{evento.notas}</dd>
            </div>
          )}
          {!evento.cliente &&
            !evento.ubicacion &&
            !evento.horario &&
            !evento.cantidadPersonas &&
            !evento.descripcion &&
            !evento.notas && (
              <p className="font-serif italic text-cacao-soft">
                Sin datos adicionales.
              </p>
            )}
        </dl>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Progreso por fase
        </h2>
        {porFase.size === 0 ? (
          <p className="font-serif italic text-sm text-cacao-soft">
            Sin tareas registradas. Ve a Checklist para empezar.
          </p>
        ) : (
          <ul className="space-y-2">
            {FASES_EVENTO.map((f) => {
              const data = porFase.get(f.value);
              if (!data) return null;
              const pct = data.total
                ? Math.round((data.completadas / data.total) * 100)
                : 0;
              return (
                <li
                  key={f.value}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest ring-1 ${f.color}`}
                  >
                    {f.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-marfil-soft rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cacao"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-cacao-soft text-xs w-12 text-right">
                    {data.completadas}/{data.total}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {criticas.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 md:col-span-2">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
            Momentos críticos del día
          </h2>
          <ul className="divide-y divide-marfil">
            {criticas.map((a) => (
              <li
                key={a.id}
                className="py-2 flex items-start justify-between gap-3 text-sm"
              >
                <div>
                  <div className="text-cacao font-medium">{a.actividad}</div>
                  {a.observaciones && (
                    <div className="text-xs text-cacao-soft italic font-serif mt-0.5">
                      {a.observaciones}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {a.hora && (
                    <div className="text-cacao font-medium">{a.hora}</div>
                  )}
                  {a.responsable && (
                    <div className="text-xs text-cacao-soft">{a.responsable}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB · CHECKLIST
// ═══════════════════════════════════════════════════════════════

function ChecklistTab({
  eventoId,
  eventoFecha,
  tareas,
  setTareas,
  setError,
  setInfo,
}: {
  eventoId: string;
  eventoFecha: string;
  tareas: EventoTarea[];
  setTareas: React.Dispatch<React.SetStateAction<EventoTarea[]>>;
  setError: (e: string | null) => void;
  setInfo: (s: string | null) => void;
}) {
  const [adding, setAdding] = useState<FaseEvento | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tareaPendiente, setTareaPendiente] = useState<string | null>(null);
  const [form, setForm] = useState({
    titulo: "",
    responsable: "",
    notas: "",
    fechaLimite: "",
    fase: "pre-pro" as FaseEvento,
  });

  function startNueva(fase: FaseEvento) {
    setEditingId(null);
    setForm({
      titulo: "",
      responsable: "",
      notas: "",
      fechaLimite: "",
      fase,
    });
    setAdding(fase);
  }
  function startEdit(t: EventoTarea) {
    setEditingId(t.id);
    setForm({
      titulo: t.titulo,
      responsable: t.responsable ?? "",
      notas: t.notas ?? "",
      fechaLimite: t.fechaLimite ?? "",
      fase: t.fase as FaseEvento,
    });
    setAdding(t.fase as FaseEvento);
  }
  function cancelForm() {
    setAdding(null);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    setError(null);
    const input = {
      eventoId,
      fase: form.fase,
      titulo: form.titulo.trim(),
      responsable: form.responsable.trim() || undefined,
      notas: form.notas.trim() || undefined,
      fechaLimite: form.fechaLimite || undefined,
      completada: false,
      orden:
        (tareas
          .filter((t) => t.fase === form.fase)
          .at(-1)?.orden ?? 0) + 10,
    };
    try {
      if (editingId) {
        const upd = await updateTarea(editingId, input);
        setTareas((prev) => prev.map((x) => (x.id === editingId ? upd : x)));
      } else {
        const nueva = await createTarea(input);
        setTareas((prev) => [...prev, nueva]);
      }
      cancelForm();
    } catch (e) {
      setError(extractError(e, "Error guardando tarea"));
    }
  }

  async function toggle(t: EventoTarea) {
    try {
      const upd = await updateTarea(t.id, { completada: !t.completada });
      setTareas((prev) => prev.map((x) => (x.id === t.id ? upd : x)));
    } catch (e) {
      setError(extractError(e, "Error actualizando"));
    }
  }
  async function handleDelete(id: string) {
    try {
      await deleteTarea(id);
      setTareas((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(extractError(e, "Error eliminando"));
    }
  }

  const tareasPorFase = useMemo(() => {
    const map = new Map<string, EventoTarea[]>();
    FASES_EVENTO.forEach((f) => map.set(f.value, []));
    tareas.forEach((t) => {
      if (!map.has(t.fase)) map.set(t.fase, []);
      map.get(t.fase)!.push(t);
    });
    return map;
  }, [tareas]);

  return (
    <div className="space-y-5">
      <PlantillaPicker
        eventoId={eventoId}
        eventoFecha={eventoFecha}
        modo="tareas"
        onAplicada={async () => {
          const ts = await listTareas(eventoId);
          setTareas(ts);
          setInfo("Plantilla aplicada al checklist.");
        }}
        setError={setError}
      />

      {FASES_EVENTO.map((f) => {
        const items = tareasPorFase.get(f.value) ?? [];
        const isAdding = adding === f.value;
        return (
          <section
            key={f.value}
            className="rounded-2xl bg-white ring-1 ring-marfil p-5"
          >
            <header className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-widest ring-1 ${f.color}`}
                >
                  {f.label}
                </span>
                <span className="text-xs text-cacao-mute">
                  {items.filter((t) => t.completada).length}/{items.length}
                </span>
              </div>
              {!isAdding && (
                <button
                  onClick={() => startNueva(f.value)}
                  className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
                >
                  + Tarea
                </button>
              )}
            </header>

            {isAdding && (
              <form
                onSubmit={handleSubmit}
                className="mb-3 rounded-xl ring-1 ring-marfil p-3 space-y-2 bg-marfil-soft"
              >
                <input
                  type="text"
                  placeholder="¿Qué hay que hacer?"
                  value={form.titulo}
                  onChange={(e) =>
                    setForm({ ...form, titulo: e.target.value })
                  }
                  autoFocus
                  required
                  className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    list="responsables-evento-list"
                    placeholder="Responsable"
                    value={form.responsable}
                    onChange={(e) =>
                      setForm({ ...form, responsable: e.target.value })
                    }
                    className="rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
                  />
                  <input
                    type="date"
                    value={form.fechaLimite}
                    onChange={(e) =>
                      setForm({ ...form, fechaLimite: e.target.value })
                    }
                    className="rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Notas (opcional)"
                  value={form.notas}
                  onChange={(e) =>
                    setForm({ ...form, notas: e.target.value })
                  }
                  className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-cacao text-white py-2 text-sm font-medium hover:bg-terracotta"
                  >
                    {editingId ? "Guardar" : "Crear"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelForm}
                    className="rounded-lg ring-1 ring-marfil px-4 py-2 text-sm text-cacao hover:bg-white"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {items.length === 0 && !isAdding ? (
              <p className="font-serif italic text-sm text-cacao-soft">
                Sin tareas en esta fase.
              </p>
            ) : (
              <ul className="divide-y divide-marfil">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className="py-2.5 flex items-start gap-3"
                  >
                    <button
                      onClick={() => toggle(t)}
                      aria-label="Marcar"
                      className={`mt-0.5 size-5 rounded ring-1 flex items-center justify-center shrink-0 transition-colors ${
                        t.completada
                          ? "bg-cacao ring-cacao text-white"
                          : "ring-marfil bg-white hover:ring-cacao"
                      }`}
                    >
                      {t.completada && (
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="size-3.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm ${
                          t.completada
                            ? "text-cacao-mute line-through"
                            : "text-cacao"
                        }`}
                      >
                        {t.titulo}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cacao-soft mt-0.5">
                        {t.responsable && <span>{t.responsable}</span>}
                        {t.fechaLimite && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="size-3.5" />
                            {new Date(
                              t.fechaLimite + "T00:00",
                            ).toLocaleDateString("es-VE", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                        {t.notas && (
                          <span className="italic font-serif">{t.notas}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 text-[10px] uppercase tracking-widest">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-cacao-soft hover:text-cacao"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setTareaPendiente(t.id)}
                        className="text-cacao-soft hover:text-terracotta"
                      >
                        Borrar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <datalist id="responsables-evento-list">
        {RESPONSABLES_EVENTO_SUGERIDOS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <ConfirmDialog
        open={tareaPendiente !== null}
        title="¿Eliminar esta tarea?"
        confirmLabel="Sí, eliminar"
        onConfirm={() => {
          if (tareaPendiente) handleDelete(tareaPendiente);
          setTareaPendiente(null);
        }}
        onCancel={() => setTareaPendiente(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB · CRONOGRAMA
// ═══════════════════════════════════════════════════════════════

function CronogramaTab({
  eventoId,
  eventoFecha,
  actividades,
  setActividades,
  setError,
  setInfo,
}: {
  eventoId: string;
  eventoFecha: string;
  actividades: EventoActividad[];
  setActividades: React.Dispatch<React.SetStateAction<EventoActividad[]>>;
  setError: (e: string | null) => void;
  setInfo: (s: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actividadPendiente, setActividadPendiente] = useState<string | null>(null);
  const [form, setForm] = useState({
    hora: "",
    actividad: "",
    responsable: "",
    ubicacion: "",
    observaciones: "",
    critica: false,
  });

  function reset() {
    setAdding(false);
    setEditingId(null);
    setForm({
      hora: "",
      actividad: "",
      responsable: "",
      ubicacion: "",
      observaciones: "",
      critica: false,
    });
  }
  function startEdit(a: EventoActividad) {
    setEditingId(a.id);
    setForm({
      hora: a.hora ?? "",
      actividad: a.actividad,
      responsable: a.responsable ?? "",
      ubicacion: a.ubicacion ?? "",
      observaciones: a.observaciones ?? "",
      critica: a.critica,
    });
    setAdding(true);
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.actividad.trim()) return;
    setError(null);
    const input = {
      eventoId,
      hora: form.hora || undefined,
      actividad: form.actividad.trim(),
      responsable: form.responsable.trim() || undefined,
      ubicacion: form.ubicacion.trim() || undefined,
      observaciones: form.observaciones.trim() || undefined,
      critica: form.critica,
      estatus: "pendiente" as EstatusActividad,
      orden: (actividades.at(-1)?.orden ?? 0) + 10,
    };
    try {
      if (editingId) {
        const upd = await updateActividad(editingId, input);
        setActividades((prev) =>
          prev.map((x) => (x.id === editingId ? upd : x)),
        );
      } else {
        const nueva = await createActividad(input);
        setActividades((prev) =>
          [...prev, nueva].sort((a, b) =>
            (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99"),
          ),
        );
      }
      reset();
    } catch (e) {
      setError(extractError(e, "Error guardando"));
    }
  }
  async function setEstatus(a: EventoActividad, estatus: EstatusActividad) {
    try {
      const upd = await updateActividad(a.id, { estatus });
      setActividades((prev) => prev.map((x) => (x.id === a.id ? upd : x)));
    } catch (e) {
      setError(extractError(e, "Error actualizando"));
    }
  }
  async function handleDelete(id: string) {
    try {
      await deleteActividad(id);
      setActividades((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(extractError(e, "Error eliminando"));
    }
  }

  return (
    <div className="space-y-5">
      <PlantillaPicker
        eventoId={eventoId}
        eventoFecha={eventoFecha}
        modo="cronograma"
        onAplicada={async () => {
          const as = await listActividades(eventoId);
          setActividades(as);
          setInfo("Plantilla aplicada al cronograma.");
        }}
        setError={setError}
      />

      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <header className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
            Run of show
          </h2>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              + Actividad
            </button>
          )}
        </header>

        {adding && (
          <form
            onSubmit={handleSubmit}
            className="mb-4 rounded-xl ring-1 ring-marfil p-3 bg-marfil-soft space-y-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="time"
                value={form.hora}
                onChange={(e) =>
                  setForm({ ...form, hora: e.target.value })
                }
                className="rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
              />
              <input
                type="text"
                placeholder="¿Qué actividad?"
                value={form.actividad}
                onChange={(e) =>
                  setForm({ ...form, actividad: e.target.value })
                }
                autoFocus
                required
                className="sm:col-span-3 rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                list="responsables-evento-list"
                placeholder="Responsable"
                value={form.responsable}
                onChange={(e) =>
                  setForm({ ...form, responsable: e.target.value })
                }
                className="rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
              />
              <input
                type="text"
                placeholder="Ubicación"
                value={form.ubicacion}
                onChange={(e) =>
                  setForm({ ...form, ubicacion: e.target.value })
                }
                className="rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
              />
            </div>
            <input
              type="text"
              placeholder="Observaciones / requerimientos"
              value={form.observaciones}
              onChange={(e) =>
                setForm({ ...form, observaciones: e.target.value })
              }
              className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
            />
            <label className="flex items-center gap-2 text-sm text-cacao">
              <input
                type="checkbox"
                checked={form.critica}
                onChange={(e) =>
                  setForm({ ...form, critica: e.target.checked })
                }
              />
              Tarea crítica (resaltar en el resumen)
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-cacao text-white py-2 text-sm font-medium hover:bg-terracotta"
              >
                {editingId ? "Guardar" : "Crear"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg ring-1 ring-marfil px-4 py-2 text-sm text-cacao hover:bg-white"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {actividades.length === 0 && !adding ? (
          <p className="font-serif italic text-sm text-cacao-soft">
            Sin actividades en el cronograma. Aplica una plantilla o agrega
            una manualmente.
          </p>
        ) : (
          <ol className="divide-y divide-marfil">
            {actividades.map((a) => {
              const est = ESTATUS_ACTIVIDAD.find(
                (e) => e.value === a.estatus,
              )!;
              return (
                <li
                  key={a.id}
                  className={`py-3 grid grid-cols-12 gap-3 items-start ${
                    a.estatus === "hecho" ? "opacity-60" : ""
                  }`}
                >
                  <div className="col-span-3 sm:col-span-2 text-right">
                    <div className="text-cacao font-medium font-cinzel">
                      {a.hora ?? "—"}
                    </div>
                    {a.critica && (
                      <div className="text-[10px] uppercase tracking-widest text-terracotta mt-0.5">
                        ★ Crítica
                      </div>
                    )}
                  </div>
                  <div className="col-span-9 sm:col-span-7 min-w-0">
                    <div className="text-sm text-cacao font-medium">
                      {a.actividad}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-cacao-soft mt-0.5">
                      {a.responsable && <span>{a.responsable}</span>}
                      {a.ubicacion && (
                        <span className="inline-flex items-center gap-1">
                          <PinIcon className="size-3.5" />
                          {a.ubicacion}
                        </span>
                      )}
                    </div>
                    {a.observaciones && (
                      <div className="text-xs text-cacao-soft italic font-serif mt-1">
                        {a.observaciones}
                      </div>
                    )}
                  </div>
                  <div className="col-span-12 sm:col-span-3 flex flex-col items-end gap-1.5">
                    <select
                      value={a.estatus}
                      onChange={(e) =>
                        setEstatus(a, e.target.value as EstatusActividad)
                      }
                      className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full ring-1 bg-white ${est.color}`}
                    >
                      {ESTATUS_ACTIVIDAD.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-3 text-[10px] uppercase tracking-widest">
                      <button
                        onClick={() => startEdit(a)}
                        className="text-cacao-soft hover:text-cacao"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setActividadPendiente(a.id)}
                        className="text-cacao-soft hover:text-terracotta"
                      >
                        Borrar
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={actividadPendiente !== null}
        title="¿Eliminar esta actividad del cronograma?"
        confirmLabel="Sí, eliminar"
        onConfirm={() => {
          if (actividadPendiente) handleDelete(actividadPendiente);
          setActividadPendiente(null);
        }}
        onCancel={() => setActividadPendiente(null)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SELECTOR DE PLANTILLA (compartido entre checklist y cronograma)
// ═══════════════════════════════════════════════════════════════

function PlantillaPicker({
  eventoId,
  eventoFecha,
  modo,
  onAplicada,
  setError,
}: {
  eventoId: string;
  eventoFecha: string;
  modo: "tareas" | "cronograma";
  onAplicada: () => Promise<void> | void;
  setError: (e: string | null) => void;
}) {
  const [plantillas, setPlantillas] = useState<EventoPlantilla[]>([]);
  const [resumen, setResumen] = useState<
    Map<string, { tareas: number; actividades: number }>
  >(new Map());
  const [seleccion, setSeleccion] = useState<string>("");
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pls = await listPlantillas();
        if (cancelled) return;
        setPlantillas(pls);
        if (pls.length > 0) {
          const r = await plantillaResumen(pls.map((p) => p.id));
          if (!cancelled) setResumen(r);
        }
      } catch (e) {
        if (!cancelled) setError(extractError(e, "Error cargando plantillas"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (plantillas.length === 0) return null;

  async function handleAplicar() {
    if (!seleccion) return;
    setAplicando(true);
    setError(null);
    try {
      await aplicarPlantilla(seleccion, eventoId, eventoFecha, {
        tareas: modo === "tareas",
        cronograma: modo === "cronograma",
      });
      await onAplicada();
      setSeleccion("");
    } catch (e) {
      setError(extractError(e, "Error aplicando plantilla"));
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="rounded-xl ring-1 ring-marfil bg-marfil-soft p-3 flex items-center gap-2 flex-wrap">
      <span className="font-display text-[11px] tracking-[0.3em] uppercase text-cacao-soft">
        Plantilla
      </span>
      <select
        value={seleccion}
        onChange={(e) => setSeleccion(e.target.value)}
        className="rounded-lg ring-1 ring-marfil px-3 py-1.5 text-sm bg-white flex-1 min-w-[200px]"
      >
        <option value="">— Elegir plantilla —</option>
        {plantillas.map((p) => {
          const r = resumen.get(p.id);
          const count =
            modo === "tareas" ? r?.tareas ?? 0 : r?.actividades ?? 0;
          return (
            <option key={p.id} value={p.id} disabled={count === 0}>
              {p.nombre} ({count}{" "}
              {modo === "tareas" ? "tareas" : "actividades"})
            </option>
          );
        })}
      </select>
      <button
        type="button"
        onClick={handleAplicar}
        disabled={!seleccion || aplicando}
        className="rounded-lg bg-cacao text-white px-4 py-1.5 text-sm hover:bg-terracotta disabled:opacity-50"
      >
        {aplicando ? "Aplicando..." : "Aplicar →"}
      </button>
      <span className="text-[10px] uppercase tracking-widest text-cacao-mute w-full">
        Las {modo === "tareas" ? "tareas" : "actividades"} se suman a las
        actuales (no las reemplazan).
      </span>
    </div>
  );
}

// Re-export para usar faseLabel sin tener que importarlo en cada sub-componente
export { faseLabel };
