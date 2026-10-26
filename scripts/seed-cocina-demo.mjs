/**
 * Carga (o imprime) el dataset de cocina demo.
 *
 * Fuente de los datos: src/lib/demo/cocina-demo.json
 * El mismo archivo lo usa el botón "Cargar datos demo" de las listas vacías.
 *
 * No lee archivos de entorno ni imprime secretos. Las llaves tienen que venir
 * ya en el entorno del proceso:
 *
 *   node --env-file=.env.local scripts/seed-cocina-demo.mjs
 *
 * Variables:
 *   NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (solo servidor; no va en el repo)
 *
 * Uso:
 *   node scripts/seed-cocina-demo.mjs --check     # no toca la base
 *   node scripts/seed-cocina-demo.mjs --sql       # imprime el SQL idempotente
 *   node scripts/seed-cocina-demo.mjs --dry-run   # simula, no escribe
 *   node scripts/seed-cocina-demo.mjs             # inserta en el proyecto del entorno
 *
 * Pensado para el proyecto de ensayo bolodemo. No lo corras sobre una base
 * con datos reales: suma filas de ejemplo, no borra nada.
 */
import { readFileSync } from "node:fs";

const datos = JSON.parse(
  readFileSync(new URL("../src/lib/demo/cocina-demo.json", import.meta.url), "utf8"),
);

const NOTA = datos.nota;
const args = new Set(process.argv.slice(2));

/** Misma regla que normalizarNombreCatalogo en src/lib/text.ts. */
function normalizarNombre(nombre) {
  const acentos = new Map([
    [193, "A"],
    [201, "E"],
    [205, "I"],
    [211, "O"],
    [218, "U"],
    [220, "U"],
  ]);
  let out = "";
  for (const ch of nombre.trim().toUpperCase()) {
    out += acentos.get(ch.charCodeAt(0)) ?? ch;
  }
  return out.replace(/\s+/g, " ");
}

function claveLibre(nombre) {
  return nombre.trim().toLowerCase();
}

function sqlStr(valor) {
  if (valor == null) return "null";
  return `'${String(valor).replaceAll("'", "''")}'`;
}

function sqlNum(valor) {
  if (valor == null || Number.isNaN(Number(valor))) return "null";
  return String(Number(valor));
}

function precioBase(insumo) {
  return insumo.cantidadPorCompra > 0
    ? insumo.precioCompraUsd / insumo.cantidadPorCompra
    : insumo.precioCompraUsd;
}

function validar() {
  const errores = [];
  const provs = new Set(datos.proveedores.map((p) => p.nombre));
  const insumos = new Set(datos.insumos.map((i) => i.nombre));
  const recetas = new Set(datos.recetas.map((r) => r.nombre));
  if (!NOTA || !NOTA.includes("demo de bolo")) {
    errores.push("La nota del dataset tiene que incluir «demo de bolo».");
  }
  for (const i of datos.insumos) {
    if (!provs.has(i.proveedor)) errores.push(`Insumo sin proveedor: ${i.nombre}`);
    if (!(i.cantidadPorCompra > 0)) errores.push(`Empaque inválido: ${i.nombre}`);
  }
  for (const r of datos.recetas) {
    if (!(r.porciones >= 1)) errores.push(`Porciones inválidas: ${r.nombre}`);
    for (const ing of r.ingredientes) {
      if (!insumos.has(ing.insumo)) errores.push(`${r.nombre} usa un insumo que no existe: ${ing.insumo}`);
    }
  }
  for (const c of datos.compras) {
    if (!insumos.has(c.insumo)) errores.push(`Compra de insumo desconocido: ${c.insumo}`);
    if (!provs.has(c.proveedor)) errores.push(`Compra sin proveedor: ${c.insumo}`);
  }
  for (const v of datos.ventas) {
    if (!recetas.has(v.receta)) errores.push(`Venta de receta desconocida: ${v.receta}`);
  }
  const nombresCat = [
    ...datos.insumos.map((i) => normalizarNombre(i.nombre)),
    ...datos.recetas.map((r) => normalizarNombre(r.nombre)),
  ];
  if (new Set(nombresCat).size !== nombresCat.length) {
    errores.push("Dos insumos o recetas normalizan al mismo nombre.");
  }
  return errores;
}

