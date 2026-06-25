export interface CrossRef {
  ref: string;
  collection: WikiCollection;
  label: string;
}

export type WikiCollection =
  | 'domains'
  | 'bestiary'
  | 'artifacts'
  | 'potions'
  | 'rituals'
  | 'locations'
  | 'factions'
  | 'resources/fauna'
  | 'resources/flora'
  | 'resources/minerals'
  | 'resources/liquids'
  | 'resources/remains';

export interface SubdomainEntry {
  name: string;
  icon: string;
  description: string;
}

/** Un sort de base d'un domaine (cf. tableau `spells` des fichiers domains/*.json). */
export interface DomainSpellEntry {
  key: string;
  name: string;
  description: string;
  mana: number;
  /** Niveau requis pour débloquer le sort. */
  level: number;
  /** Sous-domaines auxquels le sort appartient. */
  subdomains: string[];
}

export interface DomainManifestation {
  name: string;
  icon: string;
  description: string;
}

export interface DomainAffinityEntry {
  domain: string;
  label: string;
  description: string;
}

export interface DomainAffinities {
  natural?: DomainAffinityEntry;
  harmonic?: DomainAffinityEntry;
  resistance?: DomainAffinityEntry;
  opposition?: DomainAffinityEntry;
}

export interface DomainCombination {
  /**
   * Nom de la combinaison nommée (= sous-domaine à part entière, ex. « Lave »).
   * Laissé vide pour une combinaison « basique » : un simple sort croisant des
   * sous-domaines existants, affiché parmi les sorts du domaine sans titre.
   */
  name: string;
  components: string[];
  spells?: DomainSpellEntry[];
}

export interface DomainEntry {
  name: string;
  icon: string;
  banner: string;
  'first-quote': string;
  'first-quote-author'?: string;
  'usage-quote': string;
  description?: string;
  subdomains: SubdomainEntry[];
  spells?: DomainSpellEntry[];
  manifestations?: DomainManifestation[];
  affinities?: DomainAffinities;
  teaching?: string;
  'magic-items-and-artifacts': CrossRef[];
  fauna: CrossRef[];
  flora: CrossRef[];
}

export interface BestiaryEntry {
  name: string;
  icon: string;
  banner: string;
  cr: number;
  type: string;
  size: string;
  domains: CrossRef[];
  loot: CrossRef[];
  habitat: CrossRef[];
}

export interface ArtifactEntry {
  name: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact';
  type: string;
  domains: CrossRef[];
  description: string;
}

/** Un ingrédient listé sur une fiche potion. */
export interface PotionIngredient {
  name: string;
  icon?: string;
  /** Quantité affichée, ex. « 1 unité », « 2 poignées », « 100 ml ». */
  quantity?: string;
  /** Courte note descriptive sous l'ingrédient. */
  note?: string;
  /** Lien optionnel vers la fiche de la ressource. */
  ref?: CrossRef;
}

/** Champ de la bande d'identité d'une potion (Type, Rareté, Poids, Valeur…). */
export interface PotionInfoField {
  /** Clé connue pilotant l'icône : 'type' | 'rarity' | 'weight' | 'value'. */
  key?: string;
  label: string;
  value: string;
}

/**
 * Étape de préparation : une chaîne pour une étape numérotée standard, ou un
 * objet pour marquer une étape facultative (affichée à part, non numérotée).
 */
export type PotionStep = string | { text: string; optional?: boolean };

export interface PotionEntry {
  name: string;
  /** Sous-titre, ex. « Potion rare ». */
  subtitle?: string;
  /** Illustration principale (fiole). */
  image: string;
  icon?: string;
  /** Paragraphes de description. */
  description: string[];
  /** Liste à puces des effets. */
  effects: string[];
  /** Effets secondaires éventuels (section optionnelle). */
  'secondary-effects'?: string[];
  /** Citation décorative + auteur. */
  quote?: string;
  'quote-author'?: string;
  /** Ingrédients avec quantités et notes. */
  ingredients: PotionIngredient[];
  /**
   * Étapes de préparation. Une chaîne simple = étape numérotée standard ;
   * un objet `{ text, optional: true }` = étape facultative (non numérotée).
   */
  preparation: PotionStep[];
  /** Bande d'identité (Type, Rareté, Poids, Valeur…). */
  info: PotionInfoField[];
  /** Notes des alchimistes (encart final). */
  notes?: string[];
  /** Références croisées groupées (domaines liés, lieux…). */
  references?: ResourceRefGroup[];
}

