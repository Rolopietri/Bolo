/**
 * Carga 7 días de datos de prueba para la demo de Administración.
 *
 * Días: 2026-10-28 → 2026-11-03 (inclusive).
 * Usa las recetas que ya existen (SANDUCHE DE CARNE PRUEBA y CHILLICHESE PRUEBA)
 * y los insumos PRUEBA. No crea catálogo nuevo.
 *
 * Todo texto libre lleva «(prueba)» y la marca seed-prueba-semana, para que
 * `scripts/limpiar-prueba-semana.mjs` borre solo esto.
 *
 * Idempotente: cada corrida limpia la tanda anterior y la vuelve a cargar.
 * Orden: compras (suben stock) → ventas (lo descuentan) → una pérdida.
 *
 *   node --env-file=.env.local scripts/seed-prueba-semana.mjs
 *   node --env-file=.env.local scripts/seed-prueba-semana.mjs --dry-run
 */
import { pathToFileURL } from "node:url";
import { limpiar } from "./limpiar-prueba-semana.mjs";

const MARCA = "seed-prueba-semana";
const NOTA = `(prueba) ${MARCA}`;

const RECETA_SANDUCHE = "SANDUCHE DE CARNE PRUEBA";
const RECETA_CHILLI = "CHILLICHESE PRUEBA";
const PRECIO_SANDUCHE = 10;
const PRECIO_CHILLI = 19;

const INSUMO_HARINA = "HARINA DE MAIZ PRECOCIDA (PRUEBA 1)";
const INSUMO_CARNE = "CARNE MOLIDA (PRUEBA 4)";
const INSUMO_CEBOLLA = "CEBOLLA (PRUEBA 10)";

/** Unidades por día. El sábado es el día fuerte. */
const DIAS = [
  { fecha: "2026-10-28", sanduche: 3, chilli: 2, caja: 0 },
  { fecha: "2026-10-29", sanduche: 4, chilli: 3, caja: 0 },
  { fecha: "2026-10-30", sanduche: 4, chilli: 3, caja: -15 },
  { fecha: "2026-10-31", sanduche: 6, chilli: 4, caja: 20 },
  { fecha: "2026-11-01", sanduche: 3, chilli: 2, caja: 0 },
  { fecha: "2026-11-02", sanduche: 4, chilli: 3, caja: 0 },
  { fecha: "2026-11-03", sanduche: 5, chilli: 4, caja: -8 },
];

const PERDIDA_G = 400;
const EGRESO_GAS_USD = 22;
const FLETE_CARNE_USD = 5;

const dry = process.argv.includes("--dry-run");

function exigirEntorno() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const faltan = [];
  if (!url) faltan.push("NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL)");
  if (!key) faltan.push("SUPABASE_SERVICE_ROLE_KEY");
  if (faltan.length) {
    console.error(`Faltan variables de entorno: ${faltan.join(", ")}.`);
    console.error("Ejemplo: node --env-file=.env.local scripts/seed-prueba-semana.mjs");
    process.exit(1);
  }
  return { url, key };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function ventasDelDia(d) {
  return round2(d.sanduche * PRECIO_SANDUCHE + d.chilli * PRECIO_CHILLI);
}

/**
 * Parte el objetivo en efectivo USD y pago móvil Bs de modo que, al pasar
 * los bolívares con la tasa, el total en dólares caiga en el objetivo al centavo.
 */
function partirCaja(objetivoUsd, tasa) {
  const objetivo = round2(objetivoUsd);
  if (!(tasa > 0)) throw new Error("Sin tasa BCV no se puede armar el pago móvil.");
  const bs = round2(objetivo * 0.4 * tasa);
  const usdDesdeBs = round2(bs / tasa);
  let efectivo = round2(objetivo - usdDesdeBs);
  let total = round2(efectivo + bs / tasa);
  if (total !== objetivo) {
    efectivo = round2(efectivo + (objetivo - total));
    total = round2(efectivo + bs / tasa);
  }
  if (efectivo < 0) throw new Error(`Efectivo negativo al armar la caja de ${objetivo}.`);
  if (total !== objetivo) {
    throw new Error(`La caja no cae en ${objetivo}: dio ${total} (efectivo ${efectivo}, Bs ${bs}, tasa ${tasa}).`);
  }
  return { efectivo, bs, total };
}

function notaCaja(delta) {
  if (delta > 0) return `${NOTA} · sobró en caja`;
  if (delta < 0) return `${NOTA} · faltó en caja`;
  return NOTA;
}

