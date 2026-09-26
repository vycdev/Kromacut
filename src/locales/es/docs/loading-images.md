---
title: Cargar imágenes
slug: loading-images
order: 30
description: Importa, recorta, redimensiona y retoca los píxeles antes de que se conviertan en zonas impresas.
---

# Cargar imágenes

En modo **2D**, preparas la imagen que usará el modelo 3D. Los cambios de color afectan a los objetivos; las ediciones de píxeles afectan a formas y detalles de la impresión.

## Elegir un original

Haz clic en **Elegir archivo** en la barra de la vista previa o arrastra un archivo de imagen a la vista 2D. Solo se carga el primer archivo del grupo. Usa un formato que pueda decodificar tu navegador o la vista web de escritorio; PNG resulta útil cuando importa la transparencia. Revela primero los RAW de cámara y expórtalos a un formato de imagen normal.

Kromacut empieza con su logotipo de ejemplo. Cargar otra imagen sustituye la imagen de trabajo actual. No la publica ni descarga un original desde un enlace web pegado.

## Inspeccionar sin cambiar la imagen

| Control | Efecto |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Rueda del ratón | Amplía alrededor del puntero. Solo cambia la vista, no la resolución ni el tamaño de impresión. |
| Arrastre izquierdo | Desplaza cuando no hay una herramienta de retoque activa. |
| Arrastre central | Desplaza incluso con una herramienta de retoque activa. |
| Activar cuadriculado | Muestra un patrón detrás de los píxeles transparentes. No forma parte de la imagen ni de la impresión. |
| Insignia de tamaño | Muestra dimensiones en píxeles. Durante el recorte, también muestra las dimensiones propuestas. |

La vista mantiene bordes de píxel nítidos en lugar de suavizarlos. Amplía para encontrar píxeles aislados y detalles estrechos.

## ¿Recortar, redimensionar o cambiar el tamaño de impresión?

![Recortar elimina parte de la imagen, redimensionar reduce la resolución y Tamaño de píxel cambia la escala física de cada píxel.](30_crop_resize_scale.svg)

_Las dimensiones esquemáticas ilustran la relación, no un tamaño recomendado de impresión._

### Recortar

Haz clic en **Recortar**, arrastra la selección o sus controles de esquina y borde y elige **Guardar recorte**. **Cancelar recorte** deja la imagen intacta. Guardar conserva el rectángulo seleccionado a la resolución de píxeles de la imagen.

Recorta márgenes innecesarios antes de reducir colores para que no compitan con el sujeto por la paleta. El recorte es rectangular; usa transparencia para un fondo irregular.

### Redimensionar imagen

La **Escala** va del **1 % al 100 %**, con **50 %** por defecto. **Actual** y **Después de redimensionar** muestran las dimensiones antes de confirmar. Haz clic en **Aplicar** para reducir. El 100 %, o un valor que redondea a las mismas dimensiones, no hace nada. La flecha restablece el porcentaje, no la imagen.

El redimensionamiento usa suavizado y puede introducir colores mezclados de borde y transparencia parcial. Redimensiona antes de cuantizar o vuelve a reducir colores después. Las aplicaciones repetidas reducen la imagen ya reducida: dos aplicaciones al 50 % dejan el 25 % de la anchura y altura originales. Usa Deshacer para recuperar detalle en vez de intentar ampliarlo aquí.

### Tamaño físico en 3D

**Tamaño de píxel (XY)** expresa milímetros por píxel, no resolución. Una imagen completamente opaca de 1000 píxeles de ancho a 0,1 mm/píxel mide 100 mm. Reducirla a 500 píxeles con el mismo ajuste da 50 mm. Cambiar a 0,2 mm/píxel recupera los 100 mm, pero no el detalle descartado. Los márgenes exteriores totalmente transparentes se excluyen de la superficie del modelo.

Reducir dimensiones en píxeles disminuye el procesamiento y la geometría. Cambiar solo Tamaño de píxel no elimina píxeles. Consulta [Modo 3D](3d-mode) para los controles de escala física.

## Retocar píxeles

