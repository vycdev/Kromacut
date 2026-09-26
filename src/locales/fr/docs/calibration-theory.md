---
title: Théorie de l’étalonnage
slug: calibration-theory
order: 62
description: L’optique et les mathématiques de l’étalonnage par distance de masquage, épreuve de palette et matrice d’empilements.
---

# Théorie de l’étalonnage

Kromacut possède trois outils d’étalonnage complémentaires. **Distance de masquage** mesure l’opacité physique de chaque filament. **Épreuve de palette** vous demande de classer un petit ensemble de candidats imprimés pour les couleurs importantes d’un projet. **Matrice d’empilements** photographie de nombreuses recettes physiques connues et enregistre leurs couleurs observées. Tous alimentent le même modèle d’empilement de peinture automatique, mais répondent à des questions différentes.

Pour les commandes pas à pas, l’enregistrement et la compatibilité des réglages d’impression, consultez [Méthodes d’étalonnage](calibration-workflows). Pour le reste de l’espace d’impression, consultez [Mode 3D](3d-mode).

## Pourquoi les couches fines se mélangent

Une impression se regarde sous un éclairage frontal : la lumière entre par la surface supérieure, traverse le filament, se réfléchit sur ce qui se trouve dessous et ressort. Une couche fine ne masque que partiellement ce qui est en dessous ; la couleur visible est donc un mélange de la couleur propre du filament et de celle qui transparaît. La peinture automatique utilise cette transparence résiduelle pour créer des couleurs intermédiaires avec peu de filaments, d’où l’importance d’une HD précise.

![Les couches fines sur fond noir ne le masquent que partiellement ; chaque couche ajoutée multiplie la transparence résiduelle jusqu’à atteindre la couleur opaque du filament.](06_frontlit_hiding_distance.svg)

Kromacut modélise cette transparence avec une loi de Beer-Lambert. Une épaisseur `d` de filament transmet

```
T = 10^(−d / HD)
```

de la couleur sous-jacente. Chaque couche ajoutée multiplie la transparence résiduelle ; l’empilement atteint donc l’opacité selon une progression géométrique. La vitesse est une propriété du matériau : un noir dense masque en une fraction de millimètre, un blanc translucide peut demander dix fois plus d’épaisseur. Cette vitesse correspond à la distance de masquage.

La distance de transmission indiquée sur les fiches de bobines ou mesurée par des essais TD rétroéclairés décrit la lumière traversant le filament _une seule fois_, comme dans une lithophanie. L’observation frontale fait traverser deux fois la couche à la lumière et la lit sur une réflexion : une TD conventionnelle vaut donc environ dix fois la distance de masquage. Kromacut accepte la TD conventionnelle en entrée, avec le bouton de conversion de chaque filament, mais stocke et simule avec la HD.

## L’éprouvette en escalier

La mesure des couleurs par appareil photo est peu fiable : les appareils corrigent automatiquement, les écrans diffèrent et l’éclairage varie. L’éprouvette évite de juger une couleur isolément. Chaque tuile imprime des cases de 1 à N couches sur un support, avec une **bande de référence** du même filament à pleine opacité à côté et un ergot marquant l’extrémité à une couche.

![L’éprouvette d’étalonnage : cases numérotées avec un nombre croissant de couches à côté d’une bande totalement opaque ; vous indiquez la première case visuellement identique à la bande.](07_calibration_wedge.svg)

Vous indiquez la **première case qui paraît identique à la bande voisine**. La bande est la couleur opaque propre au filament, à quelques millimètres sous le même éclairage : la comparaison reste donc valable malgré les différences de pièce, d’écran ou d’impression. Les cases fines laissent voir le support ; à partir d’une certaine case, la différence devient imperceptible à l’œil, et le numéro de cette case constitue la mesure.

## D’une lecture à une distance de masquage

La case indiquée marque l’épaisseur où la transparence résiduelle est passée sous une **différence juste perceptible (JND)** : la plus petite différence de couleur visible, environ 2 ΔE00 en observation courante.

Kromacut résout le problème à l’envers. Pour la couleur du filament sur celle du support, il calcule `T*`, la transparence résiduelle plaçant le mélange à exactement une JND de la couleur opaque du filament. `T*` dépend uniquement des deux couleurs et de la JND, sans constante d’opacité ajustée à la main. La lecture donne l’épaisseur où l’impression atteint ce point, `d* = case × hauteur de couche`, et l’inversion de Beer-Lambert donne :

