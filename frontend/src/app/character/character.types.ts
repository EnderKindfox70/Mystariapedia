/** Clés des six attributs (alignées sur ATTRIBUTES dans universe-data.ts). */
export type AttributeKey =
  | 'force'
  | 'dexterite'
  | 'constitution'
  | 'intelligence'
  | 'sagesse'
  | 'charisme';

/** Un sort listé sur la fiche : niveau, nom et école (= clé de domaine de magie). */
export interface Spell {
  level: number;
  name: string;
  /** Clé de domaine (cf. MAGIC_DOMAINS), sert d'« école ». */
  school: string;
  /** Clé d'un sort de base (cf. sorts des sous-domaines dans domains/*.json), si choisi dans la liste. */
  key?: string;
}

/**
 * Sorts de la fiche. Deux niveaux distincts :
 * - `unlocked` : sorts **débloqués** (appris), respectant leurs prérequis
 *   (`requires`) et le niveau requis. Illimités.
 * - `equipped` : sorts **équipés** (loadout de combat), sous-ensemble des
 *   débloqués, plafonné (cf. plafond basé sur l'Intelligence). Seuls ceux-ci
 *   sont utilisables en combat.
 * On ne stocke que les clés des sorts (cf. domains/*.json) ; le reste est résolu.
 */
export interface CharacterSpells {
  unlocked: string[];
  equipped: string[];
  /**
   * Nœuds (paliers) débloqués par sort : clé du sort → ids des nœuds de son arbre
   * d'amélioration. Débloquer un sort ouvre son nœud racine ; améliorer ouvre un
   * nœud enfant en suivant l'arbre (les branches se choisissent aux points de
   * scission). Chaque nœud coûte un point d'inspiration (cf.
   * `ClassDef.inspirationPerLevel`). Invariant : `nodes[key]` contient la racine
   * si et seulement si `key ∈ unlocked`.
   */
  nodes: Record<string, string[]>;
}

/** Une ligne d'inventaire. */
export interface InventoryItem {
  name: string;
  qty: number;
  weight: number;
}

/** Identité du personnage. race/background sont la catégorie affichée entre
 *  parenthèses ; subrace/subbackground la déclinaison affichée devant.
 *  Ex. « Elfe continental (elfe) », « Voleur (criminel) ».
 *  race/subrace/class sont choisis dans des listes (cf. dataset JSON) ;
 *  background/subbackground restent en saisie libre. */
export interface CharacterIdentity {
  name: string;
  race: string;
  subrace: string;
  class: string;
  background: string;
  subbackground: string;
  /**
   * Origine géographique (clé de `origins.json`) : la région où le personnage
   * a grandi. Troisième axe de création, distinct de la race (biologie) et du
   * background (métier) — elle ancre dans un lieu, pas dans un corps ni dans
   * un métier.
   */
  origin?: string;
  /** Religion suivie (clé de `religions.json`), vide pour un personnage sans foi. */
  religion?: string;
  age: string;
  /** Portrait (tête) recadré et affiché, encodé en data URL (base64). */
  portrait: string;
  /** Image originale (réduite) servant de base au recadrage. */
  portraitOriginal: string;
  /** Recadrage du portrait : zoom (1+) et point focal en % (0–100). */
  portraitZoom: number;
  portraitPosX: number;
  portraitPosY: number;
  /** Image plein corps du personnage, encodée en data URL (base64). */
  fullImage: string;
}

/** Clés des statistiques de combat (alignées sur les datasets JSON). */
export type StatKey =
  | 'hp'
  | 'mana'
  | 'endurance'
  | 'speed'
  | 'atk_phy'
  | 'atk_mag'
  | 'def_phy'
  | 'def_mag';

/**
 * Réserves qui fluctuent en jeu (cf. POOL_GAUGES).
 *
 * Sous-ensemble de `StatKey` : ce sont les trois statistiques dont on ne
 * consulte pas seulement le maximum, mais le niveau du moment.
 */
export type PoolKey = 'hp' | 'endurance' | 'mana';

