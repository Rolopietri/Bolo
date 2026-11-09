// Gastos fijos (src/lib/gastos-fijos.ts).
// Cuentas puras, sin base. Se corre con `npm run test:gastos`.

import {
  CRITERIO_SEMANA,
  GASTOS_PRUEBA,
  categoriaDeNombre,
  egresoCubiertoPorFijo,
  esClasificacionFija,
  gastoDesdeFila,
  rangoMes,
  restarGastos,
  resumirGastos,
  trozosDelRango,
  usdDesdeMonto,
  usdEnRango,
} from "../src/lib/gastos-fijos.ts";

let fallas = 0;
function igual(nombre, real, esperado) {
  const ok =
    typeof esperado === "number"
      ? typeof real === "number" && Math.abs(real - esperado) < 0.001
      : JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) {
    fallas++;
    console.error(`✕ ${nombre}: salió ${JSON.stringify(real)}, se esperaba ${JSON.stringify(esperado)}`);
  }
}

function gasto(parcial) {
  return {
    id: parcial.id ?? parcial.categoria,
    categoria: parcial.categoria,
    monto: parcial.montoUsd,
    moneda: "USD",
    tasa: null,
    montoUsd: parcial.montoUsd,
    fecha: parcial.fecha,
    nota: null,
    recurrente: parcial.recurrente ?? false,
  };
}

const prueba = GASTOS_PRUEBA.map((g) =>
  gasto({ categoria: g.categoria, montoUsd: g.monto, fecha: g.fecha, recurrente: true }),
);

igual("criterio menciona el reparto por días", CRITERIO_SEMANA.includes("días del mes"), true);
igual("alquiler", categoriaDeNombre("Alquiler"), "alquiler");
igual("nómina con acento", categoriaDeNombre("Nómina"), "nomina");
igual("servicios", categoriaDeNombre("Servicios"), "servicios");
igual("otros cae en otro", categoriaDeNombre("Otros"), "otro");
igual("gas de cocina no es la categoría gas", categoriaDeNombre("Gas de cocina"), null);
igual("insumos no es fijo", categoriaDeNombre("Insumos"), null);
igual("clasificación fija", esClasificacionFija("Fijo"), true);
igual("variable no es fija", esClasificacionFija("variable"), false);

igual("usd tal cual", usdDesdeMonto(22, "USD", null), 22);
igual("bolívares entre la tasa", usdDesdeMonto(4500, "Bs", 50), 90);
igual("bolívares sin tasa no se inventan", usdDesdeMonto(4500, "Bs", null), null);
igual("tasa cero no divide", usdDesdeMonto(100, "Bs", 0), null);

igual(
  "noviembre tiene 30 y la semana entra toda",
  trozosDelRango("2026-11-02", "2026-11-08"),
  [{ mes: "2026-11", dias: 7, diasMes: 30, desde: "2026-11-02", hasta: "2026-11-08" }],
);
igual(
  "semana que cruza de octubre a noviembre",
  trozosDelRango("2026-10-26", "2026-11-01").map((t) => [t.mes, t.dias, t.diasMes]),
  [
    ["2026-10", 6, 31],
    ["2026-11", 1, 30],
  ],
);

const octubre = rangoMes("2026-10");
const semana = resumirGastos(prueba, "2026-11-02", "2026-11-08");
igual("semana 2–8 nov: alquiler", semana.porCategoria[0].usd, 210);
igual("semana 2–8 nov: nómina", semana.porCategoria[1].usd, 140);
igual("semana 2–8 nov: servicios", semana.porCategoria[2].usd, 70);
igual("semana 2–8 nov: total prorrateado", semana.totalUsd, 420);

const mesOct = resumirGastos(prueba, octubre.desde, octubre.hasta);
igual("octubre completo", mesOct.totalUsd, 1800);
igual("noviembre completo", resumirGastos(prueba, "2026-11-01", "2026-11-30").totalUsd, 1800);

const cruce = resumirGastos(prueba, "2026-10-26", "2026-11-01");
igual("cruce: alquiler 6/31 + 1/30", cruce.porCategoria.find((c) => c.categoria === "alquiler").usd, 204.19);
igual("cruce: nómina", cruce.porCategoria.find((c) => c.categoria === "nomina").usd, 136.13);
igual("cruce: servicios", cruce.porCategoria.find((c) => c.categoria === "servicios").usd, 68.06);
igual("cruce: total", cruce.totalUsd, 408.38);

