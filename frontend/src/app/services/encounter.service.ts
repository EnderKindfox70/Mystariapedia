import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { CombatAction, Encounter, EncounterSummary } from '../combat/combat.types';
import { emptyEncounter, migrateEncounter } from '../combat/encounter';
import { applyAction, currentUnit, isOver, movementBudget } from '../combat/rules';

/** Enveloppe persistée renvoyée par l'API. */
interface StoredEncounter {
  id: string;
  userId: string;
  data: Encounter;
  createdAt: string;
  updatedAt: string;
}

/**
 * État vivant du combat + persistance.
 *
 * Le service détient LA rencontre courante et n'expose qu'une façon de la faire
 * évoluer : `dispatch`. Toute mutation passe donc par le moteur, qui journalise,
 * ce qui interdit à la vue de trafiquer un PV en douce. Le jeton Bearer est
 * ajouté par `authInterceptor` pour les appels /api/.
 */
@Injectable({ providedIn: 'root' })
export class EncounterService {
  private readonly http = inject(HttpClient);

  /** La rencontre en cours d'édition ou de jeu. */
  private readonly state = signal<Encounter>(emptyEncounter());
  readonly encounter = this.state.asReadonly();

  /** Identifiant serveur, `null` tant que rien n'a été sauvegardé. */
  readonly encounterId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Pile des états précédents. Une table se trompe : on doit pouvoir revenir en
   * arrière. On garde l'état AVANT chaque action plutôt que de tenter de jouer
   * l'inverse d'une action — le moteur est déterministe, l'état est petit, et
   * rejouer à l'envers un jet de dés n'a pas de sens.
   */
  private readonly history = signal<Encounter[]>([]);
  readonly canUndo = computed(() => this.history().length > 0);

  /** Le combattant dont c'est le tour. */
  readonly active = computed(() => currentUnit(this.state()));
  /** Mètres de déplacement restants au combattant actif. */
  readonly movementLeft = computed(() => {
    const unit = this.active();
    return unit ? Math.max(0, movementBudget(unit) - unit.moved) : 0;
  });
  readonly finished = computed(() => isOver(this.state()));

  /** Remplace entièrement la rencontre (montage, chargement, import). */
  set(encounter: Encounter): void {
    this.state.set(encounter);
    this.history.set([]);
  }

  /** Modifie la rencontre hors combat (ajout de combattant, terrain, grille). */
  edit(mutate: (draft: Encounter) => void): void {
    const draft = structuredClone(this.state());
    mutate(draft);
    this.history.update((h) => [...h.slice(-49), this.state()]);
    this.state.set(draft);
  }

  /** Joue une action : le moteur en tire le nouvel état et la ligne de journal. */
  dispatch(action: CombatAction): void {
    const before = this.state();
    this.history.update((h) => [...h.slice(-49), before]);
    this.state.set(applyAction(before, action));
  }

  /** Annule la dernière action (état précédent, journal compris). */
  undo(): void {
    const stack = this.history();
    if (!stack.length) return;
    this.state.set(stack[stack.length - 1]);
    this.history.set(stack.slice(0, -1));
  }

  /* ── Persistance ────────────────────────────────────────────────────────── */

  list(): Observable<EncounterSummary[]> {
    return this.http
      .get<{ encounters: EncounterSummary[] }>('/api/encounters')
      .pipe(map((r) => r.encounters));
  }

  /** Charge une rencontre sauvegardée et en fait la rencontre courante. */
  load(id: string): Observable<Encounter> {
    return this.http.get<{ encounter: StoredEncounter }>(`/api/encounters/${id}`).pipe(
      map((r) => r.encounter),
      tap((stored) => {
        // Une rencontre plus ancienne que les types de terrain reste jouable.
        this.set(migrateEncounter(stored.data));
        this.encounterId.set(stored.id);
      }),
      map((stored) => stored.data),
    );
  }

  /**
   * Sauvegarde la rencontre courante : création au premier appel, mise à jour
   * ensuite. L'état complet part au serveur, journal et graine compris — c'est
   * ce qui permet de reprendre le combat exactement où il en était.
   */
  save(): Observable<Encounter> {
    const data = this.state();
    const id = this.encounterId();
    this.saving.set(true);
    this.error.set(null);

    const request$ = id
      ? this.http.put<{ encounter: StoredEncounter }>(`/api/encounters/${id}`, { data })
      : this.http.post<{ encounter: StoredEncounter }>('/api/encounters', { data });

    return request$.pipe(
      map((r) => r.encounter),
      tap({
        next: (stored) => {
          this.encounterId.set(stored.id);
          this.saving.set(false);
        },
        error: (err: { error?: { error?: string } }) => {
          this.error.set(err.error?.error ?? 'Sauvegarde impossible.');
          this.saving.set(false);
        },
      }),
      map((stored) => stored.data),
    );
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/encounters/${id}`);
  }

  /** Repart d'une rencontre vierge (nouvelle graine, plus d'id serveur). */
  reset(name?: string): void {
    this.set(emptyEncounter(name));
    this.encounterId.set(null);
  }
}