/**
 * Stock final = compras (cantidad × empaque) − ventas (cantidad de la receta
 * prorrateada por porciones). El pimentón no tiene compra: queda en cero.
 */
function simularStock() {
  const stock = new Map(datos.insumos.map((i) => [i.nombre, 0]));
  for (const c of datos.compras) {
    const ins = datos.insumos.find((i) => i.nombre === c.insumo);
    stock.set(c.insumo, stock.get(c.insumo) + c.cantidad * ins.cantidadPorCompra);
  }
  for (const v of datos.ventas) {
    const rec = datos.recetas.find((r) => r.nombre === v.receta);
    for (const ing of rec.ingredientes) {
      const consumo = (ing.cantidad * v.cantidad) / rec.porciones;
      stock.set(ing.insumo, Math.max(0, stock.get(ing.insumo) - consumo));
    }
  }
  return stock;
}

function clasificar(stock) {
  const agotados = [];
  const bajos = [];
  const ok = [];
  for (const i of datos.insumos) {
    const libre = stock.get(i.nombre);
    if (libre <= 0) agotados.push(i.nombre);
    else if (libre < i.stockMinimo) bajos.push(i.nombre);
    else ok.push(i.nombre);
  }
  return { agotados, bajos, ok };
}

function faltantesPedido(stock) {
  const necesidad = new Map();
  for (const obj of datos.pedidoEjemplo) {
    const rec = datos.recetas.find((r) => r.nombre === obj.receta);
    for (const ing of rec.ingredientes) {
      const cant = (ing.cantidad * obj.raciones) / rec.porciones;
      necesidad.set(ing.insumo, (necesidad.get(ing.insumo) ?? 0) + cant);
    }
  }
  const faltan = [];
  for (const [nombre, cant] of necesidad) {
    const libre = stock.get(nombre) ?? 0;
    if (cant > libre) faltan.push(nombre);
  }
  return faltan.sort((a, b) => a.localeCompare(b, "es"));
}

function resumenTexto(stock) {
  const { agotados, bajos, ok } = clasificar(stock);
  const faltan = faltantesPedido(stock);
  const servicio = datos.pedidoEjemplo
    .map((o) => `${o.raciones} ${o.receta.toLowerCase()}`)
    .join(", ");
  return [
    `Agotados: ${agotados.join(", ") || "ninguno"}.`,
    `Bajos: ${bajos.join(", ") || "ninguno"}.`,
    `En orden: ${ok.join(", ") || "ninguno"}.`,
    `Pedido de ejemplo (${servicio}) pide: ${faltan.join(", ") || "nada"}.`,
  ].join(" ");
}

function assertHistoria(stock) {
  const { agotados, bajos } = clasificar(stock);
  const faltan = new Set(faltantesPedido(stock));
  const errores = [];
  if (!agotados.includes("Pimentón")) errores.push("Se esperaba pimentón agotado.");
  for (const nombre of ["Harina de maíz precocida", "Queso blanco", "Cebolla", "Parchita", "Aguacate"]) {
    if (!bajos.includes(nombre)) errores.push(`Se esperaba stock bajo: ${nombre}.`);
  }
  if (bajos.includes("Pollo pechuga") || agotados.includes("Pollo pechuga")) {
    errores.push("El pollo debería quedar por encima del mínimo.");
  }
  for (const nombre of ["Harina de maíz precocida", "Queso blanco", "Pollo pechuga", "Cebolla", "Pimentón", "Parchita", "Aguacate"]) {
    if (!faltan.has(nombre)) errores.push(`El pedido de ejemplo debería pedir ${nombre}.`);
  }
  for (const nombre of ["Aceite vegetal", "Sal", "Azúcar"]) {
    if (faltan.has(nombre)) errores.push(`El pedido de ejemplo no debería pedir ${nombre}.`);
  }
  return errores;
}

