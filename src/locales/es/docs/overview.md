---
title: Visión general
slug: overview
order: 10
description: Qué hace Kromacut y cómo encajan sus principales flujos de trabajo.
---

# Visión general

Kromacut convierte una imagen plana en una impresión 3D formada por capas de color apiladas. La idea central es sencilla: los colores de la imagen se convierten en capas físicas, cuyo orden y altura constituyen el plan de impresión.

Usa Kromacut para crear una impresión de estilo HueForge, un relieve de tipo litofanía en color o una pieza decorativa por capas en la que los cambios de filamento forman la imagen final.

## Flujo principal

La mayoría de los proyectos siguen el mismo recorrido:

1. [Carga o importa una imagen](loading-images).
2. [Reduce los colores](reducing-colors) hasta que la vista previa tenga una paleta imprimible.
3. [Elimina el tramado o limpia](dedithering-cleanup) los píxeles aislados si la imagen tiene ruido.
4. Cambia al [modo 3D](3d-mode) y elige Manual o Pintura automática.
5. [Genera y exporta](generating-exporting-output) un archivo STL o 3MF y sigue las instrucciones de impresión.

## Dos formas de pintar

Kromacut tiene dos flujos de impresión en modo 3D.

| Flujo | Cuándo usarlo | Qué controlas |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Manual | Quieres controlar directamente cada color de la imagen. | Orden de colores, grosores por color, ajustes de impresión y cambios. |
| Pintura automática | Quieres que Kromacut planifique el apilamiento físico de filamentos. | Colores de filamentos, distancias de ocultación, altura máxima y opciones del optimizador. |

El modo Manual parte de los colores del panel **Colores de la imagen**. La pintura automática parte de tus filamentos reales y sus valores de **distancia de ocultación (HD)**, y genera capas imprimibles para la imagen.

## Qué aparece en la aplicación

Usa 2D para preparar la ilustración y 3D para planificar las capas físicas. Las siguientes guías siguen esa distinción.

## Guías ilustradas

Empieza por la tarea que quieras realizar. Cada guía explica los controles, sus interacciones y sus consecuencias para la impresión física. Los diagramas son ejemplos esquemáticos, no predicciones de color calibradas. Haz clic en una ilustración o actívala con el teclado para abrirla a tamaño completo.

| Tarea | Guía |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Ajustar dimensiones, alturas de capa y orden manual de colores | [Modo 3D](3d-mode) |
| Elegir filamentos, optimizar mezclas e inspeccionar detalles imprimibles | [Pintura automática](auto-paint) |
| Crear una placa plana multimaterial boca arriba o boca abajo | [Pintura plana](flat-paint) |
| Medir HD, comparar pruebas de paleta o fotografiar una matriz de apilamientos | [Flujos de calibración](calibration-workflows) |
| Preparar la silueta y retocar píxeles | [Cargar imágenes](loading-images) |
| Ajustar tonos y colores y aplicar el resultado | [Ajustes de imagen](image-adjustments) |
| Reducir colores y gestionar paletas | [Reducir colores](reducing-colors) |
| Quitar motas sin confundir limpieza 2D con tramado de altura | [Eliminación de tramado y limpieza](dedithering-cleanup) |
| Revisar el apilamiento terminado y transferirlo a un laminador | [Generación y exportación](generating-exporting-output) |

## Distribución del espacio de trabajo

El espacio de trabajo tiene tres zonas principales:

- La cabecera contiene documentación, controles de tema y enlaces de la comunidad.
- El panel izquierdo contiene los controles del modo actual.
    - En **2D**, muestra ajustes, eliminación de tramado, cuantización, paletas personalizadas y colores detectados.
    - En **3D**, muestra ajustes de impresión, controles manuales, controles de pintura automática e instrucciones de impresión.
- La vista principal muestra el lienzo de imagen 2D o el modelo 3D.

> Consejo: los ajustes 3D no regeneran automáticamente el modelo. Después de cambiar ajustes de impresión, grosores manuales u opciones de pintura automática, haz clic en **Generar modelo 3D**.

## Un buen primer proyecto

Empieza con una imagen de alto contraste, un sujeto claro y poco detalle de fondo. Redúcela a entre 4 y 16 colores y usa el modo Manual si ya conoces el orden de capas, o Pintura automática si tienes distancias de ocultación calibradas.

---

Siguiente: [Inicio rápido](quick-start).
