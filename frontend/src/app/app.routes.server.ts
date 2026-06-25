import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Pages de détail pilotées par un résolveur qui charge du JSON via une URL
  // relative : seul le navigateur peut résoudre cette URL de façon fiable, donc
  // rendu côté client. Cela évite aussi d'avoir à fournir `getPrerenderParams`.
  { path: 'magics/:domain', renderMode: RenderMode.Client },
  { path: 'resources/:category/:slug', renderMode: RenderMode.Client },
  { path: 'alchemy/:slug', renderMode: RenderMode.Client },
  { path: 'weapons/:category/:slug', renderMode: RenderMode.Client },

  // Espace personnages : dépend de l'auth et de l'API, rendu côté client.
  { path: 'characters', renderMode: RenderMode.Client },
  { path: 'characters/new', renderMode: RenderMode.Client },
  { path: 'characters/:id', renderMode: RenderMode.Client },

  // Tout le reste est prérendu en HTML statique au build.
  { path: '**', renderMode: RenderMode.Prerender },
];
