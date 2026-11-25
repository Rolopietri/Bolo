/**
 * Aviso de Telegram por cada mensaje del grupo de producción. No usa sesión:
 * las funciones de la base validan la clave secreta que Telegram manda en la
 * cabecera.
 *
 * Telegram directo (BOLO-10): el mensaje se registra al instante —entrada a la
 * mesa, salida a en uso con su merma, o uso por unidad—. En el grupo el bot solo
 * responde lo que NO se pudo registrar (BOLO-11); lo registrado va al resumen
 * diario que recibe el gerente en privado ("/gerente CODIGO", "/resumen"). Las fotos quedan en Producción para
 * revisarlas (la lectura de la foto corre en el navegador).
 * Siempre responde 200 para que Telegram no reintente sin fin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { telegram } from "@/lib/telegram";
import { accionesDeMensaje, respuestaBot, type InsumoBot, type ResultadoBot } from "@/lib/telegram-acciones";
import { textoResumen, type DatosResumen } from "@/lib/telegram-resumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Recibido = {
  accion?: string;
  token?: string;
  chat_id?: number;
  id?: string;
  texto?: string | null;
  remitente?: string | null;
  foto?: boolean;
  message_id?: number;
};

export async function POST(req: NextRequest) {
  const secreto = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const update = await req.json().catch(() => null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secreto || !update || !url || !key) return NextResponse.json({ ok: true });

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("telegram_recibir", { p_secreto: secreto, p_update: update });
  if (error) {
    console.error("telegram_recibir", error.message);
    return NextResponse.json({ ok: true });
  }

  const r = (data ?? {}) as Recibido;
  const responder = (text: string) =>
    r.token && r.chat_id
      ? telegram(r.token, "sendMessage", {
          chat_id: r.chat_id,
          text,
          ...(r.message_id ? { reply_parameters: { message_id: r.message_id, allow_sending_without_reply: true } } : {}),
        }).catch(() => {})
      : Promise.resolve();

  if (r.accion === "vinculado") {
    await responder(
      "Listo: este grupo quedó conectado a Bolo. Escriban «Entrando 8 kg lomito» al sacar algo para procesar, «Saliendo 6 kg lomito» al terminar, y «Saliendo 12 plátanos» para los productos por unidad. Bolo lo registra al instante; solo responderé si algo no se pudo registrar.",
    );
  } else if (r.accion === "gerente_vinculado") {
    await responder("Listo: cada noche te enviaré aquí el resumen de producción del día. Escribe /resumen para verlo en cualquier momento.");
  } else if (r.accion === "gerente_codigo_invalido") {
    await responder("Ese código no coincide. Revísalo en Bolo › Producción › Grupo de Telegram.");
  } else if (r.accion === "start") {
    await responder(
      (r as { es_gerente?: boolean }).es_gerente
        ? "Hola. Escribe /resumen para ver la producción de hoy."
        : "Hola. Soy el bot de producción de Bolo. Si eres el gerente, escribe /gerente seguido del código que aparece en Bolo › Producción › Grupo de Telegram para recibir el resumen diario.",
    );
  } else if (r.accion === "resumen_pedido") {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
    const { data: rs, error: e } = await sb.rpc("telegram_resumen_secreto", { p_secreto: secreto, p_fecha: hoy });
    if (e) console.error("telegram_resumen_secreto", e.message);
    else await responder(textoResumen((rs as { datos: DatosResumen }).datos));
  } else if (r.accion === "codigo_invalido") {
    await responder("Ese código no coincide. Revísalo en Bolo › Producción › Grupo de Telegram.");
  } else if (r.accion === "guardado" && r.id) {
    await aplicarMensaje(sb, secreto, r, responder);
  }
  return NextResponse.json({ ok: true });
}

async function aplicarMensaje(
  sb: SupabaseClient,
  secreto: string,
  r: Recibido,
  responder: (t: string) => Promise<unknown>,
) {
  if (r.foto) return; // las fotos se revisan en Producción; quedan en el resumen como pendientes
  const { data: ctx, error: e1 } = await sb.rpc("telegram_contexto", { p_secreto: secreto });
  if (e1) {
    console.error("telegram_contexto", e1.message);
    return;
  }
  const insumos = ((ctx as { insumos?: InsumoBot[] } | null)?.insumos ?? []) as InsumoBot[];
  const { acciones, noReconocidos, sinPresentacion } = accionesDeMensaje(r.texto ?? "", insumos);

  // Números sueltos sin nada reconocible ("somos 5"): se ignora en silencio.
  if (acciones.length === 0 && noReconocidos.length === 0 && sinPresentacion.length === 0) {
    await sb.rpc("telegram_marcar", { p_secreto: secreto, p_pendiente: r.id, p_estado: "descartado", p_resultado: null });
    return;
  }

  let resultados: ResultadoBot[] = [];
  if (acciones.length > 0) {
    const { data: res, error: e2 } = await sb.rpc("telegram_aplicar", {
      p_secreto: secreto,
      p_pendiente: r.id,
      p_acciones: acciones,
      p_responsable: r.remitente ?? null,
    });
    if (e2) {
      console.error("telegram_aplicar", e2.message);
      await responder("No pude registrar este mensaje por un error de Bolo. Inténtalo de nuevo en un momento.");
      return;
    }
    resultados = (res ?? []) as ResultadoBot[];
  } else {
    await sb.rpc("telegram_marcar", {
      p_secreto: secreto,
      p_pendiente: r.id,
      p_estado: "rechazado",
      p_resultado: { no_reconocidos: noReconocidos, sin_presentacion: sinPresentacion },
    });
  }
  // En el grupo solo lo que no se pudo registrar.
  const texto = respuestaBot(resultados, noReconocidos, { soloErrores: true }, sinPresentacion);
  if (texto) await responder(texto);
}
