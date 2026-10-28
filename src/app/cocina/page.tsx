import { Header } from "@/components/Header";
import Link from "next/link";
import { funcionActiva } from "@/lib/modulos.mjs";
import { MenuLista, type MenuItem } from "@/components/MenuLista";
import { BoltIcon, BoxIcon, BookIcon, CartIcon, ChevronIcon } from "@/components/icons";
import { Hoy } from "./_Hoy";

// El saludo y la fecha son de hoy (hora de Caracas). No se prerenderiza.
export const dynamic = "force-dynamic";

const modulos: (MenuItem & {
  /** Identificador interno (no se muestra). */
  clave: string;
})[] = [
  {
    href: "/cocina/catalogo",
    label: "Insumos e Inventario",
    desc: "Insumos, proveedores y menaje, con stock, alertas, mermas y auditoría dentro de Insumos.",
    clave: "insumos",
    Icon: BoxIcon,
  },
  {
    href: "/cocina/recetas",
    label: "Recetario, Costeo y Precios",
    desc: "Recetas y subrecetas con su costo, precio de venta y semáforo de ganancia — todo junto.",
    clave: "recetas",
    Icon: BookIcon,
  },
  {
    href: "/cocina/inventario",
    label: "Compras, Ventas y Pedidos",
    desc: "Registra compras y ventas y consulta el pedido sugerido.",
    clave: "operaciones",
    Icon: CartIcon,
  },
];

// Con Planes de producción activos (BOLO_MODULOS incluye "planes"), la tarjeta
// de Compras, Ventas y Pedidos vuelve a presentarse como centro de producción.
const OPERACIONES_CON_PLANES = {
  label: "Producción, Compras y Ventas",
  desc: "Planes de producción, compras, ventas y pedido sugerido.",
};

export default function CocinaHub() {
  const modulosVisibles = funcionActiva("planes", process.env.BOLO_MODULOS)
    ? modulos.map((m) => (m.clave === "operaciones" ? { ...m, ...OPERACIONES_CON_PLANES } : m))
    : modulos;
  return (
    <>
      <Header subtitle="Hoy" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:py-10">
        <Hoy />

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">Módulos</h2>
            <Link
              href="/cocina/plato"
              data-guia="guia-plato"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-cacao ring-1 ring-marfil transition-colors hover:text-terracotta hover:ring-terracotta"
            >
              <BoltIcon className="size-4 text-terracotta" />
              Crear un plato
              <ChevronIcon className="size-4 text-cacao-mute" />
            </Link>
          </div>
          <MenuLista items={modulosVisibles} className="mt-2" />
        </section>
      </main>
    </>
  );
}
