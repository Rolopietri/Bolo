// Sistema Operativo · Motor de Priorización (PCE)
// ═══════════════════════════════════════════════════════════════════
// Puntaje de Contribución Estratégica. Portado IDÉNTICO al prototipo v6
// (función `pce`, `clasificar`, `critica`, `valPeso`, `progreso`).
//
// Esta es la sección "no negociable" del traspaso (§3): si el puntaje se
// calcula distinto al prototipo, la herramienta pierde su función. Por eso
// vive en UN solo archivo, tipado por JSDoc, que usan tanto la app (Next)
// como las pruebas (`npm run test:pce`). No lo dupliques: cámbialo aquí.
//
// Todas las funciones reciben datos explícitos (no leen estado global):
// el que llama resuelve el objetivo → horizonte y lo pasa. Así es testeable.

/** Escalas fijas de cada componente (§3.2). */
export const ESCALAS = {
  impacto: { alto: 1, medio: 0.6, bajo: 0.3, nulo: 0 },
  proximidad: { directa: 1, requisito: 0.6, apoyo: 0.3 },
  horizonte: { corto: 1, mediano: 0.6, largo: 0.3 },
};

/** Pesos por defecto (aprobados 40 / 30 / 20 / 10). Configurables. */
export const PESOS_DEFECTO = { impacto: 40, proximidad: 30, urgencia: 20, valores: 10 };

/** Umbrales de clasificación por defecto (§3.3). Configurables. */
export const UMBRALES_DEFECTO = { estrategica: 70, operativa: 40, delegar: 20 };

/**
 * Alineación con valores — NO es una suma (§3.2):
 *   tiene '__tensiona'  → 0
 *   uno o más valores   → 1
 *   ninguno             → 0,5 (neutral)
 * Basta un valor para contar completa; basta que uno tensione para anularla.
 * @param {string[]} valores
 * @returns {number}
 */
export function pesoValores(valores) {
  const v = valores || [];
  if (v.indexOf("__tensiona") >= 0) return 0;
  return v.length ? 1 : 0.5;
}

/**
 * Área a partir del sub-eje: 'OPS-05.1' → 'OPS-05'.
 * @param {string} subEjeId
 * @returns {string|null}
 */
export function areaDeSubEje(subEjeId) {
  return subEjeId ? String(subEjeId).split(".")[0] : null;
}

/**
 * @typedef {Object} EntradaPCE
 * @property {'alto'|'medio'|'bajo'|'nulo'} impacto
 * @property {'directa'|'requisito'|'apoyo'} proximidad
 * @property {'corto'|'mediano'|'largo'|null|undefined} horizonte  heredado del objetivo
 * @property {string[]} [valores]
 */

/**
 * Puntaje de Contribución Estratégica (0–100).
 * Sin horizonte (tarea sin objetivo) devuelve 0, igual que el prototipo.
 * @param {EntradaPCE} t
 * @param {{impacto:number,proximidad:number,urgencia:number,valores:number}} [pesos]
 * @returns {number}
 */
export function pce(t, pesos = PESOS_DEFECTO) {
  if (!t.horizonte) return 0;
  return Math.round(
    ESCALAS.impacto[t.impacto] * pesos.impacto +
      ESCALAS.proximidad[t.proximidad] * pesos.proximidad +
      ESCALAS.horizonte[t.horizonte] * pesos.urgencia +
      pesoValores(t.valores) * pesos.valores,
  );
}

/**
 * Reglas de excepción que anulan el PCE (§3.4). Devuelve el motivo o null.
 * Patrimonio aplica en el área OPS-05 (igual que el prototipo).
 * @param {{compromiso?:boolean, patrimonio?:boolean, subEjeId?:string}} t
 * @returns {string|null}
 */
export function reglaCritica(t) {
  if (t.compromiso) return "Compromiso adquirido";
  if (t.patrimonio && areaDeSubEje(t.subEjeId) === "OPS-05")
    return "Regla de patrimonio";
  return null;
}

/**
 * Clasificación final de una tarea.
 * @param {EntradaPCE & {compromiso?:boolean, patrimonio?:boolean, subEjeId?:string}} t
 * @param {typeof PESOS_DEFECTO} [pesos]
 * @param {typeof UMBRALES_DEFECTO} [umbrales]
 * @returns {{nombre:string, critica:boolean, razon?:string, puntaje:number}}
 */
export function clasificar(t, pesos = PESOS_DEFECTO, umbrales = UMBRALES_DEFECTO) {
  const razon = reglaCritica(t);
  const puntaje = pce(t, pesos);
  if (razon) return { nombre: "Crítica", critica: true, razon, puntaje };
  if (puntaje >= umbrales.estrategica)
    return { nombre: "Estratégica", critica: false, puntaje };
  if (puntaje >= umbrales.operativa)
    return { nombre: "Operativa necesaria", critica: false, puntaje };
  if (puntaje >= umbrales.delegar)
    return { nombre: "Delegar o automatizar", critica: false, puntaje };
  return { nombre: "Ruido", critica: false, puntaje };
}

/**
 * Avance de un objetivo (0–100), según su sentido (§3.7).
 * @param {{actual:number|string, meta:number|string, sentido?:'mayor'|'menor'}} o
 * @returns {number}
 */
export function progreso(o) {
  const a = Number(o.actual) || 0;
  const m = Number(o.meta) || 0;
  if (o.sentido === "menor") {
    if (m === 0) return a === 0 ? 100 : 0;
    if (a <= m) return 100;
    return Math.max(0, Math.round((m / a) * 100));
  }
  if (m === 0) return 100;
  return Math.min(100, Math.round((a / m) * 100));
}
