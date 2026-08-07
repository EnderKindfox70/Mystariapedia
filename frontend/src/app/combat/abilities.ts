import weaponCategoryCatalog from '../../../public/resources/json/weapon_category.json';
import { AttributeKey, ClassDef, ClassSpell } from '../character/character.types';
import {
  BestiaryAbility,
  DomainSpellEntry,
  SpellNode,
  SpellNodeStats,
  SpellPageData,
} from '../wiki.types';
import {
  AbilityDamage,
  AbilityScaling,
  AbilityStatMod,
  CombatAbility,
  CombatEnchant,
} from './combat.types';
import { CELL_METERS, parseRangeMeters, parseShape } from './grid';
import { WEAPON_ATTACK_RATIO } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   TRADUCTION DES DONNÉES DU WIKI EN CAPACITÉS JOUABLES

   Les fiches d'armes, de sorts et de créatures ne parlent pas la même langue.
   Ce module est le seul endroit qui connaît leurs formes respectives : il les
   ramène toutes à `CombatAbility`, la seule structure que le moteur résout.
   Ajouter une source de capacités (artefact, potion…) revient à écrire une
   fonction ici, sans toucher aux règles.
─────────────────────────────────────────────────────────────────────────── */

export interface WeaponCategoryDef {
  id: number;
  key: string;
  name: string;
  damageType: string;
  handling: number;
  range: string;
  attributePrecision: AttributeKey;
  attributeDamage: AttributeKey;
  enduranceCost: number;
}

export const WEAPON_CATEGORY_BY_KEY = new Map<string, WeaponCategoryDef>(
  (weaponCategoryCatalog.weapon_categories as WeaponCategoryDef[]).map((c) => [c.key, c]),
);

/**
 * Portée des armes à distance, en mètres, par catégorie.
 *
 * `weapon_category.json` ne dit que « Mêlée » ou « Distance » : suffisant pour
 * une fiche, insuffisant pour une grille. On chiffre donc ici, une seule fois,
 * ce que le catalogue laisse implicite — un arc long porte plus loin qu'une
 * fronde, et la table doit pouvoir en jouer.
 */
const RANGED_METERS: Record<string, number> = {
  handCrossbow: 9,
  sling: 12,
  shortBow: 18,
  crossbow: 24,
  longBow: 30,
};

/** Portée par défaut d'une arme à distance non listée. */
const DEFAULT_RANGED_METERS = 18;

/**
 * Zone de gêne d'une arme à distance, en CASES autour du tireur.
 *
 * Tirer sur quelqu'un qui vous colle est malcommode, et d'autant plus que l'arme
 * est encombrante : un arc long demande de la place pour être bandé, une fronde
 * presque pas. Un ennemi dans cette zone rend le tir désavantagé (cf.
 * `DISADVANTAGE_FACTOR`), il ne l'interdit pas.
 */
const CLOSE_QUARTERS_CELLS: Record<string, number> = {
  sling: 1,
  handCrossbow: 1,
  crossbow: 1,
  shortBow: 2,
  longBow: 3,
};

/** Rayon de gêne d'une catégorie d'arme, en mètres (0 = aucune gêne). */
export function disadvantageMeters(category: WeaponCategoryDef | undefined): number {
  const cells = category ? CLOSE_QUARTERS_CELLS[category.key] : undefined;
  return cells ? cells * CELL_METERS : 0;
}

/** Portée d'une catégorie d'arme, en mètres. « Allonge » = deux cases. */
export function weaponRangeMeters(category: WeaponCategoryDef | undefined): number {
  if (!category) return CELL_METERS;
  const range = category.range.toLowerCase();
  if (range.startsWith('distance')) return RANGED_METERS[category.key] ?? DEFAULT_RANGED_METERS;
  if (range.includes('allonge')) return CELL_METERS * 2;
  return CELL_METERS;
}

/* ── Armes ─────────────────────────────────────────────────────────────────── */

/** Ce que la fiche d'une arme apporte au combat. */
export interface WeaponSource {
  name: string;
  slug?: string;
  minDamage: number;
  maxDamage: number;
  weaponCategory?: string;
}

/** Ce que la fiche d'une munition apporte au combat. */
export interface AmmunitionSource {
  name: string;
  damageType?: string;
  damageBonus?: number;
  /** Catégories d'armes capables de la tirer (cf. `compatibleWith`). */
  compatibleWith?: string[];
}

/**
 * Une arme équipée devient une capacité.
 *
 * L'attaque de base vaut **25 % de l'attaque physique + les dégâts de l'arme**,
 * et pour une arme à projectile **+ les dégâts du projectile**. Les dégâts
 * écrits sur la fiche décrivent l'outil (un bâton fait 3–7), pas la force du
 * bras : sans la part d'attaque, une arme resterait aussi mortelle au niveau 1
 * qu'au 20.
 *
 * Le projectile forme une composante de dégâts SÉPARÉE plutôt qu'un bonus fondu
 * dans l'arme : il porte son propre type, donc les résistances de la cible
 * s'appliquent correctement à chacun, et le journal montre les deux lignes.
 */