function generarSql(stock) {
  const lineas = [];
  lineas.push(`-- Cocina demo — dataset chico para un pitch en el proyecto bolodemo.`);
  lineas.push(`-- Fuente: src/lib/demo/cocina-demo.json`);
  lineas.push(`-- Generado con: node scripts/seed-cocina-demo.mjs --sql`);
  lineas.push(`--`);
  lineas.push(`-- NO es una migración. No entra en el orden alfabético de supabase/*.sql`);
  lineas.push(`-- (vive en supabase/demo/). No lo corras en una base con datos reales.`);
  lineas.push(`-- Antes tiene que estar el esquema de cocina, con cocina-zzz-motor-canonico.sql`);
  lineas.push(`-- ya aplicado: las compras y las ventas mueven el stock por trigger.`);
  lineas.push(`--`);
  lineas.push(`-- Idempotente: se puede pegar más de una vez. Solo inserta filas cuya`);
  lineas.push(`-- nota es exactamente «${NOTA}» y que todavía no existen.`);
  lineas.push(`-- No borra nada. Reconoce las filas por esa nota.`);
  lineas.push(`--`);
  lineas.push(`-- Después de cargarlo, con las compras y ventas de ejemplo:`);
  lineas.push(`-- ${resumenTexto(stock)}`);
  lineas.push(`-- Las compras disparan el trigger de stock y las ventas lo descuentan.`);
  lineas.push(`-- El pimentón no tiene compra a propósito: queda agotado para las alertas.`);
  lineas.push(`-- Las ventas llevan tipo_item = 'insumo' (columna que ya usa la app).`);
  lineas.push(``);

  lineas.push(`-- Proveedores`);
  for (const p of datos.proveedores) {
    lineas.push(`insert into public.proveedores (`);
    lineas.push(`  nombre, contacto_nombre, contacto_telefono, contacto_email,`);
    lineas.push(`  acepta_bs_bcv_dolar, acepta_bs_bcv_euro, acepta_bs_paralela,`);
    lineas.push(`  acepta_usd_efectivo, acepta_usd_divisa, notas, activo`);
    lineas.push(`)`);
    lineas.push(`select ${[
      sqlStr(p.nombre),
      sqlStr(p.contactoNombre),
      sqlStr(p.contactoTelefono),
      sqlStr(p.contactoEmail),
      p.aceptaBsBcvDolar,
      p.aceptaBsBcvEuro,
      p.aceptaBsParalela,
      p.aceptaUsdEfectivo,
      p.aceptaUsdDivisa,
      sqlStr(NOTA),
      true,
    ].join(", ")}`);
    lineas.push(`where not exists (`);
    lineas.push(`  select 1 from public.proveedores where lower(nombre) = lower(${sqlStr(p.nombre)})`);
    lineas.push(`);`);
    lineas.push(``);
  }

  lineas.push(`-- Insumos (stock en cero: lo suben las compras de abajo)`);
  for (const i of datos.insumos) {
    const nombre = normalizarNombre(i.nombre);
    lineas.push(`insert into public.insumos (`);
    lineas.push(`  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,`);
    lineas.push(`  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,`);
    lineas.push(`  stock_minimo, proveedor_id, notas, activo`);
    lineas.push(`)`);
    lineas.push(`select ${[
      sqlStr(nombre),
      sqlStr(i.categoria),
      sqlStr(i.unidadCompra),
      sqlNum(i.cantidadPorCompra),
      sqlStr(i.unidadBase),
      sqlNum(i.precioCompraUsd),
      sqlNum(precioBase(i)),
      0,
      0,
      sqlNum(i.stockMinimo),
      `(select id from public.proveedores where lower(nombre) = lower(${sqlStr(i.proveedor)}) limit 1)`,
      sqlStr(NOTA),
      true,
    ].join(", ")}`);
    lineas.push(`where not exists (`);
    lineas.push(`  select 1 from public.insumos where nombre = ${sqlStr(nombre)}`);
    lineas.push(`);`);
    lineas.push(``);
  }

  lineas.push(`-- Recetas`);
  for (const r of datos.recetas) {
    const nombre = normalizarNombre(r.nombre);
    lineas.push(`insert into public.recetas (`);
    lineas.push(`  nombre, categoria, porciones, tiempo_prep_min, tiempo_coccion_min,`);
    lineas.push(`  procedimiento, precio_sugerido_usd, notas_chef, activo`);
    lineas.push(`)`);
    lineas.push(`select ${[
      sqlStr(nombre),
      sqlStr(r.categoria),
      sqlNum(r.porciones),
      r.tiempoPrepMin == null ? "null" : sqlNum(r.tiempoPrepMin),
      r.tiempoCoccionMin == null ? "null" : sqlNum(r.tiempoCoccionMin),
      sqlStr(r.procedimiento),
      sqlNum(r.precioSugeridoUsd),
      sqlStr(NOTA),
      true,
    ].join(", ")}`);
    lineas.push(`where not exists (`);
    lineas.push(`  select 1 from public.recetas where nombre = ${sqlStr(nombre)}`);
    lineas.push(`);`);
    lineas.push(``);
    r.ingredientes.forEach((ing, orden) => {
      const insNombre = normalizarNombre(ing.insumo);
      lineas.push(`insert into public.receta_ingredientes (`);
      lineas.push(`  receta_id, insumo_id, nombre, cantidad, unidad, orden`);
      lineas.push(`)`);
      lineas.push(`select r.id, i.id, ${sqlStr(insNombre)}, ${sqlNum(ing.cantidad)}, ${sqlStr(ing.unidad)}, ${orden}`);
      lineas.push(`from public.recetas r`);
      lineas.push(`join public.insumos i on i.nombre = ${sqlStr(insNombre)}`);
      lineas.push(`where r.nombre = ${sqlStr(nombre)}`);
      lineas.push(`  and r.notas_chef = ${sqlStr(NOTA)}`);
      lineas.push(`  and not exists (`);
      lineas.push(`    select 1 from public.receta_ingredientes ri`);
      lineas.push(`    where ri.receta_id = r.id and ri.nombre = ${sqlStr(insNombre)}`);
      lineas.push(`  );`);
      lineas.push(``);
    });
  }

  lineas.push(`-- Compras (el trigger suma stock y refresca el precio)`);
  for (const c of datos.compras) {
    const insNombre = normalizarNombre(c.insumo);
    lineas.push(`insert into public.compras (`);
    lineas.push(`  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,`);
    lineas.push(`  modalidad_pago, notas, pagada, fecha_pago, numero_factura`);
    lineas.push(`)`);
    lineas.push(`select i.id, p.id, current_date - ${c.diasAtras}, ${sqlNum(c.cantidad)}, ${sqlNum(c.precioTotalUsd)},`);
    lineas.push(`  ${sqlStr(c.modalidadPago)}, ${sqlStr(NOTA)}, ${c.pagada ? "true" : "false"}, ${c.pagada ? `current_date - ${c.diasAtras}` : "null"}, ${sqlStr(c.numeroFactura ?? null)}`);
    lineas.push(`from public.insumos i`);
    lineas.push(`join public.proveedores p on lower(p.nombre) = lower(${sqlStr(c.proveedor)})`);
    lineas.push(`where i.nombre = ${sqlStr(insNombre)}`);
    lineas.push(`  and i.notas = ${sqlStr(NOTA)}`);
    lineas.push(`  and not exists (`);
    lineas.push(`    select 1 from public.compras c where c.insumo_id = i.id and c.notas = ${sqlStr(NOTA)}`);
    lineas.push(`  );`);
    lineas.push(``);
  }

  lineas.push(`-- Ventas (el trigger descuenta los ingredientes de la receta)`);
  for (const v of datos.ventas) {
    const nombre = normalizarNombre(v.receta);
    const total = v.cantidad * v.precioUnitarioUsd;
    lineas.push(`insert into public.ventas (`);
    lineas.push(`  fecha, receta_id, receta_nombre, cantidad, precio_unitario_usd,`);
    lineas.push(`  total_usd, fuente, notas, tipo_item`);
    lineas.push(`)`);
    lineas.push(`select current_date - ${v.diasAtras}, r.id, r.nombre, ${sqlNum(v.cantidad)}, ${sqlNum(v.precioUnitarioUsd)},`);
    lineas.push(`  ${sqlNum(total)}, 'manual', ${sqlStr(NOTA)}, 'insumo'`);
    lineas.push(`from public.recetas r`);
    lineas.push(`where r.nombre = ${sqlStr(nombre)}`);
    lineas.push(`  and r.notas_chef = ${sqlStr(NOTA)}`);
    lineas.push(`  and not exists (`);
    lineas.push(`    select 1 from public.ventas v where v.receta_id = r.id and v.notas = ${sqlStr(NOTA)}`);
    lineas.push(`  );`);
    lineas.push(``);
  }

  lineas.push(`-- Menaje`);
  for (const m of datos.menaje) {
    lineas.push(`insert into public.menaje_items (`);
    lineas.push(`  nombre, categoria, descripcion, cantidad_actual, cantidad_inicial,`);
    lineas.push(`  precio_reposicion_usd, notas, activo`);
    lineas.push(`)`);
    lineas.push(`select ${[
      sqlStr(m.nombre),
      sqlStr(m.categoria),
      sqlStr(m.descripcion),
      sqlNum(m.cantidad),
      sqlNum(m.cantidad),
      sqlNum(m.precioReposicionUsd),
      sqlStr(NOTA),
      true,
    ].join(", ")}`);
    lineas.push(`where not exists (`);
    lineas.push(`  select 1 from public.menaje_items where lower(nombre) = lower(${sqlStr(m.nombre)})`);
    lineas.push(`);`);
    lineas.push(``);
  }

  return lineas.join("\n");
}

