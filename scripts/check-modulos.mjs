// Prueba de la lista de módulos del menú inicial (entrega E1).
// Se corre con `npm run test:modulos`. Falla (exit 1) si algún caso no cuadra.

import { readFileSync } from "node:fs";
import { MODULOS, MODULOS_POR_DEFECTO, modulosActivos, moduloActivo, funcionActiva } from "../src/lib/modulos.mjs";
import {
  GRUPOS_HOME,
  gruposOrdenados,
  idsVisibles,
  mismoOrdenVisible,
  moverId,
  normalizarOrdenModulos,
  BLOQUES_HOME,
  layoutDefecto,
  layoutVisible,
  moverBloque,
  moverEnOrden,
  ordenParaGuardar,
  reordenarCasillas,
  reordenarGrupo,
} from "../src/lib/orden-pastillas.mjs";

let fallos = 0;
function ok(nombre, real, esperado) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.error(`  ✗ ${nombre}\n      esperado: ${b}\n      obtenido: ${a}`);
  }
}

console.log("Módulos del menú");

ok("sin variable → Cocina, Administración y Mercado", modulosActivos(undefined), ["cocina", "administracion", "marketplace"]);
ok("variable vacía → por defecto", modulosActivos(""), ["cocina", "administracion", "marketplace"]);
ok("solo ids desconocidos → por defecto", modulosActivos("agenda, foo"), ["cocina", "administracion", "marketplace"]);
ok(
  "respeta el orden del catálogo, no el de la variable",
  modulosActivos("wifi,cocina"),
  ["cocina", "wifi"],
);
ok(
  "tolera espacios, mayúsculas y repetidos",
  modulosActivos(" Cocina , TAREAS,cocina "),
  ["cocina", "tareas"],
);
ok(
  "menú completo de Quinta Mamá se puede restaurar",
  modulosActivos("tareas,eventos,presupuestos,cocina,administracion,wifi"),
  ["cocina", "administracion", "tareas", "eventos", "presupuestos", "wifi"],
);
ok(
  "los módulos retirados siguen en el catálogo (sus rutas no se borran)",
  ["tareas", "eventos", "presupuestos", "wifi"].every((id) => MODULOS.some((m) => m.id === id)),
  true,
);
ok("ids del catálogo únicos", new Set(MODULOS.map((m) => m.id)).size, MODULOS.length);
ok(
  "el valor por defecto no se puede mutar desde afuera",
  (() => {
    const l = modulosActivos(undefined);
    l.push("wifi");
    return modulosActivos(undefined);
  })(),
  [...MODULOS_POR_DEFECTO],
);

ok("WiFi apagado por defecto", moduloActivo("wifi", undefined), false);
ok("WiFi se reactiva con BOLO_MODULOS", moduloActivo("wifi", "cocina,administracion,wifi"), true);
ok("Cocina activa por defecto", moduloActivo("cocina", ""), true);

console.log("Funciones opcionales");
ok("Planes de producción apagados por defecto", funcionActiva("planes", undefined), false);
ok("Planes apagados con el menú por defecto explícito", funcionActiva("planes", "cocina,administracion"), false);
ok("Planes se reactivan con BOLO_MODULOS", funcionActiva("planes", "cocina, administracion, Planes"), true);
ok("Planes no agrega tarjeta al inicio", modulosActivos("cocina,administracion,planes"), ["cocina", "administracion"]);
ok("solo 'planes' no cambia el menú por defecto", modulosActivos("planes"), ["cocina", "administracion", "marketplace"]);
ok("función desconocida → apagada", funcionActiva("agenda", "agenda"), false);

console.log("Orden de pastillas del Home de cocina");

const idsCatalogo = GRUPOS_HOME.flatMap((g) => g.accesos.map((a) => a.id));
ok("ids de pastilla únicos", new Set(idsCatalogo).size, idsCatalogo.length);
ok(
  "Crear un plato conserva el ancla del guía",
  GRUPOS_HOME.flatMap((g) => g.accesos).find((a) => a.id === "plato")?.dataGuia,
  "guia-plato",
);

const defecto = [
  { id: "inventario", ids: ["stock", "uso", "proveedores", "menaje"] },
  { id: "recetas", ids: ["recetas", "costeo", "plato"] },
  { id: "operacion", ids: ["compras", "ventas", "pedido"] },
];
ok("sin orden guardado → catálogo, sin Planes", idsVisibles(undefined, null), defecto);
ok("orden vacío o basura → catálogo", idsVisibles("", { inventario: "insumos" }), defecto);
ok("texto que no es json → sin orden", normalizarOrdenModulos("{"), null);
ok("un arreglo no es un orden", normalizarOrdenModulos(["insumos"]), null);

ok(
  "respeta el orden guardado y manda al final lo que falta",
  idsVisibles(undefined, {
    inventario: ["no-existe", "stock", "plato", "stock", "menaje"],
    recetas: ["plato"],
  }),
  [
    { id: "inventario", ids: ["stock", "menaje", "uso", "proveedores"] },
    { id: "recetas", ids: ["plato", "recetas", "costeo"] },
    { id: "operacion", ids: ["compras", "ventas", "pedido"] },
  ],
);

ok(
  "acepta el json guardado como texto",
  normalizarOrdenModulos('{"recetas":["plato","costeo","recetas"]}'),
  { recetas: ["plato", "costeo", "recetas"] },
);

