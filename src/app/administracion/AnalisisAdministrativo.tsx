"use client";

// Análisis administrativo: agrupa el análisis de Ventas y el de Compras, y un
// Resumen que los combina para ver la UTILIDAD REAL del período.
import { useEffect, useMemo, useState } from "react";
import { AnalisisVentas } from "./AnalisisVentas";
import { AnalisisCompras } from "./AnalisisCompras";
import { usdDeCompra, sumarVentasUsd } from "@/lib/admin/cuadre";
import { getTasaBcvPorFecha, listComprasRango } from "@/lib/data/cocina";
import { listVentasRango } from "@/lib/data/ventas";
import { hoyCaracas } from "@/lib/cierre-caja";
import { fmtBs, fmtUsd } from "@/lib/moneda";
import { WarningIcon } from "@/components/icons";

type Sub = "ventas" | "compras" | "resumen";

export function AnalisisAdministrativo() {
  const [sub, setSub] = useState<Sub>("ventas");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg ring-1 ring-marfil p-1 w-fit">
        {([["ventas", "Ingresos"], ["compras", "Egresos"], ["resumen", "Resumen · Utilidad real"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSub(k)} className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-widest ${sub === k ? "bg-cacao text-white" : "text-cacao hover:bg-marfil-soft"}`}>
            {label}
          </button>
        ))}
      </div>
      {sub === "ventas" ? <AnalisisVentas /> : sub === "compras" ? <AnalisisCompras /> : <ResumenUtilidad />}
    </div>
  );
}

// ── Resumen / Utilidad real ────────────────────────────────────────────────
const fPct = (n: number) => `${n.toFixed(1)}%`;
function rangoMes() {
  const hoy = hoyCaracas();
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
}

type Gastos = {
  fijosUsd?: number;
  variablesUsd?: number;
  insumosEgresoUsd?: number;
  cortesiasUsd?: number;
  porCategoria: { categoria: string; clasificacion: string; eur: number; usd?: number }[];
} | null;

function ResumenUtilidad() {
  const ini = rangoMes();
  const [desde, setDesde] = useState(ini.desde);
  const [hasta, setHasta] = useState(ini.hasta);
  const [ventasNetasSrc, setVentasNetasSrc] = useState(0);
  const [tasaUsdBs, setTasaUsdBs] = useState<number | null>(null);
  const [gastos, setGastos] = useState<Gastos>(null);
  const [cogsCaja, setCogsCaja] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [g, compras, ventas, tasa] = await Promise.all([
          fetch(`/api/admin/gastos?desde=${desde}&hasta=${hasta}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
          listComprasRango(desde, hasta).catch(() => []),
          listVentasRango(desde, hasta).catch(() => []),
          getTasaBcvPorFecha(hasta).catch(() => null),
        ]);
        if (cancel) return;
        setGastos(g && !g.error ? g : null);
        setCogsCaja((compras as { precioTotalUsd: number; fleteUsd?: number | null }[]).reduce((s, x) => s + usdDeCompra(x), 0));
        setVentasNetasSrc(sumarVentasUsd(ventas as { totalUsd?: number; precioUnitarioUsd?: number; cantidad: number }[]));
        setTasaUsdBs(tasa && tasa.usdBs > 0 ? tasa.usdBs : null);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [desde, hasta]);

  const r = useMemo(() => {
    const ventasNetas = ventasNetasSrc;
    const cogs = cogsCaja;
    const variables = gastos?.variablesUsd ?? 0;
    const fijos = gastos?.fijosUsd ?? 0;
    const margenBruto = ventasNetas - cogs;
    const contribucion = margenBruto - variables;
    const utilidad = contribucion - fijos;
    const foodCost = ventasNetas > 0 ? (cogs / ventasNetas) * 100 : 0;
    const margenBrutoPct = ventasNetas > 0 ? (margenBruto / ventasNetas) * 100 : 0;
    const margenNetoPct = ventasNetas > 0 ? (utilidad / ventasNetas) * 100 : 0;
    const contribPct = ventasNetas > 0 ? contribucion / ventasNetas : 0;
    const equilibrio = contribPct > 0 ? fijos / contribPct : 0;
    return { ventasNetas, cogs, variables, fijos, margenBruto, contribucion, utilidad, foodCost, margenBrutoPct, margenNetoPct, equilibrio };
  }, [ventasNetasSrc, gastos, cogsCaja]);

  // Guard de doble conteo: insumos en Egresos vs compras de Cocina. Todo en USD.
  const insumoEgreso = gastos?.insumosEgresoUsd ?? 0;
  const guard = insumoEgreso > 5 && cogsCaja > 5
    ? "doble" // ambos tienen datos → posible doble registro
    : insumoEgreso > 5 && cogsCaja <= 5
      ? "en-egresos" // los insumos se registran en Egresos, no en Cocina
      : "ok";

  const pill = (active: boolean) => `px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${active ? "bg-cacao text-white ring-cacao" : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"}`;
  function preset(which: "mes" | "rango") { if (which === "mes") { const m = rangoMes(); setDesde(m.desde); setHasta(m.hasta); } }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => preset("mes")} className={pill(false)}>Mes actual</button>
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1 text-xs text-cacao-soft">Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="rounded-lg ring-1 ring-marfil px-2 py-1 text-sm bg-white" /></label>
            <label className="flex items-center gap-1 text-xs text-cacao-soft">Hasta<input type="date" value={hasta} min={desde} max={hoyCaracas()} onChange={(e) => setHasta(e.target.value)} className="rounded-lg ring-1 ring-marfil px-2 py-1 text-sm bg-white" /></label>
          </div>
        </div>
      </section>

      {error && <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">{error}</div>}

      {loading ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center text-cacao-soft">Calculando…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi titulo="Ventas netas" valor={fmtUsd(r.ventasNetas)} sub={tasaUsdBs ? fmtBs(r.ventasNetas * tasaUsdBs) : "ventas de Cocina, en USD"} />
            <Kpi titulo="Utilidad operativa" valor={fmtUsd(r.utilidad)} sub={`${tasaUsdBs ? fmtBs(r.utilidad * tasaUsdBs) + " · " : ""}margen neto ${fPct(r.margenNetoPct)}`} tono={r.utilidad >= 0 ? "bien" : "alerta"} />
            <Kpi titulo="Food cost (caja)" valor={fPct(r.foodCost)} sub={`insumos ${fmtUsd(r.cogs)}`} tono={r.foodCost > 38 ? "alerta" : r.foodCost > 0 ? "bien" : undefined} />
            <Kpi titulo="Margen bruto" valor={fPct(r.margenBrutoPct)} sub={fmtUsd(r.margenBruto)} />
            <Kpi titulo="Punto de equilibrio" valor={r.equilibrio > 0 ? fmtUsd(r.equilibrio) : "—"} sub="ventas para cubrir fijos" />
          </div>

          {/* P&L */}
          <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
            <h3 className="font-cinzel text-base text-cacao mb-3">Utilidad real del período</h3>
            <div className="max-w-lg space-y-1 text-sm">
              <PL label="Ventas netas" val={fmtUsd(r.ventasNetas)} fuerte />
              <PL label="− Costo de insumos (compras del período, con flete)" val={fmtUsd(r.cogs)} tenue />
              <div className="border-t border-marfil pt-1"><PL label={`= Margen bruto (${fPct(r.margenBrutoPct)})`} val={fmtUsd(r.margenBruto)} fuerte /></div>
              <PL label="− Gastos variables (no insumos)" val={fmtUsd(r.variables)} tenue />
              <div className="border-t border-marfil pt-1"><PL label="= Margen de contribución" val={fmtUsd(r.contribucion)} /></div>
              <PL label="− Gastos fijos (alquiler, nómina…)" val={fmtUsd(r.fijos)} tenue />
              <div className="border-t-2 border-marfil pt-1"><PL label={`= Utilidad operativa (${fPct(r.margenNetoPct)})`} val={fmtUsd(r.utilidad)} fuerte /></div>
            </div>
            {(gastos?.cortesiasUsd ?? 0) > 0.005 && (
              <p className="text-[11px] text-cacao-mute mt-3">Informativo: cortesías {fmtUsd(gastos?.cortesiasUsd ?? 0)} — venta regalada, no entra en la utilidad.</p>
            )}
            <p className="text-[11px] text-cacao-mute mt-3">Ventas de Cocina, en dólares. {tasaUsdBs ? `Equivalente BCV: ${fmtBs(1 * tasaUsdBs)} por $1.` : "Sin tasa BCV para mostrar bolívares."} El libro viejo de ingresos no se suma. Los gastos fijos mensuales se prorratean por los días del rango: un mes completo coincide con Estado de cuenta. Si ese gasto ya estaba como egreso fijo de la misma categoría, entra una sola vez.</p>
          </section>

          {/* Guard de fuente / doble conteo */}
          {guard !== "ok" && (
            <div className={`rounded-xl p-3 text-[12px] ring-1 ${guard === "doble" ? "bg-[#FBF3E2] ring-[#E7D4A6] text-[#7A5A18]" : "bg-marfil-soft ring-marfil text-cacao-soft"}`}>
              {guard === "doble" ? (
                <><WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" /><strong>Posible doble conteo de insumos:</strong> hay {fmtUsd(insumoEgreso)} en Egresos categoría “Insumos” y {fmtUsd(cogsCaja)} en Compras de Cocina para el mismo período. La utilidad usa <strong>solo</strong> las compras de Cocina como costo de insumos (los “Insumos” de Egresos se excluyen a propósito). Si registras en los dos lados, elige uno para no distorsionar.</>
              ) : (
                <>Los insumos parecen registrarse en <strong>Egresos</strong> ({fmtUsd(insumoEgreso)}) y no en Compras de Cocina ({fmtUsd(cogsCaja)}). Hoy la utilidad toma el costo de insumos desde <strong>Cocina → Compras</strong>. Para que la utilidad sea correcta, registra las compras de insumos en Cocina → Compras.</>
              )}
            </div>
          )}

          {!gastos && (
            <p className="text-[12px] text-cacao-soft italic">No pude leer los gastos (fijos/variables) de Administración. Revisa que haya egresos cargados en el período.</p>
          )}

          {/* Desglose de gastos por categoría */}
          {gastos && gastos.porCategoria.length > 0 && (
            <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
              <h3 className="font-cinzel text-base text-cacao mb-2">Gastos por categoría</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-cacao-mute uppercase tracking-widest text-left"><th className="py-1 font-normal">Categoría</th><th className="py-1 font-normal">Tipo</th><th className="py-1 font-normal text-right">Monto</th></tr></thead>
                  <tbody>
                    {gastos.porCategoria.map((c) => (
                      <tr key={c.categoria} className="border-t border-marfil">
                        <td className="py-1 text-cacao">{c.categoria}</td>
                        <td className="py-1 text-cacao-soft">{c.clasificacion === "fija" ? "Fijo" : "Variable"}</td>
                        <td className="py-1 text-right tabular-nums text-cacao">{fmtUsd(c.usd ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="text-[11px] text-cacao-soft italic">Costo de insumos en base <strong>caja</strong> (lo comprado en el período, en dólares). El costo por <strong>consumo de recetas</strong> (food cost real del menú) está en la pestaña <strong>Ingresos</strong> → “Rentabilidad (margen)”.</p>
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, sub, tono }: { titulo: string; valor: string; sub?: string; tono?: "bien" | "alerta" }) {
  const color = tono === "bien" ? "text-[#2F4A1F]" : tono === "alerta" ? "text-[#7A5A18]" : "text-cacao";
  return (
    <div className="rounded-2xl bg-white ring-1 ring-marfil p-4">
      <div className="text-[10px] uppercase tracking-widest text-cacao-mute">{titulo}</div>
      <div className={`mt-1 font-cinzel text-lg leading-tight break-words ${color}`}>{valor}</div>
      {sub && <div className="text-xs text-cacao-soft mt-0.5">{sub}</div>}
    </div>
  );
}

function PL({ label, val, tenue, fuerte }: { label: string; val: string; tenue?: boolean; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={tenue ? "text-cacao-soft" : fuerte ? "text-cacao font-medium" : "text-cacao"}>{label}</span>
      <span className={`tabular-nums whitespace-nowrap ${fuerte ? "text-cacao font-medium" : tenue ? "text-cacao-soft" : "text-cacao"}`}>{val}</span>
    </div>
  );
}