export function weaponAbility(
  weapon: WeaponSource,
  slot: string,
  ammunition?: AmmunitionSource,
): CombatAbility {
  const category = weapon.weaponCategory
    ? WEAPON_CATEGORY_BY_KEY.get(weapon.weaponCategory)
    : undefined;

  const weaponType = category?.damageType ?? 'bludgeoning';
  const damages: AbilityDamage[] = [
    {
      min: weapon.minDamage,
      max: weapon.maxDamage,
      type: weaponType,
      // La part d'attaque ne s'applique qu'une fois, sur l'arme elle-même :
      // l'accrocher aussi au projectile la compterait deux fois.
      scaling: [{ source: 'atk_phy', ratio: WEAPON_ATTACK_RATIO }],
    },
  ];

  const projectile = ammunition?.damageBonus ?? 0;
  if (projectile > 0) {
    damages.push({
      min: projectile,
      max: projectile,
      type: ammunition?.damageType ?? weaponType,
    });
  }

  return {
    id: `weapon:${slot}`,
    name: weapon.name,
    kind: 'weapon',
    subtitle: ammunition
      ? `${category?.name ?? 'Arme'} · ${ammunition.name}`
      : (category?.name ?? 'Arme'),
    ref: weapon.slug,
    rangeMeters: weaponRangeMeters(category),
    disadvantageMeters: disadvantageMeters(category),
    shape: { kind: 'single' },
    targets: ['enemy'],
    manaCost: 0,
    enduranceCost: category?.enduranceCost ?? 1,
    damages,
    // Le catalogue distingue l'attribut qui vise de celui qui blesse : c'est le
    // premier qui pilote le jet de toucher.
    attackAttribute: category?.attributePrecision ?? 'dexterite',
    // Une arme de contact sert l'attaque d'opportunité ; un arc, non : on ne
    // punit pas un désengagement à trente mètres.
    reaction: weaponRangeMeters(category) <= CELL_METERS * 2 ? ['leave-reach'] : undefined,
  };
}

/** Une arme a-t-elle besoin d'un projectile pour frapper ? */
export function usesAmmunition(weapon: WeaponSource): boolean {
  const category = weapon.weaponCategory
    ? WEAPON_CATEGORY_BY_KEY.get(weapon.weaponCategory)
    : undefined;
  return !!category && category.range.toLowerCase().startsWith('distance');
}

/**
 * Part de l'attaque physique portée par un coup de poing.
 *
 * Les dégâts sont **entièrement** dérivés de l'attaque : pas de dé de base, un
 * poing vaut exactement ce que vaut le bras qui le lance. Le type est toujours
 * contondant.
 */
export const UNARMED_ATTACK_RATIO = 0.25;

/** Le pugiliste fait du poing son arme : il en tire près du double. */
export const PUGILIST_UNARMED_RATIO = 0.45;

/** Part d'attaque au poing d'une classe donnée (clé de `classes.json`). */
export const unarmedRatioFor = (classKey: string | undefined): number =>
  classKey === 'pugilist' ? PUGILIST_UNARMED_RATIO : UNARMED_ATTACK_RATIO;

/**
 * La composante de dégâts d'un coup de poing — source unique de sa puissance.
 * `min`/`max` à zéro : tout vient du scaling, il n'y a rien à tirer aux dés.
 */
export const unarmedDamage = (ratio = UNARMED_ATTACK_RATIO): AbilityDamage => ({
  min: 0,
  max: 0,
  type: 'bludgeoning',
  scaling: [{ source: 'atk_phy', ratio }],
});

/**
 * Attaque à mains nues. **Tout le monde l'a**, armé ou non : on peut toujours
 * frapper du poing, et c'est le recours quand l'arme est hors de portée ou le
 * carquois vide.
 */
export function unarmedAbility(ratio = UNARMED_ATTACK_RATIO): CombatAbility {
  return {
    id: 'weapon:unarmed',
    name: 'Attaque au poing',
    kind: 'weapon',
    subtitle: `Mains nues · ${Math.round(ratio * 100)} % de l'attaque`,
    rangeMeters: CELL_METERS,
    shape: { kind: 'single' },
    targets: ['enemy'],
    manaCost: 0,
    enduranceCost: 1,
    damages: [unarmedDamage(ratio)],
    attackAttribute: 'force',
    unarmed: true,
    // On peut toujours saisir au passage : le poing sert d'opportunité.
    reaction: ['leave-reach'],
  };
}

