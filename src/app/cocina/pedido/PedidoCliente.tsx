"use client";

import { useState } from "react";
import { PedidoSugeridoClient } from "./PedidoSugeridoClient";
import { ReposicionClient } from "./ReposicionClient";

export type VistaPedido = "stock" | "raciones";

const TABS: { id: VistaPedido; label: string }[] = [
  { id: "stock", label: "Qué pedir" },
  { id: "raciones", label: "Por raciones" },
];

export function PedidoCliente({
  inicial,
  planesActivos = false,
}: {
  inicial: VistaPedido;
  planesActivos?: boolean;
}) {
  const [vista, setVista] = useState<VistaPedido>(inicial);

  function ir(v: VistaPedido) {
    setVista(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("vista", v);
      window.history.replaceState(null, "", url);
    } catch {
      // la pestaña ya cambió
    }
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2" aria-label="Cómo armar el pedido">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => ir(t.id)}
            aria-current={vista === t.id ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-xs uppercase tracking-widest ring-1 ${
              vista === t.id
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {vista === "stock" ? (
        <ReposicionClient onVerRaciones={() => ir("raciones")} />
      ) : (
        <PedidoSugeridoClient planesActivos={planesActivos} />
      )}
    </div>
  );
}
