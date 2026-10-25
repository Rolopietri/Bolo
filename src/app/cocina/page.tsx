import { Header } from "@/components/Header";
import Link from "next/link";
import { funcionActiva } from "@/lib/modulos.mjs";
import { MenuLista, type MenuItem } from "@/components/MenuLista";
import {
  BoltIcon,
  BoxIcon,
  BookIcon,
  CartIcon,
  ChevronIcon,
} from "@/components/icons";
import { BcvRateBanner } from "./BcvRateBanner";

// Los 4 pasos del montaje, para la línea horizontal. El cursor-guía apunta a
// cada uno con su data-guia.
const PASOS: { href: string; label: string; guia: string }[] = [
  { href: "/cocina/proveedores", label: "Proveedores", guia: "paso-proveedores" },
  { href: "/cocina/insumos", label: "Insumos", guia: "paso-insumos" },
  { href: "/cocina/recetas", label: "Recetas", guia: "paso-recetas" },
  { href: "/cocina/compras", label: "Compras", guia: "paso-compras" },
];

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
      <Header subtitle="Cocina" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-6">
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            Operación gastronómica
          </p>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
            Cocina
          </h1>
        </section>

        {/* ── Tasa de cambio, arriba del todo ──────────────────────────── */}
        <BcvRateBanner />

        {/* ── Dos acciones principales, lado a lado ────────────────────── */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {/* Empezar: te lleva al paso 1 (proveedores) */}
          <Link
            href="/cocina/proveedores"
            data-guia="cocina-empezar"
            className="group flex items-center gap-4 rounded-2xl bg-cacao p-5 text-white transition-colors hover:bg-terracotta"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/10">
              <BoltIcon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-[0.3em] text-white/60">
                Paso 1
              </span>
              <span className="block font-cinzel text-xl leading-tight">Empezar</span>
              <span className="block text-sm text-white/80">
                Agrega tus proveedores y sigue el camino.
              </span>
            </span>
            <ChevronIcon className="ml-auto size-5 text-white/70 transition group-hover:translate-x-1" />
          </Link>

          {/* Crear un plato: para quien ya tiene todo montado */}
          <Link
            href="/cocina/plato"
            data-guia="guia-plato"
            className="group flex items-center gap-4 rounded-2xl bg-white p-5 text-cacao ring-1 ring-marfil transition-colors hover:ring-terracotta"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-naranja-soft/60 text-terracotta transition-colors group-hover:bg-terracotta group-hover:text-white">
              <BoltIcon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-[0.3em] text-terracotta-deep">
                Rápido
              </span>
              <span className="block font-cinzel text-xl leading-tight transition-colors group-hover:text-terracotta">
                Crear un plato
              </span>
              <span className="block text-sm text-cacao-soft">
                ¿Ya tienes todo? Crea un plato y ve su costo.
              </span>
            </span>
            <ChevronIcon className="ml-auto size-5 text-cacao-mute transition group-hover:translate-x-1 group-hover:text-terracotta" />
          </Link>
        </div>

        {/* ── Los 4 pasos en una línea horizontal ──────────────────────── */}
        <section aria-label="Los 4 pasos" className="mt-7">
          <ol className="relative flex items-start justify-between gap-1">
            {/* Línea base que conecta los números */}
            <span
              aria-hidden
              className="absolute top-4 left-[12.5%] right-[12.5%] h-px bg-marfil"
            />
            {PASOS.map((p, i) => (
              <li key={p.href} className="relative z-10 min-w-0 flex-1">
                <Link
                  href={p.href}
                  data-guia={p.guia}
                  className="group flex flex-col items-center gap-1.5 text-center"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-marfil font-cinzel text-sm text-cacao-soft transition-colors group-hover:bg-terracotta group-hover:text-white">
                    {i + 1}
                  </span>
                  <span className="text-xs leading-tight text-cacao transition-colors group-hover:text-terracotta sm:text-sm">
                    {p.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Todos los módulos (referencia) ───────────────────────────── */}
        <section className="mt-10">
          <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">
            Módulos
          </h2>
          <MenuLista items={modulosVisibles} className="mt-2" />
        </section>
      </main>
    </>
  );
}
