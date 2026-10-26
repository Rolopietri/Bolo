// Respuestas locales para lo que se puede enseñar o señalar sin esperar al
// modelo. Las preguntas de cifras (qué me falta, qué está bajo) siguen yendo
// a la API: aquí solo queda el plan B si la clave no está.
import type { ClaveDestino } from "./_destinos";
import type { RellenoGuia } from "./_guiaAccion";
import type { SeguimientoNuevo } from "./_seguimientos";
import { normalizarBusqueda } from "@/lib/text";

export type Atajo = {
  respuesta: string;
  destino?: ClaveDestino;
  rellenar?: RellenoGuia;
  seguimiento?: SeguimientoNuevo;
  /** Si es true, primero se consulta la API. Este texto se usa si no hay clave. */
  requiereDatos?: boolean;
};

const GRAMOS = `Si te venden 1000 g, eso es 1 kg. Guárdalo en kilos: presentación de 1 kg (unidad de compra y unidad base en kg, cantidad 1) y el precio de ese kilo. En la receta puedes pedir 250 g y bolo pasa los gramos a kilos. No mezcles el precio por kilo con el stock en gramos sueltos: el costo se desarma. Te dejo el formulario. Más arriba está la calculadora por si quieres ver el 1000 g = 1 kg.`;

function extraerNombre(original: string): string | undefined {
  const m = original.match(
    /(?:llamad[oa]|se llama|de nombre|nombre)\s+[“"]?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][^"”.,\n]{0,40})/i,
  );
  if (!m) return undefined;
  const nombre = m[1].trim().replace(/[.?!]+$/, "");
  return nombre.length > 1 ? nombre : undefined;
}

export function interpretarAtajo(texto: string): Atajo | null {
  const t = normalizarBusqueda(texto).trim();
  if (!t) return null;

  if (/recuerdame\b/.test(t)) {
    const titulo =
      texto.replace(/.*recu[eé]rdame\s*/i, "").trim().replace(/[.?!]+$/, "") ||
      "Revisar esto";
    return {
      respuesta: `Listo. Te dejé “${titulo}” en Pendientes, en la esquina de abajo a la izquierda.`,
      seguimiento: {
        titulo,
        detalle: "Lo anotó el asistente para que no se te pase.",
      },
    };
  }

  if (
    /que me falta|mi avance|cuanto tengo|cuantos |que esta bajo|stock bajo|que se esta acabando|que hay que comprar/.test(
      t,
    )
  ) {
    return {
      requiereDatos: true,
      destino: "alertas",
      respuesta:
        "Para decirte cifras de tu cocina tengo que estar conectado. Mientras, te llevo a las alertas: ahí ves agotados (stock libre en cero), bajos (por debajo del mínimo) y los que todavía no tienen mínimo.",
    };
  }

  if (/pedido sugerido|armar un pedido|lista de compra/.test(t)) {
    return {
      respuesta:
        "El pedido sugerido no adivina. Tú dices cuántas raciones de cada receta y bolo resta el stock libre —lo que hay, menos lo reservado— y arma lo que falta comprar. Si una receta pide 250 g y el insumo está en kg, convierte solo. Te llevo a esa pantalla.",
      destino: "pedido",
    };
  }

  if (/alerta/.test(t)) {
    return {
      respuesta:
        "Una alerta mira el stock libre: lo físico menos lo que ya está reservado. Si el libre llega a cero, está agotado. Si está por debajo del mínimo que pusiste, está bajo. Si no tiene mínimo, bolo no puede avisarte. Te llevo a verlas.",
      destino: "alertas",
    };
  }

  if (/calculadora|convertir|cuantos (g|gramos)|1000 g|gramos a kilo/.test(t) && !/guarda|guardar|insumo/.test(t)) {
    return {
      respuesta:
        "1000 g son 1 kg. Te abro la calculadora con ese ejemplo. Para guardarlo en la cocina, el insumo va en kg y en la receta puedes seguir escribiendo gramos.",
      destino: "unidades",
    };
  }

  if (/gramo|kilo/.test(t) && /insumo|harina|guarda|guardar|compro|vende|cargo|cargar/.test(t)) {
    return { respuesta: GRAMOS, destino: "form_insumo" };
  }

  if (/proveedor/.test(t) && /agreg|cre|nuev|anad|anota|quiero|donde|llev/.test(t)) {
    const nombre = extraerNombre(texto);
    return {
      respuesta: nombre
        ? `Te abrí el formulario con “${nombre}”. Revisa el contacto y cómo le pagas, y dale a Crear proveedor. Yo no lo guardo hasta que tú confirmes.`
        : "Te abro el formulario de proveedor. Escribe el nombre, cómo le pagas, y dale a Crear proveedor. Yo no guardo nada hasta que tú confirmes.",
      destino: "form_proveedor",
      rellenar: nombre ? { nombre } : undefined,
      seguimiento: nombre
        ? {
            titulo: `Guardar proveedor ${nombre}`,
            detalle: "El formulario quedó listo. Falta tocar Crear proveedor.",
            destino: "form_proveedor",
          }
        : undefined,
    };
  }

  if (/insumo/.test(t) && /agreg|cre|nuev|carg|anad|donde|llev/.test(t)) {
    const nombre = extraerNombre(texto);
    return {
      respuesta: nombre
        ? `Te dejé “${nombre}” en el formulario. Completa la presentación (si te lo venden en gramos, guárdalo en kg: 1000 g = 1 kg) y el precio, y dale a Crear insumo.`
        : "Te abro el formulario de insumo. El nombre, la presentación y el precio alcanzan para empezar. Si te lo venden en gramos, guárdalo en kg: 1000 g = 1 kg.",
      destino: "form_insumo",
      rellenar: nombre ? { nombre } : undefined,
    };
  }

  if (/receta/.test(t) && /agreg|cre|nuev|donde|llev|arm/.test(t)) {
    const nombre = extraerNombre(texto);
    return {
      respuesta: nombre
        ? `Te llevo a la receta nueva con “${nombre}”. Agrega los insumos y guarda: el costo se calcula solo.`
        : "Te llevo al formulario de receta. Ponle nombre, elige insumos del catálogo y bolo calcula el costo.",
      destino: "form_receta",
      rellenar: nombre ? { nombre } : undefined,
    };
  }

  if (/compra/.test(t) && /registr|nueva|agreg|donde|llev|anot/.test(t)) {
    return {
      respuesta:
        "Cada compra que registras actualiza el stock y el precio del insumo. Te abro ese formulario.",
      destino: "form_compra",
    };
  }

  if (/stock|inventario/.test(t) && /donde|llev|ver|busca|mostrar/.test(t)) {
    return {
      respuesta:
        "El stock que importa es el libre: lo físico menos lo reservado. Te llevo al buscador de insumos.",
      destino: "stock",
    };
  }

  if (/por donde empiezo|como empiezo|que hago primero|por donde arranco/.test(t)) {
    return {
      respuesta:
        "Son cuatro pasos, en orden: proveedores (a quién le compras), insumos (qué compras), recetas (qué preparas) y compras (lo que ya compraste, para que el stock sea real). Te llevo al primero.",
      destino: "empezar",
    };
  }

  if (/^llevame a cocina$|modulo de cocina|donde esta cocina/.test(t)) {
    return {
      respuesta: "Cocina es el módulo de insumos, recetas y compras. Te llevo.",
      destino: "inicio_cocina",
    };
  }

  return null;
}
