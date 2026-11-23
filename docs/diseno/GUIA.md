# Guía de diseño de bolo

Propuesta para las pantallas de cocina. Describe lo que hay hoy en el repo y las reglas para lo que se publique después. No cambia código.

Para quién: gerente (dueño o no), jefe de cocina y jefe de producción en Venezuela. Usan el teléfono en plena operación y deciden con números. El cocinero de línea no entra a bolo.

Medición de contraste: luminancia relativa de WCAG 2.x, octubre 2026. El texto normal tiene que llegar a **4,5:1**. El texto grande (24 px, o 19 px en negrita) y los iconos llegan con **3:1**. Los números de abajo están redondeados a dos decimales.

Los nombres de color (`cacao`, `terracotta`, `marfil`) son los tokens de `src/app/globals.css`. Las clases (`font-cinzel`, `text-cacao`) son las que ya genera Tailwind 4 a partir de ese archivo.

## Paleta y uso

El fondo de la página hoy es blanco (`globals.css`, `body`). La crema no reemplaza ese fondo: es el fondo de una ayuda, un ejemplo o un aviso neutro.

| Token en código | Hex | Para qué sirve |
| --- | --- | --- |
| `cacao` / `navy` | `#1d1d1b` | Texto principal. También el texto del botón principal cuando el fondo es naranja. |
| `cacao-soft` | `#5b5b57` | Texto de apoyo: ayudas, fechas, «paso 2 de 4». Es el gris más claro permitido para leer. |
| `cacao-mute` | `#9a9a95` | Existe hoy y **no sirve para texto**. Ver la tabla de contraste. |
| blanco | `#ffffff` | Fondo de la página y de las tarjetas. |
| `marfil-soft` | `#f7f3ea` | Crema. Fondo de un ejemplo, un total o un aviso neutro. |
| `marfil-light` | `#f1eee7` | Fondo de un grupo suave (una sub-receta, un bloque plegado). |
| `marfil` | `#e7e3da` | Solo línea: borde, separador. No es color de texto. |
| `terracotta` / `naranja` | `#f15a24` | **Solo** el relleno del botón principal y la marca de alerta (punto o icono). |
| `terracotta-deep` | `#d4481a` | No usarlo como fondo de texto. No llega a 4,5:1 ni con blanco ni con `#1d1d1b`. |
| `naranja-soft` | `#fbd9c9` | Fondo del círculo de un icono de menú. Encima va texto o icono `#1d1d1b`. |
| vino (ya usado en `ErrorBanner`) | `#7A2419` | Texto de error y relleno del botón de peligro. |
| fondo de error | `#F9EBE7` | Detrás del texto vino. Anillo `#E8C5BC`. |
| verde de confirmación | texto `#2F4A1F` sobre `#F1F4ED` | «Quedó guardado». Anillo `#C9D6BC`. |
| ámbar de aviso | texto `#7A5A18` sobre `#FBF3E2` | «Revisa este monto», «todavía no lo pagué». |
| `oliva`, `coral`, `azul-polvo` | `#758f5f`, `#c8695c`, `#9fb6d2` | Solo gráficos. No texto, no botones. |

### Regla del naranja

`#f15a24` aparece en dos sitios:

1. El botón de la acción principal de esa pantalla. Una sola vez.
2. La marca de alerta: el punto o el icono de «se acabó» / «revisa». El texto de la alerta no va en naranja.

No va en enlaces, en el hover de todos los botones, en pestañas, ni en texto de 14 px. Hoy el hover de casi todos los botones carbón pasa a naranja (`hover:bg-terracotta`). Eso apaga la señal: si todo puede volverse naranja, el naranja ya no dice «esta es la acción».

### Contraste de cada pareja de texto y fondo

