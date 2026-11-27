/**
 * Aviso de Telegram por cada mensaje del grupo de producción. No usa sesión:
 * las funciones de la base validan la clave secreta que Telegram manda en la
 * cabecera.
 *
 * Telegram directo (BOLO-10): el mensaje se registra al instante —entrada a la
 * mesa, salida a en uso con su merma, uso por unidad, pérdida o devolución—.
 * En el grupo el bot solo responde lo que NO se pudo registrar (BOLO-11); lo
 * registrado va al resumen diario que recibe el gerente en privado
 * ("/gerente CODIGO", "/resumen"). Si algo es dudoso no se registra (BOLO-13).
 * Responder "deshacer" a un mensaje lo revierte; editarlo aplica el texto nuevo.
 * Si el mensaje nombra un movimiento sin peso ("Saliendo algo de lomito"), el
 * bot pregunta cuánto; al responderle con la cantidad se registra (BOLO-15).
 * Las fotos quedan en Producción (la lectura de la foto corre en el navegador).
 * Siempre responde 200 para que Telegram no reintente sin fin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { telegram } from "@/lib/telegram";
import {
  accionesDeMensaje,
  completarConCantidad,
  faltantesDeMensaje,
  hayProblemas,
  legible,
  preguntaCantidad,
  respuestaBot,
  type FaltaCantidad,
  type InsumoBot,
  type ProblemasBot,
  type ResultadoBot,
} from "@/lib/telegram-acciones";
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
  objetivo?: number;
  motivo?: string;
  es_gerente?: boolean;
  /** Mensaje (del grupo o del bot) al que este responde. */
  respuesta_a?: number | null;
};

type MensajeTelegram = { reply_to_message?: { message_id?: number } };

// Que Telegram también avise de los mensajes editados (una vez por instancia).
let edicionesAseguradas = false;
async function asegurarEdiciones(token: string, secreto: string, req: NextRequest) {
  if (edicionesAseguradas) return;
  try {
    const info = await telegram<{ url?: string; allowed_updates?: string[] }>(token, "getWebhookInfo");
    if (!info.allowed_updates?.includes("edited_message") && info.url) {
      await telegram(token, "setWebhook", {
        url: info.url,
        secret_token: secreto,
        allowed_updates: ["message", "edited_message"],
      });
    }
    edicionesAseguradas = true;
  } catch (e) {
    console.error("asegurarEdiciones", e instanceof Error ? e.message : e, req.nextUrl.host);
  }
}

