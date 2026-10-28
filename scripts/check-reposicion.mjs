// Pedido por stock y mínimo (src/lib/reposicion.ts).
// ─────────────────────────────────────────────────────────────────
// La lista de "qué pedir" y el paso a compra son cuentas puras. Este script
// las corre sin base de datos. Se corre con `npm run test:reposicion`.

import {
  empaquesParaCubrir,
  leerCantidad,
  prepararComprasReposicion,
  referenciaPedido,
  sugerirReposicion,
} from "../src/lib/reposicion.ts";

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

const base = {
  activo: true,
  unidadCompra: "saco",
  unidadBase: "kg",
  cantidadPorCompra: 10,
  stockComprometido: 0,
  precioCompraUsd: 4,
  proveedorId: "p1",
};

const resumen = sugerirReposicion(
  [
    { ...base, id: "ok", nombre: "Pollo", stockTotal: 20, stockMinimo: 10 },
    { ...base, id: "bajo", nombre: "Harina", stockTotal: 3, stockMinimo: 10, cantidadPorCompra: 4 },
    { ...base, id: "agot", nombre: "Pimentón", stockTotal: 0, stockMinimo: 2, cantidadPorCompra: 1, unidadCompra: "kg" },
    { ...base, id: "sin", nombre: "Sal", stockTotal: 0, stockMinimo: 0 },
    { ...base, id: "vacio", nombre: "Azúcar", stockTotal: 1, stockMinimo: null },
    { ...base, id: "off", nombre: "Inactivo", stockTotal: 0, stockMinimo: 5, activo: false },
    {
      ...base,
      id: "res",
      nombre: "Queso",
      stockTotal: 8,
      stockComprometido: 6,
      stockMinimo: 5,
      cantidadPorCompra: 2,
      precioCompraUsd: null,
    },
    { ...base, id: "cero", nombre: "Aceite", stockTotal: 1, stockMinimo: 5, precioCompraUsd: 0, cantidadPorCompra: 0 },
  ],
  [{ id: "p1", nombre: "Mercado" }],
);

igual("activos", resumen.insumosActivos, 7);
igual("sin mínimo", resumen.sinMinimo, 2);
// Agotados primero, y dentro de cada grupo por nombre.
igual(
  "ids",
  resumen.lineas.map((l) => l.insumoId),
  ["agot", "cero", "bajo", "res"],
);
igual("no pide el que está bien", resumen.lineas.some((l) => l.insumoId === "ok"), false);
igual("no pide inactivo", resumen.lineas.some((l) => l.insumoId === "off"), false);

const harina = resumen.lineas.find((l) => l.insumoId === "bajo");
igual("harina motivo", harina.motivo, "bajo");
igual("harina faltante", harina.faltanteBase, 7);
igual("harina empaques", harina.empaques, 2);
igual("harina costo", harina.costoEstimado, 8);
igual("harina proveedor", harina.proveedorNombre, "Mercado");

const pimenton = resumen.lineas.find((l) => l.insumoId === "agot");
igual("pimentón agotado", pimenton.motivo, "agotado");
igual("pimentón empaques", pimenton.empaques, 2);

const queso = resumen.lineas.find((l) => l.insumoId === "res");
igual("queso libre descuenta reserva", queso.stockLibre, 2);
igual("queso bajo por la reserva", queso.motivo, "bajo");
igual("queso empaques", queso.empaques, 2);
igual("queso sin precio", queso.costoEstimado, null);
igual("queso comprometido", queso.comprometido, 6);

const aceite = resumen.lineas.find((l) => l.insumoId === "cero");
igual("empaque inválido cuenta como 1", aceite.cantidadPorCompra, 1);
igual("precio 0 no es costo", aceite.costoEstimado, null);
igual("aceite empaques", aceite.empaques, 4);

igual("empaque exacto", empaquesParaCubrir(8, 4), 2);
igual("empaque redondea arriba", empaquesParaCubrir(7, 4), 2);
igual("sin faltante", empaquesParaCubrir(0, 4), 0);

igual("1,5", leerCantidad("1,5"), 1.5);
igual("1.5", leerCantidad("1.5"), 1.5);
igual("vacío", leerCantidad("  "), null);
igual("texto", leerCantidad("dos"), null);

const ref = referenciaPedido(new Date("2026-10-29T02:30:00Z"));
igual("referencia Caracas", ref, "PS-20261028-2230");

const mal = prepararComprasReposicion([], { fecha: "2026-10-28", numeroFactura: "PS-1" });
igual("sin líneas", mal.error, "Elige al menos un insumo para pedir.");
igual("sin líneas no arma compras", mal.compras.length, 0);

const precio = prepararComprasReposicion(
  [{ insumoId: "bajo", nombre: "Harina", motivo: "bajo", empaques: 2, precioUnitarioUsd: 0, proveedorId: "p1" }],
  { fecha: "2026-10-28", numeroFactura: "PS-1" },
);
igual("exige precio", precio.error?.includes("Harina"), true);

const ok = prepararComprasReposicion(
  [
    { insumoId: "agot", nombre: "Pimentón", motivo: "agotado", empaques: 2, precioUnitarioUsd: 1.5, proveedorId: "p1" },
    { insumoId: "bajo", nombre: "Harina", motivo: "bajo", empaques: 1.5, precioUnitarioUsd: 4 },
  ],
  { fecha: "2026-10-28", numeroFactura: "PS-20261028-2230" },
);
igual("dos compras", ok.compras.length, 2);
igual("por pagar", ok.compras[0].pagada, false);
igual("total pimentón", ok.compras[0].precioTotalUsd, 3);
igual("nota agotado", ok.compras[0].notas, "Pedido sugerido · agotado");
igual("factura", ok.compras[1].numeroFactura, "PS-20261028-2230");
igual("total harina", ok.compras[1].precioTotalUsd, 6);
igual("nota bajo", ok.compras[1].notas, "Pedido sugerido · bajo el mínimo");
igual("sin proveedor", ok.compras[1].proveedorId, undefined);

if (fallas > 0) {
  console.error(`${fallas} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("reposicion: ok");
