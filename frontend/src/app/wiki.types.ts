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
  | 'peoples'
  | 'resources/fauna'
  | 'resources/flora'
  | 'resources/minerals'
  | 'resources/liquids'
  | 'resources/remains';

export interface SubdomainEntry {
  name: string;
  icon: string;
  description: string;
  /** Courte citation évoquant ce que l'aspect représente (affichée sur la carte). */
  quote?: string;
}

/** Cibles qu'un sort peut affecter. */
export type SpellTarget = 'enemy' | 'ally' | 'self' | 'everyone';

/**
 * Source de scaling d'une valeur : une stat de combat (atk_mag, atk_phy…) ou un
 * attribut (force, dexterite…). Alignée sur `StatKey | AttributeKey` de la fiche
 * de personnage — dupliquée ici pour ne pas coupler le wiki au module perso.
 */
export type SpellScalingSource =
  | 'atk_mag' | 'atk_phy' | 'def_mag' | 'def_phy'
  | 'hp' | 'mana' | 'endurance' | 'speed'
  | 'force' | 'dexterite' | 'constitution'
  | 'intelligence' | 'sagesse' | 'charisme';

/** Valeur cible d'une contribution de scaling. */
export type SpellScalingAffects = 'damage' | 'heal' | 'mana';

/** Ampleur qualitative d'un effet de buff/malus non chiffré. */
export type SpellEffectMagnitude = 'léger' | 'modéré' | 'fort';

/**
 * Modification d'une stat/attribut par un sort (buff sur soi/allié, malus sur
 * ennemi). Le sens (bonus ou pénalité) se déduit des `targets` du nœud.
 */
export interface SpellStatEffect {
  /** Stat de combat ou attribut affecté (speed, atk_phy, force…). */
  stat: SpellScalingSource;
  /** Valeur de base du bonus/malus (magnitude, toujours positive). */
  value?: number;
  /**
   * Scaling chiffré du bonus/malus : chaque entrée ajoute `ratio × valeur(source)`
   * à la valeur de base. Le champ `affects` de `SpellScaling` est ignoré ici
   * (le scaling porte sur cet effet précis).
   */
  scaling?: SpellScaling[];
  /** Ampleur qualitative, en repli quand la valeur n'est pas chiffrée. */
  magnitude?: SpellEffectMagnitude;
}

/** Contribution de scaling : ajoute `ratio × valeur(source)` à la valeur cible. */
export interface SpellScaling {
  source: SpellScalingSource;
  /** Multiplicateur appliqué à la valeur de la source. */
  ratio: number;
  /** Valeur affectée (par défaut : les dégâts). */
  affects?: SpellScalingAffects;
}

/** Application d'un statut par un nœud de sort, avec sa chance à l'impact. */
export interface SpellStatusApplication {
  /** Clé du statut infligé (cf. status_effects.json). */
  status: string;
  /** Chance d'infliger le statut si l'attaque touche (0–100 %). */
  chance: number;
  /** Durée en tours si elle diffère de la durée par défaut du statut. */
  duration?: number;
}

/**
 * Bonus accordé à un sort selon la classe du personnage. Le bonus peut être
 * purement statistique (`effects` / `scaling`) et/ou un changement de
 * fonctionnement décrit en toutes lettres (`description`).
 */
export interface SpellClassBonus {
  /** Clé de la classe concernée (cf. classes.json : warrior, mage, pugilist…). */
  class: string;
  /** Description du bonus (indispensable pour les changements de fonctionnement). */
  description: string;
  /** Modificateurs de stats chiffrés éventuels. */
  effects?: SpellStatEffect[];
  /** Scaling additionnel éventuel (ex. ratio de dégâts accru pour la classe). */
  scaling?: SpellScaling[];
  /**
   * Facteur multiplicatif sur le coût en mana du sort pour cette classe
   * (ex. 0.5 = coût divisé par deux).
   */
  manaFactor?: number;
}

/**
 * Contre-coup : ce que le lanceur subit en retour du sort — des dégâts qu'il
 * s'inflige et/ou un malus de stat le temps de l'effet (ex. une armure lourde
 * qui ralentit son porteur).
 */
