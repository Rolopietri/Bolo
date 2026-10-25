/**
 * Reconocimiento de insumos por foto: recibe la imagen de una etiqueta/empaque
 * y usa Claude (visión) para extraer los campos del insumo, de modo que el
 * formulario de alta se autocomplete. El usuario revisa y guarda.
 *
 * Requiere ANTHROPIC_API_KEY (y opcionalmente ANTHROPIC_WORKSPACE_ID) en Vercel.
 * Si falta la clave, responde con un aviso suave (no rompe el deploy).
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELO = "claude-haiku-5-5";
const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const INSTRUCCION = `Mira la foto de la etiqueta o empaque de un producto de cocina/negocio y extrae los datos para registrar un INSUMO. Responde ÚNICAMENTE con un objeto JSON (sin texto antes ni después) con estas claves de tipo string (déjalas vacías "" si no se ven con claridad):
- "nombre": nombre claro y corto del producto (ej "Café en grano", "Harina de trigo", "Aceite de maíz").
- "marca": la marca, si aparece.
- "categoria": el rubro general (ej "Granos", "Lácteos", "Bebidas", "Aceites", "Limpieza", "Carnes", "Vegetales").
- "unidadCompra": cómo viene empacado/se compra (ej "kg", "g", "L", "ml", "unidad", "saco", "caja", "paquete").
- "cantidadPorCompra": solo el número del contenido (ej "1", "500", "2.5").
- "unidadBase": la unidad estándar del contenido ("kg", "g", "L", "ml" o "unidad").
No inventes el precio. Si la foto no es una etiqueta de producto, devuelve todas las claves vacías.`;

type Campos = {
  nombre: string;
  marca: string;
  categoria: string;
  unidadCompra: string;
  cantidadPorCompra: string;
  unidadBase: string;
};

function extraerJson(texto: string): Partial<Campos> | null {
  // Toma el primer bloque {...} por si el modelo agrega algo alrededor.
  const i = texto.indexOf("{");
  const j = texto.lastIndexOf("}");
  if (i === -1 || j === -1 || j < i) return null;
  try {
    return JSON.parse(texto.slice(i, j + 1));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "El reconocimiento por foto aún no está activo." },
      { status: 200 },
    );
  }

  let body: { imagen?: string; tipo?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const imagen = typeof body.imagen === "string" ? body.imagen : "";
  const tipo = TIPOS_OK.includes(body.tipo ?? "") ? body.tipo! : "image/jpeg";
  if (!imagen || imagen.length > 7_000_000) {
    return NextResponse.json(
      { error: "Imagen inválida o demasiado grande. Prueba con otra foto." },
      { status: 400 },
    );
  }

  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const anthropic = new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });

  try {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: tipo as "image/jpeg", data: imagen },
            },
            { type: "text", text: INSTRUCCION },
          ],
        },
      ],
    });
    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const datos = extraerJson(texto);
    if (!datos) {
      return NextResponse.json(
        { error: "No pude leer la etiqueta. Prueba con una foto más clara." },
        { status: 200 },
      );
    }
    const campos: Campos = {
      nombre: String(datos.nombre ?? "").trim().slice(0, 120),
      marca: String(datos.marca ?? "").trim().slice(0, 80),
      categoria: String(datos.categoria ?? "").trim().slice(0, 60),
      unidadCompra: String(datos.unidadCompra ?? "").trim().slice(0, 30),
      cantidadPorCompra: String(datos.cantidadPorCompra ?? "").trim().slice(0, 20),
      unidadBase: String(datos.unidadBase ?? "").trim().slice(0, 20),
    };
    return NextResponse.json({ campos });
  } catch (err) {
    console.error("[reconocer-insumo] error:", err);
    return NextResponse.json(
      { error: "No pude procesar la foto en este momento. Intenta de nuevo." },
      { status: 200 },
    );
  }
}
