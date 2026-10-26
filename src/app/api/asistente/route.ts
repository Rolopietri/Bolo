/**
 * Asistente de bolo: chat para el día a día de Cocina.
 *
 * Lee los datos del usuario con el cliente de servidor (RLS de su sesión).
 * No escribe en la base: si hay que crear un proveedor, insumo o receta,
 * abre el formulario real y la persona confirma con el botón que ya existe.
 *
 * Variables en Vercel:
 * - ANTHROPIC_API_KEY (obligatoria para las respuestas con modelo)
 * - ANTHROPIC_WORKSPACE_ID (opcional; hace falta si la clave está amarrada
 *   a un workspace)
 * Sin la clave la ruta no se cae: avisa y el chat igual puede llevar a las
 * pantallas con los atajos locales.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizarBusqueda } from "@/lib/text";
import { convertirParaCosto } from "@/lib/units";
import { CLAVES_DESTINO, DESTINOS, type ClaveDestino } from "../../cocina/_destinos";
import type { RellenoGuia } from "../../cocina/_guiaAccion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELO = "claude-haiku-5-5";
const MAX_VUELTAS = 4;

type Rol = "user" | "assistant";
type MensajeEntrada = { role: Rol; content: string };

type Accion = { destino: ClaveDestino; rellenar?: RellenoGuia };
type SeguimientoSalida = { titulo: string; detalle: string; destino?: ClaveDestino };

const FORMULARIOS = ["form_proveedor", "form_insumo", "form_receta", "form_compra"] as const;

const SISTEMA = `Eres el asistente de "bolo", una plataforma simple para la cocina de un negocio de comida. La persona no tiene experiencia técnica. Tu trabajo: responder en español claro, con datos reales, y llevarla a la pantalla correcta.

Tono: cálido, cercano, tuteo, español sencillo (Venezuela). 2 a 4 frases. Sin tecnicismos, sin JSON, sin nombres de herramientas. Pasos numerados solo si hace falta.

Montar la cocina son 4 pasos: 1) Proveedores 2) Insumos 3) Recetas 4) Compras. El stock que importa es el LIBRE (físico menos reservado). Una alerta compara ese libre con el mínimo: en cero está agotado, por debajo del mínimo está bajo, sin mínimo bolo no puede avisar. El pedido sugerido no adivina: la persona dice cuántas raciones de cada receta, bolo resta el stock libre y arma lo que falta comprar.

Unidades, ejemplo concreto: si el proveedor vende 1000 g, eso es 1 kg. Se guarda el insumo en kg (presentación de 1 kg, precio de ese kilo). En la receta se puede pedir 250 g y bolo convierte. No mezclar precio por kilo con stock en gramos sueltos. Si pregunta cómo convertir, usa mostrar_en_pantalla con destino "unidades". Si pregunta cómo guardarlo, usa preparar_formulario con form_insumo.

Cuando pregunte por SUS números (qué falta, cuántos, precios, stock, alertas, un pedido), USA las herramientas antes de responder. No inventes cifras. Si la lista está vacía, dile el siguiente paso y ábrelo. Si una herramienta devuelve destino_sugerido, llama mostrar_en_pantalla con ese destino en el mismo turno.

Para CREAR o AGREGAR un proveedor, insumo o receta, o para registrar una compra: llama preparar_formulario. Eso NO guarda nada; dile que revise y toque el botón de crear. Si dijo el nombre, pásalo. Si ya existe uno parecido, dilo y no abras un duplicado: usa buscar_* primero.

Para señalar DÓNDE está algo, llama mostrar_en_pantalla. Prefiere los destinos form_* , alertas, stock, unidades y pedido (pantallas reales) antes que los pasos del inicio. Al señalar, dilo en una frase: "Te llevo." El botón se llama "Te muestro".

Bandeja de pendientes (no es correo): si pide "recuérdame" o dejas un formulario a medias con nombre, llama anotar_seguimiento una sola vez en el turno.

Nunca pidas contraseñas ni datos sensibles. Si preguntan algo fuera de bolo, di con amabilidad que solo ayudas con la plataforma.`;

const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "estado_configuracion",
    description:
      "Cuántos proveedores, insumos, recetas y compras tiene, y el siguiente paso. Úsala para '¿qué me falta?' o 'mi avance'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "buscar_proveedores",
    description: "Busca proveedores por nombre. Sin consulta, devuelve los primeros.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Nombre o parte del nombre. Vacío = listar." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "buscar_insumos",
    description:
      "Busca insumos por nombre con precio, unidad, stock libre y si está agotado, bajo, ok o sin mínimo.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Nombre o parte. Vacío = los que están bajos o agotados primero." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "buscar_recetas",
    description: "Busca recetas por nombre, con porciones y cuántos ingredientes tiene.",
    input_schema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Nombre o parte. Vacío = listar." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "resumen_alertas",
    description:
      "Explica las alertas de stock y lista agotados y bajos con números reales. Úsala para stock, mínimos y 'qué se está acabando'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "pedido_sugerido",
    description:
      "Explica el pedido sugerido. Si dan receta y raciones, calcula qué faltaría comprar con el stock libre de ahora.",
    input_schema: {
      type: "object",
      properties: {
        receta: { type: "string", description: "Nombre de la receta, si lo dijeron." },
        raciones: { type: "number", description: "Cuántas raciones quieren preparar." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "preparar_formulario",
    description:
      "Abre el formulario real y puede dejar el nombre escrito. NO guarda. La persona confirma con el botón de la pantalla. Úsala para crear o agregar.",
    input_schema: {
      type: "object",
      properties: {
        destino: { type: "string", enum: [...FORMULARIOS] },
        nombre: { type: "string" },
        contacto: { type: "string" },
        telefono: { type: "string" },
        correo: { type: "string" },
        unidad: { type: "string", description: "Para un insumo, por ejemplo kg." },
        precio: { type: "string", description: "Precio en USD, solo dígitos y punto." },
        notas: { type: "string" },
      },
      required: ["destino"],
      additionalProperties: false,
    },
  },
  {
    name: "mostrar_en_pantalla",
    description:
      "Mueve el cursor hasta una pantalla. Úsala cuando pregunten dónde está algo o cómo llegar. Destinos: " +
      CLAVES_DESTINO.map((k) => `${k} (${DESTINOS[k].etiqueta})`).join("; ") +
      ".",
    input_schema: {
      type: "object",
      properties: {
        destino: { type: "string", enum: CLAVES_DESTINO },
        busqueda: {
          type: "string",
          description: "Si el destino es stock, texto para dejar en el buscador (ej. harina).",
        },
      },
      required: ["destino"],
      additionalProperties: false,
    },
  },
  {
    name: "anotar_seguimiento",
    description:
      "Deja un pendiente en la bandeja de la app (no envía correo). Una sola vez por turno, si piden un recordatorio o queda un alta a medias.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        detalle: { type: "string" },
        destino: { type: "string", enum: CLAVES_DESTINO },
      },
      required: ["titulo", "detalle"],
      additionalProperties: false,
    },
  },
];

type SB = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function txt(v: unknown, max = 80): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}
function redondear(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type InsRow = {
  id: string;
  nombre: string;
  unidad_base: string;
  unidad_compra: string;
  cantidad_por_compra: number;
  precio_base_usd: number | null;
  stock_libre: number;
  stock_minimo: number | null;
  proveedor_id: string | null;
  activo: boolean;
};

async function cargarInsumos(sb: SB): Promise<InsRow[]> {
  const { data, error } = await sb
    .from("insumos")
    .select(
      "id,nombre,unidad_base,unidad_compra,cantidad_por_compra,precio_base_usd,precio_compra_usd,stock_actual,stock_comprometido,stock_minimo,proveedor_id,activo",
    )
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const total = num(row.stock_actual);
    const comp = num(row.stock_comprometido);
    return {
      id: String(row.id),
      nombre: txt(row.nombre, 120),
      unidad_base: txt(row.unidad_base, 20),
      unidad_compra: txt(row.unidad_compra, 20),
      cantidad_por_compra: num(row.cantidad_por_compra) || 1,
      precio_base_usd: row.precio_base_usd == null ? null : num(row.precio_base_usd),
      stock_libre: Math.max(0, total - comp),
      stock_minimo: row.stock_minimo == null ? null : num(row.stock_minimo),
      proveedor_id: row.proveedor_id ? String(row.proveedor_id) : null,
      activo: row.activo !== false,
    };
  });
}

function estadoStock(libre: number, minimo: number | null): "agotado" | "bajo" | "ok" | "sin_minimo" {
  if (minimo == null || minimo <= 0) return "sin_minimo";
  if (libre <= 0) return "agotado";
  if (libre < minimo) return "bajo";
  return "ok";
}

function coincide(nombre: string, consulta: string): boolean {
  if (!consulta) return true;
  return normalizarBusqueda(nombre).includes(normalizarBusqueda(consulta));
}

type RecMini = {
  id: string;
  nombre: string;
  porciones: number;
  rendimiento: number | null;
  rendimientoUnidad: string | null;
  ingredientes: {
    insumoId: string | null;
    subrecetaId: string | null;
    nombre: string;
    cantidad: number;
    unidad: string;
  }[];
};

async function cargarRecetas(sb: SB): Promise<RecMini[]> {
  const { data, error } = await sb
    .from("recetas")
    .select("id,nombre,porciones,rendimiento,rendimiento_unidad,activo")
    .limit(150);
  if (error) throw error;
  const recs = (data ?? []) as Record<string, unknown>[];
  const ids = recs.map((r) => String(r.id));
  let ings: Record<string, unknown>[] = [];
  if (ids.length > 0) {
    const { data: ingData, error: ingErr } = await sb
      .from("receta_ingredientes")
      .select("receta_id,insumo_id,subreceta_id,nombre,cantidad,unidad")
      .in("receta_id", ids)
      .limit(800);
    if (ingErr) throw ingErr;
    ings = (ingData ?? []) as Record<string, unknown>[];
  }
  return recs
    .filter((r) => r.activo !== false)
    .map((r) => ({
      id: String(r.id),
      nombre: txt(r.nombre, 120),
      porciones: Math.max(1, num(r.porciones) || 1),
      rendimiento: r.rendimiento == null ? null : num(r.rendimiento),
      rendimientoUnidad: txt(r.rendimiento_unidad, 20) || null,
      ingredientes: ings
        .filter((i) => String(i.receta_id) === String(r.id))
        .map((i) => ({
          insumoId: i.insumo_id ? String(i.insumo_id) : null,
          subrecetaId: i.subreceta_id ? String(i.subreceta_id) : null,
          nombre: txt(i.nombre, 120),
          cantidad: num(i.cantidad),
          unidad: txt(i.unidad, 20),
        })),
    }));
}

/** Misma idea que el pedido de la pantalla: expande subrecetas y convierte a la unidad base. */
function consumir(
  recetaId: string,
  factor: number,
  recMap: Map<string, RecMini>,
  insMap: Map<string, InsRow>,
  acc: Map<string, { cantidad: number; unidadDudosa: boolean }>,
  visitados: Set<string>,
  depth: number,
) {
  if (depth > 5 || visitados.has(recetaId)) return;
  const r = recMap.get(recetaId);
  if (!r) return;
  const next = new Set(visitados);
  next.add(recetaId);
  const porciones = r.porciones || 1;
  for (const ing of r.ingredientes) {
    if (ing.insumoId) {
      const ins = insMap.get(ing.insumoId);
      let total = (ing.cantidad * factor) / porciones;
      let dudosa = false;
      if (ins) {
        const conv = convertirParaCosto(total, ing.unidad, ins.unidad_base);
        if (conv) {
          total = conv.resultado;
          dudosa = conv.usoFallback;
        }
      }
      const prev = acc.get(ing.insumoId);
      acc.set(ing.insumoId, {
        cantidad: (prev?.cantidad ?? 0) + total,
        unidadDudosa: Boolean(prev?.unidadDudosa) || dudosa,
      });
    } else if (ing.subrecetaId) {
      const sub = recMap.get(ing.subrecetaId);
      if (!sub?.rendimiento || sub.rendimiento <= 0) continue;
      let cantidadEnRend = (ing.cantidad * factor) / porciones;
      if (sub.rendimientoUnidad) {
        const conv = convertirParaCosto(cantidadEnRend, ing.unidad, sub.rendimientoUnidad);
        if (conv) cantidadEnRend = conv.resultado;
      }
      const subFactor = (cantidadEnRend / sub.rendimiento) * (sub.porciones || 1);
      consumir(ing.subrecetaId, subFactor, recMap, insMap, acc, next, depth + 1);
    }
  }
}

