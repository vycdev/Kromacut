---
title: Génération et export
slug: generating-exporting-output
order: 70
description: Générer le modèle, l’examiner, exporter les fichiers et copier les instructions d’impression.
---

# Génération et export

Le parcours d’export commence lorsque votre image 2D et vos commandes 3D sont prêts.

![Préparez l’image et les réglages, générez un instantané, examinez-le, puis exportez l’empilement complet. Un changement de réglage nécessite une nouvelle génération ; limiter l’aperçu ne limite pas l’export.](40_build_export_snapshot.svg)

## Avant d’exporter

Vérifiez les éléments suivants :

1. En mode 2D, réduisez l’image à un nombre de couleurs pratique.
2. Dans **Paramètres d’impression 3D**, choisissez les dimensions physiques avec **Taille du pixel (XY)**. Faites correspondre **Hauteur de couche** et **Hauteur de première couche** à votre logiciel de découpe, et **Largeur de ligne effective** à la largeur d’extrusion prévue pour les contrôles de détails imprimables et le tramage de hauteur en peinture automatique.
3. Choisissez **Manuel** ou **Peinture automatique**.
4. Cliquez sur **Générer le modèle 3D**.
5. Examinez le modèle et l’**Aperçu des couches**.

Si Kromacut affiche un **Avertissement de performances**, la génération peut être lente en raison des dimensions de l’image, du nombre de pixels, du nombre de couches ou d’une charge similaire. Vous pouvez choisir **Générer quand même**, ou annuler et simplifier le projet.

## Générer le modèle 3D

Cliquez sur **Générer le modèle 3D** chaque fois que vous souhaitez que l’aperçu et la géométrie exportée reflètent les paramètres 3D actuels.

Pendant la génération, Kromacut affiche la progression : lecture des couches de couleur, association des couleurs de l’image ou construction des couches. Les commandes d’export redeviennent utilisables lorsque la surimpression disparaît et que le modèle actualisé est prêt à être examiné.

Le calcul d’un nouvel empilement en peinture automatique n’est pas la génération d’un nouveau maillage. L’export utilise le dernier modèle généré, et les instructions d’impression restent liées à cette génération. Après avoir modifié l’image, changé de profil, enregistré un étalonnage ou modifié les paramètres d’impression, attendez la fin du calcul puis régénérez avant d’exporter. Un ancien aperçu peut rester visible pendant que les nouveaux réglages sont calculés ou rejetés ; sa présence ne prouve pas que les nouveaux réglages ont abouti.

## Choisir STL ou 3MF

Ouvrez le menu de téléchargement 3D et choisissez :

| Format | À utiliser lorsque |
| ------ | ------------------------------------------------------------------------------------------ |
| STL | Vous souhaitez un modèle à géométrie unique largement pris en charge et gérez les changements de filament manuellement. |
| 3MF | Vous souhaitez un export avec couleurs pour un logiciel de découpe capable de conserver plusieurs objets colorés. |

L’export 3MF conserve si possible les couleurs des filaments physiques en peinture automatique. Vérifiez tout de même les affectations dans le logiciel de découpe avant l’impression.

Un aperçu de peinture automatique peut montrer des dizaines de mélanges provenant de quelques bobines réelles. Le 3MF affecte ces filaments réels aux couches physiques, pas un matériau par mélange prédit. La vue habituelle des couleurs de filament dans un logiciel de découpe peut donc différer de la vue **Simulées** de Kromacut sans que les affectations soient erronées. Comparez avec les couleurs **Physiques** pour vérifier les affectations.

Le STL ne contient ni couleurs de filament ni affectations automatiques de bobines. Utilisez le plan de changements copié avec les commandes de changement de couleur du logiciel de découpe. Un 3MF reste un modèle, pas un G-code prêt à exécuter : choisissez votre imprimante, buse, profils de filament, températures et vitesses, puis découpez-le.

Pour les modèles de **Peinture à plat**, le menu ne propose que le 3MF : le modèle contient un objet par filament physique et, dans la disposition par défaut face vers le bas, un objet de support transparent. La disposition facultative face vers le haut omet ce support. Un STL sans couleur à géométrie unique de l’une ou l’autre plaque serait inutile. Les deux orientations prennent en charge toutes les intensités de **Maillage lissé**. Reconstruisez le modèle après avoir changé l’intensité pour l’appliquer à l’aperçu et à la géométrie exportée.

## Instructions d’impression

