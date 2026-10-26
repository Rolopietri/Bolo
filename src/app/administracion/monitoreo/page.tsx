import Link from "next/link";
import { Header } from "@/components/Header";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const dynamic = "force-dynamic";

// Panel de monitoreo de tareas automáticas: muestra las últimas corridas de
// cada cron/reporte (cuándo, si salió bien o falló y por qué). Lee la tabla
// job_run con service role; la página está protegida por la sesión (proxy.ts).

type JobRun = {
  id: string;
  job: string;
  estado: "ok" | "error";
  iniciado: string;
  finalizado: string | null;
  duracion_ms: number | null;
  detalle: Record<string, unknown> | null;
  error: string | null;
};

// Tareas conocidas (para mostrar nombre legible aunque aún no tengan corridas).
const JOBS: { id: string; label: string; horario: string }[] = [
  { id: "bcv", label: "Tasa BCV del día", horario: "~9:00 am (Caracas)" },
  {
    id: "notificaciones",
    label: "Avisos por correo (tareas y cobros)",
    horario: "~7:00 am (Caracas)",
  },
];

function fechaCaracas(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-VE", {
      timeZone: "America/Caracas",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function horasDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

type Semaforo = "ok" | "error" | "viejo" | "nunca";

function Pill({ estado }: { estado: Semaforo }) {
  const map: Record<Semaforo, { txt: string; cls: string; dot: string }> = {
    ok: { txt: "OK", cls: "bg-green-50 text-green-700 ring-green-200", dot: "bg-green-500" },
    error: { txt: "Falló", cls: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
    viejo: {
      txt: "Sin correr",
      cls: "bg-amber-50 text-amber-700 ring-amber-200",
      dot: "bg-amber-500",
    },
    nunca: {
      txt: "Sin datos",
      cls: "bg-marfil-soft text-cacao-soft ring-marfil",
      dot: "bg-cacao-mute",
    },
  };
  const s = map[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${s.cls}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.txt}
    </span>
  );
}

export default async function MonitoreoPage() {
  const sb = createServiceClient();
  let runs: JobRun[] = [];
  let errorCarga: string | null = null;

  if (!sb) {
    errorCarga = "Falta configurar el service role en el servidor.";
  } else {
    const { data, error } = await sb
      .from("job_run")
      .select("*")
      .order("iniciado", { ascending: false })
      .limit(60);
    if (error) errorCarga = error.message;
    else runs = (data as JobRun[]) ?? [];
  }

  const porJob = new Map<string, JobRun[]>();
  for (const r of runs) {
    (porJob.get(r.job) ?? porJob.set(r.job, []).get(r.job)!).push(r);
  }
  // Incluye también jobs conocidos sin corridas aún.
  const ids = Array.from(new Set([...JOBS.map((j) => j.id), ...porJob.keys()]));

  return (
    <>
      <Header subtitle="Monitoreo" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-8">
        <section className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Observabilidad
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Monitoreo de tareas
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Qué corrió, cuándo, y si salió bien o falló.
            </p>
          </div>
          <Link
            href="/administracion"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Administración
          </Link>
        </section>

        {errorCarga && (
          <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {errorCarga}
          </p>
        )}

        <div className="space-y-5">
          {ids.map((id) => {
            const meta = JOBS.find((j) => j.id === id);
            const lista = porJob.get(id) ?? [];
            const ultima = lista[0];
            let semaforo: Semaforo = "nunca";
            if (ultima) {
              if (ultima.estado === "error") semaforo = "error";
              else semaforo = horasDesde(ultima.iniciado) > 30 ? "viejo" : "ok";
            }
            return (
              <section key={id} className="rounded-2xl bg-white ring-1 ring-marfil p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-cinzel text-lg leading-tight text-cacao">
                      {meta?.label ?? id}
                    </h2>
                    <p className="mt-0.5 text-xs text-cacao-soft">
                      {meta ? `Programado ${meta.horario}` : "Tarea"}
                      {ultima ? ` · última: ${fechaCaracas(ultima.iniciado)}` : ""}
                    </p>
                  </div>
                  <Pill estado={semaforo} />
                </div>

                {lista.length === 0 ? (
                  <p className="mt-3 text-sm text-cacao-soft">
                    Todavía no hay corridas registradas.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-marfil border-t border-marfil">
                    {lista.slice(0, 8).map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start justify-between gap-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="text-cacao">{fechaCaracas(r.iniciado)}</span>
                          {r.duracion_ms != null && (
                            <span className="text-cacao-mute">
                              {" "}
                              · {(r.duracion_ms / 1000).toFixed(1)}s
                            </span>
                          )}
                          {r.estado === "error" && r.error && (
                            <span className="mt-0.5 block text-xs text-red-700">{r.error}</span>
                          )}
                          {r.estado === "ok" && r.detalle && (
                            <span className="mt-0.5 block text-xs text-cacao-soft">
                              {Object.entries(r.detalle)
                                .map(([k, v]) => `${k}: ${String(v)}`)
                                .join(" · ")}
                            </span>
                          )}
                        </div>
                        <span
                          className={`mt-0.5 size-2 shrink-0 rounded-full ${
                            r.estado === "error" ? "bg-red-500" : "bg-green-500"
                          }`}
                          title={r.estado}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-cacao-mute">
          Se registran automáticamente. &ldquo;Sin correr&rdquo; = la última corrida tiene
          más de 30 horas (debería correr a diario).
        </p>
      </main>
    </>
  );
}
