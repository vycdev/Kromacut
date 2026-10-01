---
title: Peinture à plat
slug: flat-paint
order: 64
description: Relief en paliers, supports transparents face vers le bas et plaques exposées face vers le haut.
---

# Peinture à plat

La **Peinture à plat** est une disposition de peinture automatique disponible avec la correspondance standard ou améliorée. Elle produit une plaque d’épaisseur constante plutôt qu’un relief en paliers. Chaque couche imprimée couvre l’emprise du modèle, avec éventuellement plusieurs matériaux côte à côte sur une même couche.

Utilisez un système multimatériau tel qu’un AMS, un CFS ou un changeur d’outils avec une prise en charge adaptée dans le logiciel de découpe. Un changement manuel de filament à une hauteur donnée ne peut pas fournir plusieurs matériaux côte à côte sur cette couche.

![Des coupes comparent le relief normal, la peinture à plat face vers le bas avec support transparent et la peinture à plat face vers le haut sans support.](17_flat_paint_orientation.svg)

_Coupes de principe. Les couleurs identifient les matériaux ; les étiquettes indiquent la face à regarder._

La progression compte les parties du maillage, pas les couches imprim?es : plusieurs parties color?es peuvent partager une couche. Le badge Mod?le indique le nombre de couches physiques, y compris le support transparent le cas ?ch?ant. L?aper?u d?coupe la plaque couche par couche ; les deux poign?es d?coupent aussi les zones fusionn?es de support et de couleur. L?exportation contient toujours le mod?le complet. Build 3D Model r?g?n?re toujours le mod?le, m?me sans modification des r?glages, et r?tablit toutes les couches ainsi que la vue initiale de la cam?ra.

Si la création échoue, Kromacut supprime le modèle incomplet et affiche l’erreur dans l’aperçu. Cliquez sur Construire le modèle 3D pour réessayer ; une fois la création réussie, les dimensions du modèle et l’aperçu des couches réapparaissent.

## Par défaut : face vers le bas avec support transparent

Activez **Peinture à plat** et laissez **Face vers le haut, sans couche transparente** désactivé.

1. Le support transparent s’imprime en premier et constitue la face lisse observée, contre le plateau. Affectez son objet à un filament transparent.
2. Les colonnes de l’illustration inversent leur ordre normal de matériaux pour être vues par-dessous. Le matériau de fondation remplit l’arrière des colonnes plus courtes.
3. Exportez en **3MF** et conservez l’orientation. L’illustration est déjà en miroir ; ne lui appliquez pas un nouveau miroir dans le logiciel de découpe.
4. Après l’impression, retournez la pièce pour la regarder à travers le support.

Le texte peut paraître inversé depuis l’arrière dans le logiciel de découpe. Vérifiez plutôt la face prévue pour l’observation. Dans l’aperçu Kromacut, faites tourner la vue sous le modèle pour examiner cette face.

Le support est une géométrie supplémentaire nécessitant un véritable filament transparent. La transparence à l’écran ne mesure ni la clarté du filament ni la finition du plateau. Vérifiez l’épaisseur totale dans le badge **Modèle** et dans le logiciel de découpe, pas seulement avec la **Hauteur maximale** de peinture automatique.

## Face vers le haut, sans couche transparente

Activez cette option pour supprimer le support transparent :

- Chaque colonne conserve son ordre normal de matériaux de bas en haut.
- Le matériau de fondation remplit l’espace sous les colonnes plus courtes, alignant les couleurs visibles sur une surface supérieure plane.
- Il n’y a ni objet de support ni besoin de filament transparent.
- Imprimez face vers le haut dans l’orientation exportée, sans miroir, puis regardez directement le dessus sans retourner la pièce.

Ces dispositions ont des géométries différentes. Cliquez de nouveau sur **Générer le modèle 3D** après avoir changé l’option. Retourner un ancien export ne le convertit pas d’une disposition à l’autre.

## Comparer les méthodes

| Méthode | Face observée | Géométrie | Affectation dans le logiciel de découpe |
| ------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------------- |
| Peinture automatique normale | Dessus en paliers | Les colonnes plus courtes s’arrêtent plus tôt. | Séquences de matériaux physiques selon la hauteur. |
| Peinture à plat, par défaut | Dessous, à travers le support transparent | Colonnes inversées et en miroir, fondation derrière. | Objets par filament, plus support. |
| Peinture à plat, face vers le haut | Dessus plat exposé | Ordre normal, fondation sous les colonnes plus courtes. | Objets par filament ; sans support. |

**Maillage lissé** fonctionne dans les deux orientations de la peinture à plat. Choisissez une intensité et reconstruisez. Le lissage adoucit le contour extérieur et les frontières communes entre couleurs, tout en conservant la plaque plane, les hauteurs de couche et les empilements de matériaux. De petites jonctions communes ferment les contacts diagonaux sans chevauchement. Les instructions d’impression et le 3MF indiquent l’intensité utilisée.

## Exporter et vérifier

Seul le **3MF** est proposé. Un STL sans couleurs perdrait la disposition utile des matériaux et ne conserverait qu’une plaque. Les objets sont regroupés par filament réel, pas par couleur mélangée prédite.

1. Faites correspondre les hauteurs de couche normale et de première couche à celles de Kromacut.
2. Conservez l’échelle et l’orientation exportée. N’ajoutez pas de miroir.
3. Affectez correctement chaque objet, y compris le filament transparent pour le support par défaut.
4. Examinez les couches individuelles du logiciel de découpe pour vérifier les zones côte à côte et l’intégrité de la plaque.
5. Confirmez le sens du texte depuis la face à regarder, puis vérifiez les changements et la durée d’impression.

Les **Instructions d’impression** remplacent la liste des changements manuels par des indications multimatériau propres à la disposition. L’**Aperçu des couches** affiche une piste unie, car chaque couche peut contenir plusieurs matériaux. Ses limites affectent toujours uniquement l’examen, jamais l’export complet.

## Compromis entre coût et détail

Une face plane n’est pas nécessairement plus simple à imprimer. Remplir l’emprise à chaque couche ajoute de la matière et une géométrie plus lourde que le relief. Des couches fines, des empilements hauts et le **Tramage de hauteur** peuvent produire de nombreuses petites zones, davantage de déplacements et ralentir la génération, l’export ou la découpe.

Kromacut avertit avant de générer les gros projets de peinture à plat. **Générer quand même** accepte cette charge de travail ; cela ne certifie pas que l’imprimante convient. Testez une petite pièce si le matériau ou la finition n’est pas validé. La peinture à plat conserve l’agencement optique voulu des colonnes, mais dépend toujours de matériaux étalonnés et d’un procédé d’impression correspondant.

Suite : [Génération et export](generating-exporting-output).
