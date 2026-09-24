import { CombatAction, Combatant, Encounter } from './combat.types';
import { findUnit, currentUnit } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   CE QU'UN JOUEUR A LE DROIT DE JOUER

   À une table partagée, le moteur tourne chez le MJ. Les actions d'un joueur
   lui arrivent par le relais, et c'est ICI qu'il décide de les jouer ou non —
   pas sur l'écran du joueur, qu'on ne peut pas croire sur parole.

   La règle tient en une phrase : un joueur joue SON pion, et rien d'autre.
   Tout ce qui touche au monde (le temps du groupe, la météo, les corrections,
   les pions des autres) reste la main du MJ.
─────────────────────────────────────────────────────────────────────────── */

/** Ce pion appartient-il à ce joueur ? */
export const ownedBy = (unit: Combatant | undefined, userId: string): boolean =>
  !!unit && unit.owner?.userId === userId;

/**
 * Pourquoi le MJ refuse cette action venue d'un joueur, ou `null` s'il peut la
 * jouer. Le motif est renvoyé au joueur tel quel.
 */
export function playerRefusal(enc: Encounter, action: CombatAction, userId: string): string | null {
  const mine = (id: string | undefined) => (id && ownedBy(findUnit(enc, id), userId) ? null : 'Ce n’est pas ton personnage.');

  switch (action.type) {
    // Les gestes d'un pion : ils portent l'id de qui agit.
    case 'move':
    case 'walk':
    case 'use':
    case 'pickUp':
    case 'equip':
    case 'unequip':
    case 'eat':
    case 'hunt':
    case 'forage':
    case 'trainSpell':
    case 'campUse':
    case 'snare':
    case 'setHazard':
    case 'recoverHazards':
    case 'takeLoot':
      return mine(action.actorId);

    case 'search':
      return mine(action.actorId);

    // Une porte : l'ouvrir, la crocheter ou l'enfoncer, oui ; la verrouiller
    // sans jet, c'est la main du MJ.
    case 'door':
      if (action.act === 'lock' || action.act === 'unlock') return 'Seul le MJ verrouille une porte sans jet.';
      return mine(action.actorId);

    // Manger à sa faim, pas au nom du groupe.
    case 'meal':
      return action.actorId ? mine(action.actorId) : 'Un repas pour tout le groupe se décide avec le MJ.';

    // Finir SON tour, pas celui d'un autre.
    case 'endTurn':
      return ownedBy(currentUnit(enc), userId) ? null : 'Ce n’est pas ton tour.';

    // Une frappe gratuite ou une réaction offerte à son pion.
    case 'freeStrike':
    case 'skipStrike':
      return mine(enc.pendingStrike?.actorId);
    case 'react':
    case 'skipReaction':
      return mine(enc.pendingReaction?.actorId);

    // Les pièges du camp : poser les siens, relever ou réarmer ceux qu'on a
    // posés. Décider qu'un intrus les déclenche revient au MJ.
    case 'campTrap': {
      if (action.act === 'set') return mine(action.actorId);
      if (action.act === 'lift' || action.act === 'rearm') {
        const piege = enc.campTraps?.find((t) => t.id === action.trapId);
        return piege?.ownerId && ownedBy(findUnit(enc, piege.ownerId), userId) ? null : 'Ce piège n’est pas le tien.';
      }
      return 'Seul le MJ en décide.';
    }

    default:
      return 'Seul le MJ peut faire cela.';
  }
}
