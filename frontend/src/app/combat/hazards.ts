import { Combatant, Encounter, GridPos, Hazard, HazardSpec, Team } from './combat.types';
import { cellKey, cellsInShape, occupiedCells, samePos } from './grid';

/* ──────────────────────────────────────────────────────────────────────────
   LES PIÈGES POSÉS AU SOL

   Des chausse-trappes répandues, un piège à mâchoires armé : un objet qui ne
   vise personne au moment où on l'utilise, mais qui agit plus tard, sur qui
   met le pied dessus. C'est une capacité DIFFÉRÉE — mêmes dégâts, mêmes
   statuts —, dont la case remplace la cible.

   Ce module ne tient que la géométrie et le registre : poser, trouver, retirer.
   Ce que le piège FAIT (dégâts, statuts) passe par le moteur, qui seul sait
   blesser (cf. `springHazards` dans `rules.ts`).

   Le camp de qui a posé compte : ses alliés savent où sont les pointes et
   avancent prudemment — la fiche l'écrit, « une créature qui avance
   prudemment traverse sans dommage ». Un piège ne prend donc que les autres.
─────────────────────────────────────────────────────────────────────────── */

let counter = 0;
const nextHazardId = (): string => `hazard-${Date.now().toString(36)}-${counter++}`;

/** Les cases couvertes par un piège posé en `at`, rayon compris. */
export function hazardCells(
  enc: Pick<Encounter, 'grid'>,
  at: GridPos,
  radiusMeters: number,
): GridPos[] {
  return radiusMeters > 0
    ? cellsInShape({ kind: 'radius', meters: radiusMeters }, at, at, enc.grid)
    : [{ ...at }];
}

/** Pose un piège sur le plateau et le rend. */
export function placeHazard(
  enc: Encounter,
  name: string,
  at: GridPos,
  radiusMeters: number,
  spec: HazardSpec,
  team: Team,
  ownerId?: string,
): Hazard {
  const hazard: Hazard = {
    id: nextHazardId(),
    name,
    cells: hazardCells(enc, at, radiusMeters),
    team,
    ownerId,
    spec,
  };
  (enc.hazards ??= []).push(hazard);
  return hazard;
}

/** Retire un piège du plateau (refermé, ou relevé). */
export function removeHazard(enc: Encounter, id: string): void {
  enc.hazards = (enc.hazards ?? []).filter((h) => h.id !== id);
  if (!enc.hazards.length) delete enc.hazards;
}

/** Les pièges qui couvrent une case. */
export function hazardsAt(enc: Encounter, pos: GridPos): Hazard[] {
  return (enc.hazards ?? []).filter((h) => h.cells.some((c) => samePos(c, pos)));
}

/** Clés des cases piégées, pour l'affichage du plateau. */
export function hazardCellKeys(enc: Encounter): Map<string, Hazard[]> {
  const out = new Map<string, Hazard[]>();
  for (const hazard of enc.hazards ?? []) {
    for (const cell of hazard.cells) {
      const key = cellKey(cell);
      out.set(key, [...(out.get(key) ?? []), hazard]);
    }
  }
  return out;
}

/**
 * Le piège a-t-il prise sur ce corps ? Pas sur les alliés de qui l'a posé, pas
 * au-delà de sa taille (une bête TG arrache les mâchoires, marche sur les
 * pointes sans les sentir).
 */
export function hazardBites(hazard: Hazard, unit: Combatant, team: Team): boolean {
  if (team === hazard.team) return false;
  if (hazard.spec.maxFootprint && unit.footprint > hazard.spec.maxFootprint) return false;
  return true;
}

/**
 * Les pièges que rencontre un corps en suivant `path`, dans l'ordre du trajet,
 * chacun une seule fois, avec l'étape où il le rencontre. La case de départ
 * n'en fait pas partie : on ne se prend pas au piège sur lequel on se tient.
 */
export function hazardsOnPath(
  enc: Encounter,
  unit: Combatant,
  team: Team,
  path: GridPos[],
): { hazard: Hazard; step: number }[] {
  const seen = new Set<string>();
  const out: { hazard: Hazard; step: number }[] = [];
  path.forEach((pos, step) => {
    if (step === 0) return;
    const cells = occupiedCells({ pos, footprint: unit.footprint });
    for (const hazard of enc.hazards ?? []) {
      if (seen.has(hazard.id)) continue;
      if (!hazard.cells.some((c) => cells.some((o) => samePos(o, c)))) continue;
      if (!hazardBites(hazard, unit, team)) continue;
      seen.add(hazard.id);
      out.push({ hazard, step });
    }
  });
  return out;
}
