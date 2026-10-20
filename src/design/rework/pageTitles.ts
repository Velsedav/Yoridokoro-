const titles: Record<string, [string, string]> = {
  '/': ['Aujourd’hui', 'Today'],
  '/calendar': ['Historique', 'History'],
  '/study': ['Sujets', 'Subjects'],
  '/plan': ['Pomodoro', 'Pomodoro'],
  '/bingoals': ['Objectifs', 'Goals'],
  '/art': ['Art', 'Art'],
  '/career': ['Recherche d’emploi', 'Job Search'],
  '/relations': ['Relations', 'Relationships'],
  '/learning': ['Apprentissage', 'Learning'],
  '/analytics': ['Analyses', 'Analytics'],
  '/metacognition-logs': ['Journal des réflexions', 'Reflection journal'],
  '/metacognition': ['Réflexion', 'Reflection'],
  '/settings': ['Paramètres', 'Settings'],
}

export function reworkPageTitle(path: string, french = true) {
  return titles[path]?.[french ? 0 : 1]
}
