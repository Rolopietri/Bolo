// Tablero «En uso»: comprueba el módulo puro. `npm run test:tablero`.
import {
  itemDeFila,
  armarItemsEnUso,
  filaDeSubreceta,
  categoriasEnUso,
  partirPorOrigen,
  tamanioAro,
} from "../src/lib/tablero-en-uso.ts";

let fallas = 0;
function ok(nombre, cond) {
  if (cond) console.log(`  ✓ ${nombre}`);
  else {
    fallas++;
    console.error(`  ✕ ${nombre}`);
  }
}
const cerca = (a, b) => Math.abs(a - b) < 1e-9;

const fila = (o) => ({
  insumoId: "i1",
  nombre: "Pollo",
  unidadBase: "g",
  stockProcesado: 0,
  vieneDeAnterior: 0,
  habilitadoEsta: 0,
  procesadoHabilitado: 0,
  ...o,
});

console.log("── Aro de una fila ──");
{
  const it = itemDeFila(fila({ stockProcesado: 1000, vieneDeAnterior: 400, habilitadoEsta: 600, procesadoHabilitado: 1000 }), undefined);
  ok("cantidad 1000", it?.cantidad === 1000);
  ok("anterior 400 / hoy 600", it?.anterior === 400 && it?.hoy === 600);
  ok("fracciones 0.2 + 0.3 sobre lo disponible (1400)", it && cerca(it.fillAnterior, 400 / 1400) && cerca(it.fillHoy, 600 / 1400));
}
{
  const it = itemDeFila(fila({ stockProcesado: 300, vieneDeAnterior: 300 }), undefined);
  ok("solo de la jornada anterior: aro verde oscuro", it && it.fillHoy === 0 && it.fillAnterior === 1);
}
{
  const it = itemDeFila(fila({ stockProcesado: 500 }), undefined);
  ok("stock sin saldo de apertura: todo cuenta como de hoy", it && it.anterior === 0 && it.hoy === 500 && cerca(it.fillHoy, 1));
}
{
  const it = itemDeFila(fila({ stockProcesado: 100, vieneDeAnterior: 100, habilitadoEsta: 0, procesadoHabilitado: 400 }), undefined);
  ok("lo consumido deja el aro parcial", it && cerca(it.fillAnterior + it.fillHoy, 100 / 500));
}
ok("sin nada → null", itemDeFila(fila({}), undefined) === null);
ok("lo de antes no supera lo que hay", itemDeFila(fila({ stockProcesado: 50, vieneDeAnterior: 80 }), undefined)?.anterior === 50);
ok("negativos y NaN se tratan como 0", itemDeFila(fila({ stockProcesado: -5, vieneDeAnterior: NaN }), undefined) === null);
ok("se_procesa no marca el aro como subreceta", itemDeFila(fila({ stockProcesado: 10 }), { id: "a", seProcesa: true })?.deProduccion === false);

