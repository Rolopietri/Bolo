/**
 * Borra solo la tanda de `scripts/seed-prueba-semana.mjs`.
 *
 * Reconoce las filas por la marca «seed-prueba-semana» en la nota.
 * No toca ventas, compras, cierres ni egresos que no lleven esa marca.
 *
 * Los triggers reponen el stock de las ventas y revierten las compras.
 * La pérdida se devuelve con borrar_movimiento_stock. Si al revertir una
 * compra el precio del insumo queda vacío (no había compra anterior), se
 * restaura el precio que tenía justo antes de borrar.
 *
 *   node --env-file=.env.local scripts/limpiar-prueba-semana.mjs
 */
import { pathToFileURL } from "node:url";

const MARCA = "seed-prueba-semana";

export async function limpiar(sb) {
  const borrado = { ventas: 0, perdidas: 0, compras: 0, cierres: 0, egresos: 0, precios: 0 };

  const { data: ventas, error: vErr } = await sb.from("ventas").select("id").ilike("notas", `%${MARCA}%`);
  if (vErr) throw new Error(`ventas: ${vErr.message}`);
  if (ventas?.length) {
    const { error } = await sb.from("ventas").delete().in("id", ventas.map((r) => r.id));
    if (error) throw new Error(`borrar ventas: ${error.message}`);
    borrado.ventas = ventas.length;
  }

  const { data: movs, error: mErr } = await sb
    .from("stock_movimientos")
    .select("id, insumo_id, cantidad, capa")
    .ilike("nota", `%${MARCA}%`);
  if (mErr) throw new Error(`movimientos: ${mErr.message}`);
  for (const m of movs ?? []) {
    const { error } = await sb.rpc("borrar_movimiento_stock", { p_id: m.id, p_devolver: true });
    if (error) {
      const suma = Math.abs(Number(m.cantidad) || 0);
      if (m.capa === "total" && suma > 0) {
        const { data: ins, error: iErr } = await sb.from("insumos").select("stock_actual").eq("id", m.insumo_id).single();
        if (iErr) throw new Error(`stock de la pérdida: ${iErr.message}`);
        const { error: uErr } = await sb
          .from("insumos")
          .update({ stock_actual: Number(ins.stock_actual) + suma })
          .eq("id", m.insumo_id);
        if (uErr) throw new Error(`reponer pérdida: ${uErr.message}`);
      }
      const { error: dErr } = await sb.from("stock_movimientos").delete().eq("id", m.id);
      if (dErr) throw new Error(`borrar pérdida: ${dErr.message}`);
    }
    borrado.perdidas += 1;
  }

  const { data: compras, error: cErr } = await sb
    .from("compras")
    .select("id, insumo_id")
    .ilike("notas", `%${MARCA}%`);
  if (cErr) throw new Error(`compras: ${cErr.message}`);
  const preciosAntes = new Map();
  for (const c of compras ?? []) {
    if (preciosAntes.has(c.insumo_id)) continue;
    const { data: ins, error: iErr } = await sb
      .from("insumos")
      .select("precio_base_usd, precio_compra_usd")
      .eq("id", c.insumo_id)
      .single();
    if (iErr) throw new Error(`precio del insumo: ${iErr.message}`);
    preciosAntes.set(c.insumo_id, ins);
  }
  if (compras?.length) {
    const { error } = await sb.from("compras").delete().in("id", compras.map((r) => r.id));
    if (error) throw new Error(`borrar compras: ${error.message}`);
    borrado.compras = compras.length;
  }
  for (const [insumoId, antes] of preciosAntes) {
    const { data: ins, error: iErr } = await sb
      .from("insumos")
      .select("precio_base_usd")
      .eq("id", insumoId)
      .single();
    if (iErr) throw new Error(`precio tras revertir: ${iErr.message}`);
    if (ins.precio_base_usd == null && antes.precio_base_usd != null) {
      const { error } = await sb
        .from("insumos")
        .update({
          precio_base_usd: antes.precio_base_usd,
          precio_compra_usd: antes.precio_compra_usd,
        })
        .eq("id", insumoId);
      if (error) throw new Error(`restaurar precio: ${error.message}`);
      borrado.precios += 1;
    }
  }

  const { data: cierres, error: kErr } = await sb.from("cierre_caja").select("id").ilike("nota", `%${MARCA}%`);
  if (kErr) throw new Error(`cierres: ${kErr.message}`);
  if (cierres?.length) {
    const { error } = await sb.from("cierre_caja").delete().in("id", cierres.map((r) => r.id));
    if (error) throw new Error(`borrar cierres: ${error.message}`);
    borrado.cierres = cierres.length;
  }

  const { data: egresos, error: eErr } = await sb.from("admin_egreso").select("id").ilike("nota", `%${MARCA}%`);
  if (eErr) throw new Error(`egresos: ${eErr.message}`);
  if (egresos?.length) {
    const { error } = await sb.from("admin_egreso").delete().in("id", egresos.map((r) => r.id));
    if (error) throw new Error(`borrar egresos: ${error.message}`);
    borrado.egresos = egresos.length;
  }

  return borrado;
}

function exigirEntorno() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Ejemplo: node --env-file=.env.local scripts/limpiar-prueba-semana.mjs");
    process.exit(1);
  }
  return { url, key };
}

const esMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esMain) {
  const { url, key } = exigirEntorno();
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  limpiar(sb)
    .then((b) => {
      console.log("Borrado (solo la tanda de prueba):", b);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
