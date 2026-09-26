---
title: Détramage et nettoyage
slug: dedithering-cleanup
order: 50
description: Nettoyage du voisinage par couleurs exactes et effets sur les points isolés, les bords, la transparence et les îlots imprimables.
---

# Détramage et nettoyage

Le **Détramage** remplace les pixels insuffisamment représentés localement par des couleurs voisines. Il s’agit d’une passe de nettoyage distincte, et non d’un algorithme de quantification ou d’une simulation de ce que votre buse peut imprimer.

Utilisez-le sur des motifs tramés à couleurs répétées ou sur une image réduite comportant des points isolés. Il peut intervenir avant la quantification si la source contient déjà ces motifs, ou après sur les zones réduites. Ce n’est pas un filtre de réduction du bruit photographique : les pixels voisins d’une photo ont souvent des couleurs exactes légèrement différentes.

## Comment un pixel est choisi

![Les huit pixels voisins votent par couleur exacte. Le poids fixe le nombre de voisins identiques nécessaire pour conserver le centre ; chaque passe reprend le résultat précédent.](36_dedither_neighbors.svg)

Chaque pixel examine ses huit voisins immédiats, diagonales incluses. Si un nombre suffisant possède exactement les mêmes **valeurs RVB et alpha**, il reste inchangé. Sinon, il adopte la couleur différente la plus fréquente parmi ses voisins. Les ex æquo sont départagés aléatoirement : des réglages identiques peuvent donc produire des résultats différents.

Seules les couleurs voisines existantes, y compris les pixels transparents, sont utilisées. Elles ne sont pas moyennées pour créer une nouvelle nuance.

## Poids

Le **Poids** est le nombre de voisins identiques nécessaire pour conserver le pixel original. Plage : **1 à 9** ; valeur par défaut : **4**.

| Exemple | Résultat |
| ------------------------------------ | ------------------------------------------------------------ |
| Aucun voisin identique | Change si une autre couleur voisine existe, même avec un poids de 1. |
| Trois voisins identiques | Reste avec un poids de 3 ; peut être remplacé avec un poids de 4. |
| Le centre et les huit voisins sont identiques | Reste même avec un poids de 9, car aucun voisin différent n’existe. |

Les valeurs faibles préservent davantage les détails ; les valeurs élevées rendent davantage de pixels remplaçables. Avec seulement huit voisins, le seuil de conservation de 9 ne peut jamais être atteint. C’est un réglage de bord agressif, pas un rayon plus grand. Les pixels en bordure disposent aussi de moins de voisins.

## Passes

**Passes** répète le nettoyage de **1 à 10** fois, avec **1** par défaut. Chaque passe lit l’intégralité du résultat précédent. Des passes supplémentaires peuvent retirer des points persistants, mais aussi déplacer des bords, couper des connexions étroites ou supprimer du petit texte.

Les flèches de réinitialisation rétablissent le poids à 4 ou les passes à 1. La réinitialisation du panneau rétablit les deux. Aucune ne restaure l’image précédente ; utilisez Annuler pour cela.

## Appliquer et examiner

1. **Appliquez** d’abord les réglages actifs. Le détramage lit la vue ajustée ; les incorporer d’abord évite de laisser des réglages en direct actifs sur le résultat nettoyé.
2. Commencez avec une seule passe. Le poids est de 4 par défaut ; essayez des valeurs inférieures si les détails fins sont importants.
3. Cliquez sur **Appliquer**, puis examinez les contours, les lettres et les bords transparents avec un fort zoom.
4. Annulez avant de comparer un autre réglage sur la même image de départ.

Des clics répétés sur Appliquer poursuivent le nettoyage de l’image déjà nettoyée. Ce ne sont pas des comparaisons indépendantes avec l’original.

## Effet sur l’impression

Retirer les pixels isolés d’une autre couleur peut supprimer de minuscules îlots, mais aussi des détails voulus. L’alpha participe au vote : le détramage peut donc élargir ou réduire la silhouette et ouvrir ou fermer des trous.

Il travaille en **pixels de l’image**, pas en millimètres. Un détail de trois pixels à 0,1 mm/pixel mesure 0,3 mm avant les décisions ultérieures de maillage ou de découpe. Le détramage n’a pas de paramètre de diamètre de buse. Utilisez les [commandes de détails imprimables en 3D](3d-mode) et l’aperçu du logiciel de découpe pour vérifier les détails physiques.

## Détramage et tramage de hauteur

| Outil | Où | Ce qui change |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| Détramage | 2D | Les zones de couleur exacte et, éventuellement, le contour transparent de l’image source. |
| Tramage de hauteur | Peinture automatique en 3D | Le motif des hauteurs de surface générées pour approcher les couleurs cibles. |

Utiliser l’un n’active pas l’autre. N’appliquez pas le détramage si vous souhaitez conserver un pixel art ou un pointillisme intentionnel.

Suite : [Mode 3D](3d-mode).
