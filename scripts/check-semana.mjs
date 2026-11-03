// Semana de Administración (src/lib/semana.ts).
// Cuentas puras, sin base. Se corre con `npm run test:semana`.

import { fmtUsd } from "../src/lib/moneda.ts";
import {
  armarSemana,
  costoTeoricoLinea,
  domingoDe,
  explicarFoodCost,
  lunesDe,
  lunesSemanaActual,
  montoVenta,
  moverSemana,
  semanaDesdeLunes,
  sumarPerdidas,
  totalesCompra,
  valorPerdida,
  variacion,
} from "../src/lib/semana.ts";

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

// 3 nov 2026 es martes. La semana corre de lunes 2 a domingo 8.
igual("martes cae en el lunes", lunesDe("2026-11-03"), "2026-11-02");
igual("el lunes se queda", lunesDe("2026-11-02"), "2026-11-02");
igual("el domingo vuelve al lunes", lunesDe("2026-11-08"), "2026-11-02");
igual("domingo de esa semana", domingoDe("2026-11-02"), "2026-11-08");
igual("semana anterior", moverSemana("2026-11-02", -1), "2026-10-26");
igual("volver a la actual", moverSemana("2026-10-26", 1), "2026-11-02");
igual(
  "etiqueta del mismo mes",
  semanaDesdeLunes("2026-11-02").etiqueta,
  "2 al 8 de noviembre de 2026",
);
igual(
  "etiqueta que cruza mes",
  semanaDesdeLunes("2026-10-26").etiqueta,
  "26 de octubre al 1 de noviembre de 2026",
);
igual("año nuevo sigue en la semana del 28 dic", lunesDe("2027-01-01"), "2026-12-28");
igual(
  "etiqueta que cruza año",
  semanaDesdeLunes("2026-12-28").etiqueta,
  "28 de diciembre de 2026 al 3 de enero de 2027",
);
// 3 nov 2026 03:30 UTC todavía es 2 nov 23:30 en Caracas (lunes).
igual(
  "lunes según Caracas, no según UTC",
  lunesSemanaActual(new Date("2026-11-03T03:30:00Z")),
  "2026-11-02",
);
// 2 nov 2026 03:30 UTC es 1 nov 23:30 en Caracas (domingo) → semana del 26 oct.
igual(
  "domingo de noche en Caracas",
  lunesSemanaActual(new Date("2026-11-02T03:30:00Z")),
  "2026-10-26",
);

igual("sube 10%", variacion(110, 100), 0.1);
igual("baja 20%", variacion(80, 100), -0.2);
igual("a cero es −100%", variacion(0, 40), -1);
igual("sin base si la anterior es 0", variacion(5, 0), null);
igual("sin base si ambas son 0", variacion(0, 0), null);

igual("total guardado", montoVenta({ totalUsd: 12, precioUnitarioUsd: 3, cantidad: 2 }), 12);
igual("precio × cantidad si falta el total", montoVenta({ totalUsd: null, precioUnitarioUsd: 3, cantidad: 2 }), 6);
igual("sin precio es 0", montoVenta({ cantidad: 2 }), 0);

const cat = {
  porPorcion: new Map([
    ["arepa", 2],
    ["papas", 0.5],
  ]),
  precioInsumo: new Map([["agua", 0.8]]),
};
igual("receta × unidades", costoTeoricoLinea({ recetaId: "arepa", cantidad: 4 }, cat), 8);
igual(
  "receta más extra",
  costoTeoricoLinea({ recetaId: "arepa", cantidad: 4, extraRecetaId: "papas", extraCantidad: 1 }, cat),
  10,
);
igual(
  "extra vacío cuenta una vez",
  costoTeoricoLinea({ recetaId: "arepa", cantidad: 2, extraRecetaId: "papas" }, cat),
  5,
);
igual(
  "extra sin costo anula la línea",
  costoTeoricoLinea({ recetaId: "arepa", cantidad: 2, extraRecetaId: "no-esta" }, cat),
  null,
);
igual(
  "insumo directo, cantidad vacía = 1",
  costoTeoricoLinea({ insumoId: "agua", cantidad: 3 }, cat),
  2.4,
);
igual(
  "insumo directo con cantidad por unidad",
  costoTeoricoLinea({ insumoId: "agua", insumoCantidad: 2, cantidad: 3 }, cat),
  4.8,
);
igual("servicio no se costea", costoTeoricoLinea({ cantidad: 1 }, cat), null);
igual("receta desconocida", costoTeoricoLinea({ recetaId: "no", cantidad: 1 }, cat), null);