async function main() {
  const { url, key } = exigirEntorno();
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: recetas, error: recErr } = await sb
    .from("recetas")
    .select("id, nombre, precio_sugerido_usd")
    .in("nombre", [RECETA_SANDUCHE, RECETA_CHILLI]);
  if (recErr) throw new Error(recErr.message);
  const sanduche = (recetas ?? []).find((r) => r.nombre === RECETA_SANDUCHE);
  const chilli = (recetas ?? []).find((r) => r.nombre === RECETA_CHILLI);
  if (!sanduche || !chilli) {
    throw new Error("Faltan las recetas de prueba (sanduche o chillichese). No se creó nada.");
  }

  const { data: insumos, error: insErr } = await sb
    .from("insumos")
    .select("id, nombre, precio_base_usd, cantidad_por_compra, proveedor_id, stock_actual")
    .in("nombre", [INSUMO_HARINA, INSUMO_CARNE, INSUMO_CEBOLLA]);
  if (insErr) throw new Error(insErr.message);
  const porNombre = new Map((insumos ?? []).map((i) => [i.nombre, i]));
  const harina = porNombre.get(INSUMO_HARINA);
  const carne = porNombre.get(INSUMO_CARNE);
  const cebolla = porNombre.get(INSUMO_CEBOLLA);
  if (!harina || !carne || !cebolla) {
    throw new Error("Faltan insumos PRUEBA (harina, carne o cebolla). No se creó nada.");
  }

  const { data: tasas, error: tasaErr } = await sb
    .from("tasa_bcv")
    .select("fecha, usd_bs")
    .gte("fecha", DIAS[0].fecha)
    .lte("fecha", DIAS[DIAS.length - 1].fecha);
  if (tasaErr) throw new Error(tasaErr.message);
  const tasaDe = new Map((tasas ?? []).map((t) => [String(t.fecha).slice(0, 10), Number(t.usd_bs)]));
  for (const d of DIAS) {
    if (!(tasaDe.get(d.fecha) > 0)) throw new Error(`No hay tasa BCV para ${d.fecha}.`);
  }

  const precioHarina = round2(Number(harina.precio_base_usd) * Number(harina.cantidad_por_compra));
  const precioCarne = round2(Number(carne.precio_base_usd) * Number(carne.cantidad_por_compra) * 2);
  const valorPerdida = round2(PERDIDA_G * Number(cebolla.precio_base_usd));

  let ventasUsd = 0;
  console.log("Plan de la semana de prueba:");
  for (const d of DIAS) {
    const v = ventasDelDia(d);
    ventasUsd = round2(ventasUsd + v);
    const caja = partirCaja(v + d.caja, tasaDe.get(d.fecha));
    const estado = d.caja === 0 ? "cuadra" : d.caja > 0 ? `sobra ${d.caja}` : `falta ${Math.abs(d.caja)}`;
    console.log(
      `  ${d.fecha}  ventas $${v.toFixed(2)}  caja $${caja.total.toFixed(2)} (${estado})  efectivo $${caja.efectivo.toFixed(2)}  pago móvil Bs ${caja.bs.toFixed(2)}`,
    );
  }
  console.log(`Ventas 7 días: $${ventasUsd.toFixed(2)}`);
  console.log(`Compras: harina $${precioHarina.toFixed(2)} + carne $${precioCarne.toFixed(2)} + flete $${FLETE_CARNE_USD.toFixed(2)}`);
  console.log(`Pérdida cebolla: $${valorPerdida.toFixed(2)} · Gas: $${EGRESO_GAS_USD.toFixed(2)}`);

  if (dry) {
    console.log("Dry-run: no se escribió nada.");
    return;
  }

  const borrado = await limpiar(sb);
  console.log("Limpieza previa:", borrado);

  const compras = [
    {
      insumo: harina,
      cantidad: 1,
      precio_total_usd: precioHarina,
      flete_usd: null,
    },
    {
      insumo: carne,
      cantidad: 2,
      precio_total_usd: precioCarne,
      flete_usd: FLETE_CARNE_USD,
    },
  ];
  for (const c of compras) {
    const { error } = await sb.from("compras").insert({
      insumo_id: c.insumo.id,
      proveedor_id: c.insumo.proveedor_id,
      fecha: "2026-10-28",
      cantidad: c.cantidad,
      precio_total_usd: c.precio_total_usd,
      flete_usd: c.flete_usd,
      cantidad_por_compra_snap: Number(c.insumo.cantidad_por_compra),
      modalidad_pago: "efectivo",
      notas: NOTA,
      pagada: true,
      fecha_pago: "2026-10-28",
    });
    if (error) throw new Error(`compras: ${error.message}`);
  }

  const filasVenta = [];
  for (const d of DIAS) {
    filasVenta.push({
      fecha: d.fecha,
      receta_id: sanduche.id,
      receta_nombre: sanduche.nombre,
      cantidad: d.sanduche,
      precio_unitario_usd: PRECIO_SANDUCHE,
      total_usd: round2(d.sanduche * PRECIO_SANDUCHE),
      fuente: "manual",
      notas: NOTA,
      es_merma: false,
    });
    filasVenta.push({
      fecha: d.fecha,
      receta_id: chilli.id,
      receta_nombre: chilli.nombre,
      cantidad: d.chilli,
      precio_unitario_usd: PRECIO_CHILLI,
      total_usd: round2(d.chilli * PRECIO_CHILLI),
      fuente: "manual",
      notas: NOTA,
      es_merma: false,
    });
  }
  const { error: venErr } = await sb.from("ventas").insert(filasVenta);
  if (venErr) throw new Error(`ventas: ${venErr.message}`);

  const { data: perdida, error: perErr } = await sb.rpc("registrar_perdida_stock", {
    p_insumo_id: cebolla.id,
    p_tipo: "merma",
    p_cantidad: PERDIDA_G,
    p_motivo: "(prueba)",
    p_fecha: "2026-10-30",
    p_nota: NOTA,
  });
  if (perErr) throw new Error(`pérdida: ${perErr.message}`);
  const mov = Array.isArray(perdida) ? perdida[0] : perdida;
  if (mov?.id) {
    const { error: valErr } = await sb.from("stock_movimientos").update({ valor_usd: valorPerdida }).eq("id", mov.id);
    if (valErr) throw new Error(`valor de la pérdida: ${valErr.message}`);
  }

  for (const d of DIAS) {
    const tasa = tasaDe.get(d.fecha);
    const objetivo = round2(ventasDelDia(d) + d.caja);
    const partes = partirCaja(objetivo, tasa);
    const { data: cierre, error: cErr } = await sb
      .from("cierre_caja")
      .insert({
        fecha: d.fecha,
        nota: notaCaja(d.caja),
        tasa_usd_bs: tasa,
        tasa_fecha: d.fecha,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(`cierre ${d.fecha}: ${cErr.message}`);
    const { error: lErr } = await sb.from("cierre_caja_linea").insert([
      {
        cierre_id: cierre.id,
        metodo: "efectivo_usd",
        moneda: "USD",
        monto: partes.efectivo,
        monto_usd: partes.efectivo,
      },
      {
        cierre_id: cierre.id,
        metodo: "pago_movil",
        moneda: "Bs",
        monto: partes.bs,
        monto_usd: round2(partes.bs / tasa),
      },
    ]);
    if (lErr) throw new Error(`líneas ${d.fecha}: ${lErr.message}`);
  }

  const { error: egErr } = await sb.from("admin_egreso").insert({
    fecha: "2026-10-30",
    concepto: "Gas de cocina (prueba)",
    categoria_nombre: "Servicios",
    clasificacion: "variable",
    monto: EGRESO_GAS_USD,
    moneda: "USD",
    monto_usd: EGRESO_GAS_USD,
    metodo: "Efectivo",
    nota: NOTA,
    pagada: true,
    fecha_pago: "2026-10-30",
  });
  if (egErr) throw new Error(`egreso: ${egErr.message}`);

  const ids = [harina.id, carne.id, cebolla.id];
  const { data: despues, error: stErr } = await sb.from("insumos").select("nombre, stock_actual").in("id", ids);
  if (stErr) throw new Error(stErr.message);
  console.log("Stock después de la carga:");
  for (const i of despues ?? []) {
    const stock = Number(i.stock_actual);
    console.log(`  ${i.nombre}: ${stock}`);
    if (stock < 0) throw new Error(`Stock negativo en ${i.nombre}.`);
  }
  const carneFinal = (despues ?? []).find((i) => i.nombre === INSUMO_CARNE);
  const harinaFinal = (despues ?? []).find((i) => i.nombre === INSUMO_HARINA);
  if (!(Number(carneFinal?.stock_actual) > 0) || !(Number(harinaFinal?.stock_actual) > 0)) {
    throw new Error("La carne o la harina quedaron en cero: la venta se comió más de lo comprado.");
  }

  console.log("Listo. Para borrar solo esta tanda: node --env-file=.env.local scripts/limpiar-prueba-semana.mjs");
}

const esMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
