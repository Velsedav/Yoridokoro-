# Yoridokoro — boucle qualité produit 0.2

Ce document transforme les regards clinique, apprentissage, ergothérapie, recherche utilisateur, accessibilité, sécurité, QA, data et content design en décisions vérifiables. Yoridokoro reste un outil d’accompagnement personnel : il ne diagnostique pas et ne mesure pas la valeur, l’intelligence ou la volonté de son utilisateur.

## Principes de décision

1. Une fonction doit rester utilisable un jour de faible énergie exécutive.
2. Une donnée absente signifie « inconnue », jamais « échec ».
3. Une estimation doit être nommée comme telle et ne pas imiter une mesure scientifique.
4. Les valeurs par défaut doivent favoriser le démarrage et la progression, sans supprimer le contrôle.
5. Une session sauvegardée doit survivre à une fermeture ou à une reprise inattendue.
6. « Local et privé » doit être garanti par l’architecture, pas seulement par le texte de l’interface.

## Constats vérifiés

### Apprentissage et ergonomie cognitive

- La recommandation alterne déjà progression et révision, avec au plus une révision critique avant le prochain chapitre. Cela protège contre la boucle perfectionniste.
- La préparation reste facultative et le compte à rebours visible correspond aux préférences déclarées.
- Le pourcentage anciennement nommé « rétention » est une décroissance heuristique. Il est désormais présenté comme une estimation de rappel, jamais comme une mesure de mémoire.
- Les évaluations Oublié / Difficile / Bien / Facile sont utiles comme signal de rappel momentané. Leur valeur devra être validée par leur capacité à prédire une récupération ultérieure, pas par le nombre de clics.

### Accessibilité et interaction

- Les modales principales disposent déjà d’un piège à focus, d’Échap et d’un retour du focus.
- Sujets utilisait des lignes et cellules de tableau transformées en pseudo-boutons. Les contrôles de tri, d’ouverture et de sélection sont désormais des boutons natifs avec état sémantique.
- Les libellés essentiels de Sujets suivent maintenant la langue française de l’application.
- Audit restant : zoom 200–400 %, ordre de focus sur tous les écrans, noms accessibles des icônes, contrastes de chaque thème et parcours sans souris complet.

### Sécurité et confidentialité

- L’isolation de contexte et l’absence de Node dans le renderer étaient déjà activées.
- Le renderer Electron est désormais sandboxé.
- Le processus principal refuse les protocoles externes privilégiés (`file:`, `javascript:`, `data:`, protocoles applicatifs) et n’autorise que HTTP/HTTPS.
- Les nouvelles fenêtres web sont ouvertes par le navigateur du système et jamais intégrées à Yoridokoro.
- Risque restant : les API de fichiers et SQL exposées au renderer sont encore larges. Elles devront évoluer vers des opérations métier et des chemins accordés explicitement par l’utilisateur.

### Fiabilité et architecture des données

- Une session et ses blocs sont écrits dans une transaction SQLite.
- Le temps réel est conservé en secondes et les échecs de sauvegarde sont visibles et réessayables.
- Les données sont toutefois réparties entre SQLite, localStorage et IndexedDB. Les chapitres et évaluations ne partagent pas encore la transaction de la session. C’est le principal chantier d’architecture restant.
- Étape recommandée : versionner un schéma unique, migrer sans perte, vérifier l’intégrité au démarrage, puis proposer sauvegarde et restauration testées.

### Performance

- Sujets récupérait les tags avec une requête supplémentaire par matière. Il utilise maintenant deux lectures groupées, quel que soit le nombre de sujets.
- Les compteurs « aujourd’hui / cette semaine » sont maintenant agrégés par SQLite sans charger tout l’historique dans le renderer.
- Les styles du module Objectifs/Bingo sont chargés uniquement à l’ouverture de ce module. La feuille CSS initiale passe d’environ 259 Ko à 185 Ko dans le build de production.
- Prochains gains mesurables : charger les dictionnaires de langue à la demande, découper les sous-écrans de Session et modulariser la feuille globale historique.

## Protocole utilisateur court

Tester avec une vraie session, puis une seconde fois dans un moment de fatigue ou de faible motivation.

1. Ouvrir Sujets et démarrer la proposition uniquement au clavier.
2. Demander une autre proposition, revenir, puis démarrer sans cliquer dans une zone vide.
3. Parcourir préparation, travail et pause ; vérifier que le focus reste visible et que le son correspond à la phase.
4. Terminer après au moins une minute réelle, enregistrer une évaluation avec les touches 1–4 et fermer la session.
5. Vérifier le temps dans Historique, l’état du chapitre dans Sujets et la présence de l’événement dans l’export d’observation.
6. Refaire le parcours en quittant pendant un bloc, puis vérifier que la reprise ne perd ni le temps ni le contexte.

Noter uniquement les hésitations, erreurs, retours arrière et moments où une décision semble demander trop d’effort. Ne pas évaluer la personne qui teste.

## Ordre des prochains chantiers

1. Source de vérité unique et migrations sûres pour chapitres, évaluations et sessions.
2. Audit clavier/lecteur d’écran/zoom automatisé et manuel sur les parcours critiques.
3. Test longitudinal de la recommandation : délai de démarrage, reprise et progression vers de nouveaux chapitres.
4. Réduction de l’API Electron exposée au renderer et politique de chemins autorisés.
5. Localisation complète des écrans secondaires et validation du vocabulaire par des utilisateurs.
