// Prueba del motor de priorización (PCE).
// ─────────────────────────────────────────────────────────────────
// Verifica que el puntaje, la clasificación y el avance calculen EXACTO
// como el prototipo v6. Los valores esperados están calculados a mano
// desde las fórmulas del §3, incluidos casos reales de las tareas semilla.
//
// Criterio de aceptación del traspaso: "El PCE calcula idéntico al
// prototipo en 10 casos de prueba, incluyendo valores múltiples y ambas
// reglas de excepción." Este archivo cubre eso y algo más.
//
// Se corre con `npm run test:pce`. Falla (exit 1) si algún caso no cuadra.

import {
  pce,
  clasificar,
  reglaCritica,
  pesoValores,
  progreso,
} from "../src/lib/tareas-so/pce.mjs";

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

console.log("PCE · puntaje (pesos 40/30/20/10)");
// 1. Todo al máximo → 100
ok("máximo (alto/directa/corto/1 valor)",
  pce({ impacto: "alto", proximidad: "directa", horizonte: "corto", valores: ["Acción"] }), 100);
// 2. medio/requisito/corto/1 valor → 24+18+20+10 = 72
ok("medio/requisito/corto/1 valor",
  pce({ impacto: "medio", proximidad: "requisito", horizonte: "corto", valores: ["Acción"] }), 72);
// 3. medio/requisito/mediano/sin valores → 24+18+12+5 = 59
ok("medio/requisito/mediano/neutral",
  pce({ impacto: "medio", proximidad: "requisito", horizonte: "mediano", valores: [] }), 59);
// 4. bajo/apoyo/largo/sin valores → 12+9+6+5 = 32
ok("bajo/apoyo/largo/neutral",
  pce({ impacto: "bajo", proximidad: "apoyo", horizonte: "largo", valores: [] }), 32);
// 5. nulo/apoyo/largo/tensiona → 0+9+6+0 = 15
ok("nulo/apoyo/largo/tensiona",
  pce({ impacto: "nulo", proximidad: "apoyo", horizonte: "largo", valores: ["__tensiona"] }), 15);
// 6. sin horizonte (tarea sin objetivo) → 0
ok("sin objetivo → 0",
  pce({ impacto: "alto", proximidad: "directa", horizonte: null, valores: ["Acción"] }), 0);

console.log("PCE · valores múltiples (no se suman)");
ok("dos valores refuerzan = 1", pesoValores(["Comunidad", "Excelencia"]), 1);
ok("valor + tensiona = 0", pesoValores(["Comunidad", "__tensiona"]), 0);
ok("sin valores = 0,5 (neutral)", pesoValores([]), 0.5);
// cinco valores no inflan: alto/directa/corto/5 valores = 100 (igual que 1 valor)
ok("cinco valores no inflan",
  pce({ impacto: "alto", proximidad: "directa", horizonte: "corto",
    valores: ["Comunidad", "Autenticidad", "Patrimonio", "Acción", "Excelencia"] }), 100);
// valor + tensiona anula el 10 de valores: 40+30+20+0 = 90
ok("un valor que tensiona anula la alineación",
  pce({ impacto: "alto", proximidad: "directa", horizonte: "corto", valores: ["Comunidad", "__tensiona"] }), 90);

console.log("PCE · reglas de excepción");
ok("compromiso → crítica", reglaCritica({ compromiso: true }), "Compromiso adquirido");
ok("patrimonio en OPS-05 → crítica", reglaCritica({ patrimonio: true, subEjeId: "OPS-05.1" }), "Regla de patrimonio");
ok("patrimonio fuera de OPS-05 → no aplica", reglaCritica({ patrimonio: true, subEjeId: "ESP-02.1" }), null);
ok("sin excepción → null", reglaCritica({ compromiso: false, patrimonio: false, subEjeId: "MKT-06.2" }), null);

console.log("PCE · clasificación");
ok("100 → Estratégica",
  clasificar({ impacto: "alto", proximidad: "directa", horizonte: "corto", valores: ["Acción"] }).nombre, "Estratégica");
ok("59 → Operativa necesaria",
  clasificar({ impacto: "medio", proximidad: "requisito", horizonte: "mediano", valores: [] }).nombre, "Operativa necesaria");
ok("32 → Delegar o automatizar",
  clasificar({ impacto: "bajo", proximidad: "apoyo", horizonte: "largo", valores: [] }).nombre, "Delegar o automatizar");
ok("15 → Ruido",
  clasificar({ impacto: "nulo", proximidad: "apoyo", horizonte: "largo", valores: ["__tensiona"] }).nombre, "Ruido");
ok("compromiso vence al puntaje bajo → Crítica",
  clasificar({ impacto: "nulo", proximidad: "apoyo", horizonte: "largo", valores: [], compromiso: true }).nombre, "Crítica");

console.log("PCE · casos reales del prototipo (tareas semilla)");
// T-0001: alto/requisito · OPS-05-C3 (corto) · ['Acción'] → 40+18+20+10 = 88
ok("T-0001 (evaluar carga de Beatriz) = 88 · Estratégica",
  clasificar({ impacto: "alto", proximidad: "requisito", horizonte: "corto", valores: ["Acción"], subEjeId: "OPS-05.5" }),
  { nombre: "Estratégica", critica: false, puntaje: 88 });
// T-0005: medio/requisito · OPS-05-L1 (largo) · ['Patrimonio'] → 24+18+6+10 = 58
ok("T-0005 (inventario Planta D) = 58 · Operativa necesaria",
  clasificar({ impacto: "medio", proximidad: "requisito", horizonte: "largo", valores: ["Patrimonio"], subEjeId: "OPS-05.1", patrimonio: false }),
  { nombre: "Operativa necesaria", critica: false, puntaje: 58 });
// T-0004: revisión de estructura, compromiso=true → Crítica sin importar puntaje
ok("T-0004 (revisión de estructura) → Crítica por compromiso",
  clasificar({ impacto: "alto", proximidad: "requisito", horizonte: "mediano", valores: ["Acción"], compromiso: true }).nombre, "Crítica");

console.log("Avance de objetivos (§3.7)");
ok("mayor 80/100 → 80", progreso({ actual: 80, meta: 100, sentido: "mayor" }), 80);
ok("mayor 120/100 → 100 (tope)", progreso({ actual: 120, meta: 100, sentido: "mayor" }), 100);
ok("mayor meta 0 → 100", progreso({ actual: 5, meta: 0, sentido: "mayor" }), 100);
ok("menor 0/0 → 100", progreso({ actual: 0, meta: 0, sentido: "menor" }), 100);
ok("menor 5/0 → 0", progreso({ actual: 5, meta: 0, sentido: "menor" }), 0);
ok("menor 10/20 → 100 (dentro de meta)", progreso({ actual: 10, meta: 20, sentido: "menor" }), 100);
ok("menor 30/20 → 67 (fuera de meta)", progreso({ actual: 30, meta: 20, sentido: "menor" }), 67);

console.log("");
if (fallos === 0) {
  console.log("✓ Motor PCE: todos los casos cuadran con el prototipo.");
  process.exit(0);
}
console.error(`✗ Motor PCE: ${fallos} caso(s) no cuadran.`);
process.exit(1);