export async function POST(req: NextRequest) {
  const secreto = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const update = await req.json().catch(() => null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secreto || !update || !url || !key) return NextResponse.json({ ok: true });

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const editado = Boolean((update as { edited_message?: unknown }).edited_message);
  const { data, error } = editado
    ? await sb.rpc("telegram_editar", { p_secreto: secreto, p_update: update })
    : await sb.rpc("telegram_recibir", { p_secreto: secreto, p_update: update });
  if (error) {
    console.error(editado ? "telegram_editar" : "telegram_recibir", error.message);
    return NextResponse.json({ ok: true });
  }

  const r = (data ?? {}) as Recibido;
  // telegram_editar no devuelve a qué respondía el mensaje: se lee del aviso.
  const u = update as { message?: MensajeTelegram; edited_message?: MensajeTelegram };
  r.respuesta_a ??= (u.message ?? u.edited_message)?.reply_to_message?.message_id ?? null;
  /** Responde en el chat (como respuesta al mensaje) y devuelve el id del aviso. */
  const responder = async (text: string): Promise<number | undefined> => {
    if (!r.token || !r.chat_id) return undefined;
    try {
      const m = await telegram<{ message_id?: number }>(r.token, "sendMessage", {
        chat_id: r.chat_id,
        text,
        ...(r.message_id ? { reply_parameters: { message_id: r.message_id, allow_sending_without_reply: true } } : {}),
      });
      return m.message_id;
    } catch {
      return undefined;
    }
  };
  if (r.token) await asegurarEdiciones(r.token, secreto, req);

  switch (r.accion) {
    case "vinculado":
      await responder(
        "Listo: este grupo quedó conectado a Bolo. Escriban «Entrando 8 kg lomito» al sacar algo para procesar, «Saliendo 6 kg lomito» al terminar, y «Saliendo 12 plátanos» para los productos por unidad. Bolo lo registra al instante; solo responderé si algo no se pudo registrar. Para corregir, respondan al mensaje con «deshacer».",
      );
      break;
    case "gerente_vinculado":
      await responder("Listo: cada noche te enviaré aquí el resumen de producción del día. Escribe /resumen para verlo en cualquier momento.");
      break;
    case "gerente_codigo_invalido":
    case "codigo_invalido":
      await responder("Ese código no coincide. Revísalo en Bolo › Producción › Grupo de Telegram.");
      break;
    case "start":
      await responder(
        r.es_gerente
          ? "Hola. Escribe /resumen para ver la producción de hoy."
          : "Hola. Soy el bot de producción de Bolo. Si eres el gerente, escribe /gerente seguido del código que aparece en Bolo › Producción › Grupo de Telegram para recibir el resumen diario.",
      );
      break;
    case "resumen_pedido": {
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
      const { data: rs, error: e } = await sb.rpc("telegram_resumen_secreto", { p_secreto: secreto, p_fecha: hoy });
      if (e) console.error("telegram_resumen_secreto", e.message);
      else await responder(textoResumen((rs as { datos: DatosResumen }).datos));
      break;
    }
    case "deshacer_sin_respuesta":
      await responder("Para deshacer, responde al mensaje equivocado con «deshacer».");
      break;
    case "deshacer":
      await deshacer(sb, secreto, r, responder);
      break;
    case "edicion_rechazada":
      await responder(`✕ No pude aplicar la edición: ${r.motivo ?? "error de Bolo"}`);
      break;
    case "guardado":
    case "editado":
      if (r.id) await aplicarMensaje(sb, secreto, r, responder);
      break;
  }
  return NextResponse.json({ ok: true });
}

const QUE: Record<string, string> = {
  entrada: "la entrada",
  salida: "la salida",
  completo: "el procesamiento",
  uso: "la salida a uso",
  perdida: "la pérdida",
  devolucion: "la devolución",
};

type Responder = (t: string) => Promise<number | undefined>;

/** Mensaje del grupo al que se respondió (directo o a través de un aviso del bot). */
type Original = {
  id: string;
  texto: string | null;
  estado: string;
  resultado: unknown;
  message_id: number | null;
  via: "mensaje" | "respuesta";
  enviado_at: string;
};

/** Lo que se guarda en `resultado` del mensaje al que le faltó la cantidad. */
type MarcaSinCantidad = Partial<ProblemasBot> & {
  sin_cantidad: FaltaCantidad[];
  /** insumo_id → pendiente (la respuesta) que registró su cantidad. */
  completados?: Record<string, string>;
  /** message_id de la última respuesta que registró algo (para «deshacer»). */
  completado_con_mensaje?: number;
};

const marcaDe = (o: Original | null): MarcaSinCantidad | null => {
  const m = o?.resultado as MarcaSinCantidad | null | undefined;
  return m && !Array.isArray(m) && typeof m === "object" && Array.isArray(m.sin_cantidad) ? m : null;
};

/** Busca el mensaje original (BOLO-15). Sin el SQL aplicado devuelve null y
 *  todo sigue como antes. */
async function buscarOriginal(
  sb: SupabaseClient,
  secreto: string,
  chat: number | undefined,
  messageId: number | null | undefined,
): Promise<Original | null> {
  if (!chat || !messageId) return null;
  const { data, error } = await sb.rpc("telegram_mensaje_original", {
    p_secreto: secreto,
    p_chat: chat,
    p_message_id: messageId,
  });
  if (error) {
    console.error("telegram_mensaje_original", error.message);
    return null;
  }
  return (data ?? null) as Original | null;
}

async function guardarAviso(sb: SupabaseClient, secreto: string, chat: number | undefined, idAviso: number | undefined, pendiente: string) {
  if (!idAviso || !chat) return;
  await sb.rpc("telegram_guardar_respuesta", {
    p_secreto: secreto,
    p_chat: chat,
    p_bot_message_id: idAviso,
    p_pendiente: pendiente,
  });
}