igual("valor congelado", valorPerdida({ valorUsd: 4.5, cantidad: -2 }, 9), 4.5);
igual("sin congelar, usa el precio", valorPerdida({ valorUsd: null, cantidad: -2 }, 1.5), 3);
igual("sin precio queda fuera", valorPerdida({ cantidad: -2 }, null), null);
igual("suma de pérdidas", sumarPerdidas([3, null, 1]), { usd: 4, sinPrecio: 1 });
igual(
  "compras separan flete",
  totalesCompra([
    { precioTotalUsd: 10, fleteUsd: 2 },
    { precioTotalUsd: 5, fleteUsd: null },
  ]),
  { insumos: 15, flete: 2 },
);

const resumen = armarSemana({
  ventas: [
    { nombre: "Arepa", cantidad: 10, totalUsd: 50, costoUsd: 20 },
    { nombre: "Arepa", cantidad: 2, totalUsd: 10, costoUsd: 4 },
    { nombre: "Pabellón", cantidad: 8, totalUsd: 80, costoUsd: 40 },
    { nombre: "Jugo", cantidad: 5, totalUsd: 15, costoUsd: null },
    { nombre: "Torta", cantidad: 4, totalUsd: 20, costoUsd: 8 },
    { nombre: "Café", cantidad: 3, totalUsd: 9, costoUsd: 1.5 },
    { nombre: "Galleta", cantidad: 1, totalUsd: 2, costoUsd: 0.4 },
    { nombre: " Mixto ", cantidad: 6, totalUsd: 30, costoUsd: 10 },
    { nombre: "Mixto", cantidad: 1, totalUsd: 5, costoUsd: null },
  ],
  ventasAnterior: [
    { nombre: "Arepa", cantidad: 20, totalUsd: 100, costoUsd: 40 },
  ],
  comprasInsumosUsd: 100,
  fleteUsd: 10,
  perdidasUsd: 5,
  perdidasSinPrecio: 1,
});

igual("ventas de la semana", resumen.ventasUsd, 221);
igual("platos", resumen.platos, 40);
igual("variación de ventas", resumen.variacionVentas, 1.21);
igual("variación de platos", resumen.variacionPlatos, 1);
igual("food cost solo de lo costeado", resumen.foodCostUsd, 83.9);
igual("platos sin costo", resumen.platosSinCosto, 6);
igual("ventas sin costo", resumen.ventasSinCostoUsd, 20);
igual("compras con flete", resumen.comprasUsd, 110);
igual("food cost %", resumen.foodCostPct, 83.9 / 221);
igual("compras %", resumen.comprasPct, 110 / 221);
igual("utilidad = ventas − teórico − pérdidas", resumen.utilidadUsd, 221 - 83.9 - 5);
igual(
  "top 5 por cantidad",
  resumen.top.map((p) => p.nombre),
  ["Arepa", "Pabellón", "Mixto", "Jugo", "Torta"],
);
const arepa = resumen.top[0];
igual("arepas unidas", arepa.cantidad, 12);
igual("margen de la arepa", arepa.margenUsd, 36);
igual("margen por unidad", arepa.margenUnitarioUsd, 3);
igual("mixto incompleto no tiene margen", resumen.top[2].margenUsd, null);
igual("jugo sin costo", resumen.top[3].margenUsd, null);
igual("hay ventas y compras", resumen.hayVentas && resumen.hayCompras, true);
igual(
  "explica que se compró de más",
  resumen.explicacion,
  `Compraste ${fmtUsd(resumen.comprasUsd - resumen.foodCostUsd)} más de lo que costaron los platos vendidos. La diferencia suele quedar en cámara.`,
);

const vacia = armarSemana({
  ventas: [],
  ventasAnterior: [],
  comprasInsumosUsd: 0,
  fleteUsd: 0,
  perdidasUsd: 0,
  perdidasSinPrecio: 0,
});
igual("semana vacía", vacia.hayVentas, false);
igual("sin variación", vacia.variacionVentas, null);
igual("utilidad en cero", vacia.utilidadUsd, 0);
igual("sin explicación si no hay nada", vacia.explicacion, "");

igual(
  "solo compras",
  explicarFoodCost(0, 40, 0),
  "Hubo compras y las ventas no tienen costo de receta. Ese dinero quedó en inventario, o los platos todavía no tienen receta costeada.",
);
igual(
  "solo receta",
  explicarFoodCost(30, 0, 0),
  "Lo vendido tiene costo de receta y no hubo compras. Se usó inventario que ya estaba en cámara.",
);
igual(
  "el flete explica la diferencia",
  explicarFoodCost(50, 50, 8),
  "El costo de lo vendido y las compras de insumos van parejos. Lo que sobra es el flete.",
);
igual(
  "van parejos",
  explicarFoodCost(50, 51, 0),
  "Las compras y el costo de lo vendido van parejos esta semana.",
);
igual(
  "se usó inventario de antes",
  explicarFoodCost(80, 40, 0),
  `Lo vendido costó ${fmtUsd(40)} más que las compras de la semana. Se usó inventario de antes.`,
);

if (fallas > 0) {
  console.error(`\n${fallas} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("Semana: todas las cuentas cierran.");
