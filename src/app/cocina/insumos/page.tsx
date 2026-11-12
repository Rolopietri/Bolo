import { Header } from "@/components/Header";
import Link from "next/link";
import { InsumosTabs, type Vista } from "./InsumosTabs";
import { PasoSiguiente } from "../_PasoSiguiente";
import { PasosCocina } from "../_PasosCocina";

const VISTAS: Vista[] = ["catalogo", "uso", "alertas", "mermas", "auditoria"];

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { vista, insumo } = await searchParams;
  const insumoInicial = typeof insumo === "string" ? insumo : undefined;
  // ?insumo= abre su ficha en el catálogo; con ?vista=uso, su uso diario.
  const vistaInicial =
    insumoInicial && vista !== "uso"
      ? "catalogo"
      : (VISTAS.find((v) => v === vista) ?? "catalogo");
  return (
    <>
      <Header subtitle="Inventario" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Inventario
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Cómo estás y qué hacer con cada insumo.
            </p>
          </div>
          <Link
            href="/cocina/catalogo"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Insumos e Inventario
          </Link>
        </section>
        <PasosCocina actual={2} className="mb-8" />
        <InsumosTabs vistaInicial={vistaInicial} insumoInicial={insumoInicial} />
        <PasoSiguiente
          paso={2}
          seguirTexto="seguir cargando insumos"
          siguiente={{ href: "/cocina/recetas", label: "Recetas" }}
        />
      </main>
    </>
  );
}
