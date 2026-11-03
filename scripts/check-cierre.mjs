// Cierre de caja (src/lib/cierre-caja.ts).
// Cuentas puras, sin base. Se corre con `npm run test:cierre`.

import { readFileSync } from "node:fs";
import { fmtUsd } from "../src/lib/moneda.ts";
import {
  compararCaja,
  etiquetaFecha,
  formatoMonto,
  hoyCaracas,
  monedaCanon,
  parseMonto,
  prepararLineas,
  resumenCajaSemana,
  totalesCaja,
} from "../src/lib/cierre-caja.ts";

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

igual("vacío es cero", parseMonto(""), 0);
igual("espacios", parseMonto("  "), 0);
igual("entero", parseMonto("120"), 120);
igual("dólar con punto", parseMonto("120.50"), 120.5);
igual("dólar con coma", parseMonto("120,50"), 120.5);
igual("un decimal", parseMonto("120,5"), 120.5);
igual("miles con punto", parseMonto("4.500"), 4500);
igual("punto de venta del ejemplo", parseMonto("3.200"), 3200);
igual("miles y céntimos", parseMonto("4.500,25"), 4500.25);
igual("miles en dólares con coma", parseMonto("1,234.56"), 1234.56);
igual("millones", parseMonto("4.500.000"), 4500000);
igual("cero", parseMonto("0"), 0);
igual("negativo no", parseMonto("-5"), null);
igual("texto no", parseMonto("abc"), null);
igual("cuatro decimales no", parseMonto("1.2345"), null);
igual("formato entero", formatoMonto(4500), "4500");
igual("formato con centavos", formatoMonto(120.5), "120.50");
igual("formato cero queda vacío", formatoMonto(0), "");

igual("zelle es dólares", monedaCanon("zelle", "Bs"), "USD");
igual("pago móvil es bolívares", monedaCanon("pago_movil", "USD"), "Bs");
igual("otro respeta la moneda", monedaCanon("otro", "USD"), "USD");

const ejemplo = [
  { metodo: "efectivo_usd", moneda: "USD", monto: 120 },
  { metodo: "pago_movil", moneda: "Bs", monto: 4500 },
  { metodo: "punto", moneda: "Bs", monto: 3200 },
];

igual("ejemplo a 40", totalesCaja(ejemplo, 40).usd, 312.5);
igual("ejemplo en bolívares", totalesCaja(ejemplo, 40).bs, 12500);
igual(
  "tasa 36,50 redondea al centavo",
  totalesCaja(
    [
      { metodo: "efectivo_usd", moneda: "USD", monto: 120 },
      { metodo: "pago_movil", moneda: "Bs", monto: 4500 },
    ],
    36.5,
  ).usd,
  243.29,
);

const cuadra = compararCaja({ lineas: ejemplo, tasaUsdBs: 40, ventasUsd: 312.5, hayRegistro: true });
igual("cuadra", cuadra.estado, "cuadra");
igual("cuadra en cero", cuadra.diferenciaUsd, 0);
igual("título cuadra", cuadra.titulo, "Cuadra");

const sobra = compararCaja({ lineas: ejemplo, tasaUsdBs: 40, ventasUsd: 300, hayRegistro: true });
igual("sobra", sobra.estado, "sobra");
igual("sobra 12.50", sobra.diferenciaUsd, 12.5);
igual("título sobra", sobra.titulo, `Sobra ${fmtUsd(12.5)}`);
igual("el formato del título es el de moneda", sobra.titulo, "Sobra $12.50");

const falta = compararCaja({ lineas: ejemplo, tasaUsdBs: 40, ventasUsd: 320, hayRegistro: true });
igual("falta", falta.estado, "falta");
igual("falta 7.50", falta.diferenciaUsd, -7.5);
igual("título falta", falta.titulo, "Falta $7.50");

const sinTasa = compararCaja({ lineas: ejemplo, tasaUsdBs: null, ventasUsd: 300, hayRegistro: true });
igual("sin tasa no compara", sinTasa.estado, "sin_tasa");
igual("sin tasa no inventa dólares", sinTasa.cajaUsd, null);

const soloUsd = compararCaja({
  lineas: [{ metodo: "efectivo_usd", moneda: "USD", monto: 120 }],
  tasaUsdBs: null,
  ventasUsd: 100,
  hayRegistro: true,
});
igual("solo dólares no necesita tasa", soloUsd.estado, "sobra");
igual("solo dólares", soloUsd.diferenciaUsd, 20);

const vacio = compararCaja({ lineas: [], tasaUsdBs: 40, ventasUsd: 80, hayRegistro: false });
igual("sin anotar no dice que falta", vacio.estado, "vacio");

const ceroGuardado = compararCaja({ lineas: [], tasaUsdBs: 40, ventasUsd: 80, hayRegistro: true });
igual("cierre en cero sí falta", ceroGuardado.estado, "falta");
igual("cierre en cero", ceroGuardado.diferenciaUsd, -80);

