---
title: Modo 3D
slug: 3d-mode
order: 60
description: Dimensiones físicas, apilamientos manuales de color, mallas y controles de vista previa.
---

# Modo 3D

El modo 3D convierte colores de imagen en capas físicas. Prepara la imagen en 2D, elige dimensiones y método de impresión y pulsa **Generar modelo 3D**. Cambiar un ajuste no regenera automáticamente el modelo mostrado.

Usa **Manual** para elegir orden y grosor de colores. Usa **Pintura automática** para predecir mezclas de filamentos reales y encontrar un apilamiento. Ningún método maneja la impresora: exporta y comprueba el modelo en el laminador.

## Ajustes de impresión 3D

| Control | Efecto en el modelo | Qué comprobar |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Tamaño de píxel (XY)** | Milímetros por píxel en ambas direcciones horizontales. | La insignia **Modelo** estima anchura, altura y profundidad físicas antes de generar. |
| **Altura de capa** | Paso vertical normal usado para alturas y cambios. | Debe coincidir con el laminador. Capas menores ofrecen alturas más finas, no líneas de extrusión más estrechas. |
| **Altura de primera capa** | Primer paso sobre la placa. | Hazla coincidir por separado. El primer color debe tener al menos la mayor de las alturas normal y primera. |
| **Ancho de línea efectivo** | Ancho de extrusión para comprobar detalles imprimibles y tramado de altura. | Usa el ancho previsto del laminador, no diámetro de boquilla ni Tamaño de píxel. No cambia el perfil de impresora. |
| **Malla suavizada** | Cambia límites escalonados por contornos conectados suavizados. | Cambia geometría exportada, no solo iluminación. No añade detalle ni alisa físicamente la superficie. |
| **Restablecer** | Recupera 0,1 mm/píxel, capas normales de 0,12 mm, primera de 0,2 mm, ancho efectivo de 0,42 mm y suavizado desactivado. | También devuelve grosores manuales al mínimo, manteniendo el orden actual. |

### El tamaño de píxel no es el de la boquilla

Una imagen de 1000 píxeles de ancho a **0,1 mm/píxel** produce un modelo de unos **100 mm**. A **0,2 mm/píxel**, pasa a unos **200 mm** con exactamente los mismos píxeles. Los márgenes exteriores transparentes se excluyen de las dimensiones.

![La misma cuadrícula crece físicamente al aumentar el tamaño de píxel; redimensionar la imagen cambia, en cambio, el número de píxeles.](10_physical_size.svg)

_Esquema. Tamaño XY, resolución y ancho de extrusión son controles independientes._