| Texto | Fondo | Relación | ¿Texto normal? |
| --- | --- | --- | --- |
| `#1d1d1b` | `#ffffff` | 16,88:1 | Sí |
| `#1d1d1b` | `#f7f3ea` | 15,25:1 | Sí |
| `#1d1d1b` | `#f1eee7` | 14,57:1 | Sí |
| `#1d1d1b` | `#e7e3da` | 13,18:1 | Sí |
| `#1d1d1b` | `#fbd9c9` | 12,76:1 | Sí |
| `#1d1d1b` | `#f15a24` | 5,01:1 | Sí. Esta es la pareja del botón principal. |
| `#5b5b57` | `#ffffff` | 6,82:1 | Sí |
| `#5b5b57` | `#f7f3ea` | 6,16:1 | Sí |
| `#5b5b57` | `#e7e3da` | 5,33:1 | Sí. Sirve para el botón deshabilitado. |
| `#ffffff` | `#1d1d1b` | 16,88:1 | Sí. Botón secundario de énfasis, si hiciera falta. |
| `#ffffff` | `#3a3a37` | 11,41:1 | Sí |
| `#7A2419` | `#F9EBE7` | 8,63:1 | Sí |
| `#ffffff` | `#7A2419` | 10,03:1 | Sí. Botón de peligro. |
| `#2F4A1F` | `#F1F4ED` | 8,92:1 | Sí |
| `#7A5A18` | `#FBF3E2` | 5,76:1 | Sí |
| `#ffffff` | `#f15a24` | 3,37:1 | **No.** Pasa el 3:1 de icono y de texto grande, y falla el texto normal. |
| `#ffffff` | `#d4481a` | 4,43:1 | **No.** |
| `#1d1d1b` | `#d4481a` | 3,81:1 | **No.** Por eso el estado presionado no oscurece el naranja. |
| `#f15a24` | `#ffffff` | 3,37:1 | **No.** El naranja no se usa como color de letra. |
| `#f15a24` | `#f7f3ea` | 3,04:1 | **No.** |
| `#d4481a` | `#ffffff` | 4,43:1 | **No.** |
| `#9a9a95` | `#ffffff` | 2,83:1 | **No.** |
| `#9a9a95` | `#f7f3ea` | 2,55:1 | **No.** |
| `#9a9a95` | `#f1eee7` | 2,44:1 | **No.** |
| `#C79A2E` | `#FBF3E2` | 2,35:1 | **No.** Es el punto ámbar de algunos pills. El punto tiene que ser `#7A5A18`, el mismo vino-ámbar del texto. |
| `#758f5f` / `#c8695c` / `#9fb6d2` | `#ffffff` | 3,59 / 3,73 / 2,08 | **No** como texto. |

### Alternativa cuando el naranja no llega a 4,5:1

El blanco sobre `#f15a24` se queda corto (3,37:1). El naranja de marca no se cambia. Cambia el texto:

- Botón principal: fondo `#f15a24`, texto `#1d1d1b` (5,01:1).
- Si una etiqueta tuviera que ser blanca, el fondo de esa etiqueta pasa a `#c2410c` (blanco encima, 5,18:1). Ese hex no es un tercer naranja de marca: solo existe para no poner blanco sobre `#f15a24`.
- Una alerta escrita usa el banner que ya pasa: vino sobre salmón, o ámbar `#7A5A18` sobre `#FBF3E2`. El naranja queda en el punto o en el icono (3,37:1, suficiente para un icono, no para una frase).
- El gris `#9a9a95` se reemplaza, en cualquier texto, por `#5b5b57` (`text-cacao-soft`).

Semáforo de ganancia. Hoy la lista de recetas usa tres pares que no llegan a 4,5:1 (`#2E9E5B` sobre `#E4F3EA` es 2,97:1; `#A16207` sobre `#FBEEDD` es 4,31:1; `#D64534` sobre `#FBE5E1` es 3,65:1). Se unifican con los banners que ya pasan:

| Estado | Texto | Fondo | Relación | Palabras |
| --- | --- | --- | --- | --- |
| Bien | `#2F4A1F` | `#F1F4ED` | 8,92:1 | Te queda bien |
| Ojo | `#7A5A18` | `#FBF3E2` | 5,76:1 | Queda justo |
| Mal | `#7A2419` | `#F9EBE7` | 8,63:1 | Casi no te queda |

El pill lleva texto y un punto del mismo color del texto. Sin emoji.

## Tipografía

Nunito para texto (`font-sans`, cargada en `src/app/layout.tsx`). Baloo 2 para títulos (`font-cinzel` en `globals.css`). `font-display` y `font-serif` también son Nunito: no agregan una tercera familia.

