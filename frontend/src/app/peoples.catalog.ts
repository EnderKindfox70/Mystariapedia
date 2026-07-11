/**
 * Catalogue des peuples (races) pour l'affichage de la grille sur la page lore
 * `/lore/peuples`. Chaque entrée pointe vers sa fiche détaillée data-driven
 * `/lore/peuples/<slug>` (resolver + peoples/<slug>.json).
 *
 * Le `slug` est la clé de route ET le nom du fichier JSON. Le `sigil` sert
 * d'emblème sur la carte (aucun peuple n'a d'icône image pour l'instant).
 */
export interface PeopleMeta {
  /** Identifiant de route (`/lore/peuples/<slug>`) et nom du fichier JSON lore. */
  slug: string;
  /**
   * Clé de la race dans characters/races.json (source unique des données de jeu :
   * attributs, sous-races, traits mécaniques, stats de départ). Relie la fiche
   * lore à sa fiche JDR sans dupliquer les valeurs.
   */
  raceKey: string;
  /** Nom affiché. */
  label: string;
  /** Accroche affichée sur la carte de la grille. */
  tagline: string;
  /** Emblème de repli (glyphe), affiché sur la carte. */
  sigil: string;
  /** Couleur d'accent de la carte. */
  color: string;
}

/** Les peuples de Mystaria (ordre d'affichage sur la page lore). */
export const PEOPLES: PeopleMeta[] = [
  { slug: 'humains',                   raceKey: 'humain',      label: 'Humains',                   tagline: 'Le peuple de l\'équilibre',       sigil: '✦', color: '#8b6b2f' },
  { slug: 'nains',                     raceKey: 'nain',        label: 'Nains',                     tagline: 'Les bâtisseurs des profondeurs',  sigil: '⬢', color: '#9a7440' },
  { slug: 'elfes',                     raceKey: 'elf',         label: 'Elfes',                     tagline: 'Les enfants de l\'Arbre sacré',   sigil: '❦', color: '#77a356' },
  { slug: 'marcheurs-des-profondeurs', raceKey: 'deep-walker', label: 'Marcheurs des Profondeurs', tagline: 'Les détachés de l\'arbre-mère',   sigil: '≋', color: '#3d79a8' },
  { slug: 'hommes-betes',              raceKey: 'beast-human', label: 'Hommes-bêtes',              tagline: 'Les peuples des terres sauvages', sigil: '❧', color: '#6b1f1f' },
];

const PEOPLE_BY_SLUG = new Map(PEOPLES.map((p) => [p.slug, p]));

export const peopleMeta    = (slug: string): PeopleMeta | undefined => PEOPLE_BY_SLUG.get(slug);
export const peopleLabel   = (slug: string): string => PEOPLE_BY_SLUG.get(slug)?.label ?? slug;
export const peopleColor   = (slug: string): string => PEOPLE_BY_SLUG.get(slug)?.color ?? '#8b6b2f';
export const peopleSigil   = (slug: string): string => PEOPLE_BY_SLUG.get(slug)?.sigil ?? '◇';
export const peopleRaceKey = (slug: string): string => PEOPLE_BY_SLUG.get(slug)?.raceKey ?? '';
