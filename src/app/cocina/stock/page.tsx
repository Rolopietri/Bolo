import { redirect } from "next/navigation";

// El módulo "Stock y pérdidas" se fusionó con Insumos: el stock (libre y
// comprometido) y el registro de pérdidas viven ahora en /cocina/insumos, y las
// mermas de producción en Planes. Redirigimos para no romper enlaces viejos.
export default function StockPage() {
  redirect("/cocina/insumos");
}