/* ── Garde ─────────────────────────────────────────────────────────────────
   Renoncer à frapper pour encaisser. C'est l'action qui manquait : sans elle,
   un tour où l'on n'a rien de bon à faire est un tour perdu, et se replier en
   couvrant ses arrières n'existe pas.
─────────────────────────────────────────────────────────────────────────── */

/** Défense gagnée en se mettant en garde, physique comme magique. */
/**
 * Ce que coûte vraiment une compétence de classe, rapporté au prix écrit sur la
 * fiche.
 *
 * Les fiches chiffrent l'effort « à froid » ; en combat, un grand geste doit se
 * mériter. À 1,5, une Frappe puissante passe de 5 à 8 pour une réserve de 14 :
 * on ne la place plus deux fois dans le même échange, et le choix entre le
 * grand coup et l'attaque ordinaire redevient un choix.
 *
 * Le facteur est ici et non recopié dans les fiches : le régler se fait en un
 * point, et le banc d'essai mesure l'effet dans la foulée.
 */
export const CLASS_SKILL_ENDURANCE_FACTOR = 1.5;

export const GUARD_DEFENSE_BONUS = 10;

/** Ce que coûte de tenir sa garde un tour entier. */
/**
 * Souffle rendu par la garde.
 *
 * Se couvrir ne COÛTE plus rien : c'est le seul geste qui refait la réserve.
 * Le combat gagne ainsi son tempo — on frappe tant qu'on tient, on se couvre
 * pour reprendre haleine — et la garde cesse d'être le tour qu'on subit quand
 * on n'a rien de mieux à faire.
 */
export const GUARD_ENDURANCE_GAIN = 5;

/**
 * Se mettre en garde : on renonce à agir pour mieux encaisser jusqu'à son
 * prochain tour.
 *
 * Le gain est volontairement franc — l'absorption étant proportionnelle
 * (`déf / (déf + 25)`), +10 fait passer une armure légère de 17 % à 37 %. Assez
 * pour que se couvrir soit un vrai choix, pas un pis-aller.
 */
export function guardAbility(): CombatAbility {
  return {
    id: 'guard',
    name: 'Garde',
    kind: 'guard',
    subtitle: `+${GUARD_DEFENSE_BONUS} défense · +${GUARD_ENDURANCE_GAIN} souffle`,
    description:
      'Renonce à attaquer pour se couvrir et reprendre haleine : la défense ' +
      'physique et magique augmentent jusqu’au début de votre prochain tour, ' +
      'et la réserve d’endurance se refait.',
    rangeMeters: 0,
    shape: { kind: 'self' },
    targets: ['self'],
    manaCost: 0,
    enduranceCost: 0,
    restoreEndurance: GUARD_ENDURANCE_GAIN,
    damages: [],
    duration: 1,
    mods: [
      { stat: 'def_phy', value: GUARD_DEFENSE_BONUS },
      { stat: 'def_mag', value: GUARD_DEFENSE_BONUS },
    ],
    autoHit: true,
  };
}

/* ── Sorts ─────────────────────────────────────────────────────────────────── */

/** Type de dégâts par défaut d'un domaine, quand le sort n'en déclare pas. */
const DOMAIN_DAMAGE_TYPE: Record<string, string> = {
  fire: 'fire',
  water: 'water',
  earth: 'earth',
  air: 'wind',
  electricity: 'lightning',
  plant: 'plant',
  light: 'light',
  darkness: 'dark',
  life: 'life',
  death: 'death',
  time: 'time',
  space: 'space',
};

const toScaling = (
  list: { source: AbilityScaling['source']; ratio: number; affects?: string }[] | undefined,
  affects: 'damage' | 'heal' | 'mana',
): AbilityScaling[] =>
  (list ?? [])
    .filter((s) => (s.affects ?? 'damage') === affects)
    .map((s) => ({ source: s.source, ratio: s.ratio }));

const toMods = (list: SpellNodeStats['effects']): AbilityStatMod[] =>
  (list ?? []).map((e) => ({
    stat: e.stat,
    // Un effet non chiffré (« modéré ») doit quand même peser : on lui donne un
    // barème plutôt que de le laisser à zéro et de mentir sur la fiche.
    value: e.value ?? MAGNITUDE_VALUE[e.magnitude ?? 'modéré'],
    scaling: toScaling(e.scaling, 'damage'),
  }));

/** Barème des ampleurs qualitatives, faute de valeur chiffrée sur le sort. */
const MAGNITUDE_VALUE: Record<string, number> = { 'léger': 2, 'modéré': 4, fort: 7 };

/**
 * Feuilles débloquées de l'arbre d'un sort : les paliers les plus avancés
 * atteints par le personnage. Un arbre qui se scinde en donne plusieurs — le
 * personnage a réellement deux versions du sort, on les propose toutes deux.
 */