/** Mode de calcul des stats issues de la montée de niveau de la classe. */
export type StatMode = 'random' | 'mean';

/** Jauges de survie tenues à la table (cf. SURVIVAL_GAUGES). */
export type SurvivalKey = 'hunger' | 'thirst' | 'rest';

/**
 * Origine géographique : ce que la région d'enfance donne gratuitement, là où
 * un trait équivalent coûterait un emplacement.
 */
export interface OriginDef {
  key: string;
  name: string;
  /** Région du monde (clé de `materials.json > regions`). */
  region: string;
  /** Climat d'origine, celui dont les multiplicateurs de survie ne mordent plus. */
  climate: string;
  description: string;
  /** Acclimatation climatique, en toutes lettres. */
  acclimatation: string;
  /** Langue et savoir régional acquis sans investir de compétence. */
  language: string;
  /** Factions régionales dont l'attitude de départ est améliorée. */
  factions: string[];
  factionNote?: string;
  /** Branches non polarisées ouvertes sans feat ni background (Archipel). */
  nonPolarBranches?: string[];
  nonPolarNote?: string;
}

/** Un rite d'une religion : ce qu'il fait, où, et ce qu'il coûte vraiment. */
export interface ReligionRite {
  name: string;
  /** Effet mécanique ou narratif, en toutes lettres. */
  effect: string;
  /** Lieu de culte exigé. */
  place?: string;
  /** Durée, quand le rite pose un effet qui court. */
  duration?: string;
  /** Contrepartie réelle (une vérité livrée au clergé, un objet enterré, une scène jouée). */
  price?: string;
}

/** Religion suivie : un domaine servi, un marqueur social, et deux rites. */
export interface ReligionDef {
  key: string;
  name: string;
  /** Domaine servi (clé de MAGIC_DOMAINS). */
  domain: string;
  /** Région où la religion est chez elle. */
  region?: string;
  clergy?: string;
  description: string;
  /** Rite de préparation avant une exposition connue au divin. */
  ritual?: string;
  confession?: ReligionRite;
  prayer?: ReligionRite;
  /** Réserve à afficher telle quelle (religion pas encore rédigée, par ex.). */
  note?: string;
}

/** Comment une région lit quelqu'un qui sert ce domaine. */
export interface DomainStanding {
  domain: string;
  favourable: string;
  suspicious: string;
  note?: string;
}

/**
 * Ce qu'un slot de feat peut acheter (paliers 5/10/15/20, un seul par palier) :
 * le point d'attribut classique, un trait du catalogue, ou un feat domanial
 * déclaré par une fiche de domaine.
 */
export type FeatPick = 'attribute' | 'trait' | 'domain';

/** Le choix réellement fait à un palier de feat. */
export interface FeatChoice {
  /** Palier concerné (cf. FEAT_LEVELS). */
  level: number;
  pick: FeatPick;
  /** `attribute` : l'attribut qui gagne son point. */
  attribute?: AttributeKey;
  /** `trait` : clé dans le catalogue de traits (traits.json). */
  trait?: string;
  /** `domain` : clé du feat domanial (champ `feats` de domains/<domain>.json). */
  feat?: string;
  /** `domain` : clé du domaine d'où vient le feat, pour le retrouver sans le chercher. */
  domain?: string;
}

/** Catégorie d'un trait du catalogue — sert à grouper la liste de choix. */
export type TraitCategory = 'combat' | 'survie' | 'perception' | 'magie' | 'social';

/**
 * Trait du catalogue général (section 16 du gameplay) : un passif isolé,
 * indépendant de la race, choisi à la création ou pris sur un slot de feat.
 *
 * Dérivé de `trait.json`, la source unique des traits du monde — le même
 * fichier que celui où le bestiaire pioche par `traitIds`. Un trait n'existe
 * donc qu'une fois, qu'il soit porté par une créature ou par un personnage.
 */
