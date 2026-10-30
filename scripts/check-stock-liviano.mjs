// Stock liviano: valor y días hasta agotarse (src/lib/stock-liviano.ts).
// Se corre sin base de datos con `npm run test:stock`.

import {
  DIAS_SE_AGOTA_PRONTO,
  VENTANA_CONSUMO_DIAS,
  armarStock,
  clasificarStock,
  costoPorUnidadBase,
  estimarDiasAgotar,
  fechaISOEnCaracas,
  filtrarLineas,
  inicioVentana,
  lineaStock,
  ordenarLineas,
  resumirConsumo,
  salidaDesdeMovimiento,
  salidasDeVenta,
  seAgotaPronto,
  tasaParaValorarStock,
  textoDias,
} from "../src/lib/stock-liviano.ts";

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

igual("agotado", clasificarStock(0, 5), "agotado");
igual("bajo", clasificarStock(3, 5), "bajo");
igual("en el mínimo es OK", clasificarStock(5, 5), "ok");
igual("sobre el mínimo", clasificarStock(6, 5), "ok");
igual("sin mínimo null", clasificarStock(0, null), "sin_minimo");
igual("sin mínimo cero", clasificarStock(2, 0), "sin_minimo");

igual("costo base manda", costoPorUnidadBase({ precioBaseUsd: 2, precioCompraUsd: 10, cantidadPorCompra: 5 }), 2);
igual("costo desde el empaque", costoPorUnidadBase({ precioBaseUsd: null, precioCompraUsd: 10, cantidadPorCompra: 5 }), 2);
igual("base en cero no es costo", costoPorUnidadBase({ precioBaseUsd: 0, precioCompraUsd: 10, cantidadPorCompra: 5 }), 2);
igual("sin precio", costoPorUnidadBase({ precioBaseUsd: null, precioCompraUsd: null, cantidadPorCompra: 5 }), null);
igual("empaque vacío no reparte", costoPorUnidadBase({ precioBaseUsd: null, precioCompraUsd: 10, cantidadPorCompra: 0 }), null);

const base = {
  activo: true,
  categoria: "Secos",
  unidadBase: "kg",
  stockComprometido: 0,
  precioBaseUsd: 2,
  precioCompraUsd: 10,
  cantidadPorCompra: 5,
};

const hoy = "2026-10-30";
const desde = inicioVentana(hoy);
igual("ventana 14 días", desde, "2026-10-17");
igual("cruza de mes", inicioVentana("2026-03-01"), "2026-02-16");
igual(
  "caracas antes de medianoche",
  fechaISOEnCaracas(new Date("2026-10-30T03:30:00Z")),
  "2026-10-29",
);
igual(
  "caracas después de medianoche",
  fechaISOEnCaracas(new Date("2026-10-30T04:30:00Z")),
  "2026-10-30",
);

function expandir(id, raciones) {
  if (id === "arepa") return [["harina", 0.1 * raciones], ["sal", 0.01 * raciones]];
  if (id === "extra") return [["queso", 0.05 * raciones]];
  return [];
}

const directa = salidasDeVenta(
  {
    fecha: "2026-10-30",
    cantidad: 2,
    insumoId: "queso",
    insumoCantidad: 0.5,
    swapFromInsumoId: "harina",
    recetaId: "arepa",
  },
  () => {
    throw new Error("el insumo directo no debe expandir la receta");
  },
);
igual(
  "directa descuenta el reemplazo y devuelve el original",
  directa,
  [
    { insumoId: "queso", fecha: "2026-10-30", cantidad: 1 },
    { insumoId: "harina", fecha: "2026-10-30", cantidad: -1 },
  ],
);

igual(
  "sin X quita el insumo",
  salidasDeVenta(
    { fecha: "2026-10-30", cantidad: 4, recetaId: "arepa", swapFromInsumoId: "harina", swapToInsumoId: null },
    expandir,
  ),
  [{ insumoId: "sal", fecha: "2026-10-30", cantidad: 0.04 }],
);

