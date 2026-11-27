// Pruebas del bot de producción (src/lib/telegram-acciones.ts): mensajes sin
// peso (BOLO-15) y nombres no reconocidos. Puro, sin base.
// Se corre con `npm run test:telegram`.

import {
  accionesDeMensaje,
  completarConCantidad,
  faltantesDeMensaje,
  preguntaCantidad,
  respuestaBot,
} from "../src/lib/telegram-acciones.ts";

let fallas = 0;
function igual(nombre, real, esperado) {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    fallas++;
    console.error(`✕ ${nombre}: salió ${JSON.stringify(real)}, se esperaba ${JSON.stringify(esperado)}`);
  }
}

const INSUMOS = [
  { id: "lomito", nombre: "QA LOMITO", unidadBase: "g", seProcesa: true },
  { id: "cebolla", nombre: "QA CEBOLLA", unidadBase: "g", seProcesa: true },
  { id: "pan", nombre: "QA PAN DE SANDUCHE", unidadBase: "unidad", seProcesa: false },
  { id: "queso", nombre: "QA QUESO BLANCO", unidadBase: "g", seProcesa: false },
  { id: "tomate", nombre: "Tomate", unidadBase: "g", seProcesa: false },
];
const mov = (t) => faltantesDeMensaje(t, INSUMOS).map((f) => [f.insumoId, f.movimiento, f.motivo ?? null]);

// ── Qué mensajes piden la cantidad ──
igual("saliendo sin peso", mov("saliendo algo de lomito QA"), [["lomito", "salida", null]]);
igual("entrando sin peso", mov("Entrando lomito"), [["lomito", "entrada", null]]);
igual("pérdida sin peso", mov("se dañó el tomate"), [["tomate", "perdida", "mal_estado"]]);
igual("devolución sin peso", mov("devolviendo pan de sanduche"), [["pan", "devolucion", null]]);
igual("con peso no pregunta", mov("saliendo 1,2 kg lomito QA"), []);
igual("número suelto", mov("somos 5"), []);
igual("charla", mov("buenos días"), []);
igual("pregunta", mov("¿salió el lomito?"), []);
igual("insumo desconocido", mov("saliendo algo de zanahoria morada"), []);
igual("corrección", mov("me equivoqué, saliendo lomito"), []);
igual("sin palabra de movimiento", mov("lomito"), []);
igual("acciones vacías sin peso", accionesDeMensaje("saliendo algo de lomito QA", INSUMOS).acciones, []);

// ── La pregunta del bot ──
const f1 = faltantesDeMensaje("saliendo algo de lomito QA", INSUMOS);
igual(
  "pregunta kg",
  preguntaCantidad(f1),
  "¿Cuánto QA LOMITO salió? Respóndeme a este mensaje con el peso, por ejemplo 1,2 kg.",
);
igual(
  "pregunta unidades",
  preguntaCantidad(faltantesDeMensaje("saliendo pan de sanduche", INSUMOS)),
  "¿Cuánto QA PAN DE SANDUCHE salió? Respóndeme a este mensaje con la cantidad, por ejemplo 12 unid.",
);
igual(
  "pregunta sin responder",
  preguntaCantidad(f1, false),
  "¿Cuánto QA LOMITO salió? Escríbelo con el peso, por ejemplo «Saliendo 1,2 kg QA LOMITO».",
);