function fechaHace(dias) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function exigirEntorno() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const faltan = [];
  if (!url) faltan.push("NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL)");
  if (!key) faltan.push("SUPABASE_SERVICE_ROLE_KEY");
  if (faltan.length) {
    console.error(`Faltan variables de entorno: ${faltan.join(", ")}.`);
    console.error("Pásalas en el entorno (por ejemplo node --env-file=.env.local …).");
    console.error("O pega supabase/demo/cocina-demo-seed.sql en el SQL Editor del proyecto bolodemo.");
    process.exit(1);
  }
  return { url, key };
}

async function insertar(sb, tabla, row) {
  let payload = row;
  let { data, error } = await sb.from(tabla).insert(payload).select("id").single();
  if (error && Object.prototype.hasOwnProperty.call(payload, "tipo_item") && /tipo_item/.test(error.message ?? "")) {
    delete payload.tipo_item;
    ({ data, error } = await sb.from(tabla).insert(payload).select("id").single());
  }
  if (error) {
    throw new Error(`${tabla}: ${error.message}`);
  }
  return data.id;
}

async function cargar(sb) {
  const creados = { proveedores: 0, insumos: 0, recetas: 0, compras: 0, ventas: 0, menaje: 0 };
  const omitidos = [];

  const { data: provRows, error: provErr } = await sb.from("proveedores").select("id, nombre, notas");
  if (provErr) throw new Error(`proveedores: ${provErr.message}`);
  const provPorNombre = new Map((provRows ?? []).map((p) => [claveLibre(p.nombre), p]));

  for (const p of datos.proveedores) {
    const ya = provPorNombre.get(claveLibre(p.nombre));
    if (ya) {
      if (!(ya.notas ?? "").includes("demo de bolo")) omitidos.push(`proveedor ${p.nombre}`);
      continue;
    }
    const id = await insertar(sb, "proveedores", {
      nombre: p.nombre,
      contacto_nombre: p.contactoNombre,
      contacto_telefono: p.contactoTelefono,
      contacto_email: p.contactoEmail,
      acepta_bs_bcv_dolar: p.aceptaBsBcvDolar,
      acepta_bs_bcv_euro: p.aceptaBsBcvEuro,
      acepta_bs_paralela: p.aceptaBsParalela,
      acepta_usd_efectivo: p.aceptaUsdEfectivo,
      acepta_usd_divisa: p.aceptaUsdDivisa,
      notas: NOTA,
      activo: true,
    });
    provPorNombre.set(claveLibre(p.nombre), { id, nombre: p.nombre, notas: NOTA });
    creados.proveedores += 1;
  }

  const { data: insRows, error: insErr } = await sb.from("insumos").select("id, nombre, notas");
  if (insErr) throw new Error(`insumos: ${insErr.message}`);
  const insPorNombre = new Map((insRows ?? []).map((i) => [i.nombre, i]));

  for (const i of datos.insumos) {
    const nombre = normalizarNombre(i.nombre);
    const ya = insPorNombre.get(nombre);
    if (ya) {
      if (!(ya.notas ?? "").includes("demo de bolo")) omitidos.push(`insumo ${nombre}`);
      continue;
    }
    const prov = provPorNombre.get(claveLibre(i.proveedor));
    if (!prov || !(prov.notas ?? "").includes("demo de bolo")) {
      omitidos.push(`insumo ${nombre} (proveedor no es demo)`);
      continue;
    }
    const id = await insertar(sb, "insumos", {
      nombre,
      categoria: i.categoria,
      unidad_compra: i.unidadCompra,
      cantidad_por_compra: i.cantidadPorCompra,
      unidad_base: i.unidadBase,
      precio_compra_usd: i.precioCompraUsd,
      precio_base_usd: precioBase(i),
      stock_actual: 0,
      stock_comprometido: 0,
      stock_minimo: i.stockMinimo,
      proveedor_id: prov.id,
      notas: NOTA,
      activo: true,
    });
    insPorNombre.set(nombre, { id, nombre, notas: NOTA });
    creados.insumos += 1;
  }

  const { data: recRows, error: recErr } = await sb.from("recetas").select("id, nombre, notas_chef");
  if (recErr) throw new Error(`recetas: ${recErr.message}`);
  const recPorNombre = new Map((recRows ?? []).map((r) => [r.nombre, r]));

  for (const r of datos.recetas) {
    const nombre = normalizarNombre(r.nombre);
    let rec = recPorNombre.get(nombre);
    if (!rec) {
      const id = await insertar(sb, "recetas", {
        nombre,
        categoria: r.categoria,
        porciones: r.porciones,
        tiempo_prep_min: r.tiempoPrepMin ?? null,
        tiempo_coccion_min: r.tiempoCoccionMin ?? null,
        procedimiento: r.procedimiento,
        precio_sugerido_usd: r.precioSugeridoUsd,
        notas_chef: NOTA,
        activo: true,
      });
      rec = { id, nombre, notas_chef: NOTA };
      recPorNombre.set(nombre, rec);
      creados.recetas += 1;
    } else if (!(rec.notas_chef ?? "").includes("demo de bolo")) {
      omitidos.push(`receta ${nombre}`);
      continue;
    }
    if (!(rec.notas_chef ?? "").includes("demo de bolo")) continue;
    const { data: ings, error: ingErr } = await sb
      .from("receta_ingredientes")
      .select("nombre")
      .eq("receta_id", rec.id);
    if (ingErr) throw new Error(`receta_ingredientes: ${ingErr.message}`);
    const yaIng = new Set((ings ?? []).map((x) => x.nombre));
    const nuevos = [];
    r.ingredientes.forEach((ing, orden) => {
      const insNombre = normalizarNombre(ing.insumo);
      if (yaIng.has(insNombre)) return;
      const ins = insPorNombre.get(insNombre);
      if (!ins || !(ins.notas ?? "").includes("demo de bolo")) {
        omitidos.push(`ingrediente ${insNombre} de ${nombre}`);
        return;
      }
      nuevos.push({
        receta_id: rec.id,
        insumo_id: ins.id,
        nombre: insNombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        orden,
      });
    });
    if (nuevos.length) {
      const { error } = await sb.from("receta_ingredientes").insert(nuevos);
      if (error) throw new Error(`receta_ingredientes: ${error.message}`);
    }
  }

  const { data: compRows, error: compErr } = await sb
    .from("compras")
    .select("insumo_id")
    .eq("notas", NOTA);
  if (compErr) throw new Error(`compras: ${compErr.message}`);
  const comprasDemo = new Set((compRows ?? []).map((c) => c.insumo_id));

  for (const c of datos.compras) {
    const insNombre = normalizarNombre(c.insumo);
    const ins = insPorNombre.get(insNombre);
    const prov = provPorNombre.get(claveLibre(c.proveedor));
    if (!ins || !(ins.notas ?? "").includes("demo de bolo") || !prov) {
      omitidos.push(`compra ${insNombre}`);
      continue;
    }
    if (comprasDemo.has(ins.id)) continue;
    await insertar(sb, "compras", {
      insumo_id: ins.id,
      proveedor_id: prov.id,
      fecha: fechaHace(c.diasAtras),
      cantidad: c.cantidad,
      precio_total_usd: c.precioTotalUsd,
      modalidad_pago: c.modalidadPago,
      notas: NOTA,
      pagada: c.pagada,
      fecha_pago: c.pagada ? fechaHace(c.diasAtras) : null,
      numero_factura: c.numeroFactura ?? null,
    });
    comprasDemo.add(ins.id);
    creados.compras += 1;
  }

  const { data: venRows, error: venErr } = await sb
    .from("ventas")
    .select("receta_id")
    .eq("notas", NOTA);
  if (venErr) throw new Error(`ventas: ${venErr.message}`);
  const ventasDemo = new Set((venRows ?? []).map((v) => v.receta_id));

  for (const v of datos.ventas) {
    const nombre = normalizarNombre(v.receta);
    const rec = recPorNombre.get(nombre);
    if (!rec || !(rec.notas_chef ?? "").includes("demo de bolo")) {
      omitidos.push(`venta ${nombre}`);
      continue;
    }
    if (ventasDemo.has(rec.id)) continue;
    const row = {
      fecha: fechaHace(v.diasAtras),
      receta_id: rec.id,
      receta_nombre: rec.nombre,
      cantidad: v.cantidad,
      precio_unitario_usd: v.precioUnitarioUsd,
      total_usd: v.cantidad * v.precioUnitarioUsd,
      fuente: "manual",
      notas: NOTA,
      tipo_item: "insumo",
    };
    await insertar(sb, "ventas", row);
    ventasDemo.add(rec.id);
    creados.ventas += 1;
  }

  const { data: menRows, error: menErr } = await sb.from("menaje_items").select("id, nombre, notas");
  if (menErr) throw new Error(`menaje_items: ${menErr.message}`);
  const menPorNombre = new Map((menRows ?? []).map((m) => [claveLibre(m.nombre), m]));
  for (const m of datos.menaje) {
    const ya = menPorNombre.get(claveLibre(m.nombre));
    if (ya) {
      if (!(ya.notas ?? "").includes("demo de bolo")) omitidos.push(`menaje ${m.nombre}`);
      continue;
    }
    await insertar(sb, "menaje_items", {
      nombre: m.nombre,
      categoria: m.categoria,
      descripcion: m.descripcion,
      cantidad_actual: m.cantidad,
      cantidad_inicial: m.cantidad,
      precio_reposicion_usd: m.precioReposicionUsd,
      notas: NOTA,
      activo: true,
    });
    creados.menaje += 1;
  }

  return { creados, omitidos };
}