Cinco tamaños. Nada de 9, 10 ni 11 px. Nada de mayúsculas con `tracking-[0.3em]` o `tracking-[0.4em]`: en 360 px una ceja así ocupa dos líneas y se lee lento.

| Uso | Familia | Tamaño | Peso | Interlineado | Clase |
| --- | --- | --- | --- | --- | --- |
| Título de pantalla | Baloo 2 | 24 px | 700 | 32 px | `font-cinzel text-2xl font-bold leading-8` |
| Título de bloque | Baloo 2 | 20 px | 700 | 28 px | `font-cinzel text-xl font-bold leading-7` |
| Texto | Nunito | 16 px | 400 | 24 px | `text-base leading-6` |
| Apoyo (ayuda, fecha, etiqueta) | Nunito | 14 px | 600 | 20 px | `text-sm font-semibold leading-5 text-cacao-soft` |
| Botón | Nunito | 16 px | 700 | 24 px | `text-base font-bold leading-6` |

El título de pantalla va en oración («Compras»), no en mayúsculas. En pantallas anchas puede subir a `sm:text-3xl sm:leading-9` (30 px / 36 px). En el teléfono se queda en 24 px.

Hoy los títulos de página usan `font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase`. El tamaño de Baloo está bien. El tracking y las mayúsculas no.

## Espaciado

Todo en múltiplos de 4 px. Escala: 4, 8, 12, 16, 24, 32, 40, 48. En Tailwind: `1`, `2`, `3`, `4`, `6`, `8`, `10`, `12`.

| Dónde | Medida | Clase |
| --- | --- | --- |
| Aire de la página en el teléfono | 16 px | `px-4 py-4` |
| Entre bloques | 16 px | `space-y-4` o `gap-4` |
| Dentro de una tarjeta | 16 px | `p-4` |
| Entre etiqueta y campo | 8 px | `mt-2` |
| Entre botones de una fila | 8 px | `gap-2` |

`px-5` (20 px) y `py-10` (40 px), que hoy abren casi todas las páginas de cocina, son múltiplos de 4, pero 40 px arriba y abajo en un teléfono de 740 px se comen el primer pantallazo. En el teléfono el aire es 16 px.

No usar `py-1.5`, `py-2.5`, `gap-1.5` ni `p-2.5`: son 6 o 10 px.

## Iconos

Salen de `src/components/icons.tsx`. Línea, sin relleno, heredan el color del texto (`currentColor`).

- Grosor: `strokeWidth={1.7}`, puntas y uniones redondas, `viewBox` de 24.
- Al lado de un texto de 16 px: `size-5` (20 px).
- Botón que solo tiene icono: el icono a `size-6` (24 px) dentro de un blanco de 44 px.
- El default del componente es `size-4` (16 px). Sirve como adorno junto a una palabra. No sirve como cosa que se toca.
- No usar `size-3` ni `size-3.5` en nada que el dedo tenga que acertar.

## Botones

Alto mínimo 44 px: `min-h-11`. Ancho completo en el teléfono cuando es la acción de la pantalla (`w-full`). Radio `rounded-xl`. Un botón principal por pantalla.

### Principal

La acción de esa pantalla: «Agregar insumo», «Registrar compra», «Crear receta».

| Estado | Cómo se ve |
| --- | --- |
| Normal | Fondo `#f15a24`, texto `#1d1d1b`, `min-h-11 px-4 text-base font-bold` |
| Presionado | Los mismos colores y un anillo de 2 px `#1d1d1b` (`active:ring-2 active:ring-cacao`). No se oscurece el fondo: `#1d1d1b` sobre `#d4481a` baja a 3,81:1. |
| Cargando | El mismo botón, `aria-busy`, texto «Guardando…», `disabled`. Sin bajar la opacidad. |
| Deshabilitado | Fondo `#e7e3da`, texto `#5b5b57` (5,33:1). Sin `opacity-50`: al 50 % el blanco sobre naranja cae por debajo de 4,5:1. |

### Secundario

Cancelar, volver, «Agregar a mano» cuando la acción principal es otra, «Ver historial».

