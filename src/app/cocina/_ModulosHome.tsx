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
  ChartIcon,
  ChevronIcon,
  ClipboardIcon,
  PlusIcon,
  ReceiptIcon,
  TruckIcon,
  UtensilsIcon,
} from "@/components/icons";
import {
  guardarOrdenPastillas,
  leerOrdenPastillas,
  type OrdenPastillas,
} from "@/lib/data/orden-pastillas";
import {
  gruposOrdenados,
  mismoOrdenVisible,
  ordenParaGuardar,
  reordenarGrupo,
} from "@/lib/orden-pastillas.mjs";

const PRESS_MS = 500;
const SLOP_PX = 12;

type Icono = ComponentType<SVGProps<SVGSVGElement>>;
type Grupos = ReturnType<typeof gruposOrdenados>;

const ICONOS: Record<string, Icono> = {
  insumos: BoxIcon,
  stock: ChartIcon,
  conteo: ClipboardIcon,
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
  grupo: string;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
};

type Presion = {
  pointerId: number;
  id: string;
  grupo: string;
  originX: number;
  originY: number;
  x: number;
  y: number;
  timer: number;
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

function indiceBajoPuntero(
  cont: HTMLElement | undefined,
  idArrastrado: string,
  x: number,
  y: number,
): number | null {
  if (!cont) return null;
  const pills = [...cont.querySelectorAll<HTMLElement>("[data-pastilla-id]")];
  let mejor: { i: number; dist: number } | null = null;
  for (let i = 0; i < pills.length; i++) {
    const pill = pills[i];
    if (pill.dataset.pastillaId === idArrastrado) continue;
    const r = pill.getBoundingClientRect();
    const dentro =
      x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6;
    if (!dentro) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = (x - cx) ** 2 + (y - cy) ** 2;
    if (!mejor || dist < mejor.dist) mejor = { i, dist };
  }
  return mejor ? mejor.i : null;
}

export function ModulosHome({ modulos }: { modulos?: string }) {
  const [grupos, setGrupos] = useState<Grupos>(() => gruposOrdenados(modulos, null));
  const [editando, setEditando] = useState(false);
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargandoOrden, setCargandoOrden] = useState(true);
  const [ordenBase, setOrdenBase] = useState<OrdenPastillas | null>(null);

  const gruposRef = useRef(grupos);
  const editandoRef = useRef(false);
  const tocadoRef = useRef(false);
  const bloquearClickRef = useRef(false);
  const presionRef = useRef<Presion | null>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  const pillRefs = useRef(new Map<string, HTMLAnchorElement>());
  const grupoRefs = useRef(new Map<string, HTMLDivElement>());
  const cuerpoPrev = useRef<{ overflow: string; userSelect: string } | null>(null);
  const touchBlock = useRef<((ev: TouchEvent) => void) | null>(null);
  const modulosRef = useRef(modulos);
  const ordenBaseRef = useRef(ordenBase);
  const arrastrePrevio = useRef<string | null>(null);

  useEffect(() => {
    gruposRef.current = grupos;
  }, [grupos]);
  useEffect(() => {
    modulosRef.current = modulos;
  }, [modulos]);
  useEffect(() => {
    ordenBaseRef.current = ordenBase;
  }, [ordenBase]);

  useEffect(() => {
    let vivo = true;
    // Si la base no responde, el modo edición no se queda trabado: se usa el orden visible.
    const tope = window.setTimeout(() => {
      if (vivo) setCargandoOrden(false);
    }, 4000);
    leerOrdenPastillas().then((lectura) => {
      if (!vivo) return;
      // No pisar un arrastre ni un orden que la persona ya cambió.
      if (!tocadoRef.current && !arrastreRef.current) {
        const ordenados = gruposOrdenados(modulos, lectura.orden);
        gruposRef.current = ordenados;
        setGrupos(ordenados);
        setOrdenBase(lectura.orden);
      }
      setCargandoOrden(false);
    });
    return () => {
      vivo = false;
      window.clearTimeout(tope);
    };
  }, [modulos]);

  function bloquearScroll(on: boolean) {
    if (on) {
      if (cuerpoPrev.current) return;
      cuerpoPrev.current = {
        overflow: document.body.style.overflow,
        userSelect: document.body.style.userSelect,
      };
      document.body.style.overflow = "hidden";
      document.body.style.userSelect = "none";
      const fn = (ev: TouchEvent) => {
        if (ev.cancelable) ev.preventDefault();
      };
      touchBlock.current = fn;
      document.addEventListener("touchmove", fn, { passive: false });
      return;
    }
    if (!cuerpoPrev.current) return;
    document.body.style.overflow = cuerpoPrev.current.overflow;
    document.body.style.userSelect = cuerpoPrev.current.userSelect;
    cuerpoPrev.current = null;
    if (touchBlock.current) {
      document.removeEventListener("touchmove", touchBlock.current);
      touchBlock.current = null;
    }
  }

  function medirAgarre(d: Arrastre) {
    const el = pillRefs.current.get(d.id);
    if (!el) return;
    el.style.animation = "none";
    el.style.transform = "none";
    const rect = el.getBoundingClientRect();
    d.grabX = d.x - rect.left;
    d.grabY = d.y - rect.top;
  }

  function comenzarArrastre(info: Omit<Arrastre, "grabX" | "grabY">) {
    const d: Arrastre = { ...info, grabX: 0, grabY: 0 };
    medirAgarre(d);
    arrastreRef.current = d;
    bloquearScroll(true);
    setArrastrandoId(d.id);
    const el = pillRefs.current.get(d.id);
    if (el) {
      try {
        el.setPointerCapture(d.pointerId);
      } catch {
        // El puntero ya se soltó: el arrastre termina en pointerup.
      }
      posicionar(el, d);
    }
  }

  function terminarArrastre() {
    const d = arrastreRef.current;
    arrastreRef.current = null;
    if (d) {
      const el = pillRefs.current.get(d.id);
      if (el) {
        limpiarEstilo(el);
        try {
          el.releasePointerCapture(d.pointerId);
        } catch {
          // La captura ya no estaba activa.
        }
      }
    }
    bloquearScroll(false);
    setArrastrandoId(null);
  }

  function moverA(x: number, y: number) {
    const d = arrastreRef.current;
    if (!d) return;
    d.x = x;
    d.y = y;
    const el = pillRefs.current.get(d.id);
    if (el) posicionar(el, d);
    const destino = indiceBajoPuntero(grupoRefs.current.get(d.grupo), d.id, x, y);
    if (destino == null) return;
    setGrupos((prev) => {
      const next = reordenarGrupo(prev, d.grupo, d.id, destino);
      if (next === prev) return prev;
      tocadoRef.current = true;
      gruposRef.current = next;
      return next;
    });
  }

  useLayoutEffect(() => {
    const d = arrastreRef.current;
    if (d) {
      const el = pillRefs.current.get(d.id);
      if (el) posicionar(el, d);
      arrastrePrevio.current = d.id;
      return;
    }
    if (arrastrePrevio.current) {
      const el = pillRefs.current.get(arrastrePrevio.current);
      if (el) limpiarEstilo(el);
      arrastrePrevio.current = null;
    }
  }, [grupos, arrastrandoId]);

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
        moverA(e.clientX, e.clientY);
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
        bloquearClickRef.current = true;
        terminarArrastre();
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
      if (cuerpoPrev.current) {
        document.body.style.overflow = cuerpoPrev.current.overflow;
        document.body.style.userSelect = cuerpoPrev.current.userSelect;
        cuerpoPrev.current = null;
      }
      if (touchBlock.current) {
        document.removeEventListener("touchmove", touchBlock.current);
        touchBlock.current = null;
      }
    };
  }, []);

  function entrarEdicion() {
    if (editandoRef.current) return;
    setAviso(null);
    editandoRef.current = true;
    setEditando(true);
  }

  function salirEdicion() {
    if (presionRef.current) {
      window.clearTimeout(presionRef.current.timer);
      presionRef.current = null;
    }
    if (arrastreRef.current) terminarArrastre();
    editandoRef.current = false;
    setEditando(false);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || arrastreRef.current) return;
    const el = e.currentTarget;
    const id = el.dataset.pastillaId;
    const grupo = el.dataset.grupoId;
    if (!id || !grupo) return;

    if (editandoRef.current) {
      e.preventDefault();
      bloquearClickRef.current = true;
      comenzarArrastre({ pointerId: e.pointerId, id, grupo, x: e.clientX, y: e.clientY });
      return;
    }

    if (presionRef.current) window.clearTimeout(presionRef.current.timer);
    const pointerId = e.pointerId;
    const x = e.clientX;
    const y = e.clientY;
    const timer = window.setTimeout(() => {
      const p = presionRef.current;
      if (!p || p.pointerId !== pointerId) return;
      presionRef.current = null;
      bloquearClickRef.current = true;
      editandoRef.current = true;
      setAviso(null);
      setEditando(true);
      comenzarArrastre({ pointerId, id, grupo, x: p.x, y: p.y });
    }, PRESS_MS);
    presionRef.current = {
      pointerId,
      id,
      grupo,
      originX: x,
      originY: y,
      x,
      y,
      timer,
    };
  }

  function onClickPastilla(e: React.MouseEvent<HTMLAnchorElement>) {
    if (editandoRef.current || bloquearClickRef.current) {
      e.preventDefault();
      bloquearClickRef.current = false;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLAnchorElement>) {
    if (!editandoRef.current) return;
    const id = e.currentTarget.dataset.pastillaId;
    const grupo = e.currentTarget.dataset.grupoId;
    if (!id || !grupo) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return;
    }
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    setGrupos((prev) => {
      const g = prev.find((item) => item.id === grupo);
      if (!g) return prev;
      const index = g.accesos.findIndex((acceso) => acceso.id === id);
      const destino = index + dir;
      if (index < 0 || destino < 0 || destino >= g.accesos.length) return prev;
      const next = reordenarGrupo(prev, grupo, id, destino);
      if (next === prev) return prev;
      tocadoRef.current = true;
      gruposRef.current = next;
      return next;
    });
  }

  function restablecer() {
    tocadoRef.current = true;
    const defecto = gruposOrdenados(modulosRef.current, null);
    gruposRef.current = defecto;
    setGrupos(defecto);
  }

  async function listo() {
    if (guardando) return;
    const payload = ordenParaGuardar(modulosRef.current, gruposRef.current);
    if (mismoOrdenVisible(modulosRef.current, ordenBaseRef.current, payload)) {
      salirEdicion();
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      await guardarOrdenPastillas(payload);
      setOrdenBase(payload);
      salirEdicion();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setAviso(
        msg === "sin_columna"
          ? "No se pudo guardar. Hay que aplicar la migración de ajustes (orden de módulos) en Supabase. En esta visita sí se ve."
          : msg === "sin_conexion"
            ? "No hay conexión con la base de datos, así que el orden no se guardó. En esta visita sí se ve."
            : "No se pudo guardar el orden. En esta visita sí se ve.",
      );
      salirEdicion();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="modulos-titulo" aria-busy={cargandoOrden}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2
          id="modulos-titulo"
          className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft"
        >
          Módulos
        </h2>
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={restablecer}
              disabled={guardando}
              className="rounded-full px-3 py-1 text-xs font-semibold text-cacao-soft ring-1 ring-marfil transition-colors hover:text-terracotta hover:ring-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-60"
            >
              Restablecer orden
            </button>
            <button
              type="button"
              onClick={listo}
              disabled={guardando}
              className="rounded-full bg-terracotta px-3.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Listo"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={entrarEdicion}
            className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cacao-soft ring-1 ring-marfil transition-colors hover:text-terracotta hover:ring-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            Editar
          </button>
        )}
      </div>
      {editando && (
        <p id="modulos-edicion-ayuda" className="mt-2 text-sm text-cacao-soft">
          Arrastra una pastilla para cambiar su lugar. No abre la pantalla.
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-2 text-sm text-[#7A2419]">
          {aviso}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        {grupos.map((grupo) => (
          <div
            key={grupo.id}
            className="rounded-3xl bg-marfil-soft px-5 py-5 sm:px-6 sm:py-6"
          >
            <h3 className="font-cinzel text-xl text-cacao">{grupo.titulo}</h3>
            <div
              ref={(nodo) => {
                if (nodo) grupoRefs.current.set(grupo.id, nodo);
                else grupoRefs.current.delete(grupo.id);
              }}
              className="mt-3 flex flex-wrap gap-2.5"
            >
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
                    aria-describedby={editando ? "modulos-edicion-ayuda" : undefined}
                    onPointerDown={onPointerDown}
                    onClick={onClickPastilla}
                    onAuxClick={onClickPastilla}
                    onNavigate={(event) => {
                      if (editandoRef.current || bloquearClickRef.current) event.preventDefault();
                    }}
                    onKeyDown={onKeyDown}
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                    ref={(nodo) => {
                      if (nodo) pillRefs.current.set(acceso.id, nodo);
                      else pillRefs.current.delete(acceso.id);
                    }}
                    className={`modulos-pastilla inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-cacao shadow-sm ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                      editando
                        ? "modulos-pastilla-edit ring-terracotta/70"
                        : "ring-marfil hover:text-terracotta hover:ring-terracotta"
                    } ${editando && !agarrada ? "modulos-wiggle" : ""} ${
                      agarrada ? "modulos-pastilla-arrastre" : ""
                    }`}
                  >
                    {Icon ? <Icon className="size-5 text-terracotta" /> : null}
                    {acceso.label}
                    <ChevronIcon className="size-3.5 text-terracotta" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
