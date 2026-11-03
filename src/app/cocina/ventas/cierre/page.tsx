import { Header } from "@/components/Header";
import Link from "next/link";
import { CierreCajaPantalla } from "../CierreCajaForm";

export default async function CierreCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string | string[] }>;
}) {
  const { fecha } = await searchParams;
  const inicial = typeof fecha === "string" ? fecha : null;
  return (
    <>
      <Header subtitle="Cierre de caja" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Compras, Ventas y Pedidos
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Cierre de caja
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Al final del día anota cuánto entró en efectivo, pago móvil, punto, Zelle o lo que sea.
              Bolo lo compara con las ventas de esa fecha.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link
              href="/cocina/ventas"
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              ← Ventas
            </Link>
            <Link
              href="/administracion?seccion=cierre"
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              Ver el histórico
            </Link>
          </div>
        </section>
        <CierreCajaPantalla fechaInicial={inicial} />
      </main>
    </>
  );
}
