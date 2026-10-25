"use client";

import { useEffect, useState } from "react";
import { EstadoVacioCocina } from "@/components/EstadoVacioCocina";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Aviso del hub cuando todavía no hay compras ni ventas. */
export function InventarioVacio() {
  const [vacio, setVacio] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const [compras, ventas] = await Promise.all([
          sb.from("compras").select("id").limit(1),
          sb.from("ventas").select("id").limit(1),
        ]);
        if (cancelled) return;
        if (compras.error || ventas.error) {
          setVacio(false);
          return;
        }
        setVacio((compras.data ?? []).length === 0 && (ventas.data ?? []).length === 0);
      } catch {
        if (!cancelled) setVacio(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intento]);

  if (!vacio) return null;

  return (
    <div className="mb-8">
      <EstadoVacioCocina
        titulo="El inventario todavía no se mueve"
        beneficio="Compras, ventas y el pedido sugerido viven aquí. Con un ejemplo cargado ves alertas y una lista de compra para el servicio."
        cta="Registrar una compra"
        href="/cocina/compras"
        onDemo={() => setIntento((n) => n + 1)}
      />
    </div>
  );
}
