---
title: Reducir colores
slug: reducing-colors
order: 40
description: Comprende la reducción en dos etapas, las paletas fijas y la diferencia entre recolorear y dar transparencia.
---

# Reducir colores

La cuantización sustituye muchos colores originales por un conjunto menor, simplificando las regiones usadas en los flujos 3D Manual y Pintura automática. Una paleta 2D contiene colores objetivo de imagen, no un perfil de filamentos ni predicciones medidas de impresión.

Recorta y redimensiona primero. Si has cambiado los [ajustes de imagen](image-adjustments), pulsa Aplicar en ese panel antes de cuantizar.

## El proceso de dos etapas

![El peso del algoritmo limita la paleta intermedia; Número de colores o una paleta fija controla la segunda etapa.](34_quantization_pipeline.svg)

**Peso del algoritmo** y **Número de colores** tienen funciones diferentes. K-means con peso 128 primero agrupa el original en hasta 128 colores. Auto con número 16 fusiona después ese resultado hasta un máximo de 16. El peso no es porcentaje, opacidad ni número de filamentos.

| Campo o acción | Significado |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paleta: Auto | Encuentra colores según la imagen y limita su número. |
| Paleta: integrada, proveedor o personalizada | Asigna la imagen intermedia a los colores activados de la paleta. No tienen que aparecer todos los disponibles. |
| Número de colores | Límite final superior de Auto: 2 a 256, predeterminado 16. Desactivado para paletas fijas. |
| Peso del algoritmo | Presupuesto de paleta intermedia: 2 a 256, predeterminado 128. Un valor mayor suele conservar más detalle intermedio, no necesariamente una mejor coincidencia final. |
| Algoritmo | Método de reducción inicial. Predeterminado: K-means. |
| Aplicar | Procesa la imagen subyacente y crea un paso de Deshacer. Cambiar un ajuste no la recolorea por sí solo. |
| Flecha de restablecimiento | Recupera Auto, 16 colores, peso 128 y K-means. No restaura una imagen anterior. |

El resultado puede tener menos colores que los solicitados. Subir el objetivo tras reducir no recupera colores descartados: **Deshaz** primero para comparar alternativas desde el mismo original.

La cuantización conserva los píxeles totalmente transparentes, pero vuelve **totalmente opacos todos los parcialmente transparentes**. Un borde de alfa suave no es un borde parcialmente impreso.

## Elegir un algoritmo

Estos métodos agrupan colores. Ninguno añade tramado espacial ni garantiza que un detalle pequeño sobreviva al ancho de línea de la boquilla.

| Algoritmo | Qué cambia | Comparación útil |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ninguno (solo posprocesado) | Omite el cuantizador inicial; Peso se desactiva. La reducción final o asignación a paleta fija sigue funcionando. | Asignar directamente una ilustración limpia a una paleta conocida. No es un interruptor universal para dejar todo intacto. |
| Posterizar | Divide los canales RGB en pasos discretos y después aplica el peso. | Gráficos deliberadamente escalonados; los niveles disponibles cambian por saltos. |
| Corte mediano | Divide la distribución de colores en grupos representados por promedios. | Comparar cuando otro método pierde un grupo tonal importante. |
| K-means | Encuentra grupos ponderados por número de píxeles con inicialización aleatoria. | Punto de partida para fotos e ilustraciones mixtas. Las ejecuciones desde el mismo original pueden variar ligeramente. |
| Wu | Usa estadísticas de distribución para elegir divisiones con menor variación interna. | Comparar con degradados y fotografías. |
| Octree | Agrupa mediante subdivisiones RGB y combina grupos para ajustarse al presupuesto. | Comparar con ilustraciones de muchas regiones distintas. |

No existe un algoritmo universalmente mejor. Inspecciona el sujeto, letras pequeñas y acentos importantes al tamaño físico previsto.

## Paletas fijas y de proveedores

Una paleta fija solo ofrece sus colores elegidos. Después de cualquier reducción inicial, cada píxel no transparente se asigna al color disponible más cercano en el espacio Lab. Es correspondencia de colores de imagen, no simulación óptica del filamento.

