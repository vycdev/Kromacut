---
title: Ajustes y controles
slug: settings-and-controls
order: 80
description: Acciones de la cabecera, temas, persistencia, paletas, perfiles y controles del espacio de trabajo.
---

# Ajustes y controles

Esta página reúne controles que afectan a toda la aplicación o que es fácil pasar por alto.

## Controles de la cabecera

| Control | Función |
| ------------- | ------------------------------------------------------------------------------ |
| Logotipo de Kromacut | Vuelve a la aplicación si la documentación está abierta; si no, abre la página principal. |
| Ajustes | Abre el diálogo con controles de idioma, tema, recursos y actualizaciones. |

El selector de tema ofrece **Sistema**, **Oscuro** y **Claro**. **Sistema** sigue la preferencia de colores del sistema operativo o navegador y se actualiza si cambia. La elección se guarda para futuras sesiones.

El selector **Idioma** cambia interfaz, documentación, diagramas y páginas públicas. Elige **Idioma del sistema** para seguir un idioma compatible del navegador o sistema, o selecciona inglés, francés, alemán, italiano, rumano, español, japonés, chino simplificado, hindi, portugués europeo, ucraniano o bengalí. La elección se guarda localmente y no cambia ilustraciones, perfiles de filamentos, ajustes de impresión ni geometría generada. Las traducciones y fuentes se incluyen en la aplicación de escritorio; ningún servicio de traducción en línea recibe tu trabajo.

Las páginas públicas también ofrecen selector de idioma. La documentación traducida usa enlaces compartibles con prefijo de idioma, como `/ro/docs/overview`. Los nombres de página y anclas de sección permanecen estables entre idiomas. No se traducen extensiones, datos numéricos del modelo, nombres introducidos por el usuario ni títulos originales de obras comunitarias.

El diálogo incluye enlaces a documentación, Discord, Reddit, GitHub y Patreon, y muestra la versión actual de Kromacut.

## Modos del espacio de trabajo

Usa **2D** y **3D** para alternar entre preparación de imagen y generación del modelo.

Puedes arrastrar el separador vertical entre controles y vista previa. Amplía el panel izquierdo para trabajar con ajustes detallados o la vista para inspeccionar imagen o modelo.

Las páginas de documentación usan enlaces compartibles `/docs/...`. Abrir uno lleva directamente a la guía correspondiente.

En pantallas pequeñas, despliega **Contenido** para elegir guía o **En esta página** para saltar a una sección. Ambos se cierran tras seleccionar para dejar espacio de lectura. Las ilustraciones se abren a tamaño completo al pulsarlas o enfocar su enlace y pulsar Intro.

La mayoría de las secciones laterales se pliegan desde sus títulos. Plegar oculta controles, no efectos: los ajustes activos, parámetros de impresión y opciones del optimizador siguen aplicándose. Los resúmenes y puntos de estado ayudan a detectar cambios activos. El estado abierto/cerrado se recuerda. Desplegar una sección no la restablece.

**Deshacer / Rehacer** comparte el historial de imagen entre 2D y 3D. No es un historial de cambios de filamentos, calibración, alturas u opciones del optimizador. Usa el restablecimiento propio de cada panel cuando exista y regenera después de restaurar una imagen.

## Modo multiplaca experimental

La opción **Modo multiplaca** de Ajustes es un flujo sin terminar. Recuerda la preferencia y puede reproducir una animación, pero aún no divide la imagen, crea mosaicos, distribuye objetos entre placas ni cambia la geometría exportada. Déjala desactivada para impresión normal. No sirve para encajar un modelo demasiado grande en la cama.

## Ajustes de impresión guardados

Kromacut recuerda en el navegador ajustes como **Tamaño de píxel (XY)**, **Altura de capa**, **Altura de primera capa**, **Ancho de línea efectivo** y **Malla suavizada**.

Usa el restablecimiento de **Ajustes de impresión 3D** para volver a los valores predeterminados, incluidos 0,42 mm de ancho de línea efectivo.

