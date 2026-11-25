# Barra superior fija — diseño corto

**Fecha:** 25/11/2026 · **Estado:** aprobado por Tomás en la conversación

## Para qué
Que la marca y el contacto (botón de cotizar) estén siempre a la vista mientras se recorre la página, en celular y en PC. La barra tiene que ser chica, lo justo y necesario, y mantener el estilo actual.

## Qué se hace
- Arriba de todo, la cabecera queda exactamente como está hoy.
- Cuando la cabecera sale de la pantalla al bajar, aparece una barra fija de un renglón:
  - **Celular:** logo + botón "Cotizar".
  - **PC:** logo + Servicios / Materiales / Galería + "Pedir cotización".
- Al volver arriba, la barra fija desaparece y queda la cabecera original.
- El botón flotante de WhatsApp queda como está. "Contacto" en la barra = el botón de cotizar (decidido por Tomás).

## No objetivos
- Sin menú desplegable (☰) en el celular.
- No se cambia el diseño de la cabecera original ni del resto de la página.

## Anti-objetivos (sería un fracaso aunque funcione)
- Que la barra tape contenido: títulos de sección al saltar desde el menú, servicios cortados, la barra de servicios del celular.
- Que la página "salte" al aparecer o desaparecer la barra.
- Que en PC muchas pantallas pasen a la vista apilada de Servicios por el alto que ocupa la barra, sin haberlo medido.

## Restricciones encontradas en el código
- La cabecera vive dentro de `#inicio` (con `overflow: hidden`), así que no puede volverse `sticky` sin mover cosas del inicio.
- Servicios en celular (`mode-stack`): ya tiene su propia barra fija (`#svc-bar`, `top: 0`). Tiene que ir debajo de la nueva barra.
- Servicios en PC (`mode-scroll`): el bloque `#stick` ocupa el alto entero de la pantalla y cada servicio tiene que entrar completo; si alguno no entra, se pasa a la vista apilada. Con la barra, el alto disponible es pantalla − barra.
- El visor de fotos (`.lb`, z-index 50) tiene que quedar por encima de la barra.

## Enfoques considerados
1. **Barra aparte que aparece al bajar (elegido).** Un elemento nuevo, fijo, que se muestra cuando la cabecera original sale de la vista. No toca el inicio, no produce saltos y su alto es constante, así que todos los cálculos de Servicios usan un único valor.
2. **Volver fija la cabecera original y achicarla al bajar.** Hay que sacarla de `#inicio`, rehacer el alto del inicio y compensar el cambio de altura (salto de contenido). Más frágil.
3. **Cabecera fija siempre, también arriba de todo.** Cambia el inicio tal como está y le resta pantalla al primer vistazo; Tomás pidió que arriba quede como está.

Elección mía (Tomás dejó el cómo en mis manos): enfoque 1.

## Arreglo relacionado en Servicios
Hoy la página decide si cada servicio entra en la pantalla una sola vez, al cargar el script. Las tipografías (Google Fonts con `display=swap`) llegan después y pueden agrandar los textos: un servicio que "entraba" con la letra provisoria puede quedar cortado con la definitiva. Se vuelve a medir cuando terminan de cargar las tipografías y la página. A confirmar en las pruebas.

## Cómo se prueba
Chrome real (CDP) en 360×640, 360×740, 390×844, 768×1024, 1280×720, 1366×657, 1366×768, 1440×900, 1536×864, 1920×1080:
- En PC, para cada uno de los 6 servicios: nada debajo de la barra y nada cortado abajo; comparar en qué tamaños se usa la vista apilada antes y después.
- En celular: tocar cada botón de servicio deja el título visible debajo de las dos barras.
- Saltos del menú y del botón de cotizar: el título queda visible debajo de la barra.
- Visor de fotos por encima de la barra; WhatsApp sin cambios.
- Capturas con zoom al logo y al botón.

## Lo que queda a criterio de quien lo construye
Alto exacto de la barra (~56 px celular, ~64 px PC), animación de entrada (sin animación si la persona pidió movimiento reducido), si la razón social entra o no al lado del logo en PC.
