"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DESTINOS, EVENTO_GUIAR, EVENTO_IR_PASO, type ClaveDestino, type Destino } from "./_destinos";

// Cursor-guía: un puntero animado que viaja solo hasta la función que el
// cliente busca. Lo dispara el asistente (evento EVENTO_GUIAR con la clave de
// destino). Si hace falta, navega a la página, coloca la guía de inicio en el
// paso correcto, lleva el puntero hasta el elemento y lo resalta con un pulso.

type Rect = { top: number; left: number; width: number; height: number };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function esperarElemento(selector: string, timeout = 3500): Promise<HTMLElement | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
    await espera(120);
  }
  return null;
}

export function GuiaCursor() {
  const router = useRouter();
  const pathname = usePathname();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [anillo, setAnillo] = useState<Rect | null>(null);
  const [clic, setClic] = useState(false);
  const corridaRef = useRef(0);

  const guiar = useCallback(
    async (clave: ClaveDestino) => {
      const destino: Destino = DESTINOS[clave];
      if (!destino) return;
      const corrida = ++corridaRef.current; // invalida guías anteriores
      const vigente = () => corridaRef.current === corrida;

      // 1. Navegar si el destino está en otra página.
      if (pathname !== destino.ruta) {
        router.push(destino.ruta);
      }

      // 2. Esperar a que exista el elemento (confirma que la página montó).
      let el = await esperarElemento(destino.selector);
      if (!vigente() || !el) return;

      // 3. Colocar la guía de inicio en el paso correcto y dejar re-renderizar.
      if (typeof destino.paso === "number") {
        window.dispatchEvent(new CustomEvent(EVENTO_IR_PASO, { detail: destino.paso }));
        await espera(220);
        if (!vigente()) return;
        el = document.querySelector<HTMLElement>(destino.selector) ?? el;
      }

      // 4. Traer el elemento a la vista.
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await espera(500);
      if (!vigente()) return;

      // 5. Mover el puntero desde la burbuja (abajo-derecha) hasta el elemento.
      const r = el.getBoundingClientRect();
      const destinoX = r.left + r.width / 2;
      const destinoY = r.top + r.height / 2;
      setAnillo({ top: r.top, left: r.left, width: r.width, height: r.height });
      setClic(false);
      setPos({ x: window.innerWidth - 56, y: window.innerHeight - 72 });
      await espera(60);
      if (!vigente()) return;
      setPos({ x: destinoX, y: destinoY });

      // 6. "Clic" al llegar y desvanecer.
      await espera(950);
      if (!vigente()) return;
      setClic(true);
      await espera(2600);
      if (!vigente()) return;
      setPos(null);
      setAnillo(null);
      setClic(false);
    },
    [pathname, router],
  );

  useEffect(() => {
    const manejar = (e: Event) => {
      const clave = (e as CustomEvent).detail as ClaveDestino;
      if (clave) void guiar(clave);
    };
    window.addEventListener(EVENTO_GUIAR, manejar);
    return () => window.removeEventListener(EVENTO_GUIAR, manejar);
  }, [guiar]);

  if (!pos) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      {/* Anillo que resalta el elemento objetivo */}
      {anillo && (
        <span
          className="absolute rounded-xl ring-2 ring-terracotta transition-all duration-700 ease-out"
          style={{
            top: anillo.top - 6,
            left: anillo.left - 6,
            width: anillo.width + 12,
            height: anillo.height + 12,
            boxShadow: "0 0 0 9999px rgba(43,31,26,0.06)",
          }}
        >
          <span className="absolute inset-0 animate-ping rounded-xl ring-2 ring-terracotta/60" />
        </span>
      )}

      {/* Puntero-muñeco */}
      <span
        className="absolute transition-transform duration-[850ms] ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      >
        {/* Onda de "clic" */}
        {clic && (
          <span className="absolute -left-1 -top-1 size-10 animate-ping rounded-full bg-terracotta/30" />
        )}
        {/* Flecha tipo cursor (blanca con borde oscuro para verse sobre todo) */}
        <svg
          viewBox="0 0 24 24"
          className="size-9 drop-shadow-md"
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" }}
        >
          <path
            d="M5 3l15 9-6.5 1.2L17 20l-3 1.3-3.3-6.6L5 18.5V3z"
            fill="#fff"
            stroke="#2b1f1a"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