export interface CatalogTrait extends TraitDef {
  /** Id de la ligne dans `trait.json` (partagé avec le bestiaire). */
  id: number;
  category: TraitCategory;
  /** Comment ce trait s'obtient — et s'il s'obtient tout court. */
  acquisition: TraitAcquisition;
  /**
   * Qui l'accorde d'office, en références vers les datasets :
   * `race:<clé>`, `subrace:<clé>`, `background:<clé>`, `origin:<clé>`.
   * C'est ICI que le lien est stocké : races, backgrounds et origines ne
   * déclarent aucun trait en propre, ils sont référencés depuis le catalogue.
   */
  grantedBy: string[];
}

/**
 * Nature de l'obtention d'un trait :
 * - `acquis` : ça s'apprend, donc n'importe qui peut le prendre ;
 * - `biologique` : ça se naît avec (branchies, œil nocturne, charpente naine),
 *   donc ça ne se prend jamais — seule une race peut l'accorder ;
 * - `regional` : ça vient d'une enfance passée quelque part, donc seule une
 *   origine peut l'accorder.
 */
export type TraitAcquisitionKind = 'acquis' | 'biologique' | 'regional';

/** Conditions d'obtention d'un trait, telles qu'affichées sur la fiche. */
export interface TraitAcquisition {
  kind: TraitAcquisitionKind;
  /** Vrai si le trait peut être PRIS (à la création ou sur un slot de feat). */
  pickable: boolean;
  /** La condition en toutes lettres. */
  condition: string;
}

/**
 * Feat domanial tel que déclaré par une fiche de domaine. Dupliqué du wiki
 * (cf. `DomainFeat`) plutôt qu'importé : ce module décrit le personnage et ne
 * doit pas dépendre du wiki.
 */
export interface DomainFeatDef {
  key: string;
  name: string;
  level: number;
  kind: string;
  prerequisite: string;
  freeWith?: string;
  description: string;
  subdomains?: string[];
  excludes?: string[];
  effects: { label: string; value: string; tone?: string }[];
  /** Effets chiffrés réellement appliqués à la fiche (clé de stat ou d'attribut). */
  statEffects?: StatKV[];
}

/** Modèle complet d'une fiche de personnage (le champ `data` côté backend).
 *  Les statistiques ne sont PAS stockées : elles sont recalculées à partir de
 *  la race (genetics-stats), de la classe (montée de niveau) et des traits.
 *  Seuls le mode et la graine du tirage aléatoire sont persistés. */