igual(
  "swap mueve el insumo",
  salidasDeVenta(
    { fecha: "2026-10-30", cantidad: 4, recetaId: "arepa", swapFromInsumoId: "harina", swapToInsumoId: "queso" },
    expandir,
  ),
  [
    { insumoId: "sal", fecha: "2026-10-30", cantidad: 0.04 },
    { insumoId: "queso", fecha: "2026-10-30", cantidad: 0.4 },
  ],
);

igual(
  "extra suma",
  salidasDeVenta(
    { fecha: "2026-10-28", cantidad: 2, recetaId: "arepa", extraRecetaId: "extra", extraCantidad: 1 },
    expandir,
  ).map((s) => s.insumoId),
  ["harina", "sal", "queso"],
);

igual("ajuste no es consumo", salidaDesdeMovimiento({ insumoId: "harina", fecha: hoy, tipo: "ajuste", cantidad: -5 }), null);
igual("completar un plan no es consumo", salidaDesdeMovimiento({ insumoId: "harina", fecha: hoy, tipo: "plan_completado", cantidad: -5 }), null);
igual("entrada no es consumo", salidaDesdeMovimiento({ insumoId: "harina", fecha: hoy, tipo: "perdida", cantidad: 2 }), null);
igual(
  "pérdida sí es consumo",
  salidaDesdeMovimiento({ insumoId: "harina", fecha: hoy, tipo: "perdida", cantidad: -2 }),
  { insumoId: "harina", fecha: hoy, cantidad: 2 },
);

const salidas = [
  { insumoId: "harina", fecha: "2026-10-16", cantidad: 100 },
  { insumoId: "harina", fecha: "2026-10-20", cantidad: 7 },
  { insumoId: "harina", fecha: "2026-10-30", cantidad: 7 },
  { insumoId: "sal", fecha: "2026-10-30", cantidad: 1 },
  { insumoId: "aceite", fecha: "2026-10-22", cantidad: 1 },
  { insumoId: "aceite", fecha: "2026-10-22", cantidad: -0.25 },
];
const consumo = resumirConsumo(salidas, desde, hoy);
igual("fuera de ventana no cuenta", consumo.get("harina").total, 14);
igual("harina dos días", consumo.get("harina").diasConConsumo, 2);
igual("un solo día no alcanza", consumo.get("sal").diasConConsumo, 1);
igual("el mismo día se netea", consumo.get("aceite").total, 0.75);
igual("el mismo día es un día", consumo.get("aceite").diasConConsumo, 1);

igual("sin stock es agotado aunque no haya consumo", estimarDiasAgotar({ stockLibre: 0, consumido: 0, diasConConsumo: 0 }).estado, "agotado");
igual("sin salidas", estimarDiasAgotar({ stockLibre: 10, consumido: 0, diasConConsumo: 0 }).estado, "sin_datos");
igual("un día no inventa promedio", estimarDiasAgotar({ stockLibre: 10, consumido: 9, diasConConsumo: 1 }).estado, "sin_datos");

const estimado = estimarDiasAgotar({ stockLibre: 14, consumido: 14, diasConConsumo: 2 });
igual("14 días justos", estimado.estado === "estimado" ? estimado.dias : null, 14);
igual("promedio diario", estimado.estado === "estimado" ? estimado.promedioDiario : null, 1);
igual("no es pronto", seAgotaPronto(estimado), false);

const pronto = estimarDiasAgotar({ stockLibre: 2, consumido: 14, diasConConsumo: 2 });
igual("dos días", pronto.estado === "estimado" ? pronto.dias : null, 2);
igual("sí es pronto", seAgotaPronto(pronto), true);
igual("umbral", DIAS_SE_AGOTA_PRONTO, 3);
igual("texto agotado", textoDias({ estado: "agotado" }), "Agotado");
igual("texto sin datos", textoDias({ estado: "sin_datos" }), "Sin datos de consumo");
igual("texto menos de un día", textoDias({ estado: "estimado", dias: 0.4, promedioDiario: 1, consumido: 1 }), "Menos de 1 día");
igual("texto un día", textoDias({ estado: "estimado", dias: 1.2, promedioDiario: 1, consumido: 1 }), "1 día");
igual("texto varios", textoDias({ estado: "estimado", dias: 14, promedioDiario: 1, consumido: 14 }), "14 días");

