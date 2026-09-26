---
title: Preguntas frecuentes
slug: faq
order: 100
description: Respuestas breves a las preguntas habituales sobre Kromacut.
---

# Preguntas frecuentes

## ¿Qué es la distancia de ocultación?

La distancia de ocultación, o **HD**, es el parámetro de opacidad con iluminación frontal, en mm, que usa la pintura automática para estimar el aspecto de las capas apiladas. Con un grosor igual a la HD, el modelo básico conserva el 10 % de la influencia del color inferior. El punto en el que deja de verse diferencia también depende del filamento, el color de la base y las condiciones de observación.

Una HD baja indica un filamento más opaco que cubre en menos capas. Una HD alta indica un filamento más translúcido que necesita más grosor.

La HD sustituye a la distancia de transmisión (TD) de versiones anteriores. Puedes introducir una TD convencional de retroiluminación/litofanía mediante el botón de conversión de una fila de filamento. Kromacut la multiplica por 0,1 para obtener una estimación inicial de HD; esta conversión no es una nueva medición física. Consulta [Flujos de calibración](calibration-workflows).

## ¿Debo usar Manual o Pintura automática?

Usa **Manual** para controlar artísticamente el orden de colores y las alturas de capa.

Usa **Pintura automática** si tienes colores reales de filamentos y distancias de ocultación y quieres que Kromacut planifique el apilamiento automáticamente.

## ¿Necesito calibrar los filamentos?

Puedes empezar con distancias de ocultación estimadas. Los valores publicados de distancia de transmisión para tu filamento exacto también sirven de punto de partida: introdúcelos con el botón de conversión, no directamente en el campo HD.

La calibración suele mejorar la pintura automática, sobre todo si no hay valores publicados o el resultado sigue pareciendo incorrecto. Es especialmente útil cuando:

- Un filamento es translúcido.
- Dos filamentos son visualmente similares.
- Quieres resultados repetibles entre proyectos.

## ¿Qué diferencia hay entre colores de paleta y de filamento?

Los colores de paleta son los colores de imagen usados en 2D y en modo Manual.

Los colores de filamento son materiales físicos usados por la pintura automática. Esta puede generar colores virtuales de capas a partir del apilamiento físico, pero el plan exportado sigue basándose en filamentos reales.

## ¿Por qué la vista 3D necesita un botón de generación?

La generación 3D puede ser costosa. Kromacut espera a **Generar modelo 3D** para que un cambio de ajuste no inicie y cancele repetidamente trabajo pesado.

## ¿Puedo exportar sin usar el modo 3D?

Usa 2D para descargar la imagen original actual, incluidas las ediciones aplicadas. Incorpora los ajustes en directo con **Aplicar** antes de descargar. Usa 3D para generar y exportar modelos STL o 3MF.

## ¿La vista previa de capas cambia la exportación?

No. El intervalo de **Vista previa de capas** solo cambia lo visible en la vista previa. Las exportaciones STL y 3MF incluyen el modelo generado completo.

## ¿Qué archivo debo imprimir?

Elige **Descargar STL** para una amplia compatibilidad con laminadores y cambios manuales de filamento.

Elige **Descargar 3MF** si el laminador admite archivos 3MF con colores y quieres conservar objetos de capas coloreados.

## ¿Por qué las alturas son aproximadas?

Los números de capa dependen del laminador, especialmente de la altura de primera capa. Usa los valores de **Instrucciones de impresión** y confirma las capas finales de cambio en la vista previa del laminador.

## ¿Puedo compartir mis ajustes?

Sí. Exporta paletas 2D personalizadas como `.kpal` y perfiles de filamentos de pintura automática como `.kfil`. Los perfiles antiguos `.kapp` se pueden seguir importando.

## ¿Un tamaño de píxel menor sustituye a una boquilla menor?

No. El tamaño de píxel define las dimensiones físicas de los píxeles. Puede crear un trazo más estrecho que la trayectoria de extrusión que puede producir la boquilla. Ajusta **Ancho de línea efectivo** en **Ajustes de impresión 3D**, usa la vista de detalles imprimibles de pintura automática y revisa el resultado laminado. Consulta [Modo 3D](3d-mode).

## ¿Mi calibración sigue siendo válida con otra altura de capa?

No lo des por hecho. Las mediciones HD y la evidencia de apariencia tienen funciones distintas. La evidencia de pruebas y matrices se comprueba respecto a los ajustes y filamentos con los que se registró. Después de cambiar la altura, revisa la evidencia activa e imprime una pequeña muestra de validación. Consulta [Flujos de calibración](calibration-workflows).

## ¿Por qué hay más colores en la vista previa que bobinas?

Las capas finas permiten que el filamento inferior influya en el color visible. Distintos grosores del mismo orden de bobinas producen distintas mezclas previstas. La pintura automática elige entre esos prefijos alcanzables del apilamiento, mientras las piezas exportadas siguen usando filamentos reales. Consulta [Pintura automática](auto-paint).
