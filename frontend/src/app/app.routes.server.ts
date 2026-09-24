import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Pages de détail pilotées par un résolveur qui charge du JSON via une URL
  // relative : seul le navigateur peut résoudre cette URL de façon fiable, donc
  // rendu côté client. Cela évite aussi d'avoir à fournir `getPrerenderParams`.
  { path: 'magics/constellation', renderMode: RenderMode.Client },
  { path: 'magics/spell/:spell', renderMode: RenderMode.Client },
  { path: 'magics/:domain', renderMode: RenderMode.Client },
  { path: 'resources/:category/:slug', renderMode: RenderMode.Client },
  { path: 'alchemy/:slug', renderMode: RenderMode.Client },
  { path: 'equipment/:slug', renderMode: RenderMode.Client },
  { path: 'weapons/:category/:slug', renderMode: RenderMode.Client },
  { path: 'artifacts/:category/:slug', renderMode: RenderMode.Client },
  { path: 'lore/peuples/:slug', renderMode: RenderMode.Client },
  { path: 'bestiary/:chapter', renderMode: RenderMode.Client },
  { path: 'bestiary/:chapter/:slug', renderMode: RenderMode.Client },

  // Espace personnages : dépend de l'auth et de l'API, rendu côté client.
  { path: 'characters', renderMode: RenderMode.Client },
  { path: 'characters/new', renderMode: RenderMode.Client },
  { path: 'characters/:id', renderMode: RenderMode.Client },

  // Tables de jeu : dépendent du compte et d'une connexion en direct.
  { path: 'tables', renderMode: RenderMode.Client },
  { path: 'tables/join/:code', renderMode: RenderMode.Client },

  // Bancs d'essai : le spell builder garde son joueur type dans le stockage
  // local du navigateur, qu'un prérendu ne peut pas connaître.
  { path: 'tests', renderMode: RenderMode.Client },

  // Tout le reste est prérendu en HTML statique au build.
  { path: '**', renderMode: RenderMode.Prerender },
];
