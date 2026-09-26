---
title: Teoría de calibración
slug: calibration-theory
order: 62
description: La óptica y las matemáticas de la calibración por distancia de ocultación, prueba de paleta y matriz de apilamientos.
---

# Teoría de calibración

Kromacut tiene tres herramientas complementarias. **Distancia de ocultación** mide la opacidad física de cada filamento. **Prueba de paleta** pide ordenar unos pocos candidatos impresos para colores importantes de un trabajo. **Matriz de apilamientos** fotografía muchas recetas físicas conocidas y registra sus colores observados. Todas alimentan el mismo modelo de pintura automática, pero responden a preguntas diferentes.

Para controles paso a paso, guardado y compatibilidad de ajustes, consulta [Flujos de calibración](calibration-workflows). Para el resto del espacio de impresión, consulta [Modo 3D](3d-mode).

## Por qué se mezclan las capas finas

Una impresión se observa con luz frontal: la luz entra por arriba, atraviesa el filamento, se refleja debajo y vuelve a salir. Una capa fina solo oculta parcialmente lo inferior, así que el color visible mezcla el color propio y el que se transparenta. La pintura automática usa esta transmisión residual para crear tonos intermedios con pocos filamentos, por eso la HD debe ser precisa.

![Las capas finas sobre base negra solo la ocultan en parte; cada capa multiplica la transmisión residual hasta alcanzar el color opaco del filamento.](06_frontlit_hiding_distance.svg)

Kromacut modela la transmisión residual mediante Beer-Lambert. Un grosor `d` transmite

```
T = 10^(−d / HD)
```

del color inferior. Cada capa añadida multiplica esa transmisión, por lo que la opacidad se alcanza geométricamente. La velocidad es una propiedad del material: un negro denso oculta en una fracción de milímetro; un blanco translúcido puede necesitar diez veces más. Esa velocidad es la distancia de ocultación.

La distancia de transmisión de las fichas de bobinas o de pruebas TD retroiluminadas describe luz que atraviesa el filamento _una sola vez_, como en litofanías. La observación frontal atraviesa la capa dos veces y la lee contra reflexión, por lo que una TD convencional es aproximadamente diez veces la HD. Kromacut acepta TD como entrada mediante el botón de conversión, pero almacena y simula con HD.

## La cuña

Medir color con cámara es poco fiable: las cámaras corrigen automáticamente, las pantallas difieren y la iluminación cambia. La cuña evita juzgar un color aislado. Cada pieza imprime casillas de 1 a N capas sobre una base, con una **franja de referencia** del mismo filamento completamente opaca al lado y una pestaña que marca el extremo de una capa.

![Cuña de calibración: casillas numeradas con cada vez más capas junto a una franja opaca; se indica la primera casilla idéntica a la franja.](07_calibration_wedge.svg)

Indicas la **primera casilla que parece idéntica a la franja contigua**. La franja es el color opaco del propio filamento a milímetros de distancia bajo la misma luz, así que la comparación es válida entre habitaciones, pantallas e impresiones. Las casillas finas muestran la base; en cierto punto la diferencia cae por debajo de lo distinguible y ese número es la medición.

## De una lectura a una distancia de ocultación

La casilla indicada marca el grosor en el que la transmisión bajó de una **diferencia apenas perceptible (JND)**: la mínima diferencia visible de color, unos 2 ΔE00 en observación cotidiana.

Kromacut resuelve a la inversa. Para el color del filamento sobre la base calcula `T*`, la transmisión que deja la mezcla exactamente a una JND del color opaco. `T*` depende solo de esos dos colores y la JND, sin una constante de opacidad ajustada a mano. La lectura da el grosor donde se alcanzó ese punto, `d* = casilla × altura de capa`, y al invertir Beer-Lambert resulta:

```
HD = −d* / log10(T*)
```

![Al apilar capas disminuye la diferencia entre casilla y franja; la lectura fija el cruce de una JND y la inversión de la ley da la distancia de ocultación.](08_opacity_solve.svg)

Importa el contraste de base: un filamento negro sobre negro nunca difiere de su franja en una JND completa, así que no hay nada que medir. El asistente lo detecta y asigna bases más claras a filamentos oscuros.

## Evidencia de prueba de paleta

Una prueba compara prefijos realmente impresos con colores de la ilustración actual. Kromacut conserva receta física, predicción HD original, color objetivo y cada respuesta. Una hoja aporta así dos tipos de evidencia sin fingir que cada elección es una medición exacta.

