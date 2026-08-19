import { daytimeAt, startingClock } from './clock';
import { Encounter, EncounterPhase, GridPos, Team } from './combat.types';
import { normalizeTerrain } from './terrain';
import { newSeed } from './dice';

/** Dimensions par défaut d'un champ de bataille (20 × 15 cases ≈ 30 × 22 m). */
export const DEFAULT_GRID = { width: 20, height: 15 };

/** Une rencontre vierge, prête à recevoir des combattants. */
export function emptyEncounter(name = 'Nouvelle rencontre'): Encounter {
  const clock = startingClock();
  return {
    name,
    grid: { ...DEFAULT_GRID },
    terrain: {},
    combatants: [],
    started: false,
    round: 0,
    order: [],
    turnIndex: 0,
    phase: 'setup',
    clock,
    daytime: daytimeAt(clock),
    seed: newSeed(),
    rollCount: 0,
    log: [],
    nextLogId: 1,
  };
}

/**
 * Remet une rencontre venue du serveur dans sa forme courante.
 *
 * Une partie sauvegardée avant l'arrivée des types de terrain porte encore deux
 * listes de cases ; elle doit rester jouable. De même, une partie antérieure
 * aux phases et à l'horloge n'en a pas : on les lui déduit plutôt que de la
 * refuser.
 */
export function migrateEncounter(encounter: Encounter): Encounter {
  const clock = encounter.clock ?? startingClock();
  return {
    ...encounter,
    terrain: normalizeTerrain(encounter.terrain),
    clock,
    phase: encounter.phase ?? phaseFor(encounter),
    // Une rencontre d'avant l'horloge portait un moment de la journée choisi à
    // la main : le respecter, et le considérer comme figé. Sans ce verrou, la
    // première avance de temps effacerait le réglage du MJ.
    daytime: encounter.daytime ?? daytimeAt(clock),
    daytimeLocked: encounter.daytimeLocked ?? (!encounter.clock && !!encounter.daytime),
  };
}

/** Phase déduite d'une rencontre qui n'en portait pas encore. */
function phaseFor(encounter: Encounter): EncounterPhase {
  if (!encounter.started) return 'setup';
  // Un combat fini est un combat dont on sort : la table en est déjà au butin.
  const standing = new Set(encounter.combatants.filter((c) => !c.down).map((c) => c.team));
  return standing.size <= 1 ? 'exploration' : 'combat';
}

export const TEAM_LABELS: Record<Team, string> = {
  allies: 'Groupe',
  ennemis: 'Adversaires',
  neutres: 'Neutres',
};

/**
 * Première case libre pour déposer un nouveau combattant. Le groupe se range à
 * gauche, les adversaires à droite : personne n'apparaît au corps à corps sans
 * l'avoir décidé.
 */
export function freeSpot(encounter: Encounter, team: Team): GridPos {
  const taken = new Set(encounter.combatants.map((c) => `${c.pos.x},${c.pos.y}`));
  const columns =
    team === 'allies'
      ? [0, 1, 2]
      : team === 'ennemis'
        ? [encounter.grid.width - 1, encounter.grid.width - 2, encounter.grid.width - 3]
        : [Math.floor(encounter.grid.width / 2)];

  for (const x of columns) {
    for (let y = 0; y < encounter.grid.height; y++) {
      if (!taken.has(`${x},${y}`)) return { x, y };
    }
  }
  // Grille saturée sur les colonnes de départ : on prend la première case libre.
  for (let y = 0; y < encounter.grid.height; y++) {
    for (let x = 0; x < encounter.grid.width; x++) {
      if (!taken.has(`${x},${y}`)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
