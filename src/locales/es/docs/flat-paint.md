---
title: Pintura plana
slug: flat-paint
order: 64
description: Relieve escalonado, soportes transparentes boca abajo y placas expuestas boca arriba.
---

# Pintura plana

**Pintura plana** es una disposición de pintura automática disponible con correspondencia estándar o mejorada. Crea una placa de grosor constante en lugar de un relieve escalonado. Cada capa cubre toda la superficie del modelo, y distintos materiales pueden compartir una capa uno junto a otro.

Usa un flujo multimaterial como AMS, CFS o un cambiador de herramientas con un laminador compatible. Un cambio manual de filamento a una altura no puede aportar varios materiales uno junto a otro en esa capa.

![Secciones que comparan relieve normal, pintura plana boca abajo con soporte transparente y pintura plana boca arriba sin soporte.](17_flat_paint_orientation.svg)

_Secciones conceptuales. Los colores identifican materiales; las etiquetas indican la cara de observación._

## Predeterminado: boca abajo con soporte transparente

Activa **Pintura plana** y deja desactivado **Boca arriba, sin capa transparente**.

1. El soporte transparente se imprime primero y se convierte en la cara lisa de observación contra la placa. Asigna su objeto a filamento transparente.
2. Las columnas de la ilustración invierten su orden normal de materiales para verse desde abajo. El material de fundación rellena por detrás las columnas más cortas.
3. Exporta **3MF** y conserva la orientación. La ilustración ya está reflejada; no vuelvas a reflejarla en el laminador.
4. Tras imprimir, da la vuelta a la pieza para verla a través del soporte.

El texto puede parecer invertido desde la parte trasera en el laminador. Comprueba la cara prevista de observación. Orbita por debajo de la vista de Kromacut para examinarla.

El soporte es geometría adicional que requiere filamento transparente real. La transparencia en pantalla no mide la claridad del filamento ni el acabado de la placa. Comprueba el grosor total en la insignia **Modelo** y en el laminador, no solo en **Altura máxima** de pintura automática.

## Boca arriba, sin capa transparente

Activa esta opción para retirar el soporte transparente:

- Cada columna mantiene el orden normal de materiales de abajo arriba.
- El material de fundación rellena por debajo las columnas cortas, alineando los colores visibles en una superficie superior plana.
- No hay objeto de soporte ni se necesita filamento transparente.
- Imprime boca arriba tal como se exporta, sin reflejar, y observa la parte superior expuesta sin voltear la pieza.

Estas disposiciones tienen geometrías distintas. Vuelve a pulsar **Generar modelo 3D** al cambiar la opción. Dar la vuelta a una exportación antigua no la convierte entre disposiciones.

## Comparar los flujos

| Flujo | Cara de observación | Geometría | Asignación en el laminador |
| ------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------------- |
| Pintura automática normal | Parte superior escalonada | Las columnas cortas terminan antes. | Secuencias de materiales físicos por altura. |
| Pintura plana predeterminada | Parte inferior a través del soporte | Columnas reflejadas e invertidas con fundación detrás. | Objetos por filamento y soporte. |
| Pintura plana boca arriba | Parte superior plana expuesta | Orden normal con fundación bajo columnas cortas. | Objetos por filamento; sin soporte. |

**Malla suavizada** funciona con ambas orientaciones de Pintura plana. Elige una intensidad y reconstruye. El suavizado ablanda la silueta exterior y los límites compartidos entre colores, conservando la placa plana, las alturas de capa y las pilas de materiales. Pequeñas uniones compartidas cierran los contactos diagonales sin solapamientos. Las instrucciones de impresión y el 3MF registran la intensidad utilizada.

## Exportar y comprobar

Solo se ofrece **3MF**. Un STL sin colores perdería la disposición significativa de materiales y dejaría una placa. Los objetos se agrupan por filamento real, no por cada color mezclado previsto.

1. Haz coincidir las alturas de capa normal y primera capa con Kromacut.
2. Mantén la escala y orientación exportadas. No añadas otro reflejo.
3. Asigna correctamente cada objeto, incluido el filamento transparente del soporte predeterminado.
4. Inspecciona capas individuales del laminador para comprobar las regiones contiguas y la integridad de la placa.
5. Confirma la dirección del texto desde la cara prevista y revisa cambios y tiempo de impresión.

**Instrucciones de impresión** sustituye la lista de cambios manuales por indicaciones multimaterial específicas de la disposición. **Vista previa de capas** tiene una pista lisa porque cada capa puede contener varios materiales. Sus límites siguen afectando solo a la inspección, nunca a la exportación completa.

## Coste y detalle

Una cara plana no implica una impresión más sencilla. Rellenar toda la superficie en cada capa añade material y geometría frente al relieve. Las capas finas, los apilamientos altos y el **Tramado de altura** pueden producir muchas regiones pequeñas, más desplazamientos y una generación, exportación o laminado más lentos.

Kromacut avisa antes de generar trabajos grandes de pintura plana. **Generar de todos modos** acepta esa carga; no certifica la idoneidad de la impresora. Prueba una pieza pequeña si el material o acabado no está verificado. La pintura plana conserva la disposición óptica prevista de las columnas, pero sigue dependiendo de materiales calibrados y un proceso de impresión correspondiente.

Siguiente: [Generación y exportación](generating-exporting-output).