**Mejor disponible** apoya la receta elegida y rechaza alternativas no elegidas cerca del objetivo, sin forzar que la casilla equivalga al color objetivo. **Cercana** añade una corrección local parcial. **Exacta** añade la corrección más fuerte y conserva el sufijo opaco exacto probado como referencia directa. Cada casilla empatada seleccionada recibe apoyo. **Ninguno** rechaza candidatos plausibles cercanos sin inventar una dirección de corrección.

Los efectos son locales tanto en recetas físicas como en colores. Al comparar recetas cuentan más las capas recientes y ópticamente dominantes; mover el mismo filamento a otro lugar de la parte reciente da menor coincidencia. La evidencia también se desvanece al alejarse el color simulado o el objetivo del color evaluado. Varias recetas similares que pierden repetidamente cerca de verdes refuerzan una advertencia local para apilamientos verdes próximos, dejando intacta una receta roja sin relación.

Las correcciones Cercana y Exacta alimentan los mismos colores Lab usados para puntuar y mostrar el resultado final. El apoyo y rechazo añaden una preferencia acotada sensible al objetivo, de modo que la evidencia repetida puede romper un empate numérico sin superar el error real ni las referencias exactas. El ajuste global de luminosidad/croma sigue separado y debe superar su validación con datos reservados. La evidencia local y las referencias Exacta pueden seguir siendo útiles aunque ese ajuste se descarte; todos los parámetros derivados se reconstruyen determinísticamente desde valoraciones brutas guardadas.

## Calibración con matriz de apilamientos

La matriz empieza como una medición tipo LUT, no otra resolución de cuña de opacidad. Las placas nuevas muestrean recetas útiles de distintas longitudes hasta un límite físico de grosor de color, manteniendo la altura normal elegida en cada capa de esa zona. Un límite de 0,40 mm con capas de 0,04 mm permite hasta diez capas de color. La fundación es una sola capa a la altura efectiva inicial, no una placa dimensionada por opacidad estimada. Con primera capa de 0,10 mm, el ejemplo mide 0,50 mm y tiene once capas en total.

Las recetas cortas reposan sobre capas adicionales del mismo respaldo dentro de la zona de color, para que todas terminen a la misma Z sin exceder el límite. Ese respaldo extra se registra separado de la receta útil al aplicar mediciones. Una fundación fina no está garantizada como opaca: usa filamento opaco y un fondo fotográfico plano y constante. El respaldo impreso debe ocultar realmente el sustrato antes de considerar ópticamente neutro el relleno añadido. Las placas antiguas mantienen grosores y mapa de celdas originales.

El espacio de recetas crece exponencialmente, así que la planificación usa un conjunto determinista acotado de secuencias puras, transiciones ordenadas y recetas exploratorias más largas en las profundidades permitidas. Las HD guardadas predicen sus colores. Las matrices compatibles terminadas aportan cobertura medida e historial de recetas impresas. La selección favorece huecos de color y nueva cobertura de grosor/transición, con exploración orientada por apoyo débil o errores anteriores. Estos valores de adquisición son heurísticos, no intervalos de incertidumbre calibrados. Algunas referencias se repiten a propósito para comprobar consistencia; planes sin imprimir y fotos incompatibles o no aceptadas no cierran huecos de cobertura.

El presupuesto de cambios incluye referencias de esquina y limita el uso de materiales capa por capa. No estima tiempo ni volumen de purga, y el laminador puede añadir cambios. Un límite mayor puede costar más incluso con pocas celdas. Las placas nuevas agrupan recetas similares en regiones más continuas para reducir fragmentación de trayectorias; reordenarlas no reduce los materiales necesarios por capa. Las antiguas mantienen la selección original exhaustiva a profundidad fija o por gama HD, y pueden aportar evidencia compatible sin reescribirse.

La matriz se imprime boca arriba para que fundación, primera capa y recetas sigan el orden físico de una generación normal. Cuatro recetas de esquina identifican orientación y transformación de perspectiva. Fotografía la cara con luz frontal difusa. Kromacut estima la placa y permite arrastrar cuatro controles numerados al centro de los marcadores con una cruz ampliada. Una cuadrícula proyectada exacta y una vista rectificada en directo muestran errores de perspectiva, inclinación y sesgo antes de muestrear una zona central interna en las coordenadas proyectivas de cada celda. Ese margen individual evita bordes incluso si la perspectiva estrecha mucho un lado. La alineación manual o de baja confianza exige confirmación explícita y guarda confianza y revisión con las medidas. El muestreo bruto es el valor prudente por defecto. La corrección opcional de marcadores estima una ganancia de iluminación por canal desde las cuatro recetas conocidas; puede reducir dominantes, pero también ocultar una diferencia real dependiente de la luz.

