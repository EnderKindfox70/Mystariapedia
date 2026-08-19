import { CarriedItem, Combatant, Encounter, GridPos } from './combat.types';
import { Rng } from './dice';
import { cellKey, inBounds, occupiedCells, samePos, traceLine } from './grid';
import { blocksMovement, TerrainMap } from './terrain';

/* ──────────────────────────────────────────────────────────────────────────
   CE QUI TRAÎNE PAR TERRE

   Un objet lancé ne disparaît pas : il tombe quelque part, et il y reste. Sans
   cela, projeter son épée revenait à la détruire — et le sort n'était qu'une
   attaque qui coûtait une arme.

   Les piles vivent sur la RENCONTRE et non sur les combattants : le sol n'a
   pas de propriétaire, c'est même toute la question. Ce qui tombe entre deux
   lignes revient à qui ose aller le chercher.

   On réutilise `CarriedItem` plutôt qu'un type dédié : un objet garde sa
   matière et sa nature en tombant. Une épée ramassée doit encore être en fer
   pour qu'un champ la reprenne, et une fiole reste buvable.
─────────────────────────────────────────────────────────────────────────── */

/** La pile posée sur une case, ou un tableau vide. */
export function groundAt(enc: Encounter, pos: GridPos): CarriedItem[] {
  return enc.ground?.[cellKey(pos)] ?? [];
}

/** Toutes les cases qui portent quelque chose, avec leur pile. */
export function groundPiles(enc: Encounter): { pos: GridPos; items: CarriedItem[] }[] {
  const piles: { pos: GridPos; items: CarriedItem[] }[] = [];
  for (const [key, items] of Object.entries(enc.ground ?? {})) {
    if (!items.length) continue;
    const [x, y] = key.split(',').map(Number);
    piles.push({ pos: { x, y }, items });
  }
  return piles;
}

/**
 * Pose un objet sur une case.
 *
 * Les lignes homonymes fusionnent, comme dans un sac : trois flèches tombées
 * au même endroit font une pile de trois, pas trois piles d'une.
 */
export function dropOnGround(enc: Encounter, pos: GridPos, item: CarriedItem, qty = 1): void {
  const piles = (enc.ground ??= {});
  const pile = (piles[cellKey(pos)] ??= []);
  const existing = pile.find((i) => i.name === item.name);
  if (existing) {
    existing.qty += qty;
    existing.metallic ??= item.metallic;
    existing.weightKg ??= item.weightKg;
    return;
  }
  pile.push({ ...item, qty });
}

/**
 * Retire des exemplaires d'une pile au sol. Rend ce qui a été réellement pris.
 *
 * La ligne vidée DISPARAÎT, contrairement à celle d'un sac : un carquois vide
 * reste un objet qu'on porte et qu'il faut remplir, tandis qu'un sol dont on a
 * tout ramassé est simplement un sol nu.
 */
export function takeFromGround(enc: Encounter, pos: GridPos, name: string, qty: number): number {
  const pile = enc.ground?.[cellKey(pos)];
  const line = pile?.find((i) => i.name === name);
  if (!pile || !line) return 0;
  const taken = Math.min(line.qty, Math.max(0, Math.round(qty)));
  line.qty -= taken;
  if (line.qty <= 0) pile.splice(pile.indexOf(line), 1);
  if (!pile.length) delete enc.ground![cellKey(pos)];
  return taken;
}

/** Les cases qu'un combattant peut fouiller du bout du bras : la sienne et ses voisines. */
export function cellsWithinReach(unit: Combatant): GridPos[] {
  const cells: GridPos[] = [];
  for (const own of occupiedCells(unit)) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const pos = { x: own.x + dx, y: own.y + dy };
        if (!cells.some((c) => samePos(c, pos))) cells.push(pos);
      }
    }
  }
  return cells;
}

/** Ce qu'un combattant peut ramasser sans bouger, case par case. */
export function reachableGround(
  enc: Encounter,
  unit: Combatant,
): { pos: GridPos; items: CarriedItem[] }[] {
  return cellsWithinReach(unit)
    .map((pos) => ({ pos, items: groundAt(enc, pos) }))
    .filter((p) => p.items.length > 0);
}

/**
 * De combien de cases un tir manqué dépasse sa cible.
 *
 * Un objet manqué ne s'arrête pas en l'air : il poursuit sa course. Une à trois
 * cases — assez pour qu'aller le rechercher soit une décision, pas assez pour
 * qu'il sorte du jeu. Le tirage passe par le `Rng` de la rencontre, donc une
 * partie rechargée le retrouve au même endroit.
 */
export const OVERSHOOT_CELLS = { min: 1, max: 3 };

/**
 * Où atterrit un objet projeté.
 *
 * **Touché** : il tombe aux pieds de la cible — la dernière case libre avant
 * elle, du côté du lanceur. C'est là qu'une arme rebondit, et cela laisse à la
 * cible la possibilité de se baisser pour la ramasser à son tour.
 *
 * **Manqué** : il file au-delà, dans le prolongement du tir. Rater coûte donc
 * deux fois — le coup, et la marche qu'il faudra faire pour récupérer l'objet.
 *
 * Dans tous les cas la case retenue est praticable et dans le plateau : un mur
 * arrête l'objet à son pied plutôt que de l'avaler.
 */
export function landingCell(
  enc: Encounter,
  from: GridPos,
  aim: GridPos,
  hit: boolean,
  rng: Rng,
  terrain: TerrainMap,
): GridPos {
  /** La case tient-elle un objet, ou faut-il s'arrêter avant ? */
  const praticable = (pos: GridPos): boolean =>
    inBounds(pos, enc.grid) && !blocksMovement(terrain, cellKey(pos));

  if (hit) {
    // La ligne du lanceur vers la cible : on prend la dernière case avant elle.
    const ligne = traceLine(from, aim);
    const avant = ligne.length >= 2 ? ligne[ligne.length - 2] : aim;
    return praticable(avant) ? avant : aim;
  }

  // Manqué : on prolonge le tir au-delà de la cible, dans le même axe.
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const pas = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  const ux = dx / pas;
  const uy = dy / pas;
  const depasse = rng.int(OVERSHOOT_CELLS.min, OVERSHOOT_CELLS.max);

  // On avance case par case et on garde la dernière praticable : un objet qui
  // rencontre un mur tombe à son pied, il ne le traverse pas.
  let best = aim;
  for (let i = 1; i <= depasse; i++) {
    const pos = { x: Math.round(aim.x + ux * i), y: Math.round(aim.y + uy * i) };
    if (!praticable(pos)) break;
    best = pos;
  }
  return best;
}
