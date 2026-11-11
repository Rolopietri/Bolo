"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronIcon } from "@/components/icons";
import {
  descripcionAnilloHoy,
  nombreSeccionAnillo,
  resumenListasHoy,
  seccionCompletaHoy,
  textoConteoListas,
  type ItemChecklist,
  type TonoCentroHoy,
  type TonoHoy,
} from "./_hoy";

const DETALLE_ID = "detalle-listas-hoy";

const CX = 80;
const CY = 80;
const RADIO = 50;
const GROSOR = 18;
const PASO = 72;
const VERDE = "#57b98f";
const GRIS = "#d4cfc4";
const ROJO = "#e15b4c";
const AMARILLO = "#f0c14b";

const CAP_GRADOS = (GROSOR / 2 / RADIO) * (180 / Math.PI);
const HUECO_VISUAL = 14;
const ARCO_TRAZO = PASO - HUECO_VISUAL - 2 * CAP_GRADOS;

type ModoAnillo = "cargando" | "error" | "datos";

type Geometria = { d: string; medio: { x: number; y: number } };

function punto(angulo: number, radio = RADIO) {
  const rad = ((angulo - 90) * Math.PI) / 180;
  return {
    x: CX + radio * Math.cos(rad),
    y: CY + radio * Math.sin(rad),
  };
}