export function unlockedLeaves(spell: DomainSpellEntry, unlockedIds: string[]): SpellNode[] {
  const nodes = spell.progression?.nodes ?? [];
  if (!nodes.length) return [];
  const unlocked = new Set(unlockedIds);
  const owned = nodes.filter((n) => unlocked.has(n.id));
  if (!owned.length) {
    // Aucun nœud enregistré : le sort vient d'être appris, on joue sa racine.
    const root = nodes.find((n) => n.id === spell.progression?.root);
    return root ? [root] : [nodes[0]];
  }
  return owned.filter((node) => !(node.next ?? []).some((id) => unlocked.has(id)));
}

/**
 * Ce qu'un sort de **revêtement** enchante, d'après sa clé, ou `null` s'il n'en
 * est pas un.
 *
 * Le wiki nomme cette famille de façon régulière — `fire-revetement-poings`,
 * `darkness-revetement-arme` — et leur description est explicite : « chaque
 * coup à mains nues inflige ces dégâts EN PLUS ». Sans cette lecture, leurs
 * `damageMin`/`damageMax` seraient pris pour une attaque directe et le sort ne
 * changerait rien aux coups portés. Les revêtements défensifs (`-manteau`,
 * `-armure`) sont déjà modélisés en `effects`/`retaliate` : on ne les touche pas.
 */
export function enchantTargetOf(spellKey: string): CombatEnchant['target'] | null {
  if (/revetement(-\w+)*-poings$/.test(spellKey)) return 'unarmed';
  if (/revetement(-\w+)*-arme$/.test(spellKey)) return 'weapon';
  return null;
}

/**
 * Un palier de sort devient une capacité. Le `choice` optionnel décline un sort
 * à options (Verbe d'autorité, Symbiose végétale…) : chaque choix produit sa
 * propre capacité, ce qui évite d'ajouter un mode « choisir une option » au
 * moteur pour un mécanisme qui n'est qu'un aiguillage de valeurs.
 */
