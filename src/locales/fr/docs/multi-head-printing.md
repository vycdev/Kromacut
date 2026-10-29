---
title: Impression multi-têtes
slug: multi-head-printing
order: 65
description: Planifier les affectations de filaments, les rechargements des têtes et les exports 3MF pour l’impression multi-têtes.
---

# Impression multi-têtes

Le mode multi-têtes réorganise l’empilement imprimable choisi par [Auto-paint](auto-paint). Chaque région de l’image peut utiliser un filament différent sur une même couche. Plusieurs têtes gardent les filaments disponibles entre les rechargements manuels ; l’analyse recherche de meilleures correspondances de couleurs prédites et planifie les rechargements nécessaires. Moins de pauses sont possibles, mais ce n’est pas garanti.

## Prérequis

- Utilisez **Auto-paint** avec au moins un filament dans sa liste, puis activez le **Mode multi-têtes**.
- Choisissez **2 à 8 têtes** et une **Profondeur de recherche**, puis **Construire le modèle 3D**. L’analyse nécessite au moins deux filaments disponibles pour former une fenêtre utile.

Le mode multi-têtes et **Flat Paint** sont incompatibles. Étalonnez les filaments que vous possédez réellement ; voir [Théorie de l’étalonnage](calibration-theory). Le mode, le nombre de têtes et la profondeur de recherche sont conservés entre les sessions. Reconstruisez après toute modification des paramètres.

## Séquences et fenêtres

Une **séquence** est un bloc de couches contiguës utilisant un seul filament dans l’empilement Auto-paint. Son épaisseur provient du résultat imprimable d’Auto-paint, étalonnage et contraintes de hauteur compris, et pas seulement de la luminosité de l’image source.

Une **fenêtre** couvre N séquences consécutives. N est limité par le nombre de têtes choisi et les filaments disponibles. L’analyse sélectionne des fenêtres utiles sans chevauchement ; elle ne regroupe pas automatiquement toutes les séquences. Les séquences hors des fenêtres sélectionnées conservent leur filament prévu et figurent dans le planning des têtes.

![Des séquences de couleurs regroupées en fenêtres d’exemple ; les séquences restantes conservent leur filament prévu.](01_window_run_diagram.svg)

## Choix des filaments par fenêtre

Avec K filaments distincts dans une fenêtre et N positions de séquence, **K^N** ordres sont possibles, répétitions comprises. L’analyse compare les mélanges prédits avec la différence de couleur **ΔE** et attribue un ordre à chaque région de couleur de l’image. Une position de séquence n’est pas une tête physique fixe : le planning affecte les filaments nécessaires aux têtes.

![Changer l’ordre des mêmes filaments modifie le mélange prédit ; les couleurs sont schématiques.](03_beer_lambert_blending.svg)

![Les 27 ordres pour trois filaments et trois positions, avec un tableau montrant la croissance de K^N.](05_combo_search_space.svg)

La **Profondeur de recherche** règle le seuil de sélection des fenêtres, leur nombre possible et le nombre d’ordres testés :

- **Rapide** utilise moins d’itérations de sélection des fenêtres et un budget de combinaisons réduit.
- **Équilibré** est le compromis par défaut entre effort et couverture.
- **Approfondi** autorise davantage de fenêtres et un budget de combinaisons supérieur ; les grands espaces peuvent toujours être échantillonnés.

Dans le budget de chaque profondeur, toutes les combinaisons sont testées. Au-delà, un échantillon limité et déterministe est utilisé avec l’ordre actuel. Des entrées identiques donnent des résultats reproductibles. Chaque profondeur considère les mêmes couleurs de l’image ; une recherche plus poussée ne garantit pas une meilleure impression réelle. Pour le regroupement des cibles, voir [Regroupement des couleurs](#color-grouping).

## Regroupement des couleurs

Avant la recherche, Kromacut regroupe les couleurs de votre palette en couleurs cibles à reproduire. Le réglage **Regroupement des couleurs** détermine comment :

- **Par couche (actuel)** — les couleurs affectées à une même couche imprimable du résultat Auto-paint sont réunies en une cible. Des teintes différentes peuvent donc partager une cible. Il existe au plus un groupe cible par couche occupée.
- **Par couleur (par teinte)** — les teintes distinctes peuvent rester des cibles séparées sur leurs couches d’impression d’origine. Les grandes palettes sont réduites selon un budget de groupes, avec au moins un groupe par couche occupée ; les couleurs de couches différentes ne sont jamais fusionnées.

Le regroupement par couleur ne garantit ni une erreur de couleur plus faible ni davantage de couleurs imprimées. Le résultat dépend de l’image, de l’étalonnage des filaments, du nombre de têtes et des fenêtres sélectionnées. La recherche minimise la différence de couleur CIE76 ; un meilleur score de recherche peut malgré tout correspondre à une erreur CIEDE2000 plus élevée. La construction peut prendre plus de temps. Les couleurs imprimables restent limitées par vos filaments et leurs empilements physiques.

Le regroupement des couleurs est enregistré dès sa modification, avant la construction. Reconstruisez avec chaque option et comparez les aperçus de votre image.

## Planning des têtes et export

Après une construction réussie, l’aperçu affiche la couleur simulée de chaque région selon son affectation. **Couleurs physiques** affiche le filament réel. Ouvrez les **Instructions d’impression** et suivez le **Planning des têtes** :

- Avant l’impression, chargez chaque filament indiqué dans sa tête numérotée. Laissez les têtes marquées **VIDE** inutilisées.
- À chaque couche de contrôle indiquée, rechargez uniquement les têtes marquées. Les chargements inchangés sont conservés ; toutes les limites de fenêtre ne nécessitent pas une pause.
- Exportez en **3MF** pour conserver la géométrie répartie, les couleurs physiques des filaments et les affectations des têtes. Le fichier enregistre le nombre de têtes choisi comme nombre d’extrudeurs et ajoute des marqueurs de pause **M600** aux points de changement du planning. STL ne conserve pas ces affectations.

![Trois têtes conservent les filaments inchangés entre les phases ; seuls les chargements modifiés nécessitent un rechargement manuel.](02_nozzle_swap_schedule.svg)

Utilisez une imprimante multi-têtes compatible. Vérifiez les affectations des têtes, les hauteurs de la première couche et des couches suivantes, ainsi que la gestion des pauses dans le trancheur avant d’imprimer. Un même point de contrôle peut nécessiter plusieurs rechargements.

## Repli et reconstruction

Si l’analyse échoue ou ne trouve aucune disposition exploitable améliorant l’empilement normal, la construction produit un modèle normal à une tête avec un message, sa couleur de départ et ses instructions de changement d’origine. Essayez d’autres filaments, un autre nombre de têtes ou une autre profondeur de recherche, puis reconstruisez.

L’analyse s’exécute en arrière-plan. Quitter le panneau 3D ou changer d’image annule l’analyse en cours ; reconstruisez pour la nouvelle image. Les instructions et exports décrivent le modèle construit : reconstruisez pour appliquer les paramètres modifiés.

Suite : [Génération et export](generating-exporting-output).
