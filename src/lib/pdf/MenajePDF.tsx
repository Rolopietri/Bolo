/**
 * PDF de lista de menaje para evento — La Quinta Mamá
 * Se arma al vuelo desde una selección de ítems (no persiste).
 * Dos modos: lista de preparación (sin precios) o cotización de alquiler
 * (con precio unitario, subtotales y total).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ─── Fuentes (cargadas desde /public/fonts) ──────────────────────
const fontDir = path.join(process.cwd(), "public", "fonts");

function safeReadDataUri(file: string): string | null {
  try {
    const buf = readFileSync(path.join(fontDir, file));
    return `data:font/ttf;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  const cinzel400 = safeReadDataUri("cinzel-400.ttf");
  const cinzel500 = safeReadDataUri("cinzel-500.ttf");
  if (cinzel400) {
    Font.register({
      family: "Cinzel",
      fonts: [
        { src: cinzel400, fontWeight: 400 },
        ...(cinzel500 ? [{ src: cinzel500, fontWeight: 500 }] : []),
      ],
    });
  }
  const jost400 = safeReadDataUri("jost-400.ttf");
  const jost500 = safeReadDataUri("jost-500.ttf");
  if (jost400) {
    Font.register({
      family: "Jost",
      fonts: [
        { src: jost400, fontWeight: 400 },
        ...(jost500 ? [{ src: jost500, fontWeight: 500 }] : []),
      ],
    });
  }
  const gar400i = safeReadDataUri("garamond-400i.ttf");
  const gar400 = safeReadDataUri("garamond-400.ttf");
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
}
registerFontsOnce();

const COLOR_CACAO = "#0A0A0A";
const COLOR_SOFT = "#595959";
const COLOR_MUTE = "#999999";
const COLOR_MARFIL = "#D5CECB";
const COLOR_ROW = "#F6F2E7";

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
    marginBottom: 6,
  },
  brandWordmark: {
    fontFamily: "Cinzel",
    fontSize: 13,
    letterSpacing: 1.8,
    color: COLOR_CACAO,
  },
  brandLine: {
    fontFamily: "Jost",
    fontSize: 7,
    color: COLOR_MUTE,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  titleEyebrow: {
    fontFamily: "Jost",
    fontSize: 8,
    letterSpacing: 2.5,
    color: COLOR_SOFT,
    textTransform: "uppercase",
    textAlign: "right",
  },
  title: {
    fontFamily: "Cinzel",
    fontSize: 22,
    letterSpacing: 1,
    color: COLOR_CACAO,
    marginTop: 12,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_MARFIL,
    marginVertical: 14,
  },
  metaRow: { flexDirection: "row", gap: 26, marginBottom: 6 },
  metaLabel: {
    fontSize: 7.5,
    color: COLOR_MUTE,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  metaValue: { fontSize: 11, color: COLOR_CACAO, marginTop: 2 },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOR_CACAO,
    paddingBottom: 4,
    marginTop: 10,
  },
  th: {
    fontFamily: "Jost",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 1,
    color: COLOR_MUTE,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.25,
    borderBottomColor: COLOR_MARFIL,
    alignItems: "center",
  },
  rowAlt: { backgroundColor: COLOR_ROW },
  cFoto: { width: 34 },
  fotoImg: {
    width: 28,
    height: 28,
    objectFit: "contain",
    borderRadius: 2,
  },
  fotoVacia: {
    width: 28,
    height: 28,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: COLOR_MARFIL,
    borderStyle: "dashed",
  },
  cItem: { flex: 1, fontSize: 10, color: COLOR_CACAO },
  cCat: { width: 90, fontSize: 8.5, color: COLOR_SOFT },
  cNum: { width: 45, fontSize: 10, textAlign: "right" },
  cMoney: { width: 60, fontSize: 10, textAlign: "right" },
  faltante: { color: "#B23A2E" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 16,
    alignItems: "baseline",
  },
  totalLabel: {
    fontFamily: "Jost",
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: COLOR_SOFT,
  },
  totalValue: { fontFamily: "Cinzel", fontSize: 16, color: COLOR_CACAO },
  notasTitle: {
    fontFamily: "Jost",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 2,
    color: COLOR_MUTE,
    textTransform: "uppercase",
    marginBottom: 4,
    marginTop: 18,
  },
  notasText: {
    fontFamily: "Garamond",
    fontSize: 10,
    color: COLOR_CACAO,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: "center",
    fontSize: 7.5,
    color: COLOR_MUTE,
    letterSpacing: 0.5,
  },
});

export type MenajePDFItem = {
  nombre: string;
  categoria: string;
  cantidad: number;
  disponible: number;
  precioUnit?: number;
  /** Path estático (/menaje/...) o URL pública de la foto del ítem. */
  fotoUrl?: string;
};

