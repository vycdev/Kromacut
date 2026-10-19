---
title: Generación y exportación
slug: generating-exporting-output
order: 70
description: Genera el modelo, revísalo, exporta los archivos y copia las instrucciones de impresión.
---

# Generación y exportación

El flujo de exportación empieza cuando la imagen 2D y los controles 3D están listos.

![Prepara imagen y ajustes, genera una instantánea, revísala y exporta todo el apilamiento. Cambiar un ajuste exige otra generación; limitar la vista no limita la exportación.](40_build_export_snapshot.svg)

## Antes de exportar

Comprueba lo siguiente:

1. En 2D, reduce la imagen a un número práctico de colores.
2. En **Ajustes de impresión 3D**, elige las dimensiones con **Tamaño de píxel (XY)**. Haz coincidir **Altura de capa** y **Altura de primera capa** con el laminador, y **Ancho de línea efectivo** con la extrusión prevista para los controles de detalles imprimibles y el tramado de altura.
3. Elige **Manual** o **Pintura automática**.
4. Haz clic en **Generar modelo 3D**.
5. Inspecciona el modelo y la **Vista previa de capas**.

Si aparece una **Advertencia de rendimiento**, la generación puede ser lenta por tamaño de imagen, número de píxeles, capas u otra carga similar. Puedes **Generar de todos modos** o cancelar y simplificar el trabajo.

## Generar modelo 3D

Haz clic en **Generar modelo 3D** cuando quieras que la vista y la geometría exportada reflejen los ajustes 3D actuales.

Durante la generación, Kromacut muestra avances como lectura de capas de color, asignación de colores o construcción de capas. Los controles de exportación vuelven a ser útiles cuando desaparece la superposición y el modelo actualizado está listo.

Calcular un nuevo apilamiento de pintura automática no equivale a generar una nueva malla. La exportación usa el último modelo generado y las instrucciones siguen vinculadas a él. Después de editar la imagen, cambiar de perfil, guardar una calibración o modificar ajustes de impresión, espera al cálculo actual y vuelve a generar antes de exportar. Una vista anterior puede permanecer visible mientras se calculan o rechazan nuevos ajustes; su presencia no demuestra que estos hayan funcionado.

## Elegir STL o 3MF

Abre el menú de descarga 3D y elige:

| Formato | Cuándo usarlo |
| ------ | ------------------------------------------------------------------------------------------ |
| STL | Quieres un modelo de geometría única ampliamente compatible y gestionarás los cambios manualmente. |
| 3MF | Quieres salida con colores para laminadores que conservan varios objetos coloreados. |

La exportación 3MF conserva los colores físicos de los filamentos en pintura automática siempre que sea posible. Revisa igualmente las asignaciones antes de imprimir.

Una vista automática puede mostrar docenas de mezclas hechas con pocas bobinas reales. El 3MF asigna esos filamentos reales a las capas físicas, no un material por mezcla prevista. Por eso, la vista habitual de colores del laminador puede diferir de la vista **Simulados** de Kromacut sin que las asignaciones estén mal. Compara con colores **Físicos** al comprobarlas.

STL no contiene colores de filamento ni asignaciones automáticas de bobinas. Usa el plan copiado con los controles de cambio de color del laminador. Un 3MF sigue siendo un modelo, no G-code listo para ejecutar: elige impresora, boquilla, perfiles, temperaturas y velocidades, y después lamina.

Para **Pintura plana**, el menú solo ofrece 3MF: contiene un objeto por filamento físico y, en la disposición predeterminada boca abajo, un soporte transparente. La disposición opcional boca arriba omite ese soporte. Un STL sin colores de una sola geometría de cualquiera de las placas no sería útil. Ambas orientaciones admiten todas las intensidades de **Malla suavizada**. Reconstruye el modelo después de cambiar la intensidad para aplicarla a la vista previa y a la geometría exportada.

## Instrucciones de impresión

El panel **Instrucciones de impresión** proporciona:

- Perímetros, relleno, altura de capa y primera capa recomendados.
- **Empezar con el color**.
- **Plan de cambios de color** con números de capa y alturas aproximadas.
- Un botón **Copiar** para el plan completo en texto sin formato.

Usa el plan copiado junto a la vista del laminador. Los números dependen de **Altura de capa** y **Altura de primera capa**, así que mantén esos valores coherentes.

![Una primera capa de 0,10 mm seguida de capas de 0,04 mm. El cambio antes de la capa 4 está en la frontera de 0,18 mm, mientras la nueva capa termina a 0,22 mm.](41_swap_layers.svg)

**Cambiar en la capa N** significa que el nuevo filamento imprime la capa N. Por ejemplo, con primera capa de 0,10 mm y capas normales de 0,04 mm, las capas 1, 2 y 3 terminan a 0,10, 0,14 y 0,18 mm. Para empezar el siguiente filamento en la capa 4, cámbialo después de la 3 y antes de extruir la 4. Esa nueva capa termina a 0,22 mm.

Hay que interpretar con cuidado la altura aproximada: Manual muestra la Z superior de la nueva capa, mientras Pintura automática muestra la frontera del cambio de material. Usa el número de capa y comprueba la transición real laminada, no solo una Z que parezca coincidir. Los laminadores pueden etiquetar de forma distinta la capa seleccionada y el punto de inserción.

En pintura plana no hay plan manual de cambios. El panel resume el flujo multimaterial elegido: asigna cada objeto 3MF a su filamento y usa transparente y voltea la impresión predeterminada boca abajo, o imprime boca arriba sin soporte. Ninguna disposición debe reflejarse en el laminador.

## Configuración recomendada del laminador

Kromacut recomienda:

- Perímetros: `1`
- Relleno: `100%`
- Altura de capa: el valor de **Instrucciones de impresión**
- Altura de primera capa: el valor de **Instrucciones de impresión**

Inspecciona siempre la vista del laminador antes de imprimir. Las alturas son aproximadas y los cambios pueden mostrarse de forma distinta según la primera capa.

Mantén la exportación al **100 % de escala Z** y una altura constante igual a la del modelo. Cambiar la escala Z o activar capas variables desplaza las transiciones físicas e invalida el plan. Si necesitas otra altura, defínela en Kromacut y regenera. Cambiar la escala XY también altera los detalles respecto a la boquilla; define el tamaño previsto en Kromacut para que su comprobación use ese tamaño.

Revisa islas pequeñas, texto, recortes transparentes desconectados, fundaciones y disposición de purga/cebado en el laminador. Suavizar contornos no hace imprimible cualquier trazo estrecho. La aplicación no calibra caudal, retracción, temperatura ni mecánica de la impresora.

## Guardar y cancelar

Las exportaciones de escritorio abren **Guardar como**. En navegador siguen sus ajustes de descarga, así que la solicitud de ubicación depende de este. Cancelar un diálogo no envía nada a la impresora. Escribir geometría y comprimir el archivo puede tardar; espera a que termine el guardado antes de cerrar la aplicación.

## Consejos de exportación

- Genera el modelo después de cambiar ajustes 3D.
- No te bases solo en el recorte visible de capas: se exporta el modelo completo.
- Si la malla pesa demasiado para generarla o laminarla, recorta o reduce la resolución en 2D y elimina regiones de color innecesarias. Aumentar **Tamaño de píxel (XY)** agranda los mismos píxeles; no reduce su número ni simplifica la malla.
- Si las instrucciones de cambios están desactivadas por demasiados colores, vuelve a [Reducir colores](reducing-colors#image-colors).

Siguiente: [Ajustes y controles](settings-and-controls).
