// Llamadas a la API de bots de Telegram (gratis). Solo se usa en el servidor:
// el token del bot nunca viaja al navegador.

const API = "https://api.telegram.org";

export async function telegram<T = unknown>(token: string, metodo: string, cuerpo?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${API}/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!j?.ok) throw new Error(j?.description || `Telegram respondió ${r.status}`);
  return j.result as T;
}

/** Descarga un archivo (foto) que se envió al bot. */
export async function descargarArchivo(token: string, fileId: string): Promise<{ bytes: ArrayBuffer; tipo: string }> {
  const f = await telegram<{ file_path?: string }>(token, "getFile", { file_id: fileId });
  if (!f.file_path) throw new Error("Telegram no devolvió el archivo");
  const r = await fetch(`${API}/file/bot${token}/${f.file_path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`No se pudo descargar la foto (${r.status})`);
  return { bytes: await r.arrayBuffer(), tipo: r.headers.get("content-type") || "image/jpeg" };
}

export const TOKEN_VALIDO = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
