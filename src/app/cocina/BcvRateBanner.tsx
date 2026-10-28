"use client";

import { useEffect, useState } from "react";
import { CalculatorIcon, ChevronIcon } from "@/components/icons";
import { getTasaBcvActual } from "@/lib/data/cocina";
import { extractError } from "@/lib/data/error";
import type { TasaBcv } from "@/lib/types";
import {
  bsDesdeUsd,
  cotizacionDe,
  fechaHoyCaracas,
  fechaTasaLegible,
  formatoMonto,
  formatoTasa,
  parseMonto,
  seleccionUsable,
  tasaPersonalizada,
  usdDesdeBs,
  valorDeTasa,
  type IdTasa,
} from "./_tasa";

const CLAVE_SEL = "bolo.hoy.tasa";
const CLAVE_CUSTOM = "bolo.hoy.tasaPersonalizada";

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
  const [preferida, setPreferida] = useState<IdTasa>("bcv");
  const [customTexto, setCustomTexto] = useState("");
  const [prefsListas, setPrefsListas] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);

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

  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_SEL);
      const custom = localStorage.getItem(CLAVE_CUSTOM);
      if (
        guardada === "bcv" ||
        guardada === "euro" ||
        guardada === "promedio" ||
        guardada === "personalizada"
      ) {
        // Restaura la elección de la sesión. No hay de dónde leerla en el render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPreferida(guardada);
      }
      if (custom) setCustomTexto(custom);
    } catch {
      // Sin almacenamiento: la sesión sigue en memoria.
    }
    setPrefsListas(true);
  }, []);

  useEffect(() => {
    if (!prefsListas) return;
    try {
      localStorage.setItem(CLAVE_SEL, preferida);
      localStorage.setItem(CLAVE_CUSTOM, customTexto);
    } catch {
      // Si el navegador bloquea el almacenamiento, no se pierde la pantalla.
    }
  }, [prefsListas, preferida, customTexto]);

  async function reintentar() {
    setEstado("cargando");
    setError(null);
    setNota(null);
    await cargar(true);
  }

  const cotizacion = cotizacionDe(tasa);
  const personalizada = tasaPersonalizada(customTexto);
  const activa = seleccionUsable(preferida, cotizacion, personalizada);
  const valor = valorDeTasa(activa, cotizacion, personalizada);
  const meta = META_TASA[activa];

  return (
    <div className="grid items-start gap-3 md:grid-cols-2">
      <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5" aria-label="Tasa de cambio">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-[11px] tracking-[0.3em] text-cacao-mute">Tasa de cambio</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-expanded={listaAbierta}
              onClick={() => setListaAbierta((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full bg-naranja-soft/80 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-terracotta hover:bg-naranja-soft"
            >
              Tasas
              <ChevronIcon className={`size-4 transition ${listaAbierta ? "-rotate-90" : "rotate-90"}`} />
            </button>
            <button
              type="button"
              onClick={reintentar}
              disabled={estado === "cargando"}
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao disabled:opacity-50"
            >
              {estado === "cargando" ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </div>

        {valor != null && valor > 0 ? (
          <div className="mt-2">
            <p className="font-cinzel text-3xl leading-none text-cacao">
              Bs {formatoTasa(valor)}
              <span className="ml-2 font-sans text-sm font-semibold text-cacao-soft">/ {meta.unidad}</span>
            </p>
            <p className="mt-2 text-sm text-cacao-soft">
              {meta.nombre} · En calculadora
              {cotizacion ? ` · ${fechaTasaLegible(cotizacion.fecha)}` : ""}
            </p>
          </div>
        ) : estado === "cargando" ? (
          <p className="mt-3 text-sm text-cacao-soft">Buscando las tasas…</p>
        ) : estado === "error" && !cotizacion ? (
          <div className="mt-3">
            <p className="text-sm text-[#7A2419]">
              No se pudieron consultar las tasas.{" "}
              <button type="button" onClick={reintentar} className="underline hover:text-cacao">
                Reintentar
              </button>
            </p>
            {error ? (
              <p className="mt-1 text-xs text-cacao-mute break-words">{detalleTasa(error)}</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-cacao">
            {activa === "personalizada"
              ? "Escribe tu tasa en Tasas."
              : "Todavía no hay una tasa para mostrar."}
          </p>
        )}

        {listaAbierta ? (
          <ul className="mt-4 space-y-2">
          <FilaTasa
            nombre="Dólar BCV"
            nota="Oficial"
            valor={cotizacion?.bcv ?? null}
            activa={activa === "bcv"}
            onElegir={() => setPreferida("bcv")}
          />
          <FilaTasa
            nombre="Euro"
            nota="Oficial"
            valor={cotizacion?.euro ?? null}
            activa={activa === "euro"}
            onElegir={() => setPreferida("euro")}
          />
          <FilaTasa
            nombre="Promedio"
            nota="Paralelo"
            valor={cotizacion?.promedio ?? null}
            activa={activa === "promedio"}
            onElegir={() => setPreferida("promedio")}
          />
          <FilaTasa nombre="USDT" nota="No viene en esta consulta" valor={null} activa={false} />
          <li
            className={`rounded-xl px-3 py-2.5 ring-1 ${
              activa === "personalizada" ? "bg-naranja-soft/70 ring-terracotta" : "bg-white ring-marfil"
            }`}
          >
            <button
              type="button"
              onClick={() => setPreferida("personalizada")}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block font-medium text-cacao">Personalizada</span>
                <span className="block text-xs text-cacao-soft">Bolívares por dólar</span>
              </span>
              {activa === "personalizada" ? <PastillaEnCalculadora /> : null}
            </button>
            <label className="mt-2 block">
              <span className="sr-only">Tasa personalizada en bolívares por dólar</span>
              <input
                inputMode="decimal"
                value={customTexto}
                placeholder="Ej. 742"
                onFocus={() => setPreferida("personalizada")}
                onChange={(e) => {
                  setCustomTexto(e.target.value);
                  setPreferida("personalizada");
                }}
                className="w-full rounded-lg border border-marfil bg-white px-3 py-2 text-sm text-cacao outline-none focus:border-terracotta"
              />
            </label>
          </li>
          </ul>
        ) : null}

        {listaAbierta ? (
          <p className="mt-3 text-xs text-cacao-mute">
            La brecha con USDT no se calcula: esa tasa no está en la consulta del BCV ni del paralelo.
          </p>
        ) : null}
        {nota ? <p className="mt-2 text-xs text-cacao-soft">{nota}</p> : null}
      </section>

      <CalculadoraTasa
        nombre={meta.nombre}
        unidad={meta.unidad}
        por={meta.por}
        tasa={valor}
      />
    </div>
  );
}

const META_TASA: Record<IdTasa, { nombre: string; unidad: string; por: string }> = {
  bcv: { nombre: "Dólar BCV", unidad: "USD", por: "dólar" },
  euro: { nombre: "Euro", unidad: "EUR", por: "euro" },
  promedio: { nombre: "Promedio", unidad: "USD", por: "dólar" },
  usdt: { nombre: "USDT", unidad: "USDT", por: "USDT" },
  personalizada: { nombre: "Personalizada", unidad: "USD", por: "dólar" },
};

function PastillaEnCalculadora() {
  return (
    <span className="shrink-0 rounded-full bg-terracotta px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">
      En calculadora
    </span>
  );
}

function FilaTasa({
  nombre,
  nota,
  valor,
  activa,
  onElegir,
}: {
  nombre: string;
  nota: string;
  valor: number | null;
  activa: boolean;
  onElegir?: () => void;
}) {
  const disponible = valor != null && valor > 0;
  const cuerpo = (
    <>
      <span className="min-w-0">
        <span className="block font-medium text-cacao">{nombre}</span>
        <span className="block text-xs text-cacao-soft">{nota}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {activa ? <PastillaEnCalculadora /> : null}
        <span className={`text-sm font-semibold ${disponible ? "text-cacao" : "text-cacao-mute"}`}>
          {disponible ? `Bs ${formatoTasa(valor)}` : "Sin dato"}
        </span>
      </span>
    </>
  );
  return (
    <li>
      {disponible && onElegir ? (
        <button
          type="button"
          onClick={onElegir}
          aria-pressed={activa}
          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ${
            activa ? "bg-naranja-soft/70 ring-terracotta" : "bg-white ring-marfil hover:ring-terracotta"
          }`}
        >
          {cuerpo}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-marfil-light/60 px-3 py-2.5 ring-1 ring-marfil">
          {cuerpo}
        </div>
      )}
    </li>
  );
}

function CalculadoraTasa({
  nombre,
  unidad,
  por,
  tasa,
}: {
  nombre: string;
  unidad: string;
  por: string;
  tasa: number | null;
}) {
  const [texto, setTexto] = useState("");
  const [lado, setLado] = useState<"unidad" | "bs">("unidad");
  const lista = tasa != null && tasa > 0;
  const monto = parseMonto(texto);
  const convertido =
    lista && tasa != null && monto != null
      ? lado === "unidad"
        ? formatoMonto(bsDesdeUsd(monto, tasa))
        : formatoMonto(usdDesdeBs(monto, tasa))
      : "";
  const unidadValor = lado === "unidad" ? texto : convertido;
  const bs = lado === "bs" ? texto : convertido;

  return (
    <section className="rounded-2xl bg-marfil-soft p-5 ring-1 ring-marfil" aria-label="Calculadora de bolívares">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-white text-terracotta ring-1 ring-marfil">
          <CalculatorIcon className="size-4" />
        </span>
        <p className="font-display text-[11px] tracking-[0.3em] text-cacao-mute">Calculadora</p>
      </div>
      <p className="mt-2 text-sm text-cacao">
        {lista && tasa != null
          ? `En calculadora: ${nombre}. Bs ${formatoTasa(tasa)} por ${por}.`
          : activaVacia(nombre)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-cacao-mute">{unidad}</span>
          <input
            inputMode="decimal"
            value={unidadValor}
            disabled={!lista}
            placeholder="0"
            onChange={(e) => {
              setLado("unidad");
              setTexto(e.target.value);
            }}
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
            onChange={(e) => {
              setLado("bs");
              setTexto(e.target.value);
            }}
            className="mt-1 w-full rounded-lg border border-marfil bg-white px-3 py-2 text-sm text-cacao outline-none focus:border-terracotta disabled:bg-marfil-light disabled:text-cacao-mute"
          />
        </label>
      </div>
    </section>
  );
}

function activaVacia(nombre: string): string {
  if (nombre === "Personalizada") return "Escribe tu tasa en bolívares por dólar.";
  return "Elige una tasa con dato para convertir.";
}
