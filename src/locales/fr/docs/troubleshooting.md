---
title: Dépannage
slug: troubleshooting
order: 90
description: Problèmes courants et premières pistes de résolution.
---

# Dépannage

Commencez ici lorsqu’un résultat paraît incorrect ou qu’une commande est désactivée.

## Un lien affiche « Page introuvable »

L’adresse peut contenir une faute ou pointer vers une page disparue. Utilisez **Ouvrir Kromacut** pour accéder à l’outil, **Aller à l’accueil** pour visiter la page de présentation, ou **Parcourir la documentation** pour retrouver le guide actuel. Une adresse de documentation inconnue n’est pas automatiquement remplacée par un autre guide.

## Générer le modèle 3D ne met pas à jour l’aperçu

Les paramètres 3D ne sont appliqués que lorsque vous cliquez sur **Générer le modèle 3D**. Modifiez les réglages souhaités, puis générez de nouveau.

## Les instructions de changement sont désactivées

En mode Manuel, les images de plus de 64 couleurs désactivent les instructions de changement. Retournez en **2D**, utilisez les **Paramètres de quantification** et réduisez l’image à 64 couleurs ou moins. La peinture à plat n’a volontairement pas de séquence de changements manuels, car chaque couche peut contenir plusieurs filaments.

## Le modèle est trop haut

Essayez dans cet ordre :

1. En peinture automatique, abaissez la **Hauteur maximale** et surveillez la compression des zones de transition.
2. En mode Manuel, vérifiez le nombre de couleurs. De nombreuses couleurs créent de nombreuses tranches empilées, ce qui augmente naturellement la hauteur.
3. Réduisez les couleurs en **2D** si chaque couleur n’a pas besoin d’une couche imprimée distincte.
4. En mode Manuel, réduisez une ou plusieurs épaisseurs de couleur.
5. Confirmez que **Hauteur de couche** et **Hauteur de première couche** correspondent aux réglages réels de votre logiciel de découpe.

## Le modèle est trop grand en X ou Y

Diminuez la **Taille du pixel (XY)** pour réduire le modèle. Recadrez d’abord l’image s’il reste une bordure ou un fond inutile.

## L’image contient des points ou de minuscules îlots

Utilisez le **Détramage** après la réduction des couleurs. S’il reste trop de pixels isolés, essayez moins de couleurs ou un autre algorithme de quantification.

## La peinture automatique semble imprécise

Causes courantes :

- Les distances de masquage des filaments sont estimées et non étalonnées.
- Le jeu de filaments couvre mal les couleurs de l’image.
- La **Hauteur maximale** comprime trop les zones de transition.
- L’optimiseur a besoin de la **Correspondance des couleurs améliorée**.
- Le sujet important se situe au centre ou sur les bords, mais la **Priorité régionale** est **Uniforme**.

Étalonnez vos filaments et consultez la **Confiance du résultat** pour trouver des indices.

Vérifiez séparément la ligne **Modèle d’apparence**. Un score global élevé ne garantit pas l’exactitude physique. **Estimations seules** ou aucune recette de matrice active signifie qu’aucune mesure de matrice applicable n’est utilisée par le résultat actuel. Enregistrer un profil étalonné ne rend pas ses observations compatibles avec toutes les hauteurs de couche ou tous les jeux de filaments modifiés. Consultez [Méthodes d’étalonnage](calibration-workflows).

## Une option en a désactivé une autre

**Préserver la séparation des couleurs** et **Tramage de hauteur** restent exclusifs, car ils affectent différemment les couleurs sources aux hauteurs imprimables. **Maillage lissé** et **Peinture à plat** peuvent être utilisés ensemble ; reconstruisez après toute modification. Consultez [Peinture à plat](flat-paint) et [Peinture automatique](auto-paint).

## La séparation des couleurs ne trouve aucun résultat

La **Limite de correspondance unique** est une limite stricte d’erreur de couleur prédite. Si **Exiger une correspondance unique pour chaque couleur** est activé, une seule couleur sans correspondance suffit à rejeter le résultat. Essayez de réduire la palette 2D, d’ajouter un filament utile, d’autoriser plus de hauteur de transition ou de répétitions, ou d’assouplir la limite. Ne désactivez l’exigence stricte que si la suppression de couleurs distinctes et la fusion de leurs zones sont acceptables. Un ancien aperçu généré peut rester affiché après un rejet ; ce n’est pas une génération réussie des réglages rejetés.

## Mes réglages disparaissent en 3D ou au téléchargement

Cliquez sur **Appliquer** dans Réglages pour incorporer l’apparence en direct à l’image source avant de quantifier, générer ou télécharger. L’aperçu des réglages et la source sont distincts. Consultez [Réglages d’image](image-adjustments).

## Supprimer un échantillon n’a pas effacé ses pixels

**Supprimer** retire une option de palette et réassocie l’image aux couleurs restantes. Ce n’est pas une gomme. Utilisez la gomme ou réglez l’alpha de cet échantillon à zéro pour créer une découpe. La quantification peut rendre opaques les pixels partiellement transparents : examinez à nouveau la silhouette après.

## Recueillir une trace de diagnostic de peinture automatique

Pour approfondir l’analyse d’un résultat dans l’application de bureau, activez **Enregistrer les diagnostics de peinture automatique** dans **Paramètres**, lancez un nouveau calcul et utilisez **Ouvrir le dossier** pour retrouver la trace `.jsonl`. Activez l’enregistrement avant le début du calcul. Générer un maillage à partir d’un résultat déjà calculé n’enregistre pas ce calcul antérieur. Consultez [Diagnostics de peinture automatique sur ordinateur](settings-and-controls#desktop-auto-paint-diagnostics) avant de partager une trace.

## La génération 3D est lente

Les grandes images, les nombreuses couleurs, les nombreuses couches et le maillage lissé augmentent le temps de génération. Essayez de :

- Recadrer l’image.
- Réduire le nombre de couleurs.
- Désactiver le **Maillage lissé**.
- Réduire la résolution avec **Redimensionner l’image**. Diminuer seulement la taille du pixel rend le même maillage plus petit, pas plus simple.
- Simplifier les options de peinture automatique.

## Le fichier exporté s’ouvre avec des couleurs inattendues

Pour le 3MF, vérifiez les affectations de matériaux ou de filaments dans le logiciel de découpe. Kromacut conserve les informations de couleur si possible, mais les logiciels peuvent associer différemment les couleurs aux extrudeurs.

Le STL ne contient aucune affectation de couleur de filament. Utilisez les **Instructions d’impression** pour les changements.

La vue Simulées de peinture automatique montre des mélanges estimés ; les logiciels de découpe affichent généralement les couleurs des filaments physiques. Passez Kromacut en **Physiques** pour vérifier les affectations, puis contrôlez l’association réelle des bobines. Aucune des deux vues ne prouve la couleur finale imprimée.

## Le recadrage ou les retouches sont allés trop loin

Utilisez **Annuler**. Rétablir est disponible si vous annulez trop loin.

Suite : [FAQ](faq).