```
HD = −d* / log10(T*)
```

![À mesure que les couches s’empilent, la différence entre case et bande diminue ; la case lue fixe le franchissement d’une JND et l’inversion de la loi de transmission donne la distance de masquage.](08_opacity_solve.svg)

Le contraste du support importe : un filament noir sur un support noir ne diffère jamais de sa bande d’une JND entière, il n’y a donc rien à mesurer. L’assistant le détecte et attribue un support plus clair aux filaments sombres.

## Observations d’épreuve de palette

Une épreuve de palette compare des préfixes réellement imprimés aux couleurs de l’illustration actuelle. Kromacut conserve la recette physique des couches, sa prédiction HD d’origine, la couleur cible demandée et chaque réponse. Une seule planche peut ainsi fournir deux types d’observations sans prétendre que chaque choix est une mesure exacte.

**Meilleure disponible** soutient la recette sélectionnée et défavorise les alternatives non sélectionnées près de cette cible, sans forcer la case choisie à égaler la couleur cible. **Proche** ajoute une correction locale partielle. **Exacte** ajoute la correction la plus forte et conserve le suffixe opaque exact testé comme référence directe. Chaque case sélectionnée dans un ex æquo reçoit du soutien. **Aucun** défavorise les candidats plausibles proches de la cible sans inventer une direction de correction.

Ces effets sont locaux à la fois dans l’espace des recettes physiques et dans celui des couleurs. Les couches récentes, optiquement dominantes, comptent le plus lorsque Kromacut compare les recettes ; déplacer le même filament ailleurs dans la partie récente de l’empilement donne une correspondance plus faible. L’influence diminue aussi à mesure que la couleur simulée de l’empilement ou la cible demandée s’éloigne de la couleur évaluée. Plusieurs recettes similaires qui perdent régulièrement près de cibles vertes renforcent donc un avertissement local pour les empilements verts proches, sans affecter une recette rouge sans rapport.

Les corrections Proche et Exacte alimentent les mêmes couleurs Lab prédites utilisées par le score d’optimisation et l’aperçu final. Les observations favorables et défavorables ajoutent une préférence d’optimisation bornée et sensible à la cible : des observations répétées peuvent départager des scores numériques proches sans supplanter l’erreur réelle de couleur ou les références exactes. L’ajustement global plus large de luminosité/chroma reste séparé et doit toujours passer sa validation sur données réservées. Les observations locales et références Exacte peuvent rester utiles lorsque cet ajustement global est écarté ; tous les paramètres dérivés sont reconstruits de manière déterministe depuis les évaluations brutes enregistrées.

## Étalonnage par matrice d’empilements

La matrice commence comme une mesure de type table de correspondance (LUT), et non comme une autre résolution d’opacité par éprouvette. Les nouvelles planches échantillonnent des recettes utiles de longueurs diverses jusqu’à une limite physique d’épaisseur colorée, tandis que chaque couche de la zone colorée conserve la hauteur normale sélectionnée. Une limite de 0,40 mm à 0,04 mm autorise jusqu’à 10 couches colorées. La fondation est une seule couche à la hauteur effective de première couche, pas une plaque dimensionnée selon l’opacité estimée. Avec une première couche de 0,10 mm, cet exemple mesure 0,50 mm de haut et comporte 11 couches imprimées au total.

Les recettes plus courtes reposent sur des couches supplémentaires du même filament de support à l’intérieur de la zone colorée, pour que toutes les surfaces d’échantillon se terminent au même Z sans dépasser la limite. Ce support supplémentaire est enregistré séparément de la recette utile lors de l’application des mesures. Une fondation fine n’est pas garantie opaque : utilisez un filament opaque et une surface de fond photographique plane et constante. Le support imprimé doit réellement masquer le substrat avant que le support ajouté puisse être considéré comme optiquement neutre. Les anciennes planches enregistrées conservent leurs épaisseurs de fondation et leur carte de cases d’origine.

L’espace des recettes possibles croît exponentiellement ; la planification utilise donc un ensemble déterministe borné de séquences pures, de transitions ordonnées de filaments et de recettes exploratoires plus longues sur les profondeurs autorisées. Les HD enregistrées prédisent leurs couleurs. Les matrices terminées compatibles apportent la couverture de couleurs mesurées et l’historique des recettes déjà imprimées. La sélection favorise les lacunes de couleur et les nouvelles épaisseurs/transitions, avec une exploration spécifique guidée par le faible soutien ou les erreurs de prédiction antérieures. Ces scores d’acquisition sont des heuristiques, pas des intervalles d’incertitude étalonnés. Quelques répétitions de référence intentionnelles permettent des contrôles de cohérence ; les plans non imprimés et les photos incompatibles ou non acceptées ne comblent pas les lacunes de couverture.

