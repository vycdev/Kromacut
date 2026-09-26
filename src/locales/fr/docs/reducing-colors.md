---
title: Réduction des couleurs
slug: reducing-colors
order: 40
description: Comprendre la réduction en deux étapes, les palettes fixes et la différence entre recoloration et transparence.
---

# Réduction des couleurs

La quantification remplace les nombreuses couleurs sources par un ensemble plus petit, simplifiant les zones utilisées par les parcours 3D Manuel et Peinture automatique. Une palette 2D contient les couleurs cibles de l’image, pas un profil de filaments de peinture automatique ni des prédictions d’impression mesurées.

Recadrez et redimensionnez d’abord. Si vous avez modifié les [réglages d’image](image-adjustments), cliquez sur Appliquer dans ce panneau avant de quantifier.

## Le traitement en deux étapes

![Le poids de l’algorithme limite la palette intermédiaire ; le nombre de couleurs ou une palette fixe sélectionnée contrôle la deuxième étape.](34_quantization_pipeline.svg)

Le **Poids de l’algorithme** et le **Nombre de couleurs** ont des fonctions différentes. K-means avec un poids de 128 regroupe d’abord la source en 128 couleurs au maximum. Auto avec un nombre de couleurs de 16 fusionne ensuite ce résultat en 16 couleurs au maximum. Le poids n’est ni un pourcentage, ni une opacité, ni un nombre de filaments.

| Champ ou action | Signification |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette : Auto | Trouve des couleurs adaptées à l’image, puis limite leur nombre. |
| Palette : intégrée, fournisseur ou personnalisée | Associe l’image intermédiaire aux couleurs activées de la palette choisie. Toutes les couleurs disponibles ne doivent pas nécessairement apparaître. |
| Nombre de couleurs | Limite finale d’Auto : de 2 à 256, avec 16 par défaut. Désactivé pour une palette fixe. |
| Poids de l’algorithme | Budget de palette intermédiaire : de 2 à 256, avec 128 par défaut. Une valeur supérieure conserve généralement davantage de détails intermédiaires, sans garantir une meilleure correspondance finale. |
| Algorithme | Méthode de réduction de première étape. Par défaut : K-means. |
| Appliquer | Traite l’image sous-jacente et crée une étape d’annulation. Changer un réglage seul ne recolore pas l’image. |
| Flèche de réinitialisation | Rétablit Auto, 16 couleurs, poids 128 et K-means. Ne restaure pas une image antérieure. |

Le résultat peut contenir moins de couleurs que demandé. Augmenter la cible après réduction ne récupère pas les couleurs supprimées : **annulez** d’abord pour comparer des alternatives depuis la même source.

La quantification conserve les pixels entièrement transparents, mais rend **tous les pixels partiellement transparents entièrement opaques**. Un bord à alpha progressif n’est pas un bord partiellement imprimé.

## Choisir un algorithme

Ces méthodes regroupent les couleurs. Aucune n’ajoute de motif de tramage spatial ni ne garantit qu’un petit détail résistera à la largeur de ligne de votre buse.

| Algorithme | Ce qui change | Comparaison utile |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Aucun (post-traitement seul) | Saute la quantification de première étape ; le poids est désactivé. La réduction finale du nombre ou l’association à la palette fixe a toujours lieu. | Associer directement une illustration nette à une palette connue. Ce n’est pas une option universelle « laisser l’image inchangée ». |
| Postérisation | Divise les canaux RVB en paliers discrets, puis applique la limite du poids. | Graphismes volontairement en paliers ; les niveaux disponibles des canaux changent par sauts discrets. |
| Coupe médiane | Divise la distribution des couleurs en groupes représentés par des couleurs moyennes. | À comparer lorsqu’une autre méthode perd un groupe tonal important. |
| K-means | Recherche des groupes de couleurs pondérés par le nombre de pixels, avec une initialisation aléatoire. | Point de départ pour les photos et illustrations mixtes. Les essais depuis la même source peuvent varier légèrement. |
| Wu | Utilise les statistiques de distribution des couleurs pour choisir des divisions avec moins de variation interne. | À comparer sur les dégradés et les photographies. |
| Octree | Regroupe les couleurs par subdivisions RVB, puis fusionne les groupes pour respecter le budget. | À comparer sur les illustrations comportant de nombreuses zones distinctes. |

Il n’existe pas d’algorithme universellement meilleur. Examinez le sujet, les petites lettres et les accents importants aux dimensions physiques prévues.

## Palettes fixes et de fournisseurs

Une palette fixe ne propose que les couleurs choisies. Après l’éventuelle première réduction, chaque pixel non transparent est associé à la couleur disponible la plus proche dans l’espace Lab. Il s’agit d’une correspondance de couleurs d’image, pas d’une simulation optique de filament.

