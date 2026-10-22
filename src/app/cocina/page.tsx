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

// Primeros pasos: lo PRIMERO y más visible al entrar a Cocina. Guía sencilla
// para montar la cocina desde cero, pensada para alguien sin experiencia.
const PASOS: { href: string; label: string; desc: string }[] = [
  { href: "/cocina/proveedores", label: "Agrega tus proveedores", desc: "A quién le compras y cómo le pagas." },
  { href: "/cocina/insumos", label: "Carga tus insumos", desc: "Qué compras, en qué unidad y a qué precio." },
  { href: "/cocina/recetas", label: "Crea tus recetas", desc: "Qué preparas con esos insumos." },
  { href: "/cocina/compras", label: "Registra tus compras", desc: "Precios y stock reales del día." },
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
        <section className="mb-8">
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            Operación gastronómica
          </p>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
            Cocina
          </h1>
          <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
            Sigue estos 4 pasos para dejar tu cocina lista. Hazlos en orden: cada
            paso usa lo del anterior.
          </p>
        </section>

        {/* ── Para empezar: lo primero y más visible ───────────────────── */}
        <section aria-label="Para empezar" className="mb-10">
          <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">
            Para empezar
          </h2>
          <ol className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PASOS.map((paso, i) => (
              <li key={paso.href}>
                <Link
                  href={paso.href}
                  className="group flex items-start gap-4 rounded-2xl bg-white ring-1 ring-marfil p-5 transition-colors hover:bg-marfil-soft hover:ring-terracotta/40"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-terracotta text-white font-cinzel text-lg leading-none">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-lg leading-tight text-cacao group-hover:text-terracotta transition-colors">
                      {paso.label}
                    </span>
                    <span className="mt-1 block text-sm text-cacao-soft">
                      {paso.desc}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-cacao group-hover:text-terracotta transition-colors">
                      {i === 0 ? "Empezar" : "Ir"}
                      <ChevronIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <BcvRateBanner />

        {/* ── Atajo rápido ─────────────────────────────────────────────── */}
        <Link
          href="/cocina/plato"
          className="group mt-8 flex items-center gap-4 border-y border-marfil py-5"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-terracotta text-white">
            <BoltIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-[0.35em] text-terracotta-deep">
              Rápido
            </span>
            <span className="block font-cinzel text-xl leading-tight text-cacao group-hover:text-terracotta transition-colors">
              Crear un plato y ver su costo
            </span>
            <span className="mt-0.5 block text-sm text-cacao-soft">
              Escribe qué lleva el plato y bolo te dice cuánto cuesta y a qué
              precio venderlo. Se guarda en tu recetario.
            </span>
          </span>
          <ChevronIcon className="size-5 text-cacao-mute transition group-hover:translate-x-1 group-hover:text-terracotta" />
        </Link>

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
