export type EstadoTarea =
  | "pendiente"
  | "en_proceso"
  | "completado"
  | "urgente"
  | "bloqueado";

export type Prioridad = "alta" | "media" | "baja";

export type Area =
  | "Legal"
  | "Operaciones"
  | "Finanzas"
  | "Eventos"
  | "Branding"
  | "Mantenimiento"
  | "Cocina"
  | "Admin"
  | "Inquilinos";

export type Tarea = {
  id: string;
  titulo: string;
  estado: EstadoTarea;
  area?: Area;
  prioridad?: Prioridad;
  asignadoA?: string;
  fechaLimite?: string; // ISO date YYYY-MM-DD
  notas?: string;
  createdAt: string;
};

export type EstadoEvento =
  | "por_confirmar"
  | "confirmado"
  | "cancelado"
  | "realizado";

export type Evento = {
  id: string;
  titulo: string;
  fecha: string;                 // ISO date YYYY-MM-DD (fecha de inicio)
  /** Fecha de fin (inclusive). Si no se define, el evento es de un solo día. */
  fechaFin?: string;
  /** Horario libre, ej. "9am–6pm" o "Día 1: 9-13h · Día 2: 10-14h". */
  horario?: string;
  estado: EstadoEvento;
  ubicacion?: string;
  cliente?: string;
  /** Cantidad estimada de asistentes. */
  cantidadPersonas?: number;
  /** Descripción larga del evento (qué se va a hacer, contexto). */
  descripcion?: string;
  /** Notas internas (logística, recordatorios). */
  notas?: string;
};

