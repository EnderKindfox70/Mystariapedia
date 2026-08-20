import { HttpErrorResponse } from '@angular/common/http';

/**
 * Traduit une erreur HTTP en message affichable.
 *
 * Le cas particulier du statut 0 vaut le détour : la requête n'a jamais atteint
 * l'API — instance endormie, service arrêté, coupure réseau. Le navigateur
 * rapporte souvent cela comme une erreur CORS, car la page d'erreur de
 * l'hébergeur ne porte aucun en-tête `Access-Control-Allow-Origin`. Sans ce
 * traitement, l'utilisateur ne voit qu'un échec générique et ignore qu'il lui
 * suffirait de réessayer une minute plus tard.
 *
 * Sinon on privilégie le message renvoyé par l'API (`{ error: '…' }`), qui porte
 * la vraie raison métier — e-mail déjà utilisé, mot de passe trop court…
 */
export function apiErrorMessage(err: HttpErrorResponse, fallback: string): string {
  if (err.status === 0) {
    return (
      "Le serveur ne répond pas. L'instance gratuite s'endort après 15 minutes " +
      "et met jusqu'à une minute à redémarrer — réessayez dans un instant."
    );
  }
  return err.error?.error ?? fallback;
}