export function spellAbility(
  page: SpellPageData,
  node: SpellNode,
  choiceIndex?: number,
  classKey?: string,
): CombatAbility {
  const stats = node.stats;
  const choice = choiceIndex !== undefined ? stats.choices?.[choiceIndex] : undefined;

  // Bonus de classe : un même sort ne vaut pas la même chose dans toutes les
  // mains. Ce qui est chiffré (scaling, coût, stats) est appliqué ; la
  // description part au journal, car certains bonus ne se chiffrent pas
  // (« le pugiliste porte aussitôt une attaque gratuite »).
  const bonus = (stats.classBonuses ?? []).find((b) => b.class === classKey);
  const bonusScaling = toScaling(bonus?.scaling, 'damage');
  const manaFactor = bonus?.manaFactor ?? 1;
  /** Scaling du nœud, augmenté de celui que la classe apporte. */
  const withBonus = (base: AbilityScaling[]): AbilityScaling[] => [...base, ...bonusScaling];

  const fallbackType =
    choice?.damageType ??
    stats.damageType ??
    page.spell.damageType ??
    DOMAIN_DAMAGE_TYPE[page.domains[0]] ??
    'light';

  const damages: AbilityDamage[] = [];
  if (choice) {
    if (choice.damageMin !== undefined) {
      damages.push({
        min: choice.damageMin,
        max: choice.damageMax ?? choice.damageMin,
        type: fallbackType,
        scaling: withBonus(toScaling(stats.scaling, 'damage')),
      });
    }
  } else if (stats.damages?.length) {
    for (const d of stats.damages) {
      damages.push({
        min: d.min,
        max: d.max,
        type: d.type ?? fallbackType,
        // Une composante porte son scaling propre ; à défaut, celui du nœud.
        scaling: withBonus(
          d.scaling?.length ? toScaling(d.scaling, 'damage') : toScaling(stats.scaling, 'damage'),
        ),
      });
    }
  } else if (stats.damageMin !== undefined) {
    damages.push({
      min: stats.damageMin,
      max: stats.damageMax ?? stats.damageMin,
      type: fallbackType,
      scaling: withBonus(toScaling(stats.scaling, 'damage')),
    });
  }

  const heal = choice?.heal ?? stats.heal;
  const inflicts = (choice?.inflicts ?? stats.inflicts ?? []).map((i) => ({
    status: i.status,
    chance: i.chance,
    duration: i.duration,
  }));
  const recoilSource = choice?.recoil ?? stats.recoil;

  // Sort de revêtement : ses dégâts ne frappent personne à l'incantation, ils
  // viennent nimber l'arme ou les poings pour la durée de l'enchantement.
  const enchantTarget = enchantTargetOf(page.spell.key);
  if (enchantTarget && damages.length) {
    const [nimbe] = damages;
    return {
      id: `spell:${page.spell.key}:${node.id}`,
      name: page.spell.name,
      kind: 'spell',
      subtitle: `${node.name} · enchante ${enchantTarget === 'unarmed' ? 'les poings' : "l'arme"}`,
      ref: page.spell.key,
      description: node.description ?? page.spell.usage?.combat,
      rangeMeters: 0,
      shape: { kind: 'self' },
      targets: ['self'],
      // Le bonus de classe peut alléger le coût (« pour une bouchée de mana »).
      manaCost: Math.max(0, Math.round((stats.mana ?? 0) * manaFactor)),
      enduranceCost: 0,
      damages: [],
      duration: stats.duration,
      // `nimbe` porte déjà le scaling de classe : un ranger tire plus de sa
      // lame enchantée qu'un mage, un pugiliste plus de ses poings.
      enchant: { target: enchantTarget, damage: nimbe },
      mods: toMods(bonus?.effects),
      domains: page.domains,
      spellLevel: page.spell.level,
      reaction: stats.reaction,
      weather: stats.weather ?? page.spell.weather,
      autoHit: true,
      freeStrike: bonus?.freeStrike ? enchantTarget : undefined,
      manualEffects: bonus ? [bonus.description] : undefined,
    };
  }

  return {
    id: `spell:${page.spell.key}:${node.id}${choiceIndex !== undefined ? `:${choiceIndex}` : ''}`,
    name: choice ? `${page.spell.name} — ${choice.name}` : page.spell.name,
    kind: 'spell',
    subtitle: node.name,
    ref: page.spell.key,
    description: choice?.description ?? node.description ?? page.spell.usage?.combat,
    rangeMeters: parseRangeMeters(stats.range),
    shape: parseShape(stats.area),
    targets: stats.targets?.length ? stats.targets : damages.length ? ['enemy'] : ['self'],
    manaCost: Math.max(0, Math.round((choice?.mana ?? stats.mana ?? 0) * manaFactor)),
    enduranceCost: 0,
    damages,
    percentMaxHp: stats.damagePercentMaxHp
      ? {
          min: stats.damagePercentMaxHp.min,
          max: stats.damagePercentMaxHp.max ?? stats.damagePercentMaxHp.min,
        }
      : undefined,
    percentCurrentHp: stats.damagePercentCurrentHp
      ? {
          min: stats.damagePercentCurrentHp.min,
          max: stats.damagePercentCurrentHp.max ?? stats.damagePercentCurrentHp.min,
        }
      : undefined,
    heal,
    healScaling: toScaling(stats.scaling, 'heal'),
    duration: choice?.duration ?? stats.duration,
    // Les modificateurs de stats du nœud, plus ceux que la classe ajoute.
    mods: [...toMods(choice?.effects ?? stats.effects), ...toMods(bonus?.effects)],
    inflicts,
    cleanses: stats.cleanses,
    evadeChance: stats.evadeChance,
    retaliate: stats.retaliate,
    recoil: recoilSource
      ? {
          min: recoilSource.damageMin,
          max: recoilSource.damageMax,
          scaling: toScaling(recoilSource.scaling, 'damage'),
          mods: toMods(recoilSource.effects),
          note: recoilSource.note,
        }
      : undefined,
    weather: stats.weather ?? page.spell.weather,
    // Les domaines du sort : c'est par eux que la météo et l'heure du jour
    // agissent sur sa puissance et son coût.
    domains: page.domains,
    spellLevel: page.spell.level,
    reaction: stats.reaction,
    teleport: stats.teleport,
    teleportMeters: stats.teleport
      ? parseRangeMeters(stats.teleportRange ?? stats.range)
      : undefined,
    attackAttribute: 'intelligence',
    // Un sort qui ne blesse pas ne se rate pas : soins et buffs portent toujours.
    autoHit: damages.length === 0 && !stats.damagePercentMaxHp && !stats.damagePercentCurrentHp,
    // Une frappe gratuite se joue même hors revêtement (« Échauffement » du
    // domaine du feu) : elle porte alors sur ce que le lanceur a en main.
    freeStrike: bonus?.freeStrike ? 'unarmed' : undefined,
    // Un bonus de classe n'est pas toujours chiffrable : sa description part
    // au journal pour que le MJ voie ce que le moteur n'a pas su résoudre.
    manualEffects: bonus ? [bonus.description] : undefined,
  };
}

/**
 * Toutes les capacités qu'un sort équipé procure, paliers et options compris.
 * `classKey` sert aux bonus de classe : le même sort ne vaut pas la même chose
 * dans les mains d'un mage et dans celles d'un pugiliste.
 */
