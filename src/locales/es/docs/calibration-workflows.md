---
title: Flujos de calibración
slug: calibration-workflows
order: 65
description: Elige una herramienta de calibración, conoce sus controles y comprende qué mediciones se aplican a tu próxima impresión.
---

# Flujos de calibración

La calibración ayuda a predecir cómo se verán los filamentos apilados. No calibra la impresora: no ajusta extrusión, temperaturas, nivelación ni boquilla. Usa primero una configuración fiable del laminador y mide los mismos materiales en las condiciones de observación previstas para tus obras.

Abre **3D → Pintura automática → Calibrar**. El diálogo contiene **Distancia de ocultación**, **Prueba de paleta** y **Matriz de apilamientos**. Miden cosas distintas y pueden combinarse.

![Tres vías: una cuña mide opacidad, una prueba compara pocos colores importantes y una matriz fotografiada mide muchas recetas. Todas informan los colores previstos y el apilamiento imprimible.](20_calibration_choices.svg)

| Herramienta | Cuándo usarla | Qué aportas | Qué puede cambiar después |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Distancia de ocultación | La opacidad es desconocida o estimada | Primera casilla de cuña que coincide con la franja | HD, estimaciones por canal, grosor de transiciones, altura y plan de cambios |
| Prueba de paleta | Importan unos pocos colores de una obra | Candidatos impresos más cercanos y calidad de coincidencia | Predicciones locales y preferencias; posiblemente orden, alturas y geometría |
| Matriz de apilamientos | Quieres colores medidos de muchas recetas cortas | Fotografía frontal correctamente alineada | Predicciones medidas, interpolación local y ajuste físico validado |

Ninguna aumenta la resolución XY ni hace alcanzable cualquier objetivo. Un perfil bien calibrado puede seguir teniendo una gama limitada. Consulta [Teoría de calibración](calibration-theory) para el modelo subyacente.

## Preparar y proteger el perfil de filamentos

Una fila describe una bobina real, no un color deseado de imagen.

| Control | Función | Consecuencia importante |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Muestra / Hex | Define el color opaco nominal | Cambiarlo desactiva la calibración de cuña del color antiguo y cambia compatibilidad con evidencia guardada. |
| Nombre | Da una etiqueta legible | Cambiarla no altera la óptica. Guarda antes de registrar pruebas o matrices. |
| Campo HD | Introduce HD frontal en mm, de 0,01 a 2 | Una HD mayor suele necesitar más grosor. Confirmar un valor manual borra la calibración de cuña. |
| Convertir desde TD | Convierte TD convencional de retroiluminación/litofanía con aproximadamente TD × 0,1 | Introduce TD aquí, no en HD. La conversión es estimada y sustituye la calibración de cuña. |
| Varita | Estima HD según la muestra | Punto de partida, no medición. Sustituye cualquier calibración de cuña existente. |
| Insignia de calibración | Muestra Estimación o calidad de la medición | Pasa el puntero para HD por canal. No garantiza que la obra final coincida con el original. |
| Añadir filamento / papelera | Añade o quita una bobina del conjunto | Pueden cambiar colores físicos disponibles y compatibilidad de evidencia. |

Usa **Perfiles** para mantener un conjunto nombrado sin cambios antes de registrar apariencia:

- **Lista de perfiles:** carga un conjunto guardado. Cargar otro sustituye la lista de trabajo; guarda antes las ediciones que quieras conservar.
- **Guardar perfil seleccionado:** sobrescribe sus filamentos con los valores de trabajo. Conserva pruebas y matrices, pero los registros incompatibles dejan de aplicarse.
- **Guardar como nuevo perfil:** crea un conjunto separado. Copia filas y mediciones de cuña, no historial de pruebas y matrices del antiguo.
- **Renombrar:** cambia la etiqueta sin cambiar mediciones.
- **Importar:** carga archivos de filamentos. **Exportar** respalda un perfil nombrado sin cambios pendientes, incluidas valoraciones y matrices, como `.kfil`. Escritorio abre Guardar como; web sigue el navegador.
- **Eliminar perfil seleccionado:** quita el perfil y su evidencia. Exporta una copia antes si podrías necesitarlo.