export interface SpellRecoil {
  /** Dégâts subis par le lanceur (min). Absent si le contre-coup est purement statistique. */
  damageMin?: number;
  /** Dégâts subis par le lanceur (max, si différent du min). */
  damageMax?: number;
  /** Scaling éventuel du contre-coup. */
  scaling?: SpellScaling[];
  /**
   * Malus de stats subis par le lanceur tant que le sort est actif. La `value`
   * est une magnitude positive : le signe négatif est ajouté à l'affichage.
   */
  effects?: SpellStatEffect[];
  /** Précision affichée (ex. « à la main »). */
  note?: string;
}

/**
 * Riposte défensive (« épines ») d'un buff : tant que le buff est actif, un
 * attaquant qui touche le lanceur subit un statut et/ou des dégâts en retour.
 */
export interface SpellRetaliate {
  /** Déclencheur : au corps-à-corps (`melee`, défaut) ou sur toute attaque (`any`). */
  trigger?: 'melee' | 'any';
  /** Statut(s) renvoyé(s) à l'attaquant (avec % de chance). */
  inflicts?: SpellStatusApplication[];
  /** Dégâts renvoyés à l'attaquant (min). */
  damageMin?: number;
  /** Dégâts renvoyés à l'attaquant (max, si différent du min). */
  damageMax?: number;
  /** Type des dégâts renvoyés (cf. damage_type.json). */
  damageType?: string;
  /** Scaling éventuel des dégâts renvoyés. */
  scaling?: SpellScaling[];
}

/**
 * Une composante de dégâts d'un nœud : un montant min/max, son type spécifique
 * et un scaling propre. Permet de scinder un sort en plusieurs types (ex. Éclipse
 * = lumière + ténèbres), chaque composante étant calculée et affichée séparément.
 */
export interface SpellDamage {
  min: number;
  max: number;
  /** Type de dégâts de la composante (cf. damage_type.json). À défaut : type du sort/domaine. */
  type?: string;
  /** Scaling propre à cette composante (ajouté à ses dégâts). */
  scaling?: SpellScaling[];
}

/**
 * Dégâts en pourcentage des PV de la cible (ignore les défenses). Une même stat
 * peut porter les deux formes (% PV max et % PV actuels) : elles sont déclarées
 * dans deux champs séparés de `SpellNodeStats`. Le scaling `affects:'damage'` du
 * nœud ajoute des points de pourcentage.
 */
export interface SpellPercentDamage {
  min: number;
  /** Borne haute si différente du min. */
  max?: number;
}

/**
 * Un choix sélectionnable d'un sort à options. Le lanceur en choisit UN à
 * l'incantation ; la liste s'étoffe souvent au fil des paliers. Chaque choix
 * porte son propre jeu d'effets, ce qui rend le mécanisme réutilisable au-delà
 * des « ordres » : Verbe d'autorité (« Halte ! », « Fuis ! » → statuts), mais
 * aussi p. ex. Symbiose végétale (une plante par choix, chacune à l'effet
 * distinct : dégâts, soin, buff…).
 */
export interface SpellChoice {
  /** Libellé du choix (ordre, nom de plante, mode…). */
  name: string;
  /** Effet du choix, en clair. */
  description?: string;
  /**
   * Coût en mana propre au choix : le prix du sort peut dépendre de l'option
   * choisie. À défaut, le `mana` du nœud s'applique.
   */
  mana?: number;
  /** Dégâts de base propres au choix (forme simple, un seul type). */
  damageMin?: number;
  damageMax?: number;
  /** Type de dégâts du choix (cf. damage_type.json). À défaut : type du nœud/sort. */
  damageType?: string;
  /** Soin propre au choix. */
  heal?: number;
  /** Modifications de stats/attributs propres au choix (buff/malus). */
  effects?: SpellStatEffect[];
  /** Statut(s) infligé(s) par le choix (avec % de chance). */
  inflicts?: SpellStatusApplication[];
  /** Contre-coup : dégâts que le lanceur s'inflige en optant pour ce choix. */
  recoil?: SpellRecoil;
  /** Durée propre au choix, en tours (le cas échéant). */
  duration?: number;
}