export interface RitualEntry {
  name: string;
  icon: string;
  level: number;
  domains: CrossRef[];
  components: CrossRef[];
  description: string;
}

export interface FaunaEntry {
  name: string;
  icon: string;
  banner: string;
  type: string;
  domains: CrossRef[];
  description: string;
}

export interface FloraEntry {
  name: string;
  icon: string;
  banner: string;
  type: string;
  domains: CrossRef[];
  description: string;
}

export interface MineralEntry {
  name: string;
  icon: string;
  banner: string;
  rarity: string;
  domains: CrossRef[];
  description: string;
}

export interface WikiIndexEntry {
  slug: string;
  name: string;
  icon: string;
}

/** Entrée légère listée sur la page index des ressources (un par fiche). */
export interface ResourceIndexEntry {
  slug: string;
  name: string;
  subtitle?: string;
  icon?: string;
  image?: string;
  rarity?: string;
  /** Sous-catégorie d'affichage (ex. potions : potion/elixir/tonique). */
  category?: string;
  /** Poids unitaire (pour l'inventaire des fiches de personnage). */
  weight?: number;
  /** Catégorie d'arme (armes uniquement) : pilote le maniement et les emplacements. */
  weaponCategory?: WeaponCategoryKey;
  /** Dégâts minimum / maximum (armes uniquement). */
  minDamage?: number;
  maxDamage?: number;
}

/* ──────────────────────────────────────────
   RESSOURCES NATURELLES (flore, minéraux…)
   Modèle de la fiche « ingrédient » illustrée
─────────────────────────────────────────── */

/** Un champ de la bande « Informations » (Type, Rareté, Habitat, Utilisation…). */
export interface ResourceInfoField {
  /** Clé connue qui pilote l'icône : 'type' | 'rarity' | 'habitat' | 'usage' (extensible). */
  key?: string;
  label: string;
  value: string;
}

/** Encart « Où en trouver » : illustration + paragraphes. */
export interface ResourceLocation {
  image?: string;
  paragraphs: string[];
}

/**
 * Groupe de références croisées vers d'autres pages du wiki.
 * Ex. { label: 'Utilisé dans', items: [<potions>] }, { label: 'Localisations', items: [<lieux>] }.
 * Le `collection` de chaque CrossRef pilote la destination (voir WikiLinkPipe) ;
 * ajouter un nouveau type de lien = 1 ligne dans le pipe, sans toucher au composant.
 */
export interface ResourceRefGroup {
  label: string;
  items: CrossRef[];
}

export interface ResourceEntry {
  name: string;
  /** Sous-titre sous le nom, ex. « Ingrédient de base ». */
  subtitle?: string;
  /** Illustration principale (gauche du hero). */
  image: string;
  /** Petit emblème optionnel à côté de la description (étoile, sceau…). */
  icon?: string;
  /** Paragraphes de la description (bloc encadré à droite). */
  description: string[];
  /** Bande « Informations » : 1 à 4 champs affichés en colonnes. */
  info: ResourceInfoField[];
  /** Liste à puces « Propriétés ». */
  properties: string[];
  /** Encart « Où en trouver ». */
  location?: ResourceLocation;
  /** Notes des alchimistes (encart final, optionnel). */
  notes?: string[];
  /**
   * Références croisées groupées vers d'autres pages (domaines, potions, lieux,
   * créatures d'origine…). Chaque groupe rend une section autonome.
   */
  references?: ResourceRefGroup[];
}

/* ──────────────────────────────────────────
   ARMES & ARMURES
   Fiche détaillée d'une arme ou d'une armure.
─────────────────────────────────────────── */

/** Clés de catégorie d'arme (alignées sur weapon_category.json). */
export type WeaponCategoryKey =
  | 'axe' | 'battleAxe' | 'claymore' | 'dagger' | 'greatsword'
  | 'handCrossbow' | 'crossbow' | 'katana' | 'shortBow' | 'longBow'
  | 'longsword' | 'mace' | 'rapier' | 'saber' | 'sling' | 'spear'
  | 'staff' | 'warhammer' | 'whip';

/** Attribut gouvernant un jet (aligné sur AttributeKey de la fiche personnage). */
export type WeaponAttribute =
  | 'force' | 'dexterite' | 'constitution' | 'intelligence' | 'sagesse' | 'charisme';

