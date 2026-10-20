# Audit des parcours UI — 7 octobre 2026

## Corrections appliquées après l’audit

Les constats ci-dessous décrivent l’état initial. Les points 01, 02, 03, 04, 06, 07, 08, 09 et 10 ont été corrigés. Le contraste (point 05 du rapport) reste inchangé à la demande de l’utilisateur.

- Historique : dates valides et fin strictement après le début exigées avant toute lecture ou écriture ; erreur près du champ et fenêtre maintenue ouverte.
- Aujourd’hui : Entrée laisse les boutons, liens et menus gérer leur action.
- Fenêtres : gestion commune du focus, contrôles visibles et actifs, priorité à la fenêtre imbriquée et restitution au déclencheur au démontage.
- Sujets : label associé au nom, erreur annoncée et reliée au champ.
- Relations : annulation pendant dix secondes, accès aux archives et restauration ultérieure ; les archives restent exclues des relances d’Aujourd’hui.
- Paramètres : sept libellés visibles en fenêtre compacte.
- Démarrage rapide : commandes traduites en français, avec traductions anglaises de secours pour les autres langues.
- Pomodoro : explications repliées, carte centrée et plus compacte ; Culture : image facultative repliée, corps défilant et actions fixes, unités intégrées au champ.

Validation : 408 tests passent, vérification TypeScript et build réussis. Douze fenêtres vérifiées dans Electron au clavier ; rejet d’un intervalle inversé sans écriture, annulation/restauration d’une relation et sept libellés compacts confirmés. Les huit états du timer restent sans débordement horizontal. Les actions culturelles restent visibles avec l’image dépliée ; le bouton principal de Pomodoro est visible dans la fenêtre de 1440 × 1000 testée. Le choix de technique imbriqué a été rejoué après la dernière modification du hook de focus.

Ces vérifications ont utilisé le profil isolé de l’audit. Les limites du périmètre initial restent valables.

L’application a une base visuelle cohérente. Les prochains gains concernent surtout les interactions au clavier, la validation des formulaires et la récupération après une action. Dix points méritent une correction ; les trois premiers passent avant le travail esthétique.

## Périmètre et méthode

Audit exécuté dans Electron, sur un profil de test séparé (`.cache/rework-audit/profile`). Les créations, modifications et archivages ont porté sur ce profil. Les données personnelles de l’application ouverte n’ont pas été utilisées.

- 14 routes examinées avec Rework et Kokedera, dans des fenêtres de 1440 et 700 pixels : 56 états. Aujourd’hui, Sujets, détail d’un sujet, Pomodoro, Historique, Objectifs, détail d’un objectif, Relations, Art, Méthodes, Analytics, journal de réflexion, réflexion et Paramètres.
- 8 états supplémentaires du timer : préparation et concentration, sur les mêmes thèmes et tailles.
- 12 fenêtres parcourues au clavier : création de sujet, démarrage d’étude, choix de technique imbriqué, personne, échange, ressources d’activité, édition du temps, composition de grille, création d’objectif, calendrier culturel, événement culturel et ajout Art.
- Vérification de Tab et Maj+Tab aux limites des fenêtres, Échap, focus initial et retour au déclencheur ; tests de création, validation et archivage ; comparaison visuelle et mesures de contraste.
- Les mesures de contraste composent les fonds transparents et les couleurs `color(srgb …)`. Les images, dégradés et éléments décoratifs sont exclus du classement automatique. Les petits boutons radio sont évalués avec leur carte cliquable, pas uniquement avec leur carré de 17 pixels.

Les appels aux catalogues externes, les sélecteurs de fichiers Windows, l’export vers un dossier réel, le lancement au démarrage et les 23 autres palettes n’ont pas été testés dans cet audit. Le timer en pause/reprise, les notifications système et les séances jusqu’à leur terme demandent un parcours fonctionnel complémentaire. Les animations ont été neutralisées pour stabiliser les captures ; la fluidité n’a pas été mesurée. Les sept panneaux des Paramètres et les parcours Art plus détaillés ont fait l’objet des vérifications précédentes ; ils ne sont pas recomptés ici.

