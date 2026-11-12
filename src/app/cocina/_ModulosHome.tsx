"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, PointerEvent as ReactPointerEvent, SVGProps } from "react";
import {
  BookIcon,
  BoxIcon,
  CalculatorIcon,
  CalendarIcon,
  CartIcon,
  ChevronIcon,
  PlusIcon,
  ReceiptIcon,
  TruckIcon,
  UtensilsIcon,
} from "@/components/icons";
import type { ConteosHoy } from "./_hoyDatos";
import { moverId } from "@/lib/orden-pastillas.mjs";

type Grupo = {
  id: string;
  titulo: string;
  accesos: { id: string; href: string; label: string; dataGuia?: string }[];
};

const PRESS_MS = 500;
const SLOP_PX = 12;

type Icono = ComponentType<SVGProps<SVGSVGElement>>;
const ICONOS: Record<string, Icono> = {
  insumos: BoxIcon,
  stock: BoxIcon,
  uso: CalendarIcon,
  proveedores: TruckIcon,
  menaje: UtensilsIcon,
  recetas: BookIcon,
  costeo: CalculatorIcon,
  plato: PlusIcon,
  compras: CartIcon,
  ventas: ReceiptIcon,
  pedido: CartIcon,
  planes: CalendarIcon,
};

type Arrastre = {
  pointerId: number;
  id: string;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
};

function posicionar(el: HTMLElement, d: Arrastre) {
  el.style.pointerEvents = "none";
  el.style.zIndex = "5";
  el.style.position = "relative";
  el.style.animation = "none";
  el.style.transform = "none";
  const rect = el.getBoundingClientRect();
  const dx = d.x - rect.left - d.grabX;
  const dy = d.y - rect.top - d.grabY;
  el.style.transformOrigin = `${d.grabX}px ${d.grabY}px`;
  el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.04)`;
}

function limpiarEstilo(el: HTMLElement) {
  el.style.pointerEvents = "";
  el.style.zIndex = "";
  el.style.position = "";
  el.style.animation = "";
  el.style.transform = "";
  el.style.transformOrigin = "";
}

function indiceBajoPuntero(cont: HTMLElement | null, idArrastrado: string, x: number, y: number) {
  if (!cont) return null;
  const pills = [...cont.querySelectorAll<HTMLElement>("[data-pastilla-id]")];
  let mejor: { i: number; dist: number } | null = null;
  for (let i = 0; i < pills.length; i++) {
    const pill = pills[i];
    if (pill.dataset.pastillaId === idArrastrado) continue;
    const r = pill.getBoundingClientRect();
    const dentro = x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6;
    if (!dentro) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = (x - cx) ** 2 + (y - cy) ** 2;
    if (!mejor || dist < mejor.dist) mejor = { i, dist };
  }
  return mejor ? mejor.i : null;
}

function frase(n: number, uno: string, varios: string) {
  return `${n.toLocaleString("es-VE")} ${n === 1 ? uno : varios}`;
}

function BadgesStock({ conteos }: { conteos: ConteosHoy }) {
  const items = [
    conteos.agotados > 0
      ? {
          clave: "agotado",
          n: conteos.agotados,
          label: frase(conteos.agotados, "agotado", "agotados"),
          caja: "bg-[#FDECEC] text-[#7A2419] ring-[#E7B4B4]",
          punto: "bg-[#E15B4C]",
        }
      : null,
    conteos.bajos > 0
      ? {
          clave: "bajo",
          n: conteos.bajos,
          label: frase(conteos.bajos, "bajo el mínimo", "bajo el mínimo"),
          caja: "bg-[#FFF6D8] text-[#6B5310] ring-[#E4D08A]",
          punto: "bg-[#E4B423]",
        }
      : null,
    conteos.sinMinimo > 0
      ? {
          clave: "sin",
          n: conteos.sinMinimo,
          label: frase(conteos.sinMinimo, "sin mínimo", "sin mínimo"),
          caja: "bg-stone-200 text-cacao ring-stone-300",
          punto: "bg-stone-500",
        }
      : null,
  ].filter((item) => item !== null);
  if (items.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {items.map((item) => (
        <span
          key={item.clave}
          title={item.label}
          aria-label={item.label}
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ring-1 ${item.caja}`}
        >
          <span className={`size-1.5 rounded-full ${item.punto}`} aria-hidden />
          {item.n.toLocaleString("es-VE")}
        </span>
      ))}
    </span>
  );
}