**Pincel**, **Goma**, **Relleno**, **Texto** y **Tomar color de la imagen** usan píxeles de borde duro sin suavizado. Un color personalizado aún puede añadir un color a la paleta; los bordes duros evitan mezclas accidentales en los contornos.

![El pincel añade píxeles de color exacto, la goma los elimina con transparencia, el relleno cambia una región conectada y el texto se convierte en píxeles de borde duro.](31_pixel_tools.svg)

| Herramienta o campo | Funcionamiento | Efecto en la impresión |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Pincel | Arrastra para pintar píxeles opacos. El tamaño es un diámetro de 1 a 64 píxeles, con 4 por defecto. | Repara contornos, une regiones o engrosa detalles. El cursor muestra su superficie. |
| Goma | Usa el mismo tamaño, pero escribe píxeles completamente transparentes. | Quita material de la forma y puede crear agujeros o separar piezas. |
| Relleno | Sustituye la región pulsada que coincida exactamente en RGB y alfa. Las conexiones son por bordes, no diagonales. | Recolorea una región conectada, no todas las apariciones del color. No hay tolerancia fotográfica de color. |
| Tomar color de la imagen | Muestrea un píxel original no transparente y cambia al pincel. | Reutiliza un color de la imagen subyacente, no el efecto de un ajuste sin aplicar. |
| Color de herramienta | Elige de Colores de la imagen, usa el cuentagotas o escribe seis dígitos hexadecimales. Cerrar el cuadro confirma la selección. | Define el color opaco del pincel, relleno o texto. |
| Tamaño de texto | Tamaño de fuente de 6 a 128 píxeles, con 24 por defecto. | Un texto mayor deja detalles mayores a una escala física fija; no es un valor en milímetros. |

### Colocar texto

Selecciona Texto, haz clic en la imagen y escribe. Intro añade una línea. Arrastra el control superior del cuadro para moverlo o el del borde derecho para ajustar el salto de línea. El tamaño y color actualizan el borrador.

Pulsa la marca de verificación o **Ctrl+Intro** (**Comando+Intro** en macOS) para aplicar. Hacer clic en otro punto o cambiar de herramienta también lo confirma. X o **Escape** descarta el borrador abierto; otro Escape sale de la herramienta. El texto aplicado se convierte en píxeles, no en un objeto de texto editable.

Cada trazo modificado, relleno o colocación de texto constituye un paso del historial. Un trazo de un píxel a 0,1 mm/píxel solo tiene 0,1 mm de ancho, por grande que parezca ampliado. Inspecciona las letras finas en el laminador.

## Quitar un fondo

No hay selección automática de sujeto ni eliminación de fondo por IA. Para un fondo liso, abre su muestra en Colores de la imagen, hazla totalmente transparente y aplica. Esto elimina todas las coincidencias exactas, incluidos píxeles del sujeto. Usa Goma para una eliminación local y el cuadriculado para revisar el contorno.

No uses **Eliminar** en la muestra para esto: reasigna colores en vez de volver transparentes los píxeles. Consulta [Colores de la imagen](reducing-colors#image-colors).

## Deshacer, descargar y borrar

**Deshacer** y **Rehacer** recorren cambios confirmados como carga, recorte, redimensionamiento, aplicación de ajustes, cuantización, eliminación de tramado, ediciones de muestras y retoques. No son un historial de cada ajuste o movimiento de deslizador. Una nueva edición borra la ruta de rehacer. El historial pertenece a la sesión actual, así que guarda la imagen si la necesitarás después.

**Descargar imagen** guarda la imagen de trabajo subyacente como PNG a su resolución de píxeles. Excluye zoom, cuadriculado, controles de recorte y borradores de texto. Confirma el texto y **Aplica los ajustes** antes para incluirlos. En escritorio se abre un diálogo de guardado; en navegador depende de los ajustes de descarga.

**Quitar imagen** vacía el espacio de trabajo, no los ajustes. No cuentes con que sea reversible: no añade la imagen borrada como nuevo paso de Deshacer. Descarga una copia antes si necesitas conservarla.

Siguiente: [Ajustes de imagen](image-adjustments).