export interface CharacterSheet {
  identity: CharacterIdentity;
  /**
   * Points d'expérience cumulés. C'est LA valeur de référence de la
   * progression : `level` en est déduit (cf. `levelForXp`), et l'éditeur
   * maintient les deux en accord. Une fiche antérieure à ce champ voit son XP
   * initialisé au seuil de son niveau.
   */
  xp: number;
  /**
   * Niveau du personnage (1 à MAX_LEVEL). Redondant avec `xp` dont il dérive,
   * mais conservé dans le modèle : toutes les règles (stats, sorts de classe,
   * inspiration) le lisent directement.
   */
  level: number;
  /** Jusqu'à 3 clés de domaine de magie. */
  domains: string[];
  attributes: Record<AttributeKey, number>;
  /** Mode de génération des attributs : achat de points ou lancer de dés. */
  attributeMode?: 'pointbuy' | 'roll';
  /** Scores d'achat de points mémorisés, conservés quand on bascule en mode 'roll'. */
  attributePointBuy?: Record<AttributeKey, number>;
  /** Valeurs tirées (4d6, dé le plus bas retiré) en attente d'affectation (mode 'roll'). */
  attributeRolls?: number[];
  /** Affectation mode 'roll' : attribut → index dans `attributeRolls` (-1 = non affecté). */
  attributeAssign?: Record<AttributeKey, number>;
  /**
   * Crans restants des jauges de survie (faim, soif). Contrairement aux
   * statistiques, ces valeurs ne se recalculent pas : elles suivent le voyage,
   * donc la fiche les stocke. Optionnel — une fiche antérieure à ce champ
   * repart d'une jauge pleine (cf. SURVIVAL_GAUGES).
   */
  survival?: Record<SurvivalKey, number>;
  /**
   * Creux des réserves : ce qui MANQUE aux points de vie, à l'endurance et au
   * mana, en points. 0 partout = à plein.
   *
   * Le maximum, lui, reste calculé (race, classe, niveau, équipement) : c'est
   * pourquoi on stocke le creux et non le niveau courant. Un personnage qui
   * monte de niveau garde sa blessure au lieu de la voir effacée par les points
   * gagnés, une fiche à plein n'a rien à retenir, et une fiche antérieure à ce
   * champ repart naturellement à plein.
   *
   * Contrairement aux statistiques, ces valeurs ne se déduisent de rien : une
   * blessure, un souffle court, un mana dépensé suivent la partie. C'est aussi
   * ce que la table redescend sur la fiche en fin de séance (cf. sheet-report).
   */
  poolLoss?: Record<PoolKey, number>;
  /** Mode de calcul des stats : tirage aléatoire ou moyenne. */
  statMode: StatMode;
  /** Graine du tirage aléatoire — garde les stats stables entre les rendus. */
  statSeed: number;
  proficiencyBonus: number;
  /** Compétences choisies via la classe (clés). Le background en accorde d'autres
   *  automatiquement, en plus de celles-ci. */
  skills: string[];
  /**
   * Traits choisis À LA CRÉATION dans le catalogue (clés de traits.json), en
   * plus de ceux qu'accordent la race, la sous-race et le background.
   */
  creationTraits?: string[];
  /**
   * Ce que chaque slot de feat a acheté, au plus un par palier (5/10/15/20).
   * Un palier non encore atteint, ou laissé en attente, n'a pas d'entrée.
   */
  feats?: FeatChoice[];
  /** Sorts débloqués (appris) et équipés (loadout de combat) — cf. CharacterSpells. */
  spells: CharacterSpells;
  /**
   * Matériaux de Terre : ce que le personnage sait façonner, et avec quoi il
   * marche aujourd'hui.
   *
   * Absent sur une fiche qui n'a jamais touché au domaine — un personnage sans
   * magie de Terre n'a rien à y ranger.
   */
  earthMaterials?: EarthMaterialTraining;
  /**
   * Maîtrises d'armes AJOUTÉES à la main, en plus de celles que la classe
   * accorde (cf. `ClassDef.weaponProficiencies`). Un guerrier qui a passé
   * l'hiver chez un maître de hache l'apprend sans changer de classe : la
   * table le décide, la fiche l'enregistre.
   *
   * On ne stocke que l'écart — jamais la liste complète — pour que retoucher
   * `classes.json` continue de profiter aux fiches déjà écrites. Contient des
   * clés de `weapon_category.json` quand la saisie correspond à une catégorie
   * connue, sinon le texte libre tel qu'écrit.
   */
  extraWeaponProficiencies?: string[];
  /** Maîtrises d'armures ajoutées à la main (clés de `armor_category.json` ou texte libre). */
  extraArmorProficiencies?: string[];
  /**
   * Écart de bourse par rapport au tirage du background. L'or de départ reste
   * dérivé du background et de la graine (cf. `computeGold`) ; ce champ porte
   * tout ce que la partie y ajoute ou en retire. Stocker l'écart plutôt qu'un
   * montant absolu garde le lien avec le tirage : changer de background ou
   * relancer les dés met la base à jour sans effacer les gains de la campagne.
   */
  goldDelta: number;
  /** Le « sac » : objets transportés. */
  inventory: InventoryItem[];
  /** Équipement porté, indexé par emplacement (cf. EQUIPMENT_SLOTS). */
  equipment: Record<string, string>;
  notes: string;
}

/** Enveloppe persistée renvoyée par l'API. */
export interface StoredSheet {
  id: string;
  userId: string;
  data: CharacterSheet;
  createdAt: string;
  updatedAt: string;
}

/** Vue allégée pour la liste des fiches. */
/**
 * Ce qu'un personnage sait des matériaux de Terre.
 *
 * Trois degrés, du plus fort au plus faible : ÉTUDIÉ (on le conjure n'importe
 * où, stable), CONNU (vu et touché une fois — on peut l'improviser, cher et
 * fragile), et le reste, hors d'atteinte. Ce qui se trouve sous les pieds
 * n'entre dans aucun des trois : le sol se manipule sans rien avoir appris.
 */