console.log("── Clasificación (la de Inventario) ──");
const insumos = [
  { id: "a", categoriaCompra: "Carnes", seProcesa: true },
  { id: "b", categoriaCompra: "Lácteos", seProcesa: false },
  { id: "c", categoriaCompra: "Frutas y verduras", seProcesa: false },
  { id: "d", categoriaCompra: null, seProcesa: false },
];
const filas = [
  fila({ insumoId: "d", nombre: "Zeta", stockProcesado: 1, vieneDeAnterior: 1 }),
  fila({ insumoId: "a", nombre: "Pollo desmechado", stockProcesado: 2, habilitadoEsta: 2, procesadoHabilitado: 2 }),
  fila({ insumoId: "b", nombre: "Queso", stockProcesado: 3, vieneDeAnterior: 3 }),
  fila({ insumoId: "c", nombre: "Cebolla", stockProcesado: 4, habilitadoEsta: 4, procesadoHabilitado: 4 }),
  fila({ insumoId: "x", nombre: "Vacío" }),
];
const items = armarItemsEnUso(filas, insumos);
ok("descarta lo que no tiene nada en uso", items.length === 4);
ok("ordena por nombre", items.map((i) => i.nombre).join("|") === "Cebolla|Pollo desmechado|Queso|Zeta");
ok("Carnes → Proteínas", items.find((i) => i.insumoId === "a")?.categoria === "Proteínas");
ok("Frutas y verduras → Vegetales y frutas", items.find((i) => i.insumoId === "c")?.categoria === "Vegetales y frutas");
ok("sin categoría → Sin categoría", items.find((i) => i.insumoId === "d")?.categoria === "Sin categoría");
ok("categorías en el orden de Inventario", categoriasEnUso(items).join("|") === "Proteínas|Lácteos|Vegetales y frutas|Sin categoría");
const { subrecetas, directo } = partirPorOrigen(items);
ok("se_procesa no arma el grupo Subrecetas", subrecetas.length === 0);
ok("sin subrecetas reales, todo entra del Almacén", directo.length === 4 && directo.every((i) => !i.deProduccion));
ok("insumo desconocido no rompe", armarItemsEnUso([filas[0]], [])[0]?.categoria === "Sin categoría");

console.log("── Subrecetas reales (es_subreceta con saldo) ──");
ok("sin saldo no hay fila", filaDeSubreceta({ id: "s", nombre: "Salsa", esSubreceta: true }) === null);
ok("es_subreceta false no entra", filaDeSubreceta({ id: "s", nombre: "Salsa", esSubreceta: false, cantidadEnUso: 80 }) === null);
ok("inactiva no entra", filaDeSubreceta({ id: "s", nombre: "Salsa", esSubreceta: true, activo: false, cantidadEnUso: 80 }) === null);
const marcado = armarItemsEnUso(filas, insumos, [
  { id: "s1", nombre: "Salsa pesto", esSubreceta: true, rendimientoUnidad: "g", cantidadEnUso: 250, vieneDeAnterior: 100, habilitadoEsta: 150, procesadoHabilitado: 150 },
  { id: "s2", nombre: "Plato", esSubreceta: false, cantidadEnUso: 80 },
  { id: "s3", nombre: "Sin saldo", esSubreceta: true, cantidadEnUso: 0 },
  { id: "s4", nombre: "Sin dato", esSubreceta: true },
]);
const partes = partirPorOrigen(marcado);
ok("solo la subreceta con saldo", partes.subrecetas.length === 1 && partes.subrecetas[0].insumoId === "s1" && partes.subrecetas[0].deProduccion);
ok("el resto sigue del Almacén", partes.directo.length === 4);
ok("la subreceta conserva el saldo", partes.subrecetas[0].cantidad === 250 && partes.subrecetas[0].anterior === 100 && partes.subrecetas[0].hoy === 150);
ok("usa la unidad de rendimiento", partes.subrecetas[0].unidadBase === "g");
ok("recetas sin saldo no agregan aros", armarItemsEnUso(filas, insumos, [
  { id: "r1", nombre: "Pesto", esSubreceta: true, activo: true },
  { id: "r2", nombre: "Sandwich", esSubreceta: false },
]).length === 4);

console.log("── Tamaño del aro ──");
ok("uno solo: llega al máximo", tamanioAro(360, 1, 112, 44, 4) === 112);
ok("más aros → más chicos", tamanioAro(360, 5, 112, 44, 4) < tamanioAro(360, 2, 112, 44, 4));
ok("nunca baja del mínimo", tamanioAro(360, 40, 112, 44, 4) >= 44);
ok("cabe en el ancho en una fila", cerca(tamanioAro(300, 4, 148, 40, 4) * 4 + 12, 300));

if (fallas) {
  console.error(`\n${fallas} falla(s)`);
  process.exit(1);
}
console.log("\nTodo en orden.");