function arco(inicio: number, fin: number) {
  const a = punto(inicio);
  const b = punto(fin);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${RADIO} ${RADIO} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** Cinco óvalos curvos. El índice 0 queda arriba y sigue el orden de checklistHoy. */
const SEGMENTOS: Geometria[] = Array.from({ length: 5 }, (_, i) => {
  const centro = i * PASO;
  const inicio = centro - ARCO_TRAZO / 2;
  const fin = centro + ARCO_TRAZO / 2;
  return { d: arco(inicio, fin), medio: punto(centro) };
});

function etiquetaBoton(items: ItemChecklist[], modo: ModoAnillo, abierto: boolean): string {
  const accion = abierto ? "Ocultar detalle" : "Ver detalle";
  if (modo === "cargando") return `Revisando las listas de hoy. ${accion}.`;
  if (modo === "error") return `No se pudo revisar las listas de hoy. ${accion}.`;
  return `${descripcionAnilloHoy(items)} ${accion}.`;
}

function textoVisible(items: ItemChecklist[], modo: ModoAnillo): string {
  if (modo === "cargando") return "Revisando…";
  if (modo === "error") return "Sin revisar";
  const { completas, total } = resumenListasHoy(items);
  return textoConteoListas(completas, total);
}

function tonoCentro(items: ItemChecklist[], modo: ModoAnillo): TonoCentroHoy | "neutro" {
  if (modo !== "datos") return "neutro";
  return resumenListasHoy(items).tono;
}

const FONDO_CENTRO: Record<TonoCentroHoy | "neutro", string> = {
  rojo: ROJO,
  amarillo: AMARILLO,
  verde: VERDE,
  neutro: "#efece4",
};

function AnilloSvg({
  items,
  modo,
}: {
  items: ItemChecklist[];
  modo: ModoAnillo;
}) {
  const tono = tonoCentro(items, modo);
  return (
    <svg
      viewBox="0 0 160 160"
      className="size-40 sm:size-44"
      aria-hidden="true"
      focusable="false"
    >
      {SEGMENTOS.map((geo, i) => {
        const item = items[i];
        const completo = modo === "datos" && !!item && seccionCompletaHoy(item);
        const nombre = item ? nombreSeccionAnillo(item) : "";
        const estado = !item
          ? ""
          : modo === "cargando"
            ? "revisando"
            : modo === "error"
              ? "sin revisar"
              : completo
                ? "lista"
                : "pendiente";
        return (
          <g key={item?.id ?? i} data-guia={item?.dataGuia}>
            {nombre ? <title>{`${nombre}: ${estado}`}</title> : null}
            {/* Círculo transparente para que el cursor-guía tenga un área, no solo el trazo. */}
            <circle cx={geo.medio.x} cy={geo.medio.y} r={GROSOR * 0.85} fill="transparent" />
            <path
              d={geo.d}
              fill="none"
              stroke={completo ? VERDE : GRIS}
              strokeWidth={GROSOR}
              strokeLinecap="round"
              style={{ transition: "stroke 200ms ease" }}
            />
          </g>
        );
      })}
      <circle
        cx={CX}
        cy={CY}
        r={30}
        fill={FONDO_CENTRO[tono]}
        stroke={tono === "neutro" ? "#e0dbd0" : "transparent"}
        strokeWidth={2}
      />
      {tono === "verde" ? (
        <path
          d="M66.5 81.5 75.5 90.5 94.5 69"
          fill="none"
          stroke="#fff"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : tono === "rojo" || tono === "amarillo" ? (
        <g>
          <path
            d="M80 67.5 v16"
            fill="none"
            stroke="#fff"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <circle cx={80} cy={93.5} r={3.4} fill="#fff" />
        </g>
      ) : null}
    </svg>
  );
}

function estiloPastilla(tono: TonoHoy): { caja: string; punto: string } {
  if (tono === "listo") {
    return { caja: "bg-emerald-50 text-emerald-800 ring-emerald-200", punto: "bg-emerald-500" };
  }
  if (tono === "atencion") {
    return { caja: "bg-red-50 text-red-800 ring-red-200", punto: "bg-red-500" };
  }
  return { caja: "bg-naranja-soft/80 text-terracotta-deep ring-naranja-soft", punto: "bg-terracotta" };
}

export function AnilloListas({
  items,
  modo,
  detalleInicial = false,
}: {
  items: ItemChecklist[];
  modo: ModoAnillo;
  /** Abre el detalle al primer render. Hoy lo deja cerrado, salvo si la carga falló. */
  detalleInicial?: boolean;
}) {
  const [preferencia, setPreferencia] = useState<boolean | null>(detalleInicial ? true : null);
  const abierto = preferencia ?? modo === "error";

  function alternar() {
    setPreferencia(!abierto);
  }

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-controls={DETALLE_ID}
          aria-label={etiquetaBoton(items, modo, abierto)}
          className="cursor-pointer rounded-full transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2"
        >
          <AnilloSvg items={items} modo={modo} />
        </button>
        <div className="flex flex-col items-center sm:items-start">
          <p className="font-cinzel text-2xl leading-none text-cacao sm:text-3xl">
            {textoVisible(items, modo)}
          </p>
          <button
            type="button"
            onClick={alternar}
            aria-expanded={abierto}
            aria-controls={DETALLE_ID}
            className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-full px-2 text-sm font-semibold text-terracotta hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            {abierto ? "Ocultar detalle" : "Ver detalle"}
          </button>
        </div>
      </div>

      <ul
        id={DETALLE_ID}
        hidden={!abierto}
        aria-label="Detalle de las listas de hoy"
        className="mt-4 divide-y divide-marfil border-t border-marfil"
      >
        {items.map((item) => {
          const completo = modo === "datos" && seccionCompletaHoy(item);
          const nombre = nombreSeccionAnillo(item);
          const pastilla = estiloPastilla(item.tono);
          const mostrarEstado = modo === "datos";
          const mostrarIr = modo !== "cargando" && !completo;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terracotta"
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ${
                    completo ? "bg-[#57b98f]" : item.tono === "atencion" && modo === "datos" ? "bg-red-500" : "bg-[#b7b1a4]"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-cinzel text-lg leading-tight text-cacao group-hover:text-terracotta">
                      {nombre}
                    </span>
                    {mostrarEstado && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${pastilla.caja}`}
                      >
                        <span className={`size-1.5 rounded-full ${pastilla.punto}`} aria-hidden />
                        {item.etiqueta}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-cacao-soft">{item.detalle}</span>
                </span>
                {mostrarIr && (
                  <span className="shrink-0 text-sm font-semibold text-terracotta">Ir</span>
                )}
                <ChevronIcon className="size-5 shrink-0 text-cacao-mute transition group-hover:translate-x-0.5 group-hover:text-terracotta" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