Para conservar 100 mm con 2000 píxeles, usa **0,05 mm/píxel**. Más píxeles describen bordes más finos, pero la impresora sigue limitada por su ancho de extrusión. Define **Ancho de línea efectivo** en **Ajustes de impresión 3D** y usa la [vista de detalles imprimibles](auto-paint#printable-detail) para inspeccionar esa limitación.

Aumentar el tamaño de píxel no reduce su número ni abarata inherentemente la generación de malla. Para aligerarla, redimensiona o recorta en [2D](loading-images), o simplifica la paleta.

### Ancho de línea efectivo

Copia el ancho previsto del laminador en **Ancho de línea efectivo**. Admite de 0,1 a 2 mm. Restablecer **Ajustes de impresión 3D** recupera 0,42 mm junto a los otros valores predeterminados. Editar este campo no cambia el perfil de impresora.

La pintura automática lo usa para avisos de anchura, limpieza opcional de motas y tamaño de bloques de tramado de altura. Los controles para revisar avisos u omitir motas siguen en [Pintura automática](auto-paint#printable-detail). Un aviso no significa que se vaya a quitar un detalle o que no pueda imprimirse.

### Alturas de capa y límites válidos

Con **primera capa de 0,20 mm** y **capas normales de 0,08 mm**, los topes de capa están a 0,20, 0,28, 0,36 y 0,44 mm, no a 0,08, 0,16, 0,24 y 0,32 mm. Kromacut ajusta los grosores de color a esta cuadrícula.

Cambiar **Altura de capa** restablece los grosores manuales al nuevo paso y aplica el mínimo del primer color. Cambiar **Altura de primera capa** devuelve el primer color a su nuevo mínimo. Defínelas antes de afinar deslizadores y revisa el plan si cambian.

Los campos aceptan intervalos amplios: 0,01–10 mm/píxel para Tamaño de píxel, 0,01–10 mm para Altura de capa y 0–10 mm para Primera capa. Son límites de entrada, no recomendaciones; el primer color sigue ajustándose a su mínimo físico. Usa valores compatibles con boquilla, material y laminador. Una altura menor cambia las recetas disponibles; no hace compatible automáticamente una calibración existente.

## Modo Manual

**Grosores de color** enumera los **Colores de la imagen** no transparentes. Cada fila tiene un control de arrastre, muestra, deslizador de grosor y valor en milímetros. El valor es el grosor de la secuencia de color, no su altura superior absoluta. Una secuencia puede abarcar varias capas del laminador.

![Tres secuencias manuales forman alturas acumuladas; aumentar una inferior eleva todas las superficies posteriores.](11_manual_layers.svg)

_Sección esquemática. La superficie de un color posterior contiene las secuencias anteriores debajo._

Por ejemplo, define negro **0,20 mm**, rojo **0,16 mm** y blanco **0,08 mm**, con capas normales de 0,08 mm. El negro termina a 0,20 mm, el rojo a 0,36 mm y el blanco a 0,44 mm. El rojo empieza en la capa 2 del laminador y el blanco en la 4. Confirma instrucciones e interpretación del laminador antes de imprimir.

### Reordenar colores

Arrastra filas de arriba abajo en orden de impresión. La primera empieza en la placa. Las posteriores se imprimen sobre las anteriores solo donde la imagen las necesita, formando relieve. Mover un color cambia su respaldo, altura superficial y secuencia de cambios. Una fila movida al principio sube al mínimo de primera capa cuando hace falta.

La vista y exportación manuales usan colores de imagen, no el modelo HD. Una capa roja fina sobre negro puede imprimirse más oscura que la muestra aunque la vista manual parezca roja. Elige materiales y grosores en consecuencia.

### Ajustar y restablecer grosores

Arrastra y suelta un deslizador para confirmar. Las secuencias posteriores avanzan por **Altura de capa**. La primera empieza en su mínimo y añade pasos normales. Aumentar una inferior eleva todas las superficies siguientes y mueve sus cambios, no solo las regiones donde sigue visible ese color.

Restablecer **Grosores de color** ordena de oscuro a claro por luminancia y asigna mínimos. Es distinto de restablecer **Ajustes de impresión 3D**, que también cambia parámetros físicos pero conserva el orden.

Los controles manuales e instrucciones admiten **64 colores**. Reduce paletas mayores en 2D. Los píxeles totalmente transparentes no crean material, no un respaldo blanco. Las islas opacas desconectadas siguen siendo piezas independientes salvo que la imagen las conecte.

## Malla suavizada

Sin suavizado, los contornos siguen la cuadrícula de píxeles. Con él, las fronteras conectadas se suavizan en geometría soldada. La diferencia se exporta; no es un filtro visual.

Suaviza los contornos del modelo en la vista previa y las exportaciones. Medio conserva el suavizado original. Reconstruye para aplicar.

| Intensidad | Uso |
| --- | --- |
| **Ninguno** | Pixel art, bordes exactos de cuadrícula o generación más rápida. |
| **Mínimo** | Limpieza ligera de esquinas dentadas. |
| **Medio** | El resultado habitual del ajuste activado anterior. |
| **Intenso** | Suavizado más intenso de los contornos y los escalones restantes, con el mismo límite de desplazamiento que Medio. |

El desplazamiento se mantiene por debajo de medio píxel. Reconstruye el modelo y revisa la vista previa del laminador. Los ajustes antiguos activado/desactivado pasan a Medio/Ninguno.

![Comparación de contornos diagonales escalonados y suavizados sobre la misma cuadrícula original.](12_smooth_boundaries.svg)

_Comparación esquemática de contornos, no simulación del laminador._

Úsala para curvas o diagonales demasiado escalonadas. Déjala desactivada para arte de píxeles intencional o bordes exactos de cuadrícula. Ninguna opción repara detalles demasiado pequeños ni inventa resolución ausente.

Malla suavizada está inactiva en [Pintura plana](flat-paint). Activarla desactiva Pintura plana, que usa su construcción de placa de superficie completa.

## Pintura automática

Acepta colores reales y **Distancia de ocultación (HD)**, predice mezclas y asigna colores a alturas imprimibles. Lee [Controles de pintura automática](auto-paint) para todos los controles de filamento, correspondencia, detalle y confianza.

## Calibrar la distancia de ocultación del filamento

**Calibrar**, bajo la lista, abre **Distancia de ocultación**, **Prueba de paleta** y **Matriz de apilamientos**. Sigue [Flujos de calibración](calibration-workflows) para imprimir y registrar resultados o [Teoría de calibración](calibration-theory) para el modelo óptico.

## Perfiles de filamentos

Los perfiles guardan conjuntos nombrados y evidencia compatible. Las ediciones sin guardar no se escriben automáticamente en el seleccionado. Consulta [Filamentos y perfiles](auto-paint#filament-profiles) y [Archivos de perfil](settings-and-controls#filament-profile-files).

### Plantillas

Son referencias de proveedores de solo lectura, no mediciones de tus bobinas. Carga, ajusta, calibra y **Guarda como nuevo perfil**. Consulta [Plantillas](auto-paint#templates).

## Altura máxima

El límite acorta las transiciones en fronteras válidas, pero no puede quitar la fundación opaca. Lee [Altura máxima](auto-paint#max-height), incluida la advertencia sobre el soporte de pintura plana.

## Detalles imprimibles

Define **Ancho de línea efectivo** en **Ajustes de impresión 3D** y usa **Abrir vista previa** para inspeccionar regiones finas. **Omitir motas de color aisladas** sustituye opcionalmente colores usados solo en motas diminutas encerradas, manteniendo líneas y conexiones. Los avisos y píxeles realmente omitidos aparecen por separado. Consulta [Detalles imprimibles](auto-paint#printable-detail).

## Correspondencia de color mejorada

Busca órdenes de materiales con repeticiones, requisitos de colores distintos o tramado espacial de altura. Ofrecen compromisos entre cobertura, grosor, cambios y cálculo. Consulta [Correspondencia de color mejorada](auto-paint#enhanced-color-matching).

## Pintura plana

Crea una placa multimaterial en lugar de relieve, boca abajo con soporte transparente o boca arriba sin él. Lee [Pintura plana](flat-paint) antes de exportar porque importan la cara de observación y las asignaciones.

## Ajustes del optimizador

**Algoritmo**, **Prioridad regional**, **Detalle de transición** y **Semilla** ajustan la correspondencia, no la velocidad de impresión. Consulta [Ajustes del optimizador](auto-paint#optimizer-settings).

## Zonas de transición y confianza

Las zonas describen secuencias físicas; la confianza describe evidencia y limitaciones del modelo, no exactitud medida. Consulta [Leer el resultado](auto-paint#transition-zones-and-confidence).

## Prueba de paleta

Compara una probeta impresa con colores elegidos de la imagen y registra qué candidatos coinciden. Consulta [Flujos de calibración](calibration-workflows#palette-proof-compare-artwork-colors).

## Matriz de apilamientos

Fotografía una placa guardada de recetas, verifica su alineación y guarda colores medidos para apilamientos compatibles. Consulta [Flujos de calibración](calibration-workflows#stack-matrix-photograph-known-recipes).

## Controles de vista previa

Arrastra con el botón principal para orbitar, usa la rueda para ampliar y el secundario para desplazar. La cámara nunca cambia dimensiones físicas.

| Control | Uso | Efecto en la impresión |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Color fiel** | Comparar muestras sin iluminación de escena ni mapeo tonal cinematográfico. | Solo vista. Sigue dependiendo del modelo y pantalla; no valida calibración. |
| **Sombreado** | Inspeccionar relieve iluminado y forma. | Solo vista; la luz cambia la apariencia del color. |
| **Transparente** | Ver capas superpuestas. | Solo vista; no vuelve transparente el filamento. |
| **Alámbrico** | Examinar aristas coloreadas por capa. | Solo vista; no son trayectorias de extrusión. |
| **Colores de vista previa** | Alternar mezclas simuladas y colores físicos. | Solo vista. Las exportaciones conservan asignaciones reales. |
| **Cambiar cámara** | Perspectiva con profundidad u ortográfica sin acortamiento. | Solo vista. Se conserva la posición. |
| **Deshacer / Rehacer** | Recorrer historial compartido de imagen. | No deshace campos 3D ni filamentos. Regenera tras cambiar la imagen. |
| **Descargar** | Exportar STL o 3MF generado. | Usa el último modelo, no ajustes laterales sin aplicar. |

Se recuerdan el modo de vista y la elección simulada/física. **Colores de vista previa** solo aparece para un modelo generado de pintura automática.

## Vista previa de capas

Arrastra los controles inferior y superior de la barra inferior para aislar un intervalo de altura. Se ajustan a la cuadrícula de capas. Pasa el puntero por segmentos de material para información de inicio o cambio.

![Los límites ocultan capas para inspección, pero la exportación sigue incluyendo el modelo completo.](19_preview_only.svg)

_Esquema. Ocultar una capa en pantalla nunca la elimina de la exportación._

Pintura plana tiene una pista lisa porque varios materiales pueden ocupar una capa. Orbita por debajo de la disposición boca abajo para ver su ilustración.

Un cálculo fallido puede dejar visible la última generación correcta. No lo tomes como prueba de que los nuevos ajustes funcionaron. Las instrucciones usan la instantánea generada cuando existe. Resuelve el error, vuelve a generar y después inspecciona y exporta.

Siguiente: [Controles de pintura automática](auto-paint), [Pintura plana](flat-paint) o [Generación y exportación](generating-exporting-output).
