import { TerrainMap } from './terrain';

/* ──────────────────────────────────────────────────────────────────────────
   DÉCORS PRÊTS À JOUER

   Poser un terrain case par case coûte plusieurs minutes ; on finit par ne
   jamais en poser du tout, et à tout jouer sur du sol nu — c'est-à-dire à ne
   jamais se servir des règles de couvert, de ligne de vue et de coût de
   déplacement. Ces cartes existent pour rendre un décor gratuit.

   ELLES SONT ÉCRITES EN ASCII, à dessein. Une liste de coordonnées ne se relit
   pas : on ne voit pas qu'un pont a deux entrées, qu'une clairière est fermée,
   qu'une carte avantage le camp de gauche. Un dessin, si — et on le corrige au
   caractère près.

   Chacune vise un usage tactique précis. Une carte qui ne change rien au jeu
   n'a pas sa place ici : autant rester sur du sol nu.
─────────────────────────────────────────────────────────────────────────── */

/** Correspondance caractère → clé de décor. Un point reste du sol nu. */
export const LAYOUT_LEGEND: Record<string, string> = {
  '#': 'mur',
  O: 'rocher',
  T: 'arbre',
  V: 'gouffre',
  f: 'fourre',
  '~': 'eau',
  b: 'boue',
  r: 'ruines',
};

/** Un décor préfabriqué. */
export interface TerrainLayout {
  key: string;
  name: string;
  /** Ce que la carte met à l'épreuve, en une ligne. */
  hint: string;
  /** Le dessin, une chaîne par ligne. Toutes de même longueur. */
  rows: string[];
}

/**
 * Les cartes, dessinées pour la grille par défaut (20 × 15).
 *
 * Elles sont symétriques gauche/droite quand elles le peuvent : les deux camps
 * se placent aux extrémités, et un décor qui favorise un côté ne mesure plus
 * les fiches mais le placement.
 */