/** Bloc de statistiques explicites d'un nœud de progression. */
export interface SpellNodeStats {
  /** Dégâts de base (min/max) — forme simple, un seul type. Absent pour un sort non offensif. */
  damageMin?: number;
  damageMax?: number;
  /**
   * Dégâts multi-composantes : plusieurs montants, chacun de son type. Prioritaire
   * sur `damageMin/damageMax` quand présent (ex. 7–9 lumière + 7–9 ténèbres).
   */
  damages?: SpellDamage[];
  /** Soin de base (sorts de soutien). */
  heal?: number;
  /**
   * Dégâts en % des PV **max** de la cible (ignore les défenses), au lieu de
   * dégâts fixes. Le scaling `affects: 'damage'` ajoute des points de pourcentage.
   */
  damagePercentMaxHp?: SpellPercentDamage;
  /**
   * Dégâts en % des PV **actuels** de la cible (ignore les défenses). Peut coexister
   * avec `damagePercentMaxHp` (les deux composantes s'affichent séparément).
   */
  damagePercentCurrentHp?: SpellPercentDamage;
  /**
   * Type de dégâts spécifique du nœud (cf. damage_type.json : fire, ice, dark…).
   * Surcharge le type du sort ; à défaut, dérivé du domaine.
   */
  damageType?: string;
  /** Contre-coup : dégâts que le lanceur s'inflige en lançant le sort. */
  recoil?: SpellRecoil;
  /** Coût en mana pour lancer le sort à ce palier. */
  mana: number;
  /** Portée d'atteinte, ex. « 8 m », « Contact ». */
  range?: string;
  /** Zone d'effet, ex. « Cible unique », « Rayon 3 m ». */
  area?: string;
  /** Cibles que le sort peut affecter. */
  targets?: SpellTarget[];
  /** Météo invoquée par le sort (cf. weathers.json : storm, blizzard, rain…). */
  weather?: string;
  /** Durée de base de l'effet, en tours (buffs, altérations, dégâts sur la durée). */
  duration?: number;
  /** Scaling chiffré de la durée : chaque entrée ajoute `ratio × valeur(source)` aux tours. */
  durationScaling?: SpellScaling[];
  /** Modifications de stats/attributs (buff sur soi/allié, malus sur ennemi). */
  effects?: SpellStatEffect[];
  /** Statuts que le sort peut infliger à l'impact (avec % de chance). */
  inflicts?: SpellStatusApplication[];
  /** Riposte défensive : un attaquant subit un effet en retour tant que le buff est actif. */
  retaliate?: SpellRetaliate;
  /**
   * Statuts purifiés tant que le buff est actif : ils sont levés à l'incantation
   * et ne peuvent pas se réinstaller. Clés de `status_effects.json`.
   */
  cleanses?: string[];
  /** Chance (0–100 %) d'annuler complètement une attaque subie tant que le buff est actif. */
  evadeChance?: number;
  /**
   * Choix sélectionnables (sorts à options). Le lanceur en choisit UN ; la liste
   * s'étoffe souvent au fil des paliers. Chaque choix a ses propres effets
   * (ex. Verbe d'autorité, Symbiose végétale).
   */
  choices?: SpellChoice[];
  /** Bonus selon la classe du lanceur (stats et/ou changement de fonctionnement). */
  classBonuses?: SpellClassBonus[];
  /** Contributions de scaling (stats de combat / attributs). */
  scaling?: SpellScaling[];
}

/* ──────────────────────────────────────────
   CATALOGUE DES EFFETS DE STATUT
   Source : public/resources/json/status_effects.json
─────────────────────────────────────────── */

export type StatusCategory = 'dot' | 'control' | 'debuff' | 'mental' | 'buff';

/** Effet par tour d'un statut (dégâts ou soin, avec scaling éventuel). */
export interface StatusTick {
  damage?: number;
  heal?: number;
  scaling?: SpellScaling[];
  /**
   * Dégâts par tour exprimés en pourcentage des PV max de la cible.
   * Un tableau décrit une rampe (une valeur par tour, la dernière se répète
   * quand le statut dure plus longtemps que le tableau). Ex. `[3, 5, 7]`.
   */
  percentMaxHp?: number | number[];
}

/** Attributs pouvant être testés par un jet de statut. */
export type StatusSaveAttribute =
  | 'force' | 'dexterite' | 'constitution'
  | 'intelligence' | 'sagesse' | 'charisme';

/**
 * Jet d'attribut imposé par un statut. Sa réussite lève le statut (`clear`)
 * ou permet à la cible d'agir malgré lui (`act`).
 */