function sinSesion() {
  return JSON.stringify({
    error: "sin_sesion",
    mensaje: "No hay sesión. Pídele que entre a su cuenta para ver sus números. No inventes cifras.",
  });
}

async function ejecutarHerramienta(
  sb: SB | null,
  conSesion: boolean,
  nombre: string,
  input: Record<string, unknown>,
  accion: { current: Accion | null },
  seguimientos: SeguimientoSalida[],
): Promise<string> {
  try {
    if (nombre === "mostrar_en_pantalla") {
      const d = txt(input.destino, 40);
      if (!(CLAVES_DESTINO as string[]).includes(d)) {
        return JSON.stringify({ ok: false, error: "destino desconocido" });
      }
      const destino = d as ClaveDestino;
      const busqueda = txt(input.busqueda, 60);
      const relleno =
        destino === "stock" && busqueda ? { consulta: busqueda } : accion.current?.rellenar;
      accion.current = { destino, ...(relleno ? { rellenar: relleno } : {}) };
      return JSON.stringify({ ok: true, mostrando: DESTINOS[destino].etiqueta });
    }

    if (nombre === "preparar_formulario") {
      const d = txt(input.destino, 40);
      if (!(FORMULARIOS as readonly string[]).includes(d)) {
        return JSON.stringify({ ok: false, error: "formulario desconocido" });
      }
      const destino = d as ClaveDestino;
      const relleno: RellenoGuia = {};
      const nombreF = txt(input.nombre, 80);
      const contacto = txt(input.contacto, 80);
      const telefono = txt(input.telefono, 40);
      const correo = txt(input.correo, 80);
      const unidad = txt(input.unidad, 20);
      const precio = txt(input.precio, 20);
      const notas = txt(input.notas, 160);
      if (nombreF) relleno.nombre = nombreF;
      if (contacto) relleno.contacto = contacto;
      if (telefono) relleno.telefono = telefono;
      if (correo) relleno.correo = correo;
      if (unidad) relleno.unidad = unidad;
      if (precio) relleno.precio = precio;
      if (notas) relleno.notas = notas;
      accion.current = { destino, rellenar: relleno };
      return JSON.stringify({
        ok: true,
        mostrando: DESTINOS[destino].etiqueta,
        guardado: false,
        dile: "El formulario quedó listo. Que revise y toque el botón de guardar. No digas que ya se guardó.",
      });
    }

    if (nombre === "anotar_seguimiento") {
      const titulo = txt(input.titulo, 120);
      const detalle = txt(input.detalle, 400);
      const d = txt(input.destino, 40);
      if (!titulo || !detalle) return JSON.stringify({ ok: false, error: "faltan titulo o detalle" });
      if (seguimientos.length >= 1) {
        return JSON.stringify({ ok: false, error: "ya hay un pendiente en este turno" });
      }
      const destino = (CLAVES_DESTINO as string[]).includes(d) ? (d as ClaveDestino) : undefined;
      seguimientos.push({ titulo, detalle, ...(destino ? { destino } : {}) });
      return JSON.stringify({
        ok: true,
        dile: "Dile que quedó en Pendientes, la bandeja de abajo a la izquierda. No es un correo.",
      });
    }

    if (!sb || !conSesion) return sinSesion();

    if (nombre === "estado_configuracion") {
      const tablas = ["proveedores", "insumos", "recetas", "compras"] as const;
      const cuentas = await Promise.all(
        tablas.map(async (tabla) => {
          const { count } = await sb.from(tabla).select("*", { count: "exact", head: true });
          return count ?? 0;
        }),
      );
      const [proveedores, insumos, recetas, compras] = cuentas;
      let siguiente = "Todo listo para registrar las compras del día.";
      let destino: ClaveDestino = "form_compra";
      if (proveedores === 0) {
        siguiente = "Empieza por el primer proveedor.";
        destino = "form_proveedor";
      } else if (insumos === 0) {
        siguiente = "Sigue con el primer insumo.";
        destino = "form_insumo";
      } else if (recetas === 0) {
        siguiente = "Crea la primera receta.";
        destino = "form_receta";
      } else if (compras === 0) {
        siguiente = "Registra la primera compra para que el stock sea real.";
        destino = "form_compra";
      }
      return JSON.stringify({ proveedores, insumos, recetas, compras, siguiente, destino_sugerido: destino });
    }

    if (nombre === "buscar_proveedores") {
      const consulta = txt(input.consulta, 60);
      const { data, error } = await sb
        .from("proveedores")
        .select("nombre,contacto_telefono,contacto_email,activo")
        .order("nombre")
        .limit(80);
      if (error) throw error;
      const items = (data ?? [])
        .map((r) => r as Record<string, unknown>)
        .filter((r) => coincide(txt(r.nombre, 120), consulta))
        .slice(0, 20)
        .map((r) => ({
          nombre: txt(r.nombre, 120),
          telefono: txt(r.contacto_telefono, 40) || null,
          correo: txt(r.contacto_email, 80) || null,
          activo: r.activo !== false,
        }));
      return JSON.stringify({ consulta: consulta || null, total: items.length, proveedores: items });
    }

    if (nombre === "buscar_insumos") {
      const consulta = txt(input.consulta, 60);
      const insumos = await cargarInsumos(sb);
      let items = insumos.filter((i) => coincide(i.nombre, consulta));
      if (!consulta) {
        const peso = { agotado: 0, bajo: 1, sin_minimo: 2, ok: 3 };
        items = [...items].sort(
          (a, b) =>
            peso[estadoStock(a.stock_libre, a.stock_minimo)] -
            peso[estadoStock(b.stock_libre, b.stock_minimo)],
        );
      }
      return JSON.stringify({
        consulta: consulta || null,
        total: items.length,
        insumos: items.slice(0, 20).map((i) => ({
          nombre: i.nombre,
          unidad: i.unidad_base,
          precio_usd: i.precio_base_usd,
          stock_libre: redondear(i.stock_libre),
          stock_minimo: i.stock_minimo,
          estado: estadoStock(i.stock_libre, i.stock_minimo),
          activo: i.activo,
        })),
        como_leerlo:
          "stock_libre es lo que realmente hay. agotado = libre en cero. bajo = libre menor que el mínimo. sin_minimo = no puede alertar.",
      });
    }

    if (nombre === "buscar_recetas") {
      const consulta = txt(input.consulta, 60);
      const recetas = await cargarRecetas(sb);
      const items = recetas
        .filter((r) => coincide(r.nombre, consulta))
        .slice(0, 20)
        .map((r) => ({
          nombre: r.nombre,
          porciones: r.porciones,
          ingredientes: r.ingredientes.length,
        }));
      return JSON.stringify({ consulta: consulta || null, total: items.length, recetas: items });
    }

    if (nombre === "resumen_alertas") {
      const insumos = (await cargarInsumos(sb)).filter((i) => i.activo);
      const fila = (i: InsRow) => ({
        nombre: i.nombre,
        stock_libre: redondear(i.stock_libre),
        minimo: i.stock_minimo,
        unidad: i.unidad_base,
      });
      const agotados = insumos.filter((i) => estadoStock(i.stock_libre, i.stock_minimo) === "agotado");
      const bajos = insumos.filter((i) => estadoStock(i.stock_libre, i.stock_minimo) === "bajo");
      const sinMinimo = insumos.filter((i) => estadoStock(i.stock_libre, i.stock_minimo) === "sin_minimo");
      return JSON.stringify({
        como_funciona:
          "Se compara el stock libre (físico menos reservado) con el mínimo. Cero = agotado. Por debajo del mínimo = bajo. Sin mínimo = bolo no avisa.",
        totales: {
          insumos: insumos.length,
          agotados: agotados.length,
          bajos: bajos.length,
          sin_minimo: sinMinimo.length,
        },
        agotados: agotados.slice(0, 8).map(fila),
        bajos: bajos.slice(0, 8).map(fila),
        destino_sugerido: "alertas",
      });
    }

    if (nombre === "pedido_sugerido") {
      const recetaNombre = txt(input.receta, 80);
      const raciones = num(input.raciones);
      const [recetas, insumos] = await Promise.all([cargarRecetas(sb), cargarInsumos(sb)]);
      const explicacion =
        "La persona elige receta y raciones. bolo suma los ingredientes (y las subrecetas), convierte a la unidad base del insumo y resta el stock libre. Lo que queda es lo que hay que comprar.";
      if (!recetaNombre) {
        return JSON.stringify({
          como_funciona: explicacion,
          recetas: recetas.slice(0, 12).map((r) => r.nombre),
          destino_sugerido: "pedido",
        });
      }
      const q = normalizarBusqueda(recetaNombre);
      const hits = recetas
        .filter((r) => normalizarBusqueda(r.nombre).includes(q))
        .sort((a, b) => a.nombre.length - b.nombre.length);
      const receta = hits[0];
      if (!receta) {
        return JSON.stringify({
          como_funciona: explicacion,
          encontrada: false,
          consulta: recetaNombre,
          parecidas: recetas.slice(0, 8).map((r) => r.nombre),
        });
      }
      if (raciones <= 0) {
        return JSON.stringify({
          como_funciona: explicacion,
          encontrada: true,
          receta: receta.nombre,
          porciones_de_la_ficha: receta.porciones,
          ingredientes: receta.ingredientes.length,
          falta: "Pide las raciones para calcular el faltante.",
          destino_sugerido: "pedido",
        });
      }
      const recMap = new Map(recetas.map((r) => [r.id, r]));
      const insMap = new Map(insumos.map((i) => [i.id, i]));
      const acc = new Map<string, { cantidad: number; unidadDudosa: boolean }>();
      consumir(receta.id, raciones, recMap, insMap, acc, new Set(), 0);
      const items = [];
      let dudosa = false;
      for (const [id, uso] of acc) {
        const ins = insMap.get(id);
        if (!ins) continue;
        if (uso.unidadDudosa) dudosa = true;
        const faltante = Math.max(0, uso.cantidad - ins.stock_libre);
        if (faltante <= 0) continue;
        const empaques = Math.ceil(faltante / (ins.cantidad_por_compra || 1));
        items.push({
          nombre: ins.nombre,
          hace_falta: redondear(uso.cantidad),
          stock_libre: redondear(ins.stock_libre),
          comprar: redondear(faltante),
          unidad: ins.unidad_base,
          empaques,
          unidad_compra: ins.unidad_compra,
        });
      }
      items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      return JSON.stringify({
        como_funciona: explicacion,
        receta: receta.nombre,
        raciones,
        alcanza: items.length === 0,
        comprar: items.slice(0, 12),
        unidad_dudosa: dudosa
          ? "Alguna unidad de la receta no se pudo convertir con seguridad. Invítala a confirmarlo en la pantalla de pedido sugerido."
          : null,
        destino_sugerido: "pedido",
      });
    }

    return JSON.stringify({ error: "herramienta desconocida" });
  } catch {
    return JSON.stringify({ error: "no se pudieron leer los datos en este momento" });
  }
}

