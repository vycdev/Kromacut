---
title: Démarrage rapide
slug: quick-start
order: 20
description: Une première utilisation pratique, de l’image à l’export.
---

# Démarrage rapide

Ce guide présente un projet courant, du chargement de l’image à l’export.

## Charger ou importer une image

Utilisez le bouton de chargement dans la barre d’outils de l’aperçu ou faites glisser une image dans l’aperçu 2D.

Après le chargement, utilisez la molette pour zoomer et faites glisser l’aperçu pour le déplacer. Si l’image contient de la transparence, le bouton de damier permet de mieux distinguer les zones transparentes.

## Régler l’image

En **2D**, utilisez les **Réglages** avant de réduire les couleurs. L’exposition, le contraste, les hautes lumières, les ombres, les blancs, les noirs, la saturation, la vibrance, la teinte, la température, la nuance et la clarté peuvent tous modifier les couleurs trouvées par les outils de palette.

Cliquez sur **Appliquer** dans le panneau Réglages pour incorporer les réglages actuels à l’image avant de réduire les couleurs, de générer la géométrie 3D ou de la télécharger. Les réglages en direct ne sont qu’un aperçu, pas une mise à jour de l’image source. Consultez [Réglages d’image](image-adjustments) pour des exemples avant/après et le fonctionnement de la réinitialisation.

## Redimensionner si nécessaire

Si l’image est bien plus grande que le niveau de détail souhaité à l’impression, utilisez **Redimensionner l’image** pour la réduire en pourcentage avant de réduire les couleurs. Cela diminue ses dimensions réelles en pixels, ce qui peut accélérer la génération du modèle 3D et faciliter le choix de ses dimensions physiques.

## Réduire les couleurs

Dans **Paramètres de quantification** :

1. Laissez **Palette** sur **Auto**, sauf si vous avez déjà une palette précise en tête.
2. Commencez avec **Nombre de couleurs** réglé sur **16**. Diminuez-le pour réduire le nombre de zones colorées sources, ou augmentez-le si l’aperçu manque de détails. En peinture automatique, ce nombre ne correspond ni au nombre de bobines ni au nombre de changements de filament.
3. Laissez **Algorithme** sur l’option par défaut **K-means**. C’est le point de départ recommandé pour la plupart des images.
4. Cliquez sur **Appliquer**.

Examinez le résultat dans le panneau **Couleurs de l’image**. Cliquez sur un échantillon pour le modifier ou le supprimer de la palette. La suppression réassocie les pixels aux couleurs restantes ; utilisez la gomme ou un alpha nul (entièrement transparent) pour retirer des pixels de la silhouette.

## Détramer ou nettoyer

Si la réduction des couleurs laisse des points isolés, utilisez **Détramage** comme passe de débruitage. C’est particulièrement utile, car les pixels isolés de l’image 2D peuvent devenir autant de petits éléments géométriques dans le modèle 3D.

Commencez avec les valeurs par défaut de **Poids** et de **Passes**, puis cliquez sur **Appliquer**. N’augmentez le nombre de passes que si une seule passe laisse encore trop de pixels isolés.

## Activer le mode 3D

Cliquez sur **3D**. Définissez d’abord les paramètres d’impression essentiels :

- **Taille du pixel (XY)** contrôle la largeur et la profondeur physiques de chaque pixel de l’image.
- **Hauteur de couche** doit correspondre à la hauteur prévue dans le logiciel de découpe.
- **Hauteur de première couche** doit correspondre au réglage de première couche de votre logiciel de découpe.
- **Maillage lissé** peut adoucir les frontières de couleurs connectées pour obtenir une géométrie plus lisse.

## Choisir Manuel ou Peinture automatique

Utilisez **Manuel** pour contrôler directement les couleurs de l’image réduite. Le mode Manuel reprend les échantillons de **Couleurs de l’image** : faites glisser les couleurs dans l’ordre d’impression souhaité, puis utilisez le curseur de chaque ligne pour définir l’épaisseur apportée par cette couleur. C’est un bon premier choix si vous connaissez déjà l’ordre souhaité ou si votre palette est petite et simple.

Utilisez **Peinture automatique** pour laisser Kromacut préparer l’empilement physique des filaments. La peinture automatique part de vos filaments réels plutôt que des échantillons de l’image réduite, puis utilise la couleur et la **Distance de masquage (HD)** de chaque filament — la profondeur à laquelle il masque ce qui se trouve dessous — pour estimer l’apparence des couches empilées.

Pour un premier essai en peinture automatique :

1. Ajoutez les filaments que vous comptez réellement utiliser.
2. Définissez aussi précisément que possible la couleur de chaque filament.
3. Renseignez sa **HD**. L’estimation par baguette convient pour expérimenter ; vous pouvez aussi convertir une valeur TD conventionnelle (≈10 fois la HD). Des distances de masquage étalonnées donnent généralement les meilleurs résultats.
4. Laissez d’abord **Hauteur maximale** sur **Auto**.
5. Activez **Correspondance des couleurs améliorée** si le premier résultat restitue mal des couleurs importantes ou si vous souhaitez que l’optimiseur cherche un meilleur ordre de filaments.

Une fois l’empilement calculé, vérifiez les zones de transition et les détails de confiance avant d’exporter. Une faible confiance signifie généralement qu’il manque une couleur utile parmi les filaments, que les distances de masquage doivent être étalonnées ou que la hauteur maximale est trop restrictive.

## Générer et exporter

Cliquez sur **Générer le modèle 3D**. Lorsque le modèle apparaît, utilisez le curseur **Aperçu des couches** pour examiner la construction de bas en haut.

Ouvrez le menu de téléchargement et choisissez **Télécharger STL** ou **Télécharger 3MF**. Copiez ensuite les **Instructions d’impression** pour conserver la couleur de départ, les couches de changement et les paramètres de découpe recommandés.

Suite : [Mode 3D](3d-mode), [Peinture automatique](auto-paint) ou [Génération et export](generating-exporting-output#before-you-export).
