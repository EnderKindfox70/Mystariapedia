import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Garde pragmatique : on laisse passer dès qu'un jeton est présent. Un jeton
// invalide/expiré sera de toute façon rejeté par le backend (401). En l'absence
// de jeton, on redirige vers la connexion.
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.token) return true;
  // On mémorise l'URL demandée pour y revenir après connexion.
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
