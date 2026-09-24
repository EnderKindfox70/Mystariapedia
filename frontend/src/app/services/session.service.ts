import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, NgZone, PLATFORM_ID, signal, untracked } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CombatAction, Encounter } from '../combat/combat.types';
import { playerRefusal } from '../combat/permissions';
import { AuthService } from './auth.service';
import { EncounterService } from './encounter.service';

/* ──────────────────────────────────────────────────────────────────────────
   LA TABLE PARTAGÉE, CÔTÉ NAVIGATEUR

   Une « table » (session côté serveur) réunit un MJ et ses joueurs. Ce service
   tient la connexion en direct et répartit les rôles :

   - chez le MJ, le moteur tourne comme d'habitude ; chaque nouvel état est
     PUBLIÉ (après un court délai, pour ne pas envoyer chaque pas d'animation),
     et les actions des joueurs arrivent ici pour être vérifiées puis jouées ;
   - chez un joueur, rien ne se joue en local : ses actions partent au MJ par
     le relais, et il REÇOIT l'état que le MJ publie.
─────────────────────────────────────────────────────────────────────────── */

export type TableRoleKind = 'mj' | 'joueur';

export interface TableMember {
  userId: string;
  username: string;
  sheetId: string;
}

export interface TableSummary {
  id: string;
  name: string;
  gmName: string;
  role: TableRoleKind;
  /** Le code d'entrée : montré au MJ seulement. */
  code?: string;
  players: TableMember[];
  invites: { userId: string; username: string }[];
  updatedAt: string;
}

export interface TableDetail extends TableSummary {
  gmId: string;
  state?: Encounter;
  version: number;
  online?: string[];
}

export interface TableInvitation {
  id: string;
  name: string;
  gmName: string;
}

