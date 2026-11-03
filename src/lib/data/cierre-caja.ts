"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractError } from "@/lib/data/error";
import {
  monedaCanon,
  prepararLineas,
  type LineaMonto,
  type MetodoCaja,
  type MonedaCaja,
} from "@/lib/cierre-caja";

export type CierreCaja = {
  id: string;
  fecha: string;
  nota: string;
  tasaUsdBs: number | null;
  tasaFecha: string | null;
  lineas: LineaMonto[];
  updatedAt: string;
};

export type GuardarCierreInput = {
  fecha: string;
  nota: string;
  tasaUsdBs: number | null;
  tasaFecha: string | null;
  lineas: LineaMonto[];
};

const SELECT =
  "id, fecha, nota, tasa_usd_bs, tasa_fecha, updated_at, cierre_caja_linea(metodo, etiqueta, moneda, monto, monto_usd)";

type LineaRow = {
  metodo: string;
  etiqueta: string | null;
  moneda: string;
  monto: number | string;
  monto_usd: number | string | null;
};

type CierreRow = {
  id: string;
  fecha: string;
  nota: string | null;
  tasa_usd_bs: number | string | null;
  tasa_fecha: string | null;
  updated_at: string;
  cierre_caja_linea: LineaRow[] | null;
};

const METODOS = new Set<MetodoCaja>([
  "efectivo_usd",
  "efectivo_bs",
  "pago_movil",
  "punto",
  "zelle",
  "otro",
]);

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function deFila(r: CierreRow): CierreCaja {
  const lineas: LineaMonto[] = [];
  for (const l of r.cierre_caja_linea ?? []) {
    if (!METODOS.has(l.metodo as MetodoCaja)) continue;
    const metodo = l.metodo as MetodoCaja;
    const monto = num(l.monto);
    if (monto == null || monto <= 0) continue;
    const moneda: MonedaCaja = l.moneda === "USD" ? "USD" : "Bs";
    lineas.push({
      metodo,
      moneda: monedaCanon(metodo, moneda),
      monto,
      etiqueta: l.etiqueta?.trim() || undefined,
    });
  }
  const tasa = num(r.tasa_usd_bs);
  return {
    id: r.id,
    fecha: String(r.fecha).slice(0, 10),
    nota: r.nota ?? "",
    tasaUsdBs: tasa != null && tasa > 0 ? tasa : null,
    tasaFecha: r.tasa_fecha ? String(r.tasa_fecha).slice(0, 10) : null,
    lineas,
    updatedAt: r.updated_at,
  };
}

export function esFaltaTablaCierre(e: unknown): boolean {
  const code =
    typeof e === "object" && e && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code
      : "";
  const msg = extractError(e).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("cierre_caja") ||
    msg.includes("schema cache")
  );
}

export const AVISO_MIGRACION_CIERRE =
  "Falta aplicar la migración supabase/cierre-caja.sql. Puedes hacer la cuenta en esta pantalla, pero todavía no se guarda.";

export async function leerCierre(fecha: string): Promise<CierreCaja | null> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("cierre_caja")
    .select(SELECT)
    .eq("fecha", fecha.slice(0, 10))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return deFila(data as CierreRow);
}

export async function listCierresRango(desde: string, hasta: string): Promise<CierreCaja[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("cierre_caja")
    .select(SELECT)
    .gte("fecha", desde.slice(0, 10))
    .lte("fecha", hasta.slice(0, 10))
    .order("fecha", { ascending: true });
  if (error) throw error;
  return ((data as CierreRow[]) ?? []).map(deFila);
}

export async function listCierres(limite = 400): Promise<CierreCaja[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("cierre_caja")
    .select(SELECT)
    .order("fecha", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return ((data as CierreRow[]) ?? []).map(deFila);
}

export async function guardarCierre(input: GuardarCierreInput): Promise<CierreCaja> {
  const sb = createSupabaseBrowserClient();
  const fecha = input.fecha.slice(0, 10);
  const nota = input.nota.trim().slice(0, 500);
  const tasa = input.tasaUsdBs != null && input.tasaUsdBs > 0 ? input.tasaUsdBs : null;
  const lineas = prepararLineas(input.lineas, tasa);
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id ?? null;

  const { data: ya, error: errorYa } = await sb
    .from("cierre_caja")
    .select("id")
    .eq("fecha", fecha)
    .maybeSingle();
  if (errorYa) throw errorYa;

  let id = (ya as { id: string } | null)?.id ?? null;
  if (id) {
    const { error } = await sb
      .from("cierre_caja")
      .update({
        nota: nota || null,
        tasa_usd_bs: tasa,
        tasa_fecha: tasa && input.tasaFecha ? input.tasaFecha.slice(0, 10) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await sb
      .from("cierre_caja")
      .insert({
        fecha,
        nota: nota || null,
        tasa_usd_bs: tasa,
        tasa_fecha: tasa && input.tasaFecha ? input.tasaFecha.slice(0, 10) : null,
        created_by: uid,
      })
      .select("id")
      .single();
    if (error) throw error;
    id = (data as { id: string }).id;
  }

  if (lineas.length > 0) {
    const { error } = await sb.from("cierre_caja_linea").upsert(
      lineas.map((l) => ({
        cierre_id: id,
        metodo: l.metodo,
        etiqueta: l.etiqueta ?? null,
        moneda: l.moneda,
        monto: l.monto,
        monto_usd: l.montoUsd,
      })),
      { onConflict: "cierre_id,metodo" },
    );
    if (error) throw error;
  }

  const { data: actuales, error: errorActuales } = await sb
    .from("cierre_caja_linea")
    .select("id, metodo")
    .eq("cierre_id", id);
  if (errorActuales) throw errorActuales;
  const quedan = new Set(lineas.map((l) => l.metodo));
  const sobran = ((actuales as { id: string; metodo: string }[]) ?? [])
    .filter((r) => !quedan.has(r.metodo as MetodoCaja))
    .map((r) => r.id);
  if (sobran.length > 0) {
    const { error } = await sb.from("cierre_caja_linea").delete().in("id", sobran);
    if (error) throw error;
  }

  const guardado = await leerCierre(fecha);
  if (!guardado) throw new Error("El cierre se guardó pero no se pudo volver a leer.");
  return guardado;
}

export async function borrarCierre(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("cierre_caja").delete().eq("id", id);
  if (error) throw error;
}
