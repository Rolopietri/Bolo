"use client";

// Conectar, pausar o desconectar el bot de Telegram de Producción.

import { useEffect, useState } from "react";
import {
  activarTelegram,
  conectarTelegram,
  diagnosticoTelegram,
  desconectarTelegram,
  estadoTelegram,
  faltaSqlTelegram,
  type DiagnosticoTelegram,
  type EstadoTelegram,
} from "@/lib/data/telegram";
import { extractError } from "@/lib/data/error";
import { CheckIcon, CopyIcon } from "@/components/icons";

const ACCIONES: Record<string, string> = {
  guardado: "llegó a la bandeja de Producción",
  ignorado: "se ignoró (no es el chat vinculado, está en pausa o no traía números ni foto)",
  vinculado: "vinculó ese chat",
  codigo_invalido: "el código de vincular no coincidía",
  migrado: "el grupo pasó a supergrupo y Bolo lo siguió",
};

const TIPOS_CHAT: Record<string, string> = {
  private: "chat privado",
  group: "grupo",
  supergroup: "grupo",
  channel: "canal",
};

function cuando(iso: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cacao text-xs font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2 text-sm text-cacao">{children}</div>
    </li>
  );
}

export function TelegramClient() {
  const [estado, setEstado] = useState<EstadoTelegram | null>(null);
  const [faltaSql, setFaltaSql] = useState(false);
  const [token, setToken] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [diag, setDiag] = useState<DiagnosticoTelegram | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diagCargando, setDiagCargando] = useState(false);

  async function revisarConexion() {
    setDiagError(null);
    setDiagCargando(true);
    try {
      const [d, e] = await Promise.all([diagnosticoTelegram(), estadoTelegram()]);
      setDiag(d);
      setEstado(e);
    } catch (err) {
      setDiagError(extractError(err, "No se pudo revisar la conexión."));
    } finally {
      setDiagCargando(false);
    }
  }

  useEffect(() => {
    estadoTelegram()
      .then(setEstado)
      .catch((e) => {
        if (faltaSqlTelegram(e)) setFaltaSql(true);
        else setError(extractError(e, "No se pudo leer la conexión."));
        setEstado({ configurado: false });
      });
  }, []);

  async function hacer(fn: () => Promise<EstadoTelegram | void>) {
    setError(null);
    setOcupado(true);
    try {
      const r = await fn();
      setEstado(r ?? { configurado: false });
    } catch (e) {
      setError(extractError(e, "No se pudo completar."));
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return <p className="py-10 text-center text-cacao-soft">Cargando…</p>;

  const comando = estado.codigo ? `/vincular ${estado.codigo}` : "";

  return (
    <div className="space-y-8">
      {faltaSql && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Falta activar esta opción en la base de datos (archivo supabase/bolo-06-produccion-telegram.sql).
        </p>
      )}

      {estado.vinculado ? (
        <section className="space-y-4">
          {estado.privado && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Está vinculado al chat privado con el bot, no a un grupo: lo que se escriba en el grupo no llega a
              Bolo. Para usar el grupo, escribe ahí el mensaje de abajo (Cambiar de chat).
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-marfil py-4">
            <div>
              <p className="flex items-center gap-2 font-medium text-cacao">
                <span className={`size-2 rounded-full ${estado.activo ? "bg-emerald-500" : "bg-stone-400"}`} aria-hidden />
                {estado.chat_titulo ?? "Grupo conectado"}
              </p>
              <p className="text-xs text-cacao-soft">
                {estado.activo ? "Recibiendo mensajes" : "En pausa: los mensajes nuevos no llegan a Bolo"}
                {estado.bot_usuario && <> · bot @{estado.bot_usuario}</>}
              </p>
            </div>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void hacer(() => activarTelegram(!estado.activo))}
              className="min-h-10 rounded-lg px-4 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft disabled:opacity-60"
            >
              {estado.activo ? "Pausar" : "Reanudar"}
            </button>
          </div>
          <section aria-label="Guía para el equipo" className="space-y-3 text-sm text-cacao">
            <p className="font-medium">Guía para el equipo</p>
            <ol className="divide-y divide-marfil border-y border-marfil">
              <Paso n={1}>
                <p>
                  <b>Al sacar el insumo</b>, escribe <b>Entrando</b>, el peso y el insumo.
                </p>
                <code className="text-xs text-cacao-soft">Entrando 8 kg lomito</code>
              </Paso>
              <Paso n={2}>
                <p>
                  <b>Al terminar de procesarlo</b>, escribe <b>Saliendo</b> con lo que quedó listo.
                </p>
                <code className="text-xs text-cacao-soft">Saliendo 6 kg lomito</code>
              </Paso>
              <Paso n={3}>
                <p>
                  <b>Listo.</b> Bolo junta la entrada y la salida, y el lote espera tu aprobación en Producción.
                </p>
              </Paso>
            </ol>
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-widest text-cacao-soft">Ten en cuenta</p>
              <ul className="space-y-1 text-cacao-soft">
                <li>· Un insumo por mensaje o por línea.</li>
                <li>
                  · También vale <b className="text-cacao">Sin procesar</b> y <b className="text-cacao">Procesado</b>.
                </li>
                <li>· El orden y los decimales dan igual: «lomito 6,5 kg» es lo mismo que «6.5 kg lomito».</li>
                <li>· Los mensajes sin números se ignoran: el grupo se puede usar para conversar.</li>
              </ul>
            </div>
          </section>
          {comando && (
            <div className="space-y-2 border-t border-marfil pt-4 text-sm text-cacao">
              <p className="font-medium">Cambiar de chat</p>
              <p className="text-cacao-soft">
                Para recibir desde otro grupo: agrega el bot, hazlo <b>administrador</b> y escribe en ese grupo:
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-marfil-soft px-3 py-2 text-sm ring-1 ring-marfil">{comando}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(comando).then(() => {
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 1500);
                    });
                  }}
                  aria-label="Copiar"
                  className="grid size-10 place-items-center rounded-lg text-cacao-soft ring-1 ring-marfil hover:bg-marfil-soft"
                >
                  {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-cacao-soft">
                El bot responde en el grupo y desde ese momento solo se recibe de ahí.{" "}
                <button type="button" onClick={() => void hacer(estadoTelegram)} className="text-terracotta hover:underline">
                  Actualizar
                </button>
              </p>
            </div>
          )}
        </section>
      ) : (
        <ol className="divide-y divide-marfil border-y border-marfil">
          <Paso n={1}>
            <p className="font-medium">Crea el bot en Telegram (gratis)</p>
            <p className="text-cacao-soft">
              Abre <b>@BotFather</b> en Telegram, escribe <code>/newbot</code>, ponle un nombre (por ejemplo
              &laquo;Bolo Producción&raquo;) y copia el token que te entrega.
            </p>
          </Paso>
          <Paso n={2}>
            <p className="font-medium">Pega el token aquí</p>
            {estado.configurado ? (
              <p className="flex items-center gap-2 text-emerald-800">
                <CheckIcon className="size-4" /> Bot conectado{estado.bot_usuario && <> (@{estado.bot_usuario})</>}
              </p>
            ) : (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void hacer(() => conectarTelegram(token)).then(() => setToken(""));
                }}
              >
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="123456789:AA…"
                  autoComplete="off"
                  aria-label="Token del bot"
                  className="min-w-0 flex-1 rounded-lg px-3 py-2 ring-1 ring-marfil"
                />
                <button
                  type="submit"
                  disabled={ocupado || token.trim() === "" || faltaSql}
                  className="rounded-lg bg-terracotta px-4 py-2 font-semibold text-white hover:bg-terracotta-deep disabled:opacity-60"
                >
                  {ocupado ? "Conectando…" : "Conectar"}
                </button>
              </form>
            )}
            <p className="text-xs text-cacao-soft">Este paso se hace desde la página en línea de Bolo, no desde localhost.</p>
          </Paso>
          <Paso n={3}>
            <p className="font-medium">Agrega el bot al grupo de producción</p>
            <p className="text-cacao-soft">
              En el grupo: <b>Agregar miembros</b> → busca el bot → luego hazlo <b>administrador</b> para que pueda
              leer todos los mensajes.
            </p>
          </Paso>
          <Paso n={4}>
            <p className="font-medium">Escribe este mensaje en el grupo</p>
            {comando ? (
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-marfil-soft px-3 py-2 text-sm ring-1 ring-marfil">{comando}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(comando).then(() => {
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 1500);
                    });
                  }}
                  aria-label="Copiar"
                  className="grid size-10 place-items-center rounded-lg text-cacao-soft ring-1 ring-marfil hover:bg-marfil-soft"
                >
                  {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                </button>
              </div>
            ) : (
              <p className="text-cacao-soft">Aparece cuando conectes el bot.</p>
            )}
            {comando && (
              <p className="text-xs text-cacao-soft">
                El bot responde en el grupo cuando quede conectado. Luego{" "}
                <button type="button" onClick={() => void hacer(estadoTelegram)} className="text-terracotta hover:underline">
                  actualiza esta página
                </button>
                .
              </p>
            )}
          </Paso>
        </ol>
      )}

      {error && <p className="text-sm text-terracotta-deep">{error}</p>}

      {estado.configurado && (
        <section className="space-y-2 border-t border-marfil pt-4 text-sm text-cacao" aria-label="Diagnóstico">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">¿No llega un mensaje?</p>
            <button
              type="button"
              onClick={() => void revisarConexion()}
              disabled={diagCargando}
              className="min-h-10 rounded-lg px-3 text-sm text-terracotta ring-1 ring-marfil hover:bg-marfil-soft disabled:opacity-60"
            >
              {diagCargando ? "Revisando…" : "Revisar conexión"}
            </button>
          </div>
          {diagError && <p className="text-terracotta-deep">{diagError}</p>}
          {diag && (
            <ul className="divide-y divide-marfil border-y border-marfil text-xs">
              <li className="py-2">
                <span className="text-cacao-soft">Telegram envía los avisos a: </span>
                {diag.destino ?? <b className="text-terracotta-deep">ninguna dirección (vuelve a conectar el bot)</b>}
              </li>
              <li className="py-2">
                <span className="text-cacao-soft">Avisos en cola sin entregar: </span>
                {diag.enCola}
              </li>
              <li className="py-2">
                <span className="text-cacao-soft">Último error de entrega: </span>
                {diag.ultimoError ? (
                  <b className="text-terracotta-deep">
                    {diag.ultimoError}
                    {diag.ultimoErrorAt && <> · {cuando(diag.ultimoErrorAt)}</>}
                  </b>
                ) : (
                  "ninguno"
                )}
              </li>
              <li className="py-2">
                <span className="text-cacao-soft">Último mensaje que recibió Bolo: </span>
                {estado.ultimo_aviso_at ? (
                  <>
                    {cuando(estado.ultimo_aviso_at)}, desde «{estado.ultimo_aviso_chat ?? "sin nombre"}» (
                    {TIPOS_CHAT[estado.ultimo_aviso_tipo ?? ""] ?? "chat"}): {ACCIONES[estado.ultima_accion ?? ""] ?? estado.ultima_accion}
                  </>
                ) : (
                  "ninguno todavía"
                )}
              </li>
            </ul>
          )}
          <p className="text-xs text-cacao-soft">
            Si escribes en el grupo y no aparece aquí como último mensaje, el bot no es administrador del grupo:
            Telegram no le pasa los mensajes.
          </p>
        </section>
      )}

      {estado.configurado && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            if (confirm("¿Desconectar el bot? Los mensajes ya recibidos se mantienen.")) void hacer(desconectarTelegram);
          }}
          className="text-sm text-cacao-soft hover:text-terracotta-deep"
        >
          Desconectar el bot
        </button>
      )}
    </div>
  );
}
