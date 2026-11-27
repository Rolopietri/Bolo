"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  esFaltaTablaJornada,
  fechaCivilCaracas,
  fijarTasaPropia,
  pedirResumenJornadaPendiente,
  revisarJornadaCocina,
  type EstadoJornadaCocina,
  type TasaJornada,
} from "@/lib/data/jornada-cocina";

type Ctx = {
  listo: boolean;
  fecha: string;
  estado: EstadoJornadaCocina | null;
  tasa: TasaJornada | null;
  recargar: () => Promise<EstadoJornadaCocina | null>;
  fijarPropia: (valor: number) => Promise<{ ok: boolean; error?: string }>;
};

const JornadaCtx = createContext<Ctx | null>(null);

function tasaDe(e: EstadoJornadaCocina | null): TasaJornada | null {
  if (!e) return null;
  return {
    jornadaId: e.jornadaId,
    fecha: e.fecha,
    tipo: e.tasaTipo,
    valor: e.tasaValor,
    tasaFecha: e.tasaFecha,
  };
}

export function JornadaProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoJornadaCocina | null>(null);
  const [listo, setListo] = useState(false);
  const [fecha, setFecha] = useState(fechaCivilCaracas);
  const enviados = useRef(new Set<string>());

  const recargar = useCallback(async () => {
    try {
      const e = await revisarJornadaCocina();
      setEstado(e);
      if (e?.fecha) setFecha(String(e.fecha).slice(0, 10));
      if (e?.cerroJornadaId && !enviados.current.has(e.cerroJornadaId)) {
        enviados.current.add(e.cerroJornadaId);
        void pedirResumenJornadaPendiente(e.cerroJornadaId);
      }
      return e;
    } catch (err) {
      if (!esFaltaTablaJornada(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/session|jwt|not authenticated|api key|supabaseurl/i.test(msg)) {
          /* se deja el fallback civil */
        }
      }
      return null;
    } finally {
      setListo(true);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const fijarPropia = useCallback(
    async (valor: number) => {
      const r = await fijarTasaPropia(valor);
      if (r.ok) await recargar();
      return r;
    },
    [recargar],
  );

  const value = useMemo<Ctx>(
    () => ({
      listo,
      fecha,
      estado,
      tasa: tasaDe(estado),
      recargar,
      fijarPropia,
    }),
    [listo, fecha, estado, recargar, fijarPropia],
  );

  return <JornadaCtx.Provider value={value}>{children}</JornadaCtx.Provider>;
}

export function useJornada(): Ctx {
  const ctx = useContext(JornadaCtx);
  if (!ctx) {
    // Fuera del provider (p. ej. pruebas): fallback civil, sin romper.
    return {
      listo: true,
      fecha: fechaCivilCaracas(),
      estado: null,
      tasa: null,
      recargar: async () => null,
      fijarPropia: async () => ({ ok: false, error: "sin_provider" }),
    };
  }
  return ctx;
}

/** Fecha de negocio de la jornada abierta (YYYY-MM-DD). */
export function useJornadaHoy(): string {
  return useJornada().fecha;
}

/** Campo de fecha que sigue a la jornada hasta que el usuario lo edita. */
export function useFechaJornadaDefault(inicial?: string | null): [string, (v: string) => void] {
  const { fecha, listo } = useJornada();
  const [valor, setValor] = useState(inicial || fecha);
  const tocado = useRef(!!inicial);
  useEffect(() => {
    if (!tocado.current) setValor(fecha);
  }, [fecha, listo]);
  return [
    valor,
    (v: string) => {
      tocado.current = true;
      setValor(v);
    },
  ];
}

export function useTasaJornada(): TasaJornada | null {
  return useJornada().tasa;
}
