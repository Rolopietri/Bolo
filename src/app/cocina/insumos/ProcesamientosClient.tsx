"use client";

// Procesamientos de un insumo, contados como en papel (Fase E). Cada vez que se
// procesa algo (crudo → listo para vender), una parte se pierde: esa es la
// MERMA. Esta vista no usa gráficos: muestra, en palabras, cuánto metiste,
// cuánto te quedó y cuánto se perdió cada vez, y avisa cuando una producción se
// salió de lo normal. Solo aparecen los días en que sí procesaste.

import { useEffect, useMemo, useState } from "react";
import type { Insumo } from "@/lib/types";
import { listProcesamientos, type Procesamiento } from "@/lib/data/procesamientos";
import { evaluarMerma, umbralDesviacion } from "@/lib/merma-alertas";
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

  const umbral = estandar != null ? umbralDesviacion(estandar) : 0;

  // Para el aviso de arriba: los gramos de la última producción y cuánto
  // habría sido "lo normal", para que la desviación se vea en gramos, no solo %.
  const ultima = procs[0];
  const perdidoReal = Math.max(0, ultima.crudo - ultima.procesado);
  const perdidoNormal = estandar != null ? (ultima.crudo * estandar) / 100 : null;
  const diferencia =
    perdidoNormal != null ? Math.abs(perdidoReal - perdidoNormal) : null;

  return (
    <div className="space-y-5">
      {/* Explicación llana, como en papel */}
      <p className="text-[13px] leading-relaxed text-cacao-soft">
        Cada vez que procesas {insumo.nombre}, una parte se pierde: eso es la{" "}
        <b>merma</b>.
        {estandar != null ? (
          <>
            {" "}
            En tu casa lo normal es perder <b>{estandar}%</b>.
          </>
        ) : null}{" "}
        Abajo está cada vez que lo procesaste.
      </p>

      {/* Aviso amistoso si algo se salió de lo normal */}
      {evaluacion?.puntual ? (
        <div className="rounded-xl bg-[#F9EBE7] px-4 py-3 text-sm leading-relaxed text-[#7A2419] ring-1 ring-[#E7C9C0]">
          La última vez perdiste <b>{displayCantidad(perdidoReal, u)}</b> (
          {evaluacion.puntual.valor.toFixed(0)}%),{" "}
          {evaluacion.puntual.sentido === "alta" ? "más" : "menos"} de lo normal.
          {perdidoNormal != null ? (
            <>
              {" "}
              Con lo normal ({estandar}%) habrían sido unos{" "}
              <b>{displayCantidad(perdidoNormal, u)}</b>
              {diferencia != null && diferencia > 0 ? (
                <>
                  {" "}
                  — {displayCantidad(diferencia, u)} de{" "}
                  {evaluacion.puntual.sentido === "alta" ? "más" : "menos"}
                </>
              ) : null}
              .
            </>
          ) : null}{" "}
          {evaluacion.puntual.sentido === "alta"
            ? "Revisa si fue algo de ese día o si conviene ajustar."
            : "Rindió mejor de lo esperado."}
        </div>
      ) : evaluacion?.deriva ? (
        <div className="rounded-xl bg-[#F9EBE7] px-4 py-3 text-sm text-[#7A2419] ring-1 ring-[#E7C9C0]">
          Tus últimas producciones vienen perdiendo{" "}
          <b>{evaluacion.deriva.valor.toFixed(0)}%</b> en promedio,{" "}
          {evaluacion.deriva.sentido === "alta" ? "por encima" : "por debajo"} de
          lo normal ({estandar}%).
        </div>
      ) : null}

      {/* Cada procesamiento, en palabras */}
      <ul className="space-y-3">
        {procs.map((p) => {
          const merma = Math.max(0, p.crudo - p.procesado);
          const fueraDeRango =
            estandar != null && Math.abs(p.mermaPorc - estandar) > umbral;
          const alta = estandar != null && p.mermaPorc > estandar;
          return (
            <li
              key={p.id}
              className="rounded-xl bg-white px-4 py-3 ring-1 ring-marfil"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium capitalize text-cacao">
                  {fFecha(p.fecha)}
                </span>
                <span
                  className={`text-sm tabular-nums ${
                    fueraDeRango
                      ? "font-semibold text-[#7A2419]"
                      : "text-cacao-soft"
                  }`}
                >
                  se perdió {p.mermaPorc.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 text-sm text-cacao">
                Metiste <b>{displayCantidad(p.crudo, u)}</b> → te quedaron{" "}
                <b>{displayCantidad(p.procesado, u)}</b>
              </div>
              <div className="mt-0.5 text-[12px] text-cacao-soft">
                Se perdieron {displayCantidad(merma, u)}
                {estandar != null ? (
                  fueraDeRango ? (
                    <span className="text-[#7A2419]">
                      {" "}
                      · {alta ? "más" : "menos"} de lo normal (lo normal es{" "}
                      {estandar}%)
                    </span>
                  ) : (
                    <span> · en línea con lo normal ({estandar}%)</span>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
