import { Header } from "@/components/Header";
import Link from "next/link";
import { SubHubGrid, type SubModulo } from "../_SubHub";

const SUBMODULOS: SubModulo[] = [
  {
    href: "/cocina/insumos",
    label: "Insumos",
    desc: "Ficha de cada materia prima: precio, stock y registro de pérdidas y mermas.",
  },
  {
    href: "/cocina/proveedores",
    label: "Proveedores",
    desc: "Contactos y modalidades de pago (Bs BCV, paralela, USD efectivo o divisa).",
  },
  {
    href: "/cocina/alertas",
    label: "Alertas de stock",
    desc: "Insumos agotados o por debajo del mínimo de compra.",
  },
  {
    href: "/cocina/auditoria",
    label: "Auditoría de stock",
    desc: "Historial automático de cada cambio de stock: cuándo, cuánto y de dónde vino.",
  },
  {
    href: "/cocina/inventario/conteo",
    label: "Conteo físico y mermas",
    desc: "Cuadra el inventario (a mano o importando el Excel) y revisa la merma de cada conteo, valorada en $.",
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
              Tus ingredientes y proveedores + el estado del inventario: stock,
              pérdidas, auditoría y alertas. Costeo usa estos datos para calcular
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
        <SubHubGrid modulos={SUBMODULOS} />
      </main>
    </>
  );
}
