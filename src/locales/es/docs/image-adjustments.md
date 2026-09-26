---
title: Ajustes de imagen
slug: image-adjustments
order: 35
description: Todos los controles de tono y color, su efecto en los colores objetivo y cuándo aplicar la vista previa a la imagen.
---

# Ajustes de imagen

Los ajustes cambian la imagen objetivo antes de reducir colores. No calibran el filamento, no cambian la distancia de ocultación ni garantizan que un color mostrado sea físicamente imprimible.

Mueve un deslizador para previsualizar su efecto; la vista se actualiza al terminar la interacción. Todos empiezan en cero. Las flechas individuales restablecen un deslizador; el restablecimiento del panel recupera todos.

## Controles de tono y color

![Ejemplos ilustrativos negativos, neutros y positivos para los doce ajustes.](32_adjustment_controls.svg)

_Son tendencias esquemáticas, no predicciones de impresión calibradas. Los efectos dependen del original y de otros ajustes activos._

### Tono

| Deslizador | Intervalo | Valores negativos | Valores positivos | Consecuencia para preparar la impresión |
| ---------- | ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Exposición | −3 a +3 pasos, incremento 0,01 | Oscurece los valores RGB. | Los aclara; +1 duplica los canales hasta recortarlos. | Desplaza los tonos objetivo generales. Este ajuste de imagen renderizada no recupera información RAW recortada. |
| Contraste | −100 % a +100 % | Acerca los tonos al gris medio. −100 % produce gris medio antes de otros ajustes. | Aleja los tonos del gris medio, recortando en negro/blanco. | Separa regiones principales, pero puede aplanar sombras y luces sutiles. |
| Altas luces | −100 % a +100 % | Oscurece las zonas claras. | Aclara las zonas claras. | Cambia los tonos claros que compiten por la paleta; no recupera detalle ausente. |
| Sombras | −100 % a +100 % | Oscurece las zonas de sombra. | Aclara las zonas de sombra. | Puede revelar diferencias oscuras existentes antes de reducir. |
| Blancos | −100 % a +100 % | Oscurece el intervalo más claro. | Aclara el intervalo más claro. | Separa o combina objetivos cercanos al blanco. No es un ajuste de balance de blancos. |
| Negros | −100 % a +100 % | Oscurece el intervalo más oscuro. | Aclara el intervalo más oscuro. | Cambia objetivos cercanos al negro; el negro puro sigue negro porque los valores se multiplican. |

Altas luces/Sombras abarcan intervalos mayores que Blancos/Negros. Se solapan: un píxel muy oscuro puede responder a Negros y Sombras. Los intervalos tonales se evalúan después de Exposición, Contraste, Temperatura/Tinte y ajustes HSL, así que los controles pueden interactuar.

### Color y detalle local

| Deslizador | Intervalo | Valores negativos | Valores positivos | Consecuencia para preparar la impresión |
| ----------- | -------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Saturación | −100 % a +100 % | Reduce la intensidad; −100 % desatura. | Aumenta la intensidad. | Cambia diferencias de color de la imagen, no la gama física del filamento. |
| Intensidad | −100 % a +100 % | Reduce más la saturación en colores relativamente poco saturados. | Aumenta más la saturación en colores relativamente poco saturados. | Menos uniforme que Saturación, pero sin reconocer tonos de piel. El gris puro sigue gris. |
| Matiz | −180° a +180° | Gira los matices en un sentido. | Los gira en el contrario. | Recolorea toda la imagen; edita una muestra para cambiar un color exacto. |
| Temperatura | −100 a +100 | Más frío: menos rojo y más azul. | Más cálido: más rojo y menos azul. | Ajuste aproximado de dominante, **no en kelvin**. |
| Tinte | −100 a +100 | Añade verde. | Añade magenta aumentando rojo/azul y reduciendo verde. | Corrige o introduce una dominante; no es un perfil medido de cámara. |
| Claridad | −100 a +100 | Suaviza el contraste local. | Resalta contraste local y bordes. | Puede crear colores de borde o halos que requieren cuantización. No recupera detalle ni ensancha líneas finas. |

Excepto Exposición y Matiz, los deslizadores usan pasos enteros. El alfa no cambia. La cuantización tiene otro comportamiento: vuelve totalmente opacos los píxeles parcialmente transparentes.

## Vista previa frente a Aplicar

![La vista previa parte de la imagen original. Aplicar incorpora ese aspecto y restablece controles; cuantización, exportación PNG y 3D usan después los píxeles aplicados.](33_adjustment_bake.svg)

**Aplicar** incorpora el aspecto actual a la imagen subyacente, devuelve los deslizadores a cero y crea un paso en el historial. No reduce colores, genera el modelo ni cambia ajustes de impresión.

La distinción importa:

- **Cuantización, Redimensionar imagen, Descargar imagen y generación 3D usan la imagen de trabajo subyacente**, no los ajustes de vista previa sin aplicar.
- **Colores de la imagen** describe los píxeles subyacentes, así que sus muestras no siguen los ajustes en directo.
- Los retoques editan la imagen subyacente; los ajustes activos se reaplican encima.
- Eliminar tramado lee la imagen ajustada. Aplica primero para evitar dejar ajustes activos sobre el resultado procesado.

La secuencia fiable es **previsualizar ajustes → aplicar ajustes → cuantizar → inspeccionar/limpiar → generar 3D**. Recorta y redimensiona antes cuando sea posible.

## Restablecer y Deshacer son distintos

Restablecer retira un ajuste en directo, no una edición ya aplicada. Después de Aplicar, es normal que los controles estén a cero porque su efecto ya forma parte de la imagen. Usa **Deshacer** para restaurar la imagen anterior.

Aplicar repetidamente actúa sobre la imagen ya editada, de modo que el recorte de valores y la pérdida de detalle tonal pueden acumularse. Deshaz primero al comparar alternativas.

Siguiente: [Reducir colores](reducing-colors).
