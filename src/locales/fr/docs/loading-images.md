---
title: Chargement des images
slug: loading-images
order: 30
description: Importer, recadrer, redimensionner et retoucher les pixels avant leur conversion en zones imprimées.
---

# Chargement des images

En mode **2D**, vous préparez l’image que le modèle 3D utilisera. Les changements de couleur affectent les couleurs cibles ; les retouches de pixels affectent les formes et les détails imprimés.

## Choisir une source

Cliquez sur **Choisir un fichier** dans la barre d’outils de l’aperçu, ou faites glisser un fichier image dans l’aperçu 2D. Seul le premier fichier déposé est chargé. Utilisez un format que votre navigateur ou la vue web de l’application peut décoder ; le PNG est utile lorsque la transparence importe. Développez d’abord les fichiers RAW de votre appareil photo et exportez-les dans un format d’image courant.

Kromacut démarre avec son logo comme exemple. Charger une autre image remplace l’image de travail actuelle. Cela ne publie pas l’image et ne télécharge pas de source à partir d’un lien web collé.

## Examiner sans modifier l’image

| Commande | Effet |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Molette | Zoome autour du pointeur. Cela change uniquement la vue, pas la résolution ni les dimensions d’impression. |
| Glisser avec le bouton gauche | Déplace la vue lorsqu’aucun outil de retouche n’est actif. |
| Glisser avec le bouton central | Déplace la vue même lorsqu’un outil de retouche est actif. |
| Afficher/masquer le damier | Affiche un motif derrière les pixels transparents. Ce motif ne fait partie ni de l’image ni de l’impression. |
| Badge des dimensions de l’image | Affiche les dimensions en pixels. Pendant le recadrage, affiche aussi les dimensions proposées. |

L’aperçu conserve les bords nets des pixels au lieu de les lisser. Zoomez pour repérer les pixels isolés et les détails étroits.

## Recadrer, redimensionner ou changer la taille d’impression ?

![Le recadrage retire une partie de l’image, le redimensionnement réduit la résolution et la taille du pixel modifie l’échelle physique de chaque pixel.](30_crop_resize_scale.svg)

_Les dimensions schématiques illustrent la relation, pas une taille d’impression recommandée._

### Recadrer

Cliquez sur **Recadrer**, faites glisser la sélection ou ses poignées de coin et de bord, puis choisissez **Enregistrer le recadrage**. **Annuler le recadrage** laisse l’image inchangée. L’enregistrement conserve le rectangle sélectionné à la résolution des pixels de l’image.

Retirez les marges inutiles avant la réduction des couleurs pour qu’elles ne concurrencent pas le sujet dans la palette. Le recadrage est rectangulaire ; utilisez la transparence pour un arrière-plan irrégulier.

### Redimensionner l’image

L’**Échelle** va de **1 % à 100 %**, avec **50 %** par défaut. **Actuel** et **Après redimensionnement** affichent les dimensions avant validation. Cliquez sur **Appliquer** pour réduire l’image. 100 %, ou une valeur arrondie aux mêmes dimensions, ne change rien. La flèche de réinitialisation rétablit le pourcentage, pas l’image.

Le redimensionnement utilise un lissage : il peut introduire des couleurs mélangées sur les bords et de la transparence partielle. Redimensionnez avant la quantification, ou réduisez de nouveau les couleurs après. Des applications répétées redimensionnent l’image déjà réduite : deux applications à 50 % laissent 25 % de la largeur et de la hauteur initiales. Utilisez Annuler pour restaurer les détails plutôt que de tenter de les agrandir ici.

### Dimensions physiques en 3D

La **Taille du pixel (XY)** est exprimée en millimètres par pixel de l’image, pas en résolution. Une image entièrement opaque de 1 000 pixels de large à 0,1 mm/pixel mesure 100 mm. Réduite à 500 pixels au même réglage, elle mesure 50 mm. Passer à 0,2 mm/pixel rétablit les 100 mm, mais pas les détails supprimés. Les marges extérieures entièrement transparentes sont exclues de l’emprise du modèle.

Réduire les dimensions en pixels allège les calculs et la géométrie. Modifier seulement la taille du pixel ne supprime aucun pixel. Consultez [Mode 3D](3d-mode) pour les commandes d’échelle physique.

## Retoucher les pixels

**Pinceau**, **Gomme**, **Remplissage**, **Texte** et **Prélever une couleur dans l’image** utilisent des pixels à bords nets, sans anticrénelage. Une couleur personnalisée peut toujours ajouter une couleur à la palette ; les bords nets évitent les mélanges indésirables sur les contours.