## Corrections prioritaires

| Priorité | Point confirmé | Conséquence |
| --- | --- | --- |
| P1 | 01 — Historique accepte une fin antérieure au début | Enregistrement incohérent, affiché comme une réussite |
| P1 | 02 — Entrée sur un filtre d’Aujourd’hui lance une séance | Une action au clavier déclenche un autre parcours |
| P1 | 03 — Le focus sort de certaines fenêtres | Le clavier agit sur la page derrière la fenêtre |
| P2 | 04 — Le focus n’est pas toujours restauré à la fermeture | Perte du point de navigation |
| P2 | 05 — Plusieurs petits textes manquent de contraste | Lecture difficile, selon la palette |
| P2 | 06 — Le formulaire de sujet manque d’associations de labels | Nom et erreur difficiles à identifier avec un lecteur d’écran |
| P2 | 07 — Une relation archivée n’a pas de chemin de récupération | Un clic accidentel exige une intervention hors de la page |
| P3 | 08 — Paramètres compacts perd ses libellés | Sept icônes à interpréter ou à survoler |
| P3 | 09 — Le démarrage d’étude mélange français et anglais | Incohérence avec le reste de la navigation |
| P3 | 10 — Certains formulaires restent trop grands et chargés | Scroll et lecture supplémentaires avant l’action |

### 01 — Intervalle de temps invalide accepté

**Reproduction :** Historique → modifier une entrée → début à 15 h, fin à 14 h le même jour → Enregistrer.

**Résultat :** la fenêtre se ferme et affiche « Entrée mise à jour ». La base contient effectivement une fin antérieure au début et une durée de zéro seconde. Ce n’est pas seulement un défaut d’affichage.

**Cause :** [updateTimeEntry](../src/lib/activityTime.ts) borne la durée à zéro sans rejeter l’intervalle. Le formulaire [ActivityCalendar](../src/pages/ActivityCalendar.tsx) ne présente pas d’erreur pour ce cas.

**Correction attendue :** valider les dates avant toute écriture, laisser la fenêtre ouverte et afficher une erreur près du champ Fin. Préserver l’entrée existante en cas d’échec. Ajouter un test qui vérifie qu’un intervalle inversé ne modifie pas la base.

### 02 — Raccourci global trop large sur Aujourd’hui

**Reproduction :** sélectionner au clavier le bouton Année du temps enregistré, puis appuyer sur Entrée.

**Résultat :** navigation vers `#/session` et création d’une séance, au lieu d’activer Année. Reproduit dans Electron.

**Cause :** le gestionnaire de [TodayDashboard](../src/pages/TodayDashboard.tsx) écoute Entrée en capture et protège les champs, mais pas les boutons, liens ou éléments `summary`. Pomodoro et Sujets ont déjà des protections plus adaptées.

**Correction attendue :** laisser les contrôles interactifs gérer Entrée, et réserver le raccourci global au fond de page. Vérifier aussi les boutons de priorité, les durées du démarrage rapide et les liens.

### 03 — Pièges de focus incomplets

**Reproduction :** ouvrir une création d’objectif ou d’événement culturel vide ; placer le focus sur le dernier contrôle actif ; appuyer sur Tab. Autre cas reproduit : choix de technique ouvert depuis le démarrage d’étude.

**Résultat :** le focus sort de la fenêtre. Maj+Tab et Échap fonctionnent dans ces parcours, mais Tab ne boucle pas correctement.

**Cause :** [BingoModal](../src/components/bingoals/BingoModal.tsx) inclut les boutons désactivés dans ses bornes de focus. Le bouton Enregistrer désactivé peut être traité comme le dernier élément, alors que le clavier le saute. [useDialogFocus](../src/hooks/useDialogFocus.ts) ne filtre pas les éléments masqués, ce qui fragilise les fenêtres avec panneaux repliés. Ces défauts ont été reproduits deux fois.

