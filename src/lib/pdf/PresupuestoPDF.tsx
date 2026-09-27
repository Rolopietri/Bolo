/**
 * PDF de presupuesto — La Quinta Mamá
 * Usa @react-pdf/renderer (server-side).
 * Las fuentes se cargan desde /public/fonts (Node fs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";
import type { Presupuesto } from "@/lib/types";
import { unidadLabel } from "@/lib/types";

// ─── Registro de fuentes ───────────────────────────────────────────
// Se ejecuta una vez al cargar el módulo. Si una fuente falla, el
// PDF cae al sistema (Helvetica) en vez de romperse.
const fontDir = path.join(process.cwd(), "public", "fonts");

function safeReadDataUri(file: string): string | null {
  try {
    const buf = readFileSync(path.join(fontDir, file));
    return `data:font/ttf;base64,${buf.toString("base64")}`;
  } catch (e) {
    console.warn(`[pdf] No se pudo leer fuente ${file}:`, e);
    return null;
  }
}

let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  fontsRegistered = true;

  const cinzel400 = safeReadDataUri("cinzel-400.ttf");
  const cinzel500 = safeReadDataUri("cinzel-500.ttf");
  const cinzel600 = safeReadDataUri("cinzel-600.ttf");
  if (cinzel400) {
    Font.register({
      family: "Cinzel",
      fonts: [
        { src: cinzel400, fontWeight: 400 },
        ...(cinzel500 ? [{ src: cinzel500, fontWeight: 500 }] : []),
        ...(cinzel600 ? [{ src: cinzel600, fontWeight: 600 }] : []),
      ],
    });
  }

  const jost400 = safeReadDataUri("jost-400.ttf");
  const jost500 = safeReadDataUri("jost-500.ttf");
  const jost600 = safeReadDataUri("jost-600.ttf");
  if (jost400) {
    Font.register({
      family: "Jost",
      fonts: [
        { src: jost400, fontWeight: 400 },
        ...(jost500 ? [{ src: jost500, fontWeight: 500 }] : []),
        ...(jost600 ? [{ src: jost600, fontWeight: 600 }] : []),
      ],
    });
  }

  const gar400 = safeReadDataUri("garamond-400.ttf");
  const gar400i = safeReadDataUri("garamond-400i.ttf");
  if (gar400) {
    Font.register({
      family: "Garamond",
      fonts: [
        { src: gar400, fontWeight: 400, fontStyle: "normal" },
        ...(gar400i
          ? [
              {
                src: gar400i,
                fontWeight: 400 as const,
                fontStyle: "italic" as const,
              },
            ]
          : []),
      ],
    });
  }

  // Disable hyphenation (default tries to break long words)
  Font.registerHyphenationCallback((word) => [word]);
}

registerFontsOnce();

// ─── Colores ───────────────────────────────────────────────────────
const COLOR_CACAO = "#0A0A0A";
const COLOR_SOFT = "#595959";
const COLOR_MUTE = "#999999";
const COLOR_MARFIL = "#D5CECB";
const COLOR_TERRACOTTA = "#B53727";

// ─── Estilos ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontFamily: "Jost",
    fontSize: 10,
    color: COLOR_CACAO,
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 30,
  },
  logo: { width: 80, height: 80 },
  brandWrap: { alignItems: "flex-end", maxWidth: 240 },
  brandWordmark: {
    fontFamily: "Cinzel",
    fontSize: 16,
    letterSpacing: 2,
    color: COLOR_CACAO,
    marginBottom: 4,
  },
  brandLine: {
    fontFamily: "Jost",
    fontSize: 8,
    color: COLOR_SOFT,
    letterSpacing: 0.8,
    textAlign: "right",
  },
  brandLineSmall: {
    fontFamily: "Jost",
    fontSize: 7.5,
    color: COLOR_MUTE,
    textAlign: "right",
    marginTop: 1,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_MARFIL,
    marginVertical: 14,
  },
  docTitleEyebrow: {
    fontFamily: "Jost",
    fontSize: 8,
    letterSpacing: 2.5,
    color: COLOR_SOFT,
    textTransform: "uppercase",
  },
  docTitle: {
    fontFamily: "Cinzel",
    fontSize: 22,
    letterSpacing: 1.5,
    color: COLOR_CACAO,
    marginTop: 4,
  },
  docMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    fontSize: 9,
    color: COLOR_SOFT,
  },
  sectionTitle: {
    fontFamily: "Jost",
    fontWeight: 500,
    fontSize: 9,
    letterSpacing: 2,
    color: COLOR_MUTE,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  twoCol: {
    flexDirection: "row",
    gap: 30,
  },
  col: { flex: 1 },
  fieldLabel: {
    fontSize: 8,
    color: COLOR_MUTE,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 6,
  },
  fieldValue: {
    fontSize: 10,
    color: COLOR_CACAO,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_MARFIL,
    paddingBottom: 5,
    marginBottom: 5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.25,
    borderBottomColor: COLOR_MARFIL,
  },
  th: {
    fontFamily: "Jost",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: COLOR_MUTE,
  },
  td: { fontSize: 10, color: COLOR_CACAO },
  tdSoft: { fontSize: 9, color: COLOR_SOFT },
  cellDesc: { flex: 5, paddingRight: 8 },
  cellQty: { flex: 1.2, textAlign: "right" },
  cellPrecio: { flex: 1.5, textAlign: "right" },
  cellSubtotal: { flex: 1.6, textAlign: "right" },
  totalsBox: {
    marginTop: 14,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 3,
    minWidth: 200,
  },
  totalLabel: {
    fontSize: 10,
    color: COLOR_SOFT,
    flex: 1,
    textAlign: "right",
  },
  totalValue: {
    fontSize: 10,
    color: COLOR_CACAO,
    minWidth: 80,
    textAlign: "right",
  },
  totalFinal: {
    fontFamily: "Cinzel",
    fontSize: 16,
    color: COLOR_CACAO,
    marginTop: 6,
    minWidth: 180,
    textAlign: "right",
  },
  termsTitle: {
    fontFamily: "Jost",
    fontWeight: 500,
    fontSize: 9,
    letterSpacing: 2,
    color: COLOR_MUTE,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_MARFIL,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: COLOR_MUTE,
    letterSpacing: 0.5,
  },
  footerWordmark: {
    fontFamily: "Cinzel",
    fontSize: 8,
    color: COLOR_SOFT,
    letterSpacing: 1.5,
  },
  resumeItem: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.25,
    borderBottomColor: COLOR_MARFIL,
  },
  resumeDot: {
    fontSize: 10,
    color: COLOR_TERRACOTTA,
    marginRight: 8,
  },
  resumeText: { fontSize: 10, color: COLOR_CACAO, flex: 1 },
  paymentItem: {
    flexDirection: "row",
    marginBottom: 3,
  },
  paymentBullet: {
    fontSize: 9,
    color: COLOR_TERRACOTTA,
    marginRight: 6,
  },
  paymentText: {
    fontSize: 9,
    color: COLOR_SOFT,
    flex: 1,
    lineHeight: 1.5,
  },
  termBlock: {
    marginBottom: 5,
  },
  termBody: {
    fontSize: 9,
    color: COLOR_SOFT,
    lineHeight: 1.5,
  },
  termLabel: {
    fontFamily: "Jost",
    fontWeight: 500,
    color: COLOR_CACAO,
  },
  termSubRow: {
    flexDirection: "row",
    marginLeft: 12,
    marginTop: 2,
  },
  termSubText: {
    fontSize: 9,
    color: COLOR_SOFT,
    flex: 1,
    lineHeight: 1.5,
  },
});

const METODOS_PAGO = [
  "Efectivo | Zelle",
  "Punto de Venta | Pago Móvil | Transferencia Bancaria",
  "El pago en Bolívares se calcula a la tasa del Euro BCV del día de pago.",
  "A los pagos en Bolívares se les agrega el 16% de IVA.",
];

type TerminoUso = { label: string; texto: string; subItems?: string[] };

// Primer término (estático). Montaje y Desmontaje se insertan después con los
// datos del evento; el resto es boilerplate legal fijo.
const TERMINO_USO_INICIAL: TerminoUso = {
  label: "Uso Específico y Áreas",
  texto:
    "El derecho de uso se limita exclusivamente a los espacios, fechas, horarios y aforos detallados en esta cotización. No se permite el cambio de uso sin autorización previa por escrito.",
};

const TERMINOS_USO_RESTO: TerminoUso[] = [
  {
    label: "Penalidad por Retraso",
    texto:
      "El cumplimiento del horario de desocupación es esencial para la logística de la Quinta. En caso de exceder el tiempo acordado, Quinta Mamá se reserva el derecho de evaluar y aplicar un cargo adicional proporcional al tiempo excedido y a la afectación operativa causada.",
  },
  {
    label: "Gestión de Montaje",
    texto:
      "Cualquier arreglo, decoración o montaje requiere aprobación previa de la gerencia. El cliente es responsable de entregar el espacio libre de objetos y personas al finalizar el horario acordado.",
  },
  {
    label: "Estacionamiento",
    texto:
      "La contratación del servicio de valet parking es obligatoria al exceder la cantidad máxima de 40 vehículos en el estacionamiento. No está permitido estacionar en la calle de acceso.",
  },
  {
    label: "Sonido",
    texto:
      "Los niveles y horarios de sonido deben mantenerse dentro de los límites permitidos para el entorno residencial.",
  },
  {
    label: "Permisos",
    texto:
      "El cliente es el único responsable de obtener las licencias, permisos o pagos de derechos necesarios para su actividad. Quinta Mamá no asume responsabilidad por la operación del negocio del usuario.",
  },
  {
    label: "Control de Acceso",
    texto:
      "Por seguridad, el cliente debe entregar un listado de proveedores y personal vinculado al evento con al menos 24 horas de antelación. No se permite el traspaso del uso del espacio a terceros.",
  },
  {
    label: "Responsabilidad por Daños",
    texto:
      "El cliente cubrirá la totalidad de las reparaciones por daños causados a la estructura, mobiliario o instalaciones por negligencia propia o de sus relacionados. Cualquier desperfecto observado debe notificarse de inmediato.",
  },
  {
    label: "Estructura de Pagos",
    texto:
      "Para confirmar la reserva de la fecha y el espacio, se requiere el pago del 50% del total al momento de aceptar la cotización. El 50% restante deberá ser cancelado inmediatamente después de la culminación del evento.",
  },
  {
    label: "Política de Cancelación y Exoneración",
    texto:
      "En caso de que el cliente decida no llevar a cabo el evento, se aplicarán las siguientes condiciones respecto al segundo pago:",
    subItems: [
      "Cancelación con más de 7 días de antelación: El cliente queda exonerado del pago del segundo 50%. El depósito inicial se retendrá por conceptos de reserva y gastos operativos.",
      "Cancelación con menos de 7 días: No habrá lugar a la exoneración del segundo pago, debiendo liquidarse el 100% de la cotización, debido a la imposibilidad de reasignar el espacio a otros clientes en tan corto plazo.",
    ],
  },
  {
    label: "Limitación de Responsabilidad",
    texto:
      "Quinta Mamá no se hace responsable por daños o pérdidas derivadas de casos fortuitos, fuerza mayor (incendios, fallas de infraestructura, etc.) o medidas administrativas gubernamentales.",
  },
];

type Modo = "resumido" | "detallado";

export type PresupuestoPDFProps = {
  presupuesto: Presupuesto;
  logoSrc: string;
  modo: Modo;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Fecha con día de la semana, ej. "Viernes, 26 de junio de 2026". Recibe
// fechas YYYY-MM-DD (sin hora) y las ancla a medianoche local.
function formatDateLong(iso?: string): string {
  if (!iso) return "Por definir";
  const s = new Date(iso + "T00:00").toLocaleDateString("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PresupuestoPDF({
  presupuesto: p,
  logoSrc,
  modo,
}: PresupuestoPDFProps) {
  const fechaEmision = formatDate(p.createdAt);
  const fechaVencimiento = addDays(p.createdAt, p.validezDias);
  const fechaEvento = p.eventoFecha
    ? new Date(p.eventoFecha + "T00:00").toLocaleDateString("es-VE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Por definir";

  // Montaje / Desmontaje usan sus propios campos si están definidos; si no,
  // caen a la fecha y hora del evento.
  const fechaMontaje = formatDateLong(p.montajeFecha ?? p.eventoFecha);
  const horaMontaje = p.montajeHora ?? p.eventoHora ?? "Por definir";
  const fechaDesmontaje = formatDateLong(p.desmontajeFecha ?? p.eventoFecha);
  const horaDesmontaje = p.desmontajeHora ?? p.eventoHora ?? "Por definir";
  const terminosUso: TerminoUso[] = [
    TERMINO_USO_INICIAL,
    {
      label: "Montaje",
      texto: `${fechaMontaje} | Horario: ${horaMontaje}`,
    },
    {
      label: "Desmontaje",
      texto: `${fechaDesmontaje} | Horario: ${horaDesmontaje}`,
    },
    ...TERMINOS_USO_RESTO,
  ];

  return (
    <Document
      title={`${p.numero} — ${p.eventoNombre}`}
      author="La Quinta Mamá"
      creator="Proyectos Quinta Mamá, C.A."
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf/renderer, no es <img> de HTML y no admite alt */}
          <Image style={styles.logo} src={logoSrc} />
          <View style={styles.brandWrap}>
            <Text style={styles.brandWordmark}>LA QUINTA MAMÁ</Text>
            <Text style={styles.brandLine}>Proyectos Quinta Mamá, C.A.</Text>
            <Text style={styles.brandLineSmall}>RIF: J-50685696-4</Text>
            <Text style={styles.brandLineSmall}>
              Calle Ciega con Av. Mohedano, Quinta Mamá
            </Text>
            <Text style={styles.brandLineSmall}>
              Urb. Country Club, Caracas (Chacao)
            </Text>
            <Text style={styles.brandLineSmall}>info@quintamama.com</Text>
          </View>
        </View>

        <View>
          <Text style={styles.docTitleEyebrow}>
            Presupuesto N° {p.numero}
          </Text>
          <Text style={styles.docTitle}>{p.eventoNombre}</Text>
        </View>

        <View style={styles.docMetaRow}>
          <Text>Emisión: {fechaEmision}</Text>
          <Text>
            Válido hasta: {fechaVencimiento} ({p.validezDias} días)
          </Text>
        </View>

        <View style={styles.hr} />

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Cliente</Text>
            <Text style={styles.fieldLabel}>Nombre</Text>
            <Text style={styles.fieldValue}>{p.clienteNombre}</Text>
            {p.clienteRif ? (
              <>
                <Text style={styles.fieldLabel}>RIF / Cédula</Text>
                <Text style={styles.fieldValue}>{p.clienteRif}</Text>
              </>
            ) : null}
            {p.clienteTelefono ? (
              <>
                <Text style={styles.fieldLabel}>Teléfono</Text>
                <Text style={styles.fieldValue}>{p.clienteTelefono}</Text>
              </>
            ) : null}
            {p.clienteEmail ? (
              <>
                <Text style={styles.fieldLabel}>Correo</Text>
                <Text style={styles.fieldValue}>{p.clienteEmail}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Evento</Text>
            <Text style={styles.fieldLabel}>Nombre del evento</Text>
            <Text style={styles.fieldValue}>{p.eventoNombre}</Text>
            <Text style={styles.fieldLabel}>Fecha</Text>
            <Text style={styles.fieldValue}>{fechaEvento}</Text>
            {p.eventoHora ? (
              <>
                <Text style={styles.fieldLabel}>Horario</Text>
                <Text style={styles.fieldValue}>{p.eventoHora}</Text>
              </>
            ) : null}
            {p.cantidadPersonas ? (
              <>
                <Text style={styles.fieldLabel}>Personas esperadas</Text>
                <Text style={styles.fieldValue}>{p.cantidadPersonas}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.hr} />

        <Text style={styles.sectionTitle}>
          {modo === "resumido"
            ? "Servicios incluidos"
            : "Detalle de servicios"}
        </Text>

        {modo === "resumido" ? (
          <View style={{ marginTop: 6 }}>
            {p.items.map((l) => (
              <View key={l.id} style={styles.resumeItem}>
                <Text style={styles.resumeDot}>·</Text>
                <Text style={styles.resumeText}>
                  {l.nombre}
                  {l.cantidad > 1
                    ? `  (${l.cantidad} × ${unidadLabel(l.unidad)})`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.cellDesc]}>Descripción</Text>
              <Text style={[styles.th, styles.cellQty]}>Cantidad</Text>
              <Text style={[styles.th, styles.cellPrecio]}>Precio</Text>
              <Text style={[styles.th, styles.cellSubtotal]}>Subtotal</Text>
            </View>
            {p.items.map((l) => (
              <View key={l.id} style={styles.tableRow}>
                <Text style={[styles.td, styles.cellDesc]}>{l.nombre}</Text>
                <Text style={[styles.tdSoft, styles.cellQty]}>
                  {l.cantidad} {unidadLabel(l.unidad)}
                </Text>
                <Text style={[styles.tdSoft, styles.cellPrecio]}>
                  ${l.precioUnitario.toFixed(2)}
                </Text>
                <Text style={[styles.td, styles.cellSubtotal]}>
                  ${l.subtotal.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.totalsBox}>
          {modo === "detallado" ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>${p.subtotal.toFixed(2)}</Text>
            </View>
          ) : null}
          {modo === "detallado" && p.descuento > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Descuento</Text>
              <Text style={styles.totalValue}>
                −${p.descuento.toFixed(2)}
              </Text>
            </View>
          ) : null}
          <Text style={styles.totalFinal}>
            Total: ${p.total.toFixed(2)} USD
          </Text>
        </View>

        {p.notas ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text
              style={{
                fontFamily: "Garamond",
                fontStyle: "italic",
                fontSize: 10,
                color: COLOR_SOFT,
                lineHeight: 1.5,
              }}
            >
              {p.notas}
            </Text>
          </View>
        ) : null}

        <View wrap={false}>
          <Text style={styles.termsTitle}>Métodos de Pago</Text>
          {METODOS_PAGO.map((m, i) => (
            <View key={i} style={styles.paymentItem}>
              <Text style={styles.paymentBullet}>·</Text>
              <Text style={styles.paymentText}>{m}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.termsTitle}>Términos y Condiciones de Uso</Text>
        {terminosUso.map((t, i) => (
          <View key={i} style={styles.termBlock}>
            <Text style={styles.termBody}>
              <Text style={styles.termLabel}>{t.label}: </Text>
              {t.texto}
            </Text>
            {t.subItems?.map((s, j) => (
              <View key={j} style={styles.termSubRow}>
                <Text style={styles.paymentBullet}>·</Text>
                <Text style={styles.termSubText}>{s}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerWordmark}>LA QUINTA MAMÁ</Text>
          <Text style={styles.footerText}>
            Proyectos Quinta Mamá, C.A. · J-50685696-4 · Caracas
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
