// Sistema Operativo · Taxonomía fija (7 áreas · 27 sub-ejes)
// ═══════════════════════════════════════════════════════════════════
// Constante de aplicación, NO configurable por el usuario (§2.1 del
// traspaso). Portada IDÉNTICA al prototipo v6 (arreglo AREAS): ids,
// dueños, nombres y el enfoque/estrategia por defecto de cada sub-eje.
//
// El texto de estrategia de acá es el DEFECTO: si alguien lo edita, el
// valor editado vive en la tabla so_sub_eje_estrategia y manda sobre este.

import { areaDeSubEje } from "./pce.mjs";

export type Horizonte = "corto" | "mediano" | "largo";
export type Valor =
  | "Comunidad"
  | "Autenticidad"
  | "Patrimonio"
  | "Acción"
  | "Excelencia";
export type EstadoEspacio =
  | "operativo"
  | "atención"
  | "intervención"
  | "fuera"
  | "definir";

export type SubEje = { id: string; nombre: string; estrategia: string };
export type AreaDef = { id: string; nombre: string; dueno: string; subEjes: SubEje[] };

export const VALORES: Valor[] = [
  "Comunidad",
  "Autenticidad",
  "Patrimonio",
  "Acción",
  "Excelencia",
];

export const ESTADOS_ESPACIO: { value: EstadoEspacio; label: string }[] = [
  { value: "operativo", label: "Operativo" },
  { value: "atención", label: "Requiere atención" },
  { value: "intervención", label: "En intervención" },
  { value: "fuera", label: "Fuera de servicio" },
  { value: "definir", label: "Por definir" },
];

