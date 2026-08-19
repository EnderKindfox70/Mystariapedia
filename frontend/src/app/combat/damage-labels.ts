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