const reserva = lineaStock(
  { ...base, id: "harina", nombre: "Harina", stockTotal: 10, stockComprometido: 8, stockMinimo: 5 },
  consumo.get("harina"),
);
igual("libre descuenta reserva", reserva.libre, 2);
igual("bajo por la reserva", reserva.estado, "bajo");
igual("valor de lo que hay en cámara", reserva.valorUsd, 20);
igual("días con el libre", reserva.dias.estado === "estimado" ? reserva.dias.dias : null, 2);
igual("se acaba pronto", reserva.seAgotaPronto, true);

const sinCosto = lineaStock({
  ...base,
  id: "sal",
  nombre: "Sal",
  stockTotal: 4,
  stockMinimo: null,
  precioBaseUsd: null,
  precioCompraUsd: null,
});
igual("sin costo no inventa valor", sinCosto.valorUsd, null);
igual("sin mínimo", sinCosto.estado, "sin_minimo");

const vista = armarStock(
  [
    { ...base, id: "harina", nombre: "Harina", stockTotal: 10, stockComprometido: 8, stockMinimo: 5 },
    { ...base, id: "pollo", nombre: "Pollo", stockTotal: 3, stockMinimo: 1, precioBaseUsd: 8, categoria: "Proteínas" },
    { ...base, id: "sal", nombre: "Sal", stockTotal: 4, stockMinimo: null, precioBaseUsd: null, precioCompraUsd: null },
    { ...base, id: "off", nombre: "Inactivo", stockTotal: 9, stockMinimo: 1, activo: false },
    { ...base, id: "vacio", nombre: "Azúcar", stockTotal: 0, stockMinimo: 2, precioBaseUsd: 1 },
  ],
  consumo,
);
igual("no cuenta inactivos", vista.resumen.activos, 4);
igual("agotados", vista.resumen.agotados, 1);
igual("bajos", vista.resumen.bajos, 1);
igual("sin mínimo", vista.resumen.sinMinimo, 1);
igual("pronto", vista.resumen.seAgotanPronto, 1);
igual("sin costo con stock", vista.resumen.sinCosto, 1);
igual("valor suma solo los que tienen costo", vista.resumen.valorUsd, 20 + 24);
igual("con consumo", vista.resumen.conConsumo, 1);

const orden = ordenarLineas(vista.lineas, "pronto").map((l) => l.id);
igual("pronto va primero", orden[0], "harina");
igual("agotado va antes que el resto", orden[1], "vacio");

const porValor = ordenarLineas(vista.lineas, "valor").map((l) => l.id);
igual("mayor valor primero", porValor[0], "pollo");
igual("sin costo al final del valor", porValor[porValor.length - 1], "sal");

igual(
  "busca sin tilde",
  filtrarLineas(vista.lineas, { texto: "azucar", categoria: "todas", estado: "todos" }).map((l) => l.id),
  ["vacio"],
);
igual(
  "filtra categoría",
  filtrarLineas(vista.lineas, { texto: "", categoria: "Proteínas", estado: "todos" }).map((l) => l.id),
  ["pollo"],
);
igual(
  "filtra se acaba pronto",
  filtrarLineas(vista.lineas, { texto: "", categoria: "todas", estado: "pronto" }).map((l) => l.id),
  ["harina"],
);

igual(
  "euro no convierte el dólar",
  tasaParaValorarStock({ preferida: "euro", usdBs: 40, paralelaBs: 50, personalizada: null }),
  { bsPorUsd: 40, origen: "bcv" },
);
igual(
  "promedio si está elegido",
  tasaParaValorarStock({ preferida: "promedio", usdBs: 40, paralelaBs: 50, personalizada: 70 }),
  { bsPorUsd: 50, origen: "promedio" },
);
igual(
  "personalizada es bolívares por dólar",
  tasaParaValorarStock({ preferida: "personalizada", usdBs: 40, paralelaBs: 50, personalizada: 70 }),
  { bsPorUsd: 70, origen: "personalizada" },
);
igual(
  "sin tasas",
  tasaParaValorarStock({ preferida: "bcv", usdBs: null, paralelaBs: null, personalizada: null }),
  null,
);
igual("ventana usada", VENTANA_CONSUMO_DIAS, 14);

if (fallas > 0) {
  console.error(`${fallas} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("stock liviano: ok");
