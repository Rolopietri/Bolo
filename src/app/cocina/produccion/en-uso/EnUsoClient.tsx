"use client";

// Tablero «En uso» (boceto aprobado por Lucia): vertical y compacto para el
// teléfono, sin sombras, con aros que se ajustan al espacio y a cuántos hay.
// Cada aro lleva solo nombre y cantidad. El trazo se parte en dos tonos:
// verde oscuro = viene de la jornada anterior, turquesa = habilitado en esta.
// Datos reales: cocina_tablero_en_uso() + la categoría de compra del insumo
// (la misma agrupación que Inventario). «Subrecetas» y «Desde Producción»
// solo si hay recetas con es_subreceta y saldo en uso. se_procesa no cuenta.
// Hoy las recetas no traen stock, así que ese grupo no sale.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorCarga } from "@/components/ErrorCarga";
import { listInsumos } from "@/lib/data/cocina";
import { listTableroEnUso } from "@/lib/data/jornada-cocina";
import { extractError } from "@/lib/data/error";
import { listRecetas } from "@/lib/data/recetas";
import {
  armarItemsEnUso,
  categoriasEnUso,
  partirPorOrigen,
  tamanioAro,
  type ItemEnUso,
} from "@/lib/tablero-en-uso";
import { displayCantidad } from "@/lib/units";

const TURQUESA = "#57B98F";
const VERDE_OSCURO = "#2F7A49";
const ANILLO = "#EFECE4";
const NARANJA = "#F15A24";
const R = 54;
const SW = 10;
const C = 2 * Math.PI * R;
const NOMBRE_ADENTRO_MIN = 86;
const REFRESCO_MS = 30000;

type Vista = "completo" | "categorias";

function cantidadTxt(it: ItemEnUso, valor = it.cantidad): string {
  return displayCantidad(valor, it.unidadBase);
}

function Aro({ item, size, sinNombre }: { item: ItemEnUso; size: number; sinNombre?: boolean }) {
  const s = Math.max(40, size);
  const nombreAbajo = !sinNombre && s < NOMBRE_ADENTRO_MIN;
  const nombreDentro = !sinNombre && !nombreAbajo;
  const cant = cantidadTxt(item);
  const fsCant = cant.length > 9 ? 10 : cant.length > 7 ? 12 : nombreDentro ? 13 : 15;
  const redondeo = item.fillAnterior > 0.0001 ? "butt" : "round";
  const nombreCorto = item.nombre.length <= 12 ? item.nombre : `${item.nombre.slice(0, 11)}.`;
  const titulo = `${item.nombre}: ${cant}`;
  return (
    <div
      title={titulo}
      className="flex min-w-0 max-w-full flex-col items-center"
      style={{ width: s, flex: `0 0 ${s}px` }}
    >
      <svg viewBox="0 0 140 140" width={s} height={s} className="block max-w-full" role="img" aria-label={titulo}>
        <circle cx={70} cy={70} r={R} fill="#fff" stroke={ANILLO} strokeWidth={SW} />
        {item.fillAnterior > 0.0001 ? (
          <circle
            cx={70} cy={70} r={R} fill="none" stroke={VERDE_OSCURO} strokeWidth={SW} strokeLinecap={redondeo}
            strokeDasharray={`${C * item.fillAnterior} ${C}`} transform="rotate(-90 70 70)"
          />
        ) : null}
        {item.fillHoy > 0.0001 ? (
          <circle
            cx={70} cy={70} r={R} fill="none" stroke={TURQUESA} strokeWidth={SW} strokeLinecap={redondeo}
            strokeDasharray={`${C * item.fillHoy} ${C}`} transform={`rotate(${-90 + item.fillAnterior * 360} 70 70)`}
          />
        ) : null}
        {nombreDentro ? (
          <text x={70} y={62} textAnchor="middle" fill="#1d1d1b" style={{ fontSize: 15, fontWeight: 700 }}>
            {item.nombre.length > 14 ? `${item.nombre.slice(0, 13)}.` : item.nombre}
          </text>
        ) : null}
        <text
          x={70} y={nombreDentro ? 84 : 76} textAnchor="middle" fill={VERDE_OSCURO}
          style={{ fontSize: fsCant, fontWeight: 700 }}
        >
          {cant}
        </text>
      </svg>
      {nombreAbajo ? (
        <div className="mt-0.5 w-full truncate text-center font-semibold leading-tight text-cacao" style={{ fontSize: Math.max(10, Math.round(s * 0.1)) }}>
          {nombreCorto}
        </div>
      ) : null}
    </div>
  );
}

function ArosCaja({ items }: { items: ItemEnUso[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(40, el.clientWidth));
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    medir();
    return () => ro.disconnect();
  }, []);
  const fino = ancho < 480;
  const size = tamanioAro(ancho, items.length, fino ? 112 : 148, fino ? 44 : 56, fino ? 4 : 6);
  return (
    <div ref={ref} className="flex w-full min-w-0 flex-wrap items-start" style={{ gap: fino ? 4 : 6 }}>
      {items.map((it) => (
        <Aro key={it.insumoId} item={it} size={size} />
      ))}
    </div>
  );
}

function Flecha({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 26" width={14} className="block" aria-hidden="true">
      <path d="M12 1 v16 M5 12 l7 12 7-12" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Dos caminos hacia En uso. «Desde Producción» solo si hay subrecetas reales en uso; lo demás entra del Almacén. */
function Flujo({ conSub, conDirecto }: { conSub: boolean; conDirecto: boolean }) {
  if (!conSub && !conDirecto) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 py-1" aria-hidden="true">
      {conSub ? (
        <div className="flex flex-col items-center gap-0.5">
          <Flecha color={NARANJA} />
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-terracotta-deep">Desde Producción</span>
        </div>
      ) : null}
      {conDirecto ? (
        <div className="flex flex-col items-center gap-0.5">
          <Flecha color={TURQUESA} />
          <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: VERDE_OSCURO }}>Desde Almacén</span>
        </div>
      ) : null}
    </div>
  );
}

