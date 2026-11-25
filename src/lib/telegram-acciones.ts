// Telegram directo (BOLO-10): convierte un mensaje del grupo en acciones de
// inventario y arma la respuesta del bot con lo que hizo. Módulo puro: lo usa
// el webhook (servidor) y Producción (para los mensajes de antes del cambio).
//
// Criterio:
//   • Insumo que se procesa (o mensaje con "Entrando"/"Sin procesar"):
//       solo entrada → abre un lote en la mesa;
//       solo salida  → cierra el lote (si no hay entrada, se rechaza);
//       ambas        → procesamiento completo.
//   • Insumo que no se procesa y solo trae salida (o un número suelto):
//       sale del almacén directo a EN USO (producto por unidad / por lotes).

import { leerMensaje, unidadPlantilla } from "@/lib/produccion";

export type InsumoBot = {
  id: string;
  nombre: string;
  unidadBase: string;
  seProcesa: boolean;
  /** Presentación de compra ("Caja") y cuánto trae en unidad base (24). */
  unidadCompra?: string | null;
  cantidadPorCompra?: number | null;
};

export type AccionBot =
  | { tipo: "entrada"; insumo_id: string; crudo: number }
  | { tipo: "salida"; insumo_id: string; procesado: number }
  | { tipo: "completo"; insumo_id: string; crudo: number; procesado: number }
  | { tipo: "uso"; insumo_id: string; cantidad: number };

/** Resultado de cada acción, tal como lo devuelve la base (_prod_aplicar). */
export type ResultadoBot = {
  ok: boolean;
  tipo: string;
  error?: string;
  nombre?: string;
  unidad_base?: string;
  crudo?: number;
  procesado?: number;
  merma?: number;
  merma_porc?: number;
  estandar?: number | null;
  cantidad?: number;
  faltaba?: boolean;
  almacen_antes?: number;
  marcado_procesa?: boolean;
  /** Salida: cuántas entradas abiertas se juntaron para cerrarla. */
  lotes?: number;
  /** Entrada: salidas rechazadas antes (sin entrada) que esta entrada permitió registrar. */
  corregidos?: ResultadoBot[];
  corregido?: boolean;
};

export function accionesDeMensaje(
  texto: string,
  insumos: InsumoBot[],
): { acciones: AccionBot[]; noReconocidos: string[]; sinPresentacion: string[] } {
  const acciones: AccionBot[] = [];
  const noReconocidos: string[] = [];
  const sinPresentacion: string[] = [];
  const porId = new Map(insumos.map((i) => [i.id, i] as const));
  for (const r of leerMensaje(texto, insumos)) {
    const ins = r.insumoId ? porId.get(r.insumoId) : undefined;
    if (!ins) {
      if (r.leido) noReconocidos.push(r.leido);
      continue;
    }
    // leerMensaje da las cantidades en la unidad de la plantilla (kg, L, unid).
    const f = unidadPlantilla(ins.unidadBase).factor;
    const base = (v: number) => Math.round(v * f * 10000) / 10000;
    // "1 caja" de un insumo sin presentación cargada: no se adivina.
    if (Number.isNaN(r.tomada) || Number.isNaN(r.util)) {
      sinPresentacion.push(ins.nombre);
      continue;
    }
    const tomada = r.tomada != null ? base(r.tomada) : null;
    const util = r.util != null ? base(r.util) : null;
    const procesa = ins.seProcesa || r.entradaExplicita;

    if (tomada != null && util != null) acciones.push({ tipo: "completo", insumo_id: ins.id, crudo: tomada, procesado: util });
    else if (procesa && tomada != null) acciones.push({ tipo: "entrada", insumo_id: ins.id, crudo: tomada });
    else if (ins.seProcesa && util != null) acciones.push({ tipo: "salida", insumo_id: ins.id, procesado: util });
    else {
      const cantidad = util ?? tomada;
      if (cantidad != null) acciones.push({ tipo: "uso", insumo_id: ins.id, cantidad });
    }
  }
  return { acciones, noReconocidos, sinPresentacion };
}

const pct = (n: number) => `${Math.round(n)} %`;

