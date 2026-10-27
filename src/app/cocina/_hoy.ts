import { stockLibre } from "@/lib/types";

/**
 * Cómo se arma «Hoy». No hay una tabla de pasos completados: cada fila sale
 * de lo que ya está en la cocina (mismas reglas que las alertas de insumos).
 *
 * Montaje (pastilla Listo / Falta):
 * - Proveedores: al menos uno activo.
 * - Insumos: al menos uno activo.
 * - Recetas: al menos una activa (incluye subrecetas).
 * - Compras: al menos una compra registrada.
 *
 * Stock (pastilla Listo / Falta / Atención), igual que Alertas:
 * - Sin mínimo: stock mínimo vacío o 0. No entra en alerta.
 * - Agotado: hay mínimo y el stock libre (total − comprometido, nunca
 *   negativo) es 0 o menos.
 * - Bajo: hay mínimo y el stock libre es mayor que 0 y menor que el mínimo.
 * - Atención si hay agotados o bajos. Falta si no hay insumos, o si hay
 *   insumos sin mínimo y ninguno en alerta. Listo si todos los que tienen
 *   mínimo están por encima.
 */

export type TonoHoy = "listo" | "falta" | "atencion";

export type ItemChecklist = {
  id: string;
  titulo: string;
  detalle: string;
  href: string;
  tono: TonoHoy;
  etiqueta: string;
  /** Ancla del cursor-guía del asistente, si esta fila la reemplaza. */
  dataGuia?: string;
};

export type ConteosHoy = {
  proveedores: number;
  insumos: number;
  recetas: number;
  compras: number;
  agotados: number;
  bajos: number;
  sinMinimo: number;
};

export type InsumoHoy = {
  id: string;
  nombre: string;
  unidadBase: string;
  stockTotal: number;
  stockComprometido: number;
  stockMinimo: number | null;
};

export type AlertaStock = {
  id: string;
  nombre: string;
  unidadBase: string;
  libre: number;
  minimo: number;
  comprometido: number;
  clase: "agotado" | "bajo";
};

const ZONA = "America/Caracas";

export function saludoDelDia(ahora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: ZONA,
    }).format(ahora),
  );
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function fechaHoyLegible(ahora = new Date()): string {
  const texto = new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: ZONA,
  }).format(ahora);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Nombre para el saludo: persona del negocio, si no el de la sesión. */
