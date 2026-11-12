"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Etiqueta con ayuda "fantasma": el texto lleva un subrayado de puntos y, al
 * tocarlo o pasar el cursor, abre una viñeta con la explicación. Sirve para
 * explicar un cálculo sin sumar íconos ni texto fijo a la pantalla.
 */
export function AyudaEtiqueta({
  children,
  ayuda,
  className = "",
}: {
  children: ReactNode;
  /** Contenido de la viñeta. */
  ayuda: ReactNode;
  className?: string;
}) {
  // Abierta por el cursor (escritorio) o fijada con un toque. Separadas para
  // que el clic no cierre lo que el cursor acaba de abrir.
  const [porCursor, setPorCursor] = useState(false);
  const [fijada, setFijada] = useState(false);
  const abierta = porCursor || fijada;
  const ref = useRef<HTMLSpanElement | null>(null);

  // Se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setFijada(false);
        setPorCursor(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFijada(false);
      setPorCursor(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierta]);

  return (
    <span
      ref={ref}
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setPorCursor(true)}
      onMouseLeave={() => setPorCursor(false)}
    >
      <button
        type="button"
        onClick={() => setFijada((v) => !v)}
        aria-expanded={abierta}
        className="cursor-help [font:inherit] [letter-spacing:inherit] [text-transform:inherit] underline decoration-dotted decoration-cacao-mute underline-offset-4 hover:decoration-terracotta"
      >
        {children}
      </button>
      {abierta && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-2 block w-64 rounded-xl bg-cacao px-3 py-2.5 text-left text-xs normal-case leading-relaxed tracking-normal text-white shadow-lg"
        >
          {ayuda}
        </span>
      )}
    </span>
  );
}