export const TERRAIN_LAYOUTS: TerrainLayout[] = [
  {
    key: 'pont',
    name: 'Le pont',
    hint: 'Un gouffre coupe le terrain : on se voit et on se tire dessus, mais on ne se rejoint qu’au pont',
    rows: [
      '.........VV.........',
      '.........VV.........',
      '....O....VV....O....',
      '.........VV.........',
      '.........VV.........',
      '.........VV.........',
      '..O......VV......O..',
      '....................',
      '..O......VV......O..',
      '.........VV.........',
      '.........VV.........',
      '.........VV.........',
      '....O....VV....O....',
      '.........VV.........',
      '.........VV.........',
    ],
  },
  {
    key: 'clairiere',
    name: 'La clairière',
    hint: 'Bois dense autour d’un centre dégagé : la ligne de vue se mérite',
    rows: [
      'TTT..TT...TT..T..TTT',
      'TT.f..T..f..TT..f.TT',
      'T..T....f....T....T.',
      '..f...T...T....T..f.',
      '....T...ff...T......',
      '.T.....f...f.....T..',
      '..T..f.......f..T...',
      '....................',
      '..T..f.......f..T...',
      '.T.....f...f.....T..',
      '....T...ff...T......',
      '..f...T...T....T..f.',
      'T..T....f....T....T.',
      'TT.f..T..f..TT..f.TT',
      'TTT..TT...TT..T..TTT',
    ],
  },
  {
    key: 'gue',
    name: 'Le gué',
    hint: 'Une rivière ralentit sans arrêter : traverser coûte du souffle et un tour',
    rows: [
      '........~~~~........',
      '........~~~~........',
      '........~bb~........',
      '........~bb~........',
      '.......~~~~~~.......',
      '.......~~~~~~.......',
      '........~~~~........',
      '........bbbb........',
      '........~~~~........',
      '.......~~~~~~.......',
      '.......~~~~~~.......',
      '........~bb~........',
      '........~bb~........',
      '........~~~~........',
      '........~~~~........',
    ],
  },
  {
    key: 'defile',
    name: 'Le défilé',
    hint: 'Un couloir entre deux parois, avec des niches pour se mettre à couvert',
    rows: [
      'OOOOOOOOOOOOOOOOOOOO',
      'OOOOOOOOOOOOOOOOOOOO',
      'OOOO....OOOO....OOOO',
      'OO......OOOO......OO',
      'OO................OO',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      'OO................OO',
      'OO......OOOO......OO',
      'OOOO....OOOO....OOOO',
      'OOOOOOOOOOOOOOOOOOOO',
      'OOOOOOOOOOOOOOOOOOOO',
    ],
  },
  {
    key: 'ruines',
    name: 'Les ruines',
    hint: 'Murs brisés et gravats : des angles à tourner, des coins où attendre',
    rows: [
      '....................',
      '..####......####....',
      '..#..r......r..#....',
      '..#..#......#..#....',
      '..####......####....',
      '.....rr....rr.......',
      '....................',
      '......rrrrrr........',
      '....................',
      '.......rr....rr.....',
      '....####......####..',
      '....#..#......#..#..',
      '....#..r......r..#..',
      '....####......####..',
      '....................',
    ],
  },
  {
    key: 'cour',
    name: 'La cour à piliers',
    hint: 'Piliers réguliers : idéal pour éprouver les zones et les lignes de vue',
    rows: [
      '....................',
      '..##....##....##....',
      '..##....##....##....',
      '....................',
      '....................',
      '..##....##....##....',
      '..##....##....##....',
      '....................',
      '....................',
      '..##....##....##....',
      '..##....##....##....',
      '....................',
      '....................',
      '..##....##....##....',
      '....................',
    ],
  },
  {
    key: 'marais',
    name: 'Le marais',
    hint: 'Tout ralentit et tout cache : les combats y durent, et l’endurance y compte',
    rows: [
      '.bb..~~...ff...~~.b.',
      'bbb.~~~~..ff..~~~~bb',
      '.bb..~~....f...~~.b.',
      '..f...bb......bb..f.',
      '.ff...bb......bb.ff.',
      '..f............f....',
      '~~~....ff..ff....~~~',
      '~~~....ff..ff....~~~',
      '~~~....ff..ff....~~~',
      '..f............f....',
      '.ff...bb......bb.ff.',
      '..f...bb......bb..f.',
      '.bb..~~....f...~~.b.',
      'bbb.~~~~..ff..~~~~bb',
      '.bb..~~...ff...~~.b.',
    ],
  },
  {
    key: 'embuscade',
    name: 'L’embuscade',
    hint: 'Une route dégagée bordée de fourrés : on avance vite ou on avance caché',
    rows: [
      'TTffffTTffffTTffffTT',
      'TfffffffffffffffffT.',
      '.ffff..fff..ffff.ff.',
      '..ff....f....ff...f.',
      '....................',
      '....................',
      '....O..........O....',
      '....................',
      '....................',
      '....O..........O....',
      '....................',
      '....................',
      '..ff....f....ff...f.',
      '.ffff..fff..ffff.ff.',
      'TfffffffffffffffffT.',
    ],
  },
];

/** Une carte par sa clé. */
export const layoutByKey = (key: string): TerrainLayout | undefined =>
  TERRAIN_LAYOUTS.find((l) => l.key === key);

/** Dimensions naturelles d'une carte. */
export const layoutSize = (layout: TerrainLayout): { width: number; height: number } => ({
  width: layout.rows[0]?.length ?? 0,
  height: layout.rows.length,
});

/**
 * Convertit une carte en décor pour une grille donnée.
 *
 * La carte est **centrée** puis rognée si la grille ne fait pas sa taille : une
 * rencontre plus petite garde le cœur du dessin — le pont, le gué, le couloir —
 * plutôt que son coin supérieur gauche, qui n'est souvent que du décor.
 */
export function layoutToTerrain(
  layout: TerrainLayout,
  grid: { width: number; height: number },
): TerrainMap {
  const size = layoutSize(layout);
  const offsetX = Math.floor((grid.width - size.width) / 2);
  const offsetY = Math.floor((grid.height - size.height) / 2);

  const terrain: TerrainMap = {};
  layout.rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      const kind = LAYOUT_LEGEND[glyph];
      if (!kind) return;
      const cx = x + offsetX;
      const cy = y + offsetY;
      if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) return;
      terrain[`${cx},${cy}`] = kind;
    });
  });
  return terrain;
}