async function deshacer(sb: SupabaseClient, secreto: string, r: Recibido, responder: Responder) {
  // Si respondieron "deshacer" a una pregunta de cantidad ya contestada (o al
  // mensaje sin peso), se deshace la respuesta que registró el movimiento.
  let objetivo = r.objetivo;
  const original = await buscarOriginal(sb, secreto, r.chat_id, objetivo);
  const marca = marcaDe(original);
  if (original && original.estado !== "aplicado" && marca?.completado_con_mensaje) objetivo = marca.completado_con_mensaje;
  const { data, error } = await sb.rpc("telegram_deshacer", {
    p_secreto: secreto,
    p_chat: r.chat_id,
    p_message_id: objetivo,
  });
  if (error) {
    console.error("telegram_deshacer", error.message);
    await responder("No pude deshacer por un error de Bolo. Inténtalo de nuevo en un momento.");
    return;
  }
  const d = (data ?? {}) as { ok?: boolean; motivo?: string; resultado?: ResultadoBot[] };
  if (!d.ok) {
    await responder(`✕ No pude deshacer: ${d.motivo ?? "error de Bolo"}`);
    return;
  }
  const describir = (x: ResultadoBot, prefijo = "") => {
    const n = x.tipo === "salida" || x.tipo === "completo" ? x.procesado : x.tipo === "entrada" ? x.crudo : x.cantidad;
    return `${prefijo}${QUE[x.tipo] ?? "el registro"} de ${x.nombre ?? "el insumo"} (${legible(n, x.unidad_base ?? "")})`;
  };
  const hechos = (d.resultado ?? [])
    .filter((x) => x.ok)
    .flatMap((x) => [describir(x), ...(x.corregidos ?? []).map((c) => describir(c, "y "))])
    .map((t) => t.replace(/^y la salida/, "y la salida corregida"));
  await responder(`↺ Deshecho: ${hechos.join(", ") || "el registro"}. Si hace falta, escribe el mensaje correcto.`);
}

async function aplicarMensaje(sb: SupabaseClient, secreto: string, r: Recibido, responder: Responder) {
  if (r.foto) return; // las fotos se revisan en Producción; quedan en el resumen como pendientes
  const { data: ctx, error: e1 } = await sb.rpc("telegram_contexto", { p_secreto: secreto });
  if (e1) {
    console.error("telegram_contexto", e1.message);
    return;
  }
  const insumos = ((ctx as { insumos?: InsumoBot[] } | null)?.insumos ?? []) as InsumoBot[];

  // ¿Responde con la cantidad a un mensaje que no la traía?
  if (r.respuesta_a && (await completarCantidad(sb, secreto, r, insumos, responder))) return;

  const { acciones, problemas } = accionesDeMensaje(r.texto ?? "", insumos);
  // "Saliendo algo de lomito": nombra el insumo pero no dice cuánto.
  const faltan = faltantesDeMensaje(r.texto ?? "", insumos);

  // Números sueltos sin nada reconocible ("somos 5"): se ignora en silencio.
  if (acciones.length === 0 && !hayProblemas(problemas) && faltan.length === 0) {
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
    // Queda como no registrado; si faltó la cantidad, la marca permite
    // completarlo respondiendo a la pregunta del bot.
    const resultado = faltan.length > 0 ? ({ ...problemas, sin_cantidad: faltan } satisfies MarcaSinCantidad) : problemas;
    await sb.rpc("telegram_marcar", { p_secreto: secreto, p_pendiente: r.id, p_estado: "rechazado", p_resultado: resultado });
  }
  // En el grupo solo lo que no se pudo registrar (y las correcciones).
  let texto = respuestaBot(resultados, problemas, { soloErrores: true });
  if (r.accion === "editado" && acciones.length > 0 && resultados.every((x) => x.ok) && !hayProblemas(problemas)) {
    texto = ["✓ Apliqué la edición del mensaje.", texto].filter(Boolean).join("\n");
  }
  // Si el mensaje ya registró otras cosas, no se completa respondiendo: se
  // pide escribir el movimiento completo.
  texto = [texto, preguntaCantidad(faltan, acciones.length === 0)].filter(Boolean).join("\n");
  if (texto && r.id) {
    // Si después le responden "deshacer" (o la cantidad) a este aviso, se
    // aplica al mensaje original.
    await guardarAviso(sb, secreto, r.chat_id, await responder(texto), r.id);
  }
}

