"use client";

// Sistema Operativo · cliente principal (vive bajo /tareas)
// ═══════════════════════════════════════════════════════════════════
// Navegación interna de las 9 vistas + contenido. Estética blanco y negro
// del prototipo. Portado por lotes: Áreas, Tablero, Objetivos y Casa
// funcionan (lectura); las vistas con escritura quedan "en construcción".

import { useCallback, useEffect, useMemo, useState } from "react";
import { AREAS, VALORES, nombreSubEje, ESTADOS_ESPACIO } from "@/lib/tareas-so/taxonomia";
import {
  clasificar,
  progreso,
  ESCALAS,
  PESOS_DEFECTO,
  pesoValores,
} from "@/lib/tareas-so/pce.mjs";
import {
  listObjetivos,
  listTareas,
  listPersonas,
  listEspacios,
  listHitos,
  crearTarea,
  setEstadoTarea,
  addSubtarea,
  toggleSubtarea,
  deleteSubtarea,
  addComentario,
  setObjetivoActual,
  updateObjetivoMeta,
  importarRespaldo,
  addPersona,
  updatePersonaCorreo,
  deletePersona,
  listNotificacionesClaves,
  marcarNotificacion,
} from "@/lib/data/tareas-so";
import type { Respaldo, ResumenImport } from "@/lib/data/tareas-so";
import type {
  Objetivo,
  Tarea,
  Persona,
  Espacio,
  Hito,
  Impacto,
  Proximidad,
} from "@/lib/tareas-so/types";

const VISTAS: [string, string][] = [
  ["tablero", "Tablero"],
  ["nueva", "Nueva tarea"],
  ["objetivos", "Objetivos"],
  ["areas", "Áreas"],
  ["casa", "Casa"],
  ["notif", "Notificaciones"],
  ["reportes", "Reportes"],
  ["sync", "Sincronizar"],
  ["config", "Ajustes"],
];

const ORDEN: Record<string, number> = {
  Crítica: 0,
  Estratégica: 1,
  "Operativa necesaria": 2,
  "Delegar o automatizar": 3,
  Ruido: 4,
};

// ── Helpers ─────────────────────────────────────────────────────────
function fmtFecha(d?: string): string {
  if (!d) return "—";
  const x = new Date(d + "T12:00:00");
  return x.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
}
function diasHasta(d?: string): number | null {
  if (!d) return null;
  const x = new Date(d + "T12:00:00");
  const h = new Date();
  h.setHours(12, 0, 0, 0);
  return Math.round((x.getTime() - h.getTime()) / 86400000);
}
type Clasif = { nombre: string; critica: boolean; puntaje: number; razon?: string };
function clasifDe(t: Tarea, objs: Map<string, Objetivo>): Clasif {
  const o = t.objetivoId ? objs.get(t.objetivoId) : undefined;
  return clasificar({
    impacto: t.impacto,
    proximidad: t.proximidad,
    horizonte: o?.horizonte ?? null,
    valores: t.valores,
    compromiso: t.compromiso,
    patrimonio: t.patrimonio,
    subEjeId: t.subEjeId,
  }) as Clasif;
}