/** Délai avant de publier : un tour de moteur fait souvent plusieurs états d'affilée. */
const PUBLISH_DELAY_MS = 350;

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly encounters = inject(EncounterService);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** La table où l'on est assis, ou `null`. */
  readonly table = signal<TableDetail | null>(null);
  readonly role = computed<TableRoleKind | null>(() => this.table()?.role ?? null);
  readonly isPlayer = computed(() => this.role() === 'joueur');
  /** Les membres dont une connexion est ouverte. */
  readonly online = signal<string[]>([]);
  readonly connected = signal(false);
  /** Le dernier mot du serveur ou du MJ (action refusée, table fermée). */
  readonly notice = signal<string | null>(null);

  private source: EventSource | null = null;
  private version = 0;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  /** Le dernier état reçu ou publié : on ne republie pas ce qu'on vient de recevoir. */
  private lastSynced: Encounter | null = null;

  constructor() {
    // Le MJ publie chaque nouvel état de la partie. `untracked` : seule la
    // rencontre doit relancer l'effet, pas les signaux lus en chemin.
    effect(() => {
      const enc = this.encounters.encounter();
      untracked(() => {
        if (this.role() !== 'mj' || !this.connected() || enc === this.lastSynced) return;
        this.schedulePublish();
      });
    });
  }

  /* ── REST ───────────────────────────────────────────────────────────────── */

  list(): Observable<{ sessions: TableSummary[]; invitations: TableInvitation[] }> {
    return this.http.get<{ sessions: TableSummary[]; invitations: TableInvitation[] }>('/api/sessions');
  }

  create(name: string): Observable<TableSummary> {
    return this.http.post<{ session: TableSummary }>('/api/sessions', { name }).pipe(map((r) => r.session));
  }

  join(code: string, sheetId: string): Observable<TableSummary> {
    return this.http.post<{ session: TableSummary }>('/api/sessions/join', { code, sheetId }).pipe(map((r) => r.session));
  }

  invite(id: string, username: string): Observable<TableSummary> {
    return this.http
      .post<{ session: TableSummary }>(`/api/sessions/${id}/invite`, { username })
      .pipe(map((r) => r.session));
  }

  accept(id: string, sheetId: string): Observable<TableSummary> {
    return this.http
      .post<{ session: TableSummary }>(`/api/sessions/${id}/accept`, { sheetId })
      .pipe(map((r) => r.session));
  }

  /** Changer de personnage à une table où l'on est déjà assis. */
  changeSheet(id: string, sheetId: string): Observable<TableSummary> {
    return this.http
      .put<{ session: TableSummary }>(`/api/sessions/${id}/sheet`, { sheetId })
      .pipe(map((r) => r.session));
  }

  dropInvite(id: string, userId: string): Observable<TableSummary> {
    return this.http
      .delete<{ session: TableSummary }>(`/api/sessions/${id}/invites/${userId}`)
      .pipe(map((r) => r.session));
  }

  removePlayer(id: string, userId: string): Observable<TableSummary> {
    return this.http
      .delete<{ session: TableSummary }>(`/api/sessions/${id}/players/${userId}`)
      .pipe(map((r) => r.session));
  }

  close(id: string): Observable<void> {
    return this.http.delete<void>(`/api/sessions/${id}`);
  }

  /* ── S'asseoir à une table ──────────────────────────────────────────────── */

  /** Ouvre la connexion en direct à une table (sans effet si l'on y est déjà). */
  enter(id: string): void {
    if (!this.isBrowser) return;
    if (this.table()?.id === id && this.source) return;
    this.leave();

    const token = this.auth.token ?? '';
    const url = `${environment.apiBaseUrl}/api/sessions/${id}/events?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);
    this.source = source;

    // Les évènements arrivent hors d'Angular : on y rentre pour que les vues
    // se mettent à jour.
    const on = <T>(event: string, handle: (data: T) => void) =>
      source.addEventListener(event, (e) =>
        this.zone.run(() => handle(JSON.parse((e as MessageEvent).data) as T)),
      );

    on<TableDetail>('hello', (detail) => this.welcome(detail));
    on<{ version: number; state: Encounter }>('state', ({ version, state }) => {
      if (version <= this.version) return;
      this.version = version;
      this.lastSynced = state;
      this.encounters.receive(state);
      this.lastSynced = this.encounters.encounter();
    });
    on<Pick<TableSummary, 'players' | 'invites'>>('members', (members) =>
      this.table.update((t) => (t ? { ...t, ...members } : t)),
    );
    on<{ online: string[] }>('presence', ({ online }) => this.online.set(online));
    on<{ id: string; from: { userId: string; username: string }; action: CombatAction }>('action', (msg) =>
      this.handlePlayerAction(msg.from, msg.action),
    );
    on<{ text: string }>('notice', ({ text }) => this.notice.set(text));
    on<object>('closed', () => {
      this.leave();
      this.notice.set('Le MJ a fermé cette table.');
    });

    source.onopen = () => this.zone.run(() => this.connected.set(true));
    // L'EventSource se reconnecte de lui-même : on se contente de le dire.
    source.onerror = () => this.zone.run(() => this.connected.set(false));
  }

  /** Quitte la table : la connexion se ferme, le moteur redevient local. */
  leave(): void {
    this.source?.close();
    this.source = null;
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.publishTimer = null;
    this.table.set(null);
    this.online.set([]);
    this.connected.set(false);
    this.version = 0;
    this.lastSynced = null;
    this.encounters.setRelay(null);
  }

  /** Le premier message de la table : qui l'on est, et où en est la partie. */
  private welcome(detail: TableDetail): void {
    this.table.set(detail);
    this.online.set(detail.online ?? []);
    this.connected.set(true);
    this.version = detail.version;

    if (detail.role === 'joueur') {
      this.encounters.setRelay((action) => this.sendAction(action));
      if (detail.state) {
        this.encounters.receive(detail.state);
        this.lastSynced = this.encounters.encounter();
      }
      return;
    }

    // Le MJ : il reprend la partie publiée si sa table locale est vide (un
    // rechargement de page), sinon c'est SA partie en cours qui fait foi.
    this.encounters.setRelay(null);
    if (detail.state && !this.encounters.encounter().combatants.length) {
      this.encounters.set(detail.state);
      this.lastSynced = this.encounters.encounter();
    } else {
      this.schedulePublish();
    }
  }

  /* ── Chez le MJ ─────────────────────────────────────────────────────────── */

  private schedulePublish(): void {
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.publishTimer = setTimeout(() => this.publish(), PUBLISH_DELAY_MS);
  }

  private publish(): void {
    this.publishTimer = null;
    const table = this.table();
    if (!table || table.role !== 'mj') return;
    const state = this.encounters.encounter();
    this.lastSynced = state;
    this.http.put<{ version: number }>(`/api/sessions/${table.id}/state`, { state }).subscribe({
      next: ({ version }) => (this.version = version),
      error: () => this.notice.set('La partie n’a pas pu être envoyée aux joueurs.'),
    });
  }

  /** Une action arrive d'un joueur : on la vérifie, puis on la joue ou on la renvoie. */
  private handlePlayerAction(from: { userId: string; username: string }, action: CombatAction): void {
    const table = this.table();
    if (!table || table.role !== 'mj') return;
    const refus = playerRefusal(this.encounters.encounter(), action, from.userId);
    if (refus) {
      this.http.post(`/api/sessions/${table.id}/notice`, { userId: from.userId, text: refus }).subscribe();
      return;
    }
    this.encounters.dispatch(action);
  }

  /* ── Chez un joueur ─────────────────────────────────────────────────────── */

  private sendAction(action: CombatAction): void {
    const table = this.table();
    if (!table) return;
    this.http.post(`/api/sessions/${table.id}/actions`, { action }).subscribe({
      error: (err: { error?: { error?: string } }) =>
        this.notice.set(err.error?.error ?? 'Ton action n’a pas pu partir.'),
    });
  }
}
