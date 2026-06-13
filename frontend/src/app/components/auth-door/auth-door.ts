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

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
