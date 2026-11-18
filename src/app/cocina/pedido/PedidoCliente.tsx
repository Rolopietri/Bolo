"use client";

import { PedidoSugeridoClient } from "./PedidoSugeridoClient";

// La página muestra directamente el plan "Qué comprar" (por lo que vendes), con
// la opción discreta de armarlo a mano dentro. La vista "por mínimo"
// (ReposicionClient) ya no se enlaza aquí; el componente queda disponible por si
// se quiere ubicar en otro lado (p. ej. junto a las alertas de stock).
export function PedidoCliente({
  planesActivos = false,
}: {
  planesActivos?: boolean;
}) {
  return <PedidoSugeridoClient planesActivos={planesActivos} />;
}
