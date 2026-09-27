"use client";

import { useState, type ReactNode } from "react";

// Sección plegable: cabecera tipo tarjeta; el contenido fluye debajo al abrir.
// Sirve para acortar el scroll de los análisis sin esconder información.
export function Plegable({
  titulo,
  sub,
  defaultOpen = false,
  children,
}: {
  titulo: string;
  sub?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-2xl bg-white ring-1 ring-marfil p-4 flex items-center justify-between gap-2 text-left hover:bg-marfil-soft/40"
      >
        <span className="font-cinzel text-base text-cacao">{titulo}</span>
        <span className="flex items-center gap-2">
          {sub && <span className="text-[11px] text-cacao-mute">{sub}</span>}
          <span className={`text-cacao-mute transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </span>
      </button>
      {open && children}
    </div>
  );
}
