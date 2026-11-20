"use client";

// Procesamientos de un insumo, contados como en papel (Fase E). Cada vez que se
// procesa algo (crudo → listo para vender), una parte se pierde: esa es la
// MERMA. Esta vista no usa gráficos: muestra, en palabras, cuánto metiste,
// cuánto te quedó y cuánto se perdió cada vez, y avisa cuando una producción se
// salió de lo normal. Solo aparecen los días en que sí procesaste.

import { useEffect, useMemo, useState } from "react";
import type { Insumo } from "@/lib/types";
import { listProcesamientos, type Procesamiento } from "@/lib/data/procesamientos";
import { evaluarMerma } from "@/lib/merma-alertas";
import { displayCantidad } from "@/lib/units";
import { extractError } from "@/lib/data/error";
import { ErrorCarga } from "@/components/ErrorCarga";

/** "mar 11 nov" — corto y legible. */
function fFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!(d && m && y)) return iso;
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("es-VE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function ProcesamientosClient({ insumo }: { insumo: Insumo }) {
  const [procs, setProcs] = useState<Procesamiento[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const u = insumo.unidadBase;
  const estandar = insumo.mermaCoccionPorc ?? null;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const data = await listProcesamientos(insumo.id, 300);
        if (vivo) setProcs(data);
      } catch (e) {
        if (vivo) setErrorCarga(extractError(e, "Error cargando los procesamientos"));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [insumo.id, intento]);

  // Alerta en palabras (desviación de la última y deriva del promedio).
  const evaluacion = useMemo(
    () => (procs ? evaluarMerma(estandar, procs.map((p) => p.mermaPorc)) : null),
    [procs, estandar],
  );

  if (errorCarga) {
    return (
      <ErrorCarga
        que="los procesamientos"
        detalle={errorCarga}
        onReintentar={() => {
          setErrorCarga(null);
          setIntento((n) => n + 1);
        }}
      />
    );
  }
  if (procs === null) {
    return <p className="py-10 text-center text-cacao-soft">Cargando…</p>;
  }
  if (procs.length === 0) {
    return (
      <p className="py-8 text-center font-serif italic text-cacao-soft">
        Todavía no has procesado {insumo.nombre}. Cuando uses el botón{" "}
        <b>Procesar</b>, aquí verás cuánto metiste, cuánto te quedó y cuánto se
        perdió cada vez.
      </p>
    );
  }

  // Aviso de arriba, tipo casillas de tabla: "lo usual" vs "lo que está
  // pasando" (resaltado), en gramos además del %. Usa la última producción
  // (puntual) o el promedio de las últimas (deriva).
  const alerta = evaluacion?.puntual ?? evaluacion?.deriva ?? null;
  const comparacion =
    alerta && estandar != null
      ? (() => {
          const considerados = procs.slice(0, alerta.n);
          const prom = (f: (p: Procesamiento) => number) =>
            considerados.reduce((s, p) => s + f(p), 0) / considerados.length;
          const crudoProm = prom((p) => p.crudo);
          const perdidoReal = prom((p) => Math.max(0, p.crudo - p.procesado));
          const perdidoNormal = (crudoProm * estandar) / 100;
          return {
            n: alerta.n,
            malo: alerta.sentido === "alta",
            actualPorc: alerta.valor,
            perdidoReal,
            perdidoNormal,
            diferencia: Math.abs(perdidoReal - perdidoNormal),
          };
        })()
      : null;

  return (
    <div className="space-y-5">
      {/* Comparación "lo usual" vs "lo que pasó", resaltando el que se salió */}
      {comparacion ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-x-4 border-y border-marfil">
            <div className="py-3">
              <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                Lo usual
              </div>
              <div className="mt-1 font-cinzel text-lg text-cacao tabular-nums">
                {displayCantidad(comparacion.perdidoNormal, u)}
              </div>
              <div className="text-[11px] text-cacao-mute">{estandar}% de merma</div>
            </div>
            <div className="py-3">
              <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                {comparacion.n === 1 ? "Esta vez" : `Últimas ${comparacion.n}`}
              </div>
              <div
                className={`mt-1 font-cinzel text-lg tabular-nums ${
                  comparacion.malo ? "text-[#7A2419]" : "text-oliva"
                }`}
              >
                {displayCantidad(comparacion.perdidoReal, u)}
              </div>
              <div
                className={`text-[11px] ${
                  comparacion.malo ? "text-[#7A2419]" : "text-oliva"
                }`}
              >
                {comparacion.actualPorc.toFixed(0)}% de merma
              </div>
            </div>
          </div>
          <p className="text-[12px] text-cacao-soft">
            {comparacion.diferencia > 0 ? (
              <>
                Son{" "}
                <b className={comparacion.malo ? "text-[#7A2419]" : "text-oliva"}>
                  {displayCantidad(comparacion.diferencia, u)}
                </b>{" "}
                de {comparacion.malo ? "más" : "menos"} de lo usual.{" "}
              </>
            ) : null}
            {comparacion.malo
              ? comparacion.n === 1
                ? "Revisa si fue algo de ese día o si conviene ajustar."
                : "El proceso viene perdiendo de más; conviene revisarlo."
              : "Rindió mejor de lo esperado."}
          </p>
        </div>
      ) : null}

      {/* Cada procesamiento, en palabras (sin repetir la comparación: eso ya
          lo responde el cuadro de arriba). */}
      <ul className="space-y-3">
        {procs.map((p) => {
          const merma = Math.max(0, p.crudo - p.procesado);
          return (
            <li
              key={p.id}
              className="rounded-xl bg-white px-4 py-3 ring-1 ring-marfil"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium capitalize text-cacao">
                  {fFecha(p.fecha)}
                </span>
                <span className="text-sm tabular-nums text-cacao-soft">
                  se perdió {p.mermaPorc.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 text-sm text-cacao">
                Metiste <b>{displayCantidad(p.crudo, u)}</b> → te quedaron{" "}
                <b>{displayCantidad(p.procesado, u)}</b>
              </div>
              <div className="mt-0.5 text-[12px] text-cacao-soft">
                Se perdieron {displayCantidad(merma, u)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
