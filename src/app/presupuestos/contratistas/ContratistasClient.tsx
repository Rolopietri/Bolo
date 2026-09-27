"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ESPECIALIDADES_CONTRATISTA_SUGERIDAS,
  type Contratista,
} from "@/lib/types";
import {
  listContratistas,
  createContratista,
  updateContratista,
  deleteContratista,
} from "@/lib/data/contratistas";
import { extractError } from "@/lib/data/error";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type FormState = {
  nombre: string;
  especialidad: string;
  contactoNombre: string;
  contactoTelefono: string;
  contactoEmail: string;
  precioReferencialUsd: string;
  comisionPorc: string;
  notas: string;
};

const emptyForm: FormState = {
  nombre: "",
  especialidad: "",
  contactoNombre: "",
  contactoTelefono: "",
  contactoEmail: "",
  precioReferencialUsd: "",
  comisionPorc: "",
  notas: "",
};

export function ContratistasClient() {
  const [items, setItems] = useState<Contratista[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [filterEsp, setFilterEsp] = useState<string>("todas");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listContratistas();
        if (!cancelled) setItems(data);
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

  const especialidadesDisponibles = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.especialidad));
    ESPECIALIDADES_CONTRATISTA_SUGERIDAS.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [items]);

  const especialidadesReales = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.especialidad));
    return Array.from(set).sort();
  }, [items]);

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setAdding(false);
  }

  function startEdit(c: Contratista) {
    setEditingId(c.id);
    setForm({
      nombre: c.nombre,
      especialidad: c.especialidad,
      contactoNombre: c.contactoNombre ?? "",
      contactoTelefono: c.contactoTelefono ?? "",
      contactoEmail: c.contactoEmail ?? "",
      precioReferencialUsd: c.precioReferencialUsd?.toString() ?? "",
      comisionPorc: c.comisionPorc?.toString() ?? "",
      notas: c.notas ?? "",
    });
    setAdding(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setError(null);
    const input = {
      nombre: form.nombre.trim(),
      especialidad: form.especialidad.trim() || "Otros",
      contactoNombre: form.contactoNombre.trim() || undefined,
      contactoTelefono: form.contactoTelefono.trim() || undefined,
      contactoEmail: form.contactoEmail.trim() || undefined,
      precioReferencialUsd:
        form.precioReferencialUsd === ""
          ? undefined
          : Number(form.precioReferencialUsd),
      comisionPorc:
        form.comisionPorc === "" ? undefined : Number(form.comisionPorc),
      notas: form.notas.trim() || undefined,
      activo: true,
    };
    try {
      if (editingId) {
        const upd = await updateContratista(editingId, input);
        setItems((prev) => prev.map((x) => (x.id === editingId ? upd : x)));
      } else {
        const nuevo = await createContratista(input);
        setItems((prev) => [...prev, nuevo]);
      }
      resetForm();
    } catch (e) {
      setError(extractError(e, "Error guardando"));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteContratista(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(extractError(e, "Error eliminando"));
    }
  }

  const filtered = useMemo(
    () =>
      items.filter(
        (i) => filterEsp === "todas" || i.especialidad === filterEsp,
      ),
    [items, filterEsp],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Contratista[]>();
    filtered.forEach((i) => {
      if (!map.has(i.especialidad)) map.set(i.especialidad, []);
      map.get(i.especialidad)!.push(i);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}

      {especialidadesReales.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setFilterEsp("todas")}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              filterEsp === "todas"
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            Todas
          </button>
          {especialidadesReales.map((e) => (
            <button
              key={e}
              onClick={() => setFilterEsp(e)}
              className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
                filterEsp === e
                  ? "bg-cacao text-white ring-cacao"
                  : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full mb-5 rounded-xl bg-cacao text-white py-3 font-medium hover:bg-terracotta transition-colors"
        >
          + Nuevo contratista
        </button>
      )}

      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
            {editingId ? "Editar contratista" : "Nuevo contratista"}
          </h2>
          <input
            type="text"
            placeholder="Nombre del contratista o empresa"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            autoFocus
            required
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <label className="text-sm text-cacao block">
            Especialidad
            <input
              type="text"
              list="especialidades-contratista-list"
              placeholder="Ej: Fotografía, DJ, Florista..."
              value={form.especialidad}
              onChange={(e) =>
                setForm({ ...form, especialidad: e.target.value })
              }
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <datalist id="especialidades-contratista-list">
              {especialidadesDisponibles.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
            <span className="text-[10px] text-cacao-mute block mt-1">
              Escribe una nueva o elige de la lista
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Nombre de contacto"
              value={form.contactoNombre}
              onChange={(e) =>
                setForm({ ...form, contactoNombre: e.target.value })
              }
              className="rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <input
              type="text"
              placeholder="Teléfono"
              value={form.contactoTelefono}
              onChange={(e) =>
                setForm({ ...form, contactoTelefono: e.target.value })
              }
              className="rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <input
              type="email"
              placeholder="Correo"
              value={form.contactoEmail}
              onChange={(e) =>
                setForm({ ...form, contactoEmail: e.target.value })
              }
              className="rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Precio referencial USD
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Opcional"
                value={form.precioReferencialUsd}
                onChange={(e) =>
                  setForm({ ...form, precioReferencialUsd: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Comisión nuestra % (si los recomendamos)
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="Opcional"
                value={form.comisionPorc}
                onChange={(e) =>
                  setForm({ ...form, comisionPorc: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>
          <textarea
            placeholder="Notas (estilo, eventos previos, observaciones)"
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            rows={2}
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-cacao text-white py-2 font-medium hover:bg-terracotta"
            >
              {editingId ? "Guardar" : "Crear"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft"
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
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
          <p className="font-serif italic text-cacao-soft">
            Sin contratistas registrados todavía. Agrega el primero arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([esp, list]) => (
            <section
              key={esp}
              className="rounded-2xl bg-white ring-1 ring-marfil p-5"
            >
              <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
                {esp}{" "}
                <span className="text-cacao-mute font-normal text-[10px]">
                  ({list.length})
                </span>
              </h2>
              <ul className="divide-y divide-marfil">
                {list.map((c) => (
                  <li
                    key={c.id}
                    className="py-3 flex flex-wrap items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-cacao">{c.nombre}</div>
                      {(c.contactoNombre ||
                        c.contactoTelefono ||
                        c.contactoEmail) && (
                        <div className="text-xs text-cacao-soft mt-0.5">
                          {[
                            c.contactoNombre,
                            c.contactoTelefono,
                            c.contactoEmail,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      {c.notas && (
                        <div className="text-xs text-cacao-soft italic mt-1 font-serif">
                          {c.notas}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {c.precioReferencialUsd !== undefined && (
                        <div className="text-cacao font-medium">
                          ${c.precioReferencialUsd.toFixed(2)}
                          <span className="text-[10px] text-cacao-mute ml-1">
                            ref.
                          </span>
                        </div>
                      )}
                      {c.comisionPorc !== undefined && c.comisionPorc > 0 && (
                        <div className="text-xs text-cacao-soft">
                          Comisión {c.comisionPorc}%
                        </div>
                      )}
                      <div className="flex gap-3 text-[10px] uppercase tracking-widest mt-1">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-cacao-soft hover:text-cacao"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setPendingDelete(c.id)}
                          className="text-cacao-soft hover:text-terracotta"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar este contratista?"
        confirmLabel="Sí, eliminar"
        onConfirm={() => {
          if (pendingDelete) handleDelete(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