Les **Palettes de fournisseurs** sont des ensembles de référence non officiels de noms de filaments et de couleurs hexadécimales annoncées. Elles ne garantissent ni la disponibilité actuelle des produits ni l’exactitude des couleurs imprimées. Les couleurs Bambu utilisent par exemple le [nuancier hexadécimal des filaments Bambu Lab](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf). Kromacut n’est affilié à aucun fabricant et n’est approuvé par aucun d’eux.

Les palettes intégrées et de fournisseurs sont en lecture seule. Clonez-en une pour la personnaliser. Utilisez séparément l’[étalonnage des filaments](calibration-theory) pour le comportement réel des bobines et des couches.

## Palettes personnalisées

| Commande | Marche à suivre |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Créer une palette | Nommez-la et ajoutez au moins une couleur valide activée. Elle devient la palette sélectionnée. |
| Modifier la palette sélectionnée | Modifie une palette personnalisée, pas les pixels actuels. Appliquez ensuite la quantification. |
| Ajouter une couleur | Ajoute un sélecteur, un champ hexadécimal et un nom facultatif. Les entrées valides utilisent `#RGB` ou `#RRGGBB` ; les lignes invalides sont omises à l’enregistrement. |
| Nom de couleur facultatif | Étiquette une couleur, par exemple avec un nom de bobine. Ne modifie pas la correspondance. |
| Icône œil | Désactive une couleur enregistrée sans la supprimer. Au moins une couleur valide doit rester activée. |
| Retirer une ligne | Supprime la ligne ; impossible de supprimer la dernière. |
| Cloner | Copie une palette autre qu’Auto en palette personnalisée modifiable, en conservant les noms et les couleurs désactivées. |
| Importer | Lit un fichier `.kpal` et indique les entrées importées, remplacées, en double ou renommées. Sélectionne la première palette importée le cas échéant. |
| Exporter | Enregistre la palette personnalisée sélectionnée en `.kpal`, avec noms et couleurs désactivées. Clonez d’abord les palettes intégrées pour exporter une copie modifiable. |
| Supprimer la palette sélectionnée | Retire la palette enregistrée et revient à Auto. N’efface pas les pixels de l’image. |
| Enregistrer / Annuler | Valide ou abandonne le brouillon de l’éditeur. |

Une étiquette comme **Mes bobines (5/8)** indique cinq couleurs activées parmi huit entrées enregistrées. Seules les couleurs activées participent. Les palettes et la sélection sont enregistrées localement ; exportez des sauvegardes avant d’effacer les données de l’application ou du navigateur. Elles sont distinctes des [profils de filaments](settings-and-controls#filament-profile-files).

## Couleurs de l’image

Couleurs de l’image décrit l’image sous-jacente, pas les réglages en direct non appliqués. Son badge exclut les pixels entièrement transparents. Les infobulles affichent code hexadécimal, alpha et nombre de pixels. Des alpha différents peuvent créer des entrées distinctes avec les mêmes valeurs RVB. Les images très colorées ont une liste d’affichage limitée plutôt que toutes leurs couleurs photographiques.

Cliquez sur un échantillon pour **Modifier la couleur**. Utilisez le sélecteur RVBA ou le champ hexadécimal, puis appliquez. Six chiffres modifient le RVB en conservant l’alpha actuel du sélecteur ; huit chiffres incluent explicitement l’alpha. Utilisez la commande de transparence ou un suffixe alpha explicite lorsque l’opacité importe.

![Un remplacement opaque recolore chaque correspondance exacte, un alpha nul retire ces pixels et Supprimer réassocie les couleurs au lieu de découper des trous.](35_swatch_operations.svg)

| Action | Ce qui change |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Appliquer une couleur opaque | Remplace chaque correspondance exacte RVB et alpha dans toute l’image, y compris les zones déconnectées. |
| Appliquer un alpha entièrement transparent | Retire les pixels correspondants de l’image visible et de la silhouette imprimable. Les pixels correspondants du sujet disparaissent aussi. |
| Appliquer à l’échantillon transparent | Remplace tous les pixels entièrement transparents, avec la possibilité d’ajouter un fond ou de remplir des trous. |
| Supprimer | Requantifie avec la palette cible restante. Cela **n’efface pas** les pixels. L’algorithme de première étape sélectionné s’exécute toujours ; d’autres couleurs peuvent donc aussi changer. |
| Fermer / Échap | Abandonne la modification non validée. |

Choisissez **Aucun (post-traitement seul)** avant Supprimer pour une association directe à la palette restante. Utilisez [Remplissage ou Gomme](loading-images#touch-up-pixels) pour une modification locale. Annulez si une trop grande partie de l’image change.

Les instructions de changement manuel sont désactivées au-delà de 64 couleurs non transparentes. Une palette plus petite peut simplifier l’empilement même sous cette limite, mais moins de cibles ne signifie pas automatiquement moins de changements de filament en peinture automatique.

Suite : [Détramage et nettoyage](dedithering-cleanup).
