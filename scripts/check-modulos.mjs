// Prueba de la lista de módulos del menú inicial (entrega E1).
// Se corre con `npm run test:modulos`. Falla (exit 1) si algún caso no cuadra.

import { MODULOS, MODULOS_POR_DEFECTO, modulosActivos, moduloActivo, funcionActiva } from "../src/lib/modulos.mjs";

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

ok("sin variable → Cocina y Administración", modulosActivos(undefined), ["cocina", "administracion"]);
ok("variable vacía → por defecto", modulosActivos(""), ["cocina", "administracion"]);
ok("solo ids desconocidos → por defecto", modulosActivos("agenda, foo"), ["cocina", "administracion"]);
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
ok("solo 'planes' no cambia el menú por defecto", modulosActivos("planes"), ["cocina", "administracion"]);
ok("función desconocida → apagada", funcionActiva("agenda", "agenda"), false);

if (fallos) {
  console.error(`\n${fallos} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodo bien.");
