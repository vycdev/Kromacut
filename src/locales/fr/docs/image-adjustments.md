---
title: Réglages d’image
slug: image-adjustments
order: 35
description: Tous les curseurs de tonalité et de couleur, leur effet sur les couleurs cibles et le moment où appliquer l’aperçu à l’image.
---

# Réglages d’image

Les réglages modifient l’image cible avant la réduction des couleurs. Ils n’étalonnent pas le filament, ne modifient pas sa distance de masquage et ne garantissent pas qu’une couleur affichée soit physiquement imprimable.

Déplacez un curseur pour prévisualiser son effet ; l’aperçu se met à jour lorsque vous terminez l’interaction. Tous commencent à zéro. Les flèches individuelles réinitialisent un curseur ; la réinitialisation du panneau les rétablit tous.

## Commandes de tonalité et de couleur

![Exemples illustratifs négatifs, neutres et positifs pour les douze réglages.](32_adjustment_controls.svg)

_Il s’agit de tendances schématiques, pas de prédictions d’impression étalonnées. Les effets dépendent de la source et des autres réglages actifs._

### Tonalité

| Curseur | Plage | Valeurs négatives | Valeurs positives | Conséquence pour la préparation à l’impression |
| ---------- | ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Exposition | −3 à +3 diaphragmes, pas de 0,01 | Assombrit les valeurs RVB. | Les éclaircit ; +1 double les valeurs des canaux jusqu’à écrêtage. | Déplace les tons cibles globalement. Ce réglage d’image rendue ne récupère pas les informations RAW écrêtées. |
| Contraste | −100 % à +100 % | Ramène les tons vers le gris moyen. À −100 %, tout devient gris moyen avant les autres réglages. | Éloigne les tons du gris moyen, avec écrêtage au noir/blanc. | Sépare les grandes zones, mais peut aplatir les ombres et hautes lumières subtiles. |
| Hautes lumières | −100 % à +100 % | Assombrit les zones claires. | Éclaircit les zones claires. | Modifie les tons clairs en concurrence pour la palette ; ne récupère pas les détails absents. |
| Ombres | −100 % à +100 % | Assombrit les zones d’ombre. | Éclaircit les zones d’ombre. | Peut révéler les différences sombres déjà présentes avant la réduction. |
| Blancs | −100 % à +100 % | Assombrit la plage la plus claire. | Éclaircit la plage la plus claire. | Sépare ou fusionne les cibles proches du blanc. Ce n’est pas une balance des blancs. |
| Noirs | −100 % à +100 % | Assombrit la plage la plus sombre. | Éclaircit la plage la plus sombre. | Modifie les cibles proches du noir ; le noir pur reste noir, car les valeurs sont multipliées. |

Hautes lumières/Ombres couvrent des plages plus larges que Blancs/Noirs. Les plages se chevauchent : un pixel très sombre peut réagir aux Noirs et aux Ombres. Elles sont évaluées après Exposition, Contraste, Température/Nuance et les réglages TSL ; les commandes peuvent donc interagir.

### Couleur et détails locaux

| Curseur | Plage | Valeurs négatives | Valeurs positives | Conséquence pour la préparation à l’impression |
| ----------- | -------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Saturation | −100 % à +100 % | Réduit l’intensité ; −100 % désature. | Augmente l’intensité. | Modifie les différences de couleur de l’image, pas la gamme physique des filaments. |
| Vibrance | −100 % à +100 % | Réduit davantage la saturation des couleurs relativement peu saturées. | Augmente davantage la saturation des couleurs relativement peu saturées. | Moins uniforme que Saturation, sans reconnaissance des tons de peau. Le gris pur reste gris. |
| Teinte | −180° à +180° | Fait tourner les teintes dans un sens. | Les fait tourner dans l’autre sens. | Recolore toute l’image ; modifiez un échantillon pour une seule couleur exacte. |
| Température | −100 à +100 | Plus froid : moins de rouge, plus de bleu. | Plus chaud : plus de rouge, moins de bleu. | Correction approximative de dominante, **pas en kelvins**. |
| Nuance | −100 à +100 | Ajoute du vert. | Ajoute du magenta en augmentant rouge/bleu et en réduisant le vert. | Corrige ou introduit une dominante ; ce n’est pas un profil d’appareil photo mesuré. |
| Clarté | −100 à +100 | Adoucit le contraste local. | Accentue le contraste local et les contours. | Peut créer des couleurs de bord ou des halos nécessitant une quantification. Ne récupère pas de détails et n’élargit pas les lignes fines. |

À l’exception d’Exposition et de Teinte, les curseurs avancent par pas entiers. L’alpha reste inchangé. La quantification traite l’alpha différemment : elle rend les pixels partiellement transparents entièrement opaques.

## Aperçu et application

![Un aperçu en direct part de la source. Appliquer incorpore son apparence et remet les curseurs à zéro ; la quantification, l’export PNG et la 3D utilisent ensuite ces pixels.](33_adjustment_bake.svg)

**Appliquer** incorpore l’apparence actuelle à l’image sous-jacente, réinitialise les curseurs à zéro et crée une étape dans l’historique. Cela ne réduit pas les couleurs, ne génère pas le modèle et ne modifie pas les paramètres d’impression.

La distinction est importante :

- **La quantification, Redimensionner l’image, Télécharger l’image et la génération 3D utilisent l’image de travail sous-jacente**, pas les réglages d’aperçu non appliqués.
- **Couleurs de l’image** décrit les pixels sous-jacents : ses échantillons ne suivent donc pas les réglages en direct.
- Les outils de retouche modifient l’image sous-jacente ; les réglages actifs se réappliquent par-dessus.
- Le détramage lit l’image ajustée. Appliquez d’abord les réglages pour éviter qu’ils restent actifs sur son résultat traité.

La séquence fiable est **prévisualiser les réglages → appliquer les réglages → quantifier → examiner/nettoyer → générer la 3D**. Si possible, recadrez et redimensionnez avant ces étapes.

## Réinitialiser et annuler sont différents

Réinitialiser supprime un réglage en direct, pas une modification déjà incorporée à l’image. Après Appliquer, les curseurs à zéro sont normaux puisque leur effet précédent fait désormais partie de l’image. Utilisez **Annuler** pour restaurer l’image antérieure.

Des applications répétées travaillent sur l’image déjà modifiée ; l’écrêtage et la perte de détails tonals peuvent donc s’accumuler. Annulez d’abord pour comparer des alternatives.

Suite : [Réduction des couleurs](reducing-colors).
