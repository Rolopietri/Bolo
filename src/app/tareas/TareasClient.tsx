"use client";

import { useEffect, useState } from "react";
import { CalendarIcon } from "@/components/icons";
import {
  ESTADOS_TAREA,
  PRIORIDADES,
  AREAS,
  type Tarea,
  type EstadoTarea,
  type Area,
  type Prioridad,
} from "@/lib/types";
import {
  listTareas,
  createTarea,
  updateTarea,
  deleteTarea,
  type TareaInput,
} from "@/lib/data/tareas";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type FilterEstado = EstadoTarea | "todas" | "activas";

export function TareasClient() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterEstado>("activas");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tareaPendiente, setTareaPendiente] = useState<string | null>(null);

  // Form state
  const [titulo, setTitulo] = useState("");
  const [estado, setEstado] = useState<EstadoTarea>("pendiente");
  const [area, setArea] = useState<Area | "">("");
  const [prioridad, setPrioridad] = useState<Prioridad | "">("");
  const [asignadoA, setAsignadoA] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listTareas();
        if (!cancelled) setTareas(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando tareas");
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
    setEstado("pendiente");
    setArea("");
    setPrioridad("");
    setAsignadoA("");
    setFechaLimite("");
    setNotas("");
    setEditingId(null);
    setAdding(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    const input: TareaInput = {
      titulo: titulo.trim(),
      estado,
      area: (area || undefined) as Area | undefined,
      prioridad: (prioridad || undefined) as Prioridad | undefined,
      asignadoA: asignadoA.trim() || undefined,
      fechaLimite: fechaLimite || undefined,
      notas: notas.trim() || undefined,
    };
    try {
      if (editingId) {
        const updated = await updateTarea(editingId, input);
        setTareas((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } else {
        const nueva = await createTarea(input);
        setTareas((prev) => [nueva, ...prev]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando");
    }
  }

  function startEdit(t: Tarea) {
    setEditingId(t.id);
    setTitulo(t.titulo);
    setEstado(t.estado);
    setArea(t.area || "");
    setPrioridad(t.prioridad || "");
    setAsignadoA(t.asignadoA || "");
    setFechaLimite(t.fechaLimite || "");
    setNotas(t.notas || "");
    setAdding(true);
  }

  async function handleDelete(id: string) {
    try {
      await deleteTarea(id);
      setTareas((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando");
    }
  }

  async function quickToggle(t: Tarea) {
    const nextEstado: EstadoTarea = t.estado === "completado" ? "pendiente" : "completado";
    try {
      const updated = await updateTarea(t.id, { estado: nextEstado });
      setTareas((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando");
    }
  }

  const filtered = tareas.filter((t) => {
    if (filter === "todas") return true;
    if (filter === "activas") return t.estado !== "completado";
    return t.estado === filter;
  });

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-5 overflow-x-auto">
        {([
          { v: "activas", l: "Activas" },
          { v: "todas", l: "Todas" },
          { v: "urgente", l: "Urgentes" },
          { v: "pendiente", l: "Pendientes" },
          { v: "en_proceso", l: "En proceso" },
          { v: "completado", l: "Completadas" },
        ] as { v: FilterEstado; l: string }[]).map(({ v, l }) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ring-1 transition-colors ${
              filter === v
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao ring-marfil hover:bg-marfil-light"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Add button */}
      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full mb-5 rounded-xl bg-terracotta text-white py-3 font-medium hover:bg-terracotta-deep transition-colors"
        >
          + Nueva tarea
        </button>
      )}

      {/* Form */}
      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="text-lg font-semibold text-cacao">
            {editingId ? "Editar tarea" : "Nueva tarea"}
          </h2>
          <input
            type="text"
            placeholder="¿Qué hay que hacer?"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
            required
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-cacao-soft"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Estado
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoTarea)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                {ESTADOS_TAREA.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-cacao">
              Área
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as Area)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                <option value="">— Sin área —</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-cacao">
              Prioridad
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                <option value="">— Sin prioridad —</option>
                {PRIORIDADES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-cacao">
              Asignado a
              <input
                type="text"
                placeholder="Beatriz, Lucía, etc."
                value={asignadoA}
                onChange={(e) => setAsignadoA(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Fecha límite
              <input
                type="date"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>
          <label className="text-sm text-cacao block">
            Notas
            <textarea
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

      {/* List */}
      {loading ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          Cargando...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
              No hay tareas {filter !== "todas" ? "en esta vista" : "todavía"}.
            </div>
          )}
          {filtered.map((t) => {
            const e = ESTADOS_TAREA.find((s) => s.value === t.estado)!;
            const pr = t.prioridad
              ? PRIORIDADES.find((p) => p.value === t.prioridad)
              : null;
            return (
              <div
                key={t.id}
                className="rounded-xl bg-white ring-1 ring-marfil p-4 flex items-start gap-3"
              >
                <button
                  onClick={() => quickToggle(t)}
                  aria-label="Marcar como completado"
                  className={`mt-1 size-5 rounded-full ring-1 flex items-center justify-center flex-shrink-0 transition-colors ${
                    t.estado === "completado"
                      ? "bg-[#758F5F] ring-[#758F5F] text-white"
                      : "ring-cacao-mute hover:ring-cacao-soft"
                  }`}
                >
                  {t.estado === "completado" && (
                    <svg viewBox="0 0 20 20" className="size-3" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.293a1 1 0 0 1 .003 1.414l-7.5 7.55a1 1 0 0 1-1.414.003l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.793 2.793 6.793-6.84a1 1 0 0 1 1.41-.006Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => startEdit(t)}
                    className="block text-left w-full"
                  >
                    <div
                      className={`text-cacao font-medium ${
                        t.estado === "completado" ? "line-through text-cacao-mute" : ""
                      }`}
                    >
                      {t.titulo}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ring-1 inline-flex items-center gap-1.5 ${e.color}`}>
                        <span className={`inline-block w-2 h-2 rounded-full ${e.dot}`} />
                        {e.label}
                      </span>
                      {t.area && (
                        <span className="px-2 py-0.5 rounded-full bg-marfil-light text-cacao ring-1 ring-marfil">
                          {t.area}
                        </span>
                      )}
                      {pr && (
                        <span className={`px-2 py-0.5 rounded-full ring-1 inline-flex items-center gap-1.5 ${pr.color}`}>
                          <span className={`inline-block w-2 h-2 rounded-full ${pr.dot}`} />
                          {pr.label}
                        </span>
                      )}
                      {t.asignadoA && (
                        <span className="text-cacao-soft">· {t.asignadoA}</span>
                      )}
                      {t.fechaLimite && (
                        <span className="text-cacao-soft">
                          · <CalendarIcon className="inline size-3.5 align-[-0.15em]" /> {new Date(t.fechaLimite + "T00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                    {t.notas && (
                      <div className="mt-2 text-sm text-cacao-soft">{t.notas}</div>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setTareaPendiente(t.id)}
                  aria-label="Eliminar"
                  className="text-cacao-mute hover:text-red-600 p-1"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
                    <path
                      fillRule="evenodd"
                      d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

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
