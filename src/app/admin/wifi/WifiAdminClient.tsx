"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  CakeIcon,
  DownloadIcon,
  QrIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
  WifiIcon,
} from "@/components/icons";
import { ErrorBanner } from "@/components/ErrorBanner";
import { extractError } from "@/lib/data/error";
import {
  borrarInvitado,
  getWifiConfig,
  guardarWifiConfig,
  listarInvitados,
} from "@/lib/data/wifi";
import { etiquetaInteres, type WifiConfig, type WifiInvitado } from "@/lib/wifi";

export function WifiAdminClient({ baseUrl }: { baseUrl: string }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [invitados, setInvitados] = useState<WifiInvitado[]>([]);
  const [config, setConfig] = useState<WifiConfig>({ ssid: "", clave: "", mensaje: "" });

  useEffect(() => {
    (async () => {
      try {
        const [inv, cfg] = await Promise.all([listarInvitados(), getWifiConfig()]);
        setInvitados(inv);
        setConfig(cfg);
      } catch (e) {
        setError(extractError(e, "Error cargando el WiFi de invitados"));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando) {
    return <p className="text-cacao-soft">Cargando...</p>;
  }

  return (
    <div className="space-y-8">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <header>
        <h1 className="font-cinzel text-2xl tracking-[0.08em] uppercase text-cacao">
          WiFi de invitados
        </h1>
        <p className="mt-2 font-serif italic text-cacao-soft">
          El cliente escanea el QR, deja sus datos y recibe la clave.
        </p>
      </header>

      <Resumen invitados={invitados} />
      <ConfigWifi config={config} onGuardar={setConfig} onError={setError} />
      <GeneradorQr baseUrl={baseUrl} />
      <ListaInvitados
        invitados={invitados}
        onBorrar={async (id) => {
          try {
            await borrarInvitado(id);
            setInvitados((prev) => prev.filter((i) => i.id !== id));
          } catch (e) {
            setError(extractError(e, "Error borrando el registro"));
          }
        }}
      />
    </div>
  );
}

/* ── Resumen ─────────────────────────────────────────────────────── */

function Resumen({ invitados }: { invitados: WifiInvitado[] }) {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
  const desdeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();

  const delMes = invitados.filter((i) => i.ultima_visita >= inicioMes).length;
  const deHoy = invitados.filter((i) => i.ultima_visita >= desdeHoy).length;
  const conPromos = invitados.filter((i) => i.acepta_promos).length;

  const tarjetas = [
    { icono: <UsersIcon className="size-5" />, valor: invitados.length, etiqueta: "Clientes en la base" },
    { icono: <WifiIcon className="size-5" />, valor: deHoy, etiqueta: "Conectados hoy" },
    { icono: <WifiIcon className="size-5" />, valor: delMes, etiqueta: "Este mes" },
    { icono: <CakeIcon className="size-5" />, valor: conPromos, etiqueta: "Aceptan promociones" },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-marfil border border-marfil">
      {tarjetas.map((t) => (
        <div key={t.etiqueta} className="bg-white p-5">
          <div className="text-cacao-mute">{t.icono}</div>
          <div className="mt-3 font-cinzel text-2xl text-cacao">{t.valor}</div>
          <div className="mt-1 text-xs text-cacao-soft">{t.etiqueta}</div>
        </div>
      ))}
    </section>
  );
}

/* ── Clave del WiFi ──────────────────────────────────────────────── */

function ConfigWifi({
  config,
  onGuardar,
  onError,
}: {
  config: WifiConfig;
  onGuardar: (c: WifiConfig) => void;
  onError: (m: string) => void;
}) {
  const [ssid, setSsid] = useState(config.ssid);
  const [clave, setClave] = useState(config.clave);
  const [mensaje, setMensaje] = useState(config.mensaje);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setGuardado(false);
    try {
      const nueva = await guardarWifiConfig({ ssid, clave, mensaje });
      onGuardar(nueva);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      onError(extractError(e, "Error guardando la clave del WiFi"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-marfil p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium text-cacao">
        <WifiIcon className="size-5 text-cacao-soft" />
        Clave que recibe el invitado
      </h2>
      <p className="mt-1 text-sm text-cacao-soft">
        Cambia la clave del router y actualízala aquí: los invitados nuevos ven
        la nueva de inmediato.
      </p>

      <form onSubmit={guardar} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-cacao">Nombre de la red (SSID)</span>
          <input
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="QuintaMama-Invitados"
            className={CLASE_INPUT}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-cacao">Clave</span>
          <input
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="labienvenida2026"
            className={`${CLASE_INPUT} font-mono`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-cacao">
            Mensaje para el invitado <span className="text-cacao-mute">(opcional)</span>
          </span>
          <input
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Pregunta por el café de la casa."
            className={CLASE_INPUT}
          />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-terracotta text-white px-5 py-2 font-medium hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          {guardado && <span className="text-sm text-oliva">Guardado ✓</span>}
        </div>
      </form>
    </section>
  );
}

/* ── QR ──────────────────────────────────────────────────────────── */

function GeneradorQr({ baseUrl }: { baseUrl: string }) {
  const [base, setBase] = useState(baseUrl);
  const [punto, setPunto] = useState("");
  const [png, setPng] = useState("");

  const enlace = useMemo(() => {
    if (!base) return "";
    const limpia = base.replace(/\/+$/, "");
    return punto.trim()
      ? `${limpia}/wifi?p=${encodeURIComponent(punto.trim())}`
      : `${limpia}/wifi`;
  }, [base, punto]);

  useEffect(() => {
    if (!enlace) return;
    let vivo = true;
    QRCode.toDataURL(enlace, {
      margin: 1,
      width: 900,
      errorCorrectionLevel: "M",
      color: { dark: "#0A0A0A", light: "#FFFFFF" },
    })
      .then((url) => {
        if (vivo) setPng(url);
      })
      .catch(() => {
        if (vivo) setPng("");
      });
    return () => {
      vivo = false;
    };
  }, [enlace]);

  function descargar() {
    if (!png) return;
    const a = document.createElement("a");
    a.href = png;
    a.download = `qr-wifi-quinta-mama${punto.trim() ? `-${punto.trim()}` : ""}.png`;
    a.click();
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-marfil p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium text-cacao">
        <QrIcon className="size-5 text-cacao-soft" />
        QR para las mesas
      </h2>
      <p className="mt-1 text-sm text-cacao-soft">
        Descárgalo, imprímelo y ponlo en las mesas o en la barra. Lleva a{" "}
        <span className="font-mono text-xs">{enlace || "…"}</span>
      </p>

      <div className="mt-5 grid gap-6 sm:grid-cols-[1fr_auto] items-start">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-cacao">Dirección de la app</span>
            <input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="https://quintamama.com"
              className={CLASE_INPUT}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-cacao">
              Punto <span className="text-cacao-mute">(opcional: terraza, barra, mesa 4…)</span>
            </span>
            <input
              value={punto}
              onChange={(e) => setPunto(e.target.value)}
              placeholder="terraza"
              className={CLASE_INPUT}
            />
            <span className="mt-1 block text-xs text-cacao-mute">
              Se guarda con cada registro, para saber desde dónde escanean.
            </span>
          </label>
          <button
            type="button"
            onClick={descargar}
            disabled={!png}
            className="inline-flex items-center gap-2 rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50 transition-colors"
          >
            <DownloadIcon className="size-4" />
            Descargar PNG
          </button>
        </div>

        <div className="justify-self-center rounded-xl ring-1 ring-marfil p-4 bg-white">
          {png ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={png} alt="QR del WiFi" className="size-44" />
          ) : (
            <div className="size-44 grid place-items-center text-cacao-mute text-sm">
              Generando…
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Invitados ───────────────────────────────────────────────────── */

function ListaInvitados({
  invitados,
  onBorrar,
}: {
  invitados: WifiInvitado[];
  onBorrar: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return invitados;
    return invitados.filter((i) =>
      [i.nombre ?? "", i.cedula ?? "", i.email ?? "", i.telefono ?? "", i.origen ?? ""].some((c) =>
        c.toLowerCase().includes(q),
      ),
    );
  }, [invitados, busca]);

  function exportarCsv() {
    const cabecera = [
      "cedula",
      "email",
      "telefono",
      "nombre",
      "acepta_promos",
      "interes",
      "visitas",
      "origen",
      "primera_visita",
      "ultima_visita",
    ];
    const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = filtrados.map((i) =>
      [
        i.cedula ?? "",
        i.email ?? "",
        i.telefono ?? "",
        i.nombre ?? "",
        i.acepta_promos ? "sí" : "no",
        etiquetaInteres(i.interes),
        i.visitas,
        i.origen ?? "",
        i.primera_visita.slice(0, 10),
        i.ultima_visita.slice(0, 10),
      ]
        .map(escapar)
        .join(","),
    );
    const csv = "﻿" + [cabecera.join(","), ...filas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-wifi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-marfil p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-medium text-cacao">
          <UsersIcon className="size-5 text-cacao-soft" />
          Clientes registrados
        </h2>
        <button
          type="button"
          onClick={exportarCsv}
          disabled={!filtrados.length}
          className="inline-flex items-center gap-2 rounded-lg ring-1 ring-marfil px-4 py-2 text-sm text-cacao hover:bg-marfil-soft disabled:opacity-50 transition-colors"
        >
          <DownloadIcon className="size-4" />
          Exportar CSV
        </button>
      </div>

      <label className="mt-4 flex items-center gap-2 rounded-lg ring-1 ring-marfil px-3 py-2">
        <SearchIcon className="size-4 text-cacao-mute" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cédula, correo, WhatsApp o punto"
          className="w-full bg-transparent text-cacao placeholder:text-cacao-mute focus:outline-none"
        />
      </label>

      {!filtrados.length ? (
        <p className="mt-6 text-sm text-cacao-soft">
          {invitados.length
            ? "Ningún cliente coincide con la búsqueda."
            : "Todavía nadie se ha registrado. Imprime el QR y ponlo en las mesas."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-display text-[10px] tracking-[0.2em] uppercase text-cacao-mute">
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">WhatsApp</th>
                <th className="py-2 pr-3">Cédula</th>
                <th className="py-2 pr-3">Interés</th>
                <th className="py-2 pr-3">Visitas</th>
                <th className="py-2 pr-3">Última</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i) => (
                <tr key={i.id} className="border-t border-marfil-light align-top">
                  <td className="py-2.5 pr-3">
                    <div className="text-cacao break-all">{i.nombre ?? i.email ?? "—"}</div>
                    {i.nombre && (
                      <div className="text-xs text-cacao-soft break-all">{i.email}</div>
                    )}
                    {i.origen && (
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-marfil-soft px-2 py-0.5 text-[11px] text-cacao-soft">
                        <span className="size-1.5 rounded-full bg-azul-polvo" />
                        {i.origen}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-cacao-soft whitespace-nowrap">
                    {i.telefono ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-cacao-soft whitespace-nowrap">
                    {i.cedula ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-cacao-soft whitespace-nowrap">
                    {etiquetaInteres(i.interes)}
                  </td>
                  <td className="py-2.5 pr-3 text-cacao-soft">{i.visitas}</td>
                  <td className="py-2.5 pr-3 text-cacao-soft whitespace-nowrap">
                    {i.ultima_visita.slice(0, 10)}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onBorrar(i.id)}
                      className="text-cacao-mute hover:text-terracotta transition-colors"
                      aria-label={`Borrar a ${i.nombre ?? i.email ?? "cliente"}`}
                      title="Borrar"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const CLASE_INPUT =
  "mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-cacao-soft";