export interface EarthMaterialTraining {
  /**
   * Matériaux étudiés. Une place par palier de maîtrise seulement (niveaux
   * 1, 5, 9, 13, 17), donc cinq au maximum sur une carrière : l'étude est une
   * activité de repos long face à un échantillon, pas un point à dépenser.
   */
  studied: string[];
  /**
   * Matériaux VUS ET TOUCHÉS sans avoir été étudiés. Un simple contact visuel
   * ne suffit pas. C'est le filet de secours, pas une seconde liste d'étude.
   */
  known?: string[];
  /**
   * Le matériau que le lanceur porte en tête aujourd'hui. Se change au repos ;
   * en changer en plein combat coûte une action bonus et du mana.
   */
  equipped?: string;
}

export interface CharacterSheetSummary {
  id: string;
  name: string;
  race: string;
  updatedAt: string;
  /** Image du personnage (corps entier ou portrait) pour le catalogue. */
  image?: string;
}

/* ── Datasets chargés depuis /resources/json/characters/*.json ── */

/** Paire clé/valeur utilisée dans les datasets (attributs, stats, effets). */
export interface StatKV {
  key: string;
  value: number;
}

/** Un trait accordé par la race ou la sous-race. `effects` (optionnel) liste les
 *  bonus/malus chiffrés appliqués aux stats ; `icon` est un tracé SVG optionnel. */
export interface TraitDef {
  key: string;
  name: string;
  description?: string;
  icon?: string;
  effects?: StatKV[];
}

export interface SubraceDef {
  key: string;
  name: string;
  attributes?: StatKV[];
  /** Sous-backgrounds : slug de l'arme de départ (cf. weapons/*). La tenue de
   *  départ est, elle, déduite de `key` (= slug du set d'armure correspondant). */
  startingWeapon?: string;
  /**
   * Sous-backgrounds : slugs du matériel de départ (équipement, potions,
   * ressources — toute collection proposée à l'inventaire). Un sac à dos de la
   * liste est équipé dans son emplacement, le reste rejoint l'inventaire.
   */
  startingItems?: string[];
}

export interface RaceDef {
  key: string;
  name: string;
  subraces: SubraceDef[];
  attributes?: StatKV[];
  'genetics-stats'?: StatKV[];
}

export interface BackgroundDef {
  key: string;
  name: string;
  subbackgrounds: SubraceDef[];
  /** Compétences accordées (+valeur) par le background. */
  subattributes?: StatKV[];
  /** Bornes de l'or de départ accordé par le background. */
  min_money?: number;
  max_money?: number;
}

/**
 * Bloc de combat d'une compétence de classe.
 *
 * Mêmes noms de champs que `SpellNodeStats` (cf. wiki.types) pour que les deux
 * se convertissent de la même façon en capacité jouable. Les types y sont
 * volontairement structurels plutôt qu'importés : ce module décrit le
 * personnage et ne doit pas dépendre du wiki.
 */
