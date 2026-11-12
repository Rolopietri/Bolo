import { redirect } from "next/navigation";

// Stock e Insumos se unieron en una sola pantalla, Inventario: arriba "¿cómo
// estoy?" (valor, se acaba pronto, para pedir) y abajo la lista de insumos.
// Redirigimos los enlaces viejos.
export default function StockPage() {
  redirect("/cocina/insumos");
}
