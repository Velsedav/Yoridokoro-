# Reprise d’étude et récupération — 7 octobre 2026

La reprise guidée propose cinq minutes lorsqu’aucune matière active ni aucun chapitre actif n’a été étudié depuis au moins quatorze jours. Une première utilisation sans étude passée ne déclenche pas ce mode. Une matière ancienne ne déclenche pas ce mode si une autre a été étudiée récemment.

Aujourd’hui et Pomodoro affichent « Reprendre 5 minutes ». Le lancement ouvre directement un bloc WORK et conserve le choix existant de continuer ou d’arrêter au terme des cinq minutes. Un chapitre connu propose une question ou un exercice pour repérer ce qui revient ; un nouveau chapitre propose un court passage ou un premier exercice. Le dernier point de reprise reste visible. Les compteurs, évaluations et dates d’étude ne sont pas modifiés par cette proposition. La configuration avancée reste accessible.

Les explications et la technique de la proposition d’Aujourd’hui sont repliées. L’Historique conserve ses entrées et sa présentation actuelle ; seul le texte d’aide « Vous avez marché en jouant ? » et son icône ont été retirés.

## Récupération

Chaque état de séance est écrit dans le stockage local avec une copie de secours et un checkpoint SQLite versionné. Les changements de bloc, pause, étape de fin et fermeture déclenchent une écriture immédiate. Les ticks du timer sont regroupés toutes les cinq secondes ; les écritures SQLite sont ordonnées. La fermeture normale attend le checkpoint de séance et celui des chapitres/évaluations avant les sauvegardes configurées.

Au démarrage, une séance valide est conservée et mise en pause. Si son stockage local est absent ou corrompu, elle est récupérée depuis une copie valide, avec son temps restant, les secondes mesurées par bloc et son étape après séance. Le temps passé hors de l’application n’est pas ajouté au temps étudié. Un checkpoint de fermeture empêche la résurrection d’une séance terminée. Ces checkpoints restent propres au profil et ne sont pas inclus dans les sauvegardes portables.

Si le stockage local entier disparaît lors d’une fermeture brutale, le dernier checkpoint SQLite peut avoir jusqu’à cinq secondes de retard. Cela ne protège pas contre la perte du profil entier ou une corruption du disque : les sauvegardes externes restent nécessaires.

La restauration Art initialise désormais son schéma même si cette section n’a jamais été ouverte. Une restauration Yoridokoro synchronise aussi les chapitres et évaluations restaurés vers leur copie durable.

## Vérifications

- Tests automatisés : intervalle de reprise, absence d’étude antérieure, matière récemment étudiée, consigne de reprise, données de séance invalides, récupération depuis SQLite ou la copie locale, indisponibilité temporaire de SQLite, ordre des écritures, fermeture et perte du stockage local.
- Parcours Electron sur un profil séparé : sauvegarde puis suppression des données de test et restauration, second import sans doublons, comparaison des lignes SQLite et Art avant/après, récupération des chapitres, évaluations et point de reprise ; restauration Art avant sa première ouverture.
- Perte des deux copies locales de la séance suivie d’un redémarrage : récupération des 223 secondes restantes, des 77 secondes déjà mesurées et de l’étape de fin, en pause. Fermeture puis redémarrage : aucune séance ressuscitée.
- Cas de 66 jours sans étude : le bouton Pomodoro ouvre un seul bloc WORK de cinq minutes avec la consigne de reprise.

Le test de sauvegarde couvre les exemples de sujets, séances, preuves de reprise, activité Carrière taguée Sport, relation, objectif, œuvre Art, note, citation et duel. Il ne simule pas une corruption physique des bases, une panne au milieu de chaque étape d’import, ni toutes les anciennes versions de sauvegarde. La restauration entre SQLite, IndexedDB et le stockage local n’est pas une transaction unique.
