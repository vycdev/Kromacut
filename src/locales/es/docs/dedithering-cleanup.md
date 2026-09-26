---
title: Eliminación de tramado y limpieza
slug: dedithering-cleanup
order: 50
description: Limpieza del vecindario por colores exactos y sus efectos sobre motas, bordes, transparencia e islas imprimibles.
---

# Eliminación de tramado y limpieza

**Eliminar tramado** sustituye los píxeles con poco apoyo local por colores vecinos. Es una pasada de limpieza independiente, no un algoritmo de cuantización ni una simulación de lo que puede imprimir la boquilla.

Úsala en patrones tramados de colores repetidos o imágenes reducidas con motas aisladas. Puede funcionar antes de cuantizar si el original ya contiene esos patrones, o después sobre regiones reducidas. No es un filtro de reducción de ruido fotográfico: los píxeles vecinos de una foto suelen tener colores exactos ligeramente distintos.

## Cómo se elige un píxel

![Los ocho píxeles vecinos votan por color exacto. El peso define cuántos vecinos iguales hacen falta para conservar el centro; cada pasada usa el resultado anterior.](36_dedither_neighbors.svg)

Cada píxel comprueba sus ocho vecinos inmediatos, incluidas las diagonales. Si suficientes coinciden exactamente en **RGB y alfa**, se conserva. Si no, adopta el color diferente más frecuente del vecindario. Los empates se resuelven al azar, por lo que los mismos ajustes no tienen por qué producir ejecuciones idénticas.

Solo se usan colores vecinos existentes, incluidos píxeles transparentes. No se promedian para crear una nueva tonalidad.

## Peso

El **Peso** es el número de vecinos iguales necesario para conservar el píxel original. Intervalo: **1 a 9**; valor predeterminado: **4**.

| Ejemplo | Resultado |
| ------------------------------------ | ------------------------------------------------------------ |
| Ningún vecino igual | Cambia si existe otro color vecino, incluso con peso 1. |
| Tres vecinos iguales | Se conserva con peso 3; puede sustituirse con peso 4. |
| El centro y los ocho vecinos coinciden | Se conserva incluso con peso 9 porque no existe ningún vecino distinto. |

Los valores bajos tienden a conservar detalles; los altos permiten sustituir más píxeles. Con solo ocho vecinos, el peso 9 nunca alcanza el umbral de conservación. Es un ajuste agresivo de bordes, no un radio mayor. Los píxeles del borde también tienen menos vecinos disponibles.

## Pasadas

**Pasadas** repite la limpieza entre **1 y 10** veces, con **1** por defecto. Cada pasada lee el resultado anterior completo. Más pasadas pueden quitar motas persistentes, pero también mover bordes, romper conexiones estrechas o borrar texto pequeño.

Las flechas de restablecimiento de cada campo recuperan peso 4 o pasadas 1. El restablecimiento del panel recupera ambos. Ninguno restaura la imagen anterior; usa Deshacer para eso.

## Aplicar e inspeccionar

1. **Aplica** primero los ajustes activos. Eliminar tramado lee la vista ajustada; incorporarlos antes evita dejar ajustes en directo activos sobre el resultado limpio.
2. Empieza con una pasada. El peso predeterminado es 4; prueba valores menores si importan los detalles finos.
3. Haz clic en **Aplicar** y examina contornos, letras y bordes transparentes con mucho aumento.
4. Deshaz antes de comparar otro ajuste con la misma imagen inicial.

Pulsar Aplicar repetidamente sigue limpiando la imagen ya limpiada. No son comparaciones independientes con el original.

## Efecto en la impresión

Quitar píxeles aislados de otro color puede eliminar islas diminutas, pero también detalles deseados. El alfa participa en la votación, así que la limpieza puede ampliar o reducir la silueta y abrir o cerrar agujeros.

Trabaja en **píxeles de imagen**, no en milímetros. Un detalle de tres píxeles a 0,1 mm/píxel ocupa 0,3 mm antes de las decisiones posteriores de malla o laminado. Esta herramienta no tiene un parámetro de diámetro de boquilla. Usa los [controles 3D de detalles imprimibles](3d-mode) y la vista previa del laminador para comprobar los detalles físicos.

## Eliminar tramado frente a tramado de altura

| Herramienta | Dónde | Qué cambia |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| Eliminar tramado | 2D | Las regiones de color exacto y, posiblemente, el contorno transparente de la imagen original. |
| Tramado de altura | Pintura automática en 3D | El patrón de alturas de superficie generado para aproximar colores objetivo. |

Usar una no activa la otra. No apliques la eliminación de tramado si quieres conservar arte de píxeles o punteado intencionado.

Siguiente: [Modo 3D](3d-mode).