/**
 * Resuelve la foto de un ítem a algo que react-pdf pueda renderizar:
 *  • URL http(s) (foto subida a Supabase) → se pasa tal cual (react-pdf la baja).
 *  • Path estático (/menaje/vasos/x.png) → se lee de /public y se embebe como
 *    data URI (no depende de red).
 * Devuelve undefined si no hay foto o no se pudo leer.
 */
function resolveFotoSrc(fotoUrl?: string): string | undefined {
  if (!fotoUrl) return undefined;
  if (/^https?:\/\//i.test(fotoUrl)) return fotoUrl;
  if (fotoUrl.startsWith("/")) {
    try {
      const p = path.join(process.cwd(), "public", fotoUrl);
      const buf = readFileSync(p);
      const ext = (path.extname(p).slice(1) || "png").toLowerCase();
      const mime = ext === "jpg" ? "jpeg" : ext;
      return `data:image/${mime};base64,${buf.toString("base64")}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export type MenajePDFData = {
  evento?: string;
  cliente?: string;
  fecha?: string;
  notas?: string;
  conPrecios: boolean;
  items: MenajePDFItem[];
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function MenajePDF({ data }: { data: MenajePDFData }) {
  const { evento, cliente, fecha, notas, conPrecios, items } = data;
  const total = conPrecios
    ? items.reduce((acc, it) => acc + it.cantidad * (it.precioUnit ?? 0), 0)
    : 0;
  const totalPiezas = items.reduce((acc, it) => acc + it.cantidad, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Encabezado */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brandWordmark}>QUINTA MAMÁ</Text>
            <Text style={styles.brandLine}>Menaje · Eventos</Text>
          </View>
          <Text style={styles.titleEyebrow}>
            {conPrecios ? "Cotización de alquiler" : "Lista de menaje"}
          </Text>
        </View>

        <Text style={styles.title}>{evento?.trim() || "Lista de menaje"}</Text>

        <View style={styles.hr} />

        {/* Datos del evento */}
        <View style={styles.metaRow}>
          {cliente?.trim() ? (
            <View>
              <Text style={styles.metaLabel}>Cliente</Text>
              <Text style={styles.metaValue}>{cliente}</Text>
            </View>
          ) : null}
          {fecha?.trim() ? (
            <View>
              <Text style={styles.metaLabel}>Fecha</Text>
              <Text style={styles.metaValue}>{fecha}</Text>
            </View>
          ) : null}
          <View>
            <Text style={styles.metaLabel}>Piezas totales</Text>
            <Text style={styles.metaValue}>{totalPiezas}</Text>
          </View>
        </View>

        {/* Tabla */}
        <View style={styles.thead}>
          <Text style={[styles.th, styles.cFoto]}>Foto</Text>
          <Text style={[styles.th, styles.cItem]}>Ítem</Text>
          <Text style={[styles.th, styles.cCat]}>Categoría</Text>
          <Text style={[styles.th, styles.cNum]}>Cant.</Text>
          <Text style={[styles.th, styles.cNum]}>Disp.</Text>
          {conPrecios ? (
            <>
              <Text style={[styles.th, styles.cMoney]}>P. unit</Text>
              <Text style={[styles.th, styles.cMoney]}>Subtotal</Text>
            </>
          ) : null}
        </View>

        {items.map((it, i) => {
          const falta = it.cantidad > it.disponible;
          const fotoSrc = resolveFotoSrc(it.fotoUrl);
          return (
            <View
              key={i}
              style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]}
            >
              <View style={styles.cFoto}>
                {fotoSrc ? (
                  // react-pdf <Image> no es un <img> HTML; no admite alt.
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={fotoSrc} style={styles.fotoImg} />
                ) : (
                  <View style={styles.fotoVacia} />
                )}
              </View>
              <Text style={styles.cItem}>{it.nombre}</Text>
              <Text style={styles.cCat}>{it.categoria}</Text>
              <Text style={styles.cNum}>{it.cantidad}</Text>
              <Text style={[styles.cNum, ...(falta ? [styles.faltante] : [])]}>
                {it.disponible}
              </Text>
              {conPrecios ? (
                <>
                  <Text style={styles.cMoney}>{money(it.precioUnit ?? 0)}</Text>
                  <Text style={styles.cMoney}>
                    {money(it.cantidad * (it.precioUnit ?? 0))}
                  </Text>
                </>
              ) : null}
            </View>
          );
        })}

        {/* Total */}
        {conPrecios ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(total)}</Text>
          </View>
        ) : null}

        {/* Notas */}
        {notas?.trim() ? (
          <>
            <Text style={styles.notasTitle}>Notas</Text>
            <Text style={styles.notasText}>{notas}</Text>
          </>
        ) : null}

        <Text style={styles.footer} fixed>
          La Quinta Mamá · Lista de menaje generada desde el sistema de cocina.
          Los valores en rojo indican que la cantidad pedida supera el stock
          disponible.
        </Text>
      </Page>
    </Document>
  );
}