![Le pinceau ajoute des pixels de couleur exacte, la gomme rend les pixels transparents, le remplissage modifie une zone connectée et le texte devient des pixels aux bords nets.](31_pixel_tools.svg)

| Outil ou champ | Fonctionnement | Effet sur l’impression |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Pinceau | Faites glisser pour peindre des pixels opaques. Le diamètre va de 1 à 64 pixels de l’image, avec 4 par défaut. | Répare les contours, relie des zones ou épaissit les détails. Le curseur montre son emprise. |
| Gomme | Utilise le même réglage de taille, mais écrit des pixels entièrement transparents. | Retire de la matière de la forme et peut créer des trous ou séparer des morceaux. |
| Remplissage | Remplace la zone cliquée correspondant exactement à ses valeurs RVB et alpha. Les connexions se font par les bords, pas les diagonales. | Recolore une seule zone connectée, pas toutes les occurrences de la couleur. Aucun réglage de tolérance photographique. |
| Prélever une couleur dans l’image | Prélève un pixel source non transparent et active le pinceau. | Réutilise une couleur de l’image sous-jacente, pas l’effet d’un réglage non appliqué. |
| Couleur de l’outil | Choisissez dans Couleurs de l’image, utilisez la pipette ou saisissez un code hexadécimal à six chiffres. Fermer la fenêtre valide le choix. | Définit la couleur opaque du pinceau, du remplissage ou du texte. |
| Taille du texte | Taille de police de 6 à 128 pixels de l’image, avec 24 par défaut. | Un texte plus grand laisse des détails plus grands à échelle physique constante ; la valeur n’est pas en millimètres. |

### Placer du texte

Sélectionnez Texte, cliquez sur l’image et saisissez votre texte. Entrée ajoute une ligne. Faites glisser la poignée au-dessus du cadre pour le déplacer, ou celle du bord droit pour régler le retour à la ligne. La taille et la couleur mettent à jour le brouillon.

Cliquez sur la coche ou appuyez sur **Ctrl+Entrée** (**Commande+Entrée** sur macOS) pour appliquer. Cliquer ailleurs sur l’image ou changer d’outil valide également le texte. X ou **Échap** supprime un brouillon ouvert ; un second Échap quitte l’outil. Le texte appliqué devient des pixels, pas un objet texte modifiable.

Chaque trait modifié, remplissage ou placement de texte constitue une étape de l’historique. Un trait d’un pixel à 0,1 mm/pixel ne mesure que 0,1 mm de large, même s’il paraît grand à fort zoom. Examinez les lettres fines dans le logiciel de découpe.

## Retirer un arrière-plan

Il n’existe pas de sélection automatique du sujet ni de suppression d’arrière-plan par IA. Pour un fond uni, ouvrez son échantillon dans Couleurs de l’image, rendez-le entièrement transparent et appliquez. Cela supprime toutes les correspondances exactes, y compris dans le sujet. Utilisez la gomme pour une suppression locale et le damier pour examiner le contour.

N’utilisez pas **Supprimer** sur un échantillon dans ce but : cela réassocie les couleurs au lieu de rendre les pixels transparents. Consultez [Couleurs de l’image](reducing-colors#image-colors).

## Annuler, télécharger et vider

**Annuler** et **Rétablir** parcourent les modifications validées de l’image : chargement, recadrage, redimensionnement, application des réglages, quantification, détramage, modifications d’échantillons et retouches. Ils ne conservent pas l’historique de chaque réglage ou mouvement de curseur. Une nouvelle modification efface la branche de rétablissement. L’historique appartient à la session actuelle : enregistrez l’image si vous en aurez besoin plus tard.

**Télécharger l’image** enregistre l’image de travail sous-jacente en PNG à sa résolution en pixels. Le zoom, le damier, les poignées de recadrage et les brouillons de texte sont exclus. Validez le texte et **Appliquez les réglages** d’abord pour les inclure. Sur ordinateur, une boîte d’enregistrement s’ouvre ; dans le navigateur, l’emplacement dépend des paramètres de téléchargement.

**Retirer l’image** vide l’espace de travail, pas les réglages. Ne considérez pas cette action comme réversible : elle n’ajoute pas l’image retirée à une nouvelle étape d’annulation. Téléchargez d’abord une copie si vous souhaitez la conserver.

Suite : [Réglages d’image](image-adjustments).