**Cambios sin guardar** indica que el conjunto difiere del perfil. Guárdalo o sobrescríbelo antes de crear matriz o registrar prueba. Exportar con cambios crea un perfil de «ediciones sin guardar» sin historial anterior; no es copia completa de ese historial. Las plantillas son conjuntos iniciales de solo lectura con HD estimada: guarda una copia propia antes de calibrar. Consulta [Formatos e importación de perfiles](settings-and-controls#filament-profile-files).

## Distancia de ocultación: leer una cuña

### 1. Seleccionar filamentos y bases

Selecciona uno o varios, o usa **Seleccionar todo / Deseleccionar todo**, y elige **Siguiente: base**.

- **Rápido** usa una base por filamento. Mide un umbral escalar y mantiene diferencias prudentes de canales estimadas de la muestra.
- **Preciso** permite hasta tres bases por filamento, recomendando inicialmente dos útiles si existen. Cada base aporta una lectura. Refina una estimación restringida; no mide independientemente tres canales espectrales.
- Las **muestras de base** eligen lo que se imprime debajo. Usa contraste para distinguir casillas finas de la franja. Base y filamento casi idénticos no dan un umbral útil.

Cambiar Rápido/Preciso restablece bases a las recomendaciones del modo. Preciso sirve cuando puedes comparar el mismo material sobre varios sustratos, no simplemente porque su nombre prometa un resultado universalmente mejor.

### 2. Configurar e imprimir la cuña

![La cuña tiene casillas cada vez más gruesas junto a una franja opaca; la primera idéntica aporta la medición.](07_calibration_wedge.svg)

| Control | Efecto en la impresión |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Altura de capa (mm) | Define cada capa adicional de casilla. Admite 0,04–0,40 mm. Menor altura afina los pasos, pero no hace fiable una configuración no compatible. |
| Capas máximas (longitud) | Elige 4–40 pasos. Más amplían el intervalo medible para translúcidos y hacen la cuña más larga y alta. |
| STL (cualquier impresora) | Descarga una pieza sin color. Imprime una por pareja filamento/base y usa el cambio manual indicado. |
| 3MF (multimaterial) | Incluye todas las lecturas seleccionadas con asignaciones reales en un archivo. Comprueba el mapeo del laminador. |
| Descargar | Exporta el plan actual. Los resultados usan su altura y bases, no una edición posterior sin relación. |

Usa exactamente **altura normal**, **primera capa** y **cambio después de capa / Z** mostrados. La primera capa viene de los ajustes de impresión; la altura propia de cuña es independiente del modelo 3D. No cambies la escala Z. **Siguiente: introducir resultados** abre la lectura; descargar no envía nada a la impresora.

En escritorio ambos formatos abren **Guardar como**; en navegador siguen la descarga normal. Espera a terminar antes de cambiar ajustes o introducir resultados. Cancelar o un fallo conserva el último plan descargado con éxito; si falla el guardado aparece un error para reintentar.

### 3. Comparar y guardar

Observa la cuña boca arriba con la luz frontal prevista. La pestaña marca el extremo de una capa. Compara cada casilla con su franja contigua, no con una foto de teléfono ni muestra de pantalla.

- **Coincidencia:** introduce la primera casilla que parece idéntica a la franja. Es su número de capas añadidas, no la capa absoluta de la impresora.
- **Fusión (opcional):** indica la última casilla aún diferente de la anterior. Comprueba la curva; no es una segunda medición obligatoria. Un valor posterior a Coincidencia recibe aviso.
- **Muestras previstas / HD / confianza / diagnósticos:** muestran lo inferido de tus lecturas. Son comentarios, no medidas adicionales que debas aportar.
- **Guardar calibración:** aplica medidas completas y útiles. Un filamento vacío queda **Sin introducir** y no cambia. Uno Preciso parcial indica **No se guardará** hasta tener Coincidencia para todas las bases. Puedes guardar los completos sin terminar toda la hoja.

Si la última casilla sigue distinta, no la declares coincidente por terminar: imprime una cuña más larga. Si la primera ya coincide, una altura más fina imprimible o una base más contrastada hace la medición más informativa. Las lecturas extremas tienen menor confianza.

Recalibrar sustituye el resultado anterior. Para combinar bases, léelas juntas en una sesión Preciso. Guarda/sobrescribe después el perfil y exporta una copia. La HD medida cambia color y cantidad de material considerada necesaria; regenera y revisa alturas e instrucciones.

**Atrás** permite revisar pasos. Cerrar reinicia selecciones y lecturas sin guardar, así que guarda antes lo útil. Si varias lecturas multibase completas activan un ajuste de sesión, espera antes de guardar; ese cálculo no es otra medición que debas introducir.

### Ejemplo impreso: ocho filamentos

![Ocho cuñas HD con casillas escalonadas y franjas opacas, de izquierda a derecha: blanco, negro, rosa, amarillo, naranja, morado, cian y verde.](hd-wedges-eight-colors-2026-09-13.jpg)

Esta calibración real se terminó el 13 de septiembre de 2026. Las cuñas blanca y de colores usan base negra; la negra, blanca. El perfil adjunto **8 Colors 0.2mm** registra **capas de cuña de 0,04 mm** y **primera capa de 0,10 mm**. El nombre de un perfil no sustituye sus ajustes registrados.

Usa la foto para reconocer casillas, franja y progresión hacia opacidad, no para copiar números ni muestrear colores calibrados. Exposición, balance de blancos, iluminación y pantalla alteran la coincidencia aparente. Lee tu propia impresión junto a su franja con luz frontal constante.

## Prueba de paleta: comparar colores de una obra

La prueba imprime varios candidatos del apilamiento actual. Un **prefijo** es la fundación y cada capa hasta una altura de parada. Se comparan alturas imprimibles, no mezclas arbitrarias independientes de bobinas.

### Elegir objetivos y candidatos

Deja que se calcule un resultado con al menos dos prefijos imprimibles aptos. No hace falta generar antes la malla de la obra. Guarda su perfil nombrado y abre **Prueba de paleta**.

| Control | Significado |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objetivos | Colores de la obra a comparar, hasta 10 o los disponibles. Predeterminado 8 si hay suficientes. |
| Candidatos | Alternativas por objetivo, normalmente 2–5, limitadas por prefijos útiles. Más candidatos ensanchan la probeta. |
| Elegir de la imagen | Abre una vista de selección. Pulsa regiones importantes o sus botones de color. |
| Imagen original | Usa colores procesados antes del ajuste de apariencia, no la fotografía cargada intacta. |
| Ajustados / alcanzables | Usa los colores previstos exactos del resultado actual. Sirve para comprobar si la impresión coincide con la vista; «alcanzable» no certifica exactitud física. |
| Total de objetivos | Ajusta el mismo número durante la selección de imagen. |
| Borrar selecciones | Quita prioridades manuales y devuelve huecos a selección inteligente. |
| Usar objetivos inteligentes / Elegidos + inteligentes | Vuelve a la prueba con tus prioridades y completa los huecos automáticamente. |

Los colores elegidos siguen brillantes donde aparezcan; lo no seleccionado se atenúa. Elegir un objetivo no recolorea ni lo fuerza a la gama de la impresora. Reducir el número puede descartar prioridades excedentes.

### Imprimir e identificar la probeta

![Cada objetivo tiene candidatos que paran a distintas alturas sobre una fundación continua compartida.](09_palette_proof.svg)

**Mapa de prueba** y **Resultados** usan un objetivo por fila y candidatos A–E de izquierda a derecha. Los números identifican la fila. **F** es la referencia compartida de fundación, no un sexto color ni otro filamento. Compárala con el margen expuesto de fundación.

**Descargar 3MF** exporta la probeta y, para un perfil nombrado sin cambios pendientes, guarda identidad y mapa de recetas. Tras guardar, selección y recuentos se bloquean para evitar que los resultados aludan silenciosamente a otra impresión. Mantén boca arriba al 100 %, usa alturas integradas, verifica filamentos y orienta con la esquina superior izquierda ausente. La probeta por defecto de 8 objetivos × 5 candidatos mide 44 × 68 mm. Las casillas de 8 mm se tocan sobre fundación continua, por lo que los límites pueden ser menos evidentes que en pantalla.

### Registrar lo que realmente ves

Abre **Resultados**, compara candidatos y objetivo mostrado bajo condiciones constantes y elige la casilla más cercana. Selecciona varias si empatan. Describe después la coincidencia:

| Respuesta | Qué comunica a Kromacut |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Mejor disponible | Es la opción menos incorrecta. Apóyala frente a alternativas sin afirmar que equivale al objetivo. |
| Cercana | El color casi es correcto. Añade una corrección local suave además de preferencia. |
| Exacta | La receta coincide con precisión. Conserva la referencia local más fuerte con las capas inferiores necesarias para reproducir el color visible. |
| Ninguno | Todos son claramente malos. Recházalos localmente sin inventar el color correcto ni elegir ganador. |

![Un ganador lleva a candidatos cercanos en la siguiente ronda. Ninguno lleva a explorar sin referencia ganadora anterior. Nuevos objetivos prueba otros colores de la obra.](21_proof_rounds.svg)

Las respuestas se guardan al introducirlas. **Completar resultados** se habilita cuando todas las filas están contestadas, incluido Ninguno. **Editar resultados** reabre una prueba terminada. La lista de pruebas agrupa conjuntos de objetivos iguales y sus continuaciones.

- **Continuar con los objetivos:** imprime otra ronda con los mismos objetivos y apilamiento actual compatible. Conserva mejores anteriores, prueba alternativas próximas inéditas y puede incluir una exploratoria. Ninguno no tiene ganador previo, así que explora alternativas.
- **Nuevos objetivos:** abre selección para otro conjunto. La selección inteligente favorece colores fuera de la prueba terminada y después los menos probados.
- **Menos candidatos / objetivos agotados:** la búsqueda no rellena con repeticiones sin relación solo por alcanzar el tamaño pedido. Lee el aviso; menos opciones útiles no significa calibración perdida.
- **Eliminar prueba:** tras confirmar, quita la probeta y todas sus valoraciones de la evidencia de apariencia.

Los resultados guardados se leen sin la imagen original. Volver a descargar exige la instantánea fuente exacta; continuar requiere una obra/proceso actual compatible. Conserva el 3MF si puedes querer reimprimir.

Las valoraciones pueden cambiar colores cercanos, clasificaciones y finalmente alturas. No cambian materiales reales exportados ni sobrescriben HD. Un resultado no establece una paleta globalmente precisa. El ajuste amplio tiene requisitos de evidencia y validación reservada; las valoraciones locales pueden ser útiles aunque no esté activo.

## Matriz de apilamientos: fotografiar recetas conocidas

### Planificar la placa

Guarda primero un perfil nombrado sin cambios. Define **Altura de capa** y **Altura de primera capa** en 3D antes de **Nueva matriz**. La altura de cuña HD no controla las matrices.

| Control | Efecto en la placa |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Muestras de filamentos | Elige 2–8 en orden de perfil. Solo aportan capas esos materiales. |
| Grosor máximo de color (mm) | Limita la zona sobre la fundación de una capa. Redondea hacia abajo a capas normales completas, de 1 a 64. A 0,04 mm, 0,40 mm permite hasta diez capas. |
| Máximo de celdas | Limita recetas: 64, 144, 256, 400, 625, 1024, 1296, 1600 o 2025. Más placa muestrea más, pero usa cama y tiempo. |
| Presupuesto de cambios previsto | Limita la estimación del planificador, incluidas referencias. Elige 40–640 cambios o Sin límite. No estima duración ni garantiza cambios finales del laminador. |
| Filamento de respaldo | Elige uno seleccionado para fundación y relleno bajo recetas cortas. Por defecto, el más claro. Una primera capa fina no garantiza opacidad. |
| Altura normal / primera | Confirmación de solo lectura de ajustes actuales para la placa nueva. |
| Resumen de receta / tamaño / altura / cambios | Muestra superficie, fundación + color, altura total y capas antes de descargar. El registro muestra alturas congeladas, celdas, cambios previstos, referencias y placas anteriores consideradas. |
| Crear y descargar 3MF | Planifica recetas, exporta y registra el plan en el perfil. |

Las nuevas placas usan **cobertura adaptativa**: una búsqueda acotada y repetible muestrea recetas en el intervalo de grosor. Favorece huecos de colores medidos, profundidades y transiciones nuevas y exploración con poco apoyo o errores anteriores. La novedad prevista no promete color impreso nuevo. Algunas referencias se repiten a propósito para comparar fotos sucesivas.

Solo placas terminadas con perfil/materiales, respaldo, alturas y alineación aceptada compatibles guían la siguiente. Descargar un plan sin imprimir no mide sus colores. Conserva las terminadas: **Nueva matriz** considera automáticamente medidas aptas. Cambiar respaldo o ajustes puede iniciar otro contexto de cobertura.

Las placas nuevas tienen **fundación de una capa**, determinada por **Altura de primera capa**, sin placa extra basada en opacidad. Por ejemplo, **0,10 mm inicial + 0,40 mm de color = 0,50 mm total**. Con **capas normales de 0,04 mm**, son **11 capas**: una de fundación y diez de color. El resumen muestra el desglose antes de descargar y la fundación realmente guardada para placas antiguas.

Todas las casillas terminan a la misma superficie plana. Una receta corta reposa en capas extra del respaldo bajo el color, **dentro del límite de grosor**. Este relleno no añade altura total. El registro conserva receta útil y relleno por separado.

Una primera capa fina no es automáticamente opaca. Elige respaldo opaco y fotografía sobre una superficie plana y constante; luz o color transmitidos desde abajo alteran las medidas. El respaldo añadido solo puede tratarse como neutro cuando oculta de verdad lo inferior.

Las mediciones sobre base aún translúcida conservan su grosor físico. Pueden respaldar un apilamiento igual, pero no se intercambian entre otros grosores ni ajustan el modelo global de respaldo opaco. El relleno puede hacer opacas algunas casillas aunque la primera capa desnuda no lo sea.

Las placas nuevas agrupan recetas similares para hacer regiones continuas y reducir trayectorias fragmentadas. Agrupar no reduce por sí solo filamentos por capa, así que no promete menos cambios ni un ahorro concreto. Las placas guardadas conservan posiciones originales para que sus fotos sigan correspondiendo.

El límite no obliga a cada receta a usar todo ese grosor. Los presupuestos de celdas y cambios pueden producir menos celdas, y uno estricto puede dejar filamentos sin usar; el plan avisa. Si incluso las referencias exceden el presupuesto, súbelo o reduce grosor o selección. Placas profundas y purgas CFS/AMS pueden ser lentas aun con pocas celdas: comprueba el tiempo final del laminador.

El resumen cuenta recetas seleccionadas no medidas en placas previas compatibles. Si son cero, solo repite medidas; puedes no imprimir y probar otros límites o materiales. No prueba que se haya medido todo color alcanzable, porque la búsqueda es acotada.

Las celdas son de 5 mm sin huecos, con borde de marcadores; una cuadrícula de datos de 32 × 32 ocupa 170 × 170 mm. Las placas antiguas conservan profundidad fija y etiquetas **todas las combinaciones** o **gama seleccionada por HD**; descargarlas otra vez no las convierte al formato adaptativo.

En escritorio, cancelar Guardar como no crea plan. En navegador se registra al iniciar descarga. Revisa errores de almacenamiento y conserva el 3MF. El registro congela alturas, respaldo y recetas: cambios posteriores no lo rediseñan y **Descargar 3MF** vuelve a exportar la placa original.

Imprime boca arriba al 100 % con alturas y filamentos exactos. Una primera capa menor que la normal se eleva a esta. La fundación sigue siendo una capa a esa altura efectiva, no se engrosa para opacidad. Placas antiguas conservan fundación y capas extra originales. Es un objeto de calibración física: cambiar escala Z o materiales invalida lo que deben medir las celdas.

### Cargar y alinear una foto

Selecciona la placa impresa en la lista y usa **Elegir foto** o arrastra una imagen a la zona. Fotografía con luz frontal difusa sin reflejos fuertes. La aplicación debe poder decodificarla; un RAW no sustituye una imagen exportada normalmente visible.

![Los cuatro controles van en centros de marcadores fuera de la cuadrícula. El borde queda a media celda de los centros; una ampliación distingue el centro de la esquina exterior.](22_matrix_alignment.svg)

| Control | Qué cambia |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clave de esquinas impresa | Orientación: 1 arriba izquierda, 2 arriba derecha, 3 abajo derecha, 4 abajo izquierda. Sigue los colores de este registro, que varían con filamentos. |
| Girar izquierda / derecha | Gira la foto 90° y repite detección. No cambia el mapa físico guardado. |
| Zoom − / porcentaje / Zoom + | Cambia aumento de 100 % a 400 %. Al 100 % cabe toda la foto; no equivale a un píxel de pantalla por píxel de cámara. Pulsa el porcentaje para restablecer y desplázate a zonas ampliadas. |
| Cuatro controles numerados | Arrastra al centro de marcadores situados diagonalmente fuera de la cuadrícula densa. La cruz de la lupa marca el centro muestreado. |
| Mostrar cuadrícula de plantilla | Proyecta bordes para comparar con la impresión. Es una superposición de revisión, no corrección de color. |
| Detectar de nuevo | Reestima la alineación desde la foto actual. |
| Restablecer | Recupera la estimación inicial de la foto y deshace controles manuales. No elimina calibración guardada. |
| He verificado cada línea y centro de marcador | Obligatorio tras ajuste manual o baja confianza. Confirma solo al revisar toda la cuadrícula y los cuatro centros. |

No pongas controles en las últimas recetas ni en las esquinas físicas exteriores. El contorno azul debe quedar media celda más allá de cada centro. Revisa la **Vista corregida de perspectiva**: las celdas deben verse cuadradas y coincidir con la disposición impresa. Se muestrean centros internos para evitar bordes, pero una cuadrícula desplazada sigue asignando colores incorrectos.

### Decidir cómo muestrear y guardar

**Corrección por marcadores de referencia** está desactivada por defecto. Así conserva los colores fotografiados, incluida su dominante. Activada aplica ganancias por canal estimadas comparando los cuatro marcadores con sus colores previstos. Puede reducir dominante o sesgo de brillo, pero no mide independientemente la luz ambiental ni repara sombras o reflejos. Predicciones incorrectas de marcadores también sesgan. Una vista más luminosa no prueba una medición más precisa.

La **Vista de LUT extraída** muestra los colores que se guardarán, uno por receta. Pasa el puntero para RGB muestreado. Compara con la placa física y condiciones previstas, no con la expectativa de que cada celda deba ser intensa.

**Guardar calibración** se habilita cuando muestras y revisión están listas. En un registro terminado pasa a **Sustituir calibración** y reemplaza sus mediciones; descarga/exporta copia antes si quieres conservar ambas. El perfil contiene colores, recetas y metadatos de foto, no la foto original. Guárdala aparte si puedes necesitar remuestrearla.

**Nueva matriz** inicia otra placa; **Volver a matrices guardadas** vuelve a registros. **Eliminar matriz de apilamientos** quita la placa y evidencia seleccionadas. Las compatibles terminadas contribuyen conjuntamente, así que no necesitas borrar una antigua por medir una nueva.

## ¿Qué evidencia se aplica a mi próxima impresión?

![Tres capas medidas a 0,08 mm no son la misma receta física que tres a 0,04 mm. HD aún estima por grosor, pero coincidir en número de capas no transfiere colores de matriz.](23_calibration_scope.svg)

| Evidencia | Compatibilidad que comprobar |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HD de cuña | Pertenece al color medido. Modela grosor, no consulta un único número de capas; nuevos ajustes merecen comprobación física. |
| Preferencias de prueba y ajuste amplio | Exigen mismas identidades ordenadas, colores, HD/calibración, alturas normal e inicial y opacidad de transición. |
| Referencias Exacta de prueba | Exigen filamento/perfil y alturas correspondientes. Pueden seguir siendo aptas al cambiar detalle si el sufijo físico requerido es realizable. |
| Matriz | Exige alineación completada y aceptada, datos compatibles y misma altura normal. La receta exacta depende además del respaldo medido o equivalencia óptica respaldada. |

Cambiar de 0,08 a 0,04 mm no reinterpreta una receta fotografiada de tres capas como seis. Esa matriz queda fuera del nuevo contexto. El perfil aún puede aportar HD de cuña, pero **Modelo de apariencia** puede indicar correctamente **Solo estimaciones** y cero recetas LUT de matriz.

Otra primera capa no desactiva automáticamente todas las matrices. Conservan su fundación y la reutilización depende de que el respaldo generado cumpla condiciones medidas o equivalentes respaldadas. No supongas que basta el mismo filamento superior o grosor total. Consulta [Incertidumbre de predicción](calibration-theory#prediction-uncertainty) para reglas acotadas de transferencia y continuación del mismo filamento.

## Leer confianza sin exagerar exactitud

La insignia de filamento, **Confianza del resultado** y **Modelo de apariencia / Confianza de predicción** describen cosas distintas:

- **Confianza del filamento** indica lo restringida que quedó la medida de cuña. Extremos, desacuerdo o envejecimiento la reducen. Estimación significa que no hay cuña activa.
- **Confianza del resultado** combina Calibración, Cobertura y Compresión. Un total alto puede coexistir con recetas totalmente simuladas.
- **Modelo de apariencia** identifica evidencia empírica y estado de ajuste. Recuentos de apilamientos comparados, referencias, vecindarios y recetas LUT muestran qué informó realmente el cálculo.
- **Confianza de predicción** describe respaldo de los colores asignados, con predicciones medidas, interpoladas, ajustadas o simuladas. Una receta medida sigue siendo observación humana o de cámara bajo ciertas condiciones, no garantía de laboratorio.

Usa **Mejor disponible**, no Exacta, al elegir la casilla menos mala. No sigas retocando una foto de matriz hasta que resulte atractiva. El siguiente paso útil es una pequeña prueba física de los colores y ajustes que realmente cambiaste.
