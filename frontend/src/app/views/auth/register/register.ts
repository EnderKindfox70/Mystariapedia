import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Navbar } from '../../../components/navbar/navbar';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, Navbar],
  templateUrl: './register.html',
  styleUrl: '../auth.css',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  username = '';
  email = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  submit(): void {
    if (this.submitting()) return;
    this.error.set(null);
    this.submitting.set(true);

    this.auth.register(this.username, this.email, this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl ?? '/');
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.error ?? 'Inscription impossible. Réessayez.');
        this.submitting.set(false);
      },
    });
  }
}