export interface StatusSave {
  /** Attribut testé (constitution, sagesse…). */
  attribute: StatusSaveAttribute;
  /**
   * Score de base à atteindre pour réussir le jet (DC). C'est la référence
   * minimale du statut ; certains sorts et traits peuvent l'élever pour rendre
   * l'effet plus tenace.
   */
  dc: number;
  /**
   * Déclencheur du jet : `turn` = automatiquement au fil des tours (voir
   * `interval`) ; `action` = seulement lorsque la cible tente d'agir.
   */
  trigger: 'turn' | 'action';
  /** Périodicité du jet en tours quand `trigger` vaut `turn` (1 = chaque tour). */
  interval?: number;
  /** Conséquence d'une réussite : `clear` lève le statut, `act` autorise l'action. */
  onSuccess: 'clear' | 'act';
  /** Formulation lisible du jet et de son effet. */
  description: string;
}

/** Un effet de statut du catalogue (brûlure, poison, paralysie…). */
export interface StatusEffect {
  id: number;
  key: string;
  name: string;
  icon: string;
  category: StatusCategory;
  /** Type de dégâts par tour (DoT uniquement). */
  damageType?: string;
  description: string;
  /** Effet mécanique résumé. */
  effect: string;
  /** Effet par tour (DoT / régénération), ou absent. */
  tick?: StatusTick | null;
  /**
   * Réduction des soins reçus tant que le statut est actif (0–1 ; 0.5 = −50 %,
   * 1 = aucun soin possible). Absent = pas d'anti-soin.
   */
  healReduction?: number;
  /** Jet d'attribut imposé par le statut (purge ou action), ou absent. */
  save?: StatusSave;
  /** Modificateurs de stats appliqués tant que le statut est actif. */
  statEffects: SpellStatEffect[];
  preventsAction: boolean;
  preventsMovement: boolean;
  preventsCasting: boolean;
  /** Durée par défaut, en tours. */
  defaultDuration: number;
  stackable: boolean;
  /** Types de dégâts auxquels la créature devient vulnérable (cf. damage_type.json). */
  weaknesses?: string[];
  /** Types de dégâts auxquels la créature devient résistante. */
  resistances?: string[];
  /** Comment le statut prend fin. */
  ends: string;
}

/* ──────────────────────────────────────────
   MÉTÉOS
   Source : public/resources/json/weathers.json
─────────────────────────────────────────── */

/** Dégâts aléatoires infligés par une météo à chaque tour. */
export interface WeatherRandomDamage {
  type: string;
  min: number;
  max: number;
  /** Chance (%) d'infliger les dégâts à un tour donné. */
  chance: number;
}

/** Modificateur de coût en mana d'un domaine sous une météo (facteur multiplicatif). */
export interface WeatherCostModifier {
  domain: string;
  /** Facteur appliqué au coût (0.5 = coût réduit de moitié, 1.5 = +50 %). */
  factor: number;
}

/** Une météo invocable, avec ses effets de zone. */
export interface Weather {
  id: number;
  key: string;
  name: string;
  icon: string;
  description: string;
  /** Statuts appliqués aux créatures présentes (cf. status_effects.json). */
  appliesStatus: string[];
  /** Dégâts aléatoires par tour, ou absent. */
  randomDamage?: WeatherRandomDamage | null;
  /** Modificateurs de coût en mana des sorts, par domaine. */
  costModifiers?: WeatherCostModifier[];
  /** Modificateurs de dégâts des sorts, par domaine (facteur multiplicatif). */
  damageModifiers?: WeatherCostModifier[];
  /** Durée par défaut, en tours. */
  defaultDuration: number;
}

/** Un nœud de l'arbre d'amélioration d'un sort (valeurs explicites). */
export interface SpellNode {
  /** Identifiant unique dans l'arbre. */
  id: string;
  /** Palier de progression (1 = sort de base). */
  tier: number;
  /** Nom du palier d'amélioration. */
  name: string;
  /** Ce que ce palier apporte (texte court). */
  description?: string;
  /**
   * Utilité de ce palier selon le contexte (combat / hors combat). Surcharge
   * l'`usage` du sort : si un champ est absent, le texte du sort sert de repli.
   * Permet de montrer comment l'évolution du sort change l'effet dans chaque
   * contexte (l'un peut évoluer sans l'autre).
   */
  usage?: SpellUsage;
  /** Clé de branche à laquelle le nœud appartient (coloration / regroupement). */
  branch?: string;
  /** Statistiques absolues du sort à ce nœud. */
  stats: SpellNodeStats;
  /** Nœuds enfants (plusieurs = point d'embranchement). */
  next?: string[];
}

