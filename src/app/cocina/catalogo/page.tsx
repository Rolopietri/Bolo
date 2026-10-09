import { Header } from "@/components/Header";
import Link from "next/link";
import { MenuLista, type MenuItem } from "@/components/MenuLista";
import { BoxIcon, TruckIcon, UtensilsIcon } from "@/components/icons";

const SUBMODULOS: MenuItem[] = [
  {
    href: "/cocina/insumos",
    label: "Insumos",
    Icon: BoxIcon,
    desc: "Ficha de cada materia prima: precio y stock, con sus alertas, mermas y pérdidas y la auditoría de cada cambio en el mismo lugar.",
  },
  {
    href: "/cocina/proveedores",
    label: "Proveedores",
    Icon: TruckIcon,
    desc: "Contactos y modalidades de pago (Bs BCV, paralela, USD efectivo o divisa).",
  },
  {
    href: "/cocina/menaje",
    label: "Menaje",
    Icon: UtensilsIcon,
    desc: "Vajilla, cristalería, cubiertos y utensilios: bajas por rotura o pérdida y compras con factura.",
  },
];

export default function CatalogoMateriasPrimasPage() {
  return (
    <>
      <Header subtitle="Insumos e Inventario" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Insumos e Inventario
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Tus ingredientes, proveedores y menaje. Dentro de Insumos está el
              estado del inventario: stock, alertas, mermas y auditoría. Costeo usa estos datos para calcular
              el costo de tus recetas, y Compras, Ventas y Pedidos mueve el
              inventario.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Cocina
          </Link>
        </section>
        <MenuLista items={SUBMODULOS} />
      </main>
    </>
  );
}
