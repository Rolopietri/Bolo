/**
 * Asistente de bolo (Capa 1 + 2): un chat que ayuda al cliente de cocina con
 * sus dudas y, cuando hace falta, consulta SUS datos en Supabase (solo lectura)
 * para responder con cifras reales: cuántos proveedores/insumos/recetas tiene,
 * qué le falta por configurar, etc.
 *
 * Requiere en Vercel la variable ANTHROPIC_API_KEY. Si no está, la ruta no se
 * cae: responde con un mensaje amable indicando que el asistente no está activo.
 *
 * Las herramientas de datos usan el cliente de servidor con la sesión del
 * usuario (RLS), así que el AI solo ve lo que ese usuario podría ver.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CLAVES_DESTINO, DESTINOS, type ClaveDestino } from "../../cocina/_destinos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Haiku: rápido y económico, ideal para un chat de soporte de alto volumen.
const MODELO = "claude-haiku-5-5";
const MAX_VUELTAS = 5; // tope de iteraciones del ciclo de herramientas

type Rol = "user" | "assistant";
type MensajeEntrada = { role: Rol; content: string };

const SISTEMA = `Eres el asistente de "bolo", una plataforma para montar y manejar una cocina/negocio de comida, pensada para personas SIN experiencia previa.

Tono: cálido, cercano y claro, en español venezolano sencillo. Tutea. Respuestas cortas (2-5 frases), sin tecnicismos. Si algo es un proceso, dalo en pasos numerados breves.

La cocina se monta en 4 pasos, en orden:
1. Proveedores — a quién le compras y cómo le pagas.
2. Insumos — qué compras (ingredientes/materiales), con precio y unidad.
3. Recetas — qué preparas con esos insumos; bolo calcula costo y precio sugerido.
4. Compras — registras lo que compras; así el inventario y los costos quedan reales.

Los módulos están en /cocina/proveedores, /cocina/insumos, /cocina/recetas, /cocina/compras.

Cuando el cliente pregunte por SU avance, qué le falta, cuántos proveedores/insumos/recetas tiene, o pida seguimiento, USA las herramientas para leer sus datos reales antes de responder. No inventes cifras. Si una herramienta devuelve vacío, anímalo con el siguiente paso concreto.

Puedes GUIAR visualmente: si el cliente pregunta DÓNDE está algo, cómo llegar a una función, o no encuentra un botón, usa la herramienta "mostrar_en_pantalla" con el destino adecuado. Un cursor se moverá solo en la pantalla para señalárselo. Al usarla, dilo con naturalidad y breve, por ejemplo: "¡Claro! Mira, te llevo hasta ahí." No describas coordenadas ni rutas técnicas; deja que el cursor lo muestre.

Nunca pidas ni muestres contraseñas, tokens ni datos sensibles. Si te preguntan algo fuera de bolo (política, salud, etc.), responde con amabilidad que solo puedes ayudar con la plataforma.`;

// ── Herramientas (solo lectura) ───────────────────────────────────────────
const HERRAMIENTAS = [
  {
    name: "estado_configuracion",
    description:
      "Devuelve cuántos proveedores, insumos, recetas y compras tiene el cliente, y cuál es el siguiente paso recomendado del montaje. Úsala para '¿qué me falta?', 'mi avance' o seguimiento.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "listar_proveedores",
    description: "Lista los nombres de los proveedores del cliente (hasta 30).",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "listar_insumos",
    description:
      "Lista insumos del cliente con su precio y unidad (hasta 30). Útil para '¿qué insumos tengo?' o dudas de precios.",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "listar_recetas",
    description: "Lista las recetas del cliente con sus porciones (hasta 30).",
    input_schema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "mostrar_en_pantalla",
    description:
      "Mueve un cursor en la pantalla del cliente para señalarle dónde está una función. Úsala cuando pregunte DÓNDE está algo o cómo llegar. Destinos: " +
      CLAVES_DESTINO.map((k) => `${k} (${DESTINOS[k].etiqueta})`).join("; ") +
      ".",
    input_schema: {
      type: "object" as const,
      properties: {
        destino: {
          type: "string" as const,
          enum: CLAVES_DESTINO,
          description: "Qué función mostrarle en pantalla.",
        },
      },
      required: ["destino"],
      additionalProperties: false,
    },
  },
];

type SB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function contar(sb: SB, tabla: string): Promise<number> {
  const { count } = await sb.from(tabla).select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function ejecutarHerramienta(sb: SB, nombre: string): Promise<string> {
  try {
    switch (nombre) {
      case "estado_configuracion": {
        const [proveedores, insumos, recetas, compras] = await Promise.all([
          contar(sb, "proveedores"),
          contar(sb, "insumos"),
          contar(sb, "recetas"),
          contar(sb, "compras"),
        ]);
        let siguiente = "¡Todo listo! Puedes registrar tus compras del día.";
        if (proveedores === 0) siguiente = "Empieza agregando tu primer proveedor en /cocina/proveedores.";
        else if (insumos === 0) siguiente = "Sigue cargando tus insumos en /cocina/insumos.";
        else if (recetas === 0) siguiente = "Crea tu primera receta en /cocina/recetas.";
        else if (compras === 0) siguiente = "Registra tu primera compra en /cocina/compras.";
        return JSON.stringify({ proveedores, insumos, recetas, compras, siguiente });
      }
      case "listar_proveedores": {
        const { data } = await sb.from("proveedores").select("*").limit(30);
        const nombres = (data ?? []).map((r: Record<string, unknown>) => r.nombre).filter(Boolean);
        return JSON.stringify({ total: nombres.length, proveedores: nombres });
      }
      case "listar_insumos": {
        const { data } = await sb.from("insumos").select("*").limit(30);
        const items = (data ?? []).map((r: Record<string, unknown>) => ({
          nombre: r.nombre,
          precio: r.precio,
          unidad: r.unidad,
        }));
        return JSON.stringify({ total: items.length, insumos: items });
      }
      case "listar_recetas": {
        const { data } = await sb.from("recetas").select("*").limit(30);
        const items = (data ?? []).map((r: Record<string, unknown>) => ({
          nombre: r.nombre,
          porciones: r.porciones ?? r.rendimiento,
        }));
        return JSON.stringify({ total: items.length, recetas: items });
      }
      default:
        return JSON.stringify({ error: "herramienta desconocida" });
    }
  } catch {
    return JSON.stringify({ error: "no se pudieron leer los datos en este momento" });
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "El asistente todavía no está activo. En cuanto se configure la clave podré ayudarte. Mientras tanto, sigue los pasos: Proveedores → Insumos → Recetas → Compras.",
    });
  }

  let entrada: { messages?: MensajeEntrada[] };
  try {
    entrada = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const historial = (entrada.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12); // acota el contexto para controlar costo
  if (historial.length === 0) {
    return NextResponse.json({ error: "sin mensajes" }, { status: 400 });
  }

  // Si la clave no está amarrada a un workspace, Anthropic exige el header
  // anthropic-workspace-id. Lo pasamos si está configurado (opcional).
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const anthropic = new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
  const sb = await createSupabaseServerClient();

  const mensajes: Anthropic.MessageParam[] = historial.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Si el modelo pide mostrar algo en pantalla, lo recordamos para devolverlo
  // al chat (el cursor-guía del cliente lo anima).
  let accion: { destino: ClaveDestino } | null = null;

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const respuesta = await anthropic.messages.create({
        model: MODELO,
        max_tokens: 1600,
        system: SISTEMA,
        tools: HERRAMIENTAS,
        messages: mensajes,
      });

      if (respuesta.stop_reason === "tool_use") {
        mensajes.push({ role: "assistant", content: respuesta.content });
        const resultados: Anthropic.ToolResultBlockParam[] = [];
        for (const bloque of respuesta.content) {
          if (bloque.type === "tool_use") {
            if (bloque.name === "mostrar_en_pantalla") {
              const d = (bloque.input as { destino?: string })?.destino;
              if (d && (CLAVES_DESTINO as string[]).includes(d)) {
                accion = { destino: d as ClaveDestino };
              }
              resultados.push({
                type: "tool_result",
                tool_use_id: bloque.id,
                content: accion
                  ? JSON.stringify({ ok: true, mostrando: DESTINOS[accion.destino].etiqueta })
                  : JSON.stringify({ ok: false, error: "destino desconocido" }),
              });
            } else {
              const salida = await ejecutarHerramienta(sb, bloque.name);
              resultados.push({ type: "tool_result", tool_use_id: bloque.id, content: salida });
            }
          }
        }
        mensajes.push({ role: "user", content: resultados });
        continue;
      }

      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return NextResponse.json({
        reply: texto || "No estoy seguro de haber entendido. ¿Puedes decírmelo de otra forma?",
        accion,
      });
    }
    return NextResponse.json({
      reply: "Esto me está tomando más de lo normal. ¿Puedes reformular tu pregunta?",
    });
  } catch (err) {
    // Mensaje claro según el tipo de fallo (ayuda a diagnosticar la config).
    console.error("[asistente] error:", err);
    let reply = "Tuve un problema para responder. Intenta de nuevo en un momento.";
    if (err instanceof Anthropic.AuthenticationError) {
      reply =
        "La clave de Claude no es válida (revísala en Vercel → ANTHROPIC_API_KEY; que no tenga espacios).";
    } else if (err instanceof Anthropic.PermissionDeniedError) {
      reply =
        "La cuenta de Claude no tiene permiso para este modelo. Avísame y lo ajusto.";
    } else if (err instanceof Anthropic.RateLimitError) {
      reply = "Hay mucho tráfico en este momento. Intenta de nuevo en un ratico.";
    } else if (err instanceof Anthropic.NotFoundError) {
      reply =
        "El modelo no está disponible para tu cuenta. Avísame y lo cambio por otro.";
    } else if (err instanceof Anthropic.APIError) {
      // Mostramos el detalle real de Claude para diagnosticar (temporal).
      reply = `Claude devolvió un error (${err.status ?? "?"}). Detalle: ${err.message}`;
    }
    return NextResponse.json({ reply }, { status: 200 });
  }
}
