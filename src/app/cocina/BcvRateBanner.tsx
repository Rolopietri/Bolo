"use client";

import { useEffect, useState } from "react";
import { CalculatorIcon } from "@/components/icons";
import { getTasaBcvActual } from "@/lib/data/cocina";
import { extractError } from "@/lib/data/error";
import type { TasaBcv } from "@/lib/types";
import {
  bsDesdeUsd,
  fechaHoyCaracas,
  fechaTasaLegible,
  formatoMonto,
  formatoTasa,
  parseMonto,
  usdDesdeBs,
} from "./_tasa";

type Estado = "cargando" | "listo" | "error";

function detalleTasa(error: string): string {
  if (/url and api key are required|supabaseurl is required|supabasekey is required/i.test(error)) {
    return "Falta la conexión con la base de datos.";
  }
  if (/no se pudo obtener la tasa oficial/i.test(error)) {
    return "No se pudo consultar la tasa oficial del BCV.";
  }
  return error;
}

function tasaDesdeApi(body: {
  fecha?: string;
  usdBs?: number;
  eurBs?: number | null;
  paralelaBs?: number | null;
}): TasaBcv | null {
  if (typeof body.usdBs !== "number" || !(body.usdBs > 0)) return null;
  return {
    fecha: body.fecha || fechaHoyCaracas(),
    usdBs: body.usdBs,
    eurBs: typeof body.eurBs === "number" ? body.eurBs : undefined,
    paralelaBs: typeof body.paralelaBs === "number" ? body.paralelaBs : undefined,
    fuente: "BCV oficial",
  };
}

