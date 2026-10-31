---
title: Impresión multicabezal
slug: multi-head-printing
order: 65
description: Planifica asignaciones de filamentos, recargas de cabezales y exportaciones 3MF para la impresión multicabezal.
---

# Impresión multicabezal

El modo multicabezal reorganiza la pila imprimible elegida por [Auto-paint](auto-paint). Cada región de la imagen puede usar un filamento distinto en la misma capa. Varios cabezales mantienen los filamentos disponibles entre recargas manuales; el análisis busca mejores coincidencias de color previstas y planifica las recargas necesarias. Puede haber menos pausas, pero no está garantizado.

## Requisitos

- Usa **Auto-paint** con al menos un filamento en su lista y activa el **Modo multicabezal**.
- Elige **2–8 cabezales** y una **Profundidad de búsqueda**, y pulsa **Crear modelo 3D**. El análisis necesita al menos dos filamentos disponibles para formar una ventana útil.

El modo multicabezal y **Flat Paint** se excluyen mutuamente. Calibra los filamentos que realmente tienes; consulta [Teoría de calibración](calibration-theory). El modo, el número de cabezales y la profundidad de búsqueda se recuerdan entre sesiones. Vuelve a crear el modelo tras cambiar los datos.

## Tramos y ventanas

Un **tramo** es un bloque continuo de capas que usan un solo filamento en la pila de Auto-paint. Su grosor procede del resultado imprimible de Auto-paint, incluidas la calibración y las restricciones de altura, no solo del brillo de la imagen original.

Una **ventana** abarca N tramos consecutivos. N está limitado por el número de cabezales elegido, los filamentos disponibles y los tramos por encima del primero, que siempre conserva su filamento; los cabezales que no se necesitan quedan marcados como **VACÍO** en el programa de cabezales. El análisis selecciona ventanas útiles sin solapamientos; no agrupa automáticamente todos los tramos. Los tramos fuera de las ventanas seleccionadas conservan su filamento previsto y se incluyen en el programa de cabezales.

![Tramos de color agrupados en ventanas de ejemplo; los tramos restantes conservan su filamento previsto.](01_window_run_diagram.svg)

## Elección de filamentos por ventana

Con K filamentos distintos en una ventana y N posiciones de tramo, hay **K^N** órdenes posibles, incluidas las repeticiones. El análisis compara las mezclas previstas mediante la diferencia de color **ΔE** y asigna un orden a cada región de color de la imagen. Una posición de tramo no es un cabezal físico fijo: el programa asigna los filamentos necesarios a los cabezales.

![Cambiar el orden de los mismos filamentos cambia la mezcla prevista; los colores son esquemáticos.](03_beer_lambert_blending.svg)

![Los 27 órdenes para tres filamentos y tres posiciones, con una tabla que muestra cómo crece K^N.](05_combo_search_space.svg)

La **Profundidad de búsqueda** controla el umbral de selección de ventanas, cuántas pueden seleccionarse y cuántos órdenes se prueban:

- **Rápido** utiliza menos iteraciones de selección de ventanas y un presupuesto de combinaciones menor.
- **Equilibrado** es el compromiso predeterminado entre esfuerzo y cobertura.
- **Exhaustivo** permite más ventanas y un presupuesto mayor; aun así puede muestrear espacios de búsqueda grandes.

Dentro del presupuesto de cada profundidad se prueban todas las combinaciones. Los espacios mayores usan una muestra limitada y determinista junto con el orden actual. Las mismas entradas producen resultados repetibles. Todas las profundidades consideran los mismos colores de la imagen; una búsqueda más profunda no garantiza una impresión física mejor. Para la agrupación de los colores objetivo, consulta [Agrupación de colores](#color-grouping).

## Agrupación de colores

Antes de la búsqueda, Kromacut agrupa la paleta en los colores objetivo que intentará reproducir. El control **Agrupación de colores** determina cómo:

- **Por capa (actual)** — los colores asignados a la misma capa de impresión en el resultado de Auto-paint se combinan en un único objetivo. Por tanto, tonos diferentes pueden compartir un objetivo. Hay como máximo un grupo objetivo por capa ocupada.
- **Por color (tono)** — los tonos distintos pueden mantenerse como objetivos separados en sus capas de impresión originales. Las paletas grandes se reducen dentro de un límite de grupos, conservando al menos un grupo por capa ocupada; nunca se combinan colores de capas diferentes.

La agrupación por color no garantiza un menor error de color ni más colores impresos. Los resultados dependen de la imagen, la calibración de los filamentos, el número de cabezales y las ventanas seleccionadas. La búsqueda minimiza la diferencia de color CIE76; una puntuación de búsqueda menor puede aun así tener un error CIEDE2000 mayor. La construcción puede tardar más. Los colores imprimibles siguen limitados por los filamentos y sus pilas físicas.

La agrupación de colores se guarda en cuanto la cambias, antes de construir. Reconstruye con cada opción y compara las vistas previas de tu imagen.

## Programa de cabezales y exportación

Tras crear el modelo correctamente, la vista previa muestra el color simulado asignado a cada región. **Colores físicos** muestra el filamento real. Abre las **Instrucciones de impresión** y sigue el **Programa de cabezales**:

- Antes de imprimir, carga cada filamento indicado en su cabezal numerado. Deja sin usar los cabezales marcados como **VACÍO**.
- En cada punto de control de capa indicado, recarga solo los cabezales marcados. Las cargas sin cambios se mantienen; no todos los límites de ventana requieren una pausa.
- Exporta como **3MF** para conservar la geometría distribuida, los colores físicos de los filamentos y las asignaciones de cabezales. El archivo registra el número elegido de cabezales como extrusores y añade marcadores de pausa **M600** en los puntos de cambio del programa. STL no conserva estas asignaciones.

![Tres cabezales mantienen los filamentos sin cambios entre fases; solo las cargas modificadas requieren recargas manuales.](02_nozzle_swap_schedule.svg)

Usa una impresora multicabezal compatible. Antes de imprimir, comprueba en el laminador la asignación de cabezales, las alturas de la primera capa y las capas normales y la gestión de pausas. Un punto de control puede requerir recargar varios cabezales.

## Alternativa y reconstrucción

Si el análisis falla, no encuentra una disposición utilizable que mejore la pila normal o prevé una mejora demasiado pequeña para justificar los cambios de cabezal, se crea un modelo normal de un solo cabezal con un aviso, su color inicial y sus instrucciones de cambio originales. Prueba otros filamentos, otro número de cabezales u otra profundidad y vuelve a crear el modelo.

El análisis se ejecuta en segundo plano. Salir del panel 3D o cambiar de imagen cancela el análisis pendiente; crea el modelo de nuevo para la nueva imagen. Las instrucciones y exportaciones describen el modelo creado: vuelve a crearlo para aplicar ajustes modificados.

Siguiente: [Generación y exportación](generating-exporting-output).
