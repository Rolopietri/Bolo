"use client";

// Conectar, pausar o desconectar el bot de Telegram de Producción.

import { useEffect, useState } from "react";
import {
  activarTelegram,
  conectarTelegram,
  desconectarTelegram,
  estadoTelegram,
  faltaSqlTelegram,
  type EstadoTelegram,
} from "@/lib/data/telegram";
import { extractError } from "@/lib/data/error";
import { CheckIcon, CopyIcon } from "@/components/icons";

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
          <div className="space-y-2 text-sm text-cacao">
            <p className="font-medium">Cómo escribir en el grupo</p>
            <p className="text-cacao-soft">
              Empieza con <b>Entrando</b> o <b>Sin procesar</b> (lo que se saca para procesar) y{" "}
              <b>Saliendo</b> o <b>Procesado</b> (lo que quedó listo), seguido del peso y el insumo. Se pueden
              mezclar, y la entrada y la salida pueden ir en mensajes distintos: Bolo las junta al revisar.
            </p>
            <pre className="rounded-lg bg-marfil-soft px-3 py-2 text-xs text-cacao ring-1 ring-marfil">
              {"Entrando 8 kg lomito\nSaliendo 6 kg lomito\n\nSin procesar 3 kg cebolla\nProcesado 2,5 kg cebolla\n\nEntrando 12 unidades pollo, procesado 12"}
            </pre>
            <p className="text-xs text-cacao-soft">
              Solo llegan los mensajes con números o con foto; la conversación normal se ignora. Nada se guarda sin
              tu aprobación en Producción.
            </p>
          </div>
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