export function spellAbilities(
  page: SpellPageData,
  unlockedIds: string[],
  classKey?: string,
): CombatAbility[] {
  const leaves = unlockedLeaves(page.spell, unlockedIds);
  const out: CombatAbility[] = [];
  for (const node of leaves) {
    const choices = node.stats.choices;
    if (choices?.length) {
      choices.forEach((_, index) => out.push(spellAbility(page, node, index, classKey)));
    } else {
      out.push(spellAbility(page, node, undefined, classKey));
    }
  }
  return out;
}

/* ── Compétences de classe ─────────────────────────────────────────────────
   `classes.json` porte désormais un bloc `combat` chiffré par compétence, aux
   mêmes noms de champs qu'un nœud de sort. La conversion est donc la même
   lecture, et une compétence se règle en éditant le JSON — jamais le moteur.

   Une compétence explicitement hors combat (Pister, Crochetage expert) n'a pas
   de bloc : elle reste déclarable et sa description part au journal pour que le
   MJ tranche.
─────────────────────────────────────────────────────────────────────────── */

/** Portée par défaut d'une compétence sans bloc de combat : le MJ vise librement. */
const CLASS_SKILL_RANGE = 18;

/**
 * Une compétence de classe débloquée devient une action jouable.
 * `unarmedRatio` sert aux enchaînements de poings : ils frappent avec le poing
 * de LEUR classe, pas avec un poing générique.
 */
export function classSkillAbility(
  skill: ClassSpell,
  index: number,
  unarmedRatio = UNARMED_ATTACK_RATIO,
): CombatAbility {
  const combat = skill.combat;
  const base: CombatAbility = {
    id: `class:${index}`,
    name: skill.name,
    kind: 'class',
    subtitle: `Compétence de classe · niveau ${skill.level}`,
    description: skill.description,
    rangeMeters: CLASS_SKILL_RANGE,
    shape: { kind: 'single' },
    targets: ['everyone'],
    manaCost: 0,
    enduranceCost: Math.max(0, Math.round((skill.endurance ?? 0) * CLASS_SKILL_ENDURANCE_FACTOR)),
    damages: [],
    autoHit: true,
  };

  // Sans chiffres, la compétence se déclare et le MJ applique la description.
  if (!combat) return { ...base, manualEffects: [skill.description].filter(Boolean) };

  // Enchaînement de coups de poing : la compétence n'a pas de dégâts propres,
  // elle répète l'attaque au poing. Renforcer ses poings la renforce donc
  // d'office, et il n'y a qu'un seul endroit où régler la puissance d'un poing.
  if (combat.unarmedStrikes) {
    // Chaque coup vaut sa propre part d'attaque : un enchaînement multiplie,
    // donc il se règle à part du poing isolé (cf. `unarmedStrikeRatio`).
    const perStrike = combat.unarmedStrikeRatio ?? unarmedRatio;
    return {
      ...base,
      rangeMeters: parseRangeMeters(combat.range),
      shape: parseShape(combat.area),
      targets: combat.targets?.length ? combat.targets : ['enemy'],
      damages: Array.from({ length: combat.unarmedStrikes }, () => unarmedDamage(perStrike)),
      duration: combat.duration,
      inflicts: combat.inflicts,
      unarmed: true,
      autoHit: false,
      subtitle:
        `${base.subtitle} · ${combat.unarmedStrikes} coups de poing ` +
        `(${Math.round(perStrike * 100)} % chacun)`,
    };
  }

  const scaling = toScaling(combat.scaling as AbilityScaling[] | undefined, 'damage');
  const fallbackType = combat.damageType ?? 'bludgeoning';

  const damages: AbilityDamage[] = combat.damages?.length
    ? combat.damages.map((d) => ({
        min: d.min,
        max: d.max,
        type: d.type ?? fallbackType,
        scaling,
      }))
    : combat.damageMin !== undefined
      ? [
          {
            min: combat.damageMin,
            max: combat.damageMax ?? combat.damageMin,
            type: fallbackType,
            scaling,
          },
        ]
      : [];

  return {
    ...base,
    rangeMeters: parseRangeMeters(combat.range),
    shape: parseShape(combat.area),
    targets: combat.targets?.length ? combat.targets : damages.length ? ['enemy'] : ['self'],
    damages,
    heal: combat.heal,
    healScaling: toScaling(combat.scaling as AbilityScaling[] | undefined, 'heal'),
    restoreMana: combat.restoreMana,
    restoreManaScaling: toScaling(combat.scaling as AbilityScaling[] | undefined, 'mana'),
    duration: combat.duration,
    mods: (combat.effects ?? []).map((e) => ({ stat: e.stat as AbilityStatMod['stat'], value: e.value })),
    inflicts: combat.inflicts,
    cleanses: combat.cleanses,
    evadeChance: combat.evadeChance,
    enchant: combat.enchant
      ? {
          target: combat.enchant.target,
          damage: {
            min: combat.enchant.damageMin,
            max: combat.enchant.damageMax ?? combat.enchant.damageMin,
            type: combat.enchant.damageType ?? 'bludgeoning',
            scaling: combat.enchant.scaling as AbilityScaling[] | undefined,
          },
        }
      : undefined,
    retaliate: combat.retaliate as CombatAbility['retaliate'],
    recoil: combat.recoil
      ? {
          mods: (combat.recoil.effects ?? []).map((e) => ({
            stat: e.stat as AbilityStatMod['stat'],
            value: e.value,
          })),
          note: combat.recoil.note,
        }
      : undefined,
    // Une compétence chiffrée n'a plus besoin que le MJ improvise : le moteur
    // la résout. La description reste visible sur le bouton.
    autoHit: damages.length === 0,
  };
}