| Estado | Cómo se ve |
| --- | --- |
| Normal | Fondo blanco, anillo `#e7e3da`, texto `#1d1d1b`, `min-h-11` |
| Presionado | Fondo `#f7f3ea` |
| Cargando | Texto «Guardando…», `disabled`, colores iguales |
| Deshabilitado | Fondo `#f1eee7`, texto `#5b5b57` |

### Peligro

Borrar de verdad, después de un diálogo. No es naranja: el naranja ya significa «haz esto».

| Estado | Cómo se ve |
| --- | --- |
| Normal | Fondo `#7A2419`, texto blanco (10,03:1), `min-h-11` |
| Presionado | Anillo de 2 px `#1d1d1b` sobre el mismo vino |
| Cargando | Texto «Borrando…», `disabled`, sin opacidad |
| Deshabilitado | Igual que el secundario deshabilitado |

`ConfirmDialog` (`src/components/ConfirmDialog.tsx`) hoy pone el peligro en `bg-terracotta` con texto blanco y `py-2`. Cuando se toque ese componente, pasa a vino y a 44 px. El diálogo sigue existiendo: en el teléfono el `confirm()` del navegador a veces no aparece, y por eso el componente propio se queda.

### Después de cada acción

Siempre queda una frase en pantalla.

- Salió bien: banner verde que ya usa el costeo (`#2F4A1F` sobre `#F1F4ED`), con una frase de cocina. «Quedó registrado. El precio del pollo se actualizó.» Se queda hasta la siguiente acción, no 1,5 segundos.
- Salió mal: `ErrorBanner` (`#7A2419` sobre `#F9EBE7`) con qué pasó y qué tocar. No un `catch` vacío.
- Un anillo naranja de un segundo no cuenta como confirmación.

## Largo de la página

Una tarea por pantalla. En un teléfono de 360×740, el contenido cabe en unas dos pantallas de scroll (cerca de 1.400 px debajo de la cabecera). Lo demás va en un plegable.

Ya existe `src/components/Plegable.tsx`. También la calculadora de unidades se abre sola (`UnitCalculator`, cerrada por defecto). Usar eso para lo que no es la tarea:

- En un alta: nombre, cantidad y precio a la vista. Notas, merma, flete y número de factura, plegados.
- En una lista: buscar y la fila. Filtros finos, plegados, si hay más de una fila de pastillas.
- En una cuenta: el resultado a la vista («te cuesta / lo vendes a / te queda»). El desglose, plegado y editable.

La cabecera no repite el camino completo («Cocina / Compras, Ventas y Pedidos / Compras») en tres tamaños. Con «← Compras» y el título alcanza.

## Lenguaje de cocina

Tuteo, como ya habla la guía de inicio. Una idea por frase. El verbo primero. El número con lo que significa: «Te cuesta $1,20. A $4,00 te quedan $2,80.»

Dólares con `$`, bolívares con `Bs`. En los montos que escribe la persona, coma decimal (`12,50`), que es como se lee una factura en Venezuela. El placeholder `0.00` se cambia a `0,00`.

No se dice «el sistema», «módulo», «parámetro», «target» ni «batch».

| Si aparece esto | Se dice así |
| --- | --- |
| Food cost | Cuánto del precio se va en ingredientes |
| Parámetros del costeo | Cómo calculamos el precio |
| Precio sugerido al objetivo | Precio para que te quede lo que quieres |
| Margen | Lo que te queda |
| Stock libre | Lo que puedes usar |
| Stock comprometido, «comp.» | Apartado |
| Auditoría | Historial |
| Sub-receta, batch | Preparación (una salsa, una masa). «Cuánto rinde» |
| porc., /porc. | porción |
| s/IVA, c/IVA | sin IVA, con IVA |
| Modalidad de pago | Cómo pagaste |
| Cuenta por pagar | Todavía no lo pagué |
| Ficha técnica | Receta |
| Inactivo | Oculto |
| Operación gastronómica | Cocina |

«Insumo», «proveedor», «merma», «tasa BCV», «paralela» y «divisa» sí se quedan: un jefe de cocina en Venezuela las usa. IVA también, escrito completo la primera vez de la pantalla.

Glosario corto, para copiar en ayudas:

