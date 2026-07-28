import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

// Point de passage unique des appels API : préfixe les URLs /api par le domaine
// du backend (vide en dev, où proxy.conf.json fait le travail) et ajoute le
// jeton Bearer quand l'utilisateur est connecté.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;
  if (!req.url.startsWith('/api/')) return next(req);

  return next(
    req.clone({
      url: `${environment.apiBaseUrl}${req.url}`,
      ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {}),
    }),
  );
};
