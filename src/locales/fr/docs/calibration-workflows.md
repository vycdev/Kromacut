---
title: Méthodes d’étalonnage
slug: calibration-workflows
order: 65
description: Choisir un outil d’étalonnage, comprendre ses commandes et déterminer quelles mesures s’appliquent à votre prochaine impression.
---

# Méthodes d’étalonnage

L’étalonnage aide la peinture automatique à prédire l’apparence des filaments empilés. Ce n’est pas un étalonnage d’imprimante : ces outils ne règlent ni extrusion, ni températures, ni nivellement, ni buse. Utilisez d’abord des paramètres de découpe fiables, puis mesurez les mêmes matériaux dans les conditions d’observation prévues pour vos créations.

Ouvrez **3D → Peinture automatique → Étalonner**. La boîte contient **Distance de masquage**, **Épreuve de palette** et **Matrice d’empilements**. Ces outils mesurent des choses différentes et peuvent être combinés.

![Trois parcours d’étalonnage : une éprouvette mesure l’opacité, une épreuve de palette compare quelques couleurs de l’illustration et une matrice photographiée mesure de nombreuses recettes. Tous renseignent les couleurs prédites et l’empilement imprimable.](20_calibration_choices.svg)

| Outil | À utiliser lorsque | Ce que vous fournissez | Ce qui peut changer ensuite |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Distance de masquage | L’opacité d’un filament est inconnue ou seulement estimée | La première case de l’éprouvette identique à sa bande de référence | HD, estimations par canal, épaisseur des transitions, hauteur totale et plan de changements |
| Épreuve de palette | Quelques couleurs d’une illustration comptent surtout | Les candidats imprimés les plus proches et la qualité de correspondance | Prédictions locales et préférences d’empilement ; potentiellement ordre, hauteurs et géométrie |
| Matrice d’empilements | Vous souhaitez des couleurs mesurées pour de nombreuses recettes courtes | Une photographie frontale correctement alignée | Prédictions de recettes mesurées, interpolation locale et ajustement physique validé |

Aucun outil n’augmente la résolution XY de l’imprimante ni ne rend toutes les couleurs accessibles. Un profil bien étalonné peut toujours avoir une gamme limitée. Pour le modèle sous-jacent, consultez [Théorie de l’étalonnage](calibration-theory).

## Préparer et protéger votre profil de filaments

Une ligne de filament décrit une vraie bobine, pas une couleur d’image souhaitée.

| Commande | Fonction | Conséquence importante |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Échantillon / Hex | Définit la couleur opaque nominale du filament | La modifier désactive l’étalonnage d’éprouvette mesuré pour l’ancienne couleur et change la compatibilité avec les observations d’apparence enregistrées. |
| Nom | Donne une étiquette lisible à la bobine | Changer l’étiquette ne change pas l’optique. Enregistrez avant de suivre des épreuves ou matrices. |
| Champ HD | Saisit la distance de masquage frontale en mm, de 0,01 à 2 | Une HD plus grande nécessite généralement davantage d’épaisseur pour masquer le substrat. Valider une valeur manuelle efface l’étalonnage d’éprouvette. |
| Convertir depuis TD | Convertit une TD conventionnelle de rétroéclairage/lithophanie en HD avec environ TD × 0,1 | Saisissez la TD ici, pas dans le champ HD. La valeur convertie est une estimation et remplace l’étalonnage d’éprouvette. |
| Baguette | Estime la HD depuis la couleur d’échantillon | Utile comme point de départ, pas comme mesure. Remplace tout étalonnage d’éprouvette existant. |
| Badge d’étalonnage | Affiche Estimation ou la qualité d’un étalonnage mesuré | Survolez pour examiner les HD par canal. Le libellé ne garantit pas qu’une œuvre terminée corresponde à sa source. |
| Ajouter un filament / corbeille | Ajoute ou retire une bobine du jeu de travail | Les couleurs physiques disponibles et la compatibilité des observations peuvent changer. |

Utilisez la barre **Profils** pour conserver un jeu nommé et inchangé avant d’enregistrer des observations d’apparence :