/**
 * Définition partagée d'une catégorie d'arme : tous les exemplaires d'une même
 * catégorie héritent de ces champs (type de dégâts, maniement, portée, attributs).
 * Catalogue : public/resources/json/weapon_category.json.
 */
export interface WeaponCategoryDef {
  id: number;
  key: WeaponCategoryKey;
  /** Libellé affiché (FR). */
  name: string;
  /** Type de dégâts (cf. damage_type.json → specific_damage_types). */
  damageType: string;
  /** Nombre de mains nécessaires pour manier l'arme. */
  handling: number;
  /** Portée d'engagement (ex. « Mêlée », « Mêlée (allonge) », « Distance »). */
  range: string;
  /** Attribut gouvernant la précision (toucher). */
  attributePrecision: WeaponAttribute;
  /** Attribut gouvernant les dégâts. */
  attributeDamage: WeaponAttribute;
  /** Coût en endurance d'une attaque avec une arme de cette catégorie. */
  enduranceCost: number;
}

/** Emplacement d'une pièce d'armure dans un set. */
export type ArmorSlot = 'head' | 'body' | 'legs' | 'feet' | 'shield';

/** Une pièce d'un set d'armure : protections propres, résistances héritées du set. */
export interface ArmorPiece {
  slot: ArmorSlot;
  /** Nom d'affichage optionnel (ex. « Heaume »). À défaut : libellé de l'emplacement. */
  label?: string;
  /** Points d'armure physique de la pièce. */
  physicalArmor: number;
  /** Points de protection magique de la pièce. */
  magicalProtection: number;
  /** Poids de la pièce (kg). */
  weight?: number;
}

/**
 * Une entrée d'armure = un set complet. Les résistances/faiblesses sont communes
 * à toutes les pièces ; chaque pièce porte ses propres valeurs de protection.
 */
export interface ArmorEntry {
  name: string;
  subtitle?: string;
  image?: string;
  icon?: string;
  description: string[];
  /** Types de dégâts auxquels le set résiste (cf. damage_type.json), communs aux pièces. */
  resistances?: string[];
  /** Types de dégâts auxquels le set est vulnérable, communs aux pièces. */
  weaknesses?: string[];
  /** Pièces du set, chacune avec ses valeurs de protection. */
  pieces: ArmorPiece[];
  /** Bande « Caractéristiques » : champs libres (rareté, poids total…). */
  info?: ResourceInfoField[];
  properties?: string[];
  notes?: string[];
}

export interface WeaponEntry {
  name: string;
  /** Sous-titre sous le nom, ex. « Lame à une main ». */
  subtitle?: string;
  /** Illustration principale (gauche du hero). */
  image?: string;
  /** Petit emblème optionnel à côté de la description. */
  icon?: string;
  /** Paragraphes de la description (bloc encadré à droite). */
  description: string[];
  /**
   * Catégorie d'arme : l'arme hérite des champs partagés de la catégorie
   * (type de dégâts, maniement, portée, attributs). Absent pour les armures.
   */
  weaponCategory?: WeaponCategoryKey;
  /** Dégâts minimum infligés par l'arme. */
  minDamage?: number;
  /** Dégâts maximum infligés par l'arme. */
  maxDamage?: number;
  /** Bande « Caractéristiques » : 1 à 4 champs affichés en colonnes. */
  info: ResourceInfoField[];
  /** Liste à puces « Propriétés ». */
  properties?: string[];
  /** Notes du forgeron (encart final, optionnel). */
  notes?: string[];
}

/**
 * Un projectile ou une munition (flèches, carreaux, billes de fronde…).
 * Se consomme avec une arme à distance compatible.
 */
export interface AmmunitionEntry {
  name: string;
  subtitle?: string;
  image?: string;
  icon?: string;
  description: string[];
  /** Type de dégâts du projectile (cf. damage_type.json). */
  damageType?: string;
  /** Bonus de dégâts ajouté à l'arme. */
  damageBonus?: number;
  /** Catégories d'armes capables de tirer cette munition. */
  compatibleWith?: WeaponCategoryKey[];
  /** Bande « Caractéristiques » : champs libres (lot, rareté…). */
  info?: ResourceInfoField[];
  properties?: string[];
  notes?: string[];
}