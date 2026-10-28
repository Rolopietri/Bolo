/**
 * Cron diario: trae la tasa oficial BCV (USD y EUR) y la guarda en `tasa_bcv`.
 *
 * Cron config en vercel.json. También se puede llamar manualmente desde el navegador
 * cuando estés logueado (auth via cookie) o desde otro proceso con CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { registrarCorrida } from "@/lib/monitoreo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DolarApiResp = {
  fuente?: string;
  nombre?: string;
  promedio?: number;
  fechaActualizacion?: string;
};

async function fetchOficial(): Promise<number | null> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
      // Sin cache, queremos lo más reciente
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as DolarApiResp;
    return j.promedio ?? null;
  } catch {
    return null;
  }
}

async function fetchEuro(): Promise<number | null> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/euros/oficial", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as DolarApiResp;
    return j.promedio ?? null;
  } catch {
    return null;
  }
}

async function fetchParalela(): Promise<number | null> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares/paralelo", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as DolarApiResp;
    return j.promedio ?? null;
  } catch {
    return null;
  }
}

function todayCaracas(): string {
  // Caracas es UTC-4 sin DST
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const caracas = new Date(utcMs - 4 * 60 * 60_000);
  return caracas.toISOString().slice(0, 10);
}

export async function GET() {
  const inicio = Date.now();
  // Primero la tasa pública. Hoy la muestra aunque la base no esté configurada
  // o el guardado falle: si no, la portada se queda sin número.
  const [usdBs, eurBs, paralelaBs] = await Promise.all([
    fetchOficial(),
    fetchEuro(),
    fetchParalela(),
  ]);

  if (usdBs == null) {
    return NextResponse.json(
      { error: "No se pudo obtener la tasa oficial del BCV" },
      { status: 502 },
    );
  }

  const fecha = todayCaracas();
  const cuerpo = {
    ok: true as const,
    fecha,
    usdBs,
    eurBs,
    paralelaBs,
    guardado: false,
    actualizado: new Date().toISOString(),
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Escribir la tasa con SERVICE-ROLE (clave de servidor, nunca se expone al
  // navegador). Así podemos bloquear la escritura anónima en RLS y evitar que
  // alguien fije una tasa falsa con la anon key pública. Fallback a anon si la
  // service-role aún no está configurada. Este endpoint solo escribe la tasa
  // real de dolarapi, así que llamarlo sin secret es de bajo riesgo.
  const writeKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !writeKey) {
    return NextResponse.json(cuerpo);
  }

  const sb = createClient(url, writeKey, { auth: { persistSession: false } });

  const { error: insErr } = await sb.from("tasa_bcv").upsert(
    {
      fecha,
      usd_bs: usdBs,
      eur_bs: eurBs,
      paralela_bs: paralelaBs,
      fuente: "ve.dolarapi.com",
    },
    { onConflict: "fecha" },
  );

  if (insErr) {
    await registrarCorrida(sb, "bcv", inicio, {
      estado: "error",
      error: insErr.message,
    });
    // 500 para que el cron reintente el guardado, pero con la tasa en el
    // cuerpo: la portada igual puede mostrarla.
    return NextResponse.json(
      { ...cuerpo, error: "No se pudo guardar la tasa" },
      { status: 500 },
    );
  }

  await registrarCorrida(sb, "bcv", inicio, {
    estado: "ok",
    detalle: { fecha, usdBs, eurBs, paralelaBs },
  });

  return NextResponse.json({ ...cuerpo, guardado: true });
}