/** Compétences de classe accessibles à un niveau donné. */
export function classSkillsFor(klass: ClassDef | undefined, level: number): CombatAbility[] {
  const ratio = unarmedRatioFor(klass?.key);
  return (klass?.spells ?? [])
    .filter((skill) => skill.level <= level)
    .map((skill, index) => classSkillAbility(skill, index, ratio));
}

/* ── Objets consommables ───────────────────────────────────────────────────
   Les fiches de potions décrivent leurs effets en français (« Rend 2d4 + 2
   points de vie au buveur »). On lit ce qui est chiffré — c'est régulier et
   vérifiable — et on reporte le reste au MJ. Aucun effet n'est inventé : une
   ligne qu'on ne sait pas lire est affichée telle quelle, jamais ignorée.
─────────────────────────────────────────────────────────────────────────── */

/** Expression de dés « 2d4 + 2 » : renvoie ses bornes min/max. */
export function parseDice(text: string): { min: number; max: number } | undefined {
  const match = text.match(/(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?/i);
  if (!match) return undefined;
  const count = Number(match[1]);
  const faces = Number(match[2]);
  const bonus = match[3] ? Number(match[4]) * (match[3] === '-' ? -1 : 1) : 0;
  return { min: count + bonus, max: count * faces + bonus };
}

/** Ce qu'une fiche de potion apporte au combat. */
export interface ConsumableSource {
  name: string;
  slug?: string;
  effects?: string[];
}

/**
 * Une fiole du sac devient une action. Le soin, le mana rendu et les purges de
 * statut sont résolus quand la fiche les formule de façon lisible ; tout le
 * reste part au journal en clair.
 */
export function consumableAbility(item: ConsumableSource, statusKeys: Map<string, string>): CombatAbility {
  let heal = 0;
  let restoreMana = 0;
  const cleanses: string[] = [];
  const manual: string[] = [];

  for (const line of item.effects ?? []) {
    const lower = line.toLowerCase();
    const dice = parseDice(line);
    // Moyenne des bornes : une potion ne doit pas être un second jet de dés
    // par-dessus le combat, elle rend un montant fiable.
    const amount = dice ? Math.round((dice.min + dice.max) / 2) : 0;

    let handled = false;
    if (amount && (lower.includes('point') || lower.includes('pv'))) {
      heal += amount;
      handled = true;
    } else if (amount && lower.includes('mana')) {
      restoreMana += amount;
      handled = true;
    }

    // « Met fin au statut Poison. » — la formulation est régulière au catalogue.
    const ends = line.match(/met fin (?:au statut|à la|au) ([\p{L}\s]+)/iu);
    const named = ends ? statusKeys.get(ends[1].trim().toLowerCase()) : undefined;
    if (named) {
      cleanses.push(named);
      handled = true;
    }

    if (!handled) manual.push(line);
  }

  return {
    id: `item:${item.slug ?? item.name}`,
    name: item.name,
    kind: 'item',
    subtitle: 'Objet',
    ref: item.slug,
    // Une fiole se tend à bout de bras : soi-même ou un voisin immédiat.
    rangeMeters: CELL_METERS,
    shape: { kind: 'single' },
    targets: ['self', 'ally'],
    manaCost: 0,
    enduranceCost: 0,
    consumes: { item: item.name, qty: 1 },
    damages: [],
    heal: heal || undefined,
    restoreMana: restoreMana || undefined,
    cleanses: cleanses.length ? cleanses : undefined,
    manualEffects: manual.length ? manual : undefined,
    autoHit: true,
  };
}

/* ── Créatures ─────────────────────────────────────────────────────────────── */

/**
 * Part de l'attaque d'une créature portée par une morsure — même barème que le
 * poing d'un aventurier. Les fiches du bestiaire ne décrivent aucune attaque
 * nommée : elles donnent une puissance brute (`physical_atk`). On en dérive une
 * attaque jouable plutôt que de demander au MJ d'inventer des dégâts à chaque
 * rencontre.
 */
export const CREATURE_ATTACK_RATIO = 0.25;

/** Part de l'attaque portée par une prise de contrôle : elle immobilise plus qu'elle ne blesse. */
export const CREATURE_CONTROL_RATIO = 0.1;

/**
 * Une capacité déclarée sur une fiche de bestiaire devient jouable.
 *
 * Même lecture qu'un palier de sort : c'est ce qui permet à une créature
 * d'avoir un vrai répertoire — charger, hurler pour sa meute, se tapir — sans
 * une ligne de moteur en plus.
 */
export function creatureAbility(spec: BestiaryAbility, index: number): CombatAbility {
  const fallbackType = spec.damageType ?? 'bludgeoning';
  const scaling = toScaling(spec.scaling as AbilityScaling[] | undefined, 'damage');

  const damages: AbilityDamage[] = spec.damages?.length
    ? spec.damages.map((d) => ({ min: d.min, max: d.max, type: d.type ?? fallbackType, scaling }))
    : spec.damageMin !== undefined
      ? [
          {
            min: spec.damageMin,
            max: spec.damageMax ?? spec.damageMin,
            type: fallbackType,
            scaling,
          },
        ]
      : [];

  return {
    id: `creature:${index}`,
    name: spec.name,
    kind: 'natural',
    subtitle: 'Capacité de la créature',
    description: spec.description,
    rangeMeters: parseRangeMeters(spec.range ?? 'Contact'),
    shape: parseShape(spec.area ?? 'Cible unique'),
    targets: spec.targets?.length ? spec.targets : damages.length ? ['enemy'] : ['self'],
    manaCost: Math.max(0, Math.round(spec.manaCost ?? 0)),
    enduranceCost: Math.max(0, Math.round(spec.enduranceCost ?? 0)),
    damages,
    heal: spec.heal,
    healScaling: toScaling(spec.scaling as AbilityScaling[] | undefined, 'heal'),
    duration: spec.duration,
    mods: (spec.effects ?? []).map((e) => ({
      stat: e.stat as AbilityStatMod['stat'],
      value: e.value,
    })),
    inflicts: spec.inflicts,
    cleanses: spec.cleanses,
    evadeChance: spec.evadeChance,
    retaliate: spec.retaliate as CombatAbility['retaliate'],
    recoil: spec.recoil
      ? {
          min: spec.recoil.damageMin,
          max: spec.recoil.damageMax,
          mods: (spec.recoil.effects ?? []).map((e) => ({
            stat: e.stat as AbilityStatMod['stat'],
            value: e.value,
          })),
          note: spec.recoil.note,
        }
      : undefined,
    reaction: spec.reaction,
    attackAttribute: 'force',
    // Ce qui ne blesse pas ne se rate pas : hurlements, postures, soins.
    autoHit: damages.length === 0,
  };
}

/**
 * Morsure : l'attaque de base de toute créature. Perforante, entièrement
 * dérivée de l'attaque physique, sans dé — comme le coup de poing.
 */
export function naturalMeleeAbility(name = 'Morsure'): CombatAbility {
  return {
    id: 'natural:melee',
    name,
    kind: 'natural',
    subtitle: `Corps à corps · ${Math.round(CREATURE_ATTACK_RATIO * 100)} % de l'attaque`,
    rangeMeters: CELL_METERS,
    shape: { kind: 'single' },
    targets: ['enemy'],
    manaCost: 0,
    enduranceCost: 0,
    damages: [
      { min: 0, max: 0, type: 'piercing', scaling: [{ source: 'atk_phy', ratio: CREATURE_ATTACK_RATIO }] },
    ],
    attackAttribute: 'force',
    reaction: ['leave-reach'],
  };
}

/**
 * Prise de contrôle : la bête plaque sa proie au sol plutôt que de la déchirer.
 *
 * C'est ce qui remplace l'ancienne décharge à distance — une créature qui n'est
 * pas un lanceur de sorts n'a rien à projeter, mais elle sait clouer sur place.
 * Le second outil d'une meute, c'est l'immobilisation, pas la portée.
 */
export function naturalControlAbility(): CombatAbility {
  return {
    id: 'natural:control',
    name: 'Prise au sol',
    kind: 'natural',
    subtitle: 'Contrôle · immobilise',
    description: 'Plaque la cible au sol : elle ne peut plus se déplacer le temps de se dégager.',
    rangeMeters: CELL_METERS,
    shape: { kind: 'single' },
    targets: ['enemy'],
    manaCost: 0,
    enduranceCost: 2,
    damages: [
      { min: 0, max: 0, type: 'bludgeoning', scaling: [{ source: 'atk_phy', ratio: CREATURE_CONTROL_RATIO }] },
    ],
    inflicts: [{ status: 'enracinement', chance: 60 }],
    attackAttribute: 'force',
    // Une bête plaque d'autant plus volontiers sa proie qu'elle s'enfuit.
    reaction: ['leave-reach'],
  };
}
