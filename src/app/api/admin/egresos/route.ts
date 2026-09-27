import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function numero(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}
// Equivalente en USD según moneda y tasa (misma regla que el cliente).
function equivUSD(monto: number | null, moneda: string | null, tasa: number | null): number | null {
  if (monto == null) return null;
  if (moneda === "USD") return monto;
  if (moneda === "Bs") return tasa && tasa > 0 ? monto / tasa : null;
  if (moneda === "EUR") return tasa && tasa > 0 ? monto * tasa : null;
  return null;
}

function fila(e: Record<string, unknown>): Record<string, unknown> {
  const monto = numero(e.monto);
  const moneda = texto(e.moneda);
  const tasa = numero(e.tasa);
  const usd = equivUSD(monto, moneda, tasa);
  // pagada: por defecto true (gasto real inmediato). false = cuenta por pagar.
  const pagada = e.pagada === false ? false : true;
  const fechaPago = pagada ? (texto(e.fecha_pago) ?? texto(e.fecha)) : null;
  // Flete (misma moneda): ya viene SUMADO en `monto`; se guarda su desglose.
  const flete = numero(e.flete);
  return {
    fecha: texto(e.fecha) ?? undefined,
    concepto: texto(e.concepto),
    categoria_id: texto(e.categoria_id),
    categoria_nombre: texto(e.categoria_nombre),
    clasificacion: e.clasificacion === "fija" ? "fija" : e.clasificacion === "variable" ? "variable" : null,
    proveedor_id: texto(e.proveedor_id),
    proveedor_nombre: texto(e.proveedor_nombre),
    monto,
    moneda,
    tasa,
    monto_usd: usd == null ? null : Math.round(usd * 100) / 100,
    metodo: texto(e.metodo),
    factura: texto(e.factura),
    nota: texto(e.nota),
    solicitud_linea_id: texto(e.solicitud_linea_id),
    pagada,
    fecha_pago: fechaPago,
    flete: flete != null && flete > 0 ? Math.round(flete * 100) / 100 : null,
  };
}