Le budget de changements de matériau inclut les références des coins et contraint l’usage des matériaux couche par couche. Ce n’est pas une estimation de durée d’impression ni de volume de purge, et le logiciel de découpe peut ajouter des changements. Une limite plus grande peut donc coûter davantage même si le nombre de cases reste faible. Les nouvelles planches regroupent les recettes similaires en zones de même couleur plus continues pour réduire la fragmentation des trajectoires ; réagencer les cases ne réduit pas l’ensemble de matériaux nécessaires à chaque couche. Les anciennes planches conservent leur sélection d’origine, exhaustive à profondeur fixe ou fondée sur la gamme HD, et peuvent toujours fournir des observations compatibles sans être réécrites.

La matrice s’imprime face vers le haut : sa fondation, son épaisseur de première couche et les couches de recette suivantes utilisent ainsi le même ordre physique qu’une génération Kromacut normale. Quatre recettes de coin identifient l’orientation et définissent la transformation perspective. Après impression, photographiez la face sous un éclairage frontal diffus. Kromacut estime la planche, puis vous permet de déplacer quatre poignées numérotées au centre des repères avec un réticule agrandi. Une grille exacte projetée et un aperçu rectifié en direct rendent visibles les erreurs de perspective, d’inclinaison et de biais avant l’échantillonnage d’une zone centrale en retrait dans les coordonnées projectives propres à chaque case. Ce retrait par case reste éloigné des bords même lorsque la perspective rétrécit fortement un côté. Un alignement peu fiable ou ajusté manuellement nécessite une confirmation explicite ; la confiance et l’état de validation sont enregistrés avec les mesures. L’échantillonnage brut est le choix prudent par défaut. La correction facultative par repères estime un gain d’éclairage par canal depuis les quatre recettes de repère connues ; elle peut réduire une dominante mais aussi masquer une vraie différence dépendant de l’éclairage.

Une matrice terminée stocke les couleurs sRGB prédites et photographiées à côté des recettes physiques immuables dans le profil de filaments nommé. Toutes les matrices compatibles enregistrées réajustent conjointement un modèle physique effectif tout en laissant intactes les couleurs d’échantillon, l’étalonnage HD et les mesures brutes. L’ajustement traite ces valeurs comme des a priori régularisés, puis utilise chaque échantillon pondéré pour estimer la HD effective par canal RVB, la couleur opaque effective du filament, un exposant de transmission non linéaire pour les séquences contiguës d’un filament et une interaction ordonnée entre le filament visible et le substrat inférieur. Les observations rares restent fondées sur les a priori d’origine ; le modèle ajusté n’est utilisé que si les échantillons sont assez nombreux et s’il améliore le ΔE des matrices réservées sans aggraver les erreurs extrêmes. Une interaction de substrat ajustée est utilisée jusqu’à la plus grande épaisseur contiguë observée pour cette paire de matériaux. L’épaisseur supplémentaire non mesurée prolonge cette couleur étayée vers l’échantillon nominal du filament avec l’a priori d’éprouvette/HD adapté au substrat ; elle ne bascule pas toute la séquence vers une autre prédiction et n’extrapole pas indéfiniment l’exposant ajusté. Le même calcul de préfixe alimente les scores de candidats, comparaisons de recettes et aperçus, y compris les empilements comprimés et alignés sur les couches.

L’ajustement compare ses couleurs simulées aux valeurs sRGB photographiées avec une mesure robuste de l’erreur, tandis que le mélange physique reste calculé en lumière linéaire. Les différences dans les canaux sombres ont ainsi assez de poids pour influencer l’ajustement. Les pénalités d’a priori sont moyennées par famille de paramètres sur les matériaux réellement représentés dans les échantillons d’apprentissage ; ajouter des bobines inutilisées n’affaiblit ni ne désactive le même ajustement. La validation décide toujours de l’usage du modèle ajusté. Une meilleure concordance sur des recettes connues ne démontre pas l’exactitude pour des paires de filaments jamais mesurées.