ok(
  "Planes oculto no aparece aunque el orden lo ponga primero",
  idsVisibles(undefined, { operacion: ["planes", "ventas", "compras", "pedido"] }).find(
    (g) => g.id === "operacion",
  ),
  { id: "operacion", ids: ["ventas", "compras", "pedido"] },
);
ok(
  "Planes prendido y ausente del orden va al final de Operación",
  idsVisibles("planes", { operacion: ["ventas"] }).find((g) => g.id === "operacion"),
  { id: "operacion", ids: ["ventas", "compras", "pedido", "planes"] },
);
ok(
  "Planes prendido respeta el lugar guardado",
  idsVisibles("cocina,planes", { operacion: ["compras", "planes", "ventas", "pedido"] }).find(
    (g) => g.id === "operacion",
  ),
  { id: "operacion", ids: ["compras", "planes", "ventas", "pedido"] },
);

ok(
  "un id oculto por flag no cuenta como cambio visible",
  mismoOrdenVisible(undefined, { operacion: ["compras", "ventas", "pedido", "planes"] }, null),
  true,
);

const quieto = ["a", "b", "c"];
ok("mover al mismo lugar no copia el arreglo", moverId(quieto, "b", 1) === quieto, true);
ok("mover adelante", moverId(["a", "b", "c", "d"], "a", 2), ["b", "c", "a", "d"]);
ok("mover atrás", moverId(["a", "b", "c", "d"], "d", 0), ["d", "a", "b", "c"]);
const ajenos = ["a", "b"];
ok("id de otro grupo no mueve nada", moverId(ajenos, "z", 0) === ajenos, true);

const gruposDefecto = gruposOrdenados(undefined, null);
const antes = JSON.stringify(GRUPOS_HOME);
const movido = reordenarGrupo(gruposDefecto, "inventario", "menaje", 0);
ok("ordenar no muta el catálogo", JSON.stringify(GRUPOS_HOME), antes);
ok(
  "el arrastre se queda dentro del grupo",
  movido.map((g) => ({ id: g.id, ids: g.accesos.map((a) => a.id) })),
  [
    { id: "inventario", ids: ["menaje", "stock", "uso", "proveedores"] },
    { id: "recetas", ids: ["recetas", "costeo", "plato"] },
    { id: "operacion", ids: ["compras", "ventas", "pedido"] },
  ],
);
ok(
  "una pastilla de otro grupo no cruza",
  reordenarGrupo(gruposDefecto, "inventario", "plato", 0) === gruposDefecto ? "mismo" : "copia",
  "mismo",
);
ok("el orden por defecto no se escribe", ordenParaGuardar(undefined, gruposDefecto, layoutDefecto(undefined)), null);
ok(
  "un orden propio de pastillas se guarda en pastillas",
  ordenParaGuardar(undefined, movido, layoutDefecto(undefined)),
  { pastillas: { inventario: ["menaje", "stock", "uso", "proveedores"] } },
);
ok(
  "Para hoy no es un bloque",
  BLOQUES_HOME.some((b) => b.id === "para-hoy" || b.titulo === "Para hoy"),
  false,
);
ok(
  "Stock de Módulos es el ancla del guía",
  GRUPOS_HOME.flatMap((g) => g.accesos).find((a) => a.id === "stock")?.dataGuia,
  "accion-stock",
);

const defectoLayout = layoutDefecto(undefined);
ok(
  "la disposición por defecto alterna columnas",
  defectoLayout,
  [
    { id: "aviso", col: 0 },
    { id: "tasas", col: 1 },
    { id: "anillo", col: 0 },
    { id: "inventario", col: 1 },
    { id: "recetas", col: 0 },
    { id: "operacion", col: 1 },
  ],
);
ok(
  "un bloque nuevo va al final y el oculto no aparece",
  layoutVisible(undefined, {
    layout: [{ id: "tasas", col: 1 }, { id: "para-hoy", col: 0 }, { id: "aviso", col: 0 }],
  }).map((b) => b.id),
  ["tasas", "aviso", "anillo", "inventario", "recetas", "operacion"],
);
const aLaDerecha = moverBloque(defectoLayout, "anillo", 1, 0);
ok(
  "el anillo puede ir a la esquina derecha",
  aLaDerecha.filter((b) => b.col === 1).map((b) => b.id),
  ["anillo", "tasas", "inventario", "operacion"],
);
ok(
  "mover el bloque se guarda en layout",
  ordenParaGuardar(undefined, gruposDefecto, aLaDerecha)?.layout?.filter((b) => b.col === 1).map((b) => b.id),
  ["anillo", "tasas", "inventario", "operacion"],
);
ok(
  "en móvil el orden es la lista, sin perder la columna",
  moverEnOrden(defectoLayout, "operacion", 0)[0],
  { id: "operacion", col: 1 },
);
ok(
  "una casilla desconocida no mueve nada",
  reordenarCasillas(gruposDefecto, "plato", 0) === gruposDefecto,
  true,
);

const pastillas = readFileSync(new URL("../src/app/cocina/_ModulosHome.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/app/cocina/_HomeCocina.tsx", import.meta.url), "utf8");
const hoy = readFileSync(new URL("../src/app/cocina/_Hoy.tsx", import.meta.url), "utf8");
ok("la pastilla pasa data-guia al enlace", pastillas.includes("data-guia={acceso.dataGuia}"), true);
ok("el anillo sigue anclado para la guía", home.includes('data-guia="cocina-empezar"'), true);
ok("cada bloque tiene asa", home.includes("data-bloque-id={bloque.id}"), true);
ok("el asa usa el icono de agarre", home.includes("<GripIcon"), true);
ok("Para hoy ya no está en el Home", hoy.includes("Para hoy"), false);
ok("el Home no pinta las pastillas a mano", home.includes("guia-plato"), false);

if (fallos) {
  console.error(`\n${fallos} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodo bien.");