const preparadas = prepararLineas(
  [
    { metodo: "zelle", moneda: "Bs", monto: 40 },
    { metodo: "efectivo_bs", moneda: "Bs", monto: 0 },
    { metodo: "otro", moneda: "USD", monto: 10, etiqueta: "  Reserva  " },
    { metodo: "pago_movil", moneda: "Bs", monto: 4000 },
  ],
  40,
);
igual(
  "prepara moneda, ceros y usd",
  preparadas.map((l) => ({ metodo: l.metodo, moneda: l.moneda, monto: l.monto, montoUsd: l.montoUsd, etiqueta: l.etiqueta ?? "" })),
  [
    { metodo: "zelle", moneda: "USD", monto: 40, montoUsd: 40, etiqueta: "" },
    { metodo: "otro", moneda: "USD", monto: 10, montoUsd: 10, etiqueta: "Reserva" },
    { metodo: "pago_movil", moneda: "Bs", monto: 4000, montoUsd: 100, etiqueta: "" },
  ],
);

// Semana del 2 al 8 nov 2026. Hoy es martes 3: el miércoles en adelante no cuenta como "sin cierre".
const semana = resumenCajaSemana({
  desde: "2026-11-02",
  hasta: "2026-11-08",
  hoy: "2026-11-03",
  ventasUsdPorDia: { "2026-11-02": 90, "2026-11-03": 80 },
  cierres: [
    {
      fecha: "2026-11-02",
      tasaUsdBs: 40,
      lineas: [{ metodo: "efectivo_usd", moneda: "USD", monto: 100 }],
    },
    {
      fecha: "2026-11-03",
      tasaUsdBs: 40,
      lineas: [{ metodo: "pago_movil", moneda: "Bs", monto: 2000 }],
    },
  ],
});
igual("dos días con cierre", semana.diasConCierre, 2);
igual("el martes ya pasó y no falta ninguno", semana.diasSinCierre, 0);
igual("cobrado 150", semana.cobradoUsd, 150);
igual("diferencia −20", semana.diferenciaUsd, -20);
igual("la semana falta", semana.estado, "falta");
igual("título de la semana", semana.titulo, "Falta $20.00");
igual(
  "métodos de la semana",
  semana.porMetodo.map((m) => ({ metodo: m.metodo, monto: m.monto, usd: m.montoUsd })),
  [
    { metodo: "efectivo_usd", monto: 100, usd: 100 },
    { metodo: "pago_movil", monto: 2000, usd: 50 },
  ],
);

const aMitad = resumenCajaSemana({
  desde: "2026-11-02",
  hasta: "2026-11-08",
  hoy: "2026-11-03",
  ventasUsdPorDia: { "2026-11-02": 100 },
  cierres: [
    {
      fecha: "2026-11-02",
      tasaUsdBs: 40,
      lineas: [{ metodo: "efectivo_usd", moneda: "USD", monto: 100 }],
    },
  ],
});
igual("el martes todavía no se cerró", aMitad.diasSinCierre, 1);
igual("no regaña por el resto de la semana", aMitad.detalle.includes("1 día todavía sin cierre"), true);
igual("el lunes cuadra", aMitad.estado, "cuadra");

const sinCierres = resumenCajaSemana({
  desde: "2026-11-02",
  hasta: "2026-11-08",
  hoy: "2026-11-08",
  ventasUsdPorDia: { "2026-11-02": 10 },
  cierres: [],
});
igual("semana vacía", sinCierres.estado, "vacio");
igual("no inventa diferencia", sinCierres.diferenciaUsd, null);

const semanaPasada = resumenCajaSemana({
  desde: "2026-10-26",
  hasta: "2026-11-01",
  hoy: "2026-11-03",
  ventasUsdPorDia: {},
  cierres: [
    {
      fecha: "2026-10-26",
      tasaUsdBs: null,
      lineas: [{ metodo: "punto", moneda: "Bs", monto: 1000 }],
    },
  ],
});
igual("bolívares sin tasa", semanaPasada.estado, "sin_tasa");
igual("seis días de esa semana sin cierre", semanaPasada.diasSinCierre, 6);
igual("el punto igual se lista", semanaPasada.porMetodo[0].monto, 1000);
igual("sin usd de ese punto", semanaPasada.porMetodo[0].montoUsd, null);

igual("fecha en español", etiquetaFecha("2026-11-03"), "martes 3 nov 2026");
igual("domingo", etiquetaFecha("2026-11-08"), "domingo 8 nov 2026");
// 3 nov 2026 03:30 UTC sigue siendo 2 nov en Caracas.
igual("hoy en Caracas", hoyCaracas(new Date("2026-11-03T03:30:00Z")), "2026-11-02");
igual("ya es martes en Caracas", hoyCaracas(new Date("2026-11-03T04:30:00Z")), "2026-11-03");

const ventasSrc = readFileSync(new URL("../src/lib/data/ventas.ts", import.meta.url), "utf8");
const inicio = ventasSrc.indexOf("export async function totalesVentasPorDia");
const fin = ventasSrc.indexOf("export async function listMermas");
const cuerpo = ventasSrc.slice(inicio, fin);
igual("el total del día excluye mermas", cuerpo.includes('.eq("es_merma", false)'), true);

if (fallas > 0) {
  console.error(`\n${fallas} prueba${fallas === 1 ? "" : "s"} fallaron.`);
  process.exit(1);
}
console.log("cierre de caja: ok");
