---
title: Paramètres et commandes
slug: settings-and-controls
order: 80
description: Actions de l’en-tête, thèmes, sauvegarde, palettes, profils et commandes de l’espace de travail.
---

# Paramètres et commandes

Cette page rassemble les commandes qui affectent toute l’application ou passent facilement inaperçues.

## Commandes de l’en-tête

| Commande | Fonction |
| ------------- | ------------------------------------------------------------------------------ |
| Logo Kromacut | Revient à l’application lorsque la documentation est ouverte ; sinon, ouvre la page d’accueil. |
| Paramètres | Ouvre la boîte des paramètres, avec les commandes de langue, thème, ressources et mises à jour. |

Le sélecteur de thème propose **Système**, **Sombre** et **Clair**. **Système** suit la préférence de couleurs du système d’exploitation ou du navigateur et se met à jour lorsqu’elle change. Le thème choisi est conservé pour les sessions suivantes.

Le sélecteur **Langue** modifie l’interface, la documentation, les schémas et les pages publiques. Choisissez **Langue du système** pour suivre une langue prise en charge du navigateur ou du système d’exploitation, ou sélectionnez anglais, français, allemand, italien, roumain, espagnol, japonais, chinois simplifié, hindi, portugais européen, ukrainien ou bengali. Votre choix est enregistré localement et ne change ni vos illustrations, ni vos profils de filaments, ni vos réglages d’impression, ni la géométrie générée. Les traductions et polices sont incluses dans l’application de bureau ; aucun service de traduction en ligne ne reçoit votre travail.

Les pages publiques proposent aussi un sélecteur de langue. La documentation traduite utilise des liens partageables préfixés par la langue, comme `/ro/docs/overview`. Les noms de pages et les ancres de section restent stables d’une langue à l’autre. Les extensions de fichiers, données numériques des modèles, noms saisis par l’utilisateur et titres originaux des œuvres communautaires ne sont pas traduits.

La boîte des paramètres contient des liens vers la documentation, Discord, Reddit, GitHub et Patreon, et affiche la version actuelle de Kromacut.

## Modes de l’espace de travail

Utilisez les boutons **2D** et **3D** pour passer de la préparation d’image à la génération du modèle.

La séparation verticale entre le panneau de commandes et l’aperçu peut être déplacée. Élargissez le panneau de gauche pour travailler sur des réglages détaillés, ou l’aperçu pour examiner l’image ou le modèle.

Les pages de documentation utilisent des liens `/docs/...` partageables. Ouvrir un de ces liens vous amène directement au guide correspondant.

Sur les petits écrans, développez **Sommaire** pour choisir un guide ou **Sur cette page** pour atteindre une section. Les deux se referment après sélection pour laisser de la place à la lecture. Les illustrations s’ouvrent en taille réelle en cliquant dessus ou en ciblant leur lien puis en appuyant sur Entrée.

La plupart des sections latérales peuvent être repliées par leur titre. Le repli masque les commandes, pas leurs effets : les réglages actifs, les paramètres d’impression et les options d’optimisation restent appliqués. Les résumés repliés et les indicateurs d’état aident à repérer les changements actifs. L’état ouvert/fermé est mémorisé. Développer une section ne la réinitialise pas.

**Annuler / Rétablir** partage l’historique de retouche d’image entre la 2D et la 3D. Ce n’est pas un historique des modifications de filaments, de l’étalonnage, des hauteurs de couche ou des paramètres d’optimisation. Utilisez le bouton de réinitialisation propre à chaque panneau lorsqu’il existe, et régénérez après avoir restauré un état de l’image.

## Mode multiplateau expérimental

L’option **Mode multiplateau** des paramètres est une fonctionnalité inachevée. Elle mémorise la préférence et peut jouer une animation d’aperçu, mais ne découpe pas encore l’image, ne crée pas de tuiles, ne répartit pas les objets sur des plateaux et ne change pas la géométrie exportée. Laissez-la désactivée pour l’impression normale. Ne l’utilisez pas pour faire tenir un modèle trop grand sur votre plateau.

## Paramètres d’impression enregistrés

Kromacut mémorise dans le navigateur des paramètres comme **Taille du pixel (XY)**, **Hauteur de couche**, **Hauteur de première couche**, **Largeur de ligne effective** et **Maillage lissé**.

Utilisez le bouton de réinitialisation de **Paramètres d’impression 3D** pour revenir aux valeurs par défaut de la section, dont 0,42 mm pour la largeur de ligne effective.

Les paramètres mémorisés sont locaux au navigateur/site actuel ou à l’application de bureau. Ils ne constituent ni une sauvegarde de l’illustration ni un projet complet enregistré, et les navigateurs distincts ou l’application de bureau ne les partagent pas nécessairement. Exportez les palettes et profils importants avant d’effacer les données. Charger un profil restaure ses filaments et ses observations, pas une image ni un maillage déjà généré.

