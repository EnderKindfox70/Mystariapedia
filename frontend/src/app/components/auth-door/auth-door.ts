import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

// Petite "porte" discrète : flèche vers la porte pour entrer (connexion),
// flèche en sens inverse pour sortir (déconnexion). Se gère elle-même.
@Component({
  selector: 'auth-door',
  imports: [RouterLink],
  templateUrl: './auth-door.html',
  styleUrl: './auth-door.css',
})
export class AuthDoor {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly user = this.auth.user;

  private cachedUrl = '';
  private cachedParams: { returnUrl?: string } = {};

  // On mémorise la page courante pour y revenir après connexion,
  // sauf si on est déjà sur un écran d'authentification.
  get loginQueryParams(): { returnUrl?: string } {
    if (this.router.url !== this.cachedUrl) {
      this.cachedUrl = this.router.url;
      const path = this.router.url.split('?')[0];
      this.cachedParams =
        path === '/login' || path === '/register' ? {} : { returnUrl: this.router.url };
    }
    return this.cachedParams;
  }

  logout(): void {
    this.auth.logout();
    // Wiki : on reste sur la page courante après déconnexion. On ne redirige
    // que si la page consultée nécessite une authentification.
    if (this.router.url.startsWith('/characters')) {
      this.router.navigateByUrl('/');
    }
  }
}
