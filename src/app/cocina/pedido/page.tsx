import { Header } from "@/components/Header";
import Link from "next/link";
import { funcionActiva } from "@/lib/modulos.mjs";
import { PedidoCliente, type VistaPedido } from "./PedidoCliente";

export default async function PedidoSugeridoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { vista, receta, plan } = await searchParams;
  const vistaParam = typeof vista === "string" ? vista : undefined;
  const vieneDeRaciones = Boolean(receta || plan);
  const inicial: VistaPedido =
    vistaParam === "raciones" || (vistaParam !== "stock" && vieneDeRaciones)
      ? "raciones"
      : "stock";

  return (
    <>
      <Header subtitle="Pedido sugerido" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Compras, Ventas y Pedidos
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Pedido sugerido
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Qué comprar según el stock y el mínimo. Si preparas un servicio,
              también puedes calcularlo por raciones.
            </p>
          </div>
          <Link
            href="/cocina/inventario"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Compras, Ventas y Pedidos
          </Link>
        </section>
        <PedidoCliente
          inicial={inicial}
          planesActivos={funcionActiva("planes", process.env.BOLO_MODULOS)}
        />
      </main>
    </>
  );
}
