// Sugiere la categoría de un insumo por su nombre ("Harina de trigo" → Secos y
// granos). Es un diccionario de productos comunes de cocina, sin servicios
// externos. Si no reconoce el nombre, no sugiere nada: la persona elige.

import { grupoCategoriaStock, type GrupoCategoriaStock } from "@/lib/stock-liviano";

const PRODUCTOS: Record<Exclude<GrupoCategoriaStock, "Otros">, string[]> = {
  "Proteínas": [
    "carne", "res", "lomo", "solomo", "punta trasera", "costilla", "molida", "chuleta",
    "cerdo", "tocineta", "tocino", "pernil", "jamon", "salchicha", "chorizo", "mortadela",
    "pollo", "pechuga", "muslo", "alas", "pavo", "pescado", "salmon", "atun", "merluza",
    "camaron", "calamar", "pulpo", "mejillon", "huevo", "huevos",
  ],
  "Lácteos": [
    "leche", "queso", "mozzarella", "parmesano", "cheddar", "ricota", "requeson", "yogur",
    "yogurt", "mantequilla", "margarina", "crema", "nata", "suero",
  ],
  "Vegetales y frutas": [
    "tomate", "cebolla", "ajo", "pimenton", "aji", "papa", "zanahoria", "lechuga", "repollo",
    "pepino", "calabacin", "berenjena", "brocoli", "coliflor", "espinaca", "cilantro",
    "perejil", "cebollin", "celeri", "apio", "yuca", "ñame", "ocumo", "auyama", "platano",
    "cambur", "aguacate", "limon", "naranja", "mango", "piña", "fresa", "parchita",
    "lechosa", "patilla", "melon", "manzana", "pera", "uva", "champiñon", "hongo", "maiz tierno",
  ],
  "Secos y granos": [
    "harina", "arroz", "pasta", "espagueti", "caraota", "frijol", "lenteja", "garbanzo",
    "arveja", "avena", "azucar", "sal", "pimienta", "comino", "oregano", "canela", "cafe",
    "cacao", "chocolate", "aceite", "vinagre", "salsa", "mayonesa", "ketchup", "mostaza",
    "pan", "galleta", "levadura", "polvo de hornear", "maicena", "fecula", "atun en lata",
    "enlatado", "especia", "condimento",
  ],
  "Bebidas": [
    "refresco", "gaseosa", "agua", "jugo", "nectar", "cerveza", "vino", "ron", "whisky",
    "vodka", "malta", "te ", "energizante",
  ],
  "Limpieza y desechables": [
    "servilleta", "vaso", "plato desechable", "envase", "bolsa", "papel", "aluminio",
    "film", "detergente", "cloro", "jabon", "desinfectante", "guante", "pitillo",
  ],
};

function normalizar(s: string): string {
  return ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Grupo sugerido para un nombre de insumo, o null si no lo reconoce. */
export function sugerirCategoria(nombre: string): string | null {
  const n = normalizar(nombre);
  if (n.trim().length < 3) return null;
  let mejor: { grupo: string; largo: number } | null = null;
  for (const [grupo, palabras] of Object.entries(PRODUCTOS)) {
    for (const p of palabras) {
      const clave = normalizar(p);
      // Palabra completa (o su plural simple) dentro del nombre.
      const hit = n.includes(clave) || n.includes(clave.replace(/ $/, "s "));
      if (hit && (!mejor || clave.length > mejor.largo)) mejor = { grupo, largo: clave.length };
    }
  }
  if (mejor) return mejor.grupo;
  // Si el nombre ya trae una pista de categoría ("pollo", "queso"…).
  const g = grupoCategoriaStock(nombre);
  return g === "Otros" || g === "Sin categoría" ? null : g;
}