function imprimirSimulacion(stock) {
  console.log(resumenTexto(stock));
  console.log("Stock simulado:");
  for (const i of datos.insumos) {
    const libre = stock.get(i.nombre);
    const estado = libre <= 0 ? "agotado" : libre < i.stockMinimo ? "bajo" : "ok";
    console.log(`  ${i.nombre}: ${libre} ${i.unidadBase} (mín ${i.stockMinimo}) ${estado}`);
  }
}

async function main() {
  const errores = [...validar()];
  const stock = simularStock();
  errores.push(...assertHistoria(stock));
  if (errores.length) {
    console.error(errores.join("\n"));
    process.exit(1);
  }

  if (args.has("--sql")) {
    process.stdout.write(`${generarSql(stock)}\n`);
    return;
  }

  imprimirSimulacion(stock);
  if (args.has("--check")) {
    console.log("Chequeo del dataset demo: ok.");
    return;
  }
  if (args.has("--dry-run")) {
    console.log("Dry-run: no se escribió nada.");
    return;
  }

  const { url, key } = exigirEntorno();
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { creados, omitidos } = await cargar(sb);
  console.log("Creados:", creados);
  if (omitidos.length) console.log("Omitidos (ya había un homónimo que no es demo):", omitidos.join(", "));
  const total = Object.values(creados).reduce((s, n) => s + n, 0);
  console.log(total === 0 ? "No había nada nuevo: el demo ya estaba cargado." : "Listo.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
