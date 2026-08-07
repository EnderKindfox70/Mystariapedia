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

/** Mode de calcul des stats issues de la montée de niveau de la classe. */
export type StatMode = 'random' | 'mean';

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
  /** Mode de calcul des stats : tirage aléatoire ou moyenne. */
  statMode: StatMode;
  /** Graine du tirage aléatoire — garde les stats stables entre les rendus. */
  statSeed: number;
  proficiencyBonus: number;
  /** Compétences choisies via la classe (clés). Le background en accorde d'autres
   *  automatiquement, en plus de celles-ci. */
  skills: string[];
  /** Sorts débloqués (appris) et équipés (loadout de combat) — cf. CharacterSpells. */
  spells: CharacterSpells;
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
  traits?: TraitDef[];
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
  traits?: TraitDef[];
  'genetics-stats'?: StatKV[];
}

export interface BackgroundDef {
  key: string;
  name: string;
  subbackgrounds: SubraceDef[];
  /** Compétences accordées (+valeur) par le background. */
  subattributes?: StatKV[];
  /** Traits accordés par le background. */
  traits?: TraitDef[];
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
  /** Nombre de compétences à choisir pour cette classe. */
  skillChoices?: number;
  /** Clés des compétences sélectionnables pour cette classe. */
  skillOptions?: string[];
  /** Sorts/compétences de la classe, débloqués selon le niveau. */
  spells?: ClassSpell[];
}
