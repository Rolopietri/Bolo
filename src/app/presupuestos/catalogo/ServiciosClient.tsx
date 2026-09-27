"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CATEGORIAS_SERVICIO,
  UNIDADES,
  unidadLabel,
  type Servicio,
  type CategoriaServicio,
  type UnidadServicio,
} from "@/lib/types";
import {
  createServicio,
  updateServicio,
  deleteServicio,
} from "@/lib/data/servicios";
import {
  listCatalogoUnificado,
  type CatalogoEntry,
  type CatalogoUnificado,
} from "@/lib/data/catalogo-unificado";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const emptyForm: {
  categoria: CategoriaServicio;
  nombre: string;
  descripcion: string;
  unidad: UnidadServicio;
  precio: string;
  manual: boolean;
  incluido: boolean;
} = {
  categoria: "espacio",
  nombre: "",
  descripcion: "",
  unidad: "evento",
  precio: "",
  manual: false,
  incluido: false,
};

export function ServiciosClient() {
  // Servicios propios — editables aquí
  const [servicios, setServicios] = useState<Servicio[]>([]);
  // Inventario + contratistas — solo lectura desde el catálogo
  const [catalogo, setCatalogo] = useState<CatalogoUnificado>({
    servicios: [],
    inventario: [],
    contratistas: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const data = await listCatalogoUnificado();
      setCatalogo(data);
      // Reconstruimos `servicios` a partir de `data.servicios` para
      // mantener sincronía con el catálogo unificado.
      setServicios(
        data.servicios
          .map((e) => e.servicio!)
          .sort((a, b) => a.orden - b.orden),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando catálogo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Carga inicial del catálogo al montar (fetch, no un setState síncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setAdding(false);
  }

  function startEdit(s: Servicio) {
    setEditingId(s.id);
    setForm({
      categoria: s.categoria,
      nombre: s.nombre,
      descripcion: s.descripcion ?? "",
      unidad: s.unidad,
      precio: s.precioUnitario === null ? "" : String(s.precioUnitario),
      manual: s.manual,
      incluido: s.incluido,
    });
    setAdding(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setError(null);
    const precioNum = form.manual
      ? null
      : form.precio === ""
      ? 0
      : Number(form.precio);
    const input = {
      categoria: form.categoria,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      unidad: form.unidad,
      precioUnitario: precioNum,
      manual: form.manual,
      incluido: form.incluido,
      activo: true,
      orden: editingId
        ? servicios.find((s) => s.id === editingId)?.orden ?? 0
        : (servicios.at(-1)?.orden ?? 0) + 10,
    };
    try {
      if (editingId) {
        await updateServicio(editingId, input);
      } else {
        await createServicio(input);
      }
      resetForm();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteServicio(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  // ── Agrupación de servicios propios por categoría fija
  const serviciosGrouped = useMemo(() => {
    const map = new Map<CategoriaServicio, Servicio[]>();
    servicios.forEach((s) => {
      if (!map.has(s.categoria)) map.set(s.categoria, []);
      map.get(s.categoria)!.push(s);
    });
    return Array.from(map.entries());
  }, [servicios]);

  // ── Inventario agrupado por categoría libre
  const inventarioGrouped = useMemo(() => {
    const map = new Map<string, CatalogoEntry[]>();
    catalogo.inventario.forEach((e) => {
      if (!map.has(e.categoria)) map.set(e.categoria, []);
      map.get(e.categoria)!.push(e);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalogo.inventario]);

  // ── Contratistas agrupados por especialidad libre
  const contratistasGrouped = useMemo(() => {
    const map = new Map<string, CatalogoEntry[]>();
    catalogo.contratistas.forEach((e) => {
      if (!map.has(e.categoria)) map.set(e.categoria, []);
      map.get(e.categoria)!.push(e);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalogo.contratistas]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando catálogo...
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {error && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SECCIÓN 1 — SERVICIOS PROPIOS (editables)
          ═══════════════════════════════════════════════════════════ */}
      <section>
        <header className="flex items-end justify-between mb-4 gap-3 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Origen · Nuestros
            </p>
            <h2 className="font-cinzel text-xl tracking-[0.1em] uppercase text-cacao mt-1">
              Servicios propios
            </h2>
            <p className="font-serif italic text-sm text-cacao-soft mt-1">
              Espacios, catering propio, personal, pádel y técnico.
            </p>
          </div>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="rounded-xl bg-cacao text-white px-4 py-2 text-sm font-medium hover:bg-terracotta transition-colors"
            >
              + Agregar servicio
            </button>
          )}
        </header>

        {adding && (
          <form
            onSubmit={handleSubmit}
            className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
          >
            <h3 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
              {editingId ? "Editar servicio" : "Nuevo servicio"}
            </h3>
            <input
              type="text"
              placeholder="Nombre del servicio"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              autoFocus
              required
              className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <textarea
              placeholder="Descripción (opcional)"
              value={form.descripcion}
              onChange={(e) =>
                setForm({ ...form, descripcion: e.target.value })
              }
              rows={2}
              className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm text-cacao">
                Categoría
                <select
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      categoria: e.target.value as CategoriaServicio,
                    })
                  }
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
                >
                  {CATEGORIAS_SERVICIO.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-cacao">
                Unidad
                <select
                  value={form.unidad}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      unidad: e.target.value as UnidadServicio,
                    })
                  }
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
                >
                  {UNIDADES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-cacao">
                Precio (USD)
                <input
                  type="number"
                  step="0.01"
                  placeholder={form.manual ? "Manual" : "0.00"}
                  value={form.precio}
                  disabled={form.manual}
                  onChange={(e) =>
                    setForm({ ...form, precio: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 disabled:bg-marfil-soft disabled:text-cacao-mute"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-cacao">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.manual}
                  onChange={(e) =>
                    setForm({ ...form, manual: e.target.checked })
                  }
                />
                Precio manual (se llena al crear cada presupuesto)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.incluido}
                  onChange={(e) =>
                    setForm({ ...form, incluido: e.target.checked })
                  }
                />
                Incluido sin costo
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-cacao text-white py-2 font-medium hover:bg-terracotta"
              >
                {editingId ? "Guardar cambios" : "Crear"}
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

        {serviciosGrouped.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center font-serif italic text-cacao-soft">
            Todavía no hay servicios propios. Agrega el primero arriba.
          </div>
        ) : (
          <div className="space-y-4">
            {serviciosGrouped.map(([cat, items]) => (
              <div
                key={cat}
                className="rounded-2xl bg-white ring-1 ring-marfil p-5"
              >
                <h3 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
                  {CATEGORIAS_SERVICIO.find((c) => c.value === cat)?.label}
                </h3>
                <ul className="divide-y divide-marfil">
                  {items.map((s) => (
                    <li
                      key={s.id}
                      className="py-3 flex items-start gap-3 justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-cacao font-medium">{s.nombre}</div>
                        {s.descripcion && (
                          <div className="text-xs text-cacao-soft mt-0.5">
                            {s.descripcion}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 min-w-[140px]">
                        <div className="text-cacao font-medium">
                          {s.incluido
                            ? "Incluido"
                            : s.manual
                            ? "Manual"
                            : `$${Number(s.precioUnitario).toFixed(2)}`}
                        </div>
                        <div className="text-xs text-cacao-soft">
                          por {unidadLabel(s.unidad)}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setPendingDelete(s.id)}
                          className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta"
                        >
                          Borrar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SECCIÓN 2 — INVENTARIO DE ALQUILER (lectura, edición en su pantalla)
          ═══════════════════════════════════════════════════════════ */}
      <section>
        <header className="flex items-end justify-between mb-4 gap-3 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Origen · Alquiler
            </p>
            <h2 className="font-cinzel text-xl tracking-[0.1em] uppercase text-cacao mt-1">
              Inventario de alquiler
            </h2>
            <p className="font-serif italic text-sm text-cacao-soft mt-1">
              Mobiliario y objetos que ofrecemos al cliente para sus eventos.
            </p>
          </div>
          <Link
            href="/presupuestos/inventario"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            Gestionar inventario →
          </Link>
        </header>

        {inventarioGrouped.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center font-serif italic text-cacao-soft">
            Sin items en el inventario.{" "}
            <Link
              href="/presupuestos/inventario"
              className="underline hover:text-cacao"
            >
              Agrega el primero
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-4">
            {inventarioGrouped.map(([cat, items]) => (
              <div
                key={cat}
                className="rounded-2xl bg-white ring-1 ring-marfil p-5"
              >
                <h3 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
                  {cat}
                </h3>
                <ul className="divide-y divide-marfil">
                  {items.map((e) => (
                    <li
                      key={e.key}
                      className="py-3 flex items-start gap-3 justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-cacao font-medium">{e.nombre}</div>
                        {e.descripcion && (
                          <div className="text-xs text-cacao-soft mt-0.5">
                            {e.descripcion}
                          </div>
                        )}
                        {e.inventario && (
                          <div className="text-xs text-cacao-mute mt-1">
                            Disponible: {e.inventario.cantidadDisponible}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 min-w-[140px]">
                        <div className="text-cacao font-medium">
                          {e.precioLabel}
                        </div>
                        <div className="text-xs text-cacao-soft">
                          por unidad
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SECCIÓN 3 — CONTRATISTAS (lectura, edición en su pantalla)
          ═══════════════════════════════════════════════════════════ */}
      <section>
        <header className="flex items-end justify-between mb-4 gap-3 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Origen · Terceros
            </p>
            <h2 className="font-cinzel text-xl tracking-[0.1em] uppercase text-cacao mt-1">
              Contratistas
            </h2>
            <p className="font-serif italic text-sm text-cacao-soft mt-1">
              Red de servicios externos que coordinamos para el cliente.
            </p>
          </div>
          <Link
            href="/presupuestos/contratistas"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            Gestionar contratistas →
          </Link>
        </header>

        {contratistasGrouped.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center font-serif italic text-cacao-soft">
            Sin contratistas registrados.{" "}
            <Link
              href="/presupuestos/contratistas"
              className="underline hover:text-cacao"
            >
              Agrega el primero
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-4">
            {contratistasGrouped.map(([esp, items]) => (
              <div
                key={esp}
                className="rounded-2xl bg-white ring-1 ring-marfil p-5"
              >
                <h3 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
                  {esp}
                </h3>
                <ul className="divide-y divide-marfil">
                  {items.map((e) => (
                    <li
                      key={e.key}
                      className="py-3 flex items-start gap-3 justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-cacao font-medium">{e.nombre}</div>
                        {e.descripcion && (
                          <div className="text-xs text-cacao-soft mt-0.5">
                            {e.descripcion}
                          </div>
                        )}
                        {e.contratista?.comisionPorc !== undefined &&
                          e.contratista.comisionPorc > 0 && (
                            <div className="text-xs text-cacao-mute mt-1">
                              Comisión nuestra: {e.contratista.comisionPorc}%
                            </div>
                          )}
                      </div>
                      <div className="text-right shrink-0 min-w-[140px]">
                        <div className="text-cacao font-medium">
                          {e.precioLabel}
                        </div>
                        <div className="text-xs text-cacao-soft">
                          referencial · por evento
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar este servicio del catálogo?"
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
