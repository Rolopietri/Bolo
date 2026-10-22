"use client";

import { useState } from "react";
import Link from "next/link";
import { BulbIcon, HelpIcon, ChevronIcon } from "@/components/icons";

// Guía de inicio enfocada: muestra UN paso a la vez (empieza por Proveedores),
// con ayuda a pedido — un "?" que al pasar el mouse (o tocar en móvil) explica
// en una línea qué es, y un bombillito que despliega un ejemplo concreto, con
// botón para ver otro. Pensado para que cualquier persona, sin experiencia,
// entienda qué hacer sin leer mucho.
type Paso = {
  href: string;
  label: string;
  cta: string;
  corto: string;
  ejemplos: string[];
};

const PASOS: Paso[] = [
  {
    href: "/cocina/proveedores",
    label: "Agrega tus proveedores",
    cta: "Empezar",
    corto: "A quién le compras y cómo le pagas.",
    ejemplos: [
      "Un proveedor es la persona o el negocio a quien le compras insumos, inventario o productos. Por ejemplo: si en tu negocio vendes pollo, el señor que te vende el pollo es un proveedor — agrégalo aquí e indica cómo le pagas (en Bs, en dólares…).",
      "¿Le compras el café en grano a una tostadora? Esa tostadora es un proveedor. Agrégala para luego registrar cuánto le compras y a qué precio.",
      "El del gas, el de las verduras, el de los vasos… cada quien a quien le pagas por algo que usas en tu negocio es un proveedor. Mientras más agregues, más reales quedan tus costos.",
    ],
  },
  {
    href: "/cocina/insumos",
    label: "Carga tus insumos",
    cta: "Ir a insumos",
    corto: "Qué compras y en qué unidad.",
    ejemplos: [
      "Un insumo es cada ingrediente o material que usas: el pollo, el café, el pan, los vasos. Carga cada uno con su precio y en qué unidad lo compras (kilo, litro, unidad).",
      "Si haces jugos, la “naranja” es un insumo: la compras por kilo a cierto precio. Cárgala aquí para que después tu receta de jugo sepa cuánto cuesta.",
    ],
  },
  {
    href: "/cocina/recetas",
    label: "Crea tus recetas",
    cta: "Ir a recetas",
    corto: "Qué preparas con tus insumos.",
    ejemplos: [
      "Una receta es un plato o bebida que preparas con tus insumos. Por ejemplo, un “Sándwich de pollo” lleva pan, pollo y salsa — al armarla, el sistema calcula solo cuánto te cuesta hacerlo y a qué precio venderlo.",
      "Un “Jugo de naranja” es una receta: dices que lleva 3 naranjas y azúcar, y el sistema te da el costo y el precio sugerido.",
    ],
  },
  {
    href: "/cocina/compras",
    label: "Registra tus compras",
    cta: "Ir a compras",
    corto: "Precios y stock reales del día.",
    ejemplos: [
      "Cuando le compras a un proveedor, lo registras en Compras: cuánto compraste, a qué precio y en qué moneda. Así tu inventario y tus costos quedan reales y al día.",
      "Hoy compraste 10 kg de café: regístralo en Compras y el precio del café se actualiza solo en todas tus recetas.",
    ],
  },
];

export function GuiaInicio() {
  const [activo, setActivo] = useState(0);
  const [verEjemplo, setVerEjemplo] = useState(false);
  const [ejIdx, setEjIdx] = useState(0);
  const [verAyuda, setVerAyuda] = useState(false); // para móvil (tap)
  const p = PASOS[activo];

  const irAPaso = (i: number) => {
    setActivo(i);
    setVerEjemplo(false);
    setEjIdx(0);
    setVerAyuda(false);
  };

  return (
    <section aria-label="Para empezar" className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">
          Para empezar
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {PASOS.map((pp, i) => (
            <button
              key={pp.href}
              type="button"
              onClick={() => irAPaso(i)}
              aria-label={`Paso ${i + 1}: ${pp.label}`}
              aria-current={i === activo ? "step" : undefined}
              className={`size-6 grid place-items-center rounded-full font-cinzel text-[11px] leading-none transition-colors ${
                i === activo
                  ? "bg-terracotta text-white"
                  : "bg-marfil text-cacao-soft hover:bg-marfil-soft"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </span>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-marfil p-6">
        <p className="font-display text-[10px] tracking-[0.35em] uppercase text-terracotta-deep">
          Paso {activo + 1} de {PASOS.length}
        </p>
        <div className="mt-1 flex items-start gap-2">
          <h3 className="font-cinzel text-2xl leading-tight text-cacao">
            {p.label}
          </h3>
          {/* Ayuda: al pasar el mouse (desktop) o tocar (móvil). */}
          <span className="relative group shrink-0">
            <button
              type="button"
              onClick={() => setVerAyuda((v) => !v)}
              aria-label="¿Qué es esto?"
              className="mt-1.5 text-cacao-mute hover:text-terracotta transition-colors"
            >
              <HelpIcon className="size-5" />
            </button>
            <span
              role="tooltip"
              className={`absolute left-0 top-full mt-1.5 w-56 rounded-lg bg-cacao text-white text-xs leading-relaxed p-2.5 shadow-lg z-20 ${
                verAyuda ? "block" : "hidden"
              } group-hover:block`}
            >
              {p.corto}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setVerEjemplo((v) => !v)}
          className="mt-4 inline-flex items-center gap-2 text-sm text-terracotta hover:text-terracotta-deep transition-colors"
        >
          <BulbIcon className="size-4" />
          {verEjemplo ? "Ocultar ejemplo" : "Ver un ejemplo"}
        </button>

        {verEjemplo && (
          <div className="mt-3 rounded-xl bg-marfil-soft ring-1 ring-marfil p-4">
            <p className="text-sm text-cacao leading-relaxed">{p.ejemplos[ejIdx]}</p>
            {p.ejemplos.length > 1 && (
              <button
                type="button"
                onClick={() => setEjIdx((n) => (n + 1) % p.ejemplos.length)}
                className="mt-2 inline-flex items-center gap-1 text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta transition-colors"
              >
                <BulbIcon className="size-3.5" /> Otro ejemplo
              </button>
            )}
          </div>
        )}

        <div className="mt-5">
          <Link
            href={p.href}
            className="inline-flex items-center gap-2 rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta transition-colors"
          >
            {p.cta}
            <ChevronIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