function Segmentado({ valor, onCambio }: { valor: Vista; onCambio: (v: Vista) => void }) {
  const opciones: { id: Vista; label: string }[] = [
    { id: "completo", label: "Completo" },
    { id: "categorias", label: "Por categorías" },
  ];
  return (
    <div role="group" aria-label="Vista de en uso" className="inline-flex max-w-full flex-wrap items-center gap-0.5 self-start rounded-full bg-marfil-soft p-0.5 ring-1 ring-marfil">
      {opciones.map((o) => {
        const activo = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(o.id)}
            className={`min-h-[28px] rounded-full px-3 text-xs font-bold ${activo ? "bg-[#E4F3EA] text-[#2F7A49]" : "text-cacao-soft hover:text-cacao"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Chip({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`min-h-[28px] rounded-full px-3 text-xs font-bold ring-1 ${activo ? "bg-[#E4F3EA] text-[#2F7A49] ring-[#57B98F]" : "bg-white text-cacao ring-marfil hover:bg-marfil-soft"}`}
    >
      {label}
    </button>
  );
}

function Punto({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

function Detalle({ items }: { items: ItemEnUso[] }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-cacao-soft">
        <span className="inline-flex items-center gap-1.5"><Punto color={VERDE_OSCURO} />Jornada anterior</span>
        <span className="inline-flex items-center gap-1.5"><Punto color={TURQUESA} />Habilitado hoy</span>
      </div>
      {items.map((it) => (
        <div key={it.insumoId} className="flex min-w-0 flex-wrap items-center gap-3">
          <Aro item={it} size={96} sinNombre />
          <div className="min-w-0 flex-1" style={{ flexBasis: 140 }}>
            <div className="font-cinzel text-lg leading-tight text-cacao">{it.nombre}</div>
            <div className="text-sm font-bold" style={{ color: VERDE_OSCURO }}>{cantidadTxt(it)}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5" style={{ color: VERDE_OSCURO }} title="Jornada anterior">
                <Punto color={VERDE_OSCURO} />{cantidadTxt(it, it.anterior)}
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ color: TURQUESA }} title="Habilitado hoy">
                <Punto color={TURQUESA} />{cantidadTxt(it, it.hoy)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EnUsoClient() {
  const [items, setItems] = useState<ItemEnUso[] | null>(null);
  const [sinMigracion, setSinMigracion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState<Vista>("completo");
  const [categoria, setCategoria] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [filas, insumos, recetas] = await Promise.all([
        listTableroEnUso(),
        listInsumos(),
        listRecetas(),
      ]);
      if (filas === null) {
        setSinMigracion(true);
        setItems([]);
      } else {
        setSinMigracion(false);
        // Las recetas no tienen saldo: sin cantidadEnUso ninguna entra como subreceta.
        setItems(armarItemsEnUso(filas, insumos, recetas));
      }
      setError(null);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial y refresco suave mientras la pantalla está a la vista.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const categorias = useMemo(() => categoriasEnUso(items ?? []), [items]);
  const elegida = categoria && categorias.includes(categoria) ? categoria : (categorias[0] ?? null);
  const origen = useMemo(() => partirPorOrigen(items ?? []), [items]);
  const deCategoria = useMemo(() => (items ?? []).filter((i) => i.categoria === elegida), [items, elegida]);

  if (error && items === null) {
    return <ErrorCarga que="lo que está en uso" detalle={error} onReintentar={() => void cargar()} reintentando={cargando} />;
  }
  if (items === null) {
    return <p className="text-sm text-cacao-soft">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorCarga que="lo que está en uso" detalle={error} onReintentar={() => void cargar()} reintentando={cargando} desactualizado /> : null}
      {sinMigracion ? (
        <p className="rounded-lg bg-marfil-soft p-3 text-sm text-cacao-soft">
          Falta activar el cierre de jornada en la base de datos para ver lo que está en uso.
        </p>
      ) : null}
      {!sinMigracion ? (
        <>
          <Flujo conSub={origen.subrecetas.length > 0 && vista === "completo"} conDirecto={origen.directo.length > 0 && vista === "completo"} />
          <section className="flex flex-col gap-3 rounded-2xl border border-marfil bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-cacao-mute">Listos</div>
                <h2 className="font-cinzel text-xl leading-tight text-cacao">En uso</h2>
              </div>
              <Segmentado valor={vista} onCambio={setVista} />
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-cacao-soft">No hay nada en uso por ahora.</p>
            ) : vista === "completo" ? (
              <>
                {origen.subrecetas.length > 0 ? (
                  <>
                    <div className="text-[11px] font-bold text-cacao-soft">Subrecetas</div>
                    <ArosCaja items={origen.subrecetas} />
                  </>
                ) : null}
                {origen.directo.length > 0 ? <ArosCaja items={origen.directo} /> : null}
              </>
            ) : (
              <>
                <div className="flex w-full flex-wrap gap-1">
                  {categorias.map((c) => (
                    <Chip key={c} label={c} activo={c === elegida} onClick={() => setCategoria(c)} />
                  ))}
                </div>
                {deCategoria.length > 0 ? <Detalle items={deCategoria} /> : null}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
