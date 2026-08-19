import { Combatant, ConjuredWall, Encounter, GridPos } from './combat.types';
import { cellKey, inBounds, occupiedCells, samePos } from './grid';
import { MATERIAL_BY_KEY } from './materials';
import { TerrainMap } from './terrain';

/* ──────────────────────────────────────────────────────────────────────────
   LES MURS CONJURÉS

   Un mur de sort n'est pas du décor. Le décor était là avant et ne s'abat pas ;
   un mur dressé par quelqu'un s'attaque, s'écroule, et — s'il a été tiré du
   néant plutôt que façonné dans le sol — se décompose de lui-même.

   C'est ce qui rend le sort intéressant à jouer CONTRE : on n'attend pas qu'il
   disparaisse, on le démolit. Et c'est ce qui donne enfin une conséquence
   visible au palier de façonnage — la même incantation laisse une barricade
   permanente aux Dorsales et un rideau de trois tours en pleine mer.
─────────────────────────────────────────────────────────────────────────── */

/** Terrain sous lequel un mur conjuré se comporte : il arrête tout. */
const WALL_TERRAIN = 'mur';

/** Un mur permanent : façonné dans le sol, il n'a aucune raison de s'évaporer. */
export const WALL_PERMANENT = -1;

let counter = 0;
const nextWallId = (): string => `wall-${Date.now().toString(36)}-${counter++}`;

/** Le mur qui occupe cette case, s'il y en a un. */
export function wallAt(enc: Encounter, pos: GridPos): ConjuredWall | undefined {
  return (enc.walls ?? []).find((w) => w.cells.some((c) => samePos(c, pos)));
}

/** Toutes les cases occupées par un mur, prêtes à être injectées au décor. */
export function wallTerrain(enc: Encounter): TerrainMap {
  const out: TerrainMap = {};
  for (const wall of enc.walls ?? []) {
    for (const cell of wall.cells) out[cellKey(cell)] = WALL_TERRAIN;
  }
  return out;
}

/**
 * Les cases qu'un mur occuperait, dressé sur `at` face à son lanceur.
 *
 * Le mur se pose PERPENDICULAIREMENT à la ligne du lanceur : c'est le seul
 * placement qui a un sens — on ne dresse pas une barricade dans l'axe de sa
 * propre visée, on la met en travers. La longueur s'étale de part et d'autre du
 * point visé, ce qui rend le résultat prévisible depuis la grille.
 *
 * Les cases hors plateau ou déjà occupées par quelqu'un sont écartées : on ne
 * bâtit pas sur les gens.
 */
export function wallCells(
  enc: Encounter,
  from: GridPos,
  at: GridPos,
  length: number,
): GridPos[] {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  // Perpendiculaire à la visée. Face à face (aucun écart), on pose à l'horizontale.
  const perp =
    Math.abs(dx) >= Math.abs(dy) ? { x: 0, y: 1 } : { x: 1, y: 0 };

  const occupees = new Set(
    enc.combatants.filter((c) => !c.down).flatMap((c) => occupiedCells(c).map(cellKey)),
  );

  const cells: GridPos[] = [];
  const demi = Math.floor(Math.max(1, length) / 2);
  for (let i = -demi; cells.length < Math.max(1, length) && i <= demi + 1; i++) {
    const pos = { x: at.x + perp.x * i, y: at.y + perp.y * i };
    if (!inBounds(pos, enc.grid) || occupees.has(cellKey(pos))) continue;
    cells.push(pos);
  }
  return cells;
}

/**
 * Dresse un mur, ou rend `null` s'il n'y a pas une case pour le poser.
 *
 * Sa solidité arrive TOUTE FAITE dans `spec.hp` (cf. `applyMaterial`, qui la
 * calcule une fois pour le moteur comme pour l'aperçu). Ne reste ici que la
 * durée : façonné sur place il est permanent, conjuré il tient ce que le sort
 * dit, improvisé il tient moitié moins — jamais moins d'un tour.
 */