Los ajustes recordados son locales al navegador/sitio o aplicación de escritorio actual. No son una copia de la ilustración ni un proyecto completo, y otros navegadores o el escritorio no tienen por qué compartirlos. Exporta paletas y perfiles importantes antes de borrar datos. Cargar un perfil restaura filamentos y evidencia, no una imagen ni una malla ya generada.

## Estado guardado de pintura automática

Se conservan entre sesiones los siguientes ajustes:

- Filamentos.
- Modo de pintura.
- Altura máxima y altura de capa de la cuña de calibración.
- Correspondencia de color mejorada.
- Conservación de separación, su límite ΔE único y la exigencia de correspondencia única para cada color.
- Límite total de repeticiones, compartido entre apariciones adicionales en todo el apilamiento.
- Detalle de transición y tramado de altura.
- Ancho de línea efectivo, editado en **Ajustes de impresión 3D**, para avisos, limpieza de motas y tramado de altura, junto con la preferencia **Omitir motas de color aisladas**. La limpieza no quita todos los avisos ni controla el tramado de altura.
- Pintura plana y la preferencia boca arriba sin capa transparente.
- Algoritmo y semilla del optimizador.
- Prioridad regional.

Los perfiles son independientes de este estado. Úsalos para conjuntos nombrados que puedas cargar, importar o exportar.

## Archivos de paleta

Las paletas personalizadas sirven para reducir colores 2D. Sus archivos usan `.kpal`.

La versión 2 añade dos campos opcionales: `disabledColors` (colores conservados pero excluidos de cuantización) y `colorNames` (nombres opcionales por color). Ambos se conservan al exportar e importar. Los archivos v1 se cargan sin cambios, con todos los colores activados y sin nombre; un v2 abierto en un Kromacut antiguo simplemente considera todos los colores activados.

Usa paletas personalizadas para hacer coincidir la imagen reducida con filamentos conocidos o una colección fija de colores.

## Archivos de perfiles de filamentos

Los perfiles de pintura automática son conjuntos nombrados que puedes guardar, cargar, importar y exportar. Usan `.kfil` y almacenan colores, nombres, HD, calibración, registros y valoraciones de pruebas de paleta y, cuando existen, planes limitados de matrices y colores medidos. Los antiguos `.kapp` siguen siendo importables. Los perfiles de versiones anteriores guardaban valores no calibrados en escala TD convencional; se convierten automáticamente (×0,1) al cargar o importar.

Usa el **icono de carga** en la barra de perfiles para importar. Un archivo antiguo con el mismo ID y sin apariencia se importa como copia renombrada separada en vez de borrar evidencia reciente; un error de almacenamiento deja intacta la lista existente y muestra un mensaje. Usa el **icono de descarga** para exportar el conjunto actual. Los archivos usan `.kfil` por defecto. Si el perfil cargado tiene ediciones sin guardar, la exportación crea un perfil nuevo de «ediciones sin guardar» sin evidencia de apariencia vinculada a las identidades anteriores.

### Formatos de importación compatibles

| Formato | Extensión | Notas |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Perfil Kromacut | `.kfil` | Formato nativo. Admite un perfil o una matriz de perfiles en un archivo. |
| Perfil antiguo Kromacut | `.kapp` | Formato nativo anterior, aún totalmente compatible al importar. |
| JSON sin procesar | `.json` | Se acepta si contiene un objeto de perfil o una matriz de objetos. |
| CSV/TSV de bobinas HueForge | `.csv`, `.tsv` | Véase abajo. |

### Gestión de duplicados

Al importar, Kromacut compara cada perfil con los que ya tienes:

- **Mismo ID:** normalmente sobrescribe el existente. Si sustituiría evidencia guardada por un archivo sin evidencia útil, importa una copia aparte.
- **Mismo contenido, distinto ID:** se omite solo si coinciden tanto datos de filamentos como evidencia de apariencia.
- **Mismo nombre, distinto contenido:** se importa añadiendo un sufijo numérico (por ejemplo, `Mis bobinas (2)`).

Después de cada importación aparece un resumen de perfiles importados, sobrescritos, omitidos o renombrados.

