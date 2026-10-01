---
title: Mode 3D
slug: 3d-mode
order: 60
description: Dimensions physiques, empilements de couleurs manuels, maillage et commandes d’aperçu.
---

# Mode 3D

Le mode 3D transforme les couleurs de l’image en couches physiques. Préparez l’image en 2D, choisissez les dimensions et une méthode d’impression, puis cliquez sur **Générer le modèle 3D**. Changer un réglage ne régénère pas automatiquement le modèle affiché.

Utilisez **Manuel** pour choisir vous-même l’ordre des couleurs et leurs épaisseurs. Utilisez **Peinture automatique** pour prédire les mélanges de vos filaments réels et trouver un empilement adapté à l’image. Aucune méthode ne commande l’imprimante : exportez le modèle et vérifiez-le dans votre logiciel de découpe.

## Paramètres d’impression 3D

| Commande | Effet sur le modèle | Points à vérifier |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Taille du pixel (XY)** | Millimètres par pixel de l’image dans les deux directions horizontales. | Le badge **Modèle** estime largeur, hauteur et profondeur physiques avant la génération. |
| **Hauteur de couche** | Pas vertical normal utilisé pour les hauteurs et les changements. | Faites correspondre le logiciel de découpe. Des couches plus fines donnent des choix de hauteur plus fins, pas des lignes d’extrusion plus étroites. |
| **Hauteur de première couche** | Premier palier au-dessus du plateau. | Faites-la correspondre séparément. La première couleur doit avoir au moins la plus grande des hauteurs normale et de première couche. |
| **Largeur de ligne effective** | Largeur d’extrusion utilisée pour les contrôles de détails imprimables et le tramage de hauteur en peinture automatique. | Faites correspondre la largeur de ligne prévue dans le logiciel de découpe, pas le diamètre de buse ni la taille du pixel. Cela ne change pas le profil de l’imprimante. |
| **Maillage lissé** | Remplace les frontières en escaliers de pixels par des contours connectés lissés. | Change la géométrie exportée, pas seulement l’éclairage. N’ajoute pas de détails à l’image et ne repasse pas la surface. |
| **Réinitialiser** | Rétablit 0,1 mm/pixel, des couches normales de 0,12 mm, une première couche de 0,2 mm, une largeur effective de 0,42 mm et le lissage désactivé. | Rétablit aussi les épaisseurs manuelles minimales, en conservant l’ordre actuel des couleurs. |

### La taille du pixel n’est pas celle de la buse

Une image de 1 000 pixels de large à **0,1 mm/pixel** produit un modèle d’environ **100 mm** de large. À **0,2 mm/pixel**, il mesure environ **200 mm**, avec exactement les mêmes pixels. Les marges extérieures transparentes sont exclues des dimensions du modèle.

![La même grille d’image s’agrandit physiquement lorsque la taille du pixel augmente ; redimensionner l’image change au contraire le nombre de pixels.](10_physical_size.svg)

_Schéma de principe. Dimensions XY, résolution de l’image et largeur d’extrusion sont des commandes distinctes._

