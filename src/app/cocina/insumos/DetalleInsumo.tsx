"use client";

// Detalle de un insumo: todo lo que se mira de un insumo a la vez, en un solo
// lugar. Uso diario (lo que salió por ventas cada día), sus pérdidas y los
// cambios de su stock. Las vistas de todos los insumos siguen en la línea de
// accesos de arriba del catálogo.

import { useEffect, useState } from "react";
import type { Insumo } from "@/lib/types";
import { displayCantidad } from "@/lib/units";
import { UsoDiarioClient } from "./UsoDiarioClient";
import { MermasClient } from "./MermasClient";
import { AuditoriaClient } from "./AuditoriaClient";

type Seccion = "uso" | "perdidas" | "cambios";

const SECCIONES: { id: Seccion; label: string }[] = [
  { id: "uso", label: "Uso diario" },
  { id: "perdidas", label: "Pérdidas" },
  { id: "cambios", label: "Cambios de stock" },
];

export function DetalleInsumo({
  insumo,
  onClose,
  onPerdida,
  onEditar,
}: {
  insumo: Insumo;
  onClose: () => void;
  onPerdida: () => void;
  onEditar: () => void;
}) {
  const [seccion, setSeccion] = useState<Seccion>("uso");

  // Escape cierra; el fondo no se desplaza mientras está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${insumo.nombre}`}
      className="fixed inset-0 z-50 flex justify-center bg-cacao/40 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-xl sm:rounded-2xl"
      >
        <header className="border-b border-marfil px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-cinzel text-xl text-cacao truncate">{insumo.nombre}</h2>
              <p className="text-xs text-cacao-soft">
                {insumo.unidadCompra} · stock {displayCantidad(insumo.stockTotal, insumo.unidadBase)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid size-10 shrink-0 place-items-center rounded-full text-cacao-soft hover:bg-marfil-soft hover:text-cacao"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {SECCIONES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSeccion(s.id)}
                aria-current={seccion === s.id ? "page" : undefined}
                className={`min-h-10 rounded-full px-4 text-[11px] uppercase tracking-widest ring-1 ${
                  seccion === s.id
                    ? "bg-cacao text-white ring-cacao"
                    : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
                }`}
              >
                {s.label}
              </button>
            ))}
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onPerdida}
                className="min-h-10 rounded-full px-3 text-[11px] uppercase tracking-widest text-cacao-soft hover:text-terracotta"
              >
                Pérdida
              </button>
              <button
                type="button"
                onClick={onEditar}
                className="min-h-10 rounded-full px-3 text-[11px] uppercase tracking-widest text-cacao-soft hover:text-cacao"
              >
                Editar
              </button>
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {seccion === "uso" && <UsoDiarioClient insumoInicial={insumo.id} fijo />}
          {seccion === "perdidas" && <MermasClient insumoId={insumo.id} />}
          {seccion === "cambios" && <AuditoriaClient insumoInicial={insumo.id} fijo />}
        </div>
      </div>
    </div>
  );
}