Una matriz terminada guarda colores sRGB previstos y fotografiados junto a recetas físicas inmutables en el perfil. Todas las matrices compatibles reajustan conjuntamente un modelo físico efectivo sin tocar muestras guardadas, calibración HD ni medidas brutas. El ajuste trata esos valores como supuestos previos regularizados y usa cada muestra ponderada para estimar HD efectiva por canal RGB, color opaco efectivo, exponente no lineal de transmisión para secuencias contiguas de un filamento e interacción ordenada con el sustrato inferior. Con poca evidencia se mantienen los supuestos originales; el modelo ajustado solo se usa con muestras suficientes y si mejora el ΔE de matrices reservadas sin empeorar la cola de errores. Una interacción ajustada se usa hasta el mayor grosor contiguo de esa pareja observado. El grosor extra no medido continúa desde el color respaldado hacia la muestra nominal con el supuesto de cuña/HD adecuado al sustrato; no cambia toda la secuencia a otra predicción ni extrapola indefinidamente el exponente. El mismo cálculo de prefijos alimenta puntuaciones, comparaciones y vista previa, incluidos apilamientos comprimidos y ajustados a capas.

El ajuste compara colores simulados con sRGB fotografiado mediante una medida robusta de error, mientras la mezcla física sigue en luz lineal. Así las diferencias en canales oscuros pesan lo suficiente. Las penalizaciones previas se promedian por familia de parámetros sobre materiales realmente presentes en el entrenamiento; añadir bobinas sin usar no debilita ni desactiva el ajuste. La validación sigue decidiendo su uso. Mejor concordancia en recetas conocidas no demuestra precisión en parejas nunca medidas.

Las matrices compatibles también permanecen como LUT empíricas dispersas en Lab previsto y recetas físicas, de modo que una placa reciente poco densa no borra recetas anteriores. Kromacut pondera cada placa por confianza de alineación revisada, cobertura, antigüedad y concordancia robusta con recetas medidas por al menos otras dos placas. Con solo una o dos observaciones, la concordancia es neutra porque no hay evidencia para identificar un valor atípico. Una receta exacta a profundidad fija combina directamente sus observaciones Lab fotografiadas. Una ausente combina interpolaciones deterministas por distancia inversa de Lab fotografiado próximo, ponderando el orden físico hacia las capas superiores dominantes. Solo se interpola dentro de la cobertura local de Lab previsto de cada matriz y un vecindario de recetas acotado; si no, se usa el modelo físico conjunto. Fuera de evidencia compatible, vuelve a Beer-Lambert/HD guardado. Puntuación y vista final comparten predicción. Las referencias Exacta de pruebas tienen prioridad y las celdas de matriz son observaciones, no objetivos deseados, así que imprimir una matriz amplia no hace perseguir cada color muestreado al optimizador.

## Incertidumbre de predicción

Dentro de la cobertura local de color previsto, las correcciones interpoladas vuelven suavemente al modelo físico al agotarse su respaldo. Las recetas exactas fotografiadas conservan su color. Coincidir solo en material superior no basta: debe coincidir la fundación medida completa, o el respaldo alternativo debe ser suficientemente opaco y ópticamente equivalente con la misma interacción inmediata de sustrato.

Para una receta medida idéntica, Kromacut también puede estimar transferencia a otro respaldo profundo si el sustrato inmediato es el mismo material y los colores finales simulados difieren como máximo 1 ΔE00. La fundación inicial debe alcanzar el umbral de opacidad según el ajuste actual o el supuesto HD guardado; los diagnósticos registran cuál respaldó el grosor. Esto permite conservar el supuesto que justificó una base existente si un ajuste posterior cambia el umbral. La corrección se transfiere con menor confianza y se etiqueta **interpolada**, porque la equivalencia se infiere del modelo, no se mide independientemente. Esta excepción no habilita interpolación general de recetas sobre otro respaldo.

Añadir más del mismo filamento terminal puede prolongar la corrección de un prefijo medido. Su influencia se atenúa a través de la secuencia física original y se extingue como máximo en un grosor extra de receta de matriz. También se etiqueta interpolada. No predice prefijos más finos desde una medición posterior, y añadir otro material termina la continuación. Mediciones directas y valoraciones aplicables conservan prioridad. Los diagnósticos identifican muestras de origen y si hubo transferencia entre respaldos o continuación por grosor añadido.