Pour conserver 100 mm de large avec 2 000 pixels, utilisez **0,05 mm/pixel**. Davantage de pixels peuvent décrire des contours plus fins, mais l’imprimante reste limitée par sa largeur d’extrusion. Définissez **Largeur de ligne effective** dans **Paramètres d’impression 3D**, puis utilisez l’[aperçu des détails imprimables](auto-paint#printable-detail) de peinture automatique pour examiner cette limite.

Augmenter la taille du pixel ne réduit pas le nombre de pixels et n’allège pas intrinsèquement la génération du maillage. Pour une génération plus légère, redimensionnez ou recadrez en [mode 2D](loading-images), ou simplifiez la palette.

### Largeur de ligne effective

Copiez la largeur d’extrusion prévue par le logiciel de découpe dans **Largeur de ligne effective**. La plage acceptée est de 0,1 à 2 mm. Réinitialiser **Paramètres d’impression 3D** rétablit 0,42 mm avec les autres valeurs par défaut de la section. Modifier ce champ ne change pas le profil de l’imprimante.

La peinture automatique utilise cette largeur pour son aperçu d’avertissements de largeur, le nettoyage facultatif des points de couleur isolés et la taille des blocs de tramage de hauteur. Les commandes d’examen des avertissements et d’omission des points restent dans [Peinture automatique](auto-paint#printable-detail). Un avertissement ne signifie pas qu’un détail sera supprimé ou ne peut pas être imprimé.

### Hauteurs de couche et frontières valides

Avec une **première couche de 0,20 mm** et des **couches normales de 0,08 mm**, les sommets de couche sont à 0,20, 0,28, 0,36 et 0,44 mm, et non à 0,08, 0,16, 0,24 et 0,32 mm. Kromacut ajuste les épaisseurs de couleur à cette grille.

Changer la **Hauteur de couche** réinitialise les épaisseurs manuelles au nouveau pas normal, puis applique le minimum de la première couleur. Changer la **Hauteur de première couche** réinitialise la première couleur à son nouveau minimum. Définissez-les avant d’affiner les curseurs et revérifiez le plan si elles changent.

Les champs acceptent de larges plages : 0,01–10 mm/pixel pour la taille du pixel, 0,01–10 mm pour la hauteur de couche et 0–10 mm pour la première couche. Ce sont des limites de saisie, pas des réglages recommandés ; la première couleur reste ajustée à son minimum physique. Utilisez des valeurs compatibles avec votre buse, matériau et logiciel de découpe. Une hauteur plus fine modifie les recettes disponibles en peinture automatique ; elle ne rend pas automatiquement compatible l’étalonnage existant.

## Mode Manuel

**Épaisseurs des couleurs** répertorie les **Couleurs de l’image** non transparentes. Chaque ligne comporte une poignée de déplacement, un échantillon, un curseur d’épaisseur et une valeur en millimètres. Cette valeur est l’épaisseur de la séquence de couleur, pas la hauteur absolue de son sommet. Une séquence peut couvrir plusieurs couches du logiciel de découpe.

![Trois séquences manuelles créent des hauteurs cumulées ; augmenter une séquence inférieure relève toutes les surfaces suivantes.](11_manual_layers.svg)

_Coupe schématique. Une surface d’une couleur ultérieure contient les séquences précédentes en dessous._

Par exemple, réglez le noir à **0,20 mm**, le rouge à **0,16 mm** et le blanc à **0,08 mm**, avec des couches normales de 0,08 mm. Les zones noires s’arrêtent à 0,20 mm, les rouges à 0,36 mm et les blanches à 0,44 mm. Le rouge commence à la couche 2 du logiciel de découpe ; le blanc à la couche 4. Confirmez les instructions générées et l’interprétation du logiciel avant d’imprimer.

### Réordonner les couleurs

Faites glisser les lignes de haut en bas dans l’ordre d’impression. La première démarre sur le plateau. Les suivantes s’impriment sur les précédentes uniquement là où l’image les exige, formant un relief en paliers. Déplacer une couleur change son matériau de support, sa hauteur de surface et la séquence de changements. Une ligne déplacée en première position est relevée au minimum de première couche si nécessaire.

L’aperçu et l’export manuels utilisent les couleurs de l’image, pas le modèle HD de peinture automatique. Une fine couche rouge sur du noir peut s’imprimer plus sombre que son échantillon même si l’aperçu manuel paraît rouge. Choisissez les matériaux et épaisseurs en conséquence.

### Régler et réinitialiser les épaisseurs

Déplacez un curseur puis relâchez-le pour valider. Les séquences suivantes avancent par pas de **Hauteur de couche**. La première part de son minimum et ajoute des pas normaux. Augmenter une séquence inférieure relève toutes les surfaces suivantes et déplace leurs changements, pas seulement les zones où la couleur inférieure reste visible.

La réinitialisation des **Épaisseurs des couleurs** trie du sombre au clair selon la luminance et attribue les épaisseurs minimales. Elle diffère de celle des **Paramètres d’impression 3D**, qui modifie aussi les paramètres physiques mais conserve l’ordre.

Les commandes manuelles et les instructions de changement prennent en charge **64 couleurs**. Réduisez les palettes plus grandes en 2D. Les pixels entièrement transparents ne créent aucune matière, pas un support blanc. Les îlots opaques déconnectés restent des pièces distinctes, sauf si l’image les relie.

## Maillage lissé

Sans lissage, les contours suivent la grille carrée des pixels. Avec le lissage, les frontières connectées deviennent une géométrie lissée et soudée. La différence est exportée ; ce n’est pas un filtre d’aperçu.

Adoucit les contours du modèle dans l’aperçu et les exports. Moyen reproduit le lissage d’origine. Reconstruisez pour appliquer.

| Force | Utilisation |
| --- | --- |
| **Aucun** | Pixel art, contours carrés exacts ou génération la plus rapide. |
| **Minimal** | Nettoyage léger des angles irréguliers. |
| **Moyen** | Résultat familier de l’ancien réglage activé. |
| **Intensif** | Lissage plus fort le long des contours, avec la même limite de déplacement et sans passes supplémentaires. |

Le déplacement reste inférieur à un demi-pixel. Reconstruisez le modèle, puis vérifiez l’aperçu du trancheur. Les anciens réglages activé/désactivé deviennent Moyen/Aucun.

![Comparaison de contours diagonaux en escaliers et lissés sur la même grille source.](12_smooth_boundaries.svg)

_Comparaison schématique de contours, pas une simulation de découpe._

Utilisez-le pour des contours courbes ou diagonaux trop crénelés. Laissez-le désactivé pour un pixel art volontaire ou des bords suivant exactement la grille. Aucun choix ne répare des détails trop petits pour être imprimés ni n’invente une résolution source manquante.

Le maillage lissé est inactif en [Peinture à plat](flat-paint). L’activer désactive la peinture à plat, qui utilise à la place une plaque couvrant toute l’emprise.

## Peinture automatique

La peinture automatique accepte les couleurs réelles de filament et leur **Distance de masquage (HD)**, prédit les mélanges et associe les couleurs de l’image à des hauteurs imprimables. Consultez [Commandes de peinture automatique](auto-paint) pour toutes les commandes de filaments, correspondance, détail et confiance.

## Étalonner la distance de masquage des filaments

**Étalonner**, sous la liste des filaments, ouvre **Distance de masquage**, **Épreuve de palette** et **Matrice d’empilements**. Suivez [Méthodes d’étalonnage](calibration-workflows) pour imprimer et enregistrer les résultats, ou [Théorie de l’étalonnage](calibration-theory) pour le modèle optique.

## Profils de filaments

Les profils conservent des jeux nommés de filaments et les observations compatibles. Les modifications non enregistrées ne sont pas automatiquement réécrites dans le profil sélectionné. Consultez [Filaments et profils](auto-paint#filament-profiles) et [Fichiers de profils](settings-and-controls#filament-profile-files).

### Modèles

Les modèles sont des références de fournisseurs en lecture seule, pas des mesures de vos bobines. Chargez, ajustez, étalonnez puis choisissez **Enregistrer comme nouveau profil**. Consultez [Modèles](auto-paint#templates).

## Hauteur maximale

La limite raccourcit les transitions de peinture automatique sur des frontières de couche valides, mais ne peut pas retirer la fondation opaque. Consultez [Hauteur maximale](auto-paint#max-height), notamment la réserve concernant le support de peinture à plat.

## Détails imprimables

Définissez **Largeur de ligne effective** dans **Paramètres d’impression 3D**, puis utilisez **Ouvrir l’aperçu** en peinture automatique pour examiner les zones étroites de couleurs sources. **Omettre les points de couleur isolés** remplace facultativement les couleurs uniquement présentes dans de minuscules points enclavés, tout en préservant les lignes fines et détails connectés. Les avertissements et les nombres de pixels réellement omis sont affichés séparément. Consultez [Détails imprimables](auto-paint#printable-detail).

## Correspondance des couleurs améliorée

Recherchez des ordres de matériaux avec répétitions, exigences de couleurs distinctes ou tramage spatial de hauteur. Ils offrent des compromis entre couverture des couleurs, épaisseur, changements et calcul. Consultez [Correspondance des couleurs améliorée](auto-paint#enhanced-color-matching).

## Peinture à plat

Créez une plaque multimatériau plutôt qu’un relief en paliers, soit face vers le bas avec un support transparent, soit face vers le haut sans support. Lisez [Peinture à plat](flat-paint) avant d’exporter : le sens d’observation et les affectations d’objets comptent.

## Paramètres d’optimisation

**Algorithme**, **Priorité régionale**, **Détail des transitions** et **Graine** règlent la correspondance, pas la vitesse de l’imprimante. Consultez [Paramètres d’optimisation](auto-paint#optimizer-settings).

## Zones de transition et confiance

Les zones décrivent les séquences physiques ; la confiance décrit les observations et les limites de modélisation, pas une exactitude d’impression mesurée. Consultez [Lire le résultat](auto-paint#transition-zones-and-confidence).

## Épreuve de palette

Comparez une éprouvette imprimée à des couleurs sélectionnées de l’image et notez les candidats correspondants. Consultez [Méthodes d’étalonnage](calibration-workflows#palette-proof-compare-artwork-colors).

## Matrice d’empilements

Photographiez une planche de recettes enregistrée, vérifiez l’alignement et sauvegardez les couleurs mesurées pour les empilements compatibles. Consultez [Méthodes d’étalonnage](calibration-workflows#stack-matrix-photograph-known-recipes).

## Commandes d’aperçu

Faites glisser avec le bouton principal pour tourner autour du modèle, utilisez la molette pour zoomer et le bouton secondaire pour déplacer la vue. Les mouvements de caméra ne modifient jamais les dimensions physiques.

| Commande de barre d’outils | Utilité | Effet sur l’impression |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Couleurs fidèles** | Comparer les échantillons choisis sans éclairage de scène ni rendu tonal cinématographique. | Aperçu uniquement. Dépend toujours du modèle et de l’écran ; ne valide pas l’étalonnage. |
| **Ombré** | Examiner le relief éclairé et la forme. | Aperçu uniquement ; l’éclairage change la couleur apparente. |
| **Transparent** | Voir les couches superposées. | Aperçu uniquement ; ne rend pas le filament transparent. |
| **Fil de fer** | Examiner les arêtes colorées par couche. | Aperçu uniquement ; ce ne sont pas des trajectoires d’extrusion. |
| **Couleurs de l’aperçu** | Alterner mélanges simulés de peinture automatique et couleurs physiques des filaments. | Aperçu uniquement. Les exports conservent les affectations réelles de matériaux. |
| **Basculer la caméra** | Alterner profondeur en perspective et alignement orthographique sans raccourcissement. | Aperçu uniquement. La position de caméra est conservée. |
| **Annuler / Rétablir** | Parcourir l’historique partagé de retouche d’image. | Pas un historique des champs 3D ou des filaments. Régénérez après une modification de l’image. |
| **Télécharger** | Exporter le STL ou 3MF généré. | Utilise le dernier modèle généré, pas les paramètres latéraux non appliqués. |

Le mode de vue et le choix simulé/physique sont mémorisés. **Couleurs de l’aperçu** apparaît uniquement pour un modèle de peinture automatique déjà généré.

## Aperçu des couches

Déplacez les poignées inférieure et supérieure de la barre du bas pour isoler une plage de hauteurs. Les positions s’alignent sur la grille de couches. Survolez les segments de matériau pour les informations de départ ou de changement.

![Les poignées de limite masquent des couches pour l’examen, mais l’export contient toujours le modèle complet.](19_preview_only.svg)

_Schéma de principe. Masquer une couche à l’écran ne la supprime jamais de l’export._

La peinture à plat a une piste unie, car plusieurs matériaux peuvent occuper une couche imprimée. Tournez la vue sous la disposition par défaut face vers le bas pour voir l’illustration.

Un calcul de peinture automatique échoué peut laisser la dernière génération réussie visible. Ne la considérez pas comme une preuve que les nouveaux réglages ont fonctionné. Les instructions d’impression utilisent l’instantané généré lorsqu’il existe. Résolvez l’erreur, régénérez, puis examinez et exportez.

Suite : [Commandes de peinture automatique](auto-paint), [Peinture à plat](flat-paint) ou [Génération et export](generating-exporting-output).
