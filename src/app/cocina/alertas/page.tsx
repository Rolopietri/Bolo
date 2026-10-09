import { redirect } from "next/navigation";

// Este módulo ahora vive como pestaña dentro de Insumos. Redirigimos para no
// romper enlaces viejos.
export default function Page() {
  redirect("/cocina/insumos?vista=alertas");
}