export const AREAS: AreaDef[] = [
  {
    id: "DIR-01",
    nombre: "Dirección & Estrategia",
    dueno: "Rodrigo Pietri",
    subEjes: [
      { id: "DIR-01.1", nombre: "Visión y portafolio", estrategia: "Curaduría antes que acumulación. Cada línea nueva debe desplazar a una existente o justificar por qué no." },
      { id: "DIR-01.2", nombre: "Alianzas y expansión", estrategia: "Probar el modelo en Caracas antes de venderlo afuera. Un socio bien elegido vale más que cinco conversaciones abiertas." },
      { id: "DIR-01.3", nombre: "Legal, permisología y riesgo", estrategia: "Bajo volumen, alta consecuencia. Todo contrato pasa por asesoría antes de firma; nada se resuelve por costumbre." },
      { id: "DIR-01.4", nombre: "Gobierno y decisiones", estrategia: "Ritmo antes que documentación. Un comité mensual que decide vale más que un tablero perfecto que nadie revisa." },
    ],
  },
  {
    id: "ESP-02",
    nombre: "Espacios & Inquilinos",
    dueno: "Beatriz Márquez",
    subEjes: [
      { id: "ESP-02.1", nombre: "Comercialización de espacios", estrategia: "Prospección activa por Instagram y red de instructores. El dossier no vende solo." },
      { id: "ESP-02.2", nombre: "Relación y retención", estrategia: "Retener cuesta menos que colocar. Un encuentro trimestral de inquilinos previene la mayoría de las salidas." },
      { id: "ESP-02.3", nombre: "Contratos y cánones", estrategia: "Fecha única de cobro, recordatorio automático y cero excepciones. La flexibilidad en el cobro se vuelve política." },
      { id: "ESP-02.4", nombre: "Ocupación y disponibilidad", estrategia: "Medir bloques usados, no espacios alquilados. La ocupación real está en el calendario." },
    ],
  },
  {
    id: "EXP-03",
    nombre: "Experiencias",
    dueno: "Beatriz Márquez",
    subEjes: [
      { id: "EXP-03.1", nombre: "Eventos privados", estrategia: "Un solo SOP y un solo contrato tipo. Los eventos se pierden en la producción, no en la venta." },
      { id: "EXP-03.2", nombre: "Programación cultural", estrategia: "Curaduría con criterio propio, no relleno de calendario. Publicar con 30 días permite que la comunidad se organice." },
      { id: "EXP-03.3", nombre: "Programación bienestar", estrategia: "Recurrencia sobre novedad. Cuatro actividades fijas al mes sostienen más que doce esporádicas." },
      { id: "EXP-03.4", nombre: "Producción y montaje", estrategia: "Checklist de montaje y desmontaje por tipo de evento. El desgaste del equipo ocurre acá." },
    ],
  },
  {
    id: "GAS-04",
    nombre: "Gastronomía",
    dueno: "Lucía Dickson",
    subEjes: [
      { id: "GAS-04.1", nombre: "Comedor", estrategia: "P&L propio. Si no se mide como negocio, se comporta como costo." },
      { id: "GAS-04.2", nombre: "Cafetín & barra", estrategia: "Cautivar al inquilino diario antes que al visitante ocasional." },
      { id: "GAS-04.3", nombre: "Catering & eventos", estrategia: "Propuesta cerrada por tipo de evento; nada de menús a medida sin recargo." },
      { id: "GAS-04.4", nombre: "Compras y costeo", estrategia: "Ficha técnica por plato, o el food cost es una opinión." },
    ],
  },
  {
    id: "OPS-05",
    nombre: "Operaciones, Casa & Gente",
    dueno: "Beatriz Márquez",
    subEjes: [
      { id: "OPS-05.1", nombre: "Mantenimiento e inmueble", estrategia: "Preventivo sobre correctivo. La casa de 1955 es el activo, no el escenario." },
      { id: "OPS-05.2", nombre: "Servicios y proveedores", estrategia: "Dos proveedores calificados por servicio crítico. La dependencia única es un riesgo, no un ahorro." },
      { id: "OPS-05.3", nombre: "Seguridad", estrategia: "Protocolo escrito de apertura, cierre e incidente, con responsable por turno." },
      { id: "OPS-05.4", nombre: "Anfitrionaje y experiencia", estrategia: "La bitácora diaria es el instrumento; el estándar de servicio, el contenido." },
      { id: "OPS-05.5", nombre: "Gente & nómina", estrategia: "Rol documentado, contrato vigente y compensación revisada contra mercado. Nadie trabaja en la casa sin estar en la estructura." },
    ],
  },
  {
    id: "MKT-06",
    nombre: "Marca, Comunidad & Comunicación",
    dueno: "Óscar Pietri",
    subEjes: [
      { id: "MKT-06.1", nombre: "Identidad y sistema de marca", estrategia: "Coherencia sobre volumen. El manual de marca es la referencia, no una sugerencia." },
      { id: "MKT-06.2", nombre: "Contenido y canales digitales", estrategia: "Sin dueño no hay parrilla. Asignar responsable es el primer entregable, no el último." },
      { id: "MKT-06.3", nombre: "Comunidad y membresía", estrategia: "Una sola base de contactos. Hoy la comunidad existe pero no está registrada." },
      { id: "MKT-06.4", nombre: "Captación y prospección", estrategia: "Los mejores prospectos ya estuvieron en la casa." },
    ],
  },
  {
    id: "FIN-07",
    nombre: "Finanzas & Administración",
    dueno: "Sin asignar",
    subEjes: [
      { id: "FIN-07.1", nombre: "Ingresos y cobranza", estrategia: "El ingreso recurrente de ESP-02 debe cubrir los costos fijos. Todo lo demás es margen." },
      { id: "FIN-07.2", nombre: "Egresos y compras", estrategia: "Autorización previa por umbral. El gasto sin control convierte cualquier presupuesto en relato." },
      { id: "FIN-07.3", nombre: "Contabilidad y fiscal", estrategia: "Regularizar primero, optimizar después." },
      { id: "FIN-07.4", nombre: "Control de gestión", estrategia: "P&L separado por unidad, o las tres unidades se subsidian sin que nadie lo sepa." },
    ],
  },
];

/** Área por id ('ESP-02'). */
export function areaDe(id: string | null | undefined): AreaDef | null {
  if (!id) return null;
  return AREAS.find((a) => a.id === id) ?? null;
}

/** Definición de un sub-eje ('ESP-02.1'). */
export function subEjeDef(subEjeId: string | null | undefined): SubEje | null {
  const a = areaDe(areaDeSubEje(subEjeId ?? ""));
  if (!a) return null;
  return a.subEjes.find((s) => s.id === subEjeId) ?? null;
}

/** Nombre legible de un sub-eje, o su id si no se encuentra. */
export function nombreSubEje(subEjeId: string): string {
  return subEjeDef(subEjeId)?.nombre ?? subEjeId;
}

/** Todos los sub-ejes, aplanados. */
export function todosLosSubEjes(): SubEje[] {
  return AREAS.flatMap((a) => a.subEjes);
}