export function nombreVisible(opts: {
  persona?: string | null;
  metadata?: unknown;
}): string | null {
  const persona = opts.persona?.trim();
  if (persona) return persona;
  if (!opts.metadata || typeof opts.metadata !== "object") return null;
  const meta = opts.metadata as Record<string, unknown>;
  for (const clave of ["nombre", "name", "full_name"]) {
    const valor = meta[clave];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

function cantidad(valor: number, uno: string, varios: string): string {
  const txt = valor.toLocaleString("es-VE");
  return valor === 1 ? `${txt} ${uno}` : `${txt} ${varios}`;
}

function fila(parcial: Omit<ItemChecklist, "tono" | "etiqueta"> & { tono: TonoHoy }): ItemChecklist {
  const etiqueta =
    parcial.tono === "listo" ? "Listo" : parcial.tono === "atencion" ? "Atención" : "Falta";
  return { ...parcial, etiqueta };
}

function filaStock(c: ConteosHoy): ItemChecklist {
  const base = {
    id: "stock",
    titulo: "Stock y alertas",
    href: "/cocina/insumos?vista=alertas",
  };
  if (c.insumos === 0) {
    return fila({
      ...base,
      href: "/cocina/insumos",
      tono: "falta",
      detalle: "Cuando cargues insumos con un mínimo, aquí avisa si falta algo.",
    });
  }
  const partes: string[] = [];
  if (c.agotados > 0) partes.push(cantidad(c.agotados, "agotado", "agotados"));
  if (c.bajos > 0) partes.push(cantidad(c.bajos, "con stock bajo", "con stock bajo"));
  if (partes.length > 0) {
    return fila({
      ...base,
      tono: "atencion",
      detalle: `${partes.join(" · ")}.`,
    });
  }
  if (c.sinMinimo > 0) {
    return fila({
      ...base,
      href: "/cocina/insumos",
      tono: "falta",
      detalle:
        c.sinMinimo === c.insumos
          ? "Ningún insumo tiene stock mínimo. Defínelo para que las alertas avisen."
          : `${cantidad(c.sinMinimo, "insumo sin mínimo", "insumos sin mínimo")}. El resto está por encima.`,
    });
  }
  return fila({
    ...base,
    tono: "listo",
    detalle: "Ningún insumo está agotado ni bajo el mínimo.",
  });
}

export function checklistHoy(c: ConteosHoy): ItemChecklist[] {
  return [
    fila({
      id: "proveedores",
      titulo: "Proveedores",
      href: "/cocina/proveedores",
      dataGuia: "paso-proveedores",
      tono: c.proveedores > 0 ? "listo" : "falta",
      detalle:
        c.proveedores > 0
          ? `Hay ${cantidad(c.proveedores, "proveedor activo", "proveedores activos")}.`
          : "Agrega al menos un proveedor para poder comprar.",
    }),
    fila({
      id: "insumos",
      titulo: "Insumos",
      href: "/cocina/insumos",
      dataGuia: "paso-insumos",
      tono: c.insumos > 0 ? "listo" : "falta",
      detalle:
        c.insumos > 0
          ? `Hay ${cantidad(c.insumos, "insumo activo", "insumos activos")}.`
          : "Carga las materias primas con precio y stock.",
    }),
    fila({
      id: "recetas",
      titulo: "Recetas",
      href: "/cocina/recetas",
      dataGuia: "paso-recetas",
      tono: c.recetas > 0 ? "listo" : "falta",
      detalle:
        c.recetas > 0
          ? `Hay ${cantidad(c.recetas, "receta activa", "recetas activas")}.`
          : "Arma recetas para ver el costo real de cada plato.",
    }),
    fila({
      id: "compras",
      titulo: "Compras",
      href: "/cocina/compras",
      dataGuia: "paso-compras",
      tono: c.compras > 0 ? "listo" : "falta",
      detalle:
        c.compras > 0
          ? `Hay ${cantidad(c.compras, "compra registrada", "compras registradas")}.`
          : "Registra una compra cuando llegue mercancía. Actualiza stock y precio.",
    }),
    filaStock(c),
  ];
}

export function introHoy(c: ConteosHoy): string {
  const montaje = [c.proveedores, c.insumos, c.recetas, c.compras].filter((n) => n > 0).length;
  const alertas = c.agotados + c.bajos;
  if (montaje === 4 && alertas === 0 && c.sinMinimo === 0) {
    return "El montaje está listo y no hay stock bajo.";
  }
  if (montaje === 4 && alertas === 0) {
    return "El montaje está listo. Falta definir mínimos para que las alertas avisen.";
  }
  if (montaje === 4 && alertas > 0) {
    return "El montaje está listo. Hoy pide atención el stock.";
  }
  return "Lo que falta para operar, y el stock que conviene mirar.";
}

export function tituloChecklist(items: ItemChecklist[]): string {
  return items.every((i) => i.tono === "listo") ? "Hoy está en orden" : "Qué falta";
}

/** Clasifica insumos activos. Misma regla que la pantalla de alertas. */
export function resumirStock(insumos: InsumoHoy[]): {
  conteos: Pick<ConteosHoy, "insumos" | "agotados" | "bajos" | "sinMinimo">;
  alertas: AlertaStock[];
} {
  const alertas: AlertaStock[] = [];
  let agotados = 0;
  let bajos = 0;
  let sinMinimo = 0;
  for (const i of insumos) {
    if (i.stockMinimo === null || i.stockMinimo === 0) {
      sinMinimo += 1;
      continue;
    }
    const libre = stockLibre(i);
    if (libre <= 0) {
      agotados += 1;
      alertas.push({
        id: i.id,
        nombre: i.nombre,
        unidadBase: i.unidadBase,
        libre,
        minimo: i.stockMinimo,
        comprometido: i.stockComprometido,
        clase: "agotado",
      });
    } else if (libre < i.stockMinimo) {
      bajos += 1;
      alertas.push({
        id: i.id,
        nombre: i.nombre,
        unidadBase: i.unidadBase,
        libre,
        minimo: i.stockMinimo,
        comprometido: i.stockComprometido,
        clase: "bajo",
      });
    }
  }
  alertas.sort((a, b) => {
    if (a.clase !== b.clase) return a.clase === "agotado" ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });
  return {
    conteos: { insumos: insumos.length, agotados, bajos, sinMinimo },
    alertas,
  };
}
