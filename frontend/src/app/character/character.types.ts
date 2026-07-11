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
  /** Niveau du personnage (1 à 20). */
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

/** Sort/compétence lié à une classe, débloqué à un niveau donné. */
export interface ClassSpell {
  name: string;
  /** Niveau requis pour le débloquer. */
  level: number;
  /** Coût en endurance à l'utilisation. */
  endurance: number;
  description: string;
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
