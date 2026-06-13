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
  spells: string[];
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
  name: string;
  components: string[];
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
  /** Étapes de préparation numérotées. */
  preparation: string[];
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
  /**
   * Références croisées groupées vers d'autres pages (domaines, potions, lieux,
   * créatures d'origine…). Chaque groupe rend une section autonome.
   */
  references?: ResourceRefGroup[];
}