---
title: Présentation
slug: overview
order: 10
description: Le rôle de Kromacut et l’articulation des principaux parcours de création.
---

# Présentation

Kromacut transforme une image plane en une impression 3D composée de couches de couleurs empilées. Le principe est simple : les couleurs de l’image deviennent des couches physiques, dont l’ordre et la hauteur constituent le plan d’impression.

Utilisez Kromacut pour réaliser une impression de type HueForge, un relief coloré de type lithophanie ou une pièce décorative en couches dont les changements de filament composent l’image finale.

## Parcours principal

La plupart des projets suivent le même chemin :

1. [Charger ou importer une image](loading-images).
2. [Réduire les couleurs](reducing-colors) jusqu’à obtenir une palette imprimable dans l’aperçu.
3. [Détramer ou nettoyer](dedithering-cleanup) les pixels isolés si l’image paraît bruitée.
4. Passer en [mode 3D](3d-mode) et choisir Manuel ou Peinture automatique.
5. [Générer et exporter](generating-exporting-output) un fichier STL ou 3MF, puis suivre les instructions d’impression.

## Deux façons de peindre

Kromacut propose deux méthodes d’impression en mode 3D.

| Méthode | À utiliser lorsque | Ce que vous contrôlez |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Manuel | Vous souhaitez contrôler directement chaque couleur de l’image. | Ordre des couleurs, épaisseurs par couleur, paramètres d’impression et changements de filament. |
| Peinture automatique | Vous souhaitez que Kromacut prépare l’empilement physique des filaments. | Couleurs des filaments, distances de masquage, hauteur maximale et options d’optimisation. |

Le mode Manuel part des couleurs affichées dans le panneau **Couleurs de l’image**. La peinture automatique part de vos filaments réels et de leurs **distances de masquage (HD)**, puis génère des couches imprimables pour l’image.

## Ce que l’application affiche

Utilisez la 2D pour préparer l’illustration et la 3D pour prévoir les couches physiques. Les guides ci-dessous suivent cette distinction.

## Guides illustrés

Commencez par la tâche que vous souhaitez accomplir. Chaque guide explique les commandes, leurs interactions et leurs conséquences sur l’impression physique. Les schémas sont des exemples de principe, pas des prédictions de couleurs étalonnées. Cliquez sur une illustration ou activez-la au clavier pour l’ouvrir en taille réelle.

| Tâche | Guide |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Définir les dimensions, les hauteurs de couche et l’ordre manuel des couleurs | [Mode 3D](3d-mode) |
| Choisir les filaments, optimiser les mélanges et examiner les détails imprimables | [Peinture automatique](auto-paint) |
| Créer une plaque plane multimatériau, face vers le haut ou vers le bas | [Peinture à plat](flat-paint) |
| Mesurer la HD, comparer des épreuves de palette ou photographier une matrice d’empilements | [Méthodes d’étalonnage](calibration-workflows) |
| Préparer la silhouette et retoucher les pixels | [Chargement des images](loading-images) |
| Régler les tons et les couleurs, puis appliquer le résultat | [Réglages d’image](image-adjustments) |
| Réduire les couleurs et gérer les palettes | [Réduction des couleurs](reducing-colors) |
| Retirer les points isolés sans confondre nettoyage 2D et tramage de hauteur | [Détramage et nettoyage](dedithering-cleanup) |
| Vérifier l’empilement terminé et le transférer vers un logiciel de découpe | [Génération et export](generating-exporting-output) |

## Organisation de l’espace de travail

L’espace de travail comprend trois zones principales :

- L’en-tête contient la documentation, les commandes de thème et les liens communautaires.
- Le panneau de gauche contient les commandes du mode actif.
    - En **2D**, il présente les réglages, le détramage, la quantification, les palettes personnalisées et les couleurs détectées dans l’image.
    - En **3D**, il présente les paramètres d’impression, les commandes manuelles, celles de peinture automatique et les instructions d’impression.
- L’aperçu principal affiche le canevas de l’image 2D ou le modèle 3D.

> Conseil : les paramètres 3D ne régénèrent pas automatiquement le modèle. Après avoir modifié les paramètres d’impression, les épaisseurs manuelles ou les options de peinture automatique, cliquez sur **Générer le modèle 3D**.

## Un bon premier projet

Commencez par une image contrastée dont le sujet se détache bien et dont l’arrière-plan contient peu de détails. Réduisez-la à 4 à 16 couleurs, puis utilisez le mode Manuel si vous connaissez déjà l’ordre des couches souhaité, ou la peinture automatique si vous disposez de distances de masquage étalonnées.

---

Suite : [Démarrage rapide](quick-start).
