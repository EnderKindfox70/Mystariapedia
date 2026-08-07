/* ──────────────────────────────────────────────────────────────────────────
   LES TERRAINS

   Un décor n'est pas seulement « passable ou non ». Trois propriétés
   indépendantes suffisent à couvrir tout ce qu'une table demande :

   - **bloque le passage** — on ne traverse pas
   - **bloque la vue** — on ne vise pas au travers
   - **coûte plus cher** — on traverse, mais lentement

   Les croiser donne des décors tactiquement distincts : un fourré se traverse
   mais cache, un gouffre se franchit du regard mais pas des pieds. C'est ce qui
   rend le placement intéressant au-delà du simple labyrinthe.
─────────────────────────────────────────────────────────────────────────── */

/** Un type de décor et ce qu'il fait. */
export interface TerrainKind {
  key: string;
  label: string;
  /** Court rappel de ce que le décor change, affiché en infobulle. */
  hint: string;
  blocksMovement: boolean;
  blocksSight: boolean;
  /** Multiplicateur du coût de déplacement (1 = sol nu, 2 = pénible). */
  moveCost: number;
  /** Couleur de la case sur le plateau. */
  color: string;
  /** Glyphe affiché dans la case. */
  glyph: string;
}

/**
 * Catalogue des décors. L'ordre est celui de la palette du MJ : les obstacles
 * durs d'abord, les gênes ensuite.
 */
export const TERRAIN_KINDS: TerrainKind[] = [
  {
    key: 'mur',
    label: 'Mur',
    hint: 'Infranchissable, coupe la vue',
    blocksMovement: true,
    blocksSight: true,
    moveCost: 1,
    color: 'rgba(94, 70, 50, .9)',
    glyph: '▓',
  },
  {
    key: 'rocher',
    label: 'Rocher',
    hint: 'Infranchissable, coupe la vue',
    blocksMovement: true,
    blocksSight: true,
    moveCost: 1,
    color: 'rgba(120, 116, 108, .75)',
    glyph: '⬢',
  },
  {
    key: 'arbre',
    label: 'Arbre',
    hint: 'Infranchissable, coupe la vue',
    blocksMovement: true,
    blocksSight: true,
    moveCost: 1,
    color: 'rgba(80, 110, 60, .7)',
    glyph: '♣',
  },
  {
    key: 'gouffre',
    label: 'Gouffre',
    hint: 'Infranchissable, mais on voit et on tire au travers',
    blocksMovement: true,
    blocksSight: false,
    moveCost: 1,
    color: 'rgba(10, 8, 14, .95)',
    glyph: '▼',
  },
  {
    key: 'fourre',
    label: 'Fourré',
    hint: 'Se traverse lentement et coupe la vue — de quoi se cacher',
    blocksMovement: false,
    blocksSight: true,
    moveCost: 2,
    color: 'rgba(70, 95, 50, .55)',
    glyph: '✿',
  },
  {
    key: 'eau',
    label: 'Point d’eau',
    hint: 'Se traverse lentement, la vue passe',
    blocksMovement: false,
    blocksSight: false,
    moveCost: 2,
    color: 'rgba(61, 121, 168, .5)',
    glyph: '≈',
  },
  {
    key: 'boue',
    label: 'Boue',
    hint: 'Se traverse lentement, la vue passe',
    blocksMovement: false,
    blocksSight: false,
    moveCost: 2,
    color: 'rgba(94, 70, 50, .45)',
    glyph: '∴',
  },
  {
    key: 'ruines',
    label: 'Ruines',
    hint: 'Gravats : on avance lentement, la vue passe',
    blocksMovement: false,
    blocksSight: false,
    moveCost: 2,
    color: 'rgba(139, 107, 47, .35)',
    glyph: '⌂',
  },
];

const BY_KEY = new Map(TERRAIN_KINDS.map((t) => [t.key, t]));

/** Un décor par sa clé, ou `undefined` pour du sol nu. */
export const terrainKind = (key: string | undefined): TerrainKind | undefined =>
  key ? BY_KEY.get(key) : undefined;

/**
 * Décor d'une rencontre : une case → une clé de terrain. Les cases absentes
 * sont du sol nu.
 */
export type TerrainMap = Record<string, string>;

/**
 * Forme historique du décor : deux listes de cases. Conservée pour relire les
 * rencontres sauvegardées avant l'arrivée des types de terrain.
 */
export interface LegacyTerrain {
  walls?: string[];
  difficult?: string[];
}

/**
 * Ramène un décor à sa forme courante, quelle que soit celle d'origine.
 *
 * Une rencontre sauvegardée hier ne doit pas devenir illisible aujourd'hui :
 * les anciens murs deviennent des murs, les anciennes cases difficiles des
 * ruines (le décor « lent mais dégagé » le plus neutre).
 */
export function normalizeTerrain(terrain: TerrainMap | LegacyTerrain | undefined): TerrainMap {
  if (!terrain) return {};
  const legacy = terrain as LegacyTerrain;
  if (Array.isArray(legacy.walls) || Array.isArray(legacy.difficult)) {
    const out: TerrainMap = {};
    for (const cell of legacy.walls ?? []) out[cell] = 'mur';
    for (const cell of legacy.difficult ?? []) out[cell] = 'ruines';
    return out;
  }
  return { ...(terrain as TerrainMap) };
}

/** La case bloque-t-elle le passage ? */
export const blocksMovement = (terrain: TerrainMap, cell: string): boolean =>
  terrainKind(terrain[cell])?.blocksMovement ?? false;

/** La case bloque-t-elle la ligne de vue ? */
export const blocksSight = (terrain: TerrainMap, cell: string): boolean =>
  terrainKind(terrain[cell])?.blocksSight ?? false;

/** Multiplicateur de coût de déplacement de la case (1 sur du sol nu). */
export const moveCostOf = (terrain: TerrainMap, cell: string): number =>
  terrainKind(terrain[cell])?.moveCost ?? 1;