Las **Paletas de proveedores** son referencias no oficiales de nombres y colores hexadecimales anunciados de filamentos. No garantizan disponibilidad actual ni exactitud del color impreso. Por ejemplo, los colores de referencia Bambu usan la [tabla hexadecimal de filamentos de Bambu Lab](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf). Kromacut no está afiliado ni respaldado por los fabricantes.

Las paletas integradas y de proveedores son de solo lectura. Clona una para personalizarla. Usa por separado la [calibración de filamentos](calibration-theory) para el comportamiento real de bobinas y capas.

## Paletas personalizadas

| Control | Qué hacer |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Crear paleta | Ponle nombre y añade al menos un color válido activado. Queda seleccionada. |
| Editar paleta seleccionada | Cambia una paleta personalizada, no los píxeles actuales. Aplica después la cuantización. |
| Añadir color | Añade selector, campo hexadecimal y nombre opcional. Valores válidos: `#RGB` o `#RRGGBB`; las filas no válidas se omiten al guardar. |
| Nombre opcional del color | Etiqueta un color, por ejemplo con el nombre de la bobina. No cambia la correspondencia. |
| Icono de ojo | Desactiva un color guardado sin borrarlo. Debe quedar al menos uno válido activado. |
| Quitar fila | Borra la fila; no puedes quitar la última. |
| Clonar | Copia una paleta distinta de Auto a una personalizada editable, conservando nombres y estados desactivados. |
| Importar | Lee un `.kpal` e informa de entradas importadas, sobrescritas, duplicadas o renombradas. Selecciona la primera importada cuando procede. |
| Exportar | Guarda la paleta personalizada seleccionada como `.kpal`, con nombres y colores desactivados. Clona las integradas antes de exportar una copia editable. |
| Eliminar paleta seleccionada | Quita la paleta guardada y devuelve la selección a Auto. No borra píxeles. |
| Guardar / Cancelar | Confirma o descarta el borrador del editor. |

Una etiqueta como **Mis bobinas (5/8)** significa cinco colores activados de ocho guardados. Solo participan los activados. Las paletas y la selección se guardan localmente; exporta copias antes de borrar datos de la aplicación o navegador. Son independientes de los [perfiles de filamentos](settings-and-controls#filament-profile-files).

## Colores de la imagen

Colores de la imagen describe la imagen subyacente, no ajustes en directo sin aplicar. Su insignia excluye píxeles totalmente transparentes. Las ayudas muestran hexadecimal, alfa y número de píxeles. Distintos valores alfa pueden crear entradas separadas con el mismo RGB. Las imágenes muy coloridas muestran una lista limitada, no todos sus colores fotográficos.

Pulsa una muestra para **Editar color**. Usa el selector RGBA o el campo hexadecimal y aplica. Seis dígitos cambian RGB conservando el alfa actual del selector; ocho incluyen el alfa explícitamente. Usa el control de transparencia o un sufijo alfa explícito cuando importe la opacidad.

![El reemplazo opaco recolorea cada coincidencia exacta, alfa cero quita esos píxeles y Eliminar reasigna colores en vez de recortar agujeros.](35_swatch_operations.svg)

| Acción | Qué cambia |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aplicar un color opaco | Sustituye cada coincidencia exacta de RGB y alfa en toda la imagen, incluidas regiones desconectadas. |
| Aplicar alfa totalmente transparente | Quita píxeles coincidentes de la imagen visible y la silueta imprimible. También desaparecen coincidencias del sujeto. |
| Aplicar a la muestra transparente | Sustituye todos los píxeles completamente transparentes, pudiendo añadir fondo o rellenar agujeros. |
| Eliminar | Recuantiza con la paleta objetivo restante. **No** borra píxeles. El algoritmo inicial elegido sigue ejecutándose, así que otros colores pueden cambiar. |
| Cerrar / Escape | Descarta la edición no confirmada. |

Elige **Ninguno (solo posprocesado)** antes de Eliminar para asignar directamente a la paleta restante. Usa [Relleno o Goma](loading-images#touch-up-pixels) para cambios locales. Deshaz si cambia más imagen de la prevista.

Las instrucciones manuales de cambios se desactivan por encima de 64 colores no transparentes. Una paleta menor puede simplificar el apilamiento incluso por debajo del límite, pero menos objetivos no implica automáticamente menos cambios en pintura automática.

Siguiente: [Eliminación de tramado y limpieza](dedithering-cleanup).
