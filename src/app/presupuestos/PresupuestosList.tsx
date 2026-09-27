"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ESTADOS_PRESUPUESTO, type Presupuesto } from "@/lib/types";
import {
  listPresupuestos,
  deletePresupuesto,
} from "@/lib/data/presupuestos";
import { extractError } from "@/lib/data/error";

export function PresupuestosList() {
  const [items, setItems] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Presupuesto en confirmación de borrado (modal in-page para no usar
   *  el confirm() nativo del browser, que se ve mal en mobile). */
  const [confirmDelete, setConfirmDelete] = useState<Presupuesto | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPresupuestos();
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

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePresupuesto(confirmDelete.id);
      setItems((prev) => prev.filter((x) => x.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e) {
      setError(extractError(e, "Error eliminando"));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando presupuestos...
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
        <p className="font-serif italic text-cacao-soft mb-4">
          Todavía no hay presupuestos. Crea el primero.
        </p>
        <Link
          href="/presupuestos/nuevo"
          className="inline-block rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta transition-colors"
        >
          + Nuevo presupuesto
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}
      <div className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden">
        <ul className="divide-y divide-marfil">
          {items.map((p) => {
            const estado = ESTADOS_PRESUPUESTO.find((e) => e.value === p.estado)!;
            const fecha = new Date(p.createdAt).toLocaleDateString("es-VE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            return (
              <li
                key={p.id}
                className="relative group hover:bg-marfil-soft transition-colors"
              >
                <Link
                  href={`/presupuestos/${p.id}`}
                  className="block p-5 pr-12"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-display text-[11px] tracking-[0.3em] text-cacao-soft">
                        {p.numero}
                      </div>
                      <div className="mt-1 font-medium text-cacao">
                        {p.eventoNombre}
                      </div>
                      <div className="text-sm text-cacao-soft mt-0.5">
                        {p.clienteNombre}
                        {p.eventoFecha
                          ? ` · ${new Date(p.eventoFecha + "T00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" })}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-cacao font-medium">
                        ${p.total.toFixed(2)}
                      </div>
                      <div className="mt-1 inline-block">
                        <span
                          className={`px-2 py-0.5 rounded-full ring-1 text-xs ${estado.color}`}
                        >
                          {estado.label}
                        </span>
                      </div>
                      <div className="text-xs text-cacao-mute mt-1">{fecha}</div>
                    </div>
                  </div>
                </Link>
                {/* Botón borrar — fuera del Link para no anidar interactivos.
                    Aparece sutil siempre y se resalta al hover. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmDelete(p);
                  }}
                  aria-label={`Borrar presupuesto ${p.numero}`}
                  title="Borrar presupuesto"
                  className="absolute top-4 right-4 text-cacao-mute hover:text-terracotta hover:bg-marfil-soft rounded-lg p-1.5 transition-colors"
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
              </li>
            );
          })}
        </ul>
      </div>

      {/* Modal de confirmación */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              ¿Borrar presupuesto?
            </h2>
            <p className="mt-3 text-sm text-cacao-soft font-serif">
              Vas a borrar{" "}
              <span className="text-cacao font-medium">
                {confirmDelete.numero}
              </span>{" "}
              — {confirmDelete.eventoNombre} ({confirmDelete.clienteNombre}).
              <br />
              <span className="text-terracotta">
                Esta acción no se puede deshacer.
              </span>
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-terracotta text-white px-4 py-2 font-medium hover:bg-cacao disabled:opacity-50"
              >
                {deleting ? "Borrando..." : "Sí, borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
