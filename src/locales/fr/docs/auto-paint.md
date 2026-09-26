---
title: Commandes de peinture automatique
slug: auto-paint
order: 62
description: Filaments, détails imprimables, correspondance des couleurs, contraintes de hauteur et confiance.
---

# Commandes de peinture automatique

La peinture automatique prédit l’apparence de fines couches de filament superposées et choisit des hauteurs imprimables pour l’image préparée. Plusieurs couleurs visibles peuvent provenir de différentes épaisseurs d’un même filament physique. Vingt couleurs d’image n’exigent donc pas forcément vingt bobines.

Définissez les [dimensions physiques, hauteurs de couche et largeur de ligne effective](3d-mode#3d-print-settings), ajoutez les filaments que vous pouvez réellement charger, attendez le calcul, puis cliquez sur **Générer le modèle 3D**. Les entrées relancent automatiquement le calcul ; la géométrie affichée n’est actualisée qu’à la génération.

## Paramètres des filaments

| Commande | Saisie ou action | Effet |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Ajouter un filament** | Crée une nouvelle ligne gris neutre. | Ajoute un matériau disponible, pas un emplacement physique d’imprimante. |
| **Échantillon / Hex** | Choisissez la couleur opaque du filament ou saisissez son code hexadécimal. | Change les mélanges et la couleur du matériau exporté. Saisissez la couleur réelle de la bobine, pas une couleur de résultat souhaitée. |
| **Nom** | Donnez une étiquette utile à la bobine. | L’identifie. Un nom vide revient à une étiquette automatique fondée sur la couleur. |
| **HD** | Distance de masquage en éclairage frontal, de 0,01 à 2 mm. | Une HD plus courte masque plus vite les couleurs inférieures. Une HD plus longue exige plus d’épaisseur et transmet davantage à épaisseur égale. |
| **Convertir depuis TD** | Saisissez la distance de transmission conventionnelle pour lithophanie/rétroéclairage et appuyez sur **Convertir**. | Convertit approximativement TD × 0,1, arrondi à 0,01 mm et borné à la plage HD. Ne reconvertissez pas une valeur HD. |
| **Baguette** | Estime la HD depuis la couleur. | Estimation de départ, pas une mesure. |
| **Badge d’état** | Examinez **Estimation** ou le niveau de confiance étalonné ; survolez pour les valeurs par canal RVB. | Décrit les observations HD de cette ligne, pas l’exactitude de toute l’image. |
| **Corbeille** | Retire la ligne. | Le filament n’est plus disponible. Les profils enregistrés ne changent pas tant qu’ils ne sont pas sauvegardés. |
| **Étalonner** | Ouvre Distance de masquage, Épreuve de palette ou Matrice d’empilements. | Enregistrez des observations physiques avec les [Méthodes d’étalonnage](calibration-workflows). |

Valider une valeur HD, convertir une TD ou utiliser la baguette efface l’étalonnage HD enregistré de cette ligne. Changer la couleur d’un filament étalonné rend son étalonnage inactif et utilise une estimation dérivée de la couleur. Revenir à la couleur mesurée peut réactiver l’étalonnage conservé, sauf s’il a été effacé ou remplacé entre-temps. Changer un nom n’est pas une mesure.

Le comportement mesuré des canaux affecte à la fois la couleur prédite et l’épaisseur de transition. Si le matériau ou le procédé change, ne supposez pas que l’ancien aperçu reste validé.

## Profils de filaments

Charger un profil enregistré remplace le jeu de filaments de travail. **Modifications non enregistrées** signifie que le jeu actuel diffère du profil sélectionné.

| Action | Résultat |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Enregistrer les modifications du profil actuel** | Remplace le profil modifiable par le jeu actuel. Désactivé sans changement, sans profil sélectionné ou avec un modèle sélectionné. |
| **Enregistrer comme nouveau profil** | Saisissez un nom non vide pour enregistrer séparément, y compris les modèles modifiés. |
| **Renommer le profil sélectionné** | Change son étiquette sans modifier les filaments. Indisponible pour les modèles ou sans profil sélectionné. |
| **Importer un profil depuis un fichier** | Lit les formats natifs `.kfil`, anciens `.kapp`, JSON ou CSV/TSV de bobines HueForge pris en charge. |
| **Exporter les filaments actuels en fichier .kfil** | Exporte le jeu actuel. Sur ordinateur, ouvre Enregistrer sous ; dans le navigateur, suit le téléchargement habituel. Annuler ne change pas l’étalonnage. |
| **Supprimer le profil sélectionné** | Retire le profil enregistré. Exportez une sauvegarde d’abord si nécessaire. Les modèles ne peuvent pas être supprimés. |

Les observations d’apparence appartiennent à une configuration exacte de filaments. Tant qu’un profil sélectionné comporte des modifications non enregistrées, ses observations d’apparence sauvegardées ne sont pas transmises à la peinture automatique. Exporter ces modifications crée un profil nommé séparément, sans les observations incompatibles de l’ancien jeu. L’étalonnage HD actif par filament est distinct des observations de matrice et d’épreuve au niveau du profil. Consultez la [compatibilité des profils et la gestion des imports](settings-and-controls#filament-profile-files).

### Modèles

Les modèles de fournisseurs apportent les couleurs annoncées, noms, marques et HD estimées. Ils sont en lecture seule. Retirez les couleurs que vous ne possédez pas, étalonnez, puis choisissez **Enregistrer comme nouveau profil**. Les couleurs de référence ne constituent aucune garantie pour un lot ou une condition d’observation. Les modèles sont non officiels et ne constituent pas une approbation du fournisseur.

## Correspondance standard

Avec la **Correspondance des couleurs améliorée désactivée**, Kromacut trie les filaments du sombre au clair selon la luminance et calcule leurs transitions. Il ne suit pas l’ordre d’ajout des lignes. L’association de l’image aux hauteurs utilise aussi la luminance : elle normalise la luminosité entre les pixels non transparents les plus sombres et les plus clairs, place cette plage entre la surface de fondation et le sommet de l’empilement, puis l’aligne sur des couches imprimables. Deux teintes différentes de même luminosité peuvent donc recevoir la même hauteur, quelle que soit leur teinte. Répétitions, séparation, tramage de hauteur et commandes d’optimisation sont inactifs.

Utilisez cette base plus simple pour un relief piloté par la luminosité. La correspondance améliorée tient compte de la couleur de l’image pour choisir la séquence de matériaux et les affectations de couleurs imprimables ; c’est donc le mode adapté lorsque les distinctions de teinte comptent.

## Hauteur maximale

Videz **Hauteur maximale** ou appuyez sur **Auto** pour utiliser la hauteur calculée de l’empilement, alignée sur les couches. Le champ accepte de 0,5 à 20 mm. La limite est un plafond, pas une cible : le résultat peut donc être plus court.

Une limite entre deux frontières valides est arrondie vers le bas. Si les transitions normales sont trop hautes, Kromacut les comprime et affiche la hauteur automatique pour comparaison.

![Les empilements automatiques et limités en hauteur gardent la fondation opaque, tandis que les transitions supérieures raccourcissent.](15_transition_height.svg)

_Schéma de principe. Les bandes colorées identifient les séquences de matériaux, pas l’apparence mélangée prédite._

La fondation doit toujours atteindre environ 95 % d’opacité dans chaque canal RVB modélisé. Une limite insuffisante rejette l’empilement au lieu de traiter un support translucide comme opaque. Augmentez la limite ou utilisez un filament capable de servir de fondation avec une HD plus courte.

La compression peut supprimer des couleurs intermédiaires utiles. Ce n’est pas une mise à l’échelle uniforme d’une image autrement identique. En **Peinture à plat**, le support transparent est une géométrie supplémentaire et sa disposition de première couche diffère du relief. Vérifiez les dimensions complètes du **Modèle** et l’épaisseur dans le logiciel de découpe ; la hauteur maximale n’est pas l’épaisseur de plaque support compris.

## Détails imprimables

Définissez la [**Largeur de ligne effective** dans **Paramètres d’impression 3D**](3d-mode#effective-line-width) à la largeur d’extrusion prévue par le logiciel de découpe, pas au diamètre de buse ni à la taille du pixel. L’aperçu des avertissements de largeur et le nettoyage facultatif des points isolés utilisent ce même réglage ; leurs commandes restent ici.

Imaginez une **bande violette de deux pixels** sur fond bleu. À **0,10 mm/pixel**, la bande mesure **0,20 mm de large**. Si votre ligne d’extrusion prévue mesure **0,40 mm**, cette bande est plus étroite que la ligne. Kromacut peut la signaler **à risque**, mais la conserve même lorsque le nettoyage est activé. Une zone visible étroite peut appartenir à une couche de matériau sous-jacente bien plus large, et les trajectoires de découpe peuvent préserver des détails signalés par ce contrôle limité à l’image.

![Une bande violette de deux pixels est plus étroite que l’extrusion prévue. L’orange est un avertissement de largeur, pas une couleur de filament. Le nettoyage conserve la bande et remplace seulement un minuscule point rose enclavé par du bleu.](13_printable_detail.svg)

_Il s’agit d’une estimation de largeur, pas d’une trajectoire exacte de découpe. Les barres colorées comparent les largeurs ; les carrés montrent l’image d’exemple._

**Omettre les points de couleur isolés** propose deux choix :

- **Désactivé :** conserve tous les pixels sources dans l’entrée de peinture automatique, y compris toutes les zones signalées.
- **Activé :** avant la correspondance et la génération, remplace uniquement les couleurs utilisées exclusivement dans de minuscules points compacts et enclavés par la couleur plus large qui les entoure. L’étendue totale d’un point doit être inférieure à la largeur de ligne effective et il doit être entouré sans ambiguïté d’une seule couleur occupant une zone plus large. Si cette couleur source apparaît aussi dans une ligne ou une zone plus grande n’importe où dans l’image, elle est conservée partout.

Les lignes fines, connexions diagonales, branches reliées à des zones plus larges, détails au bord de l’image et points voisins de transparence ou de plusieurs couleurs sont conservés. Le nettoyage ne transforme jamais un pixel en trou et ne modifie pas l’image 2D originale. Il est volontairement prudent et peut laisser des points indésirables ; utilisez le [nettoyage 2D](dedithering-cleanup) pour des retouches plus larges.

Utilisez **Ouvrir l’aperçu** pour examiner :

- **À risque :** l’orange marque les zones étroites de couleur source proches de couleurs plus larges ; le rose marque les zones fines sans voisin plus large. Les autres pixels sont assombris. Ce sont des avertissements, pas la prédiction qu’un détail ne peut pas être imprimé.
- **Résultat :** les pixels reçus par la peinture automatique après le nettoyage facultatif. Ce n’est ni un aperçu de découpe ni une garantie d’imprimabilité.
- **Signalés / admissibles / omis :** la proportion d’avertissements de largeur, les pixels respectant les règles de points isolés et le nombre réellement remplacé. **Pixels signalés conservés** compte explicitement les avertissements qui ne modifient pas l’image.

Lorsque des couleurs de points admissibles sont omises, la peinture automatique utilise l’image nettoyée pour compter les couleurs cibles et préparer l’empilement. Supprimer une couleur cible entière peut modifier les choix de correspondance ailleurs : examinez donc le résultat régénéré. Un pourcentage d’avertissement non nul avec **0 pixel omis** signifie que le nettoyage a conservé tous les détails sources.

Après avoir changé l’option, laissez le calcul se terminer et cliquez de nouveau sur **Générer le modèle 3D**. L’analyse mesure les zones connectées de couleurs sources, pas les couches physiques de matériaux, les parois, le remplissage ou l’extrusion à largeur variable. Vérifiez toujours les trajectoires découpées. Si un détail y disparaît réellement, augmentez les dimensions XY, épaississez-le en 2D ou choisissez une largeur d’extrusion plus fine compatible avec l’imprimante et le logiciel de découpe.

## Correspondance des couleurs améliorée

La correspondance améliorée recherche des séquences de matériaux pour la palette 2D actuelle. Elle peut omettre les filaments qui n’ajoutent aucune couverture utile. Huit bobines disponibles ne produisent pas nécessairement huit séquences.

L’optimiseur ne réduit pas à nouveau en secret la palette préparée. Davantage de couleurs sources demandent davantage de travail. Préparez l’image avec [Réduction des couleurs](reducing-colors), puis jugez l’apparence accessible en 3D.

Désactiver la correspondance améliorée désactive aussi la séparation et le tramage de hauteur. Les nouveaux calculs annulent les anciens ; la progression est approximative. Un calcul échoué ne peut pas se rabattre sur un empilement manuel sans rapport. Un ancien modèle généré peut rester visible jusqu’à la génération d’un nouveau résultat valide.

### Limite totale de répétitions

Choisissez **Désactivé**, ou jusqu’à **2, 4, 6, 8 ou 12 apparitions supplémentaires** pour l’empilement entier. Ce n’est ni une allocation par filament ni un nombre exact de changements. Noir → jaune → noir utilise une apparition supplémentaire du noir. Revenir à un matériau sur un nouveau substrat crée un autre parcours de mélange possible.

![Comparaison d’un budget partagé de répétitions et d’affectations cibles distinctes avec la fusion des couleurs abandonnées.](14_repeats_separation.svg)

_Séquences et affectations de principe, pas des prédictions de matériaux._

Davantage de répétitions autorisent une recherche plus large et potentiellement davantage de changements pendant l’impression. Le budget est un plafond. Les séquences inutiles peuvent être omises.

### Préserver la séparation des couleurs

La correspondance ordinaire peut associer différentes couleurs d’image au même résultat. Activez **Préserver la séparation des couleurs** lorsque ces distinctions comptent, par exemple pour des lettres sur leur fond ou des tons de visage adjacents.

La **Limite de correspondance unique (ΔE)** est une différence maximale stricte pour qu’une couleur d’image possède un résultat imprimable distinct. Plage : 1 à 100 ; défaut : 6. Les valeurs faibles exigent des correspondances plus proches, plus difficiles à satisfaire. Les valeurs élevées autorisent davantage d’erreur, pas de meilleurs filaments physiques.

**Exiger une correspondance unique pour chaque couleur** est activé par défaut. Les affectations incomplètes échouent. Désactivez-le pour une **palette partielle** : les couleurs sans correspondance perdent leurs résultats distincts et fusionnent dans les associations restantes. L’image reste remplie mais perd des distinctions. Si aucune couleur n’est admissible, même le mode partiel échoue, car il ne reste rien avec quoi fusionner.

L’optimiseur maximise d’abord les couleurs préservées et la couverture de l’image source. Il préfère ensuite moins d’apparitions répétées, moins de séquences de matériaux et moins de couches physiques, avant de réduire l’erreur dans la limite. Les budgets de répétition sont explorés progressivement et la recherche peut s’arrêter lorsque chaque couleur est préservée. Un contrôle final de suppression retire les séquences individuelles qui n’améliorent pas ces priorités.

En cas d’échec strict, envisagez moins de couleurs 2D, davantage de hauteur ou de répétitions, un autre filament adapté, une limite ΔE plus grande ou la fusion partielle. Choisissez le compromis réellement voulu plutôt que d’augmenter une limite uniquement pour faire disparaître l’erreur.

La séparation et le **Tramage de hauteur** sont mutuellement exclusifs. Activer l’un désactive l’autre.

## Tramage de hauteur

Le tramage de hauteur peut répartir l’erreur d’arrondi sur de petits blocs à des hauteurs imprimables voisines lorsque son entrée contient des hauteurs entre les frontières de couche disponibles. Ces différences peuvent suggérer des tons intermédiaires à distance. Il nécessite la correspondance améliorée et agit sur la carte de hauteurs exportée, pas sur l’image source 2D.

![Mécanisme de tramage lorsque des hauteurs fractionnaires existent : alignement direct comparé à la répartition de l’erreur d’arrondi entre hauteurs imprimables voisines.](16_height_dithering.svg)

_Mécanisme schématique, pas un résultat avant/après garanti. Des hauteurs de sommet différentes ne signifient pas des couleurs de bobines supplémentaires._

De nombreuses associations actuelles de peinture automatique choisissent déjà une couche imprimable discrète avant cette étape. Ces zones déjà alignées n’ont aucune erreur de hauteur fractionnaire à répartir et peuvent rester inchangées avec le tramage. Utilisez l’aperçu régénéré et le logiciel de découpe pour vérifier si cette image gagne réellement des variations de hauteur ; activer l’option ne garantit ni davantage de tons ni des points visibles.

La taille des points suit la **Largeur de ligne effective** des **Paramètres d’impression 3D** par rapport à la **Taille du pixel**, arrondie à un bloc de pixels entiers. C’est une approximation, pas une garantie exacte de largeur minimale. Les zones de bord évitent le même traitement de tramage pour réduire les artefacts de frontière. Vérifiez les petits îlots et déplacements supplémentaires dans le logiciel de découpe.

Lorsqu’une erreur fractionnaire existe, sa redistribution peut aider les tons larges tout en rendant les petits graphismes bruités ou la géométrie plus lourde. Elle ne peut ni ajouter une gamme de couleurs manquante ni valider un étalonnage non étayé. Lorsqu’elle crée beaucoup de petites zones, l’association à la peinture à plat peut être particulièrement coûteuse puisque ces zones partagent chaque couche couvrant toute l’emprise.

## Paramètres d’optimisation

![Priorités uniforme, centrale et périphérique sur la même image, avec un détail de transition croissant représenté par davantage de choix de hauteur possibles.](18_optimizer_choices.svg)

_Poids et choix schématiques, pas des couleurs mesurées ni des nombres de couches exacts. Les zones assombries reçoivent moins de priorité ; elles ne sont pas retirées de l’image._

| Commande | Choix et effet |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Algorithme** | **Rapide :** recherche plus étroite et rapide. **Équilibré :** défaut polyvalent. **Approfondi :** raffinement plus profond à départs multiples. **Intensif :** recherche plus large et coûteuse. **Ordre de base exact :** énumère les ordres applicables sans répétition. |
| **Priorité régionale** | **Uniforme :** poids égal des pixels. **Centre prioritaire :** favorise les couleurs près du centre. **Bords prioritaires :** favorise les couleurs près des bords. Change les priorités de correspondance, pas le recadrage ou l’extrusion. |
| **Détail des transitions** | **Compact (80 %)**, **Détaillé (90 %, par défaut)** et **Maximum (95 %)** définissent les opacités finales des transitions. Les valeurs élevées permettent des transitions plus hautes et davantage de couleurs intermédiaires imprimables, selon la convergence anticipée et la limite de hauteur. |
| **Graine (facultative)** | **Automatique** utilise une graine stable dérivée des entrées. Saisissez un entier pour comparer une autre recherche déterministe ; videz pour revenir à l’automatique. Ce n’est pas un curseur de qualité. |

Le détail des transitions affecte les transitions des matériaux supérieurs, pas l’exigence de fondation opaque. Il n’augmente pas la résolution et ne réduit pas la largeur de ligne. Les couleurs de transition ajoutées peuvent ne pas aider l’image actuelle.

À graine identique, les niveaux heuristiques supérieurs conservent le meilleur résultat du niveau inférieur. Cela reste une optimisation de prédictions. L’ordre de base exact vérifie 109 600 ordres non vides à huit filaments et 986 409 à neuf. Les répétitions utilisent un raffinement séparé, pas une preuve exhaustive de chaque empilement répété.

## Zones de transition et confiance

| Indicateur | Interprétation |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zones de transition** | Séquences physiques de matériaux avec début, fin et épaisseur. Les badges de compression indiquent une épaisseur inférieure à l’idéal. |
| **Hauteur totale / couches physiques** | Dimensions calculées de l’empilement, pas un nombre de couleurs d’image ou de bobines. |
| **État de séparation des couleurs** | Couleurs préservées et fusionnées, capacité imprimable, pire ΔE préservé et répétitions. Les cibles fusionnées ne sont pas des correspondances réussies au-delà de la limite. |
| **Modèle d’apparence** | Indique si la simulation, un comportement ajusté, des comparaisons locales ou des observations de matrice soutiennent la prédiction. Un nombre de mesures ne signifie pas que chaque résultat a été mesuré. |
| **Confiance de prédiction : moyenne / minimale** | Solidité des observations des couleurs réellement associées. La moyenne pondérée peut masquer une zone faible révélée par le minimum. Les nombres distinguent mesures, interpolation, prédictions ajustées et simulation. |
| **Confiance du résultat** | Indicateurs combinés d’étalonnage HD, de couverture et de compression. Ce n’est pas un pourcentage d’exactitude mesurée et ce n’est pas la confiance de prédiction. |
| **Étalonnage / Couverture / Compression** | Qualité des observations HD, couverture des couleurs sources par les filaments et effet de la limite de hauteur. Des scores élevés ne certifient pas l’impression. |
| **Score de qualité** | Comparaison de l’optimiseur, pas une mesure. En séparation non stricte incomplète, le libellé devient **Palette partielle**. |
| **Itérations / Résultat en cache** | Travail de recherche et réutilisation d’un résultat. Davantage d’itérations ne prouve pas une meilleure couleur. |
| **Optimum exact / Meilleur trouvé** | Comparaison exhaustive applicable sans répétition, ou raffinement heuristique/d’empilement répété. Aucun ne prouve l’exactitude physique. |
| **Aucune séquence supprimable** | Aucune suppression d’une seule séquence ne préserve les priorités choisies. Un réagencement de plusieurs séquences pourrait néanmoins être meilleur. |

Les observations perdent de leur force loin des mesures, lorsque des observations proches divergent ou lorsque les prédictions de validation manquent les couleurs mesurées. La correspondance ordinaire peut inclure un coût d’incertitude borné. La séparation utilise toujours le ΔE brut pour l’admissibilité : l’incertitude ne peut donc pas rendre valide une couleur hors limite.

Après un changement de procédé ou de hauteur de couche, examinez ce résumé. Un score général d’étalonnage élevé ne signifie pas que chaque nouvelle recette est étayée. Consultez [Méthodes d’étalonnage](calibration-workflows).

## Suggérer le prochain filament

**Suggérer le prochain filament** apparaît après l’obtention d’un résultat. Cette fonction cherche une couleur hypothétique susceptible d’améliorer la couverture de l’image. Ce n’est ni une fiche produit ni une bobine déjà chargée dans l’imprimante.

| Champ ou action | Signification |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Échantillon hexadécimal** | Couleur opaque suggérée du filament. |
| **ΔE estimé +… %** | Réduction estimée de l’erreur moyenne de l’image, mélanges compris, si elle est ajoutée. Plus élevé est meilleur ; ce n’est pas une confiance. |
| **HD** | Estimation initiale empruntée au filament existant le plus proche par distance perceptuelle. Non mesurée pour un produit. |
| **Couverture améliorée** | Pourcentage de pixels dont l’erreur estimée s’améliore. |
| **Isolation** | Différence par rapport aux filaments actuels sur une échelle de 0 à 1. Plus élevée indique un manque de couverture plus distinct. |
| **Ajouter aux filaments** | Ajoute une ligne de travail nommée `Kromacut-Suggestion-…` et recalcule avec elle. |

Trouvez une bobine réelle si la suggestion est utile, puis saisissez sa vraie couleur et son étalonnage. N’imprimez pas en supposant que la ligne hypothétique est déjà disponible. Les suggestions se réinitialisent lorsque les couleurs de l’image ou le jeu de filaments changent. L’absence de candidat indique que le jeu actuel couvre déjà bien l’image selon ce test approximatif.

Suite : [Peinture à plat](flat-paint), [Méthodes d’étalonnage](calibration-workflows) ou [Génération et export](generating-exporting-output).
