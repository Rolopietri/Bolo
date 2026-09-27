/**
 * Convierte un Excel de Xetux (.xls / .xlsx) a CSV en el SERVIDOR.
 *
 * El importador de ventas trabaja con CSV; Xetux exporta .xls binario. En vez
 * de pedirle al usuario que convierta el archivo cada vez, sube el Excel aquí y
 * devolvemos el CSV de la primera hoja, listo para el mismo flujo de importe.
 *
 * Se hace en el servidor a propósito: la librería de Excel queda fuera del
 * bundle del navegador y aislada en la función serverless.
 */
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "Archivo vacío." }, { status: 400 });
    }

    const wb = XLSX.read(buf, { type: "buffer" });
    const hoja = wb.SheetNames[0];
    if (!hoja) {
      return NextResponse.json(
        { error: "El Excel no tiene ninguna hoja." },
        { status: 400 },
      );
    }

    // FS ";" evita chocar con las comas decimales de Xetux ("120,68 €").
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[hoja], { FS: ";" });

    return new NextResponse(csv, {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "No pude leer el Excel.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 400 },
    );
  }
}
