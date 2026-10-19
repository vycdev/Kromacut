---
title: Solución de problemas
slug: troubleshooting
order: 90
description: Problemas habituales y qué probar primero.
---

# Solución de problemas

Empieza aquí cuando un resultado parezca incorrecto o un control esté desactivado.

## Un enlace muestra «Página no encontrada»

La dirección puede tener una errata o apuntar a una página que ya no existe. Usa **Abrir Kromacut** para ir a la herramienta, **Ir al inicio** para visitar la página principal o **Explorar documentación** para encontrar la guía actual. Una dirección desconocida de documentación no se sustituye automáticamente por otra guía.

## Generar modelo 3D no actualiza la vista

Los ajustes 3D no se aplican hasta pulsar **Generar modelo 3D**. Cambia los ajustes deseados y vuelve a generar.

## Las instrucciones de cambios están desactivadas

En Manual, las imágenes de más de 64 colores desactivan estas instrucciones. Vuelve a **2D**, usa **Ajustes de cuantización** y reduce a 64 colores o menos. Pintura plana no tiene secuencia manual deliberadamente, porque cada capa puede contener varios filamentos.

## El modelo es demasiado alto

Prueba en este orden:

1. En pintura automática, reduce **Altura máxima** y observa la compresión de las transiciones.
2. En Manual, revisa el número de colores. Muchos colores crean muchos grosores apilados, de modo que el modelo crece naturalmente.
3. Reduce colores en **2D** si no necesitas cada uno como capa separada.
4. En Manual, reduce uno o varios grosores de color.
5. Confirma que **Altura de capa** y **Altura de primera capa** coinciden con el laminador.

## El modelo es demasiado grande en X o Y

Reduce **Tamaño de píxel (XY)** para hacerlo menor. Recorta antes si hay bordes o fondo sin usar.

## La imagen tiene motas o islas diminutas

Usa **Eliminar tramado** después de reducir colores. Si quedan demasiados píxeles aislados, prueba menos colores u otro algoritmo de cuantización.

## La pintura automática parece inexacta

Causas habituales:

- Las distancias de ocultación son estimadas, no calibradas.
- El conjunto de filamentos no cubre bien los colores de la imagen.
- **Altura máxima** comprime demasiado las transiciones.
- El optimizador necesita **Correspondencia de color mejorada**.
- El sujeto importante está en el centro o los bordes, pero **Prioridad regional** está en **Uniforme**.

Calibra los filamentos y consulta **Confianza del resultado** para obtener pistas.

Comprueba por separado **Modelo de apariencia**. Una puntuación global alta no garantiza exactitud física. **Solo estimaciones** o cero recetas de matriz activas significa que no hay mediciones de matriz aplicables. Guardar un perfil calibrado no hace compatible su evidencia con cualquier altura de capa o conjunto modificado. Consulta [Flujos de calibración](calibration-workflows).

## Una opción ha desactivado otra

**Conservar separación de colores** y **Tramado de altura** siguen siendo excluyentes porque asignan los colores originales a las alturas imprimibles de forma distinta. **Malla suavizada** y **Pintura plana** pueden usarse juntas; reconstruye después de cambiar cualquiera de los ajustes. Consulta [Pintura plana](flat-paint) y [Pintura automática](auto-paint).

## La separación de colores no encuentra resultado

El **Límite de correspondencia única** es un máximo estricto de error de color previsto. Con **Exigir una correspondencia única para cada color**, un solo color sin correspondencia rechaza el resultado. Considera reducir la paleta 2D, añadir un filamento útil, permitir más altura de transición o repeticiones o relajar el límite. Desactiva la exigencia estricta solo si aceptas perder colores distintos y fusionar sus regiones. Un modelo anterior puede seguir visible tras el rechazo; no es una generación correcta de los ajustes rechazados.

## Mis ajustes desaparecen en 3D o al descargar

Pulsa **Aplicar** en Ajustes para incorporar el aspecto en directo a la imagen original antes de cuantizar, generar o descargar. La vista ajustada y el original son distintos. Consulta [Ajustes de imagen](image-adjustments).

## Eliminar una muestra no ha quitado sus píxeles

**Eliminar** retira una opción de paleta y reasigna la imagen a los colores restantes. No es una goma. Usa Goma o pon el alfa de la muestra a cero para un recorte. Cuantizar puede volver opacos los píxeles parcialmente transparentes, así que revisa la silueta después.

## Recopilar una traza de diagnóstico de pintura automática

Para investigar a fondo un resultado en escritorio, activa **Registrar diagnósticos de pintura automática** en **Ajustes**, ejecuta un nuevo cálculo y usa **Abrir carpeta** para encontrar la traza `.jsonl`. Activa el registro antes de empezar el cálculo. Generar una malla de un resultado ya calculado no registra ese cálculo anterior. Consulta [Diagnósticos de pintura automática en escritorio](settings-and-controls#desktop-auto-paint-diagnostics) antes de compartir una traza.

## La generación 3D es lenta

Imágenes grandes, muchos colores, muchas capas y malla suavizada aumentan el tiempo. Prueba:

- Recortar la imagen.
- Reducir el número de colores.
- Desactivar **Malla suavizada**.
- Reducir la resolución con **Redimensionar imagen**. Bajar solo Tamaño de píxel hace la misma malla más pequeña, no más sencilla.
- Simplificar las opciones de pintura automática.

## El archivo exportado se abre con colores inesperados

En 3MF, revisa las asignaciones de materiales o filamentos del laminador. Kromacut conserva el color cuando puede, pero los laminadores pueden asignar colores a extrusores de otra forma.

STL no incluye asignaciones de color de filamento. Usa las **Instrucciones de impresión** para los cambios.

La vista Simulados muestra mezclas estimadas; los laminadores suelen mostrar colores físicos. Cambia Kromacut a **Físicos** para revisar las asignaciones y después comprueba las bobinas reales. Ninguna vista demuestra el color final impreso.

## El recorte o las ediciones han ido demasiado lejos

Usa **Deshacer**. Rehacer está disponible si deshaces demasiado.

Siguiente: [Preguntas frecuentes](faq).