export interface ClassSkillCombat {
  /** Dégâts de base (forme simple, un seul type). */
  damageMin?: number;
  damageMax?: number;
  /** Dégâts multi-coups : une entrée par frappe de l'enchaînement. */
  damages?: { min: number; max: number; type?: string }[];
  /** Type de dégâts (cf. damage_type.json). `true` = ignore les défenses. */
  damageType?: string;
  /** Contributions de scaling : ajoute `ratio × valeur(source)`. */
  scaling?: { source: string; ratio: number; affects?: string }[];
  heal?: number;
  /** Mana rendu à la cible. */
  restoreMana?: number;
  /** Portée écrite comme sur une fiche de sort (« Contact », « 24 m »). */
  range?: string;
  /** Zone d'effet (« Cible unique », « Rayon 6 m », « 3 cibles »). */
  area?: string;
  targets?: ('enemy' | 'ally' | 'self' | 'everyone')[];
  /** Durée en tours des effets posés. */
  duration?: number;
  /** Bonus/malus de stats (magnitude positive ; le sens vient de la cible). */
  effects?: { stat: string; value: number }[];
  /** Statuts infligés à l'impact, avec leur chance (0–100). */
  inflicts?: { status: string; chance: number; duration?: number }[];
  /** Statuts levés par la compétence. */
  cleanses?: string[];
  /** Chance d'annuler complètement une attaque subie, tant que l'effet dure. */
  evadeChance?: number;
  /**
   * Enchaînement de coups de poing : la compétence répète l'attaque à mains
   * nues autant de fois. Elle n'a alors pas de dégâts propres — sa puissance
   * suit celle du poing, buffs de poing compris.
   */
  unarmedStrikes?: number;
  /**
   * Part d'attaque de CHAQUE coup de l'enchaînement, quand elle diffère du
   * poing isolé.
   *
   * Indispensable parce que, dans cet univers, l'attaque physique dépasse les
   * points de vie à niveau égal : trois poings pleins tuent mécaniquement un
   * pair, quel que soit le réglage du poing. Ce champ règle donc la puissance
   * de l'enchaînement sans toucher à celle du coup isolé — les deux ne peuvent
   * pas partager le même curseur.
   */
  unarmedStrikeRatio?: number;
  /**
   * Enchantement posé pour la durée de l'effet : dégâts ajoutés à chaque coup
   * porté avec les poings ou avec l'arme en main.
   */
  enchant?: {
    target: 'unarmed' | 'weapon';
    damageMin: number;
    damageMax?: number;
    damageType?: string;
    scaling?: { source: string; ratio: number }[];
  };
  /** Riposte : ce que subit un attaquant tant que l'effet est actif. */
  retaliate?: {
    trigger?: 'melee' | 'any';
    damageMin?: number;
    damageMax?: number;
    damageType?: string;
    inflicts?: { status: string; chance: number }[];
  };
  /** Ce que le lanceur paie de sa personne. */
  recoil?: {
    effects?: { stat: string; value: number }[];
    note?: string;
  };
}

/** Sort/compétence lié à une classe, débloqué à un niveau donné. */
export interface ClassSpell {
  name: string;
  /** Niveau requis pour le débloquer. */
  level: number;
  /** Coût en endurance à l'utilisation. */
  endurance: number;
  description: string;
  /**
   * Effet chiffré en combat. Absent pour une compétence hors combat (pister,
   * crocheter) : elle reste déclarable, sa description tient lieu de règle et
   * le MJ tranche.
   */
  combat?: ClassSkillCombat;
}

export interface ClassDef {
  key: string;
  name: string;
  stats?: StatKV[];
  /**
   * Points d'inspiration accordés **par niveau** (dépensés pour débloquer et
   * améliorer les sorts). Total = `inspirationPerLevel × niveau`. Ex. Pugiliste 1
   * (le plus bas), Mage 4 (le plus haut).
   */
  inspirationPerLevel?: number;
  /**
   * Catégories d'armes que la classe sait manier (clés de
   * `weapon_category.json`). Le bonus de maîtrise ne s'applique qu'à
   * celles-là : un mage qui empoigne une claymore la tient, mais il ne la
   * MAÎTRISE pas, et son entraînement ne lui sert à rien.
   *
   * Le pugiliste n'en a aucune : son arme, ce sont ses poings.
   */
  weaponProficiencies?: string[];
  /**
   * Catégories d'armure que la classe sait porter (clés de
   * `armor_category.json`). Une armure qu'on ne maîtrise pas se porte quand
   * même — mal : c'est un poids sur le dos, pas un entraînement.
   *
   * Le pugiliste n'en a aucune : il combat sans rien sur la peau.
   */
  armorProficiencies?: string[];
  /** Nombre de compétences à choisir pour cette classe. */
  skillChoices?: number;
  /** Clés des compétences sélectionnables pour cette classe. */
  skillOptions?: string[];
  /** Sorts/compétences de la classe, débloqués selon le niveau. */
  spells?: ClassSpell[];
}
