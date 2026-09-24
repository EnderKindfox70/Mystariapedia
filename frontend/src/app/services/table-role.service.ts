import { computed, inject, Injectable } from '@angular/core';
import { Combatant } from '../combat/combat.types';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

/**
 * Qui tient l'écran : le MJ, ou un joueur.
 *
 * Hors d'une table partagée, on est MJ de sa propre partie : tout est permis.
 * Assis à la table d'un autre, on est joueur, et l'on ne joue que son pion.
 *
 * Les vues ne tranchent jamais elles-mêmes : elles posent la question ici.
 * L'écran d'un joueur n'est pas pour autant la garantie — c'est le MJ qui
 * vérifie les actions qu'il reçoit (cf. `combat/permissions.ts`).
 */
export type TableRole = 'mj' | 'joueur';

/**
 * Les gestes qui réclament une permission. Une clé par INTENTION, pas par
 * bouton : deux boutons qui font la même chose partagent la même clé.
 */
export type TableAction =
  /** Jouer un pion : le déplacer, agir, manger, chasser pour lui. */
  | 'unit.play'
  /** Corriger les jauges de survie à la main. */
  | 'survival.adjust'
  /** Faire apparaître des vivres (achat, don) sans jet ni butin. */
  | 'supplies.grant'
  /** Décréter une ressource sur place (une source, un intrus). */
  | 'scene.decree'
  /** Faire passer le temps pour tout le groupe. */
  | 'time.pass'
  /** Monter la rencontre : pions, décor, grille, phase. */
  | 'table.run';

/** Ce qu'un joueur n'a jamais le droit de faire : c'est la main du MJ. */
const GM_ONLY: ReadonlySet<TableAction> = new Set<TableAction>([
  'survival.adjust',
  'supplies.grant',
  'scene.decree',
  'time.pass',
  'table.run',
]);

@Injectable({ providedIn: 'root' })
export class TableRoleService {
  private readonly session = inject(SessionService);
  private readonly auth = inject(AuthService);

  readonly role = computed<TableRole>(() => (this.session.isPlayer() ? 'joueur' : 'mj'));
  readonly isGm = computed(() => this.role() === 'mj');

  /** Le pion est-il celui du joueur connecté ? */
  owns(unit: Combatant | undefined): boolean {
    return !!unit && !!unit.owner && unit.owner.userId === this.auth.user()?.id;
  }

  /**
   * Le geste est-il permis ? Pour un joueur, un geste sur un pion exige en
   * plus que ce pion soit le sien.
   */
  can(action: TableAction, unit?: Combatant): boolean {
    if (this.isGm()) return true;
    if (GM_ONLY.has(action)) return false;
    return action === 'unit.play' ? this.owns(unit) : true;
  }
}
