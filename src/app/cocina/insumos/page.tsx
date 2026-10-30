import { Header } from "@/components/Header";
import Link from "next/link";
import { ChartIcon } from "@/components/icons";
import { InsumosTabs, type Vista } from "./InsumosTabs";
import { PasoSiguiente } from "../_PasoSiguiente";
import { PasosCocina } from "../_PasosCocina";

const VISTAS: Vista[] = ["catalogo", "alertas", "mermas", "auditoria"];

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { vista, insumo } = await searchParams;
  const insumoInicial = typeof insumo === "string" ? insumo : undefined;
  const vistaInicial = insumoInicial
    ? "catalogo"
    : (VISTAS.find((v) => v === vista) ?? "catalogo");
  return (
    <>
      <Header subtitle="Insumos" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Insumos e Inventario
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Insumos
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Catálogo de ingredientes con precios, stock y proveedor, con sus
              alertas, mermas y el historial de cada cambio de stock.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/cocina/inventario/stock"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-cacao ring-1 ring-marfil transition-colors hover:text-terracotta hover:ring-terracotta"
            >
              <ChartIcon className="size-4 text-terracotta" />
              Ver stock
            </Link>
            <Link
              href="/cocina/catalogo"
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              ← Insumos e Inventario
            </Link>
          </div>
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