### Importar desde HueForge

Las bibliotecas de bobinas HueForge (`.csv` o `.tsv`) se importan directamente. Usa **Export Spools** en HueForge para guardar un CSV y después el icono de carga de la barra de perfiles para elegirlo. El separador (coma o tabulación) se detecta en la cabecera. Cada bobina se convierte en una entrada llamada `<Brand>-<Color Name>-<Hex>`, por ejemplo `Inland Basic-Light Brown-#BF9C81`. Los UUID de HueForge se conservan como ID de filamentos para que reimportar no duplique entradas. Las TD de HueForge se tratan como entradas convencionales de retroiluminación/litofanía y se convierten a HD frontal durante la importación.

## Avisos de actualización en escritorio

La aplicación de escritorio puede avisar cuando hay una versión nueva. El aviso permite abrir la página de descarga o descartar el recordatorio.

Abre **Ajustes** para buscar actualizaciones manualmente. En escritorio también aparece **Comprobar al iniciar**, que controla la búsqueda al abrir la aplicación. Está activada por defecto y las búsquedas manuales funcionan aunque se desactive.

En Linux, las AppImage con información de actualización integrada pueden actualizarse con herramientas compatibles como AppImageUpdate. Estas utilizan el archivo `.AppImage.zsync` de la versión para descargar las partes modificadas. Las AppImage antiguas sin esa información requieren una primera descarga manual de una versión compatible. El archivo `.zsync` no es un instalador y el aviso de actualización de Kromacut no instala actualizaciones automáticamente.

## Diagnósticos de pintura automática en escritorio

La aplicación de escritorio puede registrar información estructurada de nuevos cálculos. Abre **Ajustes** y activa **Registrar diagnósticos de pintura automática** antes de iniciar uno. El ajuste no reinicia ni registra un resultado ya calculado.

Cada cálculo crea un `.jsonl` separado en la carpeta de diagnósticos. Usa **Abrir carpeta** junto al ajuste para encontrarlos. Cada línea es un evento JSON completo, así que progreso, errores y cancelaciones siguen siendo legibles aunque el cálculo no termine.

Una traza completa incluye información básica de ejecución, instantánea de filamentos y calibración activos, ajustes de generación y optimizador, muestras limitadas de progreso, estado de ajuste de apariencia, decisiones progresivas de niveles de repetición, capas físicas finales, todos los candidatos imprimibles finales, comparaciones Delta E entre objetivos y candidatos, confianza y las mediciones que contribuyeron a colores interpolados o ajustados localmente. Registra colores de paleta procesados y pesos, no la imagen original cargada. Los datos de calibración y perfil pueden seguir siendo sensibles, así que revisa la traza antes de compartirla públicamente.

El registro está pensado para investigar y puede crear archivos grandes. Déjalo desactivado en impresión normal cuando no necesites una traza.

## Abrir archivos desde el escritorio

Las instalaciones de escritorio asocian los archivos `.kfil` y los antiguos `.kapp` con perfiles de filamentos, y los archivos `.kpal` con paletas. Haz doble clic en un archivo para importarlo y seleccionarlo en Kromacut. Si la aplicación ya está abierta, se utiliza su ventana existente. Se aplican las reglas habituales de validación, migración, duplicados y conservación de la calibración.

Los archivos abiertos desde el escritorio quedan en espera mientras esté abierto el editor de paletas o el cuadro de calibración. Termina o cancela esa sesión para continuar con las importaciones pendientes.

Antes de reemplazar cambios de filamentos sin guardar, Kromacut ofrece **Conservar cambios** o **Abrir perfil**. Conserva los cambios para guardarlos primero; abrir el perfil los descarta. Los archivos abiertos así deben tener menos de 32 MiB. Los archivos JSON genéricos, imágenes y modelos mantienen sus flujos habituales de importación.

En Linux, las AppImage portátiles requieren integración con el escritorio para asociar archivos. Si Kromacut no es la aplicación predeterminada, utiliza **Abrir con** en el gestor de archivos.

Siguiente: [Solución de problemas](troubleshooting).
