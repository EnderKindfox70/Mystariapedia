/* ──────────────────────────────────────────────────────────────────────────
   Les noms français des types de dégâts.

   `damage_type.json` fait foi, mais il ne parle qu'anglais : ses clés sont des
   identifiants (`slashing`, `dark`), pas des mots à montrer. La traduction vit
   donc ici, et NON dans le service qui l'utilisait jusqu'ici — le moteur écrit
   lui aussi au journal, et il est en TypeScript pur : il ne peut rien importer
   d'Angular. Deux tables auraient divergé le jour où l'on ajoute un type.
─────────────────────────────────────────────────────────────────────────── */

export const DAMAGE_LABELS: Record<string, string> = {
  bludgeoning: 'Contondant',
  piercing: 'Perforant',
  slashing: 'Tranchant',
  fire: 'Feu',
  ice: 'Glace',
  lightning: 'Foudre',
  water: 'Eau',
  earth: 'Terre',
  wind: 'Vent',
  plant: 'Végétal',
  dark: 'Ténèbres',
  light: 'Lumière',
  life: 'Vie',
  death: 'Mort',
  space: 'Espace',
  time: 'Temps',
  // Marqueur des revêtements qui n'apportent pas de nature propre (cf. WEAPON_DAMAGE_TYPE).
  weapon: "Type de l'arme",
};

/**
 * Glyphe de chaque type de dégâts, pour le lire d'un coup d'œil.
 *
 * Repris des sigils de domaine quand le type en a un (le Feu garde ♨, la Foudre
 * ϟ) : une même nature ne doit pas changer de signe selon la page. Les types
 * physiques, eux, n'ont pas de domaine — leur glyphe dit l'outil.
 *
 * Caractères Unicode, donc réservés à l'écran : les polices embarquées dans le
 * PDF ne les portent pas, l'export continue d'écrire les noms.
 */
export const DAMAGE_SIGILS: Record<string, string> = {
  bludgeoning: '⚒',
  piercing: '➤',
  slashing: '⚔',
  fire: '♨',
  ice: '❄',
  lightning: 'ϟ',
  water: '≋',
  earth: '△',
  wind: '☲',
  plant: '✥',
  dark: '◉',
  light: '☼',
  life: '♧',
  death: '☠',
  space: '✧',
  time: '⌛',
  // Le poison n'est pas au catalogue des types, mais le statut du même nom
  // inflige ses dégâts sous ce nom : il lui faut donc un signe.
  poison: '☣',
  weapon: '❖',
};

/** Glyphe d'un type de dégâts, chaîne vide s'il n'en a pas. */
export const damageSigil = (key: string | undefined): string =>
  (key && DAMAGE_SIGILS[key]) || '';

/**
 * Type de dégâts SPÉCIAL : « celui de l'arme que l'on nimbe ».
 *
 * Les revêtements élémentaires ajoutent leur propre nature au coup — une lame
 * ardente brûle en plus de trancher. Le Renforcement, lui, n'apporte aucune
 * nature : il densifie ce qui est déjà là, donc son bonus doit frapper du même
 * type que l'arme, et buter sur la même défense. Sans ce marqueur, il faudrait
 * écrire un sort par catégorie d'arme, ou lui inventer un élément qu'il n'a pas.
 *
 * Il ne survit jamais jusqu'aux dégâts : `resolvedComponents` le remplace par
 * le type réel de l'arme au moment où le coup part.
 */
export const WEAPON_DAMAGE_TYPE = 'weapon';

/**
 * Nom affichable d'un type de dégâts. Une clé inconnue est rendue telle quelle
 * plutôt que masquée : mieux vaut lire « obscur » que rien du tout.
 */
export const damageLabel = (key: string | undefined): string =>
  (key && DAMAGE_LABELS[key]) || key || 'inconnu';