// ── La respuesta con la cantidad ──
const c = (falta, resp) => completarConCantidad(falta, resp, INSUMOS);
igual("1,2 kg → salida en gramos", c(f1, "1,2 kg").acciones, [{ tipo: "salida", insumo_id: "lomito", procesado: 1200 }]);
igual("800 g", c(f1, "800 g").acciones, [{ tipo: "salida", insumo_id: "lomito", procesado: 800 }]);
igual("número sin unidad = kg", c(f1, "1.5").acciones, [{ tipo: "salida", insumo_id: "lomito", procesado: 1500 }]);
igual("frase completa", c(f1, "salieron 2 kg").acciones, [{ tipo: "salida", insumo_id: "lomito", procesado: 2000 }]);
igual(
  "entrada",
  c(faltantesDeMensaje("entrando lomito", INSUMOS), "3 kg").acciones,
  [{ tipo: "entrada", insumo_id: "lomito", crudo: 3000 }],
);
igual(
  "por unidad sale a uso",
  c(faltantesDeMensaje("saliendo pan de sanduche", INSUMOS), "12").acciones,
  [{ tipo: "uso", insumo_id: "pan", cantidad: 12 }],
);
igual(
  "queso (no se procesa) sale a uso",
  c(faltantesDeMensaje("saliendo queso blanco", INSUMOS), "500 g").acciones,
  [{ tipo: "uso", insumo_id: "queso", cantidad: 500 }],
);
igual(
  "pérdida conserva el motivo",
  c(faltantesDeMensaje("se dañó el tomate", INSUMOS), "2 kg").acciones,
  [{ tipo: "perdida", insumo_id: "tomate", cantidad: 2000, motivo: "mal_estado" }],
);
const sinNumero = c(f1, "ok");
igual("sin número no registra", [sinNumero.acciones, sinNumero.siguenSinCantidad.length], [[], 1]);
const rara = c(f1, "2 tazas");
igual("medida rara", [rara.acciones, rara.problemas.unidadesRaras], [[], [{ leido: "QA LOMITO", medida: "tazas" }]]);
const dos = faltantesDeMensaje("saliendo lomito\nsaliendo cebolla", INSUMOS);
igual("dos insumos", dos.map((f) => f.insumoId), ["lomito", "cebolla"]);
igual(
  "dos insumos: cada número con su nombre",
  c(dos, "lomito 1,2 kg, cebolla 3 kg").acciones,
  [
    { tipo: "salida", insumo_id: "lomito", procesado: 1200 },
    { tipo: "salida", insumo_id: "cebolla", procesado: 3000 },
  ],
);
const medio = c(dos, "lomito 1,2 kg");
igual("dos insumos: falta uno", [medio.acciones.length, medio.siguenSinCantidad.map((f) => f.insumoId)], [1, ["cebolla"]]);

// ── Pérdidas con tilde ("se dañó", "se cayó") ──
igual(
  "se dañó 2 kg",
  accionesDeMensaje("se dañó 2 kg de tomate", INSUMOS).acciones,
  [{ tipo: "perdida", insumo_id: "tomate", cantidad: 2000, motivo: "mal_estado" }],
);
igual(
  "se dañaron 2 kg",
  accionesDeMensaje("se dañaron 2 kg de tomate", INSUMOS).acciones,
  [{ tipo: "perdida", insumo_id: "tomate", cantidad: 2000, motivo: "mal_estado" }],
);
igual(
  "se botó",
  accionesDeMensaje("se botó 1 kg de tomate", INSUMOS).acciones,
  [{ tipo: "perdida", insumo_id: "tomate", cantidad: 1000, motivo: "perdida" }],
);

// ── Nombre no reconocido sin "de" pegado ──
const { problemas } = accionesDeMensaje("entrando 1,37 kg de zanahoria morada QA", INSUMOS);
igual("sin «de» en el nombre", problemas.noReconocidos, ["zanahoria morada QA"]);
igual(
  "aviso no encontrado",
  respuestaBot([], problemas),
  "✕ No encontré «zanahoria morada QA» en Bolo. Escríbelo como aparece en el inventario.",
);
igual("del", accionesDeMensaje("saliendo 2 kg del pescado", INSUMOS).problemas.noReconocidos, ["pescado"]);
// El resto sigue igual.
igual(
  "con «de» sigue reconociendo",
  accionesDeMensaje("saliendo 2 kg de lomito QA", INSUMOS).acciones,
  [{ tipo: "salida", insumo_id: "lomito", procesado: 2000 }],
);

if (fallas) {
  console.error(`\n${fallas} prueba(s) fallaron.`);
  process.exit(1);
}
console.log("✓ Bot de Telegram: todo bien.");
