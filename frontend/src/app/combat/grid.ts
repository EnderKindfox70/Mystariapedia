import { AbilityShape, Combatant, GridPos } from './combat.types';
import { blocksMovement, blocksSight, moveCostOf, TerrainMap } from './terrain';

/**
 * Grille tactique carrée.
 *
 * Une case vaut 1,5 m, comme dans les jeux dont s'inspire la table. Les données
 * du wiki (portées de sorts, rayons de zone) sont écrites en mètres : elles
 * restent la référence, et la grille n'est qu'une façon de les mesurer. Toutes
 * les comparaisons de portée se font donc en mètres, jamais en cases — sans
 * quoi un arrondi de conversion ferait mentir la fiche du sort.
 *
 * La distance est celle de Tchebychev (la diagonale coûte comme la ligne
 * droite) : c'est la règle usuelle sur grille carrée, et elle évite d'avoir à
 * arbitrer des demi-cases en pleine partie.
 */
export const CELL_METERS = 1.5;

/** Clé d'une case pour les ensembles ("x,y"). */
export const cellKey = (pos: GridPos): string => `${pos.x},${pos.y}`;

/** Case reconstruite depuis sa clé. */
export const parseCell = (key: string): GridPos => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

export const samePos = (a: GridPos, b: GridPos): boolean => a.x === b.x && a.y === b.y;

/** Distance de Tchebychev en cases. */
export const cellDistance = (a: GridPos, b: GridPos): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Distance en mètres entre deux cases. */
export const metersBetween = (a: GridPos, b: GridPos): number => cellDistance(a, b) * CELL_METERS;

/** Les cases occupées par un combattant (empreinte carrée ancrée en haut-gauche). */
export function occupiedCells(unit: Pick<Combatant, 'pos' | 'footprint'>): GridPos[] {
  const size = Math.max(1, Math.round(unit.footprint));
  const cells: GridPos[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) cells.push({ x: unit.pos.x + dx, y: unit.pos.y + dy });
  }
  return cells;
}

/**
 * Distance entre deux combattants : la plus courte entre leurs cases occupées.
 * Un ogre de 2×2 est donc au contact dès qu'un de ses quatre pieds l'est.
 */
export function unitDistanceMeters(
  a: Pick<Combatant, 'pos' | 'footprint'>,
  b: Pick<Combatant, 'pos' | 'footprint'>,
): number {
  let best = Infinity;
  for (const ca of occupiedCells(a)) {
    for (const cb of occupiedCells(b)) best = Math.min(best, cellDistance(ca, cb));
  }
  return best * CELL_METERS;
}

/** Distance d'un combattant à une case libre. */
export function unitToCellMeters(a: Pick<Combatant, 'pos' | 'footprint'>, cell: GridPos): number {
  return Math.min(...occupiedCells(a).map((c) => cellDistance(c, cell))) * CELL_METERS;
}

export const inBounds = (pos: GridPos, grid: { width: number; height: number }): boolean =>
  pos.x >= 0 && pos.y >= 0 && pos.x < grid.width && pos.y < grid.height;