export const ESTADOS_TAREA: { value: EstadoTarea; label: string; color: string; dot: string }[] = [
  { value: "pendiente", label: "Pendiente", color: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" },
  { value: "en_proceso", label: "En proceso", color: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { value: "urgente", label: "Urgente", color: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
  { value: "bloqueado", label: "Bloqueado", color: "bg-pink-50 text-pink-800 ring-pink-200", dot: "bg-pink-500" },
  { value: "completado", label: "Completado", color: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
];

export const PRIORIDADES: { value: Prioridad; label: string; color: string; dot: string }[] = [
  { value: "alta", label: "Alta", color: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
  { value: "media", label: "Media", color: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { value: "baja", label: "Baja", color: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
];

export const AREAS: Area[] = [
  "Operaciones",
  "Eventos",
  "Inquilinos",
  "Cocina",
  "Mantenimiento",
  "Finanzas",
  "Legal",
  "Branding",
  "Admin",
];

export const ESTADOS_EVENTO: { value: EstadoEvento; label: string; color: string; dot: string }[] = [
  { value: "por_confirmar", label: "Por confirmar", color: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { value: "confirmado", label: "Confirmado", color: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  { value: "cancelado", label: "Cancelado", color: "bg-stone-100 text-stone-600 ring-stone-200", dot: "bg-stone-400" },
  { value: "realizado", label: "Realizado", color: "bg-blue-50 text-blue-800 ring-blue-200", dot: "bg-blue-500" },
];

// ────────────────────────────────────────────────────────────────
// CALENDARIO — Agenda unificada (eventos, reuniones, objetivos, tareas)
// ────────────────────────────────────────────────────────────────

export type TipoCalendario = "evento" | "reunion" | "objetivo" | "tarea";

export type EstadoCalendario =
  | "pendiente"
  | "en_proceso"
  | "completado"
  | "cancelado";

export type CalendarioItem = {
  id: string;
  tipo: TipoCalendario;
  titulo: string;
  fecha: string; // YYYY-MM-DD (día de inicio)
  /** Último día (inclusive). Si no se define, ocupa un solo día. */
  fechaFin?: string;
  /** Hora opcional, formato "HH:MM" (24h). */
  hora?: string;
  /** Nombre de la persona responsable (texto libre). */
  responsable?: string;
  /** Área (texto libre / una de AREAS). */
  area?: string;
  estado: EstadoCalendario;
  notas?: string;
};

/** Los 4 tipos del calendario, con su color para diferenciarlos de un vistazo.
 *  `color` = clases del pill (fondo + texto + ring); `dot` = color del puntito. */
export const TIPOS_CALENDARIO: {
  value: TipoCalendario;
  label: string;
  color: string;
  dot: string;
}[] = [
  { value: "evento", label: "Evento", color: "bg-rose-50 text-rose-800 ring-rose-200", dot: "bg-rose-500" },
  { value: "reunion", label: "Reunión", color: "bg-blue-50 text-blue-800 ring-blue-200", dot: "bg-blue-500" },
  { value: "objetivo", label: "Objetivo / Meta", color: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  { value: "tarea", label: "Tarea", color: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
];

export const ESTADOS_CALENDARIO: {
  value: EstadoCalendario;
  label: string;
  color: string;
  dot: string;
}[] = [
  { value: "pendiente", label: "Pendiente", color: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" },
  { value: "en_proceso", label: "En proceso", color: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  { value: "completado", label: "Completado", color: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  { value: "cancelado", label: "Cancelado", color: "bg-stone-100 text-stone-500 ring-stone-200", dot: "bg-stone-300" },
];

/** Metadatos (label/color/dot) de un tipo; cae al primero si no se reconoce. */
export function tipoCalendarioMeta(t: string) {
  return TIPOS_CALENDARIO.find((x) => x.value === t) ?? TIPOS_CALENDARIO[0];
}

/** Metadatos (label/color/dot) de un estado; cae al primero si no se reconoce. */
export function estadoCalendarioMeta(e: string) {
  return ESTADOS_CALENDARIO.find((x) => x.value === e) ?? ESTADOS_CALENDARIO[0];
}

// ────────────────────────────────────────────────────────────────
// EVENTOS — Checklist por fase + Cronograma + Plantillas
// (Replica el flujo del spreadsheet de Beatriz)
// ────────────────────────────────────────────────────────────────

export type FaseEvento =
  | "pre-pro"
  | "montaje"
  | "ejecucion"
  | "desmontaje"
  | "cierre";

export const FASES_EVENTO: { value: FaseEvento; label: string; color: string }[] = [
  { value: "pre-pro", label: "Pre-producción", color: "bg-stone-100 text-stone-700 ring-stone-200" },
  { value: "montaje", label: "Montaje", color: "bg-amber-50 text-amber-800 ring-amber-200" },
  { value: "ejecucion", label: "Ejecución", color: "bg-blue-50 text-blue-800 ring-blue-200" },
  { value: "desmontaje", label: "Desmontaje", color: "bg-violet-50 text-violet-800 ring-violet-200" },
  { value: "cierre", label: "Cierre", color: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
];

export function faseLabel(f: string): string {
  return FASES_EVENTO.find((x) => x.value === f)?.label ?? f;
}

export type EstatusActividad = "pendiente" | "hecho" | "omitido";

export const ESTATUS_ACTIVIDAD: { value: EstatusActividad; label: string; color: string }[] = [
  { value: "pendiente", label: "Pendiente", color: "bg-stone-100 text-stone-700 ring-stone-200" },
  { value: "hecho", label: "Hecho", color: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  { value: "omitido", label: "Omitido", color: "bg-stone-100 text-stone-500 ring-stone-200" },
];

export type EventoTarea = {
  id: string;
  eventoId: string;
  fase: string;                  // FaseEvento o texto libre
  titulo: string;
  responsable?: string;          // texto libre
  notas?: string;
  fechaLimite?: string;          // YYYY-MM-DD
  completada: boolean;
  orden: number;
};

export type EventoActividad = {
  id: string;
  eventoId: string;
  hora?: string;                 // HH:MM (24h)
  actividad: string;
  responsable?: string;
  ubicacion?: string;
  observaciones?: string;
  critica: boolean;
  estatus: EstatusActividad;
  orden: number;
};

export type EventoPlantilla = {
  id: string;
  nombre: string;
  descripcion?: string;
  activa: boolean;
};

export type PlantillaTarea = {
  id: string;
  plantillaId: string;
  fase: string;
  titulo: string;
  responsable?: string;
  notas?: string;
  /** null = sin fecha; >0 = N días antes; 0 = el día; <0 = N días después. */
  diasOffset?: number;
  orden: number;
};

export type PlantillaActividad = {
  id: string;
  plantillaId: string;
  hora?: string;
  actividad: string;
  responsable?: string;
  ubicacion?: string;
  observaciones?: string;
  critica: boolean;
  orden: number;
};

export const RESPONSABLES_EVENTO_SUGERIDOS = [
  "Quinta Mamá",
  "Beatriz",
  "Colaborador",
  "Anfitriona",
  "Cliente",
  "Catering",
  "Técnico audio",
  "Florista",
  "Limpieza",
];

// ────────────────────────────────────────────────────────────────
// PRESUPUESTOS
// ────────────────────────────────────────────────────────────────

export type CategoriaServicio =
  | "espacio"
  | "catering"
  | "equipo"
  | "padel"
  | "tecnico"
  | "otros";

export type UnidadServicio =
  | "dia"
  | "medio_dia"
  | "bloque"
  | "hora"
  | "mes"
  | "persona"
  | "evento"
  | "unidad";

export type Servicio = {
  id: string;
  categoria: CategoriaServicio;
  nombre: string;
  descripcion?: string;
  unidad: UnidadServicio;
  precioUnitario: number | null; // null si es manual
  manual: boolean;
  incluido: boolean;
  activo: boolean;
  orden: number;
};

export type EstadoPresupuesto =
  | "borrador"
  | "enviado"
  | "aprobado"
  | "rechazado";

export type PresupuestoItem = {
  id: string;
  serviceId?: string;
  nombre: string;
  categoria?: CategoriaServicio;
  unidad: UnidadServicio;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  orden: number;
};

export type Presupuesto = {
  id: string;
  numero: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  clienteRif?: string;
  eventoNombre: string;
  eventoFecha?: string;
  eventoHora?: string;
  /** Nº de personas esperadas en el evento. */
  cantidadPersonas?: number;
  /** Logística de montaje/desmontaje. Si quedan vacíos, el PDF usa la fecha
   *  y hora del evento. */
  montajeFecha?: string;
  montajeHora?: string;
  desmontajeFecha?: string;
  desmontajeHora?: string;
  notas?: string;
  validezDias: number;
  descuento: number;
  estado: EstadoPresupuesto;
  subtotal: number;
  total: number;
  eventoId?: string;
  items: PresupuestoItem[];
  createdAt: string;
};

export const CATEGORIAS_SERVICIO: {
  value: CategoriaServicio;
  label: string;
}[] = [
  { value: "espacio", label: "Espacios" },
  { value: "catering", label: "Catering" },
  { value: "equipo", label: "Equipo & Personal" },
  { value: "padel", label: "Pádel" },
  { value: "tecnico", label: "Técnico" },
  { value: "otros", label: "Otros" },
];

export const UNIDADES: { value: UnidadServicio; label: string }[] = [
  { value: "dia", label: "día" },
  { value: "medio_dia", label: "medio día" },
  { value: "bloque", label: "bloque (1.5h)" },
  { value: "hora", label: "hora" },
  { value: "mes", label: "mes" },
  { value: "persona", label: "persona" },
  { value: "evento", label: "evento" },
  { value: "unidad", label: "unidad" },
];

export const ESTADOS_PRESUPUESTO: {
  value: EstadoPresupuesto;
  label: string;
  color: string;
}[] = [
  {
    value: "borrador",
    label: "Borrador",
    color: "bg-stone-100 text-stone-700 ring-stone-200",
  },
  {
    value: "enviado",
    label: "Enviado",
    color: "bg-blue-50 text-blue-800 ring-blue-200",
  },
  {
    value: "aprobado",
    label: "Aprobado",
    color: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  {
    value: "rechazado",
    label: "Rechazado",
    color: "bg-stone-100 text-stone-600 ring-stone-200",
  },
];

export function unidadLabel(u: UnidadServicio): string {
  return UNIDADES.find((x) => x.value === u)?.label ?? u;
}

// ────────────────────────────────────────────────────────────────
// COCINA — M1 Materias Primas
// ────────────────────────────────────────────────────────────────

export type Seccion = "cafetin" | "comedor" | "ambos";

export type CategoriaInsumo =
  | "cafe"
  | "lacteos"
  | "frutas"
  | "panaderia"
  | "proteinas"
  | "salsas"
  | "bebidas"
  | "desechables"
  | "condimentos"
  | "snacks"
  | "otros";

export type Proveedor = {
  id: string;
  nombre: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
  aceptaBsBcvDolar: boolean;
  aceptaBsBcvEuro: boolean;
  aceptaBsParalela: boolean;
  aceptaUsdEfectivo: boolean;
  aceptaUsdDivisa: boolean;
  notas?: string;
  activo: boolean;
};

export type Insumo = {
  id: string;
  /** Texto libre. Las predefinidas (CATEGORIAS_INSUMO) son solo sugerencias;
   *  se pueden crear categorías nuevas en cualquier momento. */
  categoria: string;
  /** Categoría de COMPRA (nombre de categoria_insumo). Independiente de
   *  `categoria` (que Ventas usa para insumos de reventa). Es la que agrupa el
   *  Análisis de Compras. Se asigna desde "Clasificar insumos". */
  categoriaCompra?: string;
  nombre: string;
  seccion: Seccion;
  unidadCompra: string;
  cantidadPorCompra: number;
  unidadBase: string;
  precioCompraUsd: number | null;
  precioBaseUsd: number | null;
  /** Fecha (YYYY-MM-DD) en que el precio se confirmó por última vez — sea por
   *  una compra registrada o por un refresco manual ("actualizar a hoy"). Sirve
   *  para avisar en el costeo cuando un precio quedó viejo. Si es null, se usa
   *  `ultimaFecha` (fecha de la última compra) como referencia de frescura. */
  precioActualizado?: string;
  // ── Stock de 3 capas (M5) ─────────────────────────────────────
  /** Stock físico — solo cambia con compras recibidas o pérdidas/mermas.
   *  En DB se persiste como `stock_actual` (no renombramos la columna para
   *  no romper triggers existentes). */
  stockTotal: number;
  /** Stock reservado por planes de producción activos. Disminuye al vender
   *  por Xetux, completar producción o cancelar plan. */
  stockComprometido: number;
  /** Mínimo de stock libre antes de generar alerta y pedido sugerido.
   *  La spec lo llama "cantidad mínima de compra" del proveedor. */
  stockMinimo: number | null;
  /** % de peso que pierde el insumo al cocinarse (0–99). Opcional. Sirve para
   *  registrar pérdidas pesando el producto ya cocido: el sistema convierte
   *  el peso cocido a su equivalente crudo (crudo = cocido / (1 - %/100))
   *  antes de descontar del stock, que se lleva en crudo. */
  mermaCoccionPorc?: number | null;
  proveedorId?: string;
  ultimaFecha?: string;
  ultimaCantidad?: number;
  ultimaPrecioUsd?: number;
  ultimaPrecioBs?: number;
  penultimaFecha?: string;
  penultimaCantidad?: number;
  penultimaPrecioUsd?: number;
  penultimaPrecioBs?: number;
  notas?: string;
  activo: boolean;
};

/** stockLibre = stockTotal - stockComprometido (nunca negativo). Es lo que
 *  se compara contra stockMinimo para alertas y lo que se usa para calcular
 *  pedidos sugeridos. */
export function stockLibre(i: Pick<Insumo, "stockTotal" | "stockComprometido">): number {
  return Math.max(0, i.stockTotal - i.stockComprometido);
}

// ── Frescura del precio (economía volátil) ──────────────────────────
// En Venezuela los precios cambian rápido: un precio de hace semanas ya no
// sirve para costear. Estos umbrales definen cuándo avisar que un precio está
// viejo. Son globales; si más adelante quieres afinarlos por insumo o hacerlos
// editables, se mueven a CocinaConfig.
export const PRECIO_FRESCO_DIAS = 45; // hasta 45 días: fresco (no se muestra)
export const PRECIO_VIEJO_DIAS = 90; // 46–90: revisar · >90: viejo

export type NivelFrescuraPrecio = "fresco" | "revisar" | "viejo" | "sin_fecha";

/** Clasifica qué tan viejo es un precio a partir de su fecha (YYYY-MM-DD) y la
 *  fecha de hoy (YYYY-MM-DD). Devuelve el nivel y los días transcurridos. */
export function frescuraPrecio(
  fechaISO: string | null | undefined,
  hoyISO: string,
): { nivel: NivelFrescuraPrecio; dias: number | null } {
  if (!fechaISO) return { nivel: "sin_fecha", dias: null };
  const f = new Date(fechaISO.slice(0, 10) + "T00:00:00");
  const hoy = new Date(hoyISO.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(f.getTime()) || Number.isNaN(hoy.getTime()))
    return { nivel: "sin_fecha", dias: null };
  const dias = Math.floor((hoy.getTime() - f.getTime()) / 86_400_000);
  if (dias <= PRECIO_FRESCO_DIAS) return { nivel: "fresco", dias: Math.max(0, dias) };
  if (dias <= PRECIO_VIEJO_DIAS) return { nivel: "revisar", dias };
  return { nivel: "viejo", dias };
}

export type ModalidadPago =
  | "bcv_dolar"
  | "bcv_euro"
  | "paralela"
  | "efectivo"
  | "divisa";

export type Compra = {
  id: string;
  insumoId: string;
  proveedorId?: string;
  fecha: string;
  cantidad: number;
  precioTotalUsd: number;
  precioTotalBs?: number;
  tasaBcvUsada?: number;
  modalidadPago?: ModalidadPago;
  notas?: string;
  /** Número de factura del proveedor (para conciliación y contabilidad). */
  numeroFactura?: string;
  /** Flete / delivery que el proveedor cobra por traer los insumos. Suma al
   *  total de la factura, pero NO al precio unitario del insumo. */
  fleteUsd?: number;
  /** Estado de pago al proveedor. true = ya pagada (default). false = cuenta por
   *  pagar (pago diferido). */
  pagada: boolean;
  /** Fecha en que se pagó (null mientras está por pagar). */
  fechaPago?: string;
};

export type TasaBcv = {
  fecha: string;
  usdBs: number;
  eurBs?: number;
  paralelaBs?: number;
  fuente: string;
};

export const SECCIONES: { value: Seccion; label: string }[] = [
  { value: "cafetin", label: "Cafetín" },
  { value: "comedor", label: "Comedor" },
  { value: "ambos", label: "Ambos" },
];

export const CATEGORIAS_INSUMO: { value: CategoriaInsumo; label: string }[] = [
  { value: "cafe", label: "Café & Té" },
  { value: "lacteos", label: "Lácteos" },
  { value: "frutas", label: "Frutas & Vegetales" },
  { value: "panaderia", label: "Panadería" },
  { value: "proteinas", label: "Proteínas" },
  { value: "salsas", label: "Salsas & Aderezos" },
  { value: "bebidas", label: "Bebidas" },
  { value: "desechables", label: "Desechables" },
  { value: "condimentos", label: "Condimentos & Especias" },
  { value: "snacks", label: "Snacks" },
  { value: "otros", label: "Otros" },
];

/** Etiquetas sugeridas de categoría de insumo (para chips del formulario). */
export const CATEGORIAS_INSUMO_SUGERIDAS: string[] = CATEGORIAS_INSUMO.map(
  (c) => c.label,
);

/** Muestra la categoría de un insumo. Primero busca en las categorías de insumo;
 *  si no, intenta con las categorías FINAS de venta (para ítems de reventa
 *  clasificados desde Análisis de ventas); si tampoco, lo devuelve tal cual. */
export function categoriaInsumoLabel(categoria: string): string {
  const cat = CATEGORIAS_INSUMO.find((c) => c.value === categoria)?.label;
  if (cat) return cat;
  const fina = CATEGORIAS_RECETA.find((c) => c.value === categoria)?.label;
  return fina ?? categoria;
}

export const MODALIDADES_PAGO: { value: ModalidadPago; label: string }[] = [
  { value: "bcv_dolar", label: "Bs · BCV $" },
  { value: "bcv_euro", label: "Bs · BCV €" },
  { value: "paralela", label: "Bs · Paralela" },
  { value: "efectivo", label: "USD efectivo" },
  { value: "divisa", label: "USD divisa" },
];

// ────────────────────────────────────────────────────────────────
// PRESUPUESTOS — Inventario de alquiler + Contratistas
// ────────────────────────────────────────────────────────────────

export type EstadoInventario = "disponible" | "mantenimiento" | "agotado";

export type InventarioItem = {
  id: string;
  nombre: string;
  categoria: string;              // texto libre (Mesas, Sillas, Textiles, etc.)
  descripcion?: string;
  cantidadDisponible: number;
  precioAlquilerUsd?: number;
  estado: EstadoInventario;
  fotoUrl?: string;
  notas?: string;
  activo: boolean;
};

export type Contratista = {
  id: string;
  nombre: string;
  especialidad: string;            // texto libre (Fotografía, DJ, etc.)
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
  precioReferencialUsd?: number;
  comisionPorc?: number;
  notas?: string;
  activo: boolean;
};

export const ESTADOS_INVENTARIO: {
  value: EstadoInventario;
  label: string;
  color: string;
}[] = [
  {
    value: "disponible",
    label: "Disponible",
    color: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  {
    value: "mantenimiento",
    label: "Mantenimiento",
    color: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  {
    value: "agotado",
    label: "Agotado",
    color: "bg-red-50 text-red-800 ring-red-200",
  },
];

// Sugerencias iniciales para el autocomplete (no son obligatorias —
// el usuario puede crear las suyas)
export const CATEGORIAS_INVENTARIO_SUGERIDAS = [
  "Mesas",
  "Sillas",
  "Textiles",
  "Vajilla",
  "Cristalería",
  "Lounge",
  "Decoración",
  "Iluminación",
  "Otros",
];

export const ESPECIALIDADES_CONTRATISTA_SUGERIDAS = [
  "Fotografía",
  "Video",
  "DJ / Sonido",
  "Decoración",
  "Florista",
  "Catering externo",
  "Transporte",
  "Animación / Show",
  "Maquillaje / Estilismo",
  "Otros",
];

// ────────────────────────────────────────────────────────────────
// COCINA — M2 Recetas
// ────────────────────────────────────────────────────────────────

export type CategoriaReceta =
  // Finas (actuales)
  | "cafe_espresso"
  | "cafe_leche"
  | "te"
  | "limonadas"
  | "jugos"
  | "refrescos"
  | "smoothie"
  | "desayuno"
  | "sandwich"
  | "bowl"
  | "plato"
  | "pasapalos"
  | "postre"
  | "reposteria"
  | "otros"
  // Anteriores (legacy): se conservan para no romper recetas ya clasificadas.
  | "cafe"
  | "bebida"
  | "snack";

export type RecetaIngrediente = {
  id: string;
  /** Si la línea referencia un insumo del catálogo. */
  insumoId?: string;
  /** Si la línea referencia una sub-receta (mutuamente exclusivo con insumoId). */
  subrecetaId?: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  observaciones?: string;
  /** Precio manual por unidad — usado solo si insumoId y subrecetaId son null (ad-hoc). */
  costoManualUsd?: number;
  /** Marca que este ingrediente va sin insumo del catálogo A PROPÓSITO (ej: agua
   *  de filtro): no descuenta stock ni suma costo, y no dispara el aviso. Solo
   *  aplica a líneas sin insumoId ni subrecetaId. */
  sinInsumoOk?: boolean;
  orden: number;
  // Calculado al vuelo (no en DB):
  costoSubtotal?: number;
};

export type Receta = {
  id: string;
  nombre: string;
  seccion: Seccion;
  /** Categoría: una de las sugeridas en `CATEGORIAS_RECETA` o texto libre
   *  (categoría nueva creada desde el formulario). Se guarda como texto. */
  categoria?: string;
  perfil?: string;
  porciones: number;
  tiempoPrepMin?: number;
  tiempoCoccionMin?: number;
  temperatura?: string;
  procedimiento?: string;
  presentacion?: string;
  notasChef?: string;
  variaciones?: string;
  responsable?: string;
  fotoUrl?: string;
  precioSugeridoUsd?: number;
  /** Nombre tal como aparece en el export del POS Xetux (para matchear ventas). */
  xetux_nombre?: string;
  /** Si es true, esta receta es una preparación intermedia (salsa, mezcla, etc)
   *  que se usa como ingrediente de otras recetas. NO se vende directamente. */
  esSubreceta: boolean;
  /** Cuántas unidades base produce 1 batch (porción) de esta subreceta. */
  rendimiento?: number;
  /** Unidad del rendimiento (g, ml, unidad). */
  rendimientoUnidad?: string;
  activo: boolean;
  ingredientes: RecetaIngrediente[];
  createdAt: string;
};

// Categorías FINAS (un nivel). Son las que se sugieren al clasificar una receta.
export const CATEGORIAS_RECETA: { value: CategoriaReceta; label: string }[] = [
  { value: "cafe_espresso", label: "Café espresso" },
  { value: "cafe_leche", label: "Café con leche" },
  { value: "te", label: "Té e infusiones" },
  { value: "limonadas", label: "Limonadas" },
  { value: "jugos", label: "Jugos y frutales" },
  { value: "refrescos", label: "Refrescos y sodas" },
  { value: "smoothie", label: "Smoothies" },
  { value: "desayuno", label: "Desayunos" },
  { value: "sandwich", label: "Sándwiches" },
  { value: "bowl", label: "Bowls" },
  { value: "plato", label: "Platos fuertes" },
  { value: "pasapalos", label: "Pasapalos / Tequeños" },
  { value: "postre", label: "Postres" },
  { value: "reposteria", label: "Repostería" },
  { value: "otros", label: "Otros" },
];

// Etiquetas de las categorías anteriores, para que las recetas ya clasificadas
// sigan mostrando un nombre bonito hasta que se reasignen a las finas.
const CATEGORIAS_RECETA_LEGACY: Record<string, string> = {
  cafe: "Café & Bebida caliente",
  bebida: "Bebida fría",
  snack: "Snack",
};

/** Etiquetas sugeridas de categoría de receta (para el desplegable del form). */
export const CATEGORIAS_RECETA_SUGERIDAS: string[] = CATEGORIAS_RECETA.map(
  (c) => c.label,
);

/** Muestra la categoría de receta: si es una de las conocidas (fina o legacy)
 *  devuelve su etiqueta; si es texto libre (categoría nueva) lo devuelve tal cual. */
export function categoriaRecetaLabel(categoria: string): string {
  return (
    CATEGORIAS_RECETA.find((c) => c.value === categoria)?.label ??
    CATEGORIAS_RECETA_LEGACY[categoria] ??
    categoria
  );
}

// ────────────────────────────────────────────────────────────────
// COCINA — M3 Costeo + M4 Rentabilidad
// ────────────────────────────────────────────────────────────────

export type CocinaConfig = {
  foodCostObjetivoPorc: number;     // ej 30 → food cost target 30%
  gastosOperativosPorc: number;     // ej 15 → 15% de gastos fijos
  margenVerdeMin: number;           // margen bruto % mínimo para verde
  margenAmarilloMin: number;        // margen bruto % mínimo para amarillo
  /** Porcentaje de IVA aplicado a precios de carta (Venezuela: 16%). Editable
   *  por si cambia la regulación. Internamente el sistema siempre trabaja con
   *  precios sin IVA; el IVA se aplica solo para mostrar el "precio de carta". */
  ivaPorc: number;
};

/** Calcula el precio con IVA a partir del precio sin IVA. */
export function precioConIva(precioSinIva: number, ivaPorc: number): number {
  return precioSinIva * (1 + ivaPorc / 100);
}

/** Calcula el precio sin IVA a partir del precio con IVA. */
export function precioSinIva(precioConIva: number, ivaPorc: number): number {
  return precioConIva / (1 + ivaPorc / 100);
}

export type RentabilidadReceta = {
  costoPorPorcion: number;
  /** Precio de venta sin IVA — el canónico que usa el sistema para márgenes. */
  precioVentaUsd: number | null;
  /** Precio con IVA (lo que aparece en carta para el cliente). Derivado. */
  precioVentaConIvaUsd: number | null;
  margenBrutoPorc: number | null;   // (precio - costo) / precio * 100  — sobre SIN IVA
  margenNetoPorc: number | null;    // margen bruto - gastos operativos — sobre SIN IVA
  foodCostPorc: number | null;      // costo / precio * 100             — sobre SIN IVA
  precioSugeridoAlObjetivo: number; // costo / (foodCostObjetivo/100)   — SIN IVA
  /** Precio sugerido al objetivo, con IVA aplicado. */
  precioSugeridoAlObjetivoConIva: number;
  semaforo: "verde" | "amarillo" | "rojo" | "sin_precio";
};

// ────────────────────────────────────────────────────────────────
// COCINA — M5 Ventas, inventario y pedidos
// ────────────────────────────────────────────────────────────────

export type FuenteVenta = "manual" | "xetux_csv" | "xetux_api";

export type Venta = {
  id: string;
  fecha: string;
  recetaId?: string;
  recetaNombre: string;
  cantidad: number;
  precioUnitarioUsd?: number;
  totalUsd?: number;
  fuente: FuenteVenta;
  batchId?: string;
  notas?: string;
  /** true = merma de producción (pérdida interna), NO una venta. No suma
   *  ingresos ni aparece en reportes de venta, pero sí descuenta stock y
   *  libera compromiso igual que una venta. */
  esMerma?: boolean;
  /** Motivo de la merma (falla de equipo, quemado, etc.). Solo si esMerma. */
  mermaMotivo?: string;
  /** Clasificación del ítem del POS: 'insumo' (gestionado por inventario,
   *  descuenta stock), 'servicio', 'consignacion' o 'sin_clasificar'
   *  (no gestionados por inventario). Default 'insumo'. */
  tipoItem?: TipoItem;
  /** Solo ventas de tipo 'insumo_directo': insumo que se descuenta y cuánto
   *  por unidad vendida. El descuento total = insumoCantidad × cantidad. */
  insumoId?: string;
  insumoCantidad?: number;
  /** Receta extra descontada además de la base (combos "con papas fritas"). */
  extraRecetaId?: string;
  extraCantidad?: number;
  /** Sustitución de insumo al descontar la receta base (ej. leche entera →
   *  leche de almendras). */
  swapFromInsumoId?: string;
  swapToInsumoId?: string;
  createdAt: string;
};

/** Tipo de ítem del POS respecto al módulo de inventario.
 *  - insumo:          se vende vía receta (descuenta los insumos de la receta).
 *  - insumo_directo:  se mapea directo a UN insumo (reventa: bebidas, aguas…);
 *                     descuenta `cantidadPorUnidad` de ese insumo por unidad.
 *  - servicio:        no descuenta stock (alquiler, descorche, evento…).
 *  - consignacion:    producto de un tercero; no descuenta tu stock. */
export type TipoItem =
  | "insumo"
  | "insumo_directo"
  | "servicio"
  | "consignacion"
  | "sin_clasificar";

/** Clasificación de un ítem del POS que NO es una receta (servicio,
 *  consignación, etc.), para que la importación sepa qué hacer con él. */
export type PosClasificacion = {
  id: string;
  /** Nombre normalizado del ítem tal como llega del POS (clave de match). */
  nombreNorm: string;
  /** Nombre tal como aparece en el reporte de Xetux. */
  nombreOriginal: string;
  tipo: TipoItem;
  /** Solo si tipo = 'insumo': receta a la que se vincula. */
  recetaId?: string;
  /** Opcional (tipo 'insumo'): receta EXTRA que se descuenta además de la
   *  base — ej. un combo "… con papas fritas" añade la ración de papas sin
   *  duplicar la receta del sándwich. */
  extraRecetaId?: string;
  /** Cuántas veces se descuenta la receta extra por unidad vendida. Default 1. */
  extraCantidad?: number;
  /** Sustitución de insumo (tipo 'insumo'): al descontar la receta base, el
   *  insumo `swapFromInsumoId` se reemplaza por `swapToInsumoId` en la misma
   *  cantidad — ej. un café pedido con leche de almendras en vez de entera. */
  swapFromInsumoId?: string;
  swapToInsumoId?: string;
  /** Solo si tipo = 'insumo_directo': insumo al que se vincula. */
  insumoId?: string;
  /** Solo 'insumo_directo': cuánto se descuenta de ese insumo por unidad
   *  vendida (en la unidad base del insumo). Default 1. */
  cantidadPorUnidad?: number;
  /** Solo consignación: proveedor y % de acuerdo (para futura liquidación). */
  proveedorId?: string;
  porcentajeAcuerdo?: number;
  createdAt: string;
  updatedAt: string;
};

/** Motivos de merma de producción (pérdida de algo ya preparado/pre-producido). */
export const MOTIVOS_MERMA_PRODUCCION = [
  "Falla de equipo",
  "Quemado / mal cocido",
  "Se cayó / derramó",
  "Contaminación",
  "Otro",
] as const;

export type PedidoSugeridoItem = {
  insumoId: string;
  insumoNombre: string;
  unidadCompra: string;
  unidadBase: string;
  cantidadPorCompra: number;
  cantidadNecesaria: number;     // en unidad_base
  /** stockLibre del insumo al momento del cálculo (= stockTotal - stockComprometido). */
  stockLibre: number;
  faltante: number;              // en unidad_base
  empaquesNecesarios: number;    // ceil(faltante / cantidad_por_compra)
  precioCompraUsd: number | null;
  costoTotalEstimado: number;
  proveedorNombre?: string;
};

export type PedidoSugerido = {
  recetasObjetivo: { recetaId: string; recetaNombre: string; raciones: number }[];
  items: PedidoSugeridoItem[];
  costoTotalEstimado: number;
};

// ────────────────────────────────────────────────────────────────
// COCINA — M6 Menaje (vajilla, cristalería, cubiertos, utensilios)
// ────────────────────────────────────────────────────────────────

export type MenajeItem = {
  id: string;
  nombre: string;
  categoria: string;              // texto libre
  descripcion?: string;
  cantidadActual: number;
  cantidadInicial?: number;
  precioReposicionUsd?: number;
  fotoUrl?: string;
  notas?: string;
  activo: boolean;
};

/** Tipos de movimiento del menaje. */
export type TipoMovimientoMenaje =
  | "rotura"
  | "deterioro"
  | "mancha"
  | "perdida"
  | "robo"
  | "otro"
  | "ajuste"
  | "compra"
  | "reposicion";

export type MovimientoMenaje = {
  id: string;
  itemId: string;
  tipo: TipoMovimientoMenaje;
  /** Positivo = entra (compra/reposición). Negativo = sale (rotura, etc.) */
  cantidad: number;
  motivo?: string;
  fecha: string;
  facturaUrl?: string;
  facturaNombre?: string;
  precioUnitarioUsd?: number;
  precioTotalUsd?: number;
  nota?: string;
  createdAt: string;
};

export const TIPOS_BAJA_MENAJE: {
  value: Extract<TipoMovimientoMenaje, "rotura" | "deterioro" | "mancha" | "perdida" | "robo" | "otro">;
  label: string;
}[] = [
  { value: "rotura", label: "Rotura" },
  { value: "deterioro", label: "Deterioro" },
  { value: "mancha", label: "Mancha" },
  { value: "perdida", label: "Pérdida" },
  { value: "robo", label: "Robo" },
  { value: "otro", label: "Otro" },
];

export const CATEGORIAS_MENAJE_SUGERIDAS = [
  "Vajilla",
  "Cristalería",
  "Cubiertos",
  "Bandejas",
  "Utensilios de cocina",
  "Textiles",
  "Otros",
];

/** Fotos de cristalería listas para asignar a un ítem de menaje (vienen del
 *  catálogo del proveedor). Son archivos estáticos en /public/menaje/vasos.
 *  El usuario puede elegir una de estas o subir su propia foto. */
export const FOTOS_MENAJE_SUGERIDAS: { url: string; label: string }[] = [
  { url: "/menaje/vasos/copa-vino-tinto-burdeos.png", label: "Copa Vino Tinto Burdeos" },
  { url: "/menaje/vasos/copa-ginebra.png", label: "Copa Ginebra" },
  { url: "/menaje/vasos/vaso-lexington-bebidas.png", label: "Vaso Lexington (bebidas)" },
  { url: "/menaje/vasos/vaso-lexington-rocks.png", label: "Vaso Lexington (rocks)" },
  { url: "/menaje/vasos/vaso-lata-16oz.png", label: "Vaso Lata 16oz" },
  { url: "/menaje/vasos/copa-vino-tinto.png", label: "Copa Vino Tinto" },
  { url: "/menaje/vasos/vaso-sicilia.png", label: "Vaso Sicilia" },
];

export function tipoMenajeLabel(t: string): string {
  const baja = TIPOS_BAJA_MENAJE.find((x) => x.value === t);
  if (baja) return baja.label;
  const map: Record<string, string> = {
    ajuste: "Ajuste",
    compra: "Compra",
    reposicion: "Reposición",
  };
  return map[t] ?? t;
}

// ────────────────────────────────────────────────────────────────
// COCINA — M5 Inventario · Movimientos de stock (perdida/merma/etc)
// ────────────────────────────────────────────────────────────────

/** Tipos de movimiento. Texto libre en DB pero usamos estos canónicos. */
export type TipoMovimientoStock =
  | "perdida"
  | "mal_estado"
  | "merma"
  | "vencimiento"
  | "otro"
  | "ajuste"
  | "compra_recibida"
  | "venta"
  | "comprometido_in"
  | "comprometido_out"
  | "plan_completado";

/** Capa de stock afectada. */
export type CapaStock = "total" | "comprometido";

export type StockMovimiento = {
  id: string;
  insumoId: string;
  tipo: TipoMovimientoStock;
  capa: CapaStock;
  /** Cantidad en unidad_base del insumo. Positivo = entra, negativo = sale. */
  cantidad: number;
  motivo?: string;
  fecha: string;            // YYYY-MM-DD
  nota?: string;
  createdAt: string;
};

// ── Planes de producción (M5) ──────────────────────────────────

export type EstadoPlanProduccion =
  | "pendiente"
  | "completado"
  | "cancelado"
  | "vendido";

export type PlanProduccionCompromiso = {
  id: string;
  planId: string;
  insumoId: string;
  /** En unidad_base del insumo, ya con conversión aplicada. */
  cantidad: number;
  unidadBase: string;
};

export type PlanProduccion = {
  id: string;
  recetaId: string;
  recetaNombre: string;          // snapshot
  raciones: number;
  /** Raciones ya consumidas (ventas + mermas) que liberaron su compromiso. */
  racionesConsumidas: number;
  /** De las consumidas, cuántas fueron por MERMA (pérdida de producción). */
  racionesPerdidas: number;
  fechaObjetivo?: string;        // YYYY-MM-DD
  nota?: string;
  estado: EstadoPlanProduccion;
  completadoAt?: string;
  canceladoAt?: string;
  createdAt: string;
  compromisos: PlanProduccionCompromiso[];
};

export const ESTADOS_PLAN_PRODUCCION: {
  value: EstadoPlanProduccion;
  label: string;
  color: string;
}[] = [
  {
    value: "pendiente",
    label: "Pendiente",
    color: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  {
    value: "completado",
    label: "Completado",
    color: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  {
    // Estado interno 'vendido' = plan totalmente consumido. Puede haberse
    // consumido por ventas, por merma, o mezcla — por eso el rótulo es
    // "Cerrado" (no necesariamente se vendió todo).
    value: "vendido",
    label: "Cerrado",
    color: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  {
    value: "cancelado",
    label: "Cancelado",
    color: "bg-stone-100 text-stone-600 ring-stone-200",
  },
];

/** Tipos manuales de "pérdida" para el form de inventario. */
export const TIPOS_PERDIDA: {
  value: Extract<TipoMovimientoStock, "perdida" | "mal_estado" | "merma" | "vencimiento" | "otro">;
  label: string;
}[] = [
  { value: "perdida", label: "Pérdida" },
  { value: "mal_estado", label: "Mal estado" },
  { value: "merma", label: "Merma" },
  { value: "vencimiento", label: "Vencimiento" },
  { value: "otro", label: "Otro" },
];

export function tipoMovimientoLabel(t: string): string {
  const found = TIPOS_PERDIDA.find((x) => x.value === t);
  if (found) return found.label;
  // Otros tipos canónicos
  const map: Record<string, string> = {
    ajuste: "Ajuste",
    compra_recibida: "Compra recibida",
    venta: "Venta",
    comprometido_in: "Reserva (in)",
    comprometido_out: "Reserva (out)",
    plan_completado: "Plan completado",
  };
  return map[t] ?? t;
}

// ────────────────────────────────────────────────────────────────
// COCINA — Pedidos guardados (lista de objetivos para una fecha)
// ────────────────────────────────────────────────────────────────

export type EstadoPedidoCocina = "pendiente" | "comprado" | "cancelado";

export type PedidoCocinaReceta = {
  id: string;
  pedidoId: string;
  /** Si la receta sigue existiendo, su id. Si fue borrada, queda solo el nombre. */
  recetaId?: string;
  recetaNombre: string;
  raciones: number;
  orden: number;
};

export type PedidoCocina = {
  id: string;
  nombre: string;
  fechaNecesaria?: string;            // YYYY-MM-DD
  nota?: string;
  estado: EstadoPedidoCocina;
  createdAt: string;
  recetas: PedidoCocinaReceta[];
  /** true si al marcarse "comprado" ya se generaron sus planes de producción
   *  (pendientes). Evita crearlos dos veces si se cambia el estado ida y vuelta. */
  planesGenerados: boolean;
};

export const ESTADOS_PEDIDO_COCINA: {
  value: EstadoPedidoCocina;
  label: string;
  color: string;
}[] = [
  {
    value: "pendiente",
    label: "Pendiente",
    color: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  {
    value: "comprado",
    label: "Comprado",
    color: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  {
    value: "cancelado",
    label: "Cancelado",
    color: "bg-stone-100 text-stone-600 ring-stone-200",
  },
];

export function calcRentabilidad(
  costoPorPorcion: number,
  precioVentaUsd: number | null | undefined,
  config: CocinaConfig,
): RentabilidadReceta {
  const target = config.foodCostObjetivoPorc / 100;
  const precioSugeridoAlObjetivo = target > 0 ? costoPorPorcion / target : 0;
  const precioSugeridoAlObjetivoConIva = precioConIva(
    precioSugeridoAlObjetivo,
    config.ivaPorc,
  );
  if (!precioVentaUsd || precioVentaUsd <= 0) {
    return {
      costoPorPorcion,
      precioVentaUsd: null,
      precioVentaConIvaUsd: null,
      margenBrutoPorc: null,
      margenNetoPorc: null,
      foodCostPorc: null,
      precioSugeridoAlObjetivo,
      precioSugeridoAlObjetivoConIva,
      semaforo: "sin_precio",
    };
  }
  // Todos los cálculos de margen son sobre precio SIN IVA — el IVA no es ganancia,
  // se cobra y se gira al SENIAT, así que no entra en el análisis de rentabilidad.
  const margenBruto =
    ((precioVentaUsd - costoPorPorcion) / precioVentaUsd) * 100;
  const margenNeto = margenBruto - config.gastosOperativosPorc;
  const foodCost = (costoPorPorcion / precioVentaUsd) * 100;
  let semaforo: RentabilidadReceta["semaforo"];
  if (margenBruto >= config.margenVerdeMin) semaforo = "verde";
  else if (margenBruto >= config.margenAmarilloMin) semaforo = "amarillo";
  else semaforo = "rojo";
  return {
    costoPorPorcion,
    precioVentaUsd,
    precioVentaConIvaUsd: precioConIva(precioVentaUsd, config.ivaPorc),
    margenBrutoPorc: margenBruto,
    margenNetoPorc: margenNeto,
    foodCostPorc: foodCost,
    precioSugeridoAlObjetivo,
    precioSugeridoAlObjetivoConIva,
    semaforo,
  };
}
