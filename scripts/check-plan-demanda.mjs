// Plan por demanda (Fase C): comprueba el cálculo real end-to-end
// (ventas → resumirConsumo → planDemanda), sin base de datos.
// Se corre con `npm run test:plan`.

import {
  resumirConsumo,
  inicioVentana,
  fechaISOEnCaracas,
} from "../src/lib/stock-liviano.ts";
import { planDemanda, HORIZONTE_DEFAULT_DIAS } from "../src/lib/plan-demanda.ts";

let fallas = 0;
function casi(nombre, real, esperado) {
  const ok = typeof real === "number" && Math.abs(real - esperado) < 0.001;
  if (!ok) {
    fallas++;
    console.error(`  ✕ ${nombre}: salió ${real}, se esperaba ${esperado}`);
  } else {
    console.log(`  ✓ ${nombre} = ${Math.round(real * 1000) / 1000}`);
  }
}
function igual(nombre, real, esperado) {
  if (real !== esperado) {
    fallas++;
    console.error(`  ✕ ${nombre}: salió ${real}, se esperaba ${esperado}`);
  } else {
    console.log(`  ✓ ${nombre} = ${real}`);
  }
}

const hoy = fechaISOEnCaracas();
const desde = inicioVentana(hoy);
function diasAtras(n) {
  const d = new Date(hoy + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function insumo(extra) {
  return {
    id: "lomito",
    nombre: "Lomito",
    categoria: "",
    unidadCompra: "kg",
    cantidadPorCompra: 1,
    unidadBase: "kg",
    precioCompraUsd: null,
    precioBaseUsd: null,
    stockTotal: 2, // crudo
    seProcesa: true,
    stockProcesado: 6,
    stockComprometido: 0,
    stockMinimo: null,
    mermaCoccionPorc: 25,
    horizonteDias: 7,
    activo: true,
    ...extra,
  };
}

console.log("── Escenario del doc (lomito ~1.2 kg/día, horizonte 7, merma 25%) ──");
// 4 días con venta de 4.2 kg = 16.8 kg en la ventana → 16.8/14 = 1.2 kg/día.
const salidas = [1, 3, 6, 9].map((n) => ({
  insumoId: "lomito",
  fecha: diasAtras(n),
  cantidad: 4.2,
}));
const consumo = resumirConsumo(salidas, desde, hoy);
const [l] = planDemanda([insumo()], consumo);
console.log(
  `  Respuesta: Procesa ${Math.round(l.faltaProcesar * 100) / 100} kg · Compra ${Math.round(l.aComprar * 100) / 100} kg en crudo`,
);
casi("ritmo diario", l.ritmoDiario, 1.2);
casi("necesidad (1.2×7)", l.necesidad, 8.4);
casi("falta procesar (8.4−6)", l.faltaProcesar, 2.4);
casi("crudo necesario (2.4÷0.75)", l.crudoNecesario, 3.2);
casi("a comprar (3.2−2)", l.aComprar, 1.2);

console.log("── Horizonte por defecto cuando el insumo no define uno ──");
const [l2] = planDemanda([insumo({ horizonteDias: null })], consumo);
igual("usa horizonte 14", l2.horizonteDias, HORIZONTE_DEFAULT_DIAS);
casi("necesidad (1.2×14)", l2.necesidad, 16.8);

console.log("── Sin ventas suficientes → sin datos, sin acción ──");
const [l3] = planDemanda([insumo()], new Map());
igual("sinDatos", l3.sinDatos, true);
casi("a comprar = 0", l3.aComprar, 0);
casi("falta procesar = 0", l3.faltaProcesar, 0);

console.log("── Ya hay procesado de sobra → no hace falta procesar ni comprar ──");
const [l4] = planDemanda([insumo({ stockProcesado: 100 })], consumo);
casi("falta procesar = 0", l4.faltaProcesar, 0);
casi("a comprar = 0", l4.aComprar, 0);

console.log("── Un insumo que NO se procesa no entra al plan ──");
const plan5 = planDemanda([insumo({ seProcesa: false })], consumo);
igual("plan vacío", plan5.length, 0);

if (fallas > 0) {
  console.error(`\n✕ Plan por demanda: ${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\n✓ Plan por demanda: todos los casos cuadran.");