/** Une branche nommée de l'arbre (après un point de scission). */
export interface SpellBranch {
  id: string;
  label: string;
  description?: string;
}

/** Arbre d'amélioration d'un sort : progression paliers + embranchements. */
export interface SpellProgression {
  /** id du nœud racine (palier 1). */
  root: string;
  /** Tous les nœuds de l'arbre. */
  nodes: SpellNode[];
  /** Libellés des branches, pour l'affichage. */
  branches?: SpellBranch[];
}

/**
 * Utilité d'un sort selon le contexte. Tout sort n'a pas foncièrement un effet
 * en combat ET hors combat : certains ne servent qu'à l'un des deux (ex. Luciole
 * n'a aucun effet en combat ; Braises fait des dégâts en combat et permet
 * d'allumer un feu hors combat). Un champ absent = aucune utilité dans ce contexte.
 */
export interface SpellUsage {
  /** Ce que fait le sort en combat. Absent = aucun effet notable en combat. */
  combat?: string;
  /** Utilité hors combat (exploration, quotidien, RP). Absent = aucune. */
  outOfCombat?: string;
}

/** Un sort de base d'un domaine (cf. tableau `spells` des fichiers domains/*.json). */
export interface DomainSpellEntry {
  key: string;
  name: string;
  description: string;
  /**
   * Utilité du sort selon le contexte (combat / hors combat). Optionnel : à
   * défaut, seule la `description` générale renseigne sur l'usage.
   */
  usage?: SpellUsage;
  mana: number;
  /** Niveau requis pour débloquer le sort. */
  level: number;
  /** Icône du sort (généralement celle de son sous-domaine). */
  icon?: string;
  /** Sous-domaines auxquels le sort appartient. */
  subdomains: string[];
  /**
   * Type de dégâts par défaut du sort (cf. damage_type.json : fire, ice, dark…).
   * À défaut, dérivé du domaine ; surchargeable par nœud.
   */
  damageType?: string;
  /** Météo invoquée par le sort (cf. weathers.json) ; surchargeable par nœud. */
  weather?: string;
  /**
   * Clés des sorts requis pour débloquer celui-ci (prérequis d'arbre de sorts).
   * La relation inverse (« débloque ») est dérivée automatiquement.
   */
  requires?: string[];
  /** Arbre d'amélioration interactif (optionnel : absent = fiche simple). */
  progression?: SpellProgression;
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

/**
 * Données d'une page de sort auto-générée (`/magics/spell/:key`).
 * Dérivée de la source unique : le sort provient soit d'un domaine (sort
 * élémentaire), soit de la liste des combinaisons (sort de combinaison).
 */
export interface SpellPageData {
  /** Le sort lui-même (clé = slug de la page). */
  spell: DomainSpellEntry;
  /** Origine du sort : élémentaire (un domaine) ou combinaison (2+ domaines). */
  kind: 'domain' | 'combination';
  /** Slugs des domaines dont provient le sort (1 = élémentaire, 2+ = combinaison). */
  domains: string[];
  /** Nom de la combinaison nommée, si le sort en provient (ex. « Lave »). */
  comboName?: string;
  /**
   * Icône effective du sort : son `icon` propre, sinon celle de son sous-domaine
   * (repli résolu via la liste `subdomains` du domaine). `''` si aucune.
   */
  icon: string;
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

/** Chapitres du codex du bestiaire (un onglet = un chapitre). */
export type BestiaryChapter =
  | 'communes'
  | 'rares'
  | 'legendaires'
  | 'entites'
  | 'mutations'
  | 'archives';

/**
 * Ligne de `bestiary/index.json` : tout ce qu'il faut pour dessiner une
 * vignette de folio, sans charger la fiche complète.
 */
export interface BestiaryIndexEntry {
  slug: string;
  name: string;
  chapter: BestiaryChapter;
  /** Vignette carrée. À défaut, le folio affiche un glyphe. */
  icon?: string;
  cr: number;
  /** Type d'entité, référencé par son id dans `entity_type.json`. */
  entityTypeId: number;
  /** Ex. « TP », « P », « M », « G », « TG ». */
  size: string;
  /** Clés de domaine (`fire`, `darkness`…) pilotant la teinte des pastilles. */
  domains?: string[];
  /** Accroche d'une ligne affichée sous la bande d'identité. */
  teaser?: string;
}

/** Les cinq stats de combat portées par un type d'entité (`entity_type.json`). */
export type BestiaryStatKey = 'hp' | 'physical_atk' | 'magical_atk' | 'mana' | 'speed';

/** Un groupe d'affinités de la fiche. */
export interface BestiaryAffinityGroup {
  kind: 'immunities' | 'resistances' | 'weaknesses' | 'absorptions';
  /** Types de dégâts, référencés par leur id dans `damage_type.json`. */
  damageTypeIds: number[];
}

/**
 * Une caractéristique de la fiche. Le modificateur n'est pas stocké : il se
 * déduit du score par la formule commune (`abilityModifier`), donc il ne peut
 * pas diverger de la valeur qu'il est censé refléter.
 */
export interface BestiaryAttribute {
  label: string;
  shortLabel: string;
  value: number;
}

/**
 * Fiche complète, chargée à la demande depuis `bestiary/<slug>.json` quand on
 * ouvre le chapitre d'une créature.
 */
export interface BestiaryEntry extends BestiaryIndexEntry {
  banner?: string;
  quote?: string;
  'quote-author'?: string;
  /** Paragraphes de description (page de gauche). */
  description: string[];
  /** Ex. « Carnivore, meute, nocturne ». */
  behaviour?: string;
  /** Traits, référencés par leur id dans `trait.json`. */
  traitIds?: number[];
  /**
   * Bonus de stats propres à la créature, ajoutés à la base de son type
   * (cf. `entity_type.json`). Absent = aucun bonus. Le total affiché n'est
   * jamais stocké : il se recompose toujours depuis le type + ces bonus.
   */
  statBonuses?: Partial<Record<BestiaryStatKey, number>>;
  attributes?: BestiaryAttribute[];
  affinities?: BestiaryAffinityGroup[];
  loot?: CrossRef[];
  habitat?: CrossRef[];
  /** Fréquence de rencontre, ex. « Rare », « Commune en hiver ». */
  frequency?: string;
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

/* ──────────────────────────────────────────
   PEUPLES (races jouables)
   Page lore /lore/peuples + fiche JDR /lore/peuples/:slug
─────────────────────────────────────────── */

/** Un trait racial (aspect « jeu/JDR » d'un peuple). */
export interface PeopleTrait {
  name: string;
  description: string;
  icon?: string;
}

/** Affinité magique privilégiée d'un peuple : lien vers le domaine concerné. */
export interface PeopleAffinity {
  /** Slug du domaine (cf. domains.catalog : fire, water, earth…). Pilote couleur et lien. */
  domain: string;
  /** Note expliquant l'affinité (origine, fréquence…). */
  note?: string;
}

/**
 * Fiche LORE d'un peuple : introduction narrative, identité, traits de saveur et
 * affinités magiques (dérivées des répartitions de domaines de la page Magie).
 *
 * Les données de JEU (modificateurs d'attributs, sous-races, traits mécaniques,
 * stats de départ) ne sont PAS dupliquées ici : elles proviennent de la source
 * unique `characters/races.json`, reliée via `raceKey` du catalogue des peuples.
 */
export interface PeopleEntry {
  name: string;
  /** Sous-titre, ex. « Peuple des profondeurs ». */
  subtitle?: string;
  icon?: string;
  banner?: string;
  /** Illustration principale du peuple (optionnelle). */
  image?: string;
  quote?: string;
  'quote-author'?: string;
  /** Paragraphes d'introduction lore. */
  description: string[];
  /** Bande d'identité : espérance de vie, taille, habitat, société… */
  info: ResourceInfoField[];
  /** Traits de saveur (narratif) — le mécanique vient de races.json. */
  traits: PeopleTrait[];
  /** Domaines magiques privilégiés (liens vers /magics/<domain>). */
  affinities?: PeopleAffinity[];
  /** Notes / encart final. */
  notes?: string[];
  /** Références croisées (lieux d'origine, factions liées…). */
  references?: ResourceRefGroup[];
}