## État de peinture automatique enregistré

Les paramètres de peinture automatique sont conservés entre sessions, notamment :

- Les filaments.
- Le mode de peinture.
- La hauteur maximale et la hauteur de couche de l’éprouvette d’étalonnage.
- La correspondance des couleurs améliorée.
- La préservation de la séparation des couleurs, sa limite ΔE de correspondance unique et l’exigence éventuelle d’une correspondance unique pour chaque couleur.
- La limite totale de répétitions, partagée entre les apparitions supplémentaires de filaments dans l’empilement.
- Le détail des transitions et le tramage de hauteur.
- La largeur de ligne effective, modifiée dans **Paramètres d’impression 3D**, pour les avertissements de largeur, le nettoyage des points isolés et le tramage de hauteur, ainsi que la préférence **Omettre les points de couleur isolés**. Cette préférence de nettoyage ne supprime pas tous les avertissements de largeur et ne contrôle pas le tramage de hauteur.
- La peinture à plat et sa préférence face vers le haut sans couche transparente.
- L’algorithme d’optimisation et sa graine.
- La priorité régionale.

Les profils sont distincts de cet état mémorisé. Utilisez-les pour disposer de jeux de filaments nommés que vous pouvez charger, importer ou exporter.

## Fichiers de palette

Les palettes personnalisées servent à la réduction des couleurs 2D. Leurs fichiers portent l’extension `.kpal`.

La version 2 du format ajoute deux champs facultatifs : `disabledColors` (couleurs conservées mais exclues de la quantification) et `colorNames` (noms d’affichage facultatifs par couleur). Les deux sont conservés à l’export et à l’import. Les fichiers de version 1 se chargent sans modification avec toutes les couleurs activées et sans nom ; un fichier v2 ouvert dans un ancien Kromacut est simplement traité comme si toutes les couleurs étaient activées.

Utilisez des palettes personnalisées pour faire correspondre l’image réduite à un jeu de filaments connu ou à une collection fixe de couleurs.

## Fichiers de profils de filaments

Les profils de filaments de peinture automatique sont des jeux nommés que vous pouvez enregistrer, charger, importer et exporter. Ils utilisent `.kfil` et conservent les couleurs, noms, distances de masquage, données d’étalonnage, épreuves de palette et évaluations enregistrées, ainsi que des plans de matrice d’empilements et couleurs mesurées de taille limitée lorsqu’ils sont disponibles. Les anciens profils `.kapp` restent importables. Les profils d’anciennes versions stockaient les valeurs non étalonnées sur l’échelle TD conventionnelle ; elles sont converties automatiquement (×0,1) au chargement ou à l’import.

Utilisez l’**icône d’importation** de la barre de profils pour importer un fichier. Un ancien fichier de même identifiant sans données d’apparence est importé comme copie distincte renommée au lieu d’effacer les observations d’étalonnage plus récentes ; en cas d’échec de stockage, la liste existante reste inchangée et un message d’erreur apparaît. Utilisez l’**icône de téléchargement** pour exporter le jeu de filaments actuel. Les fichiers exportés utilisent `.kfil` par défaut. Si le profil chargé contient des modifications de filaments non enregistrées, l’export crée un nouveau profil « modifications non enregistrées », sans les observations d’apparence liées aux anciennes identités de filaments.

### Formats d’import pris en charge

| Format | Extension | Remarques |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Profil Kromacut | `.kfil` | Format natif. Accepte un profil unique ou un tableau de profils dans un même fichier. |
| Ancien profil Kromacut | `.kapp` | Ancien format natif, toujours entièrement pris en charge à l’import. |
| JSON brut | `.json` | Accepté si le fichier contient un objet de profil ou un tableau d’objets de profil. |
| CSV/TSV de bobines HueForge | `.csv`, `.tsv` | Voir ci-dessous. |

### Gestion des doublons

À l’import, Kromacut compare chaque profil entrant aux profils existants :

- **Même identifiant :** remplace normalement le profil existant. Si cela remplacerait des observations d’apparence enregistrées par un fichier sans observations utilisables, une copie distincte est importée à la place.
- **Même contenu, identifiant différent :** ignoré uniquement si les données de filaments et les observations d’apparence correspondent à un profil existant.
- **Même nom, contenu différent :** importé avec un suffixe numérique ajouté au nom (par exemple `Mes bobines (2)`).

Un bref bilan du nombre de profils importés, remplacés, ignorés ou renommés apparaît après chaque import.

### Importer depuis HueForge

