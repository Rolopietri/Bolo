import { renderToBuffer } from "@react-pdf/renderer";
import { MenajePDF, type MenajePDFData } from "@/lib/pdf/MenajePDF";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Cuerpo inválido", { status: 400 });
  }

  const b = body as Partial<MenajePDFData>;
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return new Response("Selecciona al menos un ítem.", { status: 400 });
  }

  const data: MenajePDFData = {
    evento: typeof b.evento === "string" ? b.evento : undefined,
    cliente: typeof b.cliente === "string" ? b.cliente : undefined,
    fecha: typeof b.fecha === "string" ? b.fecha : undefined,
    notas: typeof b.notas === "string" ? b.notas : undefined,
    conPrecios: !!b.conPrecios,
    items: b.items.map((it) => ({
      nombre: String(it.nombre ?? ""),
      categoria: String(it.categoria ?? ""),
      cantidad: Number(it.cantidad) || 0,
      disponible: Number(it.disponible) || 0,
      precioUnit:
        it.precioUnit == null || it.precioUnit === undefined
          ? undefined
          : Number(it.precioUnit),
      fotoUrl:
        typeof it.fotoUrl === "string" && it.fotoUrl.trim() !== ""
          ? it.fotoUrl
          : undefined,
    })),
  };

  try {
    const buffer = await renderToBuffer(MenajePDF({ data }));
    const nombreArchivo = `menaje-${(data.evento || "evento")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "evento"}.pdf`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      },
    });
  } catch (e) {
    return new Response(
      `Error generando el PDF: ${e instanceof Error ? e.message : "desconocido"}`,
      { status: 500 },
    );
  }
}