**Correction attendue :** calculer les bornes uniquement sur les éléments visibles, actifs et navigables ; garantir qu’une seule fenêtre dirige le focus lorsqu’un sous-menu est ouvert. Ajouter des tests de limites avec un bouton final désactivé et une fenêtre imbriquée.

### 04 — Retour de focus perdu

**Reproduction :** ouvrir puis fermer avec Échap la création d’un sujet, le calendrier culturel ou la création d’un événement.

**Résultat :** le focus ne revient pas au bouton d’ouverture. Les fenêtres de Relations, ressources, édition d’Historique, composition/création d’objectif et ajout Art rétablissent correctement leur déclencheur dans les cas testés.

**Cause probable :** la création de sujet utilise `autoFocus`, avant la capture du focus précédent dans l’effet. Les fenêtres culturelles sont démontées à la fermeture ; le chemin de restitution de BingoModal dépend actuellement d’une transition vers `open=false`, sans restitution dans le nettoyage de l’effet.

**Correction attendue :** conserver explicitement le déclencheur avant l’ouverture et restaurer son focus lors de la fermeture comme du démontage. Les observations du sélecteur personnalisé demandent une vérification complémentaire et ne sont pas classées comme un défaut supplémentaire ici.

### 05 — Contraste de textes secondaires

Mesures sur les couleurs réellement calculées, sans compter les répétitions comme des problèmes distincts :

| Zone | Thème | Exemple mesuré |
| --- | --- | --- |
| Blocs du planner avancé | Rework | Work 2,04:1 ; Break 2,06:1 ; Prep 3,02:1, texte de 11 px |
| Résumé Art | Rework | Auteur de citation et légendes des compteurs 2,64:1, texte de 9 px |
| Types d’activité de l’Historique | Rework | Sujets 3,86:1 ; Art 4,01:1 ; Objectif 4,05:1, texte de 11 px |
| Types d’activité de l’Historique | Kokedera | Carrière 3,28:1 ; Loisir 3,17:1, texte de 11 px |

**Correction attendue :** employer une couleur de texte lisible issue de la palette et réserver la couleur catégorielle à une marque ou une icône. Renforcer les textes Art de 9 px. La valeur de référence pour du texte normal est 4,5:1. Les séparateurs décoratifs du tableau Sujets ont été écartés des défauts de lecture.

### 06 — Formulaire de création de sujet

**Reproduction :** ouvrir Nouvelle matière et tenter de créer sans nom.

**Résultat :** l’erreur française apparaît correctement et la création reste bloquée. Toutefois, le champ Nom a zéro label associé, aucun `aria-label` et aucun `aria-invalid`. L’erreur n’est pas reliée au champ. Le formulaire comporte également des labels visuels sans liaison explicite.

**Correction attendue :** associer `htmlFor` et `id`, lier les erreurs avec `aria-describedby` et exposer l’état invalide. Le parcours nominal a été vérifié : un nom valide crée le sujet, ferme la fenêtre et l’affiche dans la liste.

### 07 — Récupérer une relation archivée

**Reproduction :** créer une personne de test puis cliquer sur son bouton Archiver.

**Résultat :** la personne disparaît et une confirmation textuelle apparaît. Aucun bouton Annuler, Restaurer ou accès aux archives n’est proposé. Les filtres Relations portent sur le type de relation, pas sur l’archivage.

**Correction attendue :** ajouter une annulation temporaire et un accès discret aux archives. Appliquer ensuite le même contrat à l’archivage des activités, qui masque aussi les éléments dans l’Historique. L’absence de récupération d’activité a été constatée dans le code ; le parcours de récupération a été testé uniquement pour Relations.

### 08 — Navigation des Paramètres en fenêtre compacte

À 700 pixels, les sept libellés des catégories sont masqués. Les icônes restent utilisables et leurs textes existent dans le DOM, mais la navigation demande de les interpréter ou d’utiliser leurs infobulles.