- **Proveedor.** A quién le compras. El del pollo, la tostadora, el del gas.
- **Insumo.** Lo que compras para cocinar: pollo, café, vasos.
- **Presentación.** Cómo viene: un saco de 45 kg, una lata, un kilo suelto.
- **Receta.** El plato o la bebida, con lo que lleva y lo que te cuesta.
- **Preparación.** Algo que haces para usar dentro de otra receta (salsa, masa). No se vende solo.
- **Compra.** Lo que entró hoy: cuánto, a qué precio y cómo lo pagaste.
- **Merma.** Lo que se pierde al limpiar o al cocinar, o lo que se botó.
- **Porción.** Lo que sale en un plato.

## Rendimiento en teléfonos económicos

- Fuentes. `layout.tsx` pide a Google, en una hoja que bloquea el primer dibujo, Nunito en 400, 600, 700, 800 y cursiva 400 y 600, y Baloo 2 en 500, 600, 700 y 800. Para estas pantallas alcanzan Nunito 400 y 700, y Baloo 2 en 700, subconjunto latino. Meta: menos de 120 KB de woff2 entre las dos. `display=swap` ya está; el siguiente paso es servirlas con el mecanismo de fuentes de Next, no con un `<link>` a Google en el `<head>`.
- Imágenes. El logo que usa la cabecera es `public/bolo-logo.png`: 697×293, 10 KB, y se muestra a 28–32 px de alto. El `.webp` del mismo logo pesa 23 KB: no aporta. Estas cinco pantallas no llevan foto. Si entra una foto de factura, va comprimida, lado largo de unos 1600 px, y no se descarga hasta que la persona la toma.
- Animación. Nada de desenfoque de fondo (`backdrop-blur` está en la cabecera y en `ConfirmDialog`), nada de `animate-ping` (el cursor-guía) ni de sombras grandes en la burbuja. Un cambio de color al presionar alcanza. El reloj de «guardando» es la palabra, no un spinner pesado.
- Una pantalla, poco DOM. Listas largas se agrupan por día o por categoría, como ya hace Compras, en vez de pintar todo abierto.

## Lista de chequeo

Antes de publicar una pantalla nueva, en un teléfono de 360×740:

1. ¿Hay una sola tarea, y se entiende sin leer un párrafo?
2. ¿El botón naranja es uno solo, dice el verbo de esa tarea, mide al menos 44 px y lleva texto `#1d1d1b`?
3. ¿Cancelar y borrar se distinguen del principal, y borrar es vino, no naranja?
4. ¿Después de guardar se lee una frase de confirmación, y si falla se lee el error?
5. ¿Todo texto llega a 4,5:1? ¿No quedó `#9a9a95`, blanco sobre `#f15a24`, ni un pill de ganancia con verde claro?
6. ¿El texto más chico es 14 px, en Nunito, sin tracking ancho?
7. ¿Los títulos son Baloo 2, en oración?
8. ¿Los espacios son de la escala de 4 px?
9. ¿En el teléfono cabe en unas dos pantallas, y lo secundario está plegado?
10. ¿Las palabras están en el glosario (porción, no «porc.»; historial, no «auditoría»)?
11. ¿Los iconos salen de `icons.tsx`, a 20 px junto al texto?
12. ¿La pantalla se puede usar con la burbuja de ayuda cerrada, sin que esa burbuja tape el botón?
13. ¿No se agregó una fuente, una foto grande ni una animación que corra sola?

## Lector de facturas

Cuando exista, entra por Compras. Cuatro pasos, uno por pantalla, con el mismo botón principal y la misma confirmación.

1. **Foto.** Un botón: «Tomar foto de la factura». Se puede repetir si salió movida. No hace falta elegir de la galería para terminar.
2. **Revisión.** Lo leído, en palabras de cocina: proveedor, fecha y cada renglón con cantidad, unidad y monto. Lo dudoso lleva el aviso ámbar (`#7A5A18` sobre `#FBF3E2`), no un código.
3. **Corrección.** Cada renglón se toca y se corrige ahí. Unidades en kilo, litro o unidad, las mismas de Compras. Nada de columnas técnicas.
4. **Confirmación.** Un botón: «Registrar esta compra». Después, el banner verde: «Quedó registrada. El stock y el precio se actualizaron.» Si falla, el banner de error, y no se pierden ni la foto ni lo que ya se corrigió.
