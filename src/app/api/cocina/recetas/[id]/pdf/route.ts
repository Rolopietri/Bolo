import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RecetaPDF } from "@/lib/pdf/RecetaPDF";
import type {
  Receta,
  RecetaIngrediente,
  Seccion,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecetaRow = {
  id: string;
  nombre: string;
  seccion: string;
  categoria: string | null;
  perfil: string | null;
  porciones: number;
  tiempo_prep_min: number | null;
  tiempo_coccion_min: number | null;
  temperatura: string | null;
  procedimiento: string | null;
  presentacion: string | null;
  notas_chef: string | null;
  variaciones: string | null;
  responsable: string | null;
  foto_url: string | null;
  precio_sugerido_usd: number | string | null;
  es_subreceta: boolean | null;
  rendimiento: number | string | null;
  rendimiento_unidad: string | null;
  activo: boolean;
  created_at: string;
};

type IngRow = {
  id: string;
  insumo_id: string | null;
  subreceta_id: string | null;
  nombre: string;
  cantidad: number | string;
  unidad: string;
  observaciones: string | null;
  orden: number;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const sb = await createSupabaseServerClient();
    const { data: userData } = await sb.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: r, error: rErr } = await sb
      .from("recetas")
      .select("*")
      .eq("id", id)
      .single();
    if (rErr || !r) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    const { data: ingsData, error: iErr } = await sb
      .from("receta_ingredientes")
      .select("*")
      .eq("receta_id", id)
      .order("orden");
    if (iErr) {
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }

    const ings: RecetaIngrediente[] = (ingsData as IngRow[]).map((x) => ({
      id: x.id,
      insumoId: x.insumo_id ?? undefined,
      subrecetaId: x.subreceta_id ?? undefined,
      nombre: x.nombre,
      cantidad: Number(x.cantidad),
      unidad: x.unidad,
      observaciones: x.observaciones ?? undefined,
      orden: x.orden,
    }));

    const rr = r as RecetaRow;
    const receta: Receta = {
      id: rr.id,
      nombre: rr.nombre,
      seccion: rr.seccion as Seccion,
      categoria: rr.categoria ?? undefined,
      perfil: rr.perfil ?? undefined,
      porciones: rr.porciones,
      tiempoPrepMin: rr.tiempo_prep_min ?? undefined,
      tiempoCoccionMin: rr.tiempo_coccion_min ?? undefined,
      temperatura: rr.temperatura ?? undefined,
      procedimiento: rr.procedimiento ?? undefined,
      presentacion: rr.presentacion ?? undefined,
      notasChef: rr.notas_chef ?? undefined,
      variaciones: rr.variaciones ?? undefined,
      responsable: rr.responsable ?? undefined,
      fotoUrl: rr.foto_url ?? undefined,
      precioSugeridoUsd:
        rr.precio_sugerido_usd === null
          ? undefined
          : Number(rr.precio_sugerido_usd),
      esSubreceta: rr.es_subreceta ?? false,
      rendimiento:
        rr.rendimiento === null ? undefined : Number(rr.rendimiento),
      rendimientoUnidad: rr.rendimiento_unidad ?? undefined,
      activo: rr.activo,
      ingredientes: ings,
      createdAt: rr.created_at,
    };

    let logoSrc = "";
    try {
      const logoPath = path.join(process.cwd(), "public", "logo-512.png");
      const logoBuf = readFileSync(logoPath);
      logoSrc = `data:image/png;base64,${logoBuf.toString("base64")}`;
    } catch {
      logoSrc =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";
    }

    // Foto del plato: la bajamos en el servidor y la embebemos como data URI.
    // Así el render del PDF no depende de que react-pdf pueda hacer fetch, y si
    // la imagen falla, el PDF igual se genera (solo sin foto).
    let fotoSrc: string | undefined;
    if (receta.fotoUrl && /^https?:\/\//i.test(receta.fotoUrl)) {
      try {
        const resp = await fetch(receta.fotoUrl);
        if (resp.ok) {
          const arrBuf = await resp.arrayBuffer();
          const ct = resp.headers.get("content-type") || "image/jpeg";
          fotoSrc = `data:${ct};base64,${Buffer.from(arrBuf).toString("base64")}`;
        }
      } catch {
        fotoSrc = undefined;
      }
    }

    const buffer = await renderToBuffer(RecetaPDF({ receta, logoSrc, fotoSrc }));
    const filename = `receta-${receta.nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
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
    console.error("[receta-pdf] error:", err);
    return NextResponse.json(
      {
        error: "PDF generation failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