**Correction attendue :** conserver de courts libellés dans la barre horizontale, avec retour à la ligne ou scroll horizontal local si nécessaire. Une règle de l’ancienne barre latérale dans [ObsidianSettings.css](../src/pages/ObsidianSettings.css) masque encore ces textes.

### 09 — Français/anglais mélangés

Le démarrage d’étude affiche notamment « Start: … », « Launch Session » et des labels anglais, alors que la langue sélectionnée est le français. Certaines descriptions de thèmes restent également anglaises.

**Correction attendue :** traduire d’abord les commandes du parcours d’étude dans [ObsidianQuickStart](../src/components/ObsidianQuickStart.tsx), puis les descriptions secondaires. Ce point affecte la cohérence, sans bloquer une action.

### 10 — Densité et compositions de formulaire

Observations visuelles, à distinguer des bugs de comportement :

- **Pomodoro :** le lancement conserve un grand titre, plusieurs blocs d’explication et beaucoup d’espace avant l’action. En fenêtre compacte, le bouton principal se trouve bas dans la page. Réduire l’en-tête et replier « Pourquoi ce choix ? » serait plus utile que rajouter des décorations.
- **Événement culturel :** le formulaire occupe presque toute la hauteur ; les actions nécessitent un scroll interne. L’aperçu d’image facultatif prend beaucoup de place même sans image. Replier l’aperçu et garder les actions dans un pied de fenêtre stable.
- **Champs avec unités :** « Afficher avant/après … jours » juxtapose un champ arrondi et un conteneur arrondi, avec doubles bordures et angles superposés. Utiliser un seul contour et un suffixe intégré.

## Ce qui fonctionne dans les parcours testés

- Aucun débordement horizontal de page sur les 56 états, ni sur les 8 états du timer.
- Les contrôles visibles des pages examinées possèdent un nom et les champs de ces pages ont un label détectable. Le défaut de label de création de sujet concerne une fenêtre ouverte ensuite.
- Relations : création, confirmation et sélection de la personne créée fonctionnent. Les fenêtres Personne et Échange contiennent le focus et le restaurent.
- Historique : Ressources et Modifier l’entrée bouclent au clavier, ferment avec Échap et rétablissent le déclencheur.
- Objectifs : la composition de grille boucle correctement ; le défaut de création concerne la borne de focus avec un bouton désactivé.
- Art : la fenêtre d’ajout testée contient et restaure le focus, y compris dans le Shadow DOM. Les parcours visuels détaillés figurent dans [l’audit Art précédent](art-rework-review.md).
- Sujets : un nom vide produit une erreur ; un nom valide est enregistré et apparaît dans la liste.

## Ordre de travail proposé

1. Validation de l’intervalle de temps et protection du raccourci Entrée.
2. Contrat commun de focus : visibilité, désactivation, fenêtres imbriquées, démontage et restitution.
3. Contrastes et associations des labels de formulaire.
4. Récupération des archives, libellés compacts et traduction des commandes.
5. Allègement de Pomodoro et des formulaires culturels.

Les corrections 1 à 3 nécessitent des tests de comportement. Le reste se vérifie surtout avec les parcours visuels existants. Cet audit ajoute un rapport et des preuves ; il ne modifie pas le comportement de l’application.

## Preuves et reproduction de l’audit

Le [résumé structuré](ui-journey-audit-2026-10-07.json) conserve les résultats de couverture, les mesures et les tests d’interaction. Les captures et scripts locaux sont dans `.cache/rework-audit/` : `journey-scan`, `journey-interaction` et `journey-validation`. Les lanceurs `.mjs` ouvrent Electron avec le profil de test et une fenêtre cachée. Ils ne doivent pas être dirigés vers le profil personnel.

Captures utiles : `journey-compact-settings.png`, `journey-dialog-culture-create.png`, `journey-dialog-subject-create.png`, `journey-rework-700--plan.png` et les huit captures `journey-session-*`.
