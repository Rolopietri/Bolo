import { redirect } from "next/navigation";

// El conteo físico se retiró: el control de stock ahora sale del historial de
// uso diario (ventas del día → recetas → insumos). Redirigimos los enlaces
// viejos a esa pestaña.
export default function ConteoFisicoPage() {
  redirect("/cocina/insumos?vista=uso");
}