Les exports de bibliothèque de bobines HueForge (`.csv` ou `.tsv`) sont directement importables. Utilisez **Export Spools** dans HueForge pour enregistrer un CSV, puis cliquez sur l’icône d’importation de la barre de profils de peinture automatique et sélectionnez le fichier. Le séparateur (virgule ou tabulation) est détecté automatiquement dans l’en-tête. Chaque bobine devient une entrée de filament nommée `<Brand>-<Color Name>-<Hex>`, par exemple `Inland Basic-Light Brown-#BF9C81`. Les UUID HueForge sont conservés comme identifiants de filament afin que réimporter la même bibliothèque ne crée pas de doublons. Les valeurs TD HueForge sont considérées comme des TD conventionnelles pour rétroéclairage/lithophanie et converties en distances de masquage frontales à l’import.

## Avis de mise à jour sur ordinateur

Dans l’application de bureau, Kromacut peut afficher un avis lorsqu’une version plus récente est disponible. Cet avis permet d’ouvrir la page de téléchargement ou de fermer le rappel.

Ouvrez **Paramètres** pour rechercher manuellement des mises à jour. Les paramètres de bureau comprennent aussi **Vérifier au démarrage**, qui détermine si Kromacut recherche des mises à jour à l’ouverture. L’option est activée par défaut et les vérifications manuelles fonctionnent même lorsqu’elle est désactivée.

Sous Linux, les AppImages contenant des informations de mise à jour peuvent être actualisées avec des outils compatibles comme AppImageUpdate. Ces outils utilisent le fichier `.AppImage.zsync` de la version pour télécharger les parties modifiées. Les anciennes AppImages sans ces informations nécessitent un premier téléchargement manuel d’une version compatible. Le fichier `.zsync` n’est pas un programme d’installation, et l’avis de mise à jour de Kromacut n’installe pas automatiquement les mises à jour.

## Diagnostics de peinture automatique sur ordinateur

L’application de bureau peut enregistrer des informations structurées sur les nouveaux calculs de peinture automatique. Ouvrez **Paramètres** et activez **Enregistrer les diagnostics de peinture automatique** avant de lancer un calcul. Le réglage ne relance pas et n’enregistre pas un résultat déjà calculé.

Chaque calcul crée un fichier `.jsonl` distinct dans le dossier de diagnostics de peinture automatique de Kromacut. Utilisez **Ouvrir le dossier** à côté du réglage pour trouver les fichiers. Chaque ligne constitue un événement JSON complet : progression, erreurs et annulations restent donc lisibles même si le calcul n’aboutit pas.

Une trace complète contient les informations de base d’exécution, l’instantané des filaments et de l’étalonnage actifs, les paramètres de génération et d’optimisation, des échantillons limités de progression, l’état d’ajustement de l’apparence, les décisions progressives de niveaux de répétition, les couches physiques finales, chaque couleur imprimable candidate finale, les comparaisons Delta E entre cibles et candidats, la confiance de prédiction et les mesures ayant contribué aux couleurs interpolées ou ajustées localement. Elle enregistre les couleurs de palette traitées et leurs poids, pas l’image source chargée. Les données d’étalonnage et de profil peuvent néanmoins être sensibles : examinez la trace avant de la partager publiquement.

L’enregistrement sert aux investigations et peut créer de gros fichiers. Laissez-le désactivé pour les impressions ordinaires lorsque vous n’avez pas besoin d’une trace.

## Ouvrir des fichiers depuis le bureau

Les installations de bureau associent les fichiers `.kfil` et les anciens `.kapp` aux profils de filaments, et les fichiers `.kpal` aux palettes. Double-cliquez sur un fichier pour l’importer et le sélectionner dans Kromacut. Si l’application est déjà ouverte, le fichier est traité dans sa fenêtre existante. Les règles habituelles de validation, migration, doublons et préservation du calibrage s’appliquent.

Les fichiers ouverts depuis le bureau attendent tant que l’éditeur de palettes ou la boîte de dialogue d’étalonnage est ouvert. Terminez ou annulez cette session pour poursuivre les importations en attente.

Avant de remplacer des modifications de filaments non enregistrées, Kromacut propose **Conserver les modifications** ou **Ouvrir le profil**. Conservez-les pour les enregistrer d’abord ; ouvrir le profil les abandonne. Les fichiers ouverts ainsi doivent faire moins de 32 Mio. Les fichiers JSON génériques, images et modèles conservent leurs procédures d’importation habituelles.

Sous Linux, les AppImages portables nécessitent une intégration au bureau pour les associations de fichiers. Si Kromacut n’est pas l’application par défaut, utilisez **Ouvrir avec** dans votre gestionnaire de fichiers.

Suite : [Dépannage](troubleshooting).