/**
 * Respuesta con la cantidad a un mensaje sin peso (o a la pregunta del bot).
 * Registra el movimiento en esta respuesta, por telegram_aplicar, y marca el
 * mensaje original como completado. Devuelve false si no es ese caso (y el
 * mensaje sigue el camino normal).
 */
async function completarCantidad(
  sb: SupabaseClient,
  secreto: string,
  r: Recibido,
  insumos: InsumoBot[],
  responder: Responder,
): Promise<boolean> {
  if (!r.id) return false;
  const original = await buscarOriginal(sb, secreto, r.chat_id, r.respuesta_a);
  const marca = marcaDe(original);
  if (!original || !marca || original.id === r.id) return false;
  if (original.estado !== "rechazado" && original.estado !== "descartado") return false;
  if (Date.now() - new Date(original.enviado_at).getTime() > 3 * 24 * 3600 * 1000) return false;
  const completados = { ...(marca.completados ?? {}) };
  // Lo que falta (o lo que esta misma respuesta registró, si la están editando).
  const faltan = faltantesDeMensaje(original.texto ?? "", insumos).filter(
    (f) => !completados[f.insumoId] || completados[f.insumoId] === r.id,
  );
  if (faltan.length === 0) return false;

  const { acciones, problemas, siguenSinCantidad } = completarConCantidad(faltan, r.texto ?? "", insumos);

  if (acciones.length === 0) {
    await sb.rpc("telegram_marcar", {
      p_secreto: secreto,
      p_pendiente: r.id,
      p_estado: hayProblemas(problemas) ? "rechazado" : "descartado",
      p_resultado: hayProblemas(problemas) ? problemas : null,
    });
    const texto = hayProblemas(problemas)
      ? respuestaBot([], problemas, { soloErrores: true })
      : `No entendí la cantidad. ${preguntaCantidad(faltan)}`;
    await guardarAviso(sb, secreto, r.chat_id, await responder(texto), original.id);
    return true;
  }

  const { data: res, error } = await sb.rpc("telegram_aplicar", {
    p_secreto: secreto,
    p_pendiente: r.id,
    p_acciones: acciones,
    p_responsable: r.remitente ?? null,
  });
  if (error) {
    console.error("telegram_aplicar", error.message);
    await responder("No pude registrar la cantidad por un error de Bolo. Inténtalo de nuevo en un momento.");
    return true;
  }
  const resultados = (res ?? []) as ResultadoBot[];
  // _prod_aplicar devuelve un resultado por acción, en el mismo orden.
  acciones.forEach((a, i) => {
    if (resultados[i]?.ok) completados[a.insumo_id] = r.id!;
  });
  const registro = resultados.some((x) => x.ok);
  if (registro) {
    const pendientes = faltantesDeMensaje(original.texto ?? "", insumos).filter((f) => !completados[f.insumoId]);
    await sb.rpc("telegram_marcar", {
      p_secreto: secreto,
      p_pendiente: original.id,
      p_estado: pendientes.length === 0 ? "descartado" : "rechazado",
      p_resultado: { ...marca, completados, completado_con_mensaje: r.message_id } satisfies MarcaSinCantidad,
    });
  }
  // Aquí sí se confirma lo registrado: la persona estaba corrigiendo.
  const texto = [respuestaBot(resultados, problemas), preguntaCantidad(siguenSinCantidad)].filter(Boolean).join("\n");
  if (texto) {
    // "deshacer" a esta confirmación deshace la respuesta; si aún falta algo,
    // responder a este aviso sigue completando el mensaje original.
    const destino = registro && siguenSinCantidad.length > 0 ? original.id : r.id;
    await guardarAviso(sb, secreto, r.chat_id, await responder(texto), destino);
  }
  return true;
}