function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("tiempo")), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Tasa pública de hoy. No depende de que ya esté guardada en la base. */
async function tasaEnVivo(): Promise<TasaBcv | null> {
  const res = await fetch("/api/cron/bcv", { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as {
    fecha?: string;
    usdBs?: number;
    eurBs?: number | null;
    paralelaBs?: number | null;
    error?: string;
  } | null;
  const tasa = body ? tasaDesdeApi(body) : null;
  if (tasa) return tasa;
  throw new Error(body?.error || "No se pudo actualizar la tasa");
}

export function BcvRateBanner() {
  const [tasa, setTasa] = useState<TasaBcv | null>(null);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  async function cargar(forzar: boolean) {
    let guardada: TasaBcv | null = null;
    try {
      guardada = await conTope(getTasaBcvActual(), 8000);
    } catch {
      guardada = null;
    }

    const hoy = fechaHoyCaracas();
    const vigente = !!guardada && guardada.usdBs > 0 && guardada.fecha >= hoy;
    if (vigente && !forzar && guardada) {
      setTasa(guardada);
      setError(null);
      setNota(null);
      setEstado("listo");
      return true;
    }

    try {
      const viva = await tasaEnVivo();
      if (viva) {
        setTasa(viva);
        setError(null);
        setNota(null);
        setEstado("listo");
        return true;
      }
    } catch (e) {
      if (guardada && guardada.usdBs > 0) {
        setTasa(guardada);
        setError(null);
        setNota(`No se pudo actualizar. Se muestra la del ${fechaTasaLegible(guardada.fecha)}.`);
        setEstado("listo");
        return true;
      }
      setTasa(null);
      setNota(null);
      setError(extractError(e, "Error cargando tasa"));
      setEstado("error");
      return false;
    }

    if (guardada && guardada.usdBs > 0) {
      setTasa(guardada);
      setError(null);
      setNota(null);
      setEstado("listo");
      return true;
    }

    setTasa(null);
    setNota(null);
    setError(null);
    setEstado("listo");
    return false;
  }

  useEffect(() => {
    let cancelado = false;
    // Carga inicial al entrar (fetch, no un setState síncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar(false).catch(() => {
      if (!cancelado) setEstado("error");
    });
    return () => {
      cancelado = true;
    };
  }, []);

  async function reintentar() {
    setEstado("cargando");
    setError(null);
    setNota(null);
    await cargar(true);
  }

  return (
    <div className="grid items-stretch gap-3 md:grid-cols-2">
      <section className="rounded-2xl bg-white p-5 ring-1 ring-marfil">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-[11px] tracking-[0.3em] text-cacao-mute">Tasa de cambio</p>
          <button
            type="button"
            onClick={reintentar}
            disabled={estado === "cargando"}
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao disabled:opacity-50"
          >
            {estado === "cargando" ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        {tasa && tasa.usdBs > 0 ? (
          <div className="mt-2">
            <p className="font-cinzel text-3xl leading-none text-cacao">
              Bs {formatoTasa(tasa.usdBs)}
              <span className="ml-2 font-sans text-sm font-semibold text-cacao-soft">/ USD</span>
            </p>
            <p className="mt-2 text-sm text-cacao-soft">
              BCV oficial · {fechaTasaLegible(tasa.fecha)}
            </p>
            {(tasa.eurBs || tasa.paralelaBs) && (
              <p className="mt-1 text-xs text-cacao-mute">
                {tasa.eurBs ? `Euro oficial Bs ${formatoMonto(tasa.eurBs)}` : null}
                {tasa.eurBs && tasa.paralelaBs ? " · " : null}
                {tasa.paralelaBs ? `Paralela Bs ${formatoMonto(tasa.paralelaBs)}` : null}
              </p>
            )}
            {nota && <p className="mt-2 text-xs text-cacao-soft">{nota}</p>}
          </div>
        ) : estado === "cargando" ? (
          <p className="mt-3 text-sm text-cacao-soft">Buscando la tasa del BCV…</p>
        ) : estado === "error" ? (
          <div className="mt-3">
            <p className="text-sm text-[#7A2419]">
              No se pudo consultar la tasa.{" "}
              <button type="button" onClick={reintentar} className="underline hover:text-cacao">
                Reintentar
              </button>
            </p>
            {error && (
              <p className="mt-1 text-xs text-cacao-mute break-words">{detalleTasa(error)}</p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-cacao">Todavía no hay una tasa del BCV.</p>
            <button
              type="button"
              onClick={reintentar}
              className="mt-2 text-sm font-semibold text-terracotta hover:underline"
            >
              Buscar la de hoy
            </button>
          </div>
        )}
      </section>

      <CalculadoraTasa tasaUsdBs={tasa && tasa.usdBs > 0 ? tasa.usdBs : null} />
    </div>
  );
}

function CalculadoraTasa({ tasaUsdBs }: { tasaUsdBs: number | null }) {
  const [texto, setTexto] = useState("");
  const [lado, setLado] = useState<"usd" | "bs">("usd");
  const lista = tasaUsdBs != null && tasaUsdBs > 0;
  const monto = parseMonto(texto);
  const convertido =
    lista && tasaUsdBs != null && monto != null
      ? lado === "usd"
        ? formatoMonto(bsDesdeUsd(monto, tasaUsdBs))
        : formatoMonto(usdDesdeBs(monto, tasaUsdBs))
      : "";
  const usd = lado === "usd" ? texto : convertido;
  const bs = lado === "bs" ? texto : convertido;

  function alEscribirUsd(valor: string) {
    setLado("usd");
    setTexto(valor);
  }

  function alEscribirBs(valor: string) {
    setLado("bs");
    setTexto(valor);
  }

  return (
    <section className="rounded-2xl bg-marfil-soft p-5 ring-1 ring-marfil" aria-label="Calculadora de bolívares">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-white text-terracotta ring-1 ring-marfil">
          <CalculatorIcon className="size-4" />
        </span>
        <p className="font-display text-[11px] tracking-[0.3em] text-cacao-mute">Calculadora</p>
      </div>
      <p className="mt-2 text-sm text-cacao-soft">
        {lista
          ? `Usa la tasa BCV oficial: Bs ${formatoTasa(tasaUsdBs)} por dólar.`
          : "Cuando haya tasa del BCV, convierte aquí."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-cacao-mute">USD</span>
          <input
            inputMode="decimal"
            value={usd}
            disabled={!lista}
            placeholder="0"
            onChange={(e) => alEscribirUsd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-marfil bg-white px-3 py-2 text-sm text-cacao outline-none focus:border-terracotta disabled:bg-marfil-light disabled:text-cacao-mute"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-cacao-mute">Bs</span>
          <input
            inputMode="decimal"
            value={bs}
            disabled={!lista}
            placeholder="0"
            onChange={(e) => alEscribirBs(e.target.value)}
            className="mt-1 w-full rounded-lg border border-marfil bg-white px-3 py-2 text-sm text-cacao outline-none focus:border-terracotta disabled:bg-marfil-light disabled:text-cacao-mute"
          />
        </label>
      </div>
    </section>
  );
}
