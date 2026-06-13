import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Navbar } from '../../../components/navbar/navbar';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Navbar],
  templateUrl: './login.html',
  styleUrl: '../auth.css',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  submit(): void {
    if (this.submitting()) return;
    this.error.set(null);
    this.submitting.set(true);

    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.error ?? 'Connexion impossible. Réessayez.');
        this.submitting.set(false);
      },
    });
  }
}
