import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const mes = new URL(req.url).searchParams.get("mes");
  let q = sb.from("admin_movimiento").select("*").order("fecha", { ascending: false });
  if (mes) q = q.eq("mes", mes);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ movimientos: data });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tipo = b.tipo === "ingreso" ? "ingreso" : b.tipo === "gasto" ? "gasto" : null;
  const fecha = typeof b.fecha === "string" ? b.fecha : "";
  const monto = Number(b.monto_usd);
  const categoria = typeof b.categoria === "string" ? b.categoria.trim() : "";
  if (!tipo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(monto) || monto < 0 || !categoria) {
    return NextResponse.json({ error: "Datos incompletos (tipo, fecha, monto y categoría son obligatorios)." }, { status: 400 });
  }

  const fila = {
    tipo,
    fecha,
    mes: fecha.slice(0, 7),
    monto_usd: monto,
    monto_original: b.monto_original != null && b.monto_original !== "" ? Number(b.monto_original) : null,
    moneda_original: typeof b.moneda_original === "string" && b.moneda_original ? b.moneda_original : null,
    categoria,
    subcategoria: typeof b.subcategoria === "string" && b.subcategoria.trim() ? b.subcategoria.trim() : null,
    proveedor: typeof b.proveedor === "string" && b.proveedor.trim() ? b.proveedor.trim() : null,
    pagado_por: typeof b.pagado_por === "string" && b.pagado_por.trim() ? b.pagado_por.trim() : null,
    descripcion: typeof b.descripcion === "string" && b.descripcion.trim() ? b.descripcion.trim() : null,
    factura_path: typeof b.factura_path === "string" && b.factura_path ? b.factura_path : null,
  };
  const { data, error } = await sb.from("admin_movimiento").insert(fila).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: (data as { id: string }).id });
}

export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const { error } = await sb.from("admin_movimiento").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
