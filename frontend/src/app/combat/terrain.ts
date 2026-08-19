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
  /**
   * Le décor se franchit **à la nage**. Il barre la route à tout le monde, sauf
   * à qui sait nager — pour qui il devient simplement pénible.
   *
   * C'est une quatrième propriété et non un décor de plus : « infranchissable »
   * et « infranchissable pour toi » sont deux choses différentes, et la seconde
   * est ce qui rend une rivière intéressante à placer.
   */
  swimmable?: boolean;
  /**
   * Le décor est un **élément qu'on manipule** : il porte un état (ouvert,
   * verrouillé, brisé) et propose des actions au clic. Cf. `EncounterFeatures`.
   */
  operable?: boolean;
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
    key: 'porte',
    label: 'Porte',
    hint: 'Fermée : barre la route et la vue. S’ouvre, se crochète, s’enfonce',
    blocksMovement: true,
    blocksSight: true,
    moveCost: 1,
    color: 'rgba(126, 88, 46, .85)',
    glyph: '🚪',
    operable: true,
  },
  {
    key: 'eau',
    label: 'Eau peu profonde',
    hint: 'On y patauge : se traverse lentement, la vue passe',
    blocksMovement: false,
    blocksSight: false,
    moveCost: 2,
    color: 'rgba(61, 121, 168, .5)',
    glyph: '≈',
  },
  {
    key: 'eau-profonde',
    label: 'Eau profonde',
    hint: 'On n’y a plus pied : infranchissable si l’on ne sait pas nager',
    // Barrée par défaut : c'est le cas du plus grand nombre. `swimmable` la
    // rouvre à qui sait nager, pour qui elle redevient une simple gêne.
    blocksMovement: true,
    blocksSight: false,
    moveCost: 2,
    color: 'rgba(28, 74, 122, .8)',
    glyph: '≋',
    swimmable: true,
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

/* ── Les éléments qu'on manipule ───────────────────────────────────────────
   Une porte n'est pas un mur : elle a un ÉTAT, et cet état change en cours de
   partie. On le range à côté du décor plutôt que dedans — le décor dit ce
   qu'est la case, l'état dit dans quelle position elle se trouve. Une carte
   reste ainsi une simple liste de cases, et un décor sans état ne paie rien.
─────────────────────────────────────────────────────────────────────────── */

/** État d'une porte posée sur une case. */
export interface DoorState {
  /** Ouverte : on passe et on voit au travers. */
  open: boolean;
  /** Verrouillée : il faut la crocheter ou l'enfoncer avant de l'ouvrir. */
  locked: boolean;
  /** Enfoncée : elle ne se referme plus, et ne se verrouille plus jamais. */
  broken: boolean;
  /** Seuil du jet d'Escamotage pour la crocheter. */
  lockDc: number;
  /** Seuil du jet d'Athlétisme pour l'enfoncer. */
  breakDc: number;
}

/** État des éléments manipulables : case ("x,y") → état. */
export type EncounterFeatures = Record<string, DoorState>;

/** Seuils par défaut d'une porte neuve — une serrure ordinaire, un bois franc. */
export const DEFAULT_LOCK_DC = 12;
export const DEFAULT_BREAK_DC = 15;

/** Une porte fermée et non verrouillée : l'état par défaut à la pose. */
export const newDoor = (): DoorState => ({
  open: false,
  locked: false,
  broken: false,
  lockDc: DEFAULT_LOCK_DC,
  breakDc: DEFAULT_BREAK_DC,
});

/** Une porte laisse-t-elle passer ? Ouverte ou enfoncée, oui. */
export const doorIsPassable = (door: DoorState | undefined): boolean =>
  !!door && (door.open || door.broken);

/**
 * Décor **tel qu'il est réellement à cet instant**, pour ce combattant-là.
 *
 * C'est la pièce qui évite de toucher au calcul de chemin : plutôt que
 * d'apprendre les portes et la nage à Dijkstra, on lui présente une carte déjà
 * résolue. Une porte ouverte n'y figure plus ; l'eau profonde n'y figure plus
 * non plus si celui qui avance sait nager.
 *
 * Sans `mover`, on résout ce qui ne dépend de personne — les portes — et l'eau
 * profonde reste barrée. C'est la bonne vue pour la ligne de VUE, qui ne
 * dépend pas de qui regarde.
 */
export function effectiveTerrain(
  terrain: TerrainMap,
  features: EncounterFeatures | undefined,
  mover?: { canSwim?: boolean },
): TerrainMap {
  const out: TerrainMap = { ...terrain };

  for (const [cell, key] of Object.entries(terrain)) {
    const kind = terrainKind(key);
    if (!kind) continue;

    if (kind.operable && doorIsPassable(features?.[cell])) {
      // Une porte ouverte n'est plus un obstacle : la case redevient nue.
      delete out[cell];
      continue;
    }
    if (kind.swimmable && mover?.canSwim) {
      // Le nageur y passe — lentement. « Eau peu profonde » porte exactement
      // cette règle : on la réutilise plutôt que d'en inventer une jumelle.
      out[cell] = 'eau';
    }
  }
  return out;
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