Les matrices compatibles restent aussi des LUT empiriques dispersées dans les espaces Lab prédit et des recettes physiques : une nouvelle planche peu dense n’efface donc pas les recettes d’une ancienne. Kromacut pondère chaque planche selon la confiance d’alignement validée, la couverture des recettes mesurées, la récence et la concordance robuste avec les recettes mesurées par au moins deux autres planches. Avec seulement une ou deux observations d’une recette, la concordance reste neutre, faute d’informations pour identifier une valeur aberrante. Une recette exacte de couches à profondeur fixe combine directement ses observations Lab photographiées. Une recette manquante combine des interpolations déterministes par inverse de distance de valeurs Lab photographiées voisines, avec l’ordre physique pondéré vers les couches supérieures optiquement dominantes. L’interpolation n’est autorisée qu’à l’intérieur de la couverture Lab prédite locale de chaque matrice et d’un voisinage de recettes borné ; sinon, le modèle physique ajusté conjointement est utilisé. Hors des observations de matrices compatibles, ce modèle revient aux a priori Beer-Lambert/HD enregistrés. Le score d’optimisation et l’aperçu final partagent la même prédiction. Les références Exacte d’épreuve de palette restent prioritaires sur les matrices, et les cases de matrice sont des observations, pas des cibles d’image souhaitées : imprimer une large matrice ne force donc pas l’optimiseur à rechercher toutes les couleurs échantillonnées.

## Incertitude de prédiction

À l’intérieur de la couverture locale de couleurs prédites de la matrice, les corrections interpolées reviennent progressivement au modèle physique à mesure que leur soutien diminue. Les recettes photographiées exactes conservent leurs couleurs mesurées. Un même matériau supérieur ne suffit pas à transférer une mesure : la fondation complète mesurée doit correspondre, ou l’autre support doit être suffisamment opaque et optiquement équivalent, avec la même interaction immédiate de substrat.

Pour une recette mesurée identique, Kromacut peut aussi estimer un transfert vers un support profond différent lorsque le substrat immédiat reste le même matériau et que les couleurs finales simulées diffèrent d’au plus 1 ΔE00. La fondation initiale doit respecter le seuil d’opacité selon l’ajustement actuel ou l’a priori HD enregistré ; les diagnostics indiquent lequel justifiait son épaisseur. Une impression existante peut ainsi conserver l’a priori qui justifiait sa base lorsqu’un ajustement ultérieur change le seuil estimé. La correction mesurée est transférée avec une confiance réduite et marquée **interpolée**, puisque l’équivalence du support est déduite du modèle et non mesurée indépendamment. Cette exception n’active pas une interpolation générale des recettes sur un support différent.

Ajouter davantage du même filament terminal peut prolonger la correction d’un préfixe mesuré. Son influence est atténuée à travers la séquence physique d’origine et disparaît sur au plus une épaisseur de recette de matrice supplémentaire. Cela est également marqué comme interpolé. Ce mécanisme ne prédit pas des préfixes plus fins depuis une mesure plus épaisse, et l’ajout d’un autre matériau met fin au prolongement. Les mesures directes et évaluations applicables d’épreuve de palette conservent leur priorité. Les diagnostics identifient les échantillons sources et précisent si les observations ont été transférées entre supports ou prolongées dans une épaisseur ajoutée.

Chaque préfixe imprimable reçoit une confiance en plus de sa couleur Lab prédite. La confiance garde quatre entrées visibles plutôt que de les réduire à une certitude inexpliquée :

- **Distance aux mesures :** distance de couleur prédite et distance de recette physique à la recette mesurée compatible la plus proche.
- **Concordance locale :** indique si les échantillons voisins décrivent une correction cohérente entre couleur simulée et photographiée.
- **Erreur de validation :** la LUT prédit chaque recette sans son propre échantillon empirique, avec la même sélection de voisins et la même diminution de soutien qu’en utilisation réelle. C’est un contrôle conditionnel avec modèle optique ajusté fixe, pas une estimation indépendante de bout en bout. Séparément, l’ajustement optique est réappris et testé sur des matrices entières réservées, ou sur des groupes d’interactions recette/substrat lorsqu’une seule matrice existe.
- **Méthode de prédiction :** une observation physique exacte dispose au départ de davantage de soutien qu’une interpolation, une estimation ajustée ou une pure simulation Beer-Lambert.

