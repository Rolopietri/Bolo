"use client";

import { useEffect, useState } from "react";
import type { Proveedor } from "@/lib/types";
import {
  listProveedores,
  createProveedor,
  updateProveedor,
  deleteProveedor,
} from "@/lib/data/cocina";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBanner } from "@/components/ErrorBanner";

type FormState = {
  nombre: string;
  contactoNombre: string;
  contactoTelefono: string;
  contactoEmail: string;
  aceptaBsBcvDolar: boolean;
  aceptaBsBcvEuro: boolean;
  aceptaBsParalela: boolean;
  aceptaUsdEfectivo: boolean;
  aceptaUsdDivisa: boolean;
  notas: string;
};

const emptyForm: FormState = {
  nombre: "",
  contactoNombre: "",
  contactoTelefono: "",
  contactoEmail: "",
  aceptaBsBcvDolar: false,
  aceptaBsBcvEuro: false,
  aceptaBsParalela: false,
  aceptaUsdEfectivo: true,
  aceptaUsdDivisa: false,
  notas: "",
};

function modalidadesLabel(p: Proveedor): string {
  const out: string[] = [];
  if (p.aceptaUsdEfectivo) out.push("USD efectivo");
  if (p.aceptaUsdDivisa) out.push("USD divisa");
  if (p.aceptaBsBcvDolar) out.push("Bs · BCV $");
  if (p.aceptaBsBcvEuro) out.push("Bs · BCV €");
  if (p.aceptaBsParalela) out.push("Bs · paralela");
  return out.length > 0 ? out.join(" · ") : "Sin definir";
}

export function ProveedoresClient() {
  const [items, setItems] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [pendienteBorrar, setPendienteBorrar] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listProveedores();
        if (!cancelled) setItems(data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error cargando");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setAdding(false);
  }

  function startEdit(p: Proveedor) {
    setEditingId(p.id);
    setForm({
      nombre: p.nombre,
      contactoNombre: p.contactoNombre ?? "",
      contactoTelefono: p.contactoTelefono ?? "",
      contactoEmail: p.contactoEmail ?? "",
      aceptaBsBcvDolar: p.aceptaBsBcvDolar,
      aceptaBsBcvEuro: p.aceptaBsBcvEuro,
      aceptaBsParalela: p.aceptaBsParalela,
      aceptaUsdEfectivo: p.aceptaUsdEfectivo,
      aceptaUsdDivisa: p.aceptaUsdDivisa,
      notas: p.notas ?? "",
    });
    setAdding(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setError(null);
    const input = {
      nombre: form.nombre.trim(),
      contactoNombre: form.contactoNombre.trim() || undefined,
      contactoTelefono: form.contactoTelefono.trim() || undefined,
      contactoEmail: form.contactoEmail.trim() || undefined,
      aceptaBsBcvDolar: form.aceptaBsBcvDolar,
      aceptaBsBcvEuro: form.aceptaBsBcvEuro,
      aceptaBsParalela: form.aceptaBsParalela,
      aceptaUsdEfectivo: form.aceptaUsdEfectivo,
      aceptaUsdDivisa: form.aceptaUsdDivisa,
      notas: form.notas.trim() || undefined,
      activo: true,
    };
    try {
      if (editingId) {
        const upd = await updateProveedor(editingId, input);
        setItems((prev) => prev.map((x) => (x.id === editingId ? upd : x)));
      } else {
        const nuevo = await createProveedor(input);
        setItems((prev) => [...prev, nuevo]);
      }
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProveedor(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  return (
    <div>
      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full mb-5 rounded-xl bg-cacao text-white py-3 font-medium hover:bg-terracotta transition-colors"
        >
          + Nuevo proveedor
        </button>
      )}

      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
            {editingId ? "Editar proveedor" : "Nuevo proveedor"}
          </h2>
          <input
            type="text"
            placeholder="Nombre del proveedor"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            autoFocus
            required
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
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
          <fieldset>
            <legend className="text-xs uppercase tracking-widest text-cacao-mute mb-2">
              Modalidades de pago aceptadas
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-cacao">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aceptaUsdEfectivo}
                  onChange={(e) =>
                    setForm({ ...form, aceptaUsdEfectivo: e.target.checked })
                  }
                />
                USD efectivo
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aceptaUsdDivisa}
                  onChange={(e) =>
                    setForm({ ...form, aceptaUsdDivisa: e.target.checked })
                  }
                />
                USD divisa (Zelle / transferencia)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aceptaBsBcvDolar}
                  onChange={(e) =>
                    setForm({ ...form, aceptaBsBcvDolar: e.target.checked })
                  }
                />
                Bs · tasa BCV $
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aceptaBsBcvEuro}
                  onChange={(e) =>
                    setForm({ ...form, aceptaBsBcvEuro: e.target.checked })
                  }
                />
                Bs · tasa BCV €
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.aceptaBsParalela}
                  onChange={(e) =>
                    setForm({ ...form, aceptaBsParalela: e.target.checked })
                  }
                />
                Bs · paralela
              </label>
            </div>
          </fieldset>
          <textarea
            placeholder="Notas (opcional)"
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
              {editingId ? "Guardar cambios" : "Crear proveedor"}
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
          Cargando proveedores...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
          <p className="font-serif italic text-cacao-soft mb-4">
            Todavía no hay proveedores. Agrega el primero.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden">
          <ul className="divide-y divide-marfil">
            {items.map((p) => (
              <li
                key={p.id}
                className="p-5 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-cacao">{p.nombre}</div>
                  {(p.contactoNombre ||
                    p.contactoTelefono ||
                    p.contactoEmail) && (
                    <div className="text-xs text-cacao-soft mt-0.5">
                      {[p.contactoNombre, p.contactoTelefono, p.contactoEmail]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  <div className="text-xs text-cacao-mute mt-1">
                    {modalidadesLabel(p)}
                  </div>
                  {p.notas && (
                    <div className="text-xs text-cacao-soft italic mt-2 font-serif">
                      {p.notas}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 text-xs uppercase tracking-widest shrink-0">
                  <button
                    onClick={() => startEdit(p)}
                    className="text-cacao-soft hover:text-cacao"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setPendienteBorrar(p.id)}
                    className="text-cacao-soft hover:text-terracotta"
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={pendienteBorrar !== null}
        title="¿Eliminar proveedor?"
        message={
          <>
            ¿Eliminar este proveedor? (Si tiene insumos asociados, quedarán sin
            proveedor)
          </>
        }
        onConfirm={() => {
          if (pendienteBorrar) handleDelete(pendienteBorrar);
          setPendienteBorrar(null);
        }}
        onCancel={() => setPendienteBorrar(null)}
      />
    </div>
  );
}
