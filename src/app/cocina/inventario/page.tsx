import { Header } from "@/components/Header";
import Link from "next/link";
import { funcionActiva } from "@/lib/modulos.mjs";
import { MenuLista, type MenuItem } from "@/components/MenuLista";
import { CalendarIcon, CartIcon, ReceiptIcon, ClipboardIcon } from "@/components/icons";

const PLANES: MenuItem = {
  href: "/cocina/inventario/planes",
  label: "Planes de producción",
  Icon: CalendarIcon,
  desc: "Reserva stock por adelantado para producciones planificadas (eventos, batches).",
};

const SUBMODULOS: MenuItem[] = [
  {
    href: "/cocina/compras",
    label: "Compras",
    Icon: CartIcon,
    desc: "Registrar pedidos recibidos — actualiza stock y precio del insumo automáticamente.",
  },
  {
    href: "/cocina/ventas",
    label: "Ventas",
    Icon: ReceiptIcon,
    desc: "Regístralas a mano o impórtalas desde Xetux — descuenta stock automáticamente.",
  },
  {
    href: "/cocina/pedido",
    label: "Pedido sugerido",
    Icon: ClipboardIcon,
    desc: "Lista de compras a partir de tus raciones objetivo. Guarda pedidos.",
  },
];

export default function InventarioHubPage() {
  // Planes de producción: retirados en Bolo salvo que BOLO_MODULOS incluya "planes".
  const planes = funcionActiva("planes", process.env.BOLO_MODULOS);
  const modulos = planes ? [PLANES, ...SUBMODULOS] : SUBMODULOS;
  return (
    <>
      <Header subtitle={planes ? "Producción, Compras y Ventas" : "Compras, Ventas y Pedidos"} />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              {planes ? "Producción, Compras y Ventas" : "Compras, Ventas y Pedidos"}
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              {planes
                ? "Centro de operaciones: planes de producción, registro de compras y ventas, y el pedido sugerido. Lo que mueve el inventario que ves en Insumos e Inventario."
                : "Registra compras y ventas y consulta el pedido sugerido. Lo que mueve el inventario que ves en Insumos e Inventario."}
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Cocina
          </Link>
        </section>
        <MenuLista items={modulos} />
      </main>
    </>
  );
}
