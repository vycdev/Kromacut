---
title: Controles de pintura automática
slug: auto-paint
order: 62
description: Filamentos, detalles imprimibles, correspondencia de colores, límites de altura y confianza.
---

# Controles de pintura automática

La pintura automática predice capas finas de filamento superpuestas y elige alturas imprimibles para la imagen preparada. Varios colores visibles pueden proceder de distintos grosores de un mismo filamento físico. Veinte colores de imagen no necesitan necesariamente veinte bobinas.

Define [tamaño físico, alturas de capa y ancho efectivo](3d-mode#3d-print-settings), añade filamentos que realmente puedas cargar, espera al cálculo y pulsa **Generar modelo 3D**. Las entradas recalculan automáticamente; la geometría mostrada solo cambia al generar.

## Datos de filamentos

| Control | Qué introducir o hacer | Efecto |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Añadir filamento** | Crea una fila nueva gris neutro. | Añade un material disponible, no una ranura física de impresora. |
| **Muestra / Hex** | Elige el color opaco o escribe hexadecimal. | Cambia mezclas y color exportado. Introduce el color real de la bobina, no el resultado deseado. |
| **Nombre** | Da una etiqueta útil a la bobina. | La identifica. Vacío recupera una etiqueta automática basada en el color. |
| **HD** | Distancia de ocultación frontal, de 0,01 a 2 mm. | Una HD menor oculta antes los colores inferiores. Una mayor requiere grosor y transmite más a igual espesor. |
| **Convertir desde TD** | Introduce una distancia convencional de litofanía/retroiluminación y pulsa **Convertir**. | Convierte aproximadamente TD × 0,1, redondeada a 0,01 mm y limitada al intervalo HD. No conviertas otra vez una HD. |
| **Varita** | Estima la HD a partir del color. | Suposición inicial, no medición. |
| **Insignia de estado** | Revisa **Estimación** o la confianza calibrada; pasa el puntero para ver canales RGB. | Describe evidencia HD de esa fila, no precisión de toda la imagen. |
| **Papelera** | Quita la fila. | El filamento deja de estar disponible. Los perfiles no cambian hasta guardarlos. |
| **Calibrar** | Abre Distancia de ocultación, Prueba de paleta o Matriz de apilamientos. | Registra evidencia física con [Flujos de calibración](calibration-workflows). |

Confirmar una HD, convertir TD o usar la varita borra la calibración HD de esa fila. Cambiar el color de un filamento calibrado desactiva su calibración y usa una estimación derivada del color. Volver al color medido puede reactivar la calibración conservada si no se borró o sustituyó entretanto. Cambiar un nombre no es medir.

El comportamiento medido por canal afecta tanto al color previsto como al grosor de transición. Si cambia material o proceso, no supongas que la vista anterior sigue verificada.

## Perfiles de filamentos

Cargar un perfil sustituye el conjunto de trabajo. **Cambios sin guardar** significa que el conjunto actual difiere del perfil elegido.

| Acción | Resultado |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Guardar cambios en el perfil actual** | Sobrescribe el perfil editable con el conjunto actual. Desactivado si no hay cambios, perfil seleccionado o si es una plantilla. |
| **Guardar como nuevo perfil** | Escribe un nombre no vacío para guardar por separado, incluidas plantillas modificadas. |
| **Renombrar perfil seleccionado** | Cambia su etiqueta sin cambiar filamentos. No disponible para plantillas ni sin selección. |
| **Importar perfil desde archivo** | Lee `.kfil`, `.kapp` antiguo, JSON o CSV/TSV de bobinas HueForge compatibles. |
| **Exportar filamentos actuales como .kfil** | Exporta el conjunto actual. Escritorio abre Guardar como; navegador usa su descarga. Cancelar no cambia calibración. |
| **Eliminar perfil seleccionado** | Quita el perfil guardado. Exporta antes una copia si la necesitas. Las plantillas no se eliminan. |

La evidencia de apariencia pertenece a una configuración exacta. Mientras el perfil seleccionado tenga cambios sin guardar, su evidencia guardada no se pasa a pintura automática. Exportarlos crea otro perfil nombrado sin evidencia incompatible del conjunto antiguo. La calibración HD activa por filamento es distinta de las pruebas y matrices del perfil. Consulta [Compatibilidad de perfiles e importación](settings-and-controls#filament-profile-files).

### Plantillas

Las plantillas de proveedores incluyen colores anunciados, nombres, marcas y HD estimadas. Son de solo lectura. Quita colores que no tengas, calibra y **Guarda como nuevo perfil**. Las referencias no garantizan un lote o condición de observación. Son plantillas no oficiales, no avales del proveedor.

## Correspondencia estándar

Con **Correspondencia de color mejorada desactivada**, Kromacut ordena los filamentos de oscuro a claro por luminancia y calcula transiciones. No sigue el orden de adición. El mapeo imagen-altura también usa luminancia: normaliza el brillo entre los píxeles no transparentes más oscuro y más claro, coloca ese intervalo entre la superficie de fundación y el tope y lo ajusta a capas imprimibles. Dos matices distintos de igual brillo pueden recibir la misma altura, independientemente de su matiz. Repeticiones, separación, tramado de altura y optimizador están inactivos.

Usa esta base sencilla para relieves guiados por brillo. La correspondencia mejorada considera el color al elegir secuencia de materiales y asignaciones imprimibles, por lo que es adecuada cuando importan las diferencias de matiz.

## Altura máxima

Vacía **Altura máxima** o pulsa **Auto** para usar la altura calculada alineada a capas. Admite de 0,5 a 20 mm. Es un techo, no un objetivo; el resultado puede ser más corto.

Un límite entre fronteras válidas se redondea hacia abajo. Si las transiciones normales son demasiado altas, Kromacut las comprime y muestra la altura automática para comparar.

![Los apilamientos automáticos y limitados conservan la fundación opaca mientras las transiciones superiores se acortan.](15_transition_height.svg)

_Esquema. Las bandas identifican secuencias de material, no apariencia mezclada prevista._

La fundación debe alcanzar aproximadamente un 95 % de opacidad en cada canal RGB modelado. Un límite insuficiente rechaza el apilamiento en vez de tratar un respaldo translúcido como opaco. Aumenta el límite o usa un filamento apto para fundación con HD menor.

Comprimir puede quitar colores intermedios útiles. No es escalar uniformemente una imagen idéntica. En **Pintura plana**, el soporte transparente es geometría adicional y su primera capa difiere del relieve. Comprueba dimensiones completas de **Modelo** y grosor del laminador; Altura máxima no incluye el soporte de la placa.

## Detalles imprimibles

Define [**Ancho de línea efectivo** en **Ajustes de impresión 3D**](3d-mode#effective-line-width) al ancho previsto por el laminador, no diámetro de boquilla ni Tamaño de píxel. Los avisos y la limpieza opcional usan el mismo ajuste; sus controles siguen aquí.

Piensa en una **franja morada de dos píxeles** sobre fondo azul. A **0,10 mm/píxel**, mide **0,20 mm**. Si la extrusión prevista mide **0,40 mm**, la franja es más estrecha. Kromacut puede marcarla **en riesgo**, pero la conserva incluso con limpieza. Una región visible fina puede pertenecer a una capa inferior mucho más ancha, y las trayectorias del laminador pueden conservar detalles señalados por este análisis solo de imagen.

![La franja morada de dos píxeles es más estrecha que la extrusión prevista. Ámbar es un aviso, no filamento. La limpieza conserva la franja y solo sustituye una mota rosa encerrada por azul.](13_printable_detail.svg)

_Es una estimación de anchura, no una trayectoria exacta. Las barras comparan anchuras; los cuadrados muestran la imagen de ejemplo._

**Omitir motas de color aisladas** ofrece dos opciones:

- **Desactivado:** conserva todos los píxeles originales en la entrada, incluidas todas las regiones señaladas.
- **Activado:** antes de la correspondencia y generación, sustituye solo colores usados exclusivamente en motas diminutas, compactas y encerradas por el color más ancho circundante. Toda la mota debe ser menor que el ancho efectivo y tener un único color circundante inequívoco con una región más amplia. Si ese color aparece también en una línea o región grande en cualquier parte, se conserva en todas partes.

Se conservan líneas finas, conexiones diagonales, ramas unidas a regiones mayores, detalles del borde y motas junto a transparencia o varios colores. La limpieza nunca convierte un píxel en agujero ni edita la imagen 2D. Es deliberadamente prudente y puede dejar motas indeseadas; usa la [limpieza 2D](dedithering-cleanup) para ediciones más amplias.

Usa **Abrir vista previa** para revisar:

- **En riesgo:** ámbar señala regiones finas junto a colores más amplios; rosa, regiones finas sin vecino mayor. Los demás píxeles se atenúan. Son avisos, no predicciones de imposibilidad de impresión.
- **Resultado:** los píxeles que recibe pintura automática tras la limpieza opcional. No es vista del laminador ni garantía de imprimibilidad.
- **Señalados / aptos / omitidos:** fracción de avisos, píxeles que cumplen las reglas y número realmente reemplazado. **Píxeles señalados conservados** cuenta explícitamente los avisos que no cambian la imagen.

Al omitir colores aptos, la imagen limpia se usa para contar objetivos y planificar el apilamiento. Quitar un color completo puede cambiar elecciones en otros lugares, así que revisa el resultado regenerado. Un porcentaje de aviso no nulo con **0 píxeles omitidos** significa que se ha conservado todo el detalle.

Tras cambiar la opción, deja terminar el cálculo y pulsa otra vez **Generar modelo 3D**. El análisis mide regiones conectadas de colores originales, no capas físicas, paredes, relleno ni extrusión de ancho variable. Revisa siempre las trayectorias. Si realmente pierden detalle, aumenta el tamaño XY, engrosa el detalle en 2D o elige un ancho menor compatible con impresora y laminador.

## Correspondencia de color mejorada

Busca secuencias de materiales para la paleta 2D actual. Puede omitir filamentos sin cobertura útil. Ocho bobinas disponibles no tienen por qué producir ocho secuencias.

El optimizador no reduce otra vez en secreto la paleta preparada. Más colores originales requieren más trabajo. Prepara la imagen en [Reducir colores](reducing-colors) y valora después la apariencia alcanzable en 3D.

Desactivar la mejora también desactiva separación y tramado de altura. Los cálculos nuevos cancelan los anteriores; el progreso es aproximado. Un fallo no recurre a un apilamiento manual sin relación. Un modelo anterior puede seguir visible hasta generar un resultado nuevo válido.

### Límite total de repeticiones

Elige **Desactivado**, o hasta **2, 4, 6, 8 o 12 apariciones adicionales** para todo el apilamiento. No es un límite por filamento ni un número exacto de cambios. Negro → amarillo → negro usa una aparición adicional de negro. Volver a un material sobre otro sustrato crea otra posible ruta de mezcla.

![Presupuesto compartido de repeticiones y asignaciones distintas comparados con la fusión de colores descartados.](14_repeats_separation.svg)

_Secuencias y asignaciones conceptuales, no predicciones de materiales._

Más repeticiones permiten una búsqueda más amplia y posiblemente más cambios al imprimir. El presupuesto es un techo. Las secuencias innecesarias pueden omitirse.

### Conservar separación de colores

La correspondencia normal puede asignar colores distintos al mismo resultado. Activa **Conservar separación de colores** cuando importen esas distinciones, como letras contra fondo o tonos contiguos de una cara.

El **Límite de correspondencia única (ΔE)** es la diferencia máxima estricta para que un color posea un resultado imprimible distinto. Intervalo: 1 a 100; defecto: 6. Valores menores exigen coincidencias más cercanas y difíciles. Valores mayores permiten más error, no mejores filamentos físicos.

**Exigir una correspondencia única para cada color** está activado por defecto. Las asignaciones incompletas fallan. Desactívalo para una **paleta parcial**: los colores sin coincidencia pierden su salida propia y se fusionan con las asignaciones supervivientes. La imagen sigue llena, pero pierde diferencias. Si ningún color es apto, incluso el modo parcial falla porque no queda nada con lo que fusionar.

El optimizador maximiza primero colores conservados y cobertura de la imagen. Después prefiere menos repeticiones, menos secuencias y menos capas físicas, antes que menor error dentro del límite. Las repeticiones se exploran progresivamente y la búsqueda puede detenerse cuando todos los colores se conservan. Una comprobación final elimina secuencias individuales que no mejoran esas prioridades.

Ante un fallo estricto, considera menos colores 2D, más altura o repeticiones, otro filamento adecuado, un límite ΔE mayor o fusión parcial. Elige el compromiso deseado en vez de subir un límite solo para descartar el error.

La separación y el **Tramado de altura** son excluyentes. Activar uno desactiva el otro.

## Tramado de altura

Puede distribuir el error de redondeo en bloques pequeños a alturas imprimibles vecinas cuando la entrada contiene alturas entre fronteras disponibles. Esas diferencias pueden sugerir tonos intermedios a distancia. Requiere correspondencia mejorada y actúa sobre el mapa de alturas exportado, no la imagen 2D.

![Mecanismo con alturas fraccionarias: ajuste directo frente a distribución del error entre alturas imprimibles cercanas.](16_height_dithering.svg)

_Mecanismo esquemático, no un antes/después garantizado. Distintos topes no significan más colores de bobina._

Muchas asignaciones actuales ya eligen una capa discreta antes de este paso. Esas regiones no tienen error fraccionario que distribuir y pueden no cambiar al activar el tramado. Comprueba en la vista regenerada y el laminador si esta imagen concreta gana variación; activar la opción no garantiza más tonos ni puntos visibles.

El tamaño del punto sigue el **Ancho de línea efectivo** de **Ajustes de impresión 3D** respecto al **Tamaño de píxel**, redondeado a un bloque entero. Es aproximado, no una garantía exacta de anchura mínima. Los bordes evitan el mismo tratamiento para reducir artefactos. Revisa islas diminutas y desplazamientos extra en el laminador.

Cuando hay error fraccionario, redistribuirlo puede ayudar a tonos amplios y a la vez dar ruido a gráficos pequeños o hacer la geometría más pesada. No añade gama ausente ni valida calibración sin respaldo. Si crea muchas zonas pequeñas, combinarlo con Pintura plana puede ser especialmente costoso porque comparten cada capa de superficie completa.

## Ajustes del optimizador

![Prioridad uniforme, central y de bordes en la misma imagen, con detalle de transición creciente como más alturas posibles.](18_optimizer_choices.svg)

_Pesos y opciones esquemáticos, no colores medidos ni cantidades exactas de capas. Las zonas atenuadas reciben menos prioridad; no se eliminan._

| Control | Opciones y efecto |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Algoritmo** | **Rápido:** búsqueda menor y más rápida. **Equilibrado:** predeterminado general. **Exhaustivo:** refinamiento más profundo con varios inicios. **Profundo:** búsqueda más amplia y costosa. **Orden base exacto:** enumera órdenes aplicables sin repetición. |
| **Prioridad regional** | **Uniforme:** igual peso por píxel. **Centro:** favorece colores centrales. **Bordes:** favorece colores periféricos. Cambia prioridades, no recorte ni extrusión. |
| **Detalle de transición** | **Compacto (80 %)**, **Detallado (90 %, defecto)** y **Máximo (95 %)** fijan opacidades finales. Valores mayores permiten transiciones más altas y más colores intermedios, sujetos a convergencia anticipada y límite de altura. |
| **Semilla (opcional)** | **Automática** usa una semilla estable derivada de las entradas. Introduce un entero para comparar otra búsqueda determinista; vacía para recuperar automática. No es un deslizador de calidad. |

El detalle afecta a las transiciones superiores, no a la exigencia de fundación opaca. No aumenta resolución ni reduce ancho de línea. Los colores añadidos pueden no ayudar a esta imagen.

Con la misma semilla, los niveles heurísticos superiores conservan el mejor resultado del inferior. Sigue siendo optimización de predicciones. El orden base exacto comprueba 109 600 órdenes no vacíos con ocho filamentos y 986 409 con nueve. Las repeticiones usan refinamiento separado, no una demostración exhaustiva de todos los apilamientos repetidos.

## Zonas de transición y confianza

| Indicador | Interpretación |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zonas de transición** | Secuencias físicas con inicio, final y grosor. Las insignias de compresión indican menos grosor del ideal. |
| **Altura total / capas físicas** | Dimensiones calculadas, no número de colores de imagen o bobinas. |
| **Estado de separación** | Colores conservados y fusionados, capacidad, peor ΔE conservado y repeticiones. Los objetivos fusionados no son coincidencias correctas fuera del límite. |
| **Modelo de apariencia** | Indica si la predicción se apoya en simulación, comportamiento ajustado, comparaciones locales o matriz. Un número de medidas no significa que cada resultado se haya medido. |
| **Confianza de predicción: media / mínima** | Respaldo de colores realmente asignados. La media ponderada puede ocultar una región débil que revela el mínimo. Los recuentos distinguen mediciones, interpolación, ajuste y simulación. |
| **Confianza del resultado** | Combina calibración HD, cobertura y compresión. No es un porcentaje medido de exactitud ni equivale a confianza de predicción. |
| **Calibración / Cobertura / Compresión** | Calidad de evidencia HD, cobertura de colores originales e impacto del límite de altura. Valores altos no certifican la impresión. |
| **Puntuación de calidad** | Comparación del optimizador, no medición. En separación no estricta incompleta pasa a **Paleta parcial**. |
| **Iteraciones / Acierto de caché** | Trabajo de búsqueda y reutilización. Más iteraciones no prueban mejor color. |
| **Óptimo exacto / Mejor encontrado** | Comparación exhaustiva aplicable sin repetición frente a refinamiento heurístico o repetido. Ninguno demuestra exactitud física. |
| **Ninguna secuencia eliminable** | No se puede quitar una sola secuencia conservando las prioridades. Otro reordenamiento de varias podría ser mejor. |

La evidencia se debilita lejos de mediciones, si observaciones cercanas discrepan o si las predicciones de validación fallan. La correspondencia normal puede incluir un coste acotado de incertidumbre. La separación usa ΔE bruto para admisibilidad, así que la incertidumbre no valida un color fuera del límite.

Tras cambiar proceso o altura de capa, revisa este resumen. Una puntuación general alta no significa que toda receta nueva esté respaldada. Consulta [Flujos de calibración](calibration-workflows).

## Sugerir el siguiente filamento

**Sugerir el siguiente filamento** aparece cuando hay un resultado. Busca un color hipotético que mejore la cobertura. No es un anuncio de producto ni una bobina ya cargada.

| Campo o acción | Significado |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Muestra hexadecimal** | Color opaco sugerido. |
| **ΔE estimado +… %** | Reducción estimada del error medio de imagen considerando mezclas si se añade. Mayor es mejor; no es confianza. |
| **HD** | Estimación inicial tomada del filamento existente perceptualmente más cercano. No está medida para un producto. |
| **Captura** | Porcentaje de píxeles cuyo error estimado mejora. |
| **Aislamiento** | Distinción respecto a filamentos actuales de 0 a 1. Mayor indica un hueco de cobertura más separado. |
| **Añadir a filamentos** | Añade una fila de trabajo llamada `Kromacut-Suggestion-…` y recalcula. |

Busca una bobina real si la sugerencia sirve y después introduce su color y calibración. No imprimas suponiendo que la fila hipotética ya está disponible. Las sugerencias se restablecen si cambian colores o filamentos. Si no hay candidato, el conjunto actual ya cubre bien la imagen según esta prueba aproximada.

Siguiente: [Pintura plana](flat-paint), [Flujos de calibración](calibration-workflows) o [Generación y exportación](generating-exporting-output).
