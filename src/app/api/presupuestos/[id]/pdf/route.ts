import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PresupuestoPDF } from "@/lib/pdf/PresupuestoPDF";
import type {
  Presupuesto,
  PresupuestoItem,
  EstadoPresupuesto,
  CategoriaServicio,
  UnidadServicio,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PresupuestoRow = {
  id: string;
  numero: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_rif: string | null;
  evento_nombre: string;
  evento_fecha: string | null;
  evento_hora: string | null;
  cantidad_personas: number | null;
  montaje_fecha: string | null;
  montaje_hora: string | null;
  desmontaje_fecha: string | null;
  desmontaje_hora: string | null;
  notas: string | null;
  validez_dias: number;
  descuento: number | string;
  estado: string;
  subtotal: number | string;
  total: number | string;
  evento_id: string | null;
  created_at: string;
};

type ItemRow = {
  id: string;
  service_id: string | null;
  nombre: string;
  categoria: string | null;
  unidad: string;
  cantidad: number | string;
  precio_unitario: number | string;
  subtotal: number | string;
  orden: number;
};

function rowToItem(r: ItemRow): PresupuestoItem {
  return {
    id: r.id,
    serviceId: r.service_id ?? undefined,
    nombre: r.nombre,
    categoria: (r.categoria as CategoriaServicio) ?? undefined,
    unidad: r.unidad as UnidadServicio,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    subtotal: Number(r.subtotal),
    orden: r.orden,
  };
}

function rowToPresupuesto(
  r: PresupuestoRow,
  items: PresupuestoItem[],
): Presupuesto {
  return {
    id: r.id,
    numero: r.numero,
    clienteNombre: r.cliente_nombre,
    clienteTelefono: r.cliente_telefono ?? undefined,
    clienteEmail: r.cliente_email ?? undefined,
    clienteRif: r.cliente_rif ?? undefined,
    eventoNombre: r.evento_nombre,
    eventoFecha: r.evento_fecha ?? undefined,
    eventoHora: r.evento_hora ?? undefined,
    cantidadPersonas: r.cantidad_personas ?? undefined,
    montajeFecha: r.montaje_fecha ?? undefined,
    montajeHora: r.montaje_hora ?? undefined,
    desmontajeFecha: r.desmontaje_fecha ?? undefined,
    desmontajeHora: r.desmontaje_hora ?? undefined,
    notas: r.notas ?? undefined,
    validezDias: r.validez_dias,
    descuento: Number(r.descuento),
    estado: r.estado as EstadoPresupuesto,
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    eventoId: r.evento_id ?? undefined,
    items,
    createdAt: r.created_at,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const modoRaw = url.searchParams.get("modo");
    const modo: "resumido" | "detallado" =
      modoRaw === "detallado" ? "detallado" : "resumido";

    const sb = await createSupabaseServerClient();
    const { data: userData } = await sb.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pData, error: pErr } = await sb
      .from("presupuestos")
      .select("*")
      .eq("id", id)
      .single();
    if (pErr || !pData) {
      console.error("[pdf] presupuesto fetch error:", pErr);
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const { data: iData, error: iErr } = await sb
      .from("presupuesto_items")
      .select("*")
      .eq("presupuesto_id", id)
      .order("orden", { ascending: true });
    if (iErr) {
      console.error("[pdf] items fetch error:", iErr);
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }
    const items = (iData as ItemRow[]).map(rowToItem);
    const presupuesto = rowToPresupuesto(pData as PresupuestoRow, items);

    // Cargar logo PNG como data URI
    let logoSrc = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "logo-512.png");
      const logoBuf = readFileSync(logoPath);
      logoSrc = `data:image/png;base64,${logoBuf.toString("base64")}`;
    } catch (e) {
      console.warn("[pdf] no se pudo cargar logo:", e);
      // 1x1 PNG transparente como fallback
      logoSrc =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
    }

    const element = PresupuestoPDF({ presupuesto, logoSrc, modo });
    const buffer = await renderToBuffer(element);

    const numeroSafe =
      presupuesto.numero.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") ||
      "presupuesto";
    const filename = `${numeroSafe}-${modo}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[pdf] render error:", err);
    return NextResponse.json(
      {
        error: "PDF generation failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
