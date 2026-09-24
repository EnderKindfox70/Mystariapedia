import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, Observable, of } from 'rxjs';
import { CharacterSheetSummary } from '../../character/character.types';
import { Navbar } from '../../components/navbar/navbar';
import { AuthService } from '../../services/auth.service';
import { CharacterSheetService } from '../../services/character-sheet.service';
import { SessionService, TableInvitation, TableSummary } from '../../services/session.service';

/**
 * Les tables de jeu : celles qu'on mène, celles où l'on joue, et les
 * invitations qui attendent. On y ouvre une table, on la rejoint par un code
 * (ou le lien qui le porte), on invite un joueur par son nom.
 */
@Component({
  selector: 'app-tables',
  imports: [Navbar, RouterLink],
  templateUrl: './tables.html',
  styleUrl: './tables.css',
})
export class TablesView {
  private readonly sessions = inject(SessionService);
  private readonly sheetsApi = inject(CharacterSheetService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tables = signal<TableSummary[]>([]);
  readonly invitations = signal<TableInvitation[]>([]);
  readonly sheets = signal<CharacterSheetSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly flash = signal<string | null>(null);

  /** Code saisi pour rejoindre ; prérempli par un lien d'invitation. */
  readonly joinCode = signal('');
  /** Personnage choisi, par table (ou `join` pour la saisie par code). */
  readonly chosenSheet = signal<Record<string, string>>({});
  readonly newTableName = signal('');
  /** Pseudo saisi pour inviter, par table. */
  readonly inviteName = signal<Record<string, string>>({});

  readonly me = computed(() => this.auth.user()?.id);
  readonly led = computed(() => this.tables().filter((t) => t.role === 'mj'));
  readonly played = computed(() => this.tables().filter((t) => t.role === 'joueur'));

  constructor() {
    const code = inject(ActivatedRoute).snapshot.paramMap.get('code');
    if (code) this.joinCode.set(code);
    this.sheetsApi
      .list()
      .pipe(catchError(() => of([] as CharacterSheetSummary[])))
      .subscribe((list) => this.sheets.set(list));
    this.reload();
  }

  reload(): void {
    this.sessions.list().subscribe({
      next: ({ sessions, invitations }) => {
        this.tables.set(sessions);
        this.invitations.set(invitations);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Les tables n’ont pas pu être chargées.');
      },
    });
  }

  /* ── Choix du personnage ──────────────────────────────────────────────── */

  sheetFor(key: string): string {
    return this.chosenSheet()[key] ?? this.sheets()[0]?.id ?? '';
  }

  pickSheet(key: string, sheetId: string): void {
    this.chosenSheet.update((m) => ({ ...m, [key]: sheetId }));
  }

  sheetName(sheetId: string): string {
    return this.sheets().find((s) => s.id === sheetId)?.name ?? 'personnage';
  }

  /** Le personnage que j'ai amené à cette table. */
  mySheet(table: TableSummary): string | undefined {
    return table.players.find((p) => p.userId === this.me())?.sheetId;
  }

  /* ── Gestes ───────────────────────────────────────────────────────────── */

  /** Enveloppe commune : message d'erreur du serveur, puis rechargement. */
  private run<T>(request: Observable<T>, success?: string): void {
    this.error.set(null);
    request.subscribe({
      next: () => {
        if (success) this.flash.set(success);
        this.reload();
      },
      error: (err: { error?: { error?: string } }) => this.error.set(err.error?.error ?? 'L’opération a échoué.'),
    });
  }

  create(): void {
    const name = this.newTableName().trim();
    if (!name) return;
    this.newTableName.set('');
    this.run(this.sessions.create(name), `Table « ${name} » ouverte. Partage son code à tes joueurs.`);
  }

  join(): void {
    const sheetId = this.sheetFor('join');
    if (!this.joinCode().trim() || !sheetId) return;
    this.run(this.sessions.join(this.joinCode(), sheetId), `Tu as rejoint la table avec ${this.sheetName(sheetId)}.`);
    this.joinCode.set('');
  }

  accept(invitation: TableInvitation): void {
    const sheetId = this.sheetFor(invitation.id);
    if (sheetId) this.run(this.sessions.accept(invitation.id, sheetId), `Bienvenue à « ${invitation.name} ».`);
  }

  decline(invitation: TableInvitation): void {
    const me = this.me();
    if (me) this.run(this.sessions.dropInvite(invitation.id, me));
  }

  invite(table: TableSummary): void {
    const name = (this.inviteName()[table.id] ?? '').trim();
    if (!name) return;
    this.inviteName.update((m) => ({ ...m, [table.id]: '' }));
    this.run(this.sessions.invite(table.id, name), `Invitation envoyée à ${name}.`);
  }

  setInviteName(tableId: string, value: string): void {
    this.inviteName.update((m) => ({ ...m, [tableId]: value }));
  }

  cancelInvite(table: TableSummary, userId: string): void {
    this.run(this.sessions.dropInvite(table.id, userId));
  }

  removePlayer(table: TableSummary, userId: string): void {
    this.run(this.sessions.removePlayer(table.id, userId));
  }

  /** Changer de personnage à une table où l'on est déjà assis. */
  switchSheet(table: TableSummary, sheetId: string): void {
    this.run(this.sessions.changeSheet(table.id, sheetId), `Tu joues désormais ${this.sheetName(sheetId)}.`);
  }

  leaveTable(table: TableSummary): void {
    const me = this.me();
    if (me && confirm(`Quitter la table « ${table.name} » ?`)) this.run(this.sessions.removePlayer(table.id, me));
  }

  closeTable(table: TableSummary): void {
    if (confirm(`Fermer la table « ${table.name} » ? Les joueurs en seront sortis.`)) {
      this.run(this.sessions.close(table.id), 'Table fermée.');
    }
  }

  /** S'asseoir à la table : la connexion s'ouvre, et l'on arrive sur le plateau. */
  play(table: TableSummary): void {
    this.sessions.enter(table.id);
    this.router.navigate(['/combat'], { queryParams: { table: table.id } });
  }

  /** Le lien à partager : il ouvre cette page, code prérempli. */
  inviteLink(table: TableSummary): string {
    const origin = this.isBrowser ? location.origin : '';
    return `${origin}/tables/join/${table.code}`;
  }

  copy(text: string): void {
    if (!this.isBrowser) return;
    navigator.clipboard?.writeText(text).then(
      () => this.flash.set('Copié.'),
      () => this.flash.set(text),
    );
  }
}
