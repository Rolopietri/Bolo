"use client";

// Avisos para confirmar (BOLO-10): una venta de un insumo que se procesa o se
// usa por lotes no encontró nada EN USO y salió del almacén. Se pide confirmar
// que eso pasó en la cocina y no fue un error de la venta.

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { unidadPlantilla } from "@/lib/produccion";
import { extractError } from "@/lib/data/error";
import { WarningIcon } from "@/components/icons";

type Aviso = { id: string; cantidad: number; createdAt: string; nombre: string; unidadBase: string };

const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

function legible(n: number, unidadBase: string) {
  const { unidad, factor } = unidadPlantilla(unidadBase);
  return `${(Math.round((n / factor) * 100) / 100).toLocaleString("es-VE")} ${unidad}`;
}

export function AvisosInventario() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    sb.from("avisos_inventario")
      .select("id, cantidad, created_at, insumos(nombre, unidad_base)")
      .eq("estado", "pendiente")
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data, error: e }) => {
        if (e) return; // sin BOLO-10 todavía: no hay avisos
        setAvisos(
          (data ?? []).map((r) => {
            const i = (Array.isArray(r.insumos) ? r.insumos[0] : r.insumos) as
              | { nombre?: string; unidad_base?: string }
              | null;
            return {
              id: r.id as string,
              cantidad: Number(r.cantidad),
              createdAt: r.created_at as string,
              nombre: i?.nombre ?? "Insumo",
              unidadBase: i?.unidad_base ?? "",
            };
          }),
        );
      });
  }, []);

  async function resolver(a: Aviso, estado: "confirmado" | "error") {
    setError(null);
    try {
      const sb = createSupabaseBrowserClient();
      const { data: u } = await sb.auth.getUser();
      const { error: e } = await sb
        .from("avisos_inventario")
        .update({ estado, resuelto_por: u.user?.id ?? null, resuelto_at: new Date().toISOString() })
        .eq("id", a.id);
      if (e) throw e;
      setAvisos((xs) => xs.filter((x) => x.id !== a.id));
      setNota(estado === "error" ? `Corrige o borra esa venta de ${a.nombre} en Ventas para que el almacén vuelva a cuadrar.` : null);
    } catch (e) {
      setError(extractError(e, "No se pudo guardar la respuesta."));
    }
  }

  if (avisos.length === 0 && !nota) return null;

  return (
    <section aria-label="Para confirmar" className="mb-8 space-y-2">
      {avisos.length > 0 && (
        <>
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-cacao-soft">
            <WarningIcon className="size-4 text-terracotta" />
            Para confirmar
          </p>
          <ul className="divide-y divide-marfil border-y border-marfil">
            {avisos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="min-w-0 flex-1 text-sm text-cacao">
                  Se vendió {legible(a.cantidad, a.unidadBase)} de <b>{a.nombre}</b> sin nada en uso: salió del almacén.
                  <span className="block text-xs text-cacao-soft">{cuando(a.createdAt)} · ¿Fue así en la cocina?</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void resolver(a, "confirmado")}
                    className="min-h-10 rounded-lg px-3 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
                  >
                    Sí, salió así
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolver(a, "error")}
                    className="min-h-10 rounded-lg px-3 text-sm text-terracotta ring-1 ring-marfil hover:bg-marfil-soft"
                  >
                    Fue un error de venta
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {nota && <p className="text-sm text-cacao-soft">{nota}</p>}
      {error && <p className="text-sm text-terracotta-deep">{error}</p>}
    </section>
  );
}
