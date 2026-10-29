# Plan de acción — Punto 8: ajustar PaddleOCR con las facturas de Bolo

**Objetivo.** Entrenar el modelo de reconocimiento de PaddleOCR (PP-OCRv5 latino,
versión móvil) con renglones reales de las facturas que usan los clientes de
Bolo. Así lee mejor tickets térmicos desteñidos, montos con formato venezolano
(`Bs 1.234,56`, `J-12345678-9`) y los rótulos de cada proveedor.

**Regla:** costo cero. Se usan Colab gratis, el almacenamiento gratis de
Supabase y archivos estáticos de Vercel. El modelo se publica solo si mejora el
banco de 25 fotos, igual que se hizo con PaddleOCR.

**Por qué es viable.** `ppu-paddle-ocr` acepta un modelo de reconocimiento
propio (`model: { recognition: <url .onnx>, charactersDictionary: <url> }`).
Se cambia el archivo del modelo y el resto del lector (filas, reglas,
aritmética, memoria) queda igual.

---

## Fase 0 — Datos de arranque, sin esperar a los clientes (1 semana)

1. **Etiquetar el banco.** Recortar y transcribir a mano los renglones de las
   25 fotos (≈ 600 recortes). La mitad va para entrenar y la otra mitad
   **nunca** se usa para entrenar: es la vara de medir.
2. **Datos sintéticos.** Generar 50.000 o más renglones falsos con fuentes de
   impresora térmica y de tickets, ruido, desenfoque, desteñido e inclinación.
   El contenido imita lo que se lee: montos `1.234,56` / `1,234.56`, RIF,
   fechas, `SUBTTL`, `IVA (G) 16%`, `EXENTO`, nombres de productos del
   inventario. Herramienta gratis: TextRecognitionDataGenerator.
3. **Primer entrenamiento** con sintéticos más la mitad del banco. Con eso se
   sabe pronto si el camino rinde, antes de construir la recolección.

## Fase 1 — Recolección dentro de Bolo, con permiso (1 semana de desarrollo)

Hoy la foto **nunca sale del teléfono**. Para entrenar hacen falta recortes, así
que la recolección es **opcional y por empresa**:

- Ajuste en Administración: "Ayudar a mejorar el lector de facturas", apagado
  por defecto.
- Al pulsar "Registrar todas", si está activo, se suben **solo los recortes de
  los renglones de productos y totales**. No se sube la foto entera, ni la
  cabecera con nombres y RIF del cliente. Con cada recorte va el texto
  confirmado.
- **Etiqueta automática.** Si la persona no cambió el renglón, el texto leído
  es correcto: es un ejemplo fácil. Si corrigió el monto o la cantidad, se
  guarda el texto corregido: es un ejemplo difícil y el más valioso.
- Página interna de revisión (solo administradores de Bolo) para corregir las
  etiquetas dudosas. Funciona como PPOCRLabel, pero en la web.

Cambios técnicos (requieren tu confirmación antes de aplicarse):

- **SQL:** tabla `ocr_muestras` (empresa, recorte, texto, si fue corregido,
  fecha) y un bucket privado en Storage.
- **Espacio:** cada recorte pesa unos 10 KB, así que 1 GB gratis alcanza para
  más de 50.000.
- **Borrado:** borrar las muestras de una empresa con un botón si apaga la
  opción.

Meta de volumen para el segundo entrenamiento: unos 3.000 recortes reales, de
los cuales al menos 300 sean corregidos, de 10 o más proveedores distintos.

## Fase 2 — Entrenamiento en Colab gratis (2–3 días por ronda)

1. Cuaderno de Colab con PaddleOCR 3.x y la configuración
   `PP-OCRv5_mobile_rec`, partiendo del modelo latino oficial.
   - **Ajuste fino**, no desde cero: tasa de aprendizaje baja (1e-4), de 20 a
     50 épocas.
   - **Mezcla:** 70 % real y 30 % sintético.
2. Puntos de control en Google Drive, porque la GPU T4 gratis corta la sesión a
   las ~12 h y a veces no hay cupo.
3. Mismo diccionario de caracteres que el latino oficial (incluye Ñ, tildes,
   °), para que el modelo nuevo sea intercambiable.

## Fase 3 — Exportar y medir (1 día)

1. Paddle → `paddle2onnx` → `.onnx`. Se verifica que pese lo mismo que el
   actual (≈ 8 MB); opcionalmente se cuantiza a int8 para teléfonos lentos.
2. **Medición en dos niveles**, siempre contra la mitad del banco que no se
   entrenó:
   - **Por renglón:** exactitud de renglón completo y tasa de error por
     carácter, frente al modelo oficial.
   - **De punta a punta:** el banco de 25 fotos (total correcto, ítems y
     "lista"). Hoy está en 15/25 de total y 6/25 de lista.
3. **Puerta de salida:** se publica solo si "lista" sube y "total" no baja.

## Fase 4 — Publicar y volver atrás si hace falta (1 día)

- El `.onnx` y el diccionario van en `public/modelos/` (Vercel lo sirve gratis
  y el navegador lo guarda en caché), con versión en el nombre
  (`rec-bolo-v1.onnx`).
- En `obtenerPaddle()` se usa el modelo propio y, si no carga, el oficial.
- Una variable de versión permite volver al modelo anterior con un solo cambio.

## Fase 5 — Ciclo continuo

- Reentrenar cada vez que se junten unos 1.000 recortes corregidos nuevos, o
  una vez al mes, con la misma puerta de salida.
- Llevar en el LEEME del banco la tabla de cada versión: datos, exactitud y
  resultado del banco.

---

## Calendario sugerido

| Semana | Trabajo |
|---|---|
| 1 | Fase 0: etiquetar el banco, generar sintéticos, primer entrenamiento y medición |
| 2 | Fase 1: recolección opcional en Bolo (tras tu visto bueno al SQL) |
| 2–3 | Fases 3–4 si la primera ronda ya mejora el banco: se publica `v1` |
| 4 en adelante | Se juntan datos reales; segunda ronda cuando haya ≈ 3.000 recortes |

## Riesgos y cómo se cubren

- **Pocos datos, el modelo se aprende de memoria unos pocos proveedores.** Se
  cubre con la mezcla con sintéticos, la mitad del banco nunca entrenada y la
  puerta de salida.
- **Privacidad.** La recolección es opcional, solo de recortes de renglones,
  con bucket privado y borrado por empresa.
- **Colab gratis sin GPU disponible.** Se reanuda desde el punto de control o
  se entrena de noche. Una ronda de reconocimiento móvil cabe en pocas horas.
- **Modelo más pesado o más lento en teléfonos.** Se mide el tiempo en el
  banco; la cuantización int8 queda de respaldo.
- **Lo que el ajuste NO arregla:** letra manuscrita, varias facturas en una
  foto, papel muy arrugado. Eso depende de la cámara guiada (#1) y del
  aplanado (#2).
