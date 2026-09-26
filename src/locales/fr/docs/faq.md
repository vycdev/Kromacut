---
title: FAQ
slug: faq
order: 100
description: Réponses courtes aux questions fréquentes sur Kromacut.
---

# FAQ

## Qu’est-ce que la distance de masquage ?

La distance de masquage, ou **HD**, est le paramètre d’opacité en éclairage frontal, exprimé en mm, utilisé par la peinture automatique pour estimer l’apparence des couches de filament empilées. À une épaisseur égale à la HD, le modèle de base conserve 10 % de l’influence de la couleur sous-jacente. Le point auquel la différence devient imperceptible dépend aussi du filament, de la couleur du support et des conditions d’observation.

Une HD faible indique un filament plus opaque qui couvre en moins de couches. Une HD élevée indique un filament plus translucide qui nécessite davantage d’épaisseur.

La HD remplace la distance de transmission (TD) affichée dans les versions précédentes. Vous pouvez saisir une TD conventionnelle pour rétroéclairage ou lithophanie à l’aide du bouton de conversion de la ligne d’un filament. Kromacut la multiplie par 0,1 pour obtenir une estimation initiale de HD ; cette conversion n’est pas une nouvelle mesure physique. Consultez [Méthodes d’étalonnage](calibration-workflows).

## Faut-il utiliser Manuel ou Peinture automatique ?

Utilisez **Manuel** pour contrôler directement et artistiquement l’ordre des couleurs et les hauteurs de couche.

Utilisez **Peinture automatique** si vous disposez des couleurs réelles de vos filaments et de leurs distances de masquage, et souhaitez que Kromacut prépare automatiquement l’empilement.

## Dois-je étalonner mes filaments ?

Vous pouvez commencer avec des distances de masquage estimées. Des distances de transmission publiées pour le filament exact que vous possédez peuvent aussi servir de point de départ : saisissez-les avec le bouton de conversion, pas directement dans le champ HD.

L’étalonnage améliore généralement la peinture automatique, surtout lorsqu’aucune valeur publiée n’est disponible ou que le résultat reste incorrect. Il est particulièrement utile lorsque :

- Un filament est translucide.
- Deux filaments se ressemblent visuellement.
- Vous souhaitez des résultats reproductibles d’un projet à l’autre.

## Quelle différence entre couleurs de palette et couleurs de filament ?

Les couleurs de palette sont les couleurs de l’image utilisées en mode 2D et en mode Manuel.

Les couleurs de filament correspondent aux matériaux physiques utilisés par la peinture automatique. Celle-ci peut générer des couleurs de couche virtuelles à partir de l’empilement physique, mais le plan d’impression exporté repose toujours sur des filaments réels.

## Pourquoi l’aperçu 3D nécessite-t-il un bouton de génération ?

La génération 3D peut être coûteuse. Kromacut attend que vous cliquiez sur **Générer le modèle 3D** afin qu’un changement de réglage ne lance et n’annule pas sans cesse de lourds calculs.

## Peut-on exporter sans le mode 3D ?

Utilisez le mode 2D pour télécharger l’image source actuelle, avec les modifications appliquées. Incorporez les réglages en direct avec **Appliquer** avant le téléchargement. Utilisez le mode 3D pour générer et exporter des modèles STL ou 3MF.

## L’aperçu des couches modifie-t-il l’export ?

Non. La plage **Aperçu des couches** modifie seulement ce qui est visible dans l’aperçu. Les exports STL et 3MF contiennent le modèle généré complet.

## Quel fichier faut-il imprimer ?

Choisissez **Télécharger STL** pour une large compatibilité avec les logiciels de découpe et des changements de filament manuels.

Choisissez **Télécharger 3MF** si votre logiciel de découpe prend en charge les fichiers 3MF avec couleurs et si vous souhaitez préserver les objets de couches colorés.

## Pourquoi les hauteurs sont-elles approximatives ?

Les numéros de couche dépendent du logiciel de découpe, notamment de la hauteur de première couche. Utilisez les valeurs des **Instructions d’impression**, puis confirmez les couches de changement finales dans l’aperçu du logiciel de découpe.

## Puis-je partager mes réglages ?

Oui. Exportez les palettes 2D personnalisées au format `.kpal` et les profils de filaments de peinture automatique au format `.kfil`. Les anciens profils `.kapp` restent importables.

## Une taille de pixel plus petite remplace-t-elle une buse plus fine ?

Non. La taille du pixel définit les dimensions physiques des pixels de l’image. Elle peut rendre un trait plus fin que le cordon extrudé que votre buse peut produire. Réglez **Largeur de ligne effective** dans **Paramètres d’impression 3D**, utilisez l’aperçu des détails imprimables en peinture automatique et examinez le résultat découpé. Consultez [Mode 3D](3d-mode).

## Mon étalonnage reste-t-il valable avec une autre hauteur de couche ?

Ne le supposez pas. Les mesures HD et les observations d’apparence jouent des rôles différents. Les observations d’épreuve et de matrice sont vérifiées par rapport aux réglages et aux filaments avec lesquels elles ont été enregistrées. Après un changement de hauteur de couche, examinez les observations actives et imprimez un petit échantillon de validation. Consultez [Méthodes d’étalonnage](calibration-workflows).

## Pourquoi y a-t-il plus de couleurs d’aperçu que de bobines ?

Les couches fines laissent les filaments inférieurs influencer la couleur visible. Différentes épaisseurs du même ordre de bobines produisent différents mélanges prédits. La peinture automatique choisit parmi ces préfixes d’empilement accessibles, tandis que les pièces exportées utilisent toujours les filaments réels. Consultez [Peinture automatique](auto-paint).
