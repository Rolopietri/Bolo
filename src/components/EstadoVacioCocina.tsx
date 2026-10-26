"use client";

import Link from "next/link";
import { useState } from "react";
import { PlusIcon } from "@/components/icons";
import { cargarDemoCocina } from "@/lib/demo/cargarDemoCocina";
import { extractError } from "@/lib/data/error";

type Props = {
  titulo: string;
  beneficio: string;
  cta: string;
  /** Ruta real de alta (receta nueva, compras con el formulario abierto…). */
  href?: string;
  /** Alta en la misma pantalla (abre el formulario que ya existe). */
  onCta?: () => void;
  /**
   * Acción secundaria. El padre solo monta este bloque cuando la lista está
   * vacía, así que el botón no aparece si ya hay datos.
   */
  demo?: boolean;
  onDemo?: () => void;
};

export function EstadoVacioCocina({
  titulo,
  beneficio,
  cta,
  href,
  onCta,
  demo = true,
  onDemo,
}: Props) {
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const resumen = await cargarDemoCocina();
      if (resumen.total === 0) {
        setAviso(
          resumen.omitidos.length > 0
            ? "Esos nombres ya existen y no son del ejemplo, así que no los toqué."
            : "Los datos de ejemplo ya estaban cargados.",
        );
      }
      onDemo?.();
    } catch (e) {
      setError(extractError(e, "No se pudieron cargar los datos de ejemplo"));
      onDemo?.();
    } finally {
      setCargando(false);
    }
  }

  const primario =
    "inline-flex items-center gap-2 rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta transition-colors";
  const secundario =
    "inline-flex items-center gap-2 rounded-xl ring-1 ring-marfil bg-white px-5 py-2.5 text-sm text-cacao hover:bg-marfil-soft transition-colors disabled:opacity-60";

  return (
    <div className="rounded-2xl bg-white ring-1 ring-marfil px-6 py-12 text-center">
      <h2 className="font-cinzel text-xl sm:text-2xl tracking-[0.08em] uppercase text-cacao">
        {titulo}
      </h2>
      <p className="mx-auto mt-3 max-w-md font-serif italic text-cacao-soft">
        {beneficio}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {href ? (
          <Link href={href} className={primario}>
            <PlusIcon className="size-4" />
            {cta}
          </Link>
        ) : (
          <button type="button" onClick={onCta} className={primario}>
            <PlusIcon className="size-4" />
            {cta}
          </button>
        )}
        {demo && (
          <button
            type="button"
            onClick={cargar}
            disabled={cargando}
            className={secundario}
          >
            {cargando ? "Cargando demo…" : "Cargar datos demo"}
          </button>
        )}
      </div>
      {demo && (
        <p className="mx-auto mt-3 max-w-sm text-[11px] text-cacao-mute">
          Carga un ejemplo de cocina chica (proveedores, insumos, recetas y
          compras). No borra lo que ya tengas.
        </p>
      )}
      {aviso && <p className="mt-3 text-sm text-cacao-soft">{aviso}</p>}
      {error && <p className="mt-3 text-sm text-terracotta">{error}</p>}
    </div>
  );
}