const semanasNov = [
  ["2026-10-26", "2026-11-01"],
  ["2026-11-02", "2026-11-08"],
  ["2026-11-09", "2026-11-15"],
  ["2026-11-16", "2026-11-22"],
  ["2026-11-23", "2026-11-29"],
  ["2026-11-30", "2026-12-06"],
];
let sumaNov = 0;
for (const [desde, hasta] of semanasNov) {
  const parte = resumirGastos(prueba, desde, hasta);
  let soloNov = 0;
  for (const g of prueba) {
    const enNov = usdEnRango(g, desde > "2026-11-01" ? desde : "2026-11-01", hasta < "2026-11-30" ? hasta : "2026-11-30");
    soloNov += enNov;
  }
  sumaNov += Math.round(soloNov * 100) / 100;
  if (desde === "2026-11-02") igual("la semana del 2 coincide con el rango de noviembre", parte.totalUsd, 420);
}
igual("las semanas de noviembre suman el mes", Math.round(sumaNov * 100) / 100, 1800);

const unaVez = gasto({ categoria: "gas", montoUsd: 22, fecha: "2026-11-03", recurrente: false });
igual("gasto de un día entra en su semana", usdEnRango(unaVez, "2026-11-02", "2026-11-08"), 22);
igual("gasto de un día no entra en otra semana", usdEnRango(unaVez, "2026-11-09", "2026-11-15"), 0);
igual("antes de la fecha de arranque no hay nada", resumirGastos(prueba, "2026-09-01", "2026-09-30").totalUsd, 0);

const aMitad = gasto({ categoria: "alquiler", montoUsd: 310, fecha: "2026-10-15", recurrente: true });
igual("el mes de arranque cuenta desde el día", usdEnRango(aMitad, "2026-10-01", "2026-10-31"), 170);
igual("el mes siguiente ya es el monto entero", usdEnRango(aMitad, "2026-11-01", "2026-11-30"), 310);

const gasVariable = { fecha: "2026-10-30", categoria: "Servicios", clasificacion: "variable" };
const alquilerFijo = { fecha: "2026-10-05", categoria: "Alquiler", clasificacion: "fija" };
const alquilerAntes = { fecha: "2026-09-05", categoria: "Alquiler", clasificacion: "fija" };
igual("el gas variable no se borra por el fijo de servicios", egresoCubiertoPorFijo(gasVariable, prueba), false);
igual("el alquiler fijo del mes no se suma otra vez", egresoCubiertoPorFijo(alquilerFijo, prueba), true);
igual("un fijo de antes de arrancar sí cuenta", egresoCubiertoPorFijo(alquilerAntes, prueba), false);
igual("sin gasto fijo, el egreso fijo sigue contando", egresoCubiertoPorFijo(alquilerFijo, []), false);

const fila = gastoDesdeFila({
  id: "1",
  categoria: "nomina",
  monto: "600.00",
  moneda: "USD",
  tasa: null,
  monto_usd: "600.00",
  fecha: "2026-10-01",
  nota: "(prueba) seed-prueba-semana",
  recurrente: true,
});
igual("fila de la base", fila && fila.montoUsd, 600);
igual("categoría desconocida se descarta", gastoDesdeFila({ categoria: "insumos", fecha: "2026-10-01", monto_usd: 5 }), null);

// Semana del 2 al 8 nov, con las ventas de prueba ($223) y sin pérdidas en esa semana.
const semanaComida = restarGastos(223 - 19.47, 420);
igual("utilidad de la semana antes de fijos", semanaComida.antes, 203.53);
igual("utilidad de la semana después de fijos", semanaComida.despues, -216.47);

// Octubre de prueba: ventas $398 − food cost $35.14 − pérdida $0.32.
const octubreComida = restarGastos(398 - 35.14 - 0.32, 1800);
igual("utilidad de octubre antes de fijos", octubreComida.antes, 362.54);
igual("utilidad de octubre después de fijos", octubreComida.despues, -1437.46);

// Estado de cuenta de octubre: ventas − compras (87) − gas (22), y después los fijos.
const octubreCaja = restarGastos(398 - 87 - 22, 1800);
igual("balance de octubre antes de fijos", octubreCaja.antes, 289);
igual("balance de octubre después de fijos", octubreCaja.despues, -1511);

if (fallas > 0) {
  console.error(`\n${fallas} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("Gastos fijos: todas las cuentas cierran.");
console.log("Ejemplo semana 2–8 nov: antes $203.53, fijos $420.00, después −$216.47.");
console.log("Ejemplo octubre: comida antes $362.54, después −$1,437.46. Caja antes $289.00, después −$1,511.00.");