/** Cantidad en unidad base → texto legible ("8 kg", "0,4 kg", "12 unid"). */
export function legible(n: number | undefined, unidadBase: string): string {
  const { unidad, factor } = unidadPlantilla(unidadBase);
  return `${(Math.round(((n ?? 0) / factor) * 100) / 100).toLocaleString("es-VE")} ${unidad}`;
}

/** Texto que el bot responde. Con `soloErrores` (el grupo, desde BOLO-11)
 *  solo dice lo que no se pudo registrar; lo registrado va al resumen diario. */
export function respuestaBot(
  resultados: ResultadoBot[],
  noReconocidos: string[],
  opciones: { soloErrores?: boolean } = {},
  sinPresentacion: string[] = [],
): string {
  const lineas: string[] = [];
  for (const r of resultados) {
    // Correcciones: la entrada que faltaba registró una salida rechazada. Se
    // avisa siempre, para que nadie la vuelva a enviar.
    for (const c of r.corregidos ?? []) {
      const u = c.unidad_base ?? "";
      const merma = (c.merma ?? 0) > 0 ? ` Merma ${legible(c.merma, u)} (${pct(c.merma_porc ?? 0)}).` : "";
      lineas.push(`✓ Corregido: ${c.nombre ?? "el insumo"} entró ${legible(c.crudo, u)}, salió ${legible(c.procesado, u)}.${merma} La salida quedó registrada.`);
    }
    if (r.ok && opciones.soloErrores) continue;
    const u = r.unidad_base ?? "";
    const q = (n: number | undefined) => legible(n, u);
    const nombre = r.nombre ?? "El insumo";
    if (r.ok) {
      const almacen = r.faltaba ? ` En Bolo había ${q(r.almacen_antes)} en el almacén: revisa el inventario.` : "";
      if (r.tipo === "entrada") {
        lineas.push(`✓ ${nombre}: entró ${q(r.crudo)}, queda en la mesa.${almacen}`);
      } else if (r.tipo === "salida" || r.tipo === "completo") {
        const est = r.estandar != null ? `, estándar ${pct(Number(r.estandar))}` : "";
        const merma = (r.merma ?? 0) > 0 ? ` Merma ${q(r.merma)} (${pct(r.merma_porc ?? 0)}${est}).` : " Sin merma.";
        const juntas = (r.lotes ?? 1) > 1 ? ` (juntando ${r.lotes} entradas)` : "";
        lineas.push(`✓ ${nombre}: entró ${q(r.crudo)}${juntas}, salió ${q(r.procesado)}.${merma} Pasa a en uso.${almacen}`);
      } else if (r.tipo === "uso") {
        lineas.push(`✓ ${nombre}: salen ${q(r.cantidad)} del almacén, quedan en uso.${almacen}`);
      }
      continue;
    }
    if (r.error === "sin_entrada") {
      lineas.push(
        `✕ ${nombre}: no registré la salida porque no hay una entrada abierta. Indica cuánto entró sin procesar («Entrando … ${nombre.toLowerCase()}») y la salida se registrará sola.`,
      );
    } else if (r.error === "mas_que_entrada") {
      const abiertas = (r.lotes ?? 1) > 1 ? `las ${r.lotes} entradas abiertas suman` : "la entrada abierta es de";
      lineas.push(
        `✕ ${nombre}: la salida (${q(r.procesado)}) es mayor que lo que entró: ${abiertas} ${q(r.crudo)}. Si faltó una entrada, escríbela y la salida se registrará sola.`,
      );
    } else if (r.error === "cantidad") {
      lineas.push(`✕ ${nombre}: revisa la cantidad.`);
    } else {
      lineas.push(`✕ No se pudo registrar ${nombre.toLowerCase()}.`);
    }
  }
  for (const n of noReconocidos) {
    lineas.push(`✕ No encontré «${n}» en Bolo. Escríbelo como aparece en el inventario.`);
  }
  for (const n of sinPresentacion) {
    lineas.push(
      `✕ ${n}: no sé cuánto trae esa presentación. Escribe la cantidad en unidades (o kg) o carga la presentación del insumo en Bolo.`,
    );
  }
  return lineas.join("\n");
}