export function raiseWall(
  enc: Encounter,
  caster: Combatant,
  at: GridPos,
  spec: { length: number; hp: number },
  material: string,
  opts: { stable: boolean; duration: number; effectFactor: number },
): ConjuredWall | null {
  const cells = wallCells(enc, caster.pos, at, spec.length);
  if (!cells.length) return null;

  const def = MATERIAL_BY_KEY.get(material);
  // `spec.hp` arrive DÉJÀ mis à l'échelle de la matière et du palier : c'est
  // `applyMaterial` qui en a la charge, et c'est aussi lui qui alimente
  // l'aperçu du sélecteur. Le réappliquer ici doublait la pénalité — un mur de
  // grès tombait à 13 PV au lieu de 16.
  const maxHp = Math.max(1, Math.round(spec.hp));
  const remaining = opts.stable
    ? WALL_PERMANENT
    : Math.max(1, Math.round(opts.duration * opts.effectFactor));

  const wall: ConjuredWall = {
    id: nextWallId(),
    name: `Mur de ${def?.name.toLowerCase() ?? material}`,
    material,
    cells,
    hp: maxHp,
    maxHp,
    remaining,
    sourceId: caster.id,
  };
  (enc.walls ??= []).push(wall);
  return wall;
}

/**
 * Type de dégâts contre lequel TOUT mur est fragile.
 *
 * Une paroi ne se tranche pas et ne brûle pas : elle se BRISE. Le contondant
 * est donc la réponse universelle à un mur, quelle qu'en soit la matière — ce
 * qui donne enfin une raison de garder un marteau dans le groupe, et empêche un
 * mage de Terre de bloquer indéfiniment une escouade d'épéistes.
 */
export const WALL_COMMON_WEAKNESS = 'bludgeoning';

/** Ce que vaut une faiblesse, ou une résistance, contre un mur. */
export const WALL_WEAKNESS_FACTOR = 2;

/**
 * Encaisse des dégâts sur un mur. Rend ce qui a réellement été retiré.
 *
 * Deux failles, qui ne se cumulent pas : le **contondant**, contre lequel tout
 * mur cède, et celle de sa MATIÈRE — le poison contre le calcaire, la foudre
 * contre le cuivre. Les empiler donnerait un ×4 qui ferait tomber une paroi en
 * un coup ; c'est la meilleure des deux qui compte, pas leur produit.
 */
export function damageWall(wall: ConjuredWall, amount: number, type?: string): number {
  const def = MATERIAL_BY_KEY.get(wall.material);
  let brut = Math.max(0, Math.round(amount));

  const fragile =
    type === WALL_COMMON_WEAKNESS || (!!type && !!def?.weaknesses?.includes(type));
  if (fragile) brut *= WALL_WEAKNESS_FACTOR;
  else if (type && def?.resistances?.includes(type)) {
    brut = Math.round(brut / WALL_WEAKNESS_FACTOR);
  }

  const inflige = Math.min(wall.hp, brut);
  wall.hp -= inflige;
  return inflige;
}

/** La teinte de la matière d'un mur, pour le dessiner. */
export const wallColor = (wall: ConjuredWall): string =>
  MATERIAL_BY_KEY.get(wall.material)?.color ?? '#8d8a86';

/** Retire un mur de la rencontre. */
export function removeWall(enc: Encounter, wallId: string): ConjuredWall | undefined {
  const walls = enc.walls;
  const i = walls?.findIndex((w) => w.id === wallId) ?? -1;
  if (!walls || i < 0) return undefined;
  return walls.splice(i, 1)[0];
}

/**
 * Fait vieillir les murs d'un round. Rend ceux qui viennent de tomber.
 *
 * Les permanents ne vieillissent pas : c'est toute la différence entre façonner
 * la pierre qui est là et en tirer une du néant.
 */
export function ageWalls(enc: Encounter): ConjuredWall[] {
  const tombes: ConjuredWall[] = [];
  for (const wall of [...(enc.walls ?? [])]) {
    if (wall.remaining === WALL_PERMANENT) continue;
    wall.remaining -= 1;
    if (wall.remaining <= 0) {
      removeWall(enc, wall.id);
      tombes.push(wall);
    }
  }
  return tombes;
}
