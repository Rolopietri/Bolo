"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ESTADOS_INVENTARIO,
  CATEGORIAS_INVENTARIO_SUGERIDAS,
  type InventarioItem,
  type EstadoInventario,
} from "@/lib/types";
import {
  listInventario,
  createInventarioItem,
  updateInventarioItem,
  deleteInventarioItem,
} from "@/lib/data/inventario";
import { extractError } from "@/lib/data/error";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type FormState = {
  nombre: string;
  categoria: string;
  descripcion: string;
  cantidadDisponible: string;
  precioAlquilerUsd: string;
  estado: EstadoInventario;
  notas: string;
};

const emptyForm: FormState = {
  nombre: "",
  categoria: "",
  descripcion: "",
  cantidadDisponible: "0",
  precioAlquilerUsd: "",
  estado: "disponible",
  notas: "",
};

export function InventarioClient() {
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [filterCat, setFilterCat] = useState<string>("todas");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listInventario();
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

  // Categorías únicas: las que ya están en la BD + sugerencias
  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.categoria));
    CATEGORIAS_INVENTARIO_SUGERIDAS.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [items]);

  const categoriasReales = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.categoria));
    return Array.from(set).sort();
  }, [items]);

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setAdding(false);
  }

  function startEdit(item: InventarioItem) {
    setEditingId(item.id);
    setForm({
      nombre: item.nombre,
      categoria: item.categoria,
      descripcion: item.descripcion ?? "",
      cantidadDisponible: String(item.cantidadDisponible),
      precioAlquilerUsd: item.precioAlquilerUsd?.toString() ?? "",
      estado: item.estado,
      notas: item.notas ?? "",
    });
    setAdding(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setError(null);
    const input = {
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || "Otros",
      descripcion: form.descripcion.trim() || undefined,
      cantidadDisponible: Number(form.cantidadDisponible) || 0,
      precioAlquilerUsd:
        form.precioAlquilerUsd === ""
          ? undefined
          : Number(form.precioAlquilerUsd),
      estado: form.estado,
      notas: form.notas.trim() || undefined,
      activo: true,
    };
    try {
      if (editingId) {
        const upd = await updateInventarioItem(editingId, input);
        setItems((prev) => prev.map((x) => (x.id === editingId ? upd : x)));
      } else {
        const nuevo = await createInventarioItem(input);
        setItems((prev) => [...prev, nuevo]);
      }
      resetForm();
    } catch (e) {
      setError(extractError(e, "Error guardando"));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteInventarioItem(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(extractError(e, "Error eliminando"));
    }
  }

  const filtered = useMemo(
    () => items.filter((i) => filterCat === "todas" || i.categoria === filterCat),
    [items, filterCat],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, InventarioItem[]>();
    filtered.forEach((i) => {
      if (!map.has(i.categoria)) map.set(i.categoria, []);
      map.get(i.categoria)!.push(i);
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

      {/* Filtros */}
      {categoriasReales.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setFilterCat("todas")}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              filterCat === "todas"
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            Todas
          </button>
          {categoriasReales.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
                filterCat === c
                  ? "bg-cacao text-white ring-cacao"
                  : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full mb-5 rounded-xl bg-cacao text-white py-3 font-medium hover:bg-terracotta transition-colors"
        >
          + Nuevo item
        </button>
      )}

      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
            {editingId ? "Editar item" : "Nuevo item"}
          </h2>
          <input
            type="text"
            placeholder="Nombre (ej: Mesa redonda 8 personas)"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            autoFocus
            required
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Categoría
              <input
                type="text"
                list="categorias-inventario-list"
                placeholder="Ej: Mesas, Sillas..."
                value={form.categoria}
                onChange={(e) =>
                  setForm({ ...form, categoria: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              <datalist id="categorias-inventario-list">
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <span className="text-[10px] text-cacao-mute block mt-1">
                Escribe una nueva o elige de la lista
              </span>
            </label>
            <label className="text-sm text-cacao">
              Estado
              <select
                value={form.estado}
                onChange={(e) =>
                  setForm({ ...form, estado: e.target.value as EstadoInventario })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                {ESTADOS_INVENTARIO.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Cantidad disponible
              <input
                type="number"
                min="0"
                value={form.cantidadDisponible}
                onChange={(e) =>
                  setForm({ ...form, cantidadDisponible: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Precio alquiler USD (por unidad)
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Opcional"
                value={form.precioAlquilerUsd}
                onChange={(e) =>
                  setForm({ ...form, precioAlquilerUsd: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>
          <textarea
            placeholder="Descripción (opcional)"
            value={form.descripcion}
            onChange={(e) =>
              setForm({ ...form, descripcion: e.target.value })
            }
            rows={2}
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <textarea
            placeholder="Notas (estado, observaciones, etc.)"
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
            Sin items en el inventario todavía. Agrega el primero arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, list]) => (
            <section
              key={cat}
              className="rounded-2xl bg-white ring-1 ring-marfil p-5"
            >
              <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
                {cat}{" "}
                <span className="text-cacao-mute font-normal text-[10px]">
                  ({list.length})
                </span>
              </h2>
              <ul className="divide-y divide-marfil">
                {list.map((i) => {
                  const estado = ESTADOS_INVENTARIO.find(
                    (e) => e.value === i.estado,
                  )!;
                  return (
                    <li
                      key={i.id}
                      className="py-3 grid grid-cols-12 gap-2 items-start"
                    >
                      <div className="col-span-12 sm:col-span-6">
                        <div className="font-medium text-cacao">{i.nombre}</div>
                        {i.descripcion && (
                          <div className="text-xs text-cacao-soft mt-0.5">
                            {i.descripcion}
                          </div>
                        )}
                        {i.notas && (
                          <div className="text-xs text-cacao-mute italic mt-1 font-serif">
                            {i.notas}
                          </div>
                        )}
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <div className="text-xs uppercase tracking-widest text-cacao-mute">
                          Cant.
                        </div>
                        <div className="text-cacao font-medium">
                          {i.cantidadDisponible}
                        </div>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <div className="text-xs uppercase tracking-widest text-cacao-mute">
                          Precio
                        </div>
                        <div className="text-cacao text-sm">
                          {i.precioAlquilerUsd !== undefined
                            ? `$${i.precioAlquilerUsd.toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                      <div className="col-span-4 sm:col-span-2 flex flex-col items-end gap-1">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${estado.color}`}
                        >
                          {estado.label}
                        </span>
                        <div className="flex gap-2 text-[10px] uppercase tracking-widest">
                          <button
                            onClick={() => startEdit(i)}
                            className="text-cacao-soft hover:text-cacao"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setPendingDelete(i.id)}
                            className="text-cacao-soft hover:text-terracotta"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar este item del inventario?"
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