export function SistemaOperativoClient() {
  const [vista, setVista] = useState("tablero");
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [espacios, setEspacios] = useState<Espacio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ tipo: "tarea" | "objetivo"; id: string } | null>(null);
  const [notifClaves, setNotifClaves] = useState<string[]>([]);
  const [hitos, setHitos] = useState<Hito[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [o, t, p, e, n, h] = await Promise.all([
          listObjetivos(),
          listTareas(),
          listPersonas(),
          listEspacios(),
          listNotificacionesClaves(),
          listHitos(),
        ]);
        if (!vivo) return;
        setObjetivos(o);
        setTareas(t);
        setPersonas(p);
        setEspacios(e);
        setNotifClaves(n);
        setHitos(h);
      } catch (err) {
        if (vivo)
          setError(err instanceof Error ? err.message : "Error cargando datos");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const recargarTareas = useCallback(async () => {
    try {
      setTareas(await listTareas());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recargando");
    }
  }, []);

  const recargarObjetivos = useCallback(async () => {
    try {
      setObjetivos(await listObjetivos());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recargando");
    }
  }, []);

  const recargarPersonas = useCallback(async () => {
    try {
      setPersonas(await listPersonas());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recargando");
    }
  }, []);

  const recargarNotif = useCallback(async () => {
    try {
      setNotifClaves(await listNotificacionesClaves());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recargando");
    }
  }, []);

  const recargarTodo = useCallback(async () => {
    try {
      const [o, t, p, e] = await Promise.all([
        listObjetivos(),
        listTareas(),
        listPersonas(),
        listEspacios(),
      ]);
      setObjetivos(o);
      setTareas(t);
      setPersonas(p);
      setEspacios(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recargando");
    }
  }, []);

  const objMap = useMemo(
    () => new Map(objetivos.map((o) => [o.id, o])),
    [objetivos],
  );
  const nombreDe = useMemo(() => {
    const m = new Map(personas.map((p) => [p.id, p.nombre]));
    return (ids: string[]) =>
      ids.length ? ids.map((i) => m.get(i) ?? "?").join(" · ") : "Sin asignar";
  }, [personas]);

  return (
    <div className="text-[#0F0F0F]">
      <nav className="flex flex-wrap gap-1.5 border-b border-[#DEDEDA] pb-3 mb-5">
        {VISTAS.map(([id, label], i) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setVista(id);
              setDetalle(null);
            }}
            className={`text-[11px] tracking-[0.12em] uppercase px-3 py-1.5 border transition-colors ${
              vista === id
                ? "bg-[#0F0F0F] text-white border-[#0F0F0F]"
                : "bg-white text-[#8C8C86] border-[#DEDEDA] hover:text-[#0F0F0F]"
            }`}
          >
            <span className="font-mono mr-1.5 opacity-50">
              {String(i + 1).padStart(2, "0")}
            </span>
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="border border-[#9F3E2E] border-l-4 bg-white px-4 py-3 text-sm text-[#9F3E2E] mb-4">
          {error}
        </div>
      )}
      {loading && (
        <p className="text-[13px] text-[#8C8C86] italic mb-4">Cargando datos…</p>
      )}

      {detalle?.tipo === "tarea" ? (
        <VistaTareaDetalle
          tareaId={detalle.id}
          tareas={tareas}
          personas={personas}
          objMap={objMap}
          nombreDe={nombreDe}
          onVolver={() => setDetalle(null)}
          recargar={recargarTareas}
        />
      ) : detalle?.tipo === "objetivo" ? (
        <VistaObjetivoDetalle
          objetivoId={detalle.id}
          objetivos={objetivos}
          tareas={tareas}
          objMap={objMap}
          nombreDe={nombreDe}
          onVolver={() => setDetalle(null)}
          onAbrirTarea={(id) => setDetalle({ tipo: "tarea", id })}
          recargar={async () => {
            await recargarObjetivos();
          }}
        />
      ) : (
        <>
          {vista === "tablero" && (
            <VistaTablero
              tareas={tareas}
              objetivos={objetivos}
              espacios={espacios}
              personas={personas}
              objMap={objMap}
              onAbrir={(id) => setDetalle({ tipo: "tarea", id })}
            />
          )}
          {vista === "areas" && <VistaAreas objetivos={objetivos} tareas={tareas} />}
          {vista === "objetivos" && (
            <VistaObjetivos
              objetivos={objetivos}
              tareas={tareas}
              onAbrir={(id) => setDetalle({ tipo: "objetivo", id })}
            />
          )}
          {vista === "casa" && <VistaCasa espacios={espacios} tareas={tareas} />}
          {vista === "nueva" && (
            <VistaNueva
              objetivos={objetivos}
              personas={personas}
              espacios={espacios}
              onCreated={async () => {
                await recargarTareas();
                setVista("tablero");
              }}
            />
          )}
          {vista === "sync" && (
            <VistaSync
              objetivos={objetivos}
              tareas={tareas}
              personas={personas}
              espacios={espacios}
              onImported={recargarTodo}
            />
          )}
          {vista === "config" && (
            <VistaAjustes
              personas={personas}
              tareas={tareas}
              onCambio={recargarPersonas}
            />
          )}
          {vista === "notif" && (
            <VistaNotificaciones
              tareas={tareas}
              personas={personas}
              notifClaves={notifClaves}
              onMarcar={recargarNotif}
            />
          )}
          {vista === "reportes" && (
            <VistaReportes
              tareas={tareas}
              objetivos={objetivos}
              personas={personas}
              espacios={espacios}
              hitos={hitos}
              objMap={objMap}
              nombreDe={nombreDe}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Componentes chicos ──────────────────────────────────────────────
function Medidor({ valor, critica }: { valor: number; critica: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[12px] w-6 text-right">{valor}</span>
      <div className="relative h-3 w-[120px] bg-[#EDEDEA]">
        <div
          className={`absolute inset-y-0 left-0 ${critica ? "bg-[#9F3E2E]" : "bg-[#0F0F0F]"}`}
          style={{ width: `${Math.min(100, valor)}%` }}
        />
        {[20, 40, 70].map((g) => (
          <div
            key={g}
            className="absolute -top-0.5 -bottom-0.5 w-px bg-[#B9B9B3]"
            style={{ left: `${g}%` }}
          />
        ))}
      </div>
    </div>
  );
}
function ChipClasif({ c }: { c: Clasif }) {
  const cls = c.critica
    ? "bg-[#9F3E2E] text-white border-[#9F3E2E]"
    : c.puntaje >= 70
      ? "bg-[#0F0F0F] text-white border-[#0F0F0F]"
      : "border-[#DEDEDA] text-[#8C8C86]";
  return (
    <span className={`inline-block text-[9px] tracking-[0.14em] uppercase px-2 py-0.5 border ${cls}`}>
      {c.nombre}
    </span>
  );
}
function Barra({ p }: { p: number }) {
  return (
    <div className="h-1 bg-[#EDEDEA] mt-1.5 relative">
      <div
        className={`absolute inset-y-0 left-0 ${p < 40 ? "bg-[#9F3E2E]" : "bg-[#0F0F0F]"}`}
        style={{ width: `${p}%` }}
      />
    </div>
  );
}
function Kpi({ chico, num, nota }: { chico: string; num: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86] mb-1.5">
        {chico}
      </div>
      <div className="text-[26px] font-light leading-none font-mono">{num}</div>
      {nota && <div className="text-[11px] text-[#8C8C86] mt-1">{nota}</div>}
    </div>
  );
}
function Card({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-[#DEDEDA] bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 border-b border-[#DEDEDA]">
        <h2 className="text-[11px] tracking-[0.16em] uppercase font-medium">{titulo}</h2>
        {extra && <span className="text-[11px] text-[#8C8C86]">{extra}</span>}
      </header>
      {children}
    </section>
  );
}

// ── Vista: Tablero ──────────────────────────────────────────────────
function VistaTablero({
  tareas,
  objetivos,
  espacios,
  personas,
  objMap,
  onAbrir,
}: {
  tareas: Tarea[];
  objetivos: Objetivo[];
  espacios: Espacio[];
  personas: Persona[];
  objMap: Map<string, Objetivo>;
  onAbrir: (id: string) => void;
}) {
  // Filtro por responsable: null = todas; id de persona; "__sin" = sin asignar.
  const [filtro, setFiltro] = useState<string | null>(null);
  const nombrePersona = (id: string) => personas.find((p) => p.id === id)?.nombre ?? "—";
  const activas = tareas.filter((t) => t.estado === "pendiente" && t.objetivoId);
  const conClasif = activas
    .map((t) => ({ t, c: clasifDe(t, objMap) }))
    .sort((a, b) =>
      ORDEN[a.c.nombre] !== ORDEN[b.c.nombre]
        ? ORDEN[a.c.nombre] - ORDEN[b.c.nombre]
        : b.c.puntaje - a.c.puntaje,
    );
  const criticas = conClasif.filter((x) => x.c.critica).length;
  const estrategicas = conClasif.filter((x) => !x.c.critica && x.c.puntaje >= 70).length;
  const avanceG = objetivos.length
    ? Math.round(objetivos.reduce((s, o) => s + progreso(o), 0) / objetivos.length)
    : 0;
  const corto = objetivos.filter((o) => o.horizonte === "corto");
  const avanceC = corto.length
    ? Math.round(corto.reduce((s, o) => s + progreso(o), 0) / corto.length)
    : 0;
  const conNovedad = espacios.filter((e) => e.estado !== "operativo").length;
  const sinClasif = tareas.filter((t) => !t.objetivoId && t.estado !== "descartado").length;
  const vencidas = activas.filter((t) => {
    const d = diasHasta(t.vence);
    return d !== null && d < 0;
  }).length;

  // Conteo de tareas activas (clasificadas) por persona, para los chips.
  const cuentaPorPersona = new Map<string, number>();
  let sinAsignar = 0;
  for (const { t } of conClasif) {
    if (t.responsables.length === 0) sinAsignar++;
    for (const pid of t.responsables) cuentaPorPersona.set(pid, (cuentaPorPersona.get(pid) ?? 0) + 1);
  }
  const personasConTareas = personas.filter((p) => (cuentaPorPersona.get(p.id) ?? 0) > 0);

  const visibles = conClasif.filter(({ t }) =>
    filtro === null ? true : filtro === "__sin" ? t.responsables.length === 0 : t.responsables.includes(filtro),
  );
  const tituloLista = filtro === null ? "Tareas activas" : filtro === "__sin" ? "Sin asignar" : `Tareas de ${nombrePersona(filtro)}`;

  return (
    <div className="space-y-5">
      {(sinClasif > 0 || vencidas > 0) && (
        <div className="space-y-2">
          {vencidas > 0 && (
            <Aviso k="Vencidas" rojo>
              {vencidas} tarea{vencidas === 1 ? "" : "s"} con fecha vencida. Reprogramar o cerrar.
            </Aviso>
          )}
          {sinClasif > 0 && (
            <Aviso k="Sin clasificar" rojo>
              {sinClasif} tarea{sinClasif === 1 ? "" : "s"} sin objetivo — no entran al tablero hasta asignarles uno.
            </Aviso>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[#DEDEDA] border border-[#DEDEDA]">
        <Kpi chico="Tareas activas" num={activas.length} />
        <Kpi chico="Críticas" num={criticas} nota="excepción sobre el PCE" />
        <Kpi chico="Estratégicas" num={estrategicas} nota="PCE ≥ 70" />
        <Kpi chico="Avance global" num={`${avanceG}%`} nota={<Barra p={avanceG} />} />
        <Kpi chico="Avance corto plazo" num={`${avanceC}%`} nota={<Barra p={avanceC} />} />
        <Kpi chico="Espacios con novedad" num={conNovedad} nota={`de ${espacios.length}`} />
      </div>

      {(personasConTareas.length > 0 || sinAsignar > 0) && (
        <div className="flex flex-wrap gap-1.5">
          <ChipFiltro activo={filtro === null} onClick={() => setFiltro(null)}>Todas · {conClasif.length}</ChipFiltro>
          {personasConTareas.map((p) => (
            <ChipFiltro key={p.id} activo={filtro === p.id} onClick={() => setFiltro(p.id)}>
              {p.nombre} · {cuentaPorPersona.get(p.id)}
            </ChipFiltro>
          ))}
          {sinAsignar > 0 && (
            <ChipFiltro activo={filtro === "__sin"} onClick={() => setFiltro("__sin")}>Sin asignar · {sinAsignar}</ChipFiltro>
          )}
        </div>
      )}

      <Card titulo={tituloLista} extra={filtro === null ? `${activas.length} en total` : `${visibles.length} de ${conClasif.length}`}>
        {conClasif.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#8C8C86] italic">
            Ninguna tarea activa todavía. Los datos reales de Beatriz entran por
            la vista Sincronizar.
          </p>
        ) : visibles.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#8C8C86] italic">
            {filtro === "__sin" ? "No hay tareas sin asignar." : `${nombrePersona(filtro ?? "")} no tiene tareas activas.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86]">
                  <th className="text-left font-medium px-4 py-2 border-b border-[#DEDEDA]">Tarea</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Responsables</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Vence</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">PCE</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ t, c }) => {
                  const d = diasHasta(t.vence);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onAbrir(t.id)}
                      className="border-b border-[#DEDEDA] last:border-0 align-top cursor-pointer hover:bg-[#F4F4F2]"
                    >
                      <td className="px-4 py-3 max-w-[320px]">
                        <div className="text-[13px]">{t.titulo}</div>
                        <div className="font-mono text-[10px] text-[#B9B9B3] mt-1">
                          {t.id} · {t.subEjeId} — {nombreSubEje(t.subEjeId)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[12px]">
                        {t.responsables.length === 0 ? (
                          <span className="text-[#B9B9B3]">Sin asignar</span>
                        ) : (
                          <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                            {t.responsables.map((pid, i) => (
                              <button
                                key={pid}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFiltro(pid); }}
                                className="underline decoration-dotted underline-offset-2 hover:text-[#0F0F0F] hover:decoration-solid text-left"
                                title={`Ver solo las tareas de ${nombrePersona(pid)}`}
                              >
                                {nombrePersona(pid)}{i < t.responsables.length - 1 ? "," : ""}
                              </button>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px]" style={d !== null && d < 0 ? { color: "#9F3E2E" } : undefined}>
                        {fmtFecha(t.vence)}
                        {d !== null && (
                          <div className="text-[10px] text-[#8C8C86]">
                            {d < 0 ? `${Math.abs(d)} d vencida` : `${d} d`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Medidor valor={c.puntaje} critica={c.critica} />
                      </td>
                      <td className="px-3 py-3"><ChipClasif c={c} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChipFiltro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] tracking-[0.04em] px-2.5 py-1 border ${activo ? "bg-[#0F0F0F] text-white border-[#0F0F0F]" : "border-[#DEDEDA] text-[#4A4A46] hover:border-[#0F0F0F]"}`}
    >
      {children}
    </button>
  );
}

function Aviso({ k, rojo, children }: { k: string; rojo?: boolean; children: React.ReactNode }) {
  return (
    <div className={`border bg-white px-4 py-3 flex gap-3 items-start ${rojo ? "border-[#DEDEDA] border-l-[3px] border-l-[#9F3E2E]" : "border-[#DEDEDA] border-l-[3px] border-l-[#0F0F0F]"}`}>
      <span className={`text-[9px] tracking-[0.16em] uppercase pt-0.5 ${rojo ? "text-[#9F3E2E]" : "text-[#8C8C86]"} flex-none w-[92px]`}>{k}</span>
      <span className="text-[13px]">{children}</span>
    </div>
  );
}

// ── Vista: Objetivos ────────────────────────────────────────────────
function VistaObjetivos({
  objetivos,
  tareas,
  onAbrir,
}: {
  objetivos: Objetivo[];
  tareas: Tarea[];
  onAbrir: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {AREAS.map((a) => {
        const objs = objetivos.filter((o) => o.areaId === a.id);
        const pr = objs.length
          ? Math.round(objs.reduce((s, o) => s + progreso(o), 0) / objs.length)
          : null;
        return (
          <Card
            key={a.id}
            titulo={`${a.id} · ${a.nombre}`}
            extra={pr !== null ? `${pr}% de avance` : "sin objetivos cargados"}
          >
            {objs.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-[#8C8C86] italic">
                Todavía no hay objetivos cargados para esta área.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86]">
                      <th className="text-left font-medium px-4 py-2 border-b border-[#DEDEDA]">Objetivo</th>
                      <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Sub-eje</th>
                      <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Horizonte</th>
                      <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Tareas</th>
                      <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA] w-[150px]">Avance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objs.map((o) => {
                      const p = progreso(o);
                      const ts = tareas.filter((t) => t.objetivoId === o.id && t.estado === "pendiente").length;
                      return (
                        <tr
                          key={o.id}
                          onClick={() => onAbrir(o.id)}
                          className="border-b border-[#DEDEDA] last:border-0 align-top cursor-pointer hover:bg-[#F4F4F2]"
                        >
                          <td className="px-4 py-3 max-w-[320px]">
                            <div className="text-[13px]">{o.titulo}</div>
                            <div className="text-[11px] text-[#8C8C86] mt-0.5">{o.indicador}</div>
                            <div className="font-mono text-[10px] text-[#B9B9B3] mt-1">{o.id}</div>
                          </td>
                          <td className="px-3 py-3 font-mono text-[11px]">{o.subEjeId}</td>
                          <td className="px-3 py-3">
                            <span className="text-[9px] tracking-[0.14em] uppercase px-2 py-0.5 border border-[#DEDEDA] text-[#8C8C86]">{o.horizonte}</span>
                          </td>
                          <td className="px-3 py-3 font-mono text-[12px]">{ts}</td>
                          <td className="px-3 py-3">
                            <span className="font-mono text-[13px]">{p}%</span>
                            <Barra p={p} />
                            <div className="text-[10px] text-[#8C8C86] mt-1">{o.actual} / {o.meta} {o.unidad}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Vista: Casa ─────────────────────────────────────────────────────
function estadoLabel(e: string): string {
  return ESTADOS_ESPACIO.find((x) => x.value === e)?.label ?? e;
}
function VistaCasa({ espacios, tareas }: { espacios: Espacio[]; tareas: Tarea[] }) {
  const activas = tareas.filter((t) => t.estado === "pendiente");
  const conNovedad = espacios.filter((e) => e.estado !== "operativo").length;
  const trabajosAbiertos = activas.filter((t) => t.espacioId).length;
  const conTrabajos = espacios.filter(
    (e) => activas.filter((t) => t.espacioId === e.id).length > 0,
  ).length;
  const plantas = espacios.reduce<string[]>((acc, e) => {
    if (!acc.includes(e.planta)) acc.push(e.planta);
    return acc;
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#DEDEDA] border border-[#DEDEDA]">
        <Kpi chico="Espacios" num={espacios.length} />
        <Kpi chico="Con novedad" num={conNovedad} nota="no operativos" />
        <Kpi chico="Con trabajos" num={conTrabajos} />
        <Kpi chico="Trabajos abiertos" num={trabajosAbiertos} />
      </div>

      <Card titulo="Inventario de la casa">
        {espacios.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#8C8C86] italic">
            Todavía no hay espacios cargados. Entran por la vista Sincronizar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86]">
                  <th className="text-left font-medium px-4 py-2 border-b border-[#DEDEDA]">Espacio</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Uso</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Estado</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Trabajos abiertos</th>
                </tr>
              </thead>
              <tbody>
                {plantas.map((pl) => (
                  <FragmentoPlanta
                    key={pl}
                    planta={pl}
                    espacios={espacios.filter((e) => e.planta === pl)}
                    activas={activas}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
function FragmentoPlanta({ planta, espacios, activas }: { planta: string; espacios: Espacio[]; activas: Tarea[] }) {
  return (
    <>
      <tr>
        <td colSpan={4} className="bg-[#F4F4F2] px-4 py-2 text-[9px] tracking-[0.2em] uppercase text-[#8C8C86]">
          {planta}
        </td>
      </tr>
      {espacios.map((e) => {
        const ab = activas.filter((t) => t.espacioId === e.id).length;
        const alerta = e.estado === "fuera" || e.estado === "intervención";
        return (
          <tr key={e.id} className="border-b border-[#DEDEDA] last:border-0 align-top">
            <td className="px-4 py-3">
              <div className="text-[13px]">{e.nombre}</div>
              <div className="font-mono text-[10px] text-[#B9B9B3] mt-1">{e.id}</div>
            </td>
            <td className="px-3 py-3 text-[12px] text-[#8C8C86]">{e.tipo}</td>
            <td className="px-3 py-3">
              <span className={`text-[9px] tracking-[0.14em] uppercase px-2 py-0.5 border ${alerta ? "bg-[#9F3E2E] text-white border-[#9F3E2E]" : "border-[#DEDEDA] text-[#8C8C86]"}`}>
                {estadoLabel(e.estado)}
              </span>
            </td>
            <td className="px-3 py-3 font-mono text-[13px]">{ab}</td>
          </tr>
        );
      })}
    </>
  );
}

// ── Vista: Áreas ────────────────────────────────────────────────────
function VistaAreas({ objetivos, tareas }: { objetivos: Objetivo[]; tareas: Tarea[] }) {
  const activas = tareas.filter((t) => t.estado === "pendiente");
  return (
    <div className="space-y-6">
      {AREAS.map((a) => {
        const objsArea = objetivos.filter((o) => o.areaId === a.id);
        const avance = objsArea.length
          ? Math.round(objsArea.reduce((s, o) => s + progreso(o), 0) / objsArea.length)
          : null;
        return (
          <Card
            key={a.id}
            titulo={`${a.id} · ${a.nombre}`}
            extra={
              <>
                Dueño: {a.dueno}
                {avance !== null && <span className="font-mono"> · {avance}% de avance</span>}
              </>
            }
          >
            <div className="divide-y divide-[#DEDEDA]">
              {a.subEjes.map((s) => {
                const objsSub = objetivos.filter((o) => o.subEjeId === s.id);
                const tareasSub = activas.filter((t) => t.subEjeId === s.id);
                return (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-[12px]">{s.id}</span>
                      <span className="text-[13px] font-medium">{s.nombre}</span>
                      <span className="ml-auto text-[11px] text-[#8C8C86] font-mono">
                        {objsSub.length} objetivo{objsSub.length === 1 ? "" : "s"} · {tareasSub.length} tarea{tareasSub.length === 1 ? "" : "s"} activa{tareasSub.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#8C8C86] mt-1 leading-relaxed">{s.estrategia}</p>
                    {objsSub.length === 0 && (
                      <p className="text-[11px] text-[#9F3E2E] mt-1 uppercase tracking-wider">Sin objetivos</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <Card titulo="Reglas de excepción" extra="anulan el puntaje">
        <div className="px-4 py-3 space-y-3 text-[12.5px]">
          <Regla n="1 · Patrimonio">Toda tarea de OPS-05 con riesgo estructural o de seguridad se marca Crítica sin importar el puntaje. La casa es el activo; nada la subordina.</Regla>
          <Regla n="2 · Compromiso adquirido">Obligación contractual o fecha comprometida con un tercero se marca Crítica.</Regla>
          <Regla n="3 · Concentración">Si más del 60% de las tareas activas de una persona son de prioridad alta, el sistema avisa. Con responsables múltiples, la tarea cuenta para cada uno.</Regla>
          <Regla n="4 · Vacío">Un área sin tareas activas, o un sub-eje sin objetivos, se señala.</Regla>
        </div>
      </Card>
    </div>
  );
}
function Regla({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[#0F0F0F] pl-3">
      <b className="block font-medium mb-0.5">{n}</b>
      <p className="text-[#4A4A46]">{children}</p>
    </div>
  );
}

// ── Vista: Nueva tarea ──────────────────────────────────────────────
const IMPACTOS: Impacto[] = ["alto", "medio", "bajo", "nulo"];
const PROXIMIDADES: Proximidad[] = ["directa", "requisito", "apoyo"];

function VistaNueva({
  objetivos,
  personas,
  espacios,
  onCreated,
}: {
  objetivos: Objetivo[];
  personas: Persona[];
  espacios: Espacio[];
  onCreated: () => void | Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [areaId, setAreaId] = useState("");
  const [subEjeId, setSubEjeId] = useState("");
  const [objetivoId, setObjetivoId] = useState("");
  const [responsables, setResponsables] = useState<string[]>([]);
  const [valores, setValores] = useState<string[]>([]);
  const [vence, setVence] = useState("");
  const [espacioId, setEspacioId] = useState("");
  const [impacto, setImpacto] = useState<Impacto>("medio");
  const [proximidad, setProximidad] = useState<Proximidad>("requisito");
  const [patrimonio, setPatrimonio] = useState(false);
  const [compromiso, setCompromiso] = useState(false);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const area = AREAS.find((a) => a.id === areaId) ?? null;
  const objetivosArea = objetivos.filter((o) => o.areaId === areaId);
  const objetivoSel = objetivos.find((o) => o.id === objetivoId) ?? null;

  function cambiarArea(v: string) {
    setAreaId(v);
    setSubEjeId("");
    setObjetivoId("");
  }
  function toggle(lista: string[], set: (x: string[]) => void, v: string) {
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  }

  const clasif =
    objetivoId && objetivoSel
      ? (clasificar({
          impacto,
          proximidad,
          horizonte: objetivoSel.horizonte,
          valores,
          compromiso,
          patrimonio,
          subEjeId,
        }) as Clasif)
      : null;

  const plantas = espacios.reduce<string[]>((acc, e) => {
    if (!acc.includes(e.planta)) acc.push(e.planta);
    return acc;
  }, []);

  async function crear() {
    if (!titulo.trim() || !objetivoId) return;
    setGuardando(true);
    setError(null);
    try {
      const nuevaId = await crearTarea({
        titulo: titulo.trim(),
        subEjeId: subEjeId || objetivoSel!.subEjeId,
        objetivoId,
        espacioId: espacioId || undefined,
        vence: vence || undefined,
        impacto,
        proximidad,
        patrimonio,
        compromiso,
        nota: nota.trim() || undefined,
        responsables,
        valores,
      });
      // Correo instantáneo a los responsables (no bloquea si falla).
      if (responsables.length > 0) {
        fetch("/api/tareas/notificar-asignacion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: nuevaId }),
        }).catch(() => {});
      }
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la tarea");
      setGuardando(false);
    }
  }

  const lbl = "block text-[9px] tracking-[0.16em] uppercase text-[#8C8C86] mb-1.5";
  const inp = "w-full text-[13px] border border-[#DEDEDA] px-2.5 py-2 bg-white focus:outline focus:outline-2 focus:outline-[#0F0F0F] -outline-offset-1";

  return (
    <div className="max-w-3xl">
      <Card titulo="Crear tarea" extra="el objetivo es compuerta de entrada">
        <div className="p-4 space-y-4">
          {error && (
            <div className="border border-[#9F3E2E] border-l-4 px-3 py-2 text-[13px] text-[#9F3E2E]">{error}</div>
          )}

          <div>
            <label className={lbl}>Tarea</label>
            <input className={inp} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Qué hay que hacer, en imperativo" />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Área</label>
              <select className={inp} value={areaId} onChange={(e) => cambiarArea(e.target.value)}>
                <option value="">Elegir área</option>
                {AREAS.map((a) => (
                  <option key={a.id} value={a.id}>{a.id} · {a.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Sub-eje</label>
              <select className={inp} value={subEjeId} onChange={(e) => setSubEjeId(e.target.value)} disabled={!area}>
                <option value="">{area ? "Elegir sub-eje" : "Elige un área"}</option>
                {area?.subEjes.map((s) => (
                  <option key={s.id} value={s.id}>{s.id} · {s.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Objetivo · obligatorio</label>
              <select className={inp} value={objetivoId} onChange={(e) => setObjetivoId(e.target.value)} disabled={!area}>
                <option value="">{area ? "Elegir objetivo" : "Elige un área"}</option>
                {objetivosArea.map((o) => (
                  <option key={o.id} value={o.id}>{o.id} · {o.titulo.slice(0, 50)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Responsables</label>
              <div className="border border-[#DEDEDA] max-h-[130px] overflow-y-auto px-2.5 py-1">
                {personas.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-1 text-[12.5px] cursor-pointer">
                    <input type="checkbox" checked={responsables.includes(p.id)} onChange={() => toggle(responsables, setResponsables, p.id)} className="accent-[#0F0F0F]" />
                    {p.nombre}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>Valores</label>
              <div className="border border-[#DEDEDA] max-h-[130px] overflow-y-auto px-2.5 py-1">
                {VALORES.map((v) => (
                  <label key={v} className="flex items-center gap-2 py-1 text-[12.5px] cursor-pointer">
                    <input type="checkbox" checked={valores.includes(v)} onChange={() => toggle(valores, setValores, v)} className="accent-[#0F0F0F]" />
                    Refuerza {v}
                  </label>
                ))}
                <label className="flex items-center gap-2 py-1 text-[12.5px] cursor-pointer text-[#9F3E2E]">
                  <input type="checkbox" checked={valores.includes("__tensiona")} onChange={() => toggle(valores, setValores, "__tensiona")} className="accent-[#9F3E2E]" />
                  Tensiona un valor
                </label>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Vence</label>
                <input type="date" className={inp} value={vence} onChange={(e) => setVence(e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Espacio · opcional</label>
                <select className={inp} value={espacioId} onChange={(e) => setEspacioId(e.target.value)}>
                  <option value="">Sin espacio</option>
                  {plantas.map((pl) => (
                    <optgroup key={pl} label={pl}>
                      {espacios.filter((e) => e.planta === pl).map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Impacto en KPI · 40</label>
              <select className={inp} value={impacto} onChange={(e) => setImpacto(e.target.value as Impacto)}>
                {IMPACTOS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Proximidad · 30</label>
              <select className={inp} value={proximidad} onChange={(e) => setProximidad(e.target.value as Proximidad)}>
                {PROXIMIDADES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Horizonte · heredado</label>
              <input className={`${inp} bg-[#F4F4F2] text-[#8C8C86]`} disabled value={objetivoSel ? objetivoSel.horizonte : "del objetivo"} />
            </div>
          </div>

          <div>
            <label className={lbl}>Nota</label>
            <input className={inp} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Contexto, alcance o condición de cierre" />
          </div>

          <div className="border-t border-[#DEDEDA] pt-3 space-y-2">
            <label className="flex items-start gap-2.5 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={patrimonio} onChange={(e) => setPatrimonio(e.target.checked)} className="mt-0.5 accent-[#0F0F0F]" />
              <span>Regla de patrimonio<span className="block text-[#8C8C86] text-[11px]">Riesgo estructural o de seguridad. Solo aplica en OPS-05.</span></span>
            </label>
            <label className="flex items-start gap-2.5 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={compromiso} onChange={(e) => setCompromiso(e.target.checked)} className="mt-0.5 accent-[#0F0F0F]" />
              <span>Compromiso adquirido<span className="block text-[#8C8C86] text-[11px]">Obligación contractual o fecha comprometida con un tercero.</span></span>
            </label>
          </div>

          <div className="border-t border-[#DEDEDA] pt-3">
            <label className={lbl}>Puntaje de contribución estratégica</label>
            {clasif ? (
              <div className="flex items-center gap-3">
                <Medidor valor={clasif.puntaje} critica={clasif.critica} />
                <ChipClasif c={clasif} />
              </div>
            ) : (
              <p className="text-[12px] text-[#8C8C86] italic">Elige un objetivo para calcular el puntaje. Sin objetivo, la tarea no entra al tablero.</p>
            )}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={crear}
              disabled={!titulo.trim() || !objetivoId || guardando}
              className="text-[11px] tracking-[0.18em] uppercase px-5 py-2.5 bg-[#0F0F0F] text-white disabled:bg-[#F4F4F2] disabled:text-[#B9B9B3] disabled:cursor-not-allowed"
            >
              {guardando ? "Creando…" : "Crear tarea"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Vista: Detalle de tarea ─────────────────────────────────────────
function VistaTareaDetalle({
  tareaId,
  tareas,
  personas,
  objMap,
  nombreDe,
  onVolver,
  recargar,
}: {
  tareaId: string;
  tareas: Tarea[];
  personas: Persona[];
  objMap: Map<string, Objetivo>;
  nombreDe: (ids: string[]) => string;
  onVolver: () => void;
  recargar: () => Promise<void>;
}) {
  const t = tareas.find((x) => x.id === tareaId);
  const [nuevaSub, setNuevaSub] = useState("");
  const [texto, setTexto] = useState("");
  const [autor, setAutor] = useState(personas[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!t) {
    return (
      <div>
        <button type="button" onClick={onVolver} className="text-[10px] tracking-[0.18em] uppercase text-[#8C8C86] hover:text-[#0F0F0F] mb-4">← Volver</button>
        <p className="text-[13px] text-[#8C8C86] italic">Tarea no encontrada.</p>
      </div>
    );
  }

  const o = t.objetivoId ? objMap.get(t.objetivoId) : undefined;
  const c = clasifDe(t, objMap);
  const hechas = t.subtareas.filter((s) => s.hecho).length;
  const progSub = t.subtareas.length ? Math.round((hechas / t.subtareas.length) * 100) : null;

  async function conBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const filaPCE: [string, string, number, number][] = [
    ["Impacto en KPI", t.impacto, ESCALAS.impacto[t.impacto], PESOS_DEFECTO.impacto],
    ["Proximidad", t.proximidad, ESCALAS.proximidad[t.proximidad], PESOS_DEFECTO.proximidad],
    ["Urgencia por horizonte", o?.horizonte ?? "—", o ? ESCALAS.horizonte[o.horizonte] : 0, PESOS_DEFECTO.urgencia],
    ["Alineación con valores", t.valores.length ? t.valores.join(", ") : "neutral", pesoValores(t.valores), PESOS_DEFECTO.valores],
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <button type="button" onClick={onVolver} className="text-[10px] tracking-[0.18em] uppercase text-[#8C8C86] hover:text-[#0F0F0F]">← Volver al tablero</button>

      {error && <div className="border border-[#9F3E2E] border-l-4 px-3 py-2 text-[13px] text-[#9F3E2E]">{error}</div>}

      <div className="border border-[#DEDEDA] bg-white p-5">
        <div className="text-[10px] tracking-[0.14em] uppercase text-[#8C8C86] mb-2">
          {t.subEjeId} · {nombreSubEje(t.subEjeId)}
        </div>
        <h2 className="text-[19px] font-normal leading-snug">{t.titulo}</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-[#DEDEDA] text-[12px]">
          <Meta k="Identificador" v={<span className="font-mono">{t.id}</span>} />
          <Meta k="Responsables" v={nombreDe(t.responsables)} />
          <Meta k="Vence" v={<span className="font-mono">{fmtFecha(t.vence)}</span>} />
          <Meta k="Estado" v={t.estado} />
          <Meta k="Clasificación" v={<ChipClasif c={c} />} />
        </div>
      </div>

      <Card titulo="Puntaje de contribución" extra={c.critica ? `Excepción: ${c.razon}` : `PCE ${c.puntaje} de 100`}>
        <div className="p-4">
          <Medidor valor={c.puntaje} critica={c.critica} />
          <div className="mt-4 border-t border-[#DEDEDA] divide-y divide-[#DEDEDA]">
            {filaPCE.map(([lbl, val, factor, peso]) => (
              <div key={lbl} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2 text-[12px]">
                <span className="text-[#8C8C86]">{lbl}</span>
                <span>{val}</span>
                <span className="font-mono w-24 text-right">{factor} × {peso} = <b>{Math.round(factor * peso)}</b></span>
              </div>
            ))}
          </div>
          {t.valores.length > 1 && (
            <p className="text-[11px] text-[#8C8C86] mt-3">Con varios valores el puntaje no se suma: basta uno para que la alineación cuente completa, y basta que uno tensione para anularla.</p>
          )}
        </div>
      </Card>

      <Card titulo="Subtareas" extra={progSub === null ? "ninguna" : `${hechas} de ${t.subtareas.length} · ${progSub}%`}>
        <div className="p-4">
          {progSub !== null && <div className="mb-3"><Barra p={progSub} /></div>}
          {t.subtareas.length === 0 ? (
            <p className="text-[12px] text-[#8C8C86] italic mb-3">Las subtareas son los pasos de esta tarea. No se puntúan ni salen en el tablero.</p>
          ) : (
            <ul className="divide-y divide-[#DEDEDA] mb-3">
              {t.subtareas.map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-2">
                  <input type="checkbox" checked={s.hecho} disabled={busy} onChange={() => conBusy(() => toggleSubtarea(s.id, !s.hecho))} className="mt-0.5 accent-[#0F0F0F]" />
                  <span className={`flex-1 text-[13px] ${s.hecho ? "line-through text-[#B9B9B3]" : ""}`}>{s.titulo}</span>
                  <button type="button" disabled={busy} onClick={() => conBusy(() => deleteSubtarea(s.id))} className="text-[9px] tracking-[0.14em] uppercase text-[#8C8C86] hover:text-[#9F3E2E]">Quitar</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} placeholder="Agregar un paso" className="flex-1 text-[13px] border border-[#DEDEDA] px-2.5 py-2" />
            <button type="button" disabled={busy || !nuevaSub.trim()} onClick={() => conBusy(async () => { await addSubtarea(t.id, nuevaSub.trim(), t.subtareas.length); setNuevaSub(""); })} className="text-[10px] tracking-[0.16em] uppercase px-4 border border-[#0F0F0F] disabled:border-[#DEDEDA] disabled:text-[#B9B9B3]">Agregar</button>
          </div>
        </div>
      </Card>

      <Card titulo="Comentarios" extra={t.comentarios.length || "ninguno"}>
        <div className="p-4">
          {t.comentarios.length > 0 && (
            <div className="divide-y divide-[#DEDEDA] mb-4">
              {t.comentarios.map((cm) => (
                <div key={cm.id} className="py-2.5">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <b className="text-[12px] font-medium">{cm.autor ?? nombreDe(cm.personaId ? [cm.personaId] : [])}</b>
                    <span className="font-mono text-[10px] text-[#B9B9B3]">{fmtFecha(cm.fecha.slice(0, 10))}</span>
                  </div>
                  <p className="text-[13px] whitespace-pre-wrap">{cm.texto}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-[180px_1fr] gap-2 items-start">
            <select value={autor} onChange={(e) => setAutor(e.target.value)} className="text-[13px] border border-[#DEDEDA] px-2.5 py-2 bg-white">
              {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <div className="flex gap-2">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Qué pasó, qué se decidió o qué está trabando" className="flex-1 text-[13px] border border-[#DEDEDA] px-2.5 py-2 resize-y" />
            </div>
          </div>
          <div className="mt-2">
            <button type="button" disabled={busy || !texto.trim()} onClick={() => conBusy(async () => { const p = personas.find((x) => x.id === autor); await addComentario(t.id, { personaId: autor || undefined, autor: p?.nombre, texto: texto.trim() }); setTexto(""); })} className="text-[10px] tracking-[0.16em] uppercase px-4 py-2 bg-[#0F0F0F] text-white disabled:bg-[#F4F4F2] disabled:text-[#B9B9B3]">Guardar comentario</button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {t.estado === "completado" ? (
          <button type="button" disabled={busy} onClick={() => conBusy(() => setEstadoTarea(t, "pendiente"))} className="text-[10px] tracking-[0.16em] uppercase px-4 py-2.5 border border-[#0F0F0F]">Reabrir tarea</button>
        ) : (
          <button type="button" disabled={busy} onClick={() => conBusy(() => setEstadoTarea(t, "completado"))} className="text-[10px] tracking-[0.16em] uppercase px-4 py-2.5 bg-[#0F0F0F] text-white">Completar tarea</button>
        )}
        <button type="button" disabled={busy} onClick={() => conBusy(async () => { await setEstadoTarea(t, "descartado"); onVolver(); })} className="text-[10px] tracking-[0.16em] uppercase px-4 py-2.5 border border-[#DEDEDA] text-[#8C8C86] hover:text-[#9F3E2E] hover:border-[#9F3E2E]">Descartar</button>
      </div>
    </div>
  );
}
function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86] mb-0.5">{k}</div>
      <div className="text-[13px]">{v}</div>
    </div>
  );
}

// ── Vista: Detalle de objetivo (medición) ───────────────────────────
function VistaObjetivoDetalle({
  objetivoId,
  objetivos,
  tareas,
  objMap,
  nombreDe,
  onVolver,
  onAbrirTarea,
  recargar,
}: {
  objetivoId: string;
  objetivos: Objetivo[];
  tareas: Tarea[];
  objMap: Map<string, Objetivo>;
  nombreDe: (ids: string[]) => string;
  onVolver: () => void;
  onAbrirTarea: (id: string) => void;
  recargar: () => Promise<void>;
}) {
  const o = objetivos.find((x) => x.id === objetivoId);
  const [actual, setActual] = useState(o ? String(o.actual) : "0");
  const [meta, setMeta] = useState(o ? String(o.meta) : "0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!o) {
    return (
      <div>
        <button type="button" onClick={onVolver} className="text-[10px] tracking-[0.18em] uppercase text-[#8C8C86] hover:text-[#0F0F0F] mb-4">← Volver</button>
        <p className="text-[13px] text-[#8C8C86] italic">Objetivo no encontrado.</p>
      </div>
    );
  }

  const p = progreso(o);
  const tsObj = tareas.filter((t) => t.objetivoId === o.id && t.estado !== "descartado");
  const cambio = Number(actual) !== Number(o.actual) || Number(meta) !== Number(o.meta);

  async function guardar() {
    if (!o) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      if (Number(meta) !== Number(o.meta)) await updateObjetivoMeta(o.id, Number(meta) || 0);
      if (Number(actual) !== Number(o.actual)) await setObjetivoActual(o, Number(actual) || 0);
      await recargar();
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la medición");
    } finally {
      setBusy(false);
    }
  }

  const inp = "w-full text-[13px] border border-[#DEDEDA] px-2.5 py-2 bg-white font-mono";
  const lbl = "block text-[9px] tracking-[0.16em] uppercase text-[#8C8C86] mb-1.5";

  return (
    <div className="space-y-5 max-w-3xl">
      <button type="button" onClick={onVolver} className="text-[10px] tracking-[0.18em] uppercase text-[#8C8C86] hover:text-[#0F0F0F]">← Volver a objetivos</button>

      <div className="border border-[#DEDEDA] bg-white p-5">
        <div className="text-[10px] tracking-[0.14em] uppercase text-[#8C8C86] mb-2">{o.areaId} · {o.subEjeId} · {nombreSubEje(o.subEjeId)}</div>
        <h2 className="text-[19px] font-normal leading-snug">{o.titulo}</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-[#DEDEDA]">
          <Meta k="Identificador" v={<span className="font-mono">{o.id}</span>} />
          <Meta k="Horizonte" v={`${o.horizonte} plazo`} />
          <Meta k="Indicador" v={o.indicador} />
          <Meta k="Dirección" v={o.sentido === "menor" ? "bajar es mejor" : "subir es mejor"} />
          <Meta k="Avance" v={<span className="font-mono">{p}%</span>} />
        </div>
      </div>

      <Card titulo="Medición" extra={`${o.actual} de ${o.meta} ${o.unidad}`}>
        <div className="p-4">
          {error && <div className="border border-[#9F3E2E] border-l-4 px-3 py-2 text-[13px] text-[#9F3E2E] mb-3">{error}</div>}
          {ok && <div className="border border-[#8C8C86] border-l-4 px-3 py-2 text-[13px] text-[#4A4A46] mb-3">Medición guardada. Quedó registrada en el historial.</div>}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Valor actual</label>
              <input type="number" step="any" className={inp} value={actual} onChange={(e) => { setActual(e.target.value); setOk(false); }} />
            </div>
            <div>
              <label className={lbl}>Meta</label>
              <input type="number" step="any" className={inp} value={meta} onChange={(e) => { setMeta(e.target.value); setOk(false); }} />
            </div>
            <div>
              <label className={lbl}>Unidad</label>
              <input disabled className={`${inp} bg-[#F4F4F2] text-[#8C8C86]`} value={o.unidad} />
            </div>
          </div>
          <div className="mt-4"><Barra p={progreso({ actual: Number(actual) || 0, meta: Number(meta) || 0, sentido: o.sentido })} /></div>
          <p className="text-[11px] text-[#8C8C86] mt-2">Cada cambio del valor actual queda registrado como hito y alimenta el reporte quincenal.</p>
          <div className="mt-3">
            <button type="button" disabled={busy || !cambio} onClick={guardar} className="text-[10px] tracking-[0.16em] uppercase px-5 py-2.5 bg-[#0F0F0F] text-white disabled:bg-[#F4F4F2] disabled:text-[#B9B9B3]">
              {busy ? "Guardando…" : "Guardar medición"}
            </button>
          </div>
        </div>
      </Card>

      <Card titulo="Tareas asociadas" extra={`${tsObj.filter((t) => t.estado === "pendiente").length} activas · ${tsObj.filter((t) => t.estado === "completado").length} completadas`}>
        {tsObj.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[#8C8C86] italic">Ninguna tarea apunta a este objetivo. Un objetivo sin tareas es una intención.</p>
        ) : (
          <ul className="divide-y divide-[#DEDEDA]">
            {tsObj.map((t) => {
              const c = clasifDe(t, objMap);
              return (
                <li key={t.id} onClick={() => onAbrirTarea(t.id)} className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[#F4F4F2]">
                  <span className={`flex-1 text-[13px] ${t.estado === "completado" ? "line-through text-[#B9B9B3]" : ""}`}>{t.titulo}</span>
                  <span className="text-[11px] text-[#8C8C86]">{nombreDe(t.responsables)}</span>
                  {t.estado === "pendiente" && <ChipClasif c={c} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Vista: Sincronizar ──────────────────────────────────────────────
function descargarJSON(nombre: string, obj: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function VistaSync({
  objetivos,
  tareas,
  personas,
  espacios,
  onImported,
}: {
  objetivos: Objetivo[];
  tareas: Tarea[];
  personas: Persona[];
  espacios: Espacio[];
  onImported: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenImport | null>(null);

  async function importar(raw: string) {
    setError(null);
    setResumen(null);
    let data: Respaldo;
    try {
      data = JSON.parse(raw);
    } catch {
      setError("El archivo no es un JSON válido. Revisa que copiaste todo.");
      return;
    }
    setBusy(true);
    try {
      const r = await importarRespaldo(data);
      setResumen(r);
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error importando");
    } finally {
      setBusy(false);
    }
  }

  function exportar() {
    descargarJSON(`quinta-mama-sistema-operativo-${new Date().toISOString().slice(0, 10)}.json`, {
      generado: new Date().toISOString(),
      version: "so-1",
      personas,
      espacios,
      objetivos,
      tareas,
    });
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Card titulo="Importar datos" extra="pega el respaldo del prototipo o sube el archivo">
        <div className="p-4 space-y-3">
          <p className="text-[12px] text-[#8C8C86] leading-relaxed">
            Pega aquí el JSON del <b>respaldo completo</b> exportado desde el prototipo de Beatriz
            (Sincronizar → Descargar respaldo completo), o sube el archivo. Se traen personas,
            espacios, objetivos, estrategias y tareas (con sus responsables, valores, subtareas y
            comentarios). Lo que ya existe se actualiza, no se duplica.
          </p>
          {error && <div className="border border-[#9F3E2E] border-l-4 px-3 py-2 text-[13px] text-[#9F3E2E]">{error}</div>}
          {resumen && (
            <div className="border border-[#DEDEDA] border-l-[3px] border-l-[#0F0F0F] px-3 py-2 text-[13px]">
              <b className="block mb-1">Importación lista</b>
              <span className="text-[#4A4A46]">
                {resumen.personas} personas · {resumen.espacios} espacios · {resumen.objetivos} objetivos · {resumen.estrategias} estrategias · {resumen.tareas} tareas.
              </span>
              {resumen.errores.length > 0 && (
                <div className="text-[#9F3E2E] text-[12px] mt-1">{resumen.errores.length} avisos: {resumen.errores.slice(0, 3).join("; ")}</div>
              )}
            </div>
          )}
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={7}
            placeholder="Pega aquí el JSON del respaldo"
            className="w-full text-[12px] font-mono border border-[#DEDEDA] px-2.5 py-2 resize-y"
          />
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              disabled={busy || !texto.trim()}
              onClick={() => importar(texto)}
              className="text-[10px] tracking-[0.16em] uppercase px-5 py-2.5 bg-[#0F0F0F] text-white disabled:bg-[#F4F4F2] disabled:text-[#B9B9B3]"
            >
              {busy ? "Importando…" : "Importar"}
            </button>
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => importar(String(r.result));
                r.readAsText(f);
              }}
              className="text-[12px]"
            />
          </div>
          <p className="text-[11px] text-[#8C8C86]">
            Nota: el historial (hitos), reportes y notificaciones no se importan — el sistema
            los genera solo de aquí en adelante.
          </p>
        </div>
      </Card>

      <Card titulo="Exportar respaldo" extra="todo el sistema en un archivo">
        <div className="p-4">
          <p className="text-[12px] text-[#8C8C86] mb-3">
            Descarga un archivo con personas, espacios, objetivos y tareas actuales. Guárdalo en Drive
            como respaldo.
          </p>
          <button type="button" onClick={exportar} className="text-[10px] tracking-[0.16em] uppercase px-5 py-2.5 border border-[#0F0F0F]">
            Descargar respaldo
          </button>
        </div>
      </Card>
    </div>
  );
}

// ── Vista: Ajustes (equipo + correos) ───────────────────────────────
function VistaAjustes({
  personas,
  tareas,
  onCambio,
}: {
  personas: Persona[];
  tareas: Tarea[];
  onCambio: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activasDe = (pid: string) =>
    tareas.filter((t) => t.estado === "pendiente" && t.responsables.includes(pid)).length;

  async function agregar() {
    if (!nombre.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addPersona(nombre.trim(), correo.trim() || undefined);
      setNombre("");
      setCorreo("");
      await onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <Card titulo="Equipo y correos" extra="base de las notificaciones">
        {error && <div className="px-4 pt-3 text-[13px] text-[#9F3E2E]">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86]">
                <th className="text-left font-medium px-4 py-2 border-b border-[#DEDEDA]">Persona</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Correo</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Activas</th>
                <th className="border-b border-[#DEDEDA]"></th>
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <PersonaFila key={p.id} p={p} activas={activasDe(p.id)} onCambio={onCambio} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-[#DEDEDA] flex flex-wrap gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" className="flex-1 min-w-[140px] text-[13px] border border-[#DEDEDA] px-2.5 py-2" />
          <input value={correo} onChange={(e) => setCorreo(e.target.value)} type="email" placeholder="Correo" className="flex-1 min-w-[140px] text-[13px] border border-[#DEDEDA] px-2.5 py-2" />
          <button type="button" disabled={busy || !nombre.trim()} onClick={agregar} className="text-[10px] tracking-[0.16em] uppercase px-4 border border-[#0F0F0F] disabled:border-[#DEDEDA] disabled:text-[#B9B9B3]">Agregar</button>
        </div>
        <p className="px-4 pb-4 text-[11px] text-[#8C8C86]">Una persona con tareas activas no se puede quitar: primero reasigna su trabajo.</p>
      </Card>

      <Card titulo="Motor de puntaje" extra="valores por defecto">
        <div className="p-4 text-[12.5px] text-[#4A4A46] space-y-1">
          <p>Pesos del PCE: <span className="font-mono">Impacto 40 · Proximidad 30 · Urgencia 20 · Valores 10</span>.</p>
          <p>Umbrales: <span className="font-mono">Estratégica ≥ 70 · Operativa ≥ 40 · Delegar ≥ 20</span>.</p>
          <p className="text-[11px] text-[#8C8C86]">Fijos por ahora, tal como los aprobó Beatriz. Se pueden hacer editables más adelante.</p>
        </div>
      </Card>
    </div>
  );
}
function PersonaFila({ p, activas, onCambio }: { p: Persona; activas: number; onCambio: () => Promise<void> }) {
  const [correo, setCorreo] = useState(p.correo ?? "");
  const [guardado, setGuardado] = useState(false);
  async function guardar() {
    if (correo === (p.correo ?? "")) return;
    try {
      await updatePersonaCorreo(p.id, correo.trim());
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
      await onCambio();
    } catch {
      /* noop */
    }
  }
  async function quitar() {
    if (activas > 0) return;
    try {
      await deletePersona(p.id);
      await onCambio();
    } catch {
      /* noop */
    }
  }
  return (
    <tr className="border-b border-[#DEDEDA] last:border-0">
      <td className="px-4 py-3 text-[13px]">{p.nombre}</td>
      <td className="px-3 py-3">
        <input
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          onBlur={guardar}
          placeholder="correo@quintamama.com"
          className={`w-full text-[12.5px] border px-2 py-1.5 ${guardado ? "border-[#0F0F0F]" : "border-[#DEDEDA]"}`}
        />
      </td>
      <td className="px-3 py-3 font-mono text-[12px]">{activas}</td>
      <td className="px-3 py-3 text-right">
        {activas === 0 && (
          <button type="button" onClick={quitar} className="text-[9px] tracking-[0.14em] uppercase text-[#8C8C86] hover:text-[#9F3E2E]">Quitar</button>
        )}
      </td>
    </tr>
  );
}

// ── Vista: Notificaciones ───────────────────────────────────────────
type NotifItem = { clave: string; tipo: "creada" | "vence"; t: Tarea; persona: Persona };
function VistaNotificaciones({
  tareas,
  personas,
  notifClaves,
  onMarcar,
}: {
  tareas: Tarea[];
  personas: Persona[];
  notifClaves: string[];
  onMarcar: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const porId = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);
  const claves = useMemo(() => new Set(notifClaves), [notifClaves]);

  const bandeja: NotifItem[] = [];
  for (const t of tareas) {
    if (t.estado !== "pendiente") continue;
    for (const pid of t.responsables) {
      const persona = porId.get(pid);
      if (!persona) continue;
      const dCreada = diasHasta(t.creada);
      if (dCreada !== null && dCreada <= 0 && dCreada >= -7) {
        const clave = `${t.id}|creada|${pid}`;
        if (!claves.has(clave)) bandeja.push({ clave, tipo: "creada", t, persona });
      }
      const dVence = diasHasta(t.vence);
      if (dVence !== null && dVence <= 1) {
        const clave = `${t.id}|vence|${pid}`;
        if (!claves.has(clave)) bandeja.push({ clave, tipo: "vence", t, persona });
      }
    }
  }

  const sinCorreo = personas.filter((p) => !p.correo);

  function mailto(n: NotifItem): string {
    const asunto = `${n.tipo === "vence" ? "Vence" : "Nueva tarea"} · ${n.t.id} · ${n.t.titulo}`;
    const cuerpo = [
      n.tipo === "vence" ? "Tienes una tarea que vence pronto." : "Se te asignó una tarea.",
      "",
      `Tarea: ${n.t.titulo}`,
      `Identificador: ${n.t.id}`,
      `Sub-eje: ${n.t.subEjeId} — ${nombreSubEje(n.t.subEjeId)}`,
      `Vence: ${fmtFecha(n.t.vence)}`,
      "",
      "— Sistema Operativo · Quinta Mamá",
    ].join("\n");
    return `mailto:${encodeURIComponent(n.persona.correo ?? "")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  async function marcar(n: NotifItem) {
    setBusy(true);
    try {
      await marcarNotificacion({ clave: n.clave, tareaId: n.t.id, personaId: n.persona.id, tipo: n.tipo });
      await onMarcar();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card titulo="Cómo funciona hoy" extra="y qué falta para que sea automático">
        <div className="p-4 space-y-2 text-[12.5px] text-[#4A4A46]">
          <p>El sistema detecta a quién avisar y por qué, y arma el borrador del correo. El <b>envío</b> todavía es manual: abre el borrador en tu correo y le das enviar.</p>
          <p className="text-[#8C8C86] text-[11px]">El envío 100% automático (cron diario + Resend) es la Fase 3: necesita configurar Resend y los correos del equipo.</p>
          {sinCorreo.length > 0 && (
            <p className="text-[#9F3E2E] text-[12px]">Faltan correos de: {sinCorreo.map((p) => p.nombre).join(", ")}. Cárgalos en Ajustes o el aviso no llega.</p>
          )}
        </div>
      </Card>

      <Card titulo="Por enviar" extra={String(bandeja.length)}>
        {bandeja.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#8C8C86] italic">Nada pendiente. No hay asignaciones nuevas ni vencimientos dentro de 24 horas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86]">
                  <th className="text-left font-medium px-4 py-2 border-b border-[#DEDEDA]">Motivo</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Para</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Tarea</th>
                  <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Vence</th>
                  <th className="border-b border-[#DEDEDA]"></th>
                </tr>
              </thead>
              <tbody>
                {bandeja.map((n) => (
                  <tr key={n.clave} className="border-b border-[#DEDEDA] last:border-0 align-top">
                    <td className="px-4 py-3">
                      <span className={`text-[9px] tracking-[0.14em] uppercase px-2 py-0.5 border ${n.tipo === "vence" ? "bg-[#9F3E2E] text-white border-[#9F3E2E]" : "border-[#DEDEDA] text-[#8C8C86]"}`}>
                        {n.tipo === "vence" ? "vencimiento" : "asignación"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12.5px]">
                      {n.persona.nombre}
                      <div className="font-mono text-[10.5px]" style={{ color: n.persona.correo ? "#8C8C86" : "#9F3E2E" }}>{n.persona.correo ?? "sin correo"}</div>
                    </td>
                    <td className="px-3 py-3 text-[13px] max-w-[260px]">
                      {n.t.titulo}
                      <div className="font-mono text-[10px] text-[#B9B9B3] mt-1">{n.t.id}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px]">{fmtFecha(n.t.vence)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {n.persona.correo && (
                        <a href={mailto(n)} className="text-[9px] tracking-[0.14em] uppercase px-2.5 py-1 border border-[#DEDEDA] mr-1.5 inline-block hover:border-[#0F0F0F]">Borrador</a>
                      )}
                      <button type="button" disabled={busy} onClick={() => marcar(n)} className="text-[9px] tracking-[0.14em] uppercase px-2.5 py-1 border border-[#DEDEDA] hover:border-[#0F0F0F]">Marcar enviada</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo="Enviadas" extra={String(notifClaves.length)}>
        <p className="px-4 py-4 text-[12px] text-[#8C8C86]">{notifClaves.length === 0 ? "Todavía no se ha marcado ninguna notificación." : `${notifClaves.length} notificación${notifClaves.length === 1 ? "" : "es"} ya despachada${notifClaves.length === 1 ? "" : "s"}. No se vuelven a proponer.`}</p>
      </Card>
    </div>
  );
}

// ── Vista: Reportes (informe quincenal) ─────────────────────────────
const REP_INICIO = "2026-07-30";
const REP_DIAS = 15;
function parseISO(d: string) { return new Date(d + "T12:00:00"); }
function isoLocal(x: Date) { return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }
function addDiasISO(d: string, n: number) { const x = parseISO(d); x.setDate(x.getDate() + n); return isoLocal(x); }
function diffDiasISO(a: string, b: string) { return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000); }
function enRango(f: string | undefined, i: string, ff: string) { return !!f && f >= i && f <= ff; }
function periodoDe(n: number) { const i = addDiasISO(REP_INICIO, n * REP_DIAS); return { n, i, f: addDiasISO(i, REP_DIAS - 1) }; }
function fmtLargo(d: string) { return parseISO(d).toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" }); }

function VistaReportes({
  tareas,
  objetivos,
  personas,
  espacios,
  hitos,
  objMap,
  nombreDe,
}: {
  tareas: Tarea[];
  objetivos: Objetivo[];
  personas: Persona[];
  espacios: Espacio[];
  hitos: Hito[];
  objMap: Map<string, Objetivo>;
  nombreDe: (ids: string[]) => string;
}) {
  const hoy = isoLocal(new Date());
  const indiceActual = Math.max(0, Math.floor(diffDiasISO(hoy, REP_INICIO) / REP_DIAS));
  const [periodoN, setPeriodoN] = useState(indiceActual);
  const p = periodoDe(periodoN);

  const nombrePorId = useMemo(() => new Map(personas.map((x) => [x.id, x.nombre])), [personas]);

  const D = useMemo(() => {
    const activas = tareas.filter((t) => t.estado === "pendiente");
    const comp = tareas.filter((t) => t.estado === "completado" && enRango(t.cerrada, p.i, p.f));
    const nuev = tareas.filter((t) => enRango(t.creada, p.i, p.f));
    const venc = activas.filter((t) => t.vence && t.vence < p.f);
    const crit = activas.filter((t) => clasifDe(t, objMap).critica);
    const med = hitos.filter((h) => h.tipo === "medición" && enRango(h.fecha, p.i, p.f));
    const areas = AREAS.map((a) => {
      const objs = objetivos.filter((o) => o.areaId === a.id);
      const pr = objs.length ? Math.round(objs.reduce((s, o) => s + progreso(o), 0) / objs.length) : 0;
      const medA = med.filter((h) => h.ref && h.ref.startsWith(a.id));
      const delta = medA.reduce((s, h) => s + ((h.avance ?? 0) - (h.avanceAnterior ?? 0)), 0);
      return {
        a, pr, delta,
        comp: comp.filter((t) => t.subEjeId.split(".")[0] === a.id).length,
        act: activas.filter((t) => t.subEjeId.split(".")[0] === a.id).length,
      };
    });
    const carga: Record<string, { n: number; alta: number }> = {};
    for (const t of activas) {
      const alta = clasifDe(t, objMap);
      for (const pid of t.responsables) {
        const nom = nombrePorId.get(pid) ?? pid;
        carga[nom] ??= { n: 0, alta: 0 };
        carga[nom].n++;
        if (alta.critica || alta.puntaje >= 70) carga[nom].alta++;
      }
    }
    const casa = espacios.filter((e) => e.estado !== "operativo");
    return { activas, comp, nuev, venc, crit, med, areas, carga, casa };
  }, [tareas, objetivos, espacios, hitos, objMap, nombrePorId, p.i, p.f]);

  function descargarInforme() {
    const filas = (rows: string[][]) =>
      rows.length
        ? `<table><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        : `<p class="v">Sin datos en el período.</p>`;
    const esc2 = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
    const html = `<!doctype html><meta charset="utf-8"><title>Reporte quincenal · Quinta Mamá</title>
<style>body{font-family:Jost,system-ui,sans-serif;color:#0F0F0F;max-width:860px;margin:0 auto;padding:34px;font-size:12px;line-height:1.5}
h1{font-size:22px;font-weight:400}h2{font-size:10px;letter-spacing:.2em;text-transform:uppercase;margin:28px 0 8px;border-bottom:1px solid #0F0F0F;padding-bottom:6px}
.eb{font-size:9px;letter-spacing:.24em;text-transform:uppercase;color:#8C8C86}.sb{color:#8C8C86;margin-top:4px}
table{width:100%;border-collapse:collapse;margin-top:4px}td{padding:6px 8px 6px 0;border-bottom:1px solid #DEDEDA;font-size:11.5px}
.v{color:#8C8C86;font-size:11.5px}.al{color:#9F3E2E}</style>
<div class="eb">Quinta Mamá · Operaciones</div><h1>Reporte quincenal</h1>
<div class="sb">Período ${fmtLargo(p.i)} — ${fmtLargo(p.f)} · Emitido ${fmtLargo(hoy)}</div>
<h2>Resumen del período</h2>${filas([["Completadas", String(D.comp.length)], ["Nuevas", String(D.nuev.length)], ["Activas al cierre", String(D.activas.length)], ["Vencidas", String(D.venc.length)], ["Críticas", String(D.crit.length)], ["Mediciones", String(D.med.length)]])}
<h2>Avance por área</h2>${filas(D.areas.map((x) => [`${x.a.id} · ${esc2(x.a.nombre)}`, `${x.pr}%`, `${x.delta > 0 ? "+" : ""}${x.delta} pts`, `${x.comp} compl. · ${x.act} activas`]))}
<h2>Carga por responsable</h2>${filas(Object.entries(D.carga).map(([q, c]) => [esc2(q), `${c.n} activas`, `${c.alta} de prioridad alta`, `${Math.round((c.alta / c.n) * 100)}%`]))}
<h2>Movimiento de indicadores</h2>${D.med.length ? filas(D.med.map((h) => [h.fecha, esc2(h.ref ?? ""), esc2(h.texto), `${h.avanceAnterior ?? "?"}% → ${h.avance ?? "?"}%`])) : `<p class="v">No se registró ninguna medición en el período. Sin mediciones, el avance no cambió por resultado, sino por omisión.</p>`}
<h2>Tareas completadas</h2>${filas(D.comp.map((t) => [esc2(t.titulo), t.subEjeId, nombreDe(t.responsables)]))}
<h2>Atención al cierre</h2>${filas(D.crit.concat(D.venc.filter((t) => !D.crit.includes(t))).map((t) => [esc2(t.titulo), t.subEjeId, nombreDe(t.responsables), t.vence ? fmtFecha(t.vence) : "—"]))}
<h2>Estado de la casa</h2>${filas(D.casa.map((e) => [esc2(e.nombre), e.planta, e.estado]))}`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `quinta-mama-reporte-${p.i}_${p.f}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <Card titulo="Ciclo quincenal" extra={`cada ${REP_DIAS} días desde el ${fmtFecha(REP_INICIO)}`}>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[9px] tracking-[0.16em] uppercase text-[#8C8C86] mb-1.5">Período</label>
            <select value={periodoN} onChange={(e) => setPeriodoN(Number(e.target.value))} className="text-[13px] border border-[#DEDEDA] px-2.5 py-2 bg-white">
              {Array.from({ length: indiceActual + 1 }, (_, i) => indiceActual - i).map((n) => {
                const pp = periodoDe(n);
                return <option key={n} value={n}>{fmtFecha(pp.i)} — {fmtFecha(pp.f)}{n === indiceActual ? " (en curso)" : ""}</option>;
              })}
            </select>
          </div>
          <button type="button" onClick={descargarInforme} className="text-[10px] tracking-[0.16em] uppercase px-5 py-2.5 bg-[#0F0F0F] text-white">Descargar informe</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[#DEDEDA] border border-[#DEDEDA]">
        <Kpi chico="Completadas" num={D.comp.length} />
        <Kpi chico="Nuevas" num={D.nuev.length} />
        <Kpi chico="Activas" num={D.activas.length} />
        <Kpi chico="Vencidas" num={D.venc.length} />
        <Kpi chico="Críticas" num={D.crit.length} />
        <Kpi chico="Mediciones" num={D.med.length} />
      </div>

      <Card titulo="Avance por área" extra="variación en puntos del período">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[9px] tracking-[0.16em] uppercase text-[#8C8C86]">
                <th className="text-left font-medium px-4 py-2 border-b border-[#DEDEDA]">Área</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Avance</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Variación</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#DEDEDA]">Compl. · Activas</th>
              </tr>
            </thead>
            <tbody>
              {D.areas.map((x) => (
                <tr key={x.a.id} className="border-b border-[#DEDEDA] last:border-0">
                  <td className="px-4 py-2.5 text-[12.5px]"><span className="font-mono">{x.a.id}</span> · {x.a.nombre}</td>
                  <td className="px-3 py-2.5 font-mono text-[13px]">{x.pr}%</td>
                  <td className="px-3 py-2.5 font-mono text-[12px]" style={x.delta < 0 ? { color: "#9F3E2E" } : undefined}>{x.delta > 0 ? "+" : ""}{x.delta} pts</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[#8C8C86]">{x.comp} · {x.act}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card titulo="Carga por responsable" extra="% de prioridad alta">
        {Object.keys(D.carga).length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[#8C8C86] italic">No hay tareas activas asignadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {Object.entries(D.carga).map(([q, c]) => {
                  const pc = Math.round((c.alta / c.n) * 100);
                  return (
                    <tr key={q} className="border-b border-[#DEDEDA] last:border-0">
                      <td className="px-4 py-2.5 text-[13px]">{q}</td>
                      <td className="px-3 py-2.5 font-mono text-[12px]">{c.n} activas</td>
                      <td className="px-3 py-2.5 font-mono text-[12px]">{c.alta} altas</td>
                      <td className="px-3 py-2.5 font-mono text-[12px]" style={pc > 60 ? { color: "#9F3E2E" } : undefined}>{pc}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo="Movimiento de indicadores" extra={`${D.med.length} mediciones`}>
        {D.med.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-[#8C8C86]">No se registró ninguna medición en el período. <b>Sin mediciones, el avance no cambió por resultado, sino por omisión.</b></p>
        ) : (
          <ul className="divide-y divide-[#DEDEDA]">
            {D.med.map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-[12.5px] flex justify-between gap-3">
                <span><span className="font-mono text-[11px] text-[#8C8C86]">{fmtFecha(h.fecha)}</span> · {h.texto}</span>
                <span className="font-mono text-[11px] whitespace-nowrap">{h.avanceAnterior ?? "?"}% → {h.avance ?? "?"}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card titulo="Atención al cierre" extra="críticas y vencidas">
        {D.crit.concat(D.venc.filter((t) => !D.crit.includes(t))).length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-[#8C8C86] italic">Sin tareas críticas ni vencidas. El período cierra limpio.</p>
        ) : (
          <ul className="divide-y divide-[#DEDEDA]">
            {D.crit.concat(D.venc.filter((t) => !D.crit.includes(t))).map((t) => (
              <li key={t.id} className="px-4 py-2.5 text-[13px] flex justify-between gap-3">
                <span>{t.titulo}<span className="font-mono text-[10px] text-[#B9B9B3]"> · {t.subEjeId}</span></span>
                <span className="text-[11px] text-[#8C8C86] whitespace-nowrap">{nombreDe(t.responsables)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