Le panneau **Instructions d’impression** fournit :

- Les nombres de parois, le remplissage, la hauteur de couche et celle de première couche recommandés.
- **Commencer avec la couleur**.
- Le **Plan de changements de couleur**, avec numéros de couche et hauteurs approximatives.
- Un bouton **Copier** pour le plan complet en texte brut.

Consultez le plan copié à côté de l’aperçu du logiciel de découpe. Les numéros de couche dépendent de **Hauteur de couche** et de **Hauteur de première couche** : gardez ces valeurs cohérentes.

![Une première couche de 0,10 mm suivie de couches de 0,04 mm. Un changement avant la couche 4 se situe à la frontière de matériau de 0,18 mm, tandis que la nouvelle couche se termine à 0,22 mm.](41_swap_layers.svg)

**Changer à la couche N** signifie que le nouveau filament imprime la couche N. Par exemple, avec une première couche de 0,10 mm et des couches normales de 0,04 mm, les couches 1, 2 et 3 se terminent à 0,10, 0,14 et 0,18 mm. Pour commencer le filament suivant à la couche 4, changez après la couche 3, avant d’extruder la couche 4. Cette nouvelle couche se termine à 0,22 mm.

La hauteur approximative du plan demande de l’attention : le parcours Manuel affiche le Z du dessus de la nouvelle couche, tandis que la peinture automatique affiche la frontière du changement de matériau. Utilisez le numéro de couche et examinez la transition réelle des matériaux après découpe, pas seulement une valeur Z qui semble correspondre. Les logiciels de découpe peuvent nommer différemment la couche sélectionnée et le point d’insertion.

En peinture à plat, il n’y a pas de plan de changements manuels. Le panneau résume plutôt la méthode multimatériau choisie : affectez chaque objet 3MF à son filament, puis utilisez un filament transparent et retournez l’impression par défaut face vers le bas, ou imprimez la disposition sans support face vers le haut. Aucune disposition ne doit être mise en miroir dans le logiciel de découpe.

## Paramètres de découpe recommandés

Kromacut recommande :

- Nombre de parois : `1`
- Remplissage : `100%`
- Hauteur de couche : la valeur des **Instructions d’impression**
- Hauteur de première couche : la valeur des **Instructions d’impression**

Examinez toujours l’aperçu de découpe avant l’impression. Les hauteurs sont approximatives et les logiciels peuvent afficher les changements différemment selon la première couche.

Conservez une **échelle Z de 100 %** et une hauteur de couche constante correspondant au modèle. Modifier l’échelle Z ou activer une hauteur de couche variable déplace les transitions physiques et invalide le plan copié. Si vous avez besoin d’une autre hauteur de couche, réglez-la dans Kromacut et régénérez. Modifier l’échelle XY change aussi les détails imprimables par rapport à la buse ; définissez la taille souhaitée dans Kromacut afin que le contrôle de largeur de ligne utilise cette taille.

Examinez les petits îlots, le texte, les découpes transparentes déconnectées, les fondations et le dispositif de purge/amorçage dans le logiciel de découpe. Lisser les contours ne rend pas tous les traits fins imprimables. L’application n’étalonne ni le débit, ni la rétraction, ni la température, ni la mécanique de votre imprimante.

## Enregistrer et annuler

Sur ordinateur, les exports ouvrent une boîte **Enregistrer sous**. Dans le navigateur, ils suivent les paramètres de téléchargement ; l’apparition d’une demande d’emplacement dépend donc du navigateur. Annuler une boîte de dialogue n’envoie rien à l’imprimante. Pendant l’export, l’écriture de la géométrie et la compression de l’archive peuvent prendre du temps ; attendez la fin de l’enregistrement avant de fermer l’application.

## Conseils d’export

- Régénérez le modèle après avoir modifié les paramètres 3D.
- Ne vous fiez pas uniquement à la plage visible de l’aperçu des couches : l’export contient le modèle complet.
- Si le maillage est trop lourd à générer ou découper, recadrez ou réduisez la résolution de la source en 2D et supprimez les zones colorées inutiles. Augmenter la **Taille du pixel (XY)** agrandit les mêmes pixels ; cela n’en réduit pas le nombre et ne simplifie pas le maillage.
- Si les instructions de changement sont désactivées à cause d’un trop grand nombre de couleurs, revenez à [Réduction des couleurs](reducing-colors#image-colors).

Suite : [Paramètres et commandes](settings-and-controls).