- **Liste des profils :** charge un jeu enregistré dans les filaments de travail. Charger un autre jeu remplace la liste actuelle ; sauvegardez d’abord les modifications à conserver.
- **Enregistrer le profil sélectionné :** remplace sa liste de filaments par les valeurs de travail. Les épreuves et matrices existantes sont conservées, mais les enregistrements incompatibles ne s’appliquent plus au jeu modifié.
- **Enregistrer comme nouveau profil :** crée un jeu nommé distinct. Copie les lignes de filaments et leurs mesures d’éprouvette, pas l’historique d’épreuves et de matrices de l’ancien profil.
- **Renommer :** change l’étiquette du profil sans modifier ses mesures.
- **Importer :** charge des fichiers de filaments. **Exporter** sauvegarde en `.kfil` un profil nommé sans modifications en attente, y compris ses évaluations d’épreuve et mesures de matrice. Sur ordinateur, ouvre Enregistrer sous ; sur le web, suit le téléchargement du navigateur.
- **Supprimer le profil sélectionné :** retire le profil enregistré et ses observations. Exportez une sauvegarde d’abord si vous pourriez en avoir besoin.

L’indicateur **modifications non enregistrées** signifie que le jeu de travail diffère du profil sélectionné. Enregistrez ou remplacez-le avant de créer une matrice ou de consigner des résultats d’épreuve. Exporter dans cet état crée un profil « modifications non enregistrées » sans l’ancien historique d’apparence ; ce n’est pas une sauvegarde complète de cet historique. Les modèles sont des jeux initiaux en lecture seule avec HD estimées : enregistrez votre propre copie avant l’étalonnage. Consultez [Formats des profils et gestion des imports](settings-and-controls#filament-profile-files).

## Distance de masquage : lire une éprouvette

### 1. Sélectionner les filaments et les supports

Sélectionnez un ou plusieurs filaments, ou utilisez **Tout sélectionner / Tout désélectionner**, puis choisissez **Suivant : support**.

- **Rapide** utilise un support par filament. Mesure un seuil d’opacité scalaire et conserve des différences de canaux prudentes estimées depuis l’échantillon.
- **Précis** permet jusqu’à trois supports par filament, en recommandant initialement deux supports utiles lorsqu’ils existent. Chaque support produit une lecture distincte. Cela affine une estimation contrainte des canaux ; cela ne mesure pas indépendamment trois canaux spectraux.
- Les **échantillons de support** choisissent ce qui s’imprime sous le filament. Utilisez un support contrasté pour que les cases fines diffèrent visiblement de la bande. Un support presque identique au filament ne fournit pas de seuil d’opacité utile.

Passer de Rapide à Précis réinitialise les supports selon les recommandations du mode. Le mode Précis est utile lorsque vous pouvez comparer le même matériau sur plusieurs substrats, pas simplement parce que son nom promettrait un résultat universellement meilleur.

### 2. Régler l’éprouvette et l’imprimer

![Une éprouvette possède des cases de plus en plus épaisses à côté d’une bande opaque ; la première case identique fournit la mesure.](07_calibration_wedge.svg)

| Commande | Effet sur l’impression d’étalonnage |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hauteur de couche (mm) | Définit l’épaisseur de chaque couche ajoutée aux cases. Accepte 0,04–0,40 mm. Une hauteur plus fine affine les pas de mesure mais ne rend pas fiable une configuration d’imprimante non adaptée. |
| Couches maximales (longueur de l’éprouvette) | Choisit de 4 à 40 paliers. Plus de paliers élargissent la plage mesurable pour les filaments translucides et allongent/élèvent l’éprouvette. |
| STL (toute imprimante) | Télécharge une tuile sans couleurs. Imprimez une copie par paire filament/support sélectionnée avec le changement manuel indiqué. |
| 3MF (multimatériau) | Inclut toutes les lectures sélectionnées et leurs affectations réelles de filaments/supports dans un fichier. Vérifiez l’association des matériaux dans le logiciel de découpe. |
| Télécharger | Exporte le plan actuel. L’étape de résultats utilise la hauteur de couche et les supports de ce plan, pas une modification ultérieure sans rapport. |

Utilisez exactement la **hauteur de couche normale**, la **hauteur de première couche** et le **changement après couche / Z** affichés. La première couche vient des paramètres d’impression ; la hauteur de couche propre à l’éprouvette est distincte du réglage normal du modèle 3D. Ne redimensionnez pas le modèle en Z. **Suivant : saisir les résultats** ouvre la lecture ; télécharger n’envoie rien à l’imprimante.

Sur ordinateur, les deux formats ouvrent **Enregistrer sous** ; dans le navigateur, ils suivent le téléchargement habituel. Attendez la fin de l’export avant de modifier les réglages ou saisir les résultats. Annuler Enregistrer sous ou subir un échec d’export laisse inchangé le dernier plan téléchargé avec succès ; un échec affiche une erreur pour permettre de réessayer.

### 3. Comparer et enregistrer

Regardez l’éprouvette imprimée face vers le haut sous l’éclairage frontal prévu. L’ergot marque l’extrémité à une couche. Comparez chaque case à la bande voisine, pas à une photo de téléphone ni à un échantillon à l’écran.

- **Correspondance :** saisissez le premier numéro de case visuellement identique à la bande. C’est le nombre de couches de filament ajoutées dans la case, pas le numéro absolu de couche de l’imprimante.
- **Fusion (facultative) :** saisissez la dernière case qui semblait encore différente de la précédente. Cela vérifie la courbe ajustée ; ce n’est pas une deuxième mesure d’opacité obligatoire. Une fusion après la correspondance déclenche un avertissement.
- **Échantillons prédits / HD / confiance / diagnostics :** montrent le résultat déduit de vos lectures. Ce sont des retours, pas des mesures supplémentaires à fournir.
- **Enregistrer l’étalonnage :** applique les mesures complètes et utilisables. Un filament vide est **Non renseigné** et reste inchangé. Un filament Précis partiellement renseigné est **Ne sera pas enregistré** tant que chaque support choisi n’a pas de correspondance. Vous pouvez enregistrer les autres filaments complets sans terminer toute la planche.

Si même la dernière case diffère de la bande, ne la déclarez pas correspondante pour finir : faites une éprouvette plus longue. Si la première correspond déjà, une hauteur de couche plus fine mais imprimable ou un support plus contrasté peut rendre la mesure plus informative. Les lectures aux extrémités de la plage ont une confiance moindre.

Réétalonner un filament remplace son résultat précédent. Pour combiner plusieurs supports, lisez-les ensemble dans une session Précis. Enregistrez/remplacez ensuite le profil nommé et exportez une sauvegarde. La HD mesurée change la couleur prédite et la quantité de matière jugée nécessaire ; régénérez et vérifiez les nouvelles hauteurs et instructions de changement.

**Retour** permet de revoir les étapes. Fermer la boîte réinitialise les sélections et lectures non enregistrées : sauvegardez les résultats utilisables avant de partir. Si plusieurs lectures multisuports complètes déclenchent un ajustement de session, attendez sa fin avant d’enregistrer ; le calcul en attente n’est pas une nouvelle mesure à saisir.

### Exemple imprimé : huit filaments

![Huit éprouvettes HD imprimées avec cases en paliers et bandes opaques, dans l’ordre blanc, noir, rose, jaune, orange, violet, cyan et vert de gauche à droite.](hd-wedges-eight-colors-2026-09-13.jpg)

Cette véritable impression d’étalonnage a été terminée le 13 septembre 2026. Les éprouvettes blanche et colorées utilisent un support noir ; la noire utilise un support blanc. Le profil **8 Colors 0.2mm** associé enregistre des **couches d’éprouvette de 0,04 mm** et une **première couche de 0,10 mm**. Le nom d’un profil ne remplace pas ses paramètres enregistrés.

Utilisez la photo pour reconnaître l’agencement des cases et de la bande ainsi que la progression vers l’opacité, pas pour copier les numéros de correspondance ou prélever des couleurs étalonnées. Exposition, balance des blancs, éclairage et écran peuvent changer la correspondance apparente. Lisez votre propre impression physique à côté de sa bande sous un éclairage frontal constant.

## Épreuve de palette : comparer les couleurs d’une illustration

Une épreuve imprime plusieurs candidats de l’empilement actuel. Un **préfixe** désigne la fondation et toutes les couches au-dessus jusqu’à une hauteur d’arrêt choisie. Les épreuves comparent des hauteurs d’arrêt imprimables, pas des mélanges arbitraires indépendants de bobines.

### Choisir les cibles et les candidats

Laissez d’abord la peinture automatique calculer un résultat contenant au moins deux préfixes imprimables admissibles. Il n’est pas nécessaire de générer d’abord le maillage de l’œuvre. Enregistrez son profil de filaments nommé, puis ouvrez **Épreuve de palette**.

| Commande | Signification |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cibles | Nombre de couleurs de l’illustration à comparer, jusqu’à 10 ou au nombre disponible. Le défaut est 8 s’il y a assez de couleurs. |
| Candidats | Alternatives demandées par cible, normalement 2 à 5, limitées par les préfixes utiles disponibles. Davantage de candidats élargissent l’éprouvette. |
| Choisir dans l’image | Ouvre une vue distincte de sélection. Cliquez sur les zones importantes ou leurs boutons de couleur. |
| Image originale | Cible les couleurs traitées avant ajustement d’apparence, pas la photographie chargée intacte. |
| Ajustées / accessibles | Cible les couleurs prédites exactes du résultat actuel. Sert à vérifier si l’impression correspond à l’aperçu ; « accessibles » ne certifie pas l’exactitude physique. |
| Nombre total de cibles | Définit le même nombre pendant la sélection dans l’image. |
| Effacer les sélections | Retire les priorités manuelles et rend les places libres à la sélection intelligente. |
| Utiliser les cibles intelligentes / Choisies + intelligentes | Revient à l’épreuve avec vos priorités et remplit automatiquement les places restantes. |

Les couleurs choisies restent lumineuses partout où elles apparaissent ; les zones non sélectionnées s’assombrissent. Choisir une cible ne recolore pas la source et ne la force pas dans la gamme de l’imprimante. Réduire le nombre de cibles peut retirer des priorités au-delà de ce nombre.

### Imprimer et identifier l’éprouvette

![Chaque cible possède des cases candidates s’arrêtant à différentes hauteurs au-dessus d’une fondation continue partagée.](09_palette_proof.svg)

Les vues **Plan de l’épreuve** et **Résultats** utilisent une cible par ligne, avec les candidats A à E de gauche à droite. Les nombres identifient la ligne cible. **F** désigne la référence de fondation partagée, pas une sixième couleur candidate ni un autre filament. Comparez-la à la marge de fondation exposée.

**Télécharger 3MF** exporte l’éprouvette et, pour un profil nommé sans modifications en attente, enregistre son identité et sa carte de recettes. Après enregistrement, la sélection et les nombres de cibles sont verrouillés afin que les résultats ne désignent pas silencieusement une autre impression. Conservez la face vers le haut à 100 % d’échelle, utilisez les hauteurs normale et de première couche intégrées, vérifiez les filaments et orientez-la grâce au coin supérieur gauche manquant. L’éprouvette par défaut de 8 cibles × 5 candidats mesure 44 × 68 mm. Ses cases de 8 mm se touchent sur une fondation continue : les frontières peuvent être moins évidentes que sur la grille à l’écran.

### Enregistrer ce que vous voyez réellement

Ouvrez **Résultats**, comparez les candidats imprimés à la cible affichée dans des conditions constantes et choisissez la case la plus proche. Sélectionnez-en plusieurs en cas d’ex æquo. Décrivez ensuite la correspondance :

| Réponse | Ce qu’elle indique à Kromacut |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Meilleure disponible | Option la moins éloignée. La favoriser par rapport aux alternatives sans affirmer qu’elle égale la cible. |
| Proche | La couleur choisie est presque correcte. Ajouter une correction locale souple en plus de la préférence. |
| Exacte | La recette correspond précisément à cette cible. Conserver la référence locale la plus forte, avec les couches inférieures nécessaires pour reproduire sa couleur visible. |
| Aucun | Tous les candidats sont clairement inadéquats. Rejeter localement ces choix sans inventer une bonne couleur ni choisir de gagnant. |

![Après comparaison, un gagnant choisi mène à des candidats proches au tour suivant. Aucun mène à l’exploration sans meilleure référence antérieure. Nouvelles cibles teste un autre ensemble de couleurs.](21_proof_rounds.svg)

Les réponses sont conservées au fil de la saisie. **Terminer les résultats** devient disponible lorsque chaque ligne a une réponse, y compris Aucun. **Modifier les résultats** rouvre une épreuve terminée pour correction. La liste des épreuves enregistrées regroupe les mêmes ensembles de cibles et leurs tours suivants.

- **Poursuivre avec ces cibles :** imprime un nouveau tour pour les mêmes cibles avec l’empilement compatible actuel. Conserve les meilleures sélections précédentes, teste des candidats proches inédits et peut inclure un empilement exploratoire. Une réponse Aucun n’a pas de meilleure référence précédente : le tour suivant explore donc des alternatives.
- **Nouvelles cibles :** ouvre la sélection d’image pour un autre ensemble. La sélection intelligente favorise les couleurs absentes de l’épreuve terminée, puis les moins testées.
- **Moins de candidats / cibles épuisées :** la recherche ne remplit pas la planche de répétitions sans rapport pour atteindre la taille demandée. Lisez l’avertissement ; moins de choix utiles ne signifie pas une perte de l’étalonnage.
- **Supprimer l’épreuve :** après confirmation, retire l’éprouvette enregistrée et toutes ses évaluations des observations d’apparence.

Les résultats restent lisibles sans l’image d’origine. Retélécharger une épreuve nécessite son instantané source exact de peinture automatique ; poursuivre les cibles exige une illustration et un procédé actuels compatibles. Gardez le 3MF original si vous souhaitez éventuellement réimprimer.

Les évaluations peuvent modifier les couleurs prédites proches, le classement des empilements et finalement les hauteurs imprimées. Elles ne changent pas le matériau réel affecté aux couches exportées et ne remplacent pas l’étalonnage HD de la bobine. Un seul résultat n’établit pas une palette globalement exacte. L’ajustement plus large exige suffisamment d’observations et une validation sur données réservées ; les évaluations locales peuvent rester utiles même s’il n’est pas actif.

## Matrice d’empilements : photographier des recettes connues

### Planifier la planche

Enregistrez d’abord un profil nommé inchangé. Réglez **Hauteur de couche** et **Hauteur de première couche** dans les paramètres 3D avant de choisir **Nouvelle matrice**. Le champ de hauteur de l’éprouvette HD ne contrôle pas les matrices.

| Commande | Effet sur la planche |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Échantillons de filaments | Sélectionnez 2 à 8 filaments dans l’ordre du profil. Seuls ces matériaux fournissent les couches de recette. |
| Épaisseur colorée maximale (mm) | Limite la zone colorée au-dessus de la fondation à une couche. Arrondie vers le bas à des couches normales entières, de 1 à 64. À 0,04 mm, une limite de 0,40 mm autorise jusqu’à 10 couches. |
| Nombre maximal de cases | Limite les recettes : 64, 144, 256, 400, 625, 1 024, 1 296, 1 600 ou 2 025. Une planche plus grande échantillonne plus de recettes mais occupe davantage le plateau et prend plus de temps. |
| Budget prévu de changements de matériau | Limite l’estimation du planificateur, références de coin comprises. Choisissez 40 à 640 changements ou Aucune limite du planificateur. Ce n’est ni une durée estimée ni une garantie du nombre final de changements. |
| Filament de support | Choisit un filament sélectionné pour la fondation à une couche et le remplissage sous les recettes courtes. Par défaut, le plus clair. Une première couche fine n’est pas garantie opaque. |
| Hauteur de couche / première couche | Confirmation en lecture seule des paramètres 3D actuels pour une nouvelle planche. |
| Résumé recette / taille / hauteur / changements | Affiche l’emprise, les hauteurs fondation + zone colorée, la hauteur totale et le nombre de couches avant téléchargement. La planche enregistrée indique ses hauteurs figées, cases choisies, changements prévus, références et planches antérieures prises en compte. |
| Créer et télécharger 3MF | Planifie les recettes, exporte la planche puis enregistre le plan dans le profil. |

Les nouvelles planches utilisent une **couverture adaptative** : une recherche bornée et reproductible échantillonne les recettes sur la plage d’épaisseur permise. Elle favorise les lacunes de couleurs déjà mesurées, les profondeurs et transitions non testées, et les recettes exploratoires peu étayées ou auparavant en désaccord avec les mesures. Une nouveauté prédite ne promet pas une nouvelle couleur imprimée. Quelques cases de référence se répètent volontairement pour comparer les photographies successives.

Seules les planches terminées avec données de profil/matériaux, support, hauteurs et alignement photographique accepté compatibles guident la suivante. Télécharger un plan non imprimé ne transforme pas ses couleurs en mesures. Conservez les planches terminées : **Nouvelle matrice** prend automatiquement en compte les mesures admissibles. Changer le support ou les paramètres peut démarrer un contexte de couverture distinct.

Les nouvelles planches ont une **fondation à une couche**, pilotée par la **Hauteur de première couche**, sans plaque supplémentaire fondée sur l’opacité. Par exemple, **0,10 mm de première couche + 0,40 mm de zone colorée = 0,50 mm au total**. Avec des **couches normales de 0,04 mm**, cela fait **11 couches imprimées** : une de fondation et dix de couleur. Le résumé indique cette décomposition avant téléchargement et utilise la fondation réellement enregistrée pour une ancienne planche.

Toutes les cases finissent sur une même surface plane. Une recette plus courte repose sur des couches supplémentaires du même filament de support, sous les couches colorées, **à l’intérieur de la limite d’épaisseur colorée**. Ce remplissage ne s’ajoute pas à la hauteur totale affichée. L’enregistrement conserve à la fois la recette utile et son remplissage de support.

Une première couche fine n’est pas automatiquement opaque. Choisissez un filament de support opaque et photographiez la planche sur un fond plat et constant ; lumière ou couleur transparaissant par-dessous peuvent affecter les mesures. Le support supplémentaire ne peut être considéré comme optiquement neutre que lorsqu’il masque réellement ce qui est dessous.

Les mesures sur une base encore translucide conservent leur épaisseur physique de support. Elles peuvent étayer un empilement physique identique, mais ne sont pas interchangeables entre différentes épaisseurs de support ni utilisées pour ajuster le modèle global à support opaque. Le remplissage peut rendre certaines cases opaques même si la première couche seule ne l’est pas.

Les nouvelles planches regroupent les recettes similaires pour rendre les zones de même couleur plus continues et réduire la fragmentation des trajectoires. Ce regroupement ne réduit pas à lui seul le nombre de filaments par couche : il ne promet donc pas moins de changements ni un gain de temps donné. Les planches existantes conservent les positions originales de leurs cases pour rester compatibles avec leurs photographies.

La limite d’épaisseur n’impose pas à chaque recette d’utiliser autant de matière colorée. Les budgets de cases et de changements peuvent produire moins de cases que demandé ; un budget serré peut laisser certains filaments sélectionnés inutilisés, ce que le plan enregistré signale. Si les seules références dépassent le budget, augmentez-le ou réduisez la limite d’épaisseur ou le choix de filaments. Les planches profondes et les purges CFS/AMS peuvent rester lentes même avec peu de cases : examinez l’estimation finale du logiciel de découpe avant d’imprimer.

Le résumé enregistré compte les recettes sélectionnées non mesurées dans les planches antérieures compatibles. Si ce nombre est nul, le plan répète uniquement des mesures existantes ; vous pouvez éviter de l’imprimer et essayer d’autres limites ou matériaux. Cela ne prouve pas que toutes les couleurs accessibles ont été mesurées, car la recherche est bornée.

Les cases mesurent toujours 5 mm, sans espace, avec une bordure de repères supplémentaire ; par exemple, une grille de données de 32 × 32 occupe une planche de 170 × 170 mm. Les anciennes planches conservent leur profondeur fixe de recette et leurs libellés **toutes les combinaisons** ou **gamme sélectionnée par HD** ; les retélécharger ne les convertit pas au format adaptatif.

Sur ordinateur, annuler Enregistrer sous ne crée pas de nouveau plan. Dans le navigateur, le plan est enregistré au démarrage du téléchargement. Vérifiez les messages d’erreur de stockage et conservez le 3MF. Une planche enregistrée fige ses hauteurs, support et carte de recettes : les modifications ultérieures ne la redessinent pas, et **Télécharger 3MF** sur cet enregistrement réexporte la planche originale.

Imprimez face vers le haut à 100 % d’échelle, avec les hauteurs et affectations exactes. Une première couche inférieure à la hauteur normale est ramenée à cette hauteur. La fondation reste une seule couche à cette hauteur effective ; elle n’est pas épaissie pour atteindre une opacité cible. Les anciennes planches gardent leur fondation originale, y compris toute couche supplémentaire. C’est un objet physique d’étalonnage : changer son échelle Z ou ses matériaux invalide ce que les cases sont censées mesurer.

### Charger et aligner une photo

Sélectionnez la planche imprimée dans la liste des matrices, puis **Choisir une photo** ou déposez une image dans la zone photo. Photographiez sous un éclairage frontal diffus sans reflets importants. Le fichier doit être décodable par l’application ; un RAW ne remplace pas un export d’image normalement visualisable.

![Les quatre poignées se placent au centre des cases de repère colorées hors de la grille de recettes. Le bord dépasse les centres d’une demi-case ; un agrandissement distingue le centre du repère du coin de la planche.](22_matrix_alignment.svg)

| Commande | Ce qu’elle change |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Légende des coins imprimés | Montre l’orientation exigée : 1 en haut à gauche, 2 en haut à droite, 3 en bas à droite, 4 en bas à gauche. Suivez les couleurs de cet enregistrement, qui varient avec les filaments choisis. |
| Tourner à gauche / droite | Tourne la photo de 90° et relance la détection. Ne change pas la carte physique enregistrée. |
| Zoom − / pourcentage / Zoom + | Change le grossissement de 100 % à 400 %. À 100 %, la photo entière tient dans l’espace ; ce n’est pas un pixel écran par pixel photo. Cliquez sur le pourcentage pour réinitialiser et faites défiler pour atteindre les zones agrandies. |
| Quatre poignées numérotées | Faites-les glisser au centre des cases de repère colorées diagonalement à l’extérieur de la grille dense. Le réticule de loupe marque le centre échantillonné. |
| Afficher la grille du modèle | Affiche les frontières projetées des cases pour les comparer à l’impression. C’est une surimpression de contrôle, pas une correction de couleur. |
| Détecter à nouveau | Réestime l’alignement depuis la photo actuelle. |
| Réinitialiser | Restaure l’estimation initiale de la photo actuelle et annule les déplacements manuels. Ne supprime pas un étalonnage enregistré. |
| J’ai vérifié chaque ligne de grille et centre de repère | Obligatoire après ajustement manuel ou détection peu fiable. Confirmez seulement après contrôle de toute la grille et des quatre centres. |

Ne placez pas les poignées sur les dernières cases de recette ni sur les coins extérieurs physiques. Le contour bleu doit dépasser chaque centre de repère d’une demi-case. Vérifiez l’**Aperçu corrigé de la perspective** : les cases doivent paraître carrées et correspondre à la disposition imprimée. L’application échantillonne les centres en retrait pour éviter les frontières, mais une grille décalée associe quand même les mauvaises couleurs aux recettes.

### Choisir l’échantillonnage, puis enregistrer

La **Correction par repères de référence** est désactivée par défaut. Désactivée, elle conserve les couleurs prélevées dans la photo, y compris sa dominante d’appareil. Activée, elle applique des gains par canal estimés en comparant les quatre repères photographiés à leurs couleurs de recette prédites. Elle peut réduire une dominante générale ou un biais de luminosité, mais ne mesure pas indépendamment l’éclairage de la pièce et ne répare ni ombres ni reflets. Des prédictions de repères incorrectes peuvent aussi biaiser le résultat. Un aperçu plus lumineux ne prouve pas une mesure plus exacte.

L’**Aperçu de la LUT extraite** montre les couleurs qui seront stockées, un échantillon par recette. Survolez une case pour ses valeurs RVB prélevées. Comparez avec la planche physique et les conditions d’observation prévues, pas avec l’idée que chaque case devrait être vive.

**Enregistrer l’étalonnage** devient disponible lorsque les échantillons et le contrôle d’alignement sont prêts. Sur un enregistrement terminé, le bouton devient **Remplacer l’étalonnage** et remplace ses mesures photographiées ; téléchargez/exportez une sauvegarde avant si vous souhaitez conserver les deux versions. Le profil conserve couleurs, recettes et métadonnées photo, pas la photo originale. Gardez-la séparément pour pouvoir refaire l’échantillonnage plus tard.

**Nouvelle matrice** démarre une autre planche ; **Retour aux matrices enregistrées** revient aux enregistrements existants. **Supprimer la matrice d’empilements** retire la planche sélectionnée et ses observations. Les planches compatibles terminées peuvent contribuer ensemble : inutile de supprimer une ancienne simplement parce que vous en avez mesuré une nouvelle.

## Quelles observations s’appliquent à ma prochaine impression ?

![Une recette de trois couches mesurée à 0,08 mm n’est pas la même recette physique que trois couches de 0,04 mm. La HD existante peut toujours estimer selon l’épaisseur, mais un même nombre de couches ne rend pas transférables les couleurs de matrice.](23_calibration_scope.svg)

| Observations | Compatibilité à vérifier |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HD d’éprouvette | Appartient à la couleur de filament mesurée. La HD modélise l’épaisseur plutôt qu’un seul nombre de couches ; les nouveaux réglages méritent toujours une vérification physique. |
| Préférences d’épreuve de palette et ajustement large | Exigent les mêmes identités ordonnées de filaments, couleurs, données HD/d’étalonnage, hauteur normale, première couche et opacité de transition. |
| Références Exacte d’épreuve | Exigent le filament/profil et les hauteurs correspondants. Peuvent rester admissibles lorsque le détail des transitions change si le suffixe physique requis reste réalisable. |
| Matrice d’empilements | Exige un alignement terminé et accepté, des données de filaments/profil compatibles et la même hauteur normale. L’usage exact de recette dépend aussi du support mesuré ou d’une équivalence optique étayée. |

Passer de 0,08 à 0,04 mm ne réinterprète pas une recette photographiée de trois couches comme six couches. Cette matrice se trouve hors du nouveau contexte de hauteur normale. Le profil peut encore fournir les estimations HD d’éprouvette, mais le **Modèle d’apparence** peut légitimement indiquer **Estimations seules** et zéro recette de LUT de matrice.

Une autre hauteur de première couche ne désactive pas automatiquement toutes les matrices. Elles préservent leur fondation d’origine, et la réutilisation dépend de la conformité du support généré aux conditions mesurées ou d’équivalence étayée. Ne supposez pas que le même filament supérieur ou la même épaisseur totale suffisent. Consultez l’[incertitude de prédiction](calibration-theory#prediction-uncertainty) pour les règles bornées de transfert de support et de prolongement du même filament.

## Lire la confiance sans surestimer l’exactitude

Le badge du filament, la **Confiance du résultat** et le **Modèle d’apparence / Confiance de prédiction** décrivent des choses différentes :

- La **Confiance du filament** indique à quel point une mesure d’éprouvette est contrainte. Lectures aux limites, désaccord ou vieillissement la réduisent. Estimation signifie qu’aucune mesure d’éprouvette n’est active.
- La **Confiance du résultat** combine Étalonnage, Couverture et Compression. Un total élevé peut coexister avec des couleurs de recette entièrement simulées.
- Le **Modèle d’apparence** identifie les observations empiriques disponibles et l’état d’ajustement. Les nombres d’empilements comparés, de références, de voisinages locaux et de recettes de LUT indiquent ce qui a réellement renseigné le calcul.
- La **Confiance de prédiction** décrit le soutien des couleurs associées à cette image, avec des prédictions mesurées, interpolées, ajustées ou simulées. Une recette mesurée reste une observation photographique ou humaine dans des conditions particulières, pas une garantie de laboratoire.

Utilisez **Meilleure disponible**, pas Exacte, lorsque vous choisissez la case la moins mauvaise. Ne retouchez pas sans cesse une photo de matrice jusqu’à obtenir un aperçu séduisant. L’étape suivante utile est un petit essai physique vérifiant les couleurs et réglages que vous avez réellement changés.