L’optimiseur ajoute au plus cinq points équivalents ΔE pour une correspondance totalement incertaine. C’est assez pour qu’une correspondance proche étayée empiriquement batte un gris spéculatif paraissant parfait, tout en restant borné pour que la confiance ne domine pas une importante erreur visible de couleur. Les références Exacte gardent leur priorité explicite et Préserver la séparation des couleurs juge toujours la faisabilité avec le ΔE00 brut plutôt que le coût ajusté au risque. Les palettes de l’optimiseur, les couches d’aperçu finales et les associations de cibles enregistrées conservent le même objet de confiance, empêchant la recherche et le rendu d’utiliser silencieusement des hypothèses différentes.

L’étalonnage photographique est intrinsèquement sensible à l’appareil, l’exposition, les reflets, la balance des blancs et la lumière d’observation. L’éprouvette sans appareil photo reste la méthode privilégiée pour mesurer la HD. Utilisez une matrice pour obtenir largement des couleurs empiriques de recettes dans des conditions contrôlées, et une épreuve de palette lorsque quelques couleurs d’une image comptent surtout.

## Distances de masquage par canal

Les filaments n’absorbent pas également le rouge, le vert et le bleu — un filament orange laisse passer le rouge mais bloque le bleu — ; une seule HD scalaire est donc une approximation. Kromacut mélange avec trois distances de masquage par canal :

- **Une lecture de support (mode Rapide) :** la comparaison d’opacité mesure une HD scalaire. Les différences RVB restent une estimation prudente issue de la couleur d’échantillon, ancrée pour que le canal le plus lumineux corresponde à cette mesure.
- **Lectures supplémentaires de supports (mode Précis) :** chaque support sollicite différemment la courbe de canaux estimée. Kromacut ajuste une intensité bornée de sélectivité des canaux et la valeur scalaire uniquement autant que les intervalles quantifiés des cases l’exigent. Il ne prétend pas que deux seuils visuels mesurent indépendamment trois valeurs HD spectrales.

La courbe affinée est utilisée directement pour les supports réellement comparés dans l’éprouvette. Sur un support non testé, Kromacut conserve l’estimation Rapide au lieu d’extrapoler une forte variation de teinte. Vous pouvez ajouter des supports lorsque cela vous convient, mais trois ou quatre ne sont pas obligatoires. Des HD de canaux totalement indépendantes, une transmission non linéaire et des interactions spécifiques au substrat sont réservées aux observations de matrice avec validation sur données réservées et contrôles d’épaisseur étayée.

La lecture facultative de fusion enregistre le dernier palier voisin de l’éprouvette qui semblait encore différent. Elle valide la courbe ajustée plutôt que d’ajouter un paramètre libre : un écart important réduit la confiance et apparaît dans les diagnostics.

## Ajustement de la JND de session

La JND par défaut de 2 ΔE00 est une constante de vision humaine, mais un observateur et un éclairage donnés peuvent s’en écarter légèrement. Lorsqu’une session contient assez de lectures multisuports informatives indépendantes, Kromacut peut ajuster une JND commune entre 1 et 3. L’ajustement n’est conservé que s’il est clairement identifiable et surpasse la valeur par défaut ; les lectures quantifiées sont souvent ambiguës avec la HD scalaire, auquel cas la session conserve à juste titre la constante.

## Confiance

Chaque étalonnage porte un score de confiance indiquant à quel point la mesure est bien déterminée :

- Une lecture à une extrémité de l’éprouvette — case 1 ou dernière case — réduit la confiance : le vrai point d’opacité peut se situer hors de la plage imprimée. Imprimez une éprouvette plus longue ou avec des couches plus fines et réétalonnez.
- Des lectures multisuports qui divergent même avec le meilleur ajustement réduisent la confiance ; ce désaccord est indiqué sur l’étalonnage.
- La confiance diminue après six mois, car les filaments vieillissent et les bobines changent.

Les filaments non étalonnés reçoivent un score plus faible selon la plausibilité de leur HD estimée.

## Ce qui change après l’étalonnage

Les distances de masquage par canal alimentent à la fois les **couleurs** prédites pour chaque empilement et l’**épaisseur** de ses zones de transition. L’étalonnage peut modifier les hauteurs générées et le plan de changements, pas seulement l’aperçu.

Un étalonnage appartient au matériau mesuré : il est lié à la couleur d’échantillon utilisée, modifier la couleur du filament le désactive et réétalonner remplace la mesure précédente au lieu d’en faire la moyenne.
