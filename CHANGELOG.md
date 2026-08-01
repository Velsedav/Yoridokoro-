# Journal des versions

## 0.2.3 — 22 juillet 2026

### Corrections

- La recherche d'albums ne perd plus les correspondances exactes situées après
  les douze premiers résultats renvoyés par MusicBrainz.
- Une recherche par titre seul récupère davantage de candidats et place toutes
  les correspondances exactes avant les résultats approximatifs.

## 0.2.2 — 22 juillet 2026

### Corrections

- L'éditeur intégré d'un objectif occupe désormais toute la largeur de la fiche
  et reste aligné avec la barre de progression et le contenu principal.

## 0.2.1 — 22 juillet 2026

### Améliorations

- Les objectifs n'imposent plus de choisir entre Compteur, Mesure, Montant et
  Manuel : leur progression est maintenant déduite de leurs étapes.
- Une étape est simple par défaut et peut recevoir une mesure facultative quand
  un nombre aide réellement, par exemple 60 WPM ou 500 €.
- La modification d'un objectif est intégrée à sa fiche ; les options de
  progression et de rappel restent repliées jusqu'à ce qu'elles soient utiles.
- Les anciennes mesures sont converties sans perte en étapes mesurées lors de la
  première ouverture de cette version.

### Corrections

- Les libellés de progression choisissent automatiquement le format pertinent :
  nombre d'éléments, mesure exacte ou pourcentage pour les cas mixtes.

## 0.2.0 — 21 juillet 2026

### Nouveautés

- Art permet d'associer plusieurs citations à une œuvre, de les commenter et de
  les parcourir dans un carrousel accessible.
- Chaque œuvre peut être recherchée immédiatement sur le web depuis sa carte ou
  son volet Carnet, à la souris comme au clavier.
- Art accueille les collections Photographies, Sculptures et Poèmes ; la
  collection Chansons quitte la navigation au profit des Albums.
- Photographies et Sculptures peuvent être ajoutées depuis le catalogue du Met,
  tandis que PoetryDB alimente la recherche de Poèmes par titre ou auteur.
- Le volet d'une œuvre adopte définitivement le layout « Carnet » à deux
  colonnes : citations à gauche, image et informations à droite.
- La planification Pomodoro propose une prochaine étape claire, privilégie la
  progression vers le chapitre suivant et garde les réglages avancés repliés.
- Les sessions disposent de nouveaux écrans pour la préparation, le travail, la
  pause, le repos total et le bilan final.
- La fin d'une session permet d'évaluer chaque chapitre avec
  « Oublié / Difficile / Bien / Facile », également au clavier avec 1–4.

### Améliorations

- Les longues collections Art restent complètes grâce à la virtualisation des
  listes, sans coupure après une quinzaine d'éléments.
- La recherche Art est plus tolérante et les raccourcis de navigation restent
  neutralisés jusqu'à ce que le champ soit libéré avec Échap.
- Le temps d'étude et l'Historique reposent sur le temps WORK réellement mesuré ;
  PREP, BREAK et les blocs passés ne gonflent plus les résultats.
- Les libellés principaux sont harmonisés en « Sujets », « Pomodoro » et
  « Historique ».
- Les écrans Pomodoro gagnent une hiérarchie, des rayons et des contrastes plus
  cohérents, ainsi qu'une navigation clavier plus directe.
- La barre des collections Art reste compacte et défilable lorsque toutes les
  catégories ne tiennent pas dans la largeur disponible.
- Les barres de défilement adoptent les couleurs de chaque thème et conservent
  une poignée visible, contrastée et confortable à saisir.

### Corrections

- L'indication d'étape affiche désormais les vraies valeurs au lieu de
  `{current}` et `{total}`.
- Une session entièrement passée ne crée plus d'activité d'étude ni de demande
  d'évaluation artificielle.
- Le changement de citation n'entraîne plus de déplacement vertical du volet.
- Les sauvegardes exportées reprennent automatiquement la version réelle de
  Yoridokoro.