/* ── Lecture des portées et zones écrites dans les JSON ────────────────────
   Le vocabulaire des fiches est régulier (« 12 m », « Contact », « Rayon 5 m »,
   « Cône 8 m »…) : on le lit plutôt que de dupliquer chaque sort à la main.
   Une formulation inconnue retombe sur un défaut sûr et n'empêche jamais de
   jouer — le MJ garde la main pour trancher.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Ramène à du texte ce que le wiki devrait déjà écrire en toutes lettres. Un
 * champ mal formé (objet, nombre) ne doit pas faire tomber le combat : on le
 * lit au mieux, et la forme par défaut s'applique.
 */
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Premier nombre trouvé dans un texte (accepte la virgule décimale). */
const firstNumber = (text: string): number | undefined => {
  const match = text.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

/**
 * Portée d'une capacité, en mètres.
 * « Personnel » → 0 (sur soi) ; « Contact » et « Autour de soi » → une case.
 */
export function parseRangeMeters(text: string | undefined): number {
  const raw = asText(text).trim().toLowerCase();
  if (!raw) return CELL_METERS;
  if (raw.startsWith('personnel') || raw.startsWith('soi')) return 0;
  if (raw.startsWith('contact') || raw.startsWith('autour')) return CELL_METERS;
  return firstNumber(raw) ?? CELL_METERS;
}

/** Zone d'effet d'une capacité, lue depuis le libellé de la fiche. */
export function parseShape(text: string | undefined): AbilityShape {
  const raw = asText(text).trim().toLowerCase();
  if (!raw) return { kind: 'single' };
  if (raw.startsWith('soi')) return { kind: 'self' };
  if (raw.startsWith('rayon')) return { kind: 'radius', meters: firstNumber(raw) ?? CELL_METERS };
  if (raw.startsWith('cône') || raw.startsWith('cone'))
    return { kind: 'cone', meters: firstNumber(raw) ?? CELL_METERS };
  if (raw.startsWith('ligne')) return { kind: 'line', meters: firstNumber(raw) ?? CELL_METERS };
  // « 3 cibles », « 1 à 5 cibles » : on retient la borne HAUTE, le lanceur
  // restant libre d'en désigner moins.
  if (raw.includes('cible')) {
    const numbers = raw.replace(',', '.').match(/\d+/g)?.map(Number) ?? [];
    const count = numbers.length ? Math.max(...numbers) : 1;
    return count > 1 ? { kind: 'targets', count } : { kind: 'single' };
  }
  // Volumes et formulations narratives (« ≈ 50 L », « Bassin / source ») : rien
  // à mesurer sur une grille, le sort touche ce que le MJ désigne.
  return { kind: 'single' };
}

/** Libellé lisible d'une zone, pour l'interface. */
export function shapeLabel(shape: AbilityShape): string {
  switch (shape.kind) {
    case 'self':
      return 'Soi-même';
    case 'radius':
      return `Rayon ${shape.meters} m`;
    case 'cone':
      return `Cône ${shape.meters} m`;
    case 'line':
      return `Ligne ${shape.meters} m`;
    case 'targets':
      return `${shape.count} cibles`;
    default:
      return 'Cible unique';
  }
}

/* ── Empreinte des zones sur la grille ────────────────────────────────────── */

/**
 * Les cases couvertes par une zone. `origin` est la case du lanceur, `at` la
 * case visée ; l'orientation des cônes et des lignes s'en déduit.
 */
export function cellsInShape(
  shape: AbilityShape,
  origin: GridPos,
  at: GridPos,
  grid: { width: number; height: number },
): GridPos[] {
  const keep = (cells: GridPos[]) => cells.filter((c) => inBounds(c, grid));

  switch (shape.kind) {
    case 'self':
      return keep([origin]);

    case 'radius': {
      const reach = Math.floor(shape.meters / CELL_METERS);
      const cells: GridPos[] = [];
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          cells.push({ x: at.x + dx, y: at.y + dy });
        }
      }
      return keep(cells);
    }

    case 'cone': {
      const reach = Math.floor(shape.meters / CELL_METERS);
      const dir = direction(origin, at);
      if (!dir) return keep([at]);
      const cells: GridPos[] = [];
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > reach) continue;
          // Ouverture de 90° : la projection sur l'axe du cône doit dominer
          // l'écart latéral.
          const along = dx * dir.x + dy * dir.y;
          const across = Math.abs(dx * dir.y - dy * dir.x);
          if (along > 0 && across <= along) cells.push({ x: origin.x + dx, y: origin.y + dy });
        }
      }
      return keep(cells);
    }

    case 'line': {
      const reach = Math.floor(shape.meters / CELL_METERS);
      const dir = direction(origin, at);
      if (!dir) return keep([at]);
      const cells: GridPos[] = [];
      for (let step = 1; step <= reach; step++) {
        cells.push({ x: origin.x + dir.x * step, y: origin.y + dir.y * step });
      }
      return keep(cells);
    }

    default:
      return keep([at]);
  }
}

/** Direction en pas de case (une des 8 orientations), ou `null` si sur place. */
function direction(from: GridPos, to: GridPos): GridPos | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  return { x: Math.sign(dx), y: Math.sign(dy) };
}