export function GrupoPastillas({
  grupo,
  editando,
  conteos,
  onReordenar,
  onEntrarEdicion,
}: {
  grupo: Grupo;
  editando: boolean;
  conteos: ConteosHoy | null;
  onReordenar: (grupoId: string, ids: string[]) => void;
  onEntrarEdicion: () => void;
}) {
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const editandoRef = useRef(editando);
  const contRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef(new Map<string, HTMLAnchorElement>());
  const arrastreRef = useRef<Arrastre | null>(null);
  const presionRef = useRef<{
    pointerId: number;
    id: string;
    originX: number;
    originY: number;
    x: number;
    y: number;
    timer: number;
  } | null>(null);
  const previo = useRef<string | null>(null);
  const bloqueo = useRef(false);
  const idsRef = useRef(grupo.accesos.map((acceso) => acceso.id));

  useEffect(() => {
    editandoRef.current = editando;
  }, [editando]);
  useEffect(() => {
    idsRef.current = grupo.accesos.map((acceso) => acceso.id);
  }, [grupo]);

  function medir(d: Arrastre) {
    const el = pillRefs.current.get(d.id);
    if (!el) return;
    el.style.animation = "none";
    el.style.transform = "none";
    const rect = el.getBoundingClientRect();
    d.grabX = d.x - rect.left;
    d.grabY = d.y - rect.top;
  }

  function comenzar(info: Omit<Arrastre, "grabX" | "grabY">) {
    const d: Arrastre = { ...info, grabX: 0, grabY: 0 };
    medir(d);
    arrastreRef.current = d;
    setArrastrandoId(d.id);
    const el = pillRefs.current.get(d.id);
    if (!el) return;
    try {
      el.setPointerCapture(d.pointerId);
    } catch {
      // El puntero ya no está.
    }
    posicionar(el, d);
  }

  function terminar() {
    const d = arrastreRef.current;
    arrastreRef.current = null;
    if (d) {
      const el = pillRefs.current.get(d.id);
      if (el) {
        limpiarEstilo(el);
        try {
          el.releasePointerCapture(d.pointerId);
        } catch {
          // Ya se soltó.
        }
      }
    }
    setArrastrandoId(null);
  }

  function mover(x: number, y: number) {
    const d = arrastreRef.current;
    if (!d) return;
    d.x = x;
    d.y = y;
    const el = pillRefs.current.get(d.id);
    if (el) posicionar(el, d);
    const destino = indiceBajoPuntero(contRef.current, d.id, x, y);
    if (destino == null) return;
    const ids = idsRef.current;
    const next = moverId(ids, d.id, destino);
    if (next === ids) return;
    idsRef.current = next;
    onReordenar(grupo.id, next);
  }

  useLayoutEffect(() => {
    const d = arrastreRef.current;
    if (d) {
      const el = pillRefs.current.get(d.id);
      if (el) posicionar(el, d);
      previo.current = d.id;
      return;
    }
    if (previo.current) {
      const el = pillRefs.current.get(previo.current);
      if (el) limpiarEstilo(el);
      previo.current = null;
    }
  }, [grupo, arrastrandoId]);

  const punteroRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  }>({
    move: () => {},
    up: () => {},
  });

  useEffect(() => {
    punteroRef.current.move = (e: PointerEvent) => {
      const d = arrastreRef.current;
      if (d && d.pointerId === e.pointerId) {
        if (e.cancelable) e.preventDefault();
        mover(e.clientX, e.clientY);
        return;
      }
      const p = presionRef.current;
      if (!p || p.pointerId !== e.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const dx = e.clientX - p.originX;
      const dy = e.clientY - p.originY;
      if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) {
        window.clearTimeout(p.timer);
        presionRef.current = null;
      }
    };
    punteroRef.current.up = (e: PointerEvent) => {
      const p = presionRef.current;
      if (p && p.pointerId === e.pointerId) {
        window.clearTimeout(p.timer);
        presionRef.current = null;
      }
      const d = arrastreRef.current;
      if (d && d.pointerId === e.pointerId) {
        bloqueo.current = true;
        terminar();
      }
    };
  });

  useEffect(() => {
    function onMove(e: PointerEvent) {
      punteroRef.current.move(e);
    }
    function onUp(e: PointerEvent) {
      punteroRef.current.up(e);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (presionRef.current) window.clearTimeout(presionRef.current.timer);
    };
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || arrastreRef.current) return;
    e.stopPropagation();
    const id = e.currentTarget.dataset.pastillaId;
    if (!id) return;
    if (editandoRef.current) {
      e.preventDefault();
      bloqueo.current = true;
      comenzar({ pointerId: e.pointerId, id, x: e.clientX, y: e.clientY });
      return;
    }
    const pointerId = e.pointerId;
    const x = e.clientX;
    const y = e.clientY;
    const timer = window.setTimeout(() => {
      const p = presionRef.current;
      if (!p || p.pointerId !== pointerId) return;
      presionRef.current = null;
      bloqueo.current = true;
      onEntrarEdicion();
      comenzar({ pointerId, id, x: p.x, y: p.y });
    }, PRESS_MS);
    presionRef.current = { pointerId, id, originX: x, originY: y, x, y, timer };
  }

  return (
    <div ref={contRef} className="mt-3 flex flex-wrap gap-2.5">
      {grupo.accesos.map((acceso) => {
        const Icon = ICONOS[acceso.id];
        const agarrada = arrastrandoId === acceso.id;
        return (
          <Link
            key={acceso.id}
            href={acceso.href}
            draggable={false}
            data-guia={acceso.dataGuia}
            data-pastilla-id={acceso.id}
            data-grupo-id={grupo.id}
            aria-grabbed={editando ? agarrada : undefined}
            onPointerDown={onPointerDown}
            onClick={(e) => {
              if (editandoRef.current || bloqueo.current) {
                e.preventDefault();
                bloqueo.current = false;
              }
            }}
            onAuxClick={(e) => {
              if (editandoRef.current || bloqueo.current) e.preventDefault();
            }}
            onNavigate={(event) => {
              if (editandoRef.current || bloqueo.current) event.preventDefault();
            }}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            ref={(nodo) => {
              if (nodo) pillRefs.current.set(acceso.id, nodo);
              else pillRefs.current.delete(acceso.id);
            }}
            className={`modulos-pastilla inline-flex flex-wrap items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-cacao shadow-sm ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
              editando
                ? "modulos-pastilla-edit ring-terracotta/70"
                : "ring-marfil hover:text-terracotta hover:ring-terracotta"
            } ${editando && !agarrada ? "modulos-wiggle" : ""} ${agarrada ? "modulos-pastilla-arrastre" : ""}`}
          >
            {Icon ? <Icon className="size-5 text-terracotta" /> : null}
            {acceso.label}
            {acceso.id === "stock" && conteos ? <BadgesStock conteos={conteos} /> : null}
            <ChevronIcon className="size-3.5 text-terracotta" />
          </Link>
        );
      })}
    </div>
  );
}
