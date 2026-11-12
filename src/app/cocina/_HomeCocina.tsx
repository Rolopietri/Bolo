"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { GripIcon } from "@/components/icons";
import { ErrorCarga } from "@/components/ErrorCarga";
import {
  guardarOrdenPastillas,
  leerOrdenPastillas,
  type OrdenPastillas,
} from "@/lib/data/orden-pastillas";
import {
  BLOQUES_HOME,
  gruposOrdenados,
  layoutDefecto,
  layoutVisible,
  moverBloque,
  moverEnOrden,
  ordenParaGuardar,
} from "@/lib/orden-pastillas.mjs";
import { BcvRateBanner } from "./BcvRateBanner";
import { AnilloListas, useCocinaHoy } from "./_Hoy";
import { GrupoPastillas } from "./_ModulosHome";

const PRESS_MS = 500;
const SLOP_PX = 12;

type Layout = { id: string; col: 0 | 1 }[];
type Grupos = ReturnType<typeof gruposOrdenados>;

const TITULOS = new Map(BLOQUES_HOME.map((bloque) => [bloque.id, bloque.titulo]));

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
  el.style.zIndex = "6";
  el.style.position = "relative";
  el.style.animation = "none";
  el.style.transform = "none";
  const rect = el.getBoundingClientRect();
  const dx = d.x - rect.left - d.grabX;
  const dy = d.y - rect.top - d.grabY;
  el.style.transformOrigin = `${d.grabX}px ${d.grabY}px`;
  el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.012)`;
}

function limpiar(el: HTMLElement) {
  el.style.pointerEvents = "";
  el.style.zIndex = "";
  el.style.position = "";
  el.style.animation = "";
  el.style.transform = "";
  el.style.transformOrigin = "";
}

function columnaBajoPuntero(x: number): HTMLElement | null {
  const cols = [...document.querySelectorAll<HTMLElement>("[data-columna]")];
  if (cols.length === 0) return null;
  for (const col of cols) {
    const r = col.getBoundingClientRect();
    if (x >= r.left - 12 && x <= r.right + 12) return col;
  }
  return cols.reduce((mejor, col) => {
    const r = col.getBoundingClientRect();
    const centro = r.left + r.width / 2;
    const actual = Math.abs(x - centro);
    const previo = Math.abs(x - (mejor.getBoundingClientRect().left + mejor.getBoundingClientRect().width / 2));
    return actual < previo ? col : mejor;
  });
}

/** Índice en la columna. Si el bloque viene de otra, se inserta según la altura del dedo. */
function indiceDestino(colEl: HTMLElement, id: string, y: number): number | null {
  const cards = [...colEl.querySelectorAll<HTMLElement>(":scope > [data-bloque-id]")];
  const desde = cards.findIndex((card) => card.dataset.bloqueId === id);
  if (desde < 0) {
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }
  let mejor: { i: number; dist: number } | null = null;
  for (let i = 0; i < cards.length; i++) {
    if (i === desde) continue;
    const rect = cards[i].getBoundingClientRect();
    const medio = rect.top + rect.height / 2;
    const cruzo = i < desde ? y < medio : y > medio;
    if (!cruzo) continue;
    const dist = Math.abs(y - medio);
    if (!mejor || dist < mejor.dist) mejor = { i, dist };
  }
  return mejor ? mejor.i : null;
}

export function HomeCocina({ modulos }: { modulos?: string }) {
  const hoy = useCocinaHoy();
  const [editando, setEditando] = useState(false);
  const [escritorio, setEscritorio] = useState(false);
  const [layout, setLayout] = useState<Layout>(() => layoutVisible(modulos, null));
  const [grupos, setGrupos] = useState<Grupos>(() => gruposOrdenados(modulos, null));
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ordenBase, setOrdenBase] = useState<OrdenPastillas | null>(null);

  const layoutRef = useRef(layout);
  const gruposRef = useRef(grupos);
  const editandoRef = useRef(false);
  const escritorioRef = useRef(false);
  const tocadoRef = useRef(false);
  const ordenBaseRef = useRef(ordenBase);
  const modulosRef = useRef(modulos);
  const arrastreRef = useRef<Arrastre | null>(null);
  const bloqueRefs = useRef(new Map<string, HTMLElement>());
  const previo = useRef<string | null>(null);
  const presionRef = useRef<{
    pointerId: number;
    id: string;
    originX: number;
    originY: number;
    x: number;
    y: number;
    timer: number;
  } | null>(null);
  const cuerpoPrev = useRef<{ overflow: string; userSelect: string } | null>(null);
  const touchBlock = useRef<((ev: TouchEvent) => void) | null>(null);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  useEffect(() => {
    gruposRef.current = grupos;
  }, [grupos]);
  useEffect(() => {
    ordenBaseRef.current = ordenBase;
  }, [ordenBase]);
  useEffect(() => {
    modulosRef.current = modulos;
  }, [modulos]);
  useEffect(() => {
    editandoRef.current = editando;
  }, [editando]);
  useEffect(() => {
    escritorioRef.current = escritorio;
  }, [escritorio]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const aplicar = () => setEscritorio(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    let vivo = true;
    leerOrdenPastillas().then((lectura) => {
      if (!vivo || tocadoRef.current || arrastreRef.current) return;
      const siguienteLayout = layoutVisible(modulos, lectura.orden);
      const siguientes = gruposOrdenados(modulos, lectura.orden);
      layoutRef.current = siguienteLayout;
      gruposRef.current = siguientes;
      setLayout(siguienteLayout);
      setGrupos(siguientes);
      setOrdenBase(lectura.orden);
    });
    return () => {
      vivo = false;
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

  function comenzar(info: Omit<Arrastre, "grabX" | "grabY">) {
    const d: Arrastre = { ...info, grabX: 0, grabY: 0 };
    const el = bloqueRefs.current.get(d.id);
    if (el) {
      el.style.animation = "none";
      el.style.transform = "none";
      const rect = el.getBoundingClientRect();
      d.grabX = d.x - rect.left;
      d.grabY = d.y - rect.top;
    }
    arrastreRef.current = d;
    bloquearScroll(true);
    setArrastrando(d.id);
    if (!el) return;
    try {
      el.setPointerCapture(d.pointerId);
    } catch {
      // El puntero ya se soltó.
    }
    posicionar(el, d);
  }

  function terminar() {
    const d = arrastreRef.current;
    arrastreRef.current = null;
    if (d) {
      const el = bloqueRefs.current.get(d.id);
      if (el) {
        limpiar(el);
        try {
          el.releasePointerCapture(d.pointerId);
        } catch {
          // Ya no había captura.
        }
      }
    }
    bloquearScroll(false);
    setArrastrando(null);
  }

  function mover(x: number, y: number) {
    const d = arrastreRef.current;
    if (!d) return;
    d.x = x;
    d.y = y;
    const el = bloqueRefs.current.get(d.id);
    if (el) posicionar(el, d);
    const colEl = columnaBajoPuntero(x);
    if (!colEl) return;
    const indice = indiceDestino(colEl, d.id, y);
    if (indice == null) return;
    setLayout((prev) => {
      const crudo = escritorioRef.current
        ? moverBloque(prev, d.id, Number(colEl.dataset.columna) === 1 ? 1 : 0, indice)
        : moverEnOrden(prev, d.id, indice);
      if (crudo === prev) return prev;
      const next: Layout = crudo.map((bloque) => ({
        id: bloque.id,
        col: bloque.col === 1 ? 1 : 0,
      }));
      tocadoRef.current = true;
      layoutRef.current = next;
      return next;
    });
  }

  useLayoutEffect(() => {
    const d = arrastreRef.current;
    if (d) {
      const el = bloqueRefs.current.get(d.id);
      if (el) posicionar(el, d);
      previo.current = d.id;
      return;
    }
    if (previo.current) {
      const el = bloqueRefs.current.get(previo.current);
      if (el) limpiar(el);
      previo.current = null;
    }
  }, [layout, arrastrando]);

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
      if (arrastreRef.current?.pointerId === e.pointerId) terminar();
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
    editandoRef.current = true;
    setAviso(null);
    setEditando(true);
  }

  function salirEdicion() {
    if (presionRef.current) {
      window.clearTimeout(presionRef.current.timer);
      presionRef.current = null;
    }
    if (arrastreRef.current) terminar();
    editandoRef.current = false;
    setEditando(false);
  }

  function onAsaPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.currentTarget.dataset.bloqueId;
    if (!id || !editandoRef.current || arrastreRef.current) return;
    comenzar({ pointerId: e.pointerId, id, x: e.clientX, y: e.clientY });
  }

  function onBloquePointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || editandoRef.current || arrastreRef.current) return;
    const origen = e.target as HTMLElement;
    if (origen.closest("a, button, input, textarea, select, [data-pastilla-id]")) return;
    const id = e.currentTarget.dataset.bloqueId;
    if (!id) return;
    if (presionRef.current) window.clearTimeout(presionRef.current.timer);
    const pointerId = e.pointerId;
    const x = e.clientX;
    const y = e.clientY;
    const timer = window.setTimeout(() => {
      const p = presionRef.current;
      if (!p || p.pointerId !== pointerId) return;
      presionRef.current = null;
      editandoRef.current = true;
      setAviso(null);
      setEditando(true);
      comenzar({ pointerId, id, x: p.x, y: p.y });
    }, PRESS_MS);
    presionRef.current = { pointerId, id, originX: x, originY: y, x, y, timer };
  }

  function onReordenarPastillas(grupoId: string, ids: string[]) {
    setGrupos((prev) => {
      let cambio = false;
      const next = prev.map((grupo) => {
        if (grupo.id !== grupoId) return grupo;
        const porId = new Map(grupo.accesos.map((acceso) => [acceso.id, acceso]));
        const accesos = ids.flatMap((id) => {
          const acceso = porId.get(id);
          return acceso ? [acceso] : [];
        });
        if (accesos.map((acceso) => acceso.id).join("\0") === grupo.accesos.map((acceso) => acceso.id).join("\0")) {
          return grupo;
        }
        cambio = true;
        return { ...grupo, accesos };
      });
      if (!cambio) return prev;
      tocadoRef.current = true;
      gruposRef.current = next;
      return next;
    });
  }

  function restablecer() {
    tocadoRef.current = true;
    const defectoGrupos = gruposOrdenados(modulosRef.current, null);
    const defectoLayout = layoutDefecto(modulosRef.current);
    gruposRef.current = defectoGrupos;
    layoutRef.current = defectoLayout;
    setGrupos(defectoGrupos);
    setLayout(defectoLayout);
  }

  async function listo() {
    if (guardando) return;
    const payload = ordenParaGuardar(modulosRef.current, gruposRef.current, layoutRef.current);
    const igual =
      JSON.stringify(layoutVisible(modulosRef.current, ordenBaseRef.current)) ===
        JSON.stringify(layoutRef.current) &&
      JSON.stringify(gruposOrdenados(modulosRef.current, ordenBaseRef.current)) ===
        JSON.stringify(gruposRef.current);
    if (igual) {
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

  function contenido(id: string) {
    if (id === "tasas") return <BcvRateBanner />;
    if (id === "aviso") {
      return (
        <section className="rounded-3xl bg-marfil-soft px-5 py-5 sm:px-6" aria-busy={!hoy.carga && !hoy.error}>
          <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">{hoy.titulo}</h2>
          <p className="mt-2 text-sm text-cacao-soft">{hoy.intro}</p>
          {hoy.error ? (
            <ErrorCarga className="mt-4" que="hoy" detalle={hoy.error} onReintentar={hoy.reintentar} />
          ) : null}
        </section>
      );
    }
    if (id === "anillo") {
      return (
        <section aria-label="Qué falta" data-guia="cocina-empezar">
          <AnilloListas items={hoy.items} modo={hoy.modoAnillo} />
        </section>
      );
    }
    const grupo = grupos.find((item) => item.id === id);
    if (!grupo) return null;
    return (
      <section className="rounded-3xl bg-marfil-soft px-5 py-5 sm:px-6">
        {editando ? null : <h3 className="font-cinzel text-xl text-cacao">{grupo.titulo}</h3>}
        <GrupoPastillas
          grupo={grupo}
          editando={editando}
          conteos={hoy.carga?.conteos ?? null}
          onReordenar={onReordenarPastillas}
          onEntrarEdicion={entrarEdicion}
        />
      </section>
    );
  }

  const columnas = escritorio
    ? ([0, 1] as const).map((col) => ({
        col,
        bloques: layout.filter((bloque) => bloque.col === col),
      }))
    : [{ col: 0 as const, bloques: layout }];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <section>
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">Hoy</p>
          <h1 className="mt-2 text-balance font-cinzel text-3xl text-cacao sm:text-4xl" suppressHydrationWarning>
            {hoy.saludo}
            {hoy.nombre ? `, ${hoy.nombre}` : ""}
          </h1>
          <p className="mt-2 max-w-xl text-cacao-soft" suppressHydrationWarning>
            {hoy.fecha} · Esto es lo que conviene atender en la cocina.
          </p>
        </section>
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={restablecer}
              disabled={guardando}
              className="rounded-full px-3 py-1 text-xs font-semibold text-cacao-soft ring-1 ring-marfil transition-colors hover:text-terracotta hover:ring-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-60"
            >
              Restablecer
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

      {editando ? (
        <p className="mt-4 text-sm text-cacao-soft">
          Arrastra el asa para mover un bloque
          {escritorio ? " a la izquierda o a la derecha" : ""}. Las pastillas se mueven dentro de su casilla.
        </p>
      ) : null}
      {aviso ? (
        <p role="status" className="mt-2 text-sm text-[#7A2419]">
          {aviso}
        </p>
      ) : null}

      <div className={`mt-6 gap-4 ${escritorio ? "grid grid-cols-2 items-start" : "flex flex-col"}`}>
        {columnas.map((columna) => (
          <div key={columna.col} data-columna={columna.col} className="flex min-w-0 flex-col gap-4">
            {columna.bloques.map((bloque) => {
              const agarrado = arrastrando === bloque.id;
              const titulo = TITULOS.get(bloque.id) ?? bloque.id;
              return (
                <article
                  key={bloque.id}
                  data-bloque-id={bloque.id}
                  ref={(nodo) => {
                    if (nodo) bloqueRefs.current.set(bloque.id, nodo);
                    else bloqueRefs.current.delete(bloque.id);
                  }}
                  onPointerDown={onBloquePointerDown}
                  className={`min-w-0 ${editando && !agarrado ? "modulos-casilla-wiggle" : ""} ${
                    agarrado ? "modulos-casilla-arrastre rounded-3xl" : ""
                  }`}
                >
                  {editando ? (
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        data-bloque-id={bloque.id}
                        aria-label={`Mover ${titulo}`}
                        aria-grabbed={agarrado}
                        onPointerDown={onAsaPointerDown}
                        onContextMenu={(e) => e.preventDefault()}
                        className="modulos-asa grid size-11 shrink-0 place-items-center rounded-full bg-white text-terracotta ring-1 ring-terracotta/50 hover:bg-naranja-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        <GripIcon className="size-5" />
                      </button>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cacao-soft">
                        {titulo}
                      </span>
                    </div>
                  ) : null}
                  {contenido(bloque.id)}
                </article>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