/* ── Ligne de vue ─────────────────────────────────────────────────────────── */

/**
 * Vrai si rien ne coupe la vue entre deux cases. Un décor opaque traversé par le
 * tracé bloque — mur, arbre, fourré ; un gouffre, lui, se franchit du regard.
 * Les combattants ne bloquent pas (ils gênent, ils n'aveuglent pas — on ne
 * surcharge pas la table de règles de couvert).
 */
export function hasLineOfSight(from: GridPos, to: GridPos, terrain: TerrainMap): boolean {
  for (const cell of traceLine(from, to)) {
    if (samePos(cell, from) || samePos(cell, to)) continue;
    if (blocksSight(terrain, cellKey(cell))) return false;
  }
  return true;
}

/** Cases traversées par le segment `from → to` (Bresenham). */
export function traceLine(from: GridPos, to: GridPos): GridPos[] {
  const cells: GridPos[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

/* ── Déplacement ──────────────────────────────────────────────────────────── */

/** Une case atteignable et ce qu'elle coûte à atteindre. */
export interface ReachableCell {
  pos: GridPos;
  /** Coût cumulé en mètres depuis le point de départ. */
  cost: number;
}

/**
 * Cases atteignables dans un budget de mètres, par Dijkstra sur la grille.
 * Chaque décor applique son propre coût et son propre blocage (cf.
 * `terrain.ts`) ; les combattants bloquent toujours — on ne traverse pas
 * quelqu'un, on le contourne.
 */
export function reachableCells(
  unit: Combatant,
  budgetMeters: number,
  grid: { width: number; height: number },
  terrain: TerrainMap,
  others: Combatant[],
): Map<string, ReachableCell> {
  const blocked = new Set<string>();
  for (const other of others) {
    if (other.id === unit.id) continue;
    for (const cell of occupiedCells(other)) blocked.add(cellKey(cell));
  }

  const size = Math.max(1, Math.round(unit.footprint));
  /** Une case d'ancrage n'est praticable que si TOUTE l'empreinte tient. */
  const fits = (pos: GridPos): boolean => {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const cell = { x: pos.x + dx, y: pos.y + dy };
        if (!inBounds(cell, grid)) return false;
        const key = cellKey(cell);
        if (blocksMovement(terrain, key) || blocked.has(key)) return false;
      }
    }
    return true;
  };

  const start = unit.pos;
  const result = new Map<string, ReachableCell>([[cellKey(start), { pos: start, cost: 0 }]]);
  // File triée à l'insertion : les grilles de table restent petites, un tas
  // binaire n'apporterait rien de mesurable ici.
  const queue: ReachableCell[] = [{ pos: start, cost: 0 }];

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (current.cost > (result.get(cellKey(current.pos))?.cost ?? Infinity)) continue;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const next = { x: current.pos.x + dx, y: current.pos.y + dy };
        if (!fits(next)) continue;
        const stepCost = CELL_METERS * moveCostOf(terrain, cellKey(next));
        const cost = current.cost + stepCost;
        if (cost > budgetMeters + 1e-6) continue;
        const key = cellKey(next);
        if (cost < (result.get(key)?.cost ?? Infinity)) {
          const entry = { pos: next, cost };
          result.set(key, entry);
          queue.push(entry);
        }
      }
    }
  }
  return result;
}

/**
 * Vitesse de déplacement d'un combattant, en mètres par tour.
 *
 * La stat `speed` de l'univers est un score abstrait, pas une distance : on la
 * convertit ici, une fois pour toutes. Un score de 10 donne 6 m (4 cases), soit
 * l'allure de référence ; chaque point ajoute ou retire 0,3 case, le tout
 * arrondi pour garder des déplacements en nombre entier de cases.
 *
 * Les valeurs sont volontairement basses : sur un plateau de 20 cases, traverser
 * la moitié du terrain en un tour rendrait le placement sans enjeu — les
 * distances et les portées ne pèsent que si l'on ne peut pas tout rattraper.
 */
export function movementMeters(speed: number): number {
  const cells = 4 + (speed - 10) * 0.3;
  return Math.max(CELL_METERS, Math.round(cells) * CELL_METERS);
}
