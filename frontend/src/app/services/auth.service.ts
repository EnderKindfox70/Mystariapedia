import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, tap } from 'rxjs';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'mystaria.auth.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly currentUser = signal<AuthUser | null>(null);

  /** Utilisateur connecté (ou null), exposé en lecture seule. */
  readonly user = this.currentUser.asReadonly();
  /** Vrai dès qu'un utilisateur est authentifié. */
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  constructor() {
    // Au démarrage côté navigateur : si un jeton existe, on récupère le profil.
    if (this.isBrowser && this.token) {
      this.refreshProfile();
    }
  }

  get token(): string | null {
    return this.isBrowser ? localStorage.getItem(TOKEN_KEY) : null;
  }

  register(username: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/register', { username, email, password })
      .pipe(tap((res) => this.persistSession(res)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(tap((res) => this.persistSession(res)));
  }

  logout(): void {
    if (this.isBrowser) localStorage.removeItem(TOKEN_KEY);
    this.currentUser.set(null);
  }

  private refreshProfile(): void {
    this.http.get<{ user: AuthUser }>('/api/auth/me').subscribe({
      next: (res) => this.currentUser.set(res.user),
      // Jeton invalide / expiré : on nettoie la session silencieusement.
      error: () => this.logout(),
    });
  }

  private persistSession(res: AuthResponse): void {
    if (this.isBrowser) localStorage.setItem(TOKEN_KEY, res.token);
    this.currentUser.set(res.user);
  }
}