function rellenoLimpio(r: RellenoGuia | undefined): RellenoGuia | undefined {
  if (!r) return undefined;
  const out: RellenoGuia = {};
  if (r.nombre) out.nombre = r.nombre;
  if (r.contacto) out.contacto = r.contacto;
  if (r.telefono) out.telefono = r.telefono;
  if (r.correo) out.correo = r.correo;
  if (r.unidad) out.unidad = r.unidad;
  if (r.precio) out.precio = r.precio;
  if (r.notas) out.notas = r.notas;
  if (r.consulta) out.consulta = r.consulta;
  return Object.keys(out).length > 0 ? out : undefined;
}

function esClaveInvalida(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 401 || status === 403) return true;
  const msg = err instanceof Error ? err.message : "";
  return /invalid x-api-key|authentication_error|api.key/i.test(msg);
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      estado: "sin_clave",
      reply:
        "Todavía no estoy conectado: en el servidor falta ANTHROPIC_API_KEY. Puedo llevarte igual si me dices “por dónde empiezo”, “agregar un proveedor” o “cómo guardo gramos en kilos”.",
    });
  }

  let entrada: { messages?: MensajeEntrada[]; pagina?: string };
  try {
    entrada = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const historial = (entrada.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-8);
  if (historial.length === 0) {
    return NextResponse.json({ error: "sin mensajes" }, { status: 400 });
  }
  const pagina = typeof entrada.pagina === "string" ? entrada.pagina.slice(0, 120) : "";
  const sistema = pagina
    ? `${SISTEMA}\n\nAhora mismo la persona está en la página: ${pagina}`
    : SISTEMA;

  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const anthropic = new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });

  // La sesión se resuelve en paralelo al primer llamado al modelo: solo
  // hace falta cuando el modelo pide una herramienta de datos.
  const sesionP = (async () => {
    try {
      const cliente = await createSupabaseServerClient();
      const { data } = await cliente.auth.getUser();
      return { sb: cliente, conSesion: Boolean(data.user) };
    } catch (err) {
      console.error("[asistente] sesión:", err instanceof Error ? err.message : "error");
      return { sb: null as SB | null, conSesion: false };
    }
  })();

  const mensajes: Anthropic.MessageParam[] = historial.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const accion: { current: Accion | null } = { current: null };
  const seguimientos: SeguimientoSalida[] = [];

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const respuesta = await anthropic.messages.create({
        model: MODELO,
        max_tokens: 900,
        system: sistema,
        tools: HERRAMIENTAS,
        messages: mensajes,
      });

      if (respuesta.stop_reason === "tool_use") {
        mensajes.push({ role: "assistant", content: respuesta.content });
        const resultados: Anthropic.ToolResultBlockParam[] = [];
        const sesion = await sesionP;
        for (const bloque of respuesta.content) {
          if (bloque.type !== "tool_use") continue;
          const salida = await ejecutarHerramienta(
            sesion.sb,
            sesion.conSesion,
            bloque.name,
            (bloque.input ?? {}) as Record<string, unknown>,
            accion,
            seguimientos,
          );
          resultados.push({ type: "tool_result", tool_use_id: bloque.id, content: salida });
        }
        mensajes.push({ role: "user", content: resultados });
        continue;
      }

      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const relleno = rellenoLimpio(accion.current?.rellenar);
      return NextResponse.json({
        estado: "ok",
        reply: texto || "No estoy seguro de haber entendido. ¿Puedes decírmelo de otra forma?",
        accion: accion.current
          ? { destino: accion.current.destino, ...(relleno ? { rellenar: relleno } : {}) }
          : null,
        seguimientos,
      });
    }
    return NextResponse.json({
      estado: "ok",
      reply: "Esto me está tomando más de lo normal. ¿Puedes reformular tu pregunta?",
      seguimientos,
    });
  } catch (err) {
    console.error("[asistente] error:", err instanceof Error ? err.name : "error");
    if (esClaveInvalida(err)) {
      return NextResponse.json({
        estado: "clave_invalida",
        reply:
          "La clave del asistente no está funcionando. Hay que revisarla en Vercel (ANTHROPIC_API_KEY y, si aplica, ANTHROPIC_WORKSPACE_ID). Mientras, te puedo llevar a las pantallas si me lo pides directo.",
      });
    }
    return NextResponse.json({
      estado: "error",
      reply: "Disculpa, se me enredó algo al responder. Intenta de nuevo en un momentico.",
    });
  }
}
