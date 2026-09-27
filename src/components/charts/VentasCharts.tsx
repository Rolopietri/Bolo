"use client";

// Gráficos ligeros a medida (SVG/divs) para el dashboard de Análisis de Ventas.
// Sin dependencias externas: usan la paleta de la app y son interactivos
// (hover con detalle). Pensados para datos ya agregados en el cliente.

import { useState, type ReactNode } from "react";

/** Paleta categórica on-brand (terracota, oliva, azul-polvo, coral, grises). */
export const CHART_COLORS = [
  "#B53727", // terracotta
  "#758F5F", // oliva
  "#9FB6D2", // azul-polvo
  "#C8695C", // coral
  "#595959", // cacao-soft
  "#DA9B91", // coral-soft
  "#952D20", // terracotta-deep
  "#B9A38F", // arena
  "#7C8A99", // pizarra
  "#999999", // cacao-mute
];

export function colorPorIndice(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

// ─────────────────────────────────────────────────────────────────────────
// Barras horizontales (rankings: categorías, top productos)
// ─────────────────────────────────────────────────────────────────────────
export type BarRow = {
  key: string;
  label: string;
  value: number;
  color?: string;
  /** Detalle mostrado al pasar el cursor (tooltip nativo). */
  tip?: string;
};

export function BarrasH({
  rows,
  format,
  emptyLabel = "Sin datos en el período.",
}: {
  rows: BarRow[];
  format: (n: number) => string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-cacao-soft italic font-serif py-6 text-center">
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const pct = Math.max(0, (r.value / max) * 100);
        return (
          <div key={r.key} title={r.tip} className="group">
            <div className="flex items-baseline justify-between gap-3 text-xs mb-0.5">
              <span className="text-cacao truncate min-w-0">{r.label}</span>
              <span className="text-cacao-soft tabular-nums shrink-0">
                {format(r.value)}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-marfil-light overflow-hidden">
              <div
                className="h-full rounded-full transition-all group-hover:opacity-80"
                style={{
                  width: `${pct}%`,
                  backgroundColor: r.color ?? colorPorIndice(i),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Línea / área — evolución diaria
// ─────────────────────────────────────────────────────────────────────────
export type PuntoLinea = { label: string; value: number; tip?: string };

export function LineaEvolucion({
  puntos,
  format,
}: {
  puntos: PuntoLinea[];
  format: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (puntos.length === 0) {
    return (
      <p className="text-sm text-cacao-soft italic font-serif py-10 text-center">
        Sin ventas en el período seleccionado.
      </p>
    );
  }

  // Viewbox fijo; el SVG escala al ancho del contenedor (responsive).
  const W = 720;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 26;
  const maxV = Math.max(...puntos.map((p) => p.value), 0) || 1;
  const n = puntos.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) =>
    padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;

  const linePath = puntos
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `M ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} ` +
    puntos.map((p, i) => `L ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ") +
    ` L ${x(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  // Etiquetas del eje X: como máximo ~8 para no saturar.
  const step = Math.max(1, Math.ceil(n / 8));

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseLeave={() => setHover(null)}
      >
        {/* línea base */}
        <line
          x1={padL}
          y1={padT + innerH}
          x2={W - padR}
          y2={padT + innerH}
          stroke="#EDE8E2"
          strokeWidth={1}
        />
        <path d={areaPath} fill="#B53727" opacity={0.08} />
        <path
          d={linePath}
          fill="none"
          stroke="#B53727"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* punto activo */}
        {hover !== null && (
          <>
            <line
              x1={x(hover)}
              y1={padT}
              x2={x(hover)}
              y2={padT + innerH}
              stroke="#B53727"
              strokeWidth={1}
              opacity={0.35}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(hover)} cy={y(puntos[hover].value)} r={4} fill="#B53727" />
          </>
        )}
        {/* bandas invisibles para el hover (una por día) */}
        {puntos.map((p, i) => {
          const bandW = innerW / Math.max(1, n);
          return (
            <rect
              key={i}
              x={x(i) - bandW / 2}
              y={padT}
              width={bandW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
        {/* etiquetas eje X. La primera se ancla a la izquierda y la última a la
            derecha para que no se salgan (y se corten) en los bordes del SVG. */}
        {puntos.map((p, i) => {
          if (!(i % step === 0 || i === n - 1)) return null;
          const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          return (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={anchor}
              className="fill-cacao-mute"
              style={{ fontSize: 11 }}
            >
              {p.label}
            </text>
          );
        })}
      </svg>
      {hover !== null && (() => {
        // Ancla el tooltip según dónde esté el punto para que NO se salga del
        // recuadro: pegado a la izquierda cerca del inicio, a la derecha cerca
        // del final, centrado en el medio.
        const leftPct = (x(hover) / W) * 100;
        const transform =
          leftPct < 15 ? "translateX(0)" : leftPct > 85 ? "translateX(-100%)" : "translateX(-50%)";
        return (
          <div
            className="pointer-events-none absolute -top-1 rounded-lg bg-cacao text-white text-[11px] px-2 py-1 shadow-lg whitespace-nowrap max-w-[70%] overflow-hidden text-ellipsis"
            style={{ left: `${leftPct}%`, transform }}
          >
            <div className="font-medium truncate">{puntos[hover].tip ?? puntos[hover].label}</div>
            <div className="tabular-nums">{format(puntos[hover].value)}</div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dona — distribución porcentual (categorías)
// ─────────────────────────────────────────────────────────────────────────
export type SegmentoDona = {
  key: string;
  label: string;
  value: number;
  color?: string;
  /** Texto extra en la leyenda (ej. unidades), a la derecha del nombre. */
  sub?: string;
};

export function Dona({
  segmentos,
  format,
  centroLabel = "Total",
  sinLeyenda = false,
  onSelect,
  activeKey,
}: {
  segmentos: SegmentoDona[];
  format: (n: number) => string;
  centroLabel?: string;
  /** Oculta la leyenda lateral (útil cuando al lado hay una tabla con el mismo
   *  detalle — evita duplicar y que se monten los textos). */
  sinLeyenda?: boolean;
  /** Si se pasa, la dona y la leyenda son clicables (para abrir un desglose). */
  onSelect?: (key: string) => void;
  /** Resalta el segmento seleccionado. */
  activeKey?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segmentos.reduce((s, x) => s + x.value, 0);

  if (total <= 0) {
    return (
      <p className="text-sm text-cacao-soft italic font-serif py-10 text-center">
        Sin datos para distribuir.
      </p>
    );
  }

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 78;
  const thickness = 26;
  const C = 2 * Math.PI * radius;
  // Offset acumulado por segmento, precalculado sin mutar en el render (la
  // regla de inmutabilidad de React 19 no permite reasignar dentro del map).
  const offsets = segmentos.map((_, i) =>
    segmentos.slice(0, i).reduce((s, seg) => s + (seg.value / total) * C, 0),
  );

  const activo = hover !== null ? segmentos[hover] : null;
  const centroValor = activo ? activo.value : total;
  const centroTexto = activo ? activo.label : centroLabel;
  const centroPct = activo ? (activo.value / total) * 100 : 100;

  const donut = (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full"
          onMouseLeave={() => setHover(null)}
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#EDE8E2"
            strokeWidth={thickness}
          />
          {segmentos.map((s, i) => {
            const len = (s.value / total) * C;
            return (
              <circle
                key={s.key}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={s.color ?? colorPorIndice(i)}
                strokeWidth={hover === i ? thickness + 4 : thickness}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offsets[i]}
                transform={`rotate(-90 ${cx} ${cy})`}
                onMouseEnter={() => setHover(i)}
                onClick={onSelect ? () => onSelect(s.key) : undefined}
                style={{ cursor: "pointer", transition: "stroke-width 0.1s" }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {/* Acotado al agujero de la dona para no montarse sobre el anillo. */}
          <div className="flex flex-col items-center leading-tight" style={{ maxWidth: 118 }}>
            <span className="text-[10px] uppercase tracking-widest text-cacao-mute truncate max-w-full">
              {centroTexto}
            </span>
            <span className="text-base font-cinzel text-cacao tabular-nums truncate max-w-full">
              {format(centroValor)}
            </span>
            <span className="text-[11px] text-cacao-soft tabular-nums">
              {centroPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
  );

  if (sinLeyenda) {
    return <div className="flex justify-center py-2">{donut}</div>;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {donut}
      {/* Leyenda debajo de la dona, a todo el ancho: así los nombres se leen
          completos en vez de quedar apretados al lado. */}
      <ul className="w-full space-y-1.5">
        {segmentos.map((s, i) => (
          <li
            key={s.key}
            className={`flex items-center gap-2 text-xs rounded px-1 py-0.5 ${onSelect ? "cursor-pointer" : "cursor-default"} ${
              hover === i || activeKey === s.key ? "bg-marfil-soft" : ""
            }`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={onSelect ? () => onSelect(s.key) : undefined}
          >
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color ?? colorPorIndice(i) }}
            />
            <span className="text-cacao truncate flex-1 min-w-0 inline-flex items-center gap-1">{s.label}{onSelect && <span className="text-cacao-mute">›</span>}</span>
            {s.sub && <span className="text-cacao-mute tabular-nums shrink-0 text-right whitespace-nowrap">{s.sub}</span>}
            <span className="text-cacao-soft tabular-nums shrink-0 w-12 text-right">
              {((s.value / total) * 100).toFixed(1)}%
            </span>
            <span className="text-cacao-soft tabular-nums shrink-0 w-20 text-right whitespace-nowrap">
              {format(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Contenedor de tarjeta reutilizable para las secciones del dashboard.
export function PanelCard({
  titulo,
  extra,
  children,
}: {
  titulo: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-cinzel text-base tracking-wide text-cacao">
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}