Cada prefijo imprimible recibe confianza junto a su Lab previsto. La confianza mantiene visibles cuatro entradas en vez de convertirlas en certeza inexplicada:

- **Distancia a mediciones:** distancia de color previsto y de receta física a la receta medida compatible más próxima.
- **Concordancia local:** si muestras vecinas describen una corrección consistente del color simulado al fotografiado.
- **Error de validación:** la LUT predice cada receta sin su propia muestra empírica, con la misma selección de vecinos y desvanecimiento que en ejecución. Es una prueba condicional con modelo óptico fijo, no una estimación independiente integral. Aparte, el ajuste óptico se recalcula y prueba con matrices completas reservadas o grupos de interacciones receta/sustrato si solo existe una matriz.
- **Método de predicción:** una observación física exacta parte con más respaldo que interpolación, estimación ajustada o simulación Beer-Lambert pura.

El optimizador añade como máximo cinco puntos equivalentes ΔE a una coincidencia totalmente incierta. Basta para que una coincidencia cercana respaldada venza a un gris especulativo aparentemente perfecto, pero sigue acotado para no superar errores visibles importantes. Las referencias Exacta conservan prioridad explícita y Conservar separación sigue juzgando viabilidad con ΔE00 bruto, no coste ajustado por riesgo. Paletas del optimizador, capas finales y asignaciones guardadas retienen el mismo objeto de confianza, evitando que búsqueda y renderizado usen supuestos distintos en silencio.

La calibración fotográfica es sensible por naturaleza a cámara, exposición, reflejos, balance de blancos y luz. La cuña sin cámara sigue siendo la opción preferida para HD. Usa matriz para obtener muchas recetas empíricas en condiciones controladas y prueba de paleta si te importan especialmente unos pocos colores de una imagen.

## Distancias de ocultación por canal

Los filamentos no absorben por igual rojo, verde y azul —uno naranja transmite rojo pero bloquea azul—, así que una HD escalar es aproximada. Kromacut mezcla con tres distancias por canal:

- **Una lectura de base (modo Rápido):** la comparación de opacidad mide HD escalar. Las diferencias RGB siguen siendo una estimación prudente de la muestra, anclada para que el canal más brillante coincida con la medición.
- **Lecturas adicionales (modo Preciso):** cada base pone a prueba de forma distinta la curva estimada. Kromacut ajusta una intensidad acotada de selectividad y el escalar solo lo necesario según los intervalos cuantizados. No afirma que dos umbrales visuales midan independientemente tres HD espectrales.

La curva refinada se usa directamente para bases realmente comparadas. En una no probada se conserva la estimación Rápida en vez de extrapolar un fuerte cambio de matiz. Puedes añadir más bases cuando convenga, pero no se exigen tres o cuatro. HD de canal totalmente independientes, transmisión no lineal e interacciones específicas se reservan a matrices con validación reservada y comprobaciones de grosor respaldado.

La lectura opcional de fusión registra el último escalón adyacente que aún parecía distinto. Valida la curva en vez de añadir otro parámetro libre: una discrepancia grande reduce confianza y aparece en diagnósticos.

## Ajuste de JND de sesión

La JND predeterminada de 2 ΔE00 es una constante de visión humana, pero un observador e iluminación concretos pueden desviarse un poco. Con suficientes lecturas multibase informativas independientes, Kromacut puede ajustar una JND compartida entre 1 y 3. Solo conserva el ajuste si es claramente identificable y supera el predeterminado; las lecturas cuantizadas suelen ser ambiguas con la HD escalar, y entonces mantiene correctamente la constante.

## Confianza

Cada calibración lleva una puntuación que indica lo bien determinada que quedó la medición:

- Una lectura en cualquiera de los extremos (casilla 1 o última) reduce confianza: el punto real puede estar fuera del intervalo impreso. Imprime una cuña más larga o capas más finas y recalibra.
- Lecturas multibase que discrepan incluso con el mejor ajuste reducen confianza y dejan constancia del desacuerdo.
- La confianza decae tras seis meses, porque envejecen los filamentos y cambian las bobinas.

Los filamentos no calibrados reciben menos puntuación según lo plausible de su HD estimada.

## Qué cambia al calibrar

Las HD por canal alimentan tanto los **colores** previstos como el **grosor** de las transiciones. Calibrar puede cambiar alturas y plan de cambios, no solo vista previa.

La calibración pertenece al material medido: está ligada al color de muestra, editarlo la desactiva y recalibrar sustituye la medición anterior en vez de promediarla.
