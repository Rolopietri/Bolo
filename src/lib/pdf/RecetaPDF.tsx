/**
 * PDF de ficha técnica de receta — La Quinta Mamá
 * Formato apto para impresión y carpeta de cocina.
 * NO incluye costos (este PDF lo lee el equipo de cocina).
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
import type { Receta } from "@/lib/types";
import { ordenarPorCantidadDesc } from "@/lib/units";

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
  Font.registerHyphenationCallback((word) => [word]);
}
registerFontsOnce();

// ─── Colores ───────────────────────────────────────────────────────
const COLOR_CACAO = "#0A0A0A";
const COLOR_SOFT = "#595959";
const COLOR_MUTE = "#999999";
const COLOR_MARFIL = "#D5CECB";

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
    marginBottom: 24,
  },
  logo: { width: 60, height: 60 },
  brandWrap: { alignItems: "flex-end", maxWidth: 240 },
  brandWordmark: {
    fontFamily: "Cinzel",
    fontSize: 12,
    letterSpacing: 1.8,
    color: COLOR_CACAO,
  },
  brandLine: {
    fontFamily: "Jost",
    fontSize: 7,
    color: COLOR_MUTE,
    letterSpacing: 0.5,
    textAlign: "right",
    marginTop: 2,
  },
  titleEyebrow: {
    fontFamily: "Jost",
    fontSize: 8,
    letterSpacing: 2.5,
    color: COLOR_SOFT,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "Cinzel",
    fontSize: 26,
    letterSpacing: 1.5,
    color: COLOR_CACAO,
    marginTop: 4,
  },
  perfil: {
    fontFamily: "Garamond",
    fontStyle: "italic",
    fontSize: 12,
    color: COLOR_SOFT,
    marginTop: 6,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_MARFIL,
    marginVertical: 14,
  },
  hero: {
    width: "100%",
    height: 210,
    objectFit: "cover",
    borderRadius: 4,
    marginTop: 16,
  },
  metaRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 4,
  },
  metaCell: {},
  metaLabel: {
    fontSize: 7.5,
    color: COLOR_MUTE,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 11,
    color: COLOR_CACAO,
    marginTop: 2,
    fontFamily: "Cinzel",
  },
  sectionTitle: {
    fontFamily: "Jost",
    fontWeight: 500,
    fontSize: 9,
    letterSpacing: 2,
    color: COLOR_MUTE,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  ingItem: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.25,
    borderBottomColor: COLOR_MARFIL,
  },
  ingQty: {
    fontFamily: "Jost",
    fontWeight: 500,
    fontSize: 10,
    color: COLOR_CACAO,
    width: 70,
  },
  ingNombre: { fontSize: 10, color: COLOR_CACAO, flex: 1 },
  ingObs: {
    fontFamily: "Garamond",
    fontStyle: "italic",
    fontSize: 9,
    color: COLOR_SOFT,
  },
  procText: {
    fontFamily: "Garamond",
    fontSize: 10,
    color: COLOR_CACAO,
    lineHeight: 1.6,
  },
  noteText: {
    fontFamily: "Garamond",
    fontStyle: "italic",
    fontSize: 10,
    color: COLOR_SOFT,
    lineHeight: 1.5,
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
});

export type RecetaPDFProps = {
  receta: Receta;
  logoSrc: string;
  /** Foto del plato ya resuelta (data URI o URL). Opcional. */
  fotoSrc?: string;
};

export function RecetaPDF({ receta: r, logoSrc, fotoSrc }: RecetaPDFProps) {
  const fechaActualizada = new Date(r.createdAt).toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Document
      title={`Receta — ${r.nombre}`}
      author="La Quinta Mamá"
      creator="Proyectos Quinta Mamá, C.A."
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf/renderer, no es <img> de HTML y no admite alt */}
          <Image style={styles.logo} src={logoSrc} />
          <View style={styles.brandWrap}>
            <Text style={styles.brandWordmark}>LA QUINTA MAMÁ</Text>
            <Text style={styles.brandLine}>Cocina · Ficha técnica</Text>
            <Text style={styles.brandLine}>{fechaActualizada}</Text>
          </View>
        </View>

        {/* Title */}
        <View>
          <Text style={styles.titleEyebrow}>
            {(r.categoria ?? "receta").toUpperCase()} · {r.seccion.toUpperCase()}
          </Text>
          <Text style={styles.title}>{r.nombre}</Text>
          {r.perfil ? <Text style={styles.perfil}>{r.perfil}</Text> : null}
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Porciones</Text>
            <Text style={styles.metaValue}>{r.porciones}</Text>
          </View>
          {r.rendimiento && r.rendimiento > 0 ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Rendimiento</Text>
              <Text style={styles.metaValue}>
                {r.rendimiento} {r.rendimientoUnidad ?? ""}
              </Text>
            </View>
          ) : null}
          {r.tiempoPrepMin ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Prep</Text>
              <Text style={styles.metaValue}>{r.tiempoPrepMin} min</Text>
            </View>
          ) : null}
          {r.tiempoCoccionMin ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Cocción</Text>
              <Text style={styles.metaValue}>{r.tiempoCoccionMin} min</Text>
            </View>
          ) : null}
          {r.temperatura ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Temperatura</Text>
              <Text style={styles.metaValue}>{r.temperatura}</Text>
            </View>
          ) : null}
        </View>

        {/* Foto del plato (opcional) */}
        {fotoSrc ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf/renderer, no es <img> de HTML y no admite alt
          <Image style={styles.hero} src={fotoSrc} />
        ) : null}

        <View style={styles.hr} />

        {/* Ingredientes */}
        <Text style={styles.sectionTitle}>Ingredientes</Text>
        <View>
          {ordenarPorCantidadDesc(r.ingredientes).map((i) => (
            <View key={i.id} style={styles.ingItem}>
              <Text style={styles.ingQty}>
                {i.cantidad} {i.unidad}
              </Text>
              <Text style={styles.ingNombre}>
                {i.nombre}
                {i.observaciones ? (
                  <Text style={styles.ingObs}> · {i.observaciones}</Text>
                ) : null}
              </Text>
            </View>
          ))}
        </View>

        {/* Procedimiento */}
        {r.procedimiento ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              Procedimiento
            </Text>
            <Text style={styles.procText}>{r.procedimiento}</Text>
          </>
        ) : null}

        {/* Presentación */}
        {r.presentacion ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              Presentación
            </Text>
            <Text style={styles.noteText}>{r.presentacion}</Text>
          </>
        ) : null}

        {/* Notas del chef */}
        {r.notasChef ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              Notas del chef
            </Text>
            <Text style={styles.noteText}>{r.notasChef}</Text>
          </>
        ) : null}

        {/* Variaciones */}
        {r.variaciones ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              Variaciones
            </Text>
            <Text style={styles.noteText}>{r.variaciones}</Text>
          </>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerWordmark}>LA QUINTA MAMÁ · COCINA</Text>
          <Text style={styles.footerText}>{r.nombre}</Text>
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