// GET ?mes=YYYY-MM → egresos de ese mes (o todos si no se pasa mes).
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const params = new URL(req.url).searchParams;

  // ?pendientes=1 → cuentas por pagar (pagada=false), sin filtro de mes (deudas
  // vigentes). Resiliente si la columna aún no existe (migración pendiente).
  if (params.get("pendientes") === "1") {
    const { data, error } = await sb.from("admin_egreso").select("*").eq("pagada", false).order("fecha", { ascending: true });
    if (error) return NextResponse.json({ egresos: [] });
    return NextResponse.json({ egresos: data ?? [] });
  }

  // ?mesPago=YYYY-MM → CAJA REAL: egresos PAGADOS que cuentan en ese mes por su
  // fecha de PAGO (fecha_pago), o por su fecha si no tienen fecha_pago (dato
  // viejo/pagado al registrar). NO muta nada: la `fecha` devuelta se ajusta a la
  // fecha efectiva de pago solo en la respuesta, para reflejarlo en ese mes.
  const mesPago = params.get("mesPago");
  if (mesPago && /^\d{4}-\d{2}$/.test(mesPago)) {
    const [y, m] = mesPago.split("-").map((x) => parseInt(x, 10));
    const desde = `${mesPago}-01`;
    const hasta = `${mesPago}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    // Dos consultas simples (robustas): pagados con fecha_pago en el mes, y los
    // pagados sin fecha_pago (dato viejo/inmediato) por su fecha en el mes.
    const [porPago, sinPago] = await Promise.all([
      sb.from("admin_egreso").select("*").neq("pagada", false).gte("fecha_pago", desde).lte("fecha_pago", hasta),
      sb.from("admin_egreso").select("*").neq("pagada", false).is("fecha_pago", null).gte("fecha", desde).lte("fecha", hasta),
    ]);
    // Si la columna pagada/fecha_pago no existe aún, cae al filtro por fecha.
    if (porPago.error) {
      const alt = await sb.from("admin_egreso").select("*").gte("fecha", desde).lte("fecha", hasta);
      return NextResponse.json({ egresos: alt.data ?? [] });
    }
    const seen = new Set<string>();
    const egresos = [...(porPago.data ?? []), ...(sinPago.error ? [] : sinPago.data ?? [])]
      .filter((e) => { const id = (e as { id?: string }).id ?? ""; if (seen.has(id)) return false; seen.add(id); return true; })
      .map((e) => { const r = e as Record<string, unknown>; return { ...r, fecha: (r.fecha_pago as string) ?? r.fecha }; })
      .sort((a2, b2) => String((b2 as { fecha?: string }).fecha ?? "").localeCompare(String((a2 as { fecha?: string }).fecha ?? "")));
    return NextResponse.json({ egresos });
  }

  let q = sb.from("admin_egreso").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false });
  const mes = new URL(req.url).searchParams.get("mes"); // "2026-08"
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map((x) => parseInt(x, 10));
    const desde = `${mes}-01`;
    const finMes = new Date(Date.UTC(y, m, 0)).getUTCDate(); // último día del mes
    const hasta = `${mes}-${String(finMes).padStart(2, "0")}`;
    q = q.gte("fecha", desde).lte("fecha", hasta);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ egresos: data ?? [] });
}

// POST → un egreso {egreso:{...}} o varios {egresos:[...]} (confirmar solicitud).
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lista = Array.isArray(b.egresos)
    ? (b.egresos as Record<string, unknown>[])
    : b.egreso && typeof b.egreso === "object"
      ? [b.egreso as Record<string, unknown>]
      : [];
  if (lista.length === 0) return NextResponse.json({ error: "No hay egresos que registrar." }, { status: 400 });
  const filas = lista.map(fila);

  // Pago en Bs SIN tasa → se asume la tasa BCV ($) vigente de la fecha del egreso
  // (la más reciente con fecha ≤ la del egreso), y se calcula su equivalente USD.
  for (const fl of filas) {
    if (fl.moneda !== "Bs" || fl.tasa != null || fl.monto == null) continue;
    const fecha = typeof fl.fecha === "string" ? fl.fecha : new Date().toISOString().slice(0, 10);
    const { data: tb } = await sb
      .from("tasa_bcv").select("usd_bs").lte("fecha", fecha)
      .order("fecha", { ascending: false }).limit(1).maybeSingle();
    const usdBs = tb ? Number((tb as { usd_bs: number | null }).usd_bs) : 0;
    if (usdBs > 0) {
      fl.tasa = usdBs;
      fl.monto_usd = Math.round((Number(fl.monto) / usdBs) * 100) / 100;
    }
  }

  const { data, error } = await sb.from("admin_egreso").insert(filas).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ egresos: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = texto(b.id);
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  // Modo "pagar": marca una cuenta por pagar como pagada (caja real) con su fecha
  // de pago y método. Puede además ajustar monto/moneda/tasa (recalcula el USD;
  // Bs sin tasa → BCV del día de pago).
  let cambios: Record<string, unknown>;
  if (b.pagar === true) {
    const fechaPago = texto(b.fecha_pago) ?? new Date().toISOString().slice(0, 10);
    // Caja real: SOLO se guarda la fecha de pago. La fecha del registro NO se toca
    // (mover fechas dañaría el inventario/histórico); el reflejo por mes de pago
    // se hace al leer (modo mesPago), no mutando el dato.
    cambios = { pagada: true, fecha_pago: fechaPago, ...(texto(b.metodo) ? { metodo: texto(b.metodo) } : {}) };
    if (b.monto !== undefined && b.monto !== null && b.monto !== "") {
      const monto = numero(b.monto);
      const moneda = texto(b.moneda);
      let tasa = numero(b.tasa);
      if (moneda === "Bs" && tasa == null && monto != null) {
        const { data: tb } = await sb
          .from("tasa_bcv").select("usd_bs").lte("fecha", fechaPago)
          .order("fecha", { ascending: false }).limit(1).maybeSingle();
        const usdBs = tb ? Number((tb as { usd_bs: number | null }).usd_bs) : 0;
        if (usdBs > 0) tasa = usdBs;
      }
      const usd = equivUSD(monto, moneda, tasa);
      cambios = { ...cambios, monto, moneda, tasa, monto_usd: usd == null ? null : Math.round(usd * 100) / 100 };
    }
  } else if (b.solo_categoria === true) {
    // Modo "solo categoría": reclasificar sin tocar el resto del egreso.
    cambios = {
      categoria_id: texto(b.categoria_id),
      categoria_nombre: texto(b.categoria_nombre),
      clasificacion: b.clasificacion === "fija" ? "fija" : b.clasificacion === "variable" ? "variable" : null,
    };
  } else {
    cambios = fila(b);
  }
  const { data, error } = await sb.from("admin_egreso").update(cambios).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ egreso: data });
}

export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const { error } = await sb.from("admin_egreso").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
