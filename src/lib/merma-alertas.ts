// Alertas de merma (Fase E): compara la merma medida al procesar contra el
// estándar del insumo. Detecta dos cosas:
//   • Desviación puntual: la última producción se fue del estándar más de lo
//     tolerable (una merma rara, de más o de menos).
//   • Deriva: las últimas producciones, en promedio, vienen corridas del
//     estándar (el proceso se está yendo de a poco).
// Módulo puro, sin imports, para poder probarlo con Node.

/** Tolerancia en puntos porcentuales (piso). */
export const UMBRAL_PUNTUAL_PTS = 3;
/** Tolerancia como fracción del estándar (ej. 15% de 25 = 3.75 pts). */
export const UMBRAL_PUNTUAL_FRAC = 0.15;
/** Cuántas producciones recientes hacen falta para hablar de deriva. */
export const MIN_EVENTOS_DERIVA = 3;

/** Umbral de desviación aceptable (en puntos porcentuales) para un estándar.
 *  Es el mayor entre un piso fijo (3 pts) y una fracción del estándar (15%),
 *  para que estándares altos no disparen alertas por diferencias chicas. */
export function umbralDesviacion(estandar: number): number {
  return Math.max(UMBRAL_PUNTUAL_PTS, Math.abs(estandar) * UMBRAL_PUNTUAL_FRAC);
}

export type AlertaMerma = {
  /** % del evento (puntual) o promedio (deriva). */
  valor: number;
  /** valor − estándar. Positivo = merma MÁS alta de lo esperado. */
  delta: number;
  /** "alta" = merma de más (rinde menos); "baja" = merma de menos (rinde más). */
  sentido: "alta" | "baja";
  /** Cuántas producciones se consideraron (1 = puntual). */
  n: number;
};

export type EvaluacionMerma = {
  estandar: number;
  umbral: number;
  /** La última producción se desvió del estándar más que el umbral. */
  puntual: AlertaMerma | null;
  /** El promedio de las últimas producciones viene desviado (deriva). */
  deriva: AlertaMerma | null;
};

/** Evalúa las mermas recientes (en %, MÁS RECIENTE PRIMERO) contra el estándar.
 *  Devuelve null si no hay estándar o no hay datos. */
export function evaluarMerma(
  estandar: number | null | undefined,
  mermasRecientes: number[],
): EvaluacionMerma | null {
  if (estandar == null || !(estandar >= 0) || mermasRecientes.length === 0) {
    return null;
  }
  const umbral = umbralDesviacion(estandar);
  const mk = (valor: number, n: number): AlertaMerma => ({
    valor,
    delta: valor - estandar,
    sentido: valor >= estandar ? "alta" : "baja",
    n,
  });

  const ultima = mermasRecientes[0];
  const puntual = Math.abs(ultima - estandar) > umbral ? mk(ultima, 1) : null;

  let deriva: AlertaMerma | null = null;
  if (mermasRecientes.length >= MIN_EVENTOS_DERIVA) {
    const ult = mermasRecientes.slice(0, MIN_EVENTOS_DERIVA);
    const prom = ult.reduce((a, b) => a + b, 0) / ult.length;
    if (Math.abs(prom - estandar) > umbral) deriva = mk(prom, ult.length);
  }

  return { estandar, umbral, puntual, deriva };
}

/** Frase corta para una alerta (para mostrar en la UI). */
export function textoAlertaMerma(a: AlertaMerma): string {
  const signo = a.delta > 0 ? "+" : "";
  const dir = a.sentido === "alta" ? "más merma" : "menos merma";
  return `${dir} de lo normal (${a.valor.toFixed(0)}%, ${signo}${a.delta.toFixed(0)} pts)`;
}
