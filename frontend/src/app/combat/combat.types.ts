import { AttributeKey, StatKey } from '../character/character.types';
import { SpellRetaliate, SpellScalingSource, SpellTarget } from '../wiki.types';
import { TerrainMap } from './terrain';

/* ──────────────────────────────────────────────────────────────────────────
   MODÈLE DE LA SIMULATION DE COMBAT

   Rien ici ne dépend d'Angular : le moteur (`rules.ts`) est du TypeScript pur,
   testable et déterministe. La vue n'est qu'un pilote au-dessus.

   Invariant central : une rencontre est **rejouable**. Tout l'aléatoire passe
   par (`seed`, `rollCount`) — deux valeurs sérialisées avec la rencontre — donc
   recharger une partie sauvegardée redonne exactement les mêmes jets.
─────────────────────────────────────────────────────────────────────────── */

/** Côté de la grille sur lequel un combattant se bat. */
export type Team = 'allies' | 'ennemis' | 'neutres';

/** Case entière de la grille tactique (origine en haut à gauche). */
export interface GridPos {
  x: number;
  y: number;
}

/**
 * D'où vient un combattant. Sert à rafraîchir sa fiche (les stats sont figées à
 * l'ajout : monter de niveau en pleine bagarre n'a pas de sens) et à afficher un
 * lien vers la page d'origine.
 */
export type CombatantOrigin =
  | { kind: 'sheet'; sheetId: string }
  | { kind: 'bestiary'; slug: string }
  | { kind: 'custom' };

/** Affinités aux types de dégâts, par clé de `damage_type.json` (fire, ice…). */
export interface Affinities {
  immunities: string[];
  resistances: string[];
  weaknesses: string[];
  /** Types soignant la cible au lieu de la blesser. */
  absorptions: string[];
}

/* ── Capacités ─────────────────────────────────────────────────────────────
   Arme, sort ou attaque naturelle : le moteur ne connaît que cette forme
   normalisée. `combatant-factory.ts` traduit les sources hétérogènes (fiche de
   perso, JSON de sort, entrée de bestiaire) vers elle.
─────────────────────────────────────────────────────────────────────────── */

/** Contribution de scaling résolue : ajoute `ratio × valeur(source)`. */
export interface AbilityScaling {
  source: SpellScalingSource;
  ratio: number;
}

/** Une composante de dégâts : un intervalle, un type, son scaling propre. */
export interface AbilityDamage {
  min: number;
  max: number;
  /** Clé de `damage_type.json` (fire, slashing…). */
  type: string;
  scaling?: AbilityScaling[];
}

/** Forme de la zone touchée par une capacité. */
export type AbilityShape =
  | { kind: 'single' }
  | { kind: 'self' }
  /** Rayon en mètres autour du point visé. */
  | { kind: 'radius'; meters: number }
  /** Cône partant du lanceur vers le point visé. */
  | { kind: 'cone'; meters: number }
  /** Ligne droite du lanceur vers le point visé. */
  | { kind: 'line'; meters: number }
  /** Plusieurs cibles désignées une à une. */
  | { kind: 'targets'; count: number };

/** Modification de stat appliquée par une capacité (magnitude toujours positive). */
export interface AbilityStatMod {
  stat: SpellScalingSource;
  value: number;
  scaling?: AbilityScaling[];
}

/**
 * Enchantement d'arme ou de poing : tant qu'il dure, il **ajoute une composante
 * de dégâts à chaque coup** porté avec ce qu'il a nimbé.
 *
 * C'est une composante à part entière, pas un bonus plat : elle porte son
 * propre type, donc les résistances de la cible s'y appliquent correctement et
 * le journal la montre séparément. Des poings d'ombre ajoutent des ténèbres à
 * un coup contondant — les deux sont encaissés différemment.
 */
export interface CombatEnchant {
  /** Ce que l'enchantement nimbe : les poings, ou l'arme en main. */
  target: 'unarmed' | 'weapon';
  /** Ce qu'il ajoute à chaque coup. */
  damage: AbilityDamage;
}

/** Statut infligé à l'impact, avec sa chance et sa durée éventuelle. */
export interface AbilityStatus {
  /** Clé de `status_effects.json`. */
  status: string;
  /** Chance d'application si l'attaque touche (0–100). */
  chance: number;
  /** Durée en tours, si elle diffère de celle du catalogue. */
  duration?: number;
}

/** Contre-coup subi par le lanceur. */
export interface AbilityRecoil {
  min?: number;
  max?: number;
  type?: string;
  scaling?: AbilityScaling[];
  mods?: AbilityStatMod[];
  note?: string;
}

/**
 * Ce qu'une capacité retire du sac à chaque usage : une flèche pour un tir, une
 * fiole pour une potion. Le moteur refuse la capacité quand le stock est vide —
 * c'est ce qui rend le décompte réel plutôt que décoratif.
 */
export interface AbilityConsumption {
  /** Nom de la ligne d'inventaire consommée (correspondance exacte). */
  item: string;
  qty: number;
}

/**
 * Une action offensive/défensive utilisable en combat. Une arme, un palier de
 * sort et une morsure de loup produisent tous la même structure — le moteur n'a
 * donc qu'un seul chemin de résolution à maintenir.
 */
export interface CombatAbility {
  id: string;
  name: string;
  kind: 'weapon' | 'spell' | 'natural' | 'class' | 'item' | 'guard';
  /** Sous-titre affiché (nom du palier, catégorie d'arme…). */
  subtitle?: string;
  /** Slug de la page wiki correspondante, pour lier la fiche. */
  ref?: string;
  description?: string;

  /** Portée d'atteinte en mètres (0 = sur soi uniquement). */
  rangeMeters: number;
  /**
   * Rayon de gêne autour du tireur, en mètres. Une cible à l'intérieur rend le
   * tir désavantagé — l'arme est trop encombrante pour être servie de si près.
   * Absent ou 0 pour tout ce qui ne craint pas le corps à corps.
   */
  disadvantageMeters?: number;
  /** Zone d'effet. */
  shape: AbilityShape;
  /** Qui la capacité peut viser. */
  targets: SpellTarget[];

  /** Coût en mana (sorts) et en endurance (armes, capacités de classe). */
  manaCost: number;
  enduranceCost: number;
  /**
   * Endurance RENDUE par l'action — reprendre haleine. C'est ce qui donne au
   * combat son tempo : frapper vide la réserve, se couvrir la refait.
   */
  restoreEndurance?: number;
  /** Ce que l'usage retire du sac (munition, fiole), ou rien. */
  consumes?: AbilityConsumption;

  /** Mana rendu à la cible (potions de mana, méditation). */
  restoreMana?: number;
  /** Scaling du mana rendu, résolu contre le lanceur au moment de l'usage. */
  restoreManaScaling?: AbilityScaling[];
  /**
   * Effet non chiffré, à appliquer par le MJ. Les fiches de potions et de
   * compétences de classe décrivent leurs effets en toutes lettres sans les
   * chiffrer : plutôt que d'inventer des valeurs, on affiche le texte au
   * journal et le MJ tranche. Ce qui EST chiffré est résolu normalement.
   */
  manualEffects?: string[];

  damages: AbilityDamage[];
  /** Dégâts en % des PV max de la cible (ignorent la défense). */
  percentMaxHp?: { min: number; max: number };
  /** Dégâts en % des PV actuels de la cible (ignorent la défense). */
  percentCurrentHp?: { min: number; max: number };
  heal?: number;
  healScaling?: AbilityScaling[];

  /** Durée en tours des effets posés (buffs, malus). */
  duration?: number;
  /** Modificateurs de stats posés sur la cible (signe déduit de `targets`). */
  mods?: AbilityStatMod[];
  inflicts?: AbilityStatus[];
  /** Statuts levés (et bloqués) tant que l'effet dure. */
  cleanses?: string[];
  /** Chance d'esquive totale accordée tant que l'effet dure (0–100). */
  evadeChance?: number;
  retaliate?: SpellRetaliate;
  recoil?: AbilityRecoil;
  /** Météo invoquée (clé de `weathers.json`). */
  weather?: string;
  /**
   * Niveau auquel le sort s'apprend. C'est lui qui décide de l'érosion du
   * scaling : un vieux sort reste utile sans rester redoutable (cf.
   * `scalingFalloff`). Absent pour ce qui n'est pas un sort.
   */
  spellLevel?: number;

  /**
   * Domaines de magie dont relève la capacité. C'est par eux que la météo et
   * l'heure du jour la rendent plus forte ou plus chère.
   */
  domains?: string[];

  /**
   * Attribut servant au jet de toucher. À défaut : dextérité pour une arme,
   * intelligence pour un sort.
   */
  attackAttribute?: AttributeKey;
  /** `true` pour une capacité qui touche automatiquement (soins, buffs sur soi). */
  autoHit?: boolean;

  /**
   * La capacité frappe-t-elle **à mains nues** ? Seules celles-ci profitent des
   * enchantements de poing (`enchant`) : nimber ses poings ne rend pas une épée
   * plus tranchante.
   */
  unarmed?: boolean;
  /**
   * Enchantement accordé pour `duration` tours (sorts de revêtement, buffs de
   * poing). Il s'ajoute à CHAQUE coup porté avec ce qu'il nimbe — un
   * enchaînement de trois coups en profite trois fois.
   */
  enchant?: CombatEnchant;
  /**
   * La capacité déplace son lanceur sur la case visée, dans la limite de sa
   * portée. Une téléportation ignore le terrain et les combattants — c'est ce
   * qui, jouée en réaction, permet de sortir de l'allonge d'un assaillant avant
   * que son coup ne parte.
   */
  teleport?: boolean;
  /**
   * Distance franchissable par la téléportation, en mètres. Distincte de
   * `rangeMeters`, qui reste la portée de ce que le sort FAIT en arrivant.
   */
  teleportMeters?: number;
  /**
   * Déclencheurs auxquels la capacité peut répondre hors de son tour. Absent =
   * elle ne se joue qu'à son tour.
   */
  reaction?: ReactionTrigger[];
  /**
   * Le lanceur porte aussitôt une attaque gratuite, en plus de l'action —
   * typiquement le bonus de classe du pugiliste sur les revêtements de poings.
   * Elle ne coûte ni action, ni endurance, ni munition, et profite de
   * l'enchantement qui vient d'être posé.
   */
  freeStrike?: CombatEnchant['target'];
}

/* ── États temporaires portés par un combattant ───────────────────────────── */

/** Un statut du catalogue actif sur un combattant. */
export interface ActiveStatus {
  /** Clé de `status_effects.json`. */
  key: string;
  /** Tours restants (-1 = illimité, purgeable seulement par jet ou soin). */
  remaining: number;
  /** Cumuls, pour les statuts `stackable`. */
  stacks: number;
  /** Id du combattant qui l'a posé. */
  sourceId?: string;
  /**
   * Puissance du lanceur figée à l'application. Les dégâts par tour d'un DoT
   * scalent sur l'attaquant : les figer évite qu'un buff posé APRÈS l'incendie
   * ne ravive rétroactivement les flammes.
   */
  sourcePower: { atk_phy: number; atk_mag: number };
  /** Tours écoulés depuis l'application (périodicité des jets de sauvegarde). */
  age: number;
}

/**
 * Un effet temporaire posé par une capacité (buff/malus chiffré), distinct d'un
 * statut du catalogue : il n'a pas de clé, ses modificateurs sont déjà résolus.
 */
export interface ActiveEffect {
  id: string;
  /** Nom affiché (celui de la capacité qui l'a posé). */
  name: string;
  remaining: number;
  sourceId?: string;
  /** Modificateurs signés appliqués tant qu'il dure. */
  mods: { stat: SpellScalingSource; value: number }[];
  cleanses?: string[];
  evadeChance?: number;
  /** Enchantement actif : dégâts ajoutés à chaque coup de l'arme ou du poing. */
  enchant?: CombatEnchant;
  retaliate?: SpellRetaliate;
}

/* ── Réactions ─────────────────────────────────────────────────────────────
   Une réaction se joue HORS de son tour, en réponse à ce que fait quelqu'un
   d'autre. Le moteur ne la déclenche jamais tout seul : il suspend l'action en
   cours, ouvre une fenêtre, et attend que le joueur choisisse ou passe — comme
   pour la frappe gratuite. Une action interrompue est conservée dans la
   rencontre, donc elle survit même à une sauvegarde en plein milieu.
─────────────────────────────────────────────────────────────────────────── */

/** Ce qui ouvre une fenêtre de réaction. */
export type ReactionTrigger =
  /** Quelqu'un quitte votre allonge — l'attaque d'opportunité classique. */
  | 'leave-reach'
  /** Vous êtes pris pour cible — parade, esquive, repli. */
  | 'incoming-attack';

/** Fenêtre de réaction ouverte, en attente de décision. */
export interface PendingReaction {
  /** Qui peut réagir. */
  actorId: string;
  trigger: ReactionTrigger;
  /** Qui a provoqué la fenêtre. */
  sourceId: string;
  /** Phrase lisible expliquant ce qui déclenche. */
  reason: string;
  /** Capacités utilisables en réponse (ids sur `actorId`). */
  options: string[];
  /**
   * Case visée par défaut : la position de celui qui a déclenché, pour une
   * attaque d'opportunité. Le joueur peut viser ailleurs si la capacité le
   * permet.
   */
  at: GridPos;
}

/** Action mise en attente le temps qu'une réaction soit tranchée. */
export interface SuspendedAction {
  action: CombatAction;
  /**
   * Combattants déjà sollicités pour CETTE action. Sans cette liste, on
   * rouvrirait indéfiniment la même fenêtre à chaque reprise.
   */
  asked: string[];
}

/* ── Sac ──────────────────────────────────────────────────────────────────── */

/** Une ligne du sac d'un combattant, avec ce qu'il en reste. */
export interface CarriedItem {
  name: string;
  qty: number;
  /** Slug de la fiche wiki, quand l'objet a été reconnu au catalogue. */
  slug?: string;
  /** Munition, consommable utilisable en combat, ou simple bagage. */
  kind: 'ammunition' | 'consumable' | 'other';
}

/* ── Combattant ───────────────────────────────────────────────────────────── */

export interface Combatant {
  id: string;
  name: string;
  team: Team;
  origin: CombatantOrigin;
  /** Vignette (data URL de la fiche, ou icône du bestiaire). */
  portrait?: string;
  /**
   * Ce qu'est le combattant, en un mot : sa classe pour un personnage
   * (« Guerrier »), son type d'entité pour une créature (« Bestial »). Affiché
   * dans l'ordre d'initiative, où savoir à qui l'on a affaire compte plus que
   * le détail de ses stats.
   */
  role?: string;
  /**
   * Niveau du personnage, ou indice de menace pour une créature. Affiché dans
   * l'ordre d'initiative : c'est ce qui dit d'un coup d'œil qui pèse dans la
   * rencontre.
   */
  level?: number;

  /** Côté de l'empreinte au sol, en cases (1 = M, 2 = G, 3 = TG). */
  footprint: number;
  pos: GridPos;

  /**
   * Stats de référence, hors buffs et statuts. Figées à l'ajout du combattant :
   * la fiche peut évoluer en dehors, le combat en cours reste cohérent.
   */
  base: Record<StatKey, number>;
  attributes: Record<AttributeKey, number>;
  /** Bonus de maîtrise, ajouté aux jets de toucher et de sauvegarde. */
  proficiency: number;

  /** Ressources courantes. `hp` à 0 = hors de combat. */
  hp: number;
  mana: number;
  endurance: number;

  /** Mètres de déplacement déjà consommés dans le tour courant. */
  moved: number;
  actionUsed: boolean;
  /**
   * Réaction déjà dépensée ? Une seule par round, remise à neuf au début de
   * son propre tour — c'est ce qui force à choisir quand réagir.
   */
  reactionUsed: boolean;

  /**
   * À bout de souffle ? Se déclenche quand l'endurance touche zéro, et ne se
   * lève qu'une fois la réserve suffisamment refaite — pas au premier point
   * regagné. Sans ce seuil de sortie, on oscillerait autour de zéro en
   * retrouvant sa pleine forme un tour sur deux.
   */
  winded?: boolean;

  statuses: ActiveStatus[];
  effects: ActiveEffect[];
  abilities: CombatAbility[];
  /** Le sac : munitions et consommables, décomptés à l'usage. */
  inventory: CarriedItem[];
  affinities: Affinities;

  /** Score d'initiative, tiré au lancement du combat. */
  initiative: number;
  /** Hors de combat (PV à 0). Reste sur la grille, ne joue plus. */
  down: boolean;
  notes?: string;
}

/* ── Journal ──────────────────────────────────────────────────────────────── */

export type LogKind =
  | 'info'
  | 'turn'
  | 'move'
  | 'attack'
  | 'damage'
  | 'heal'
  | 'status'
  | 'save'
  | 'death';

/**
 * Une ligne du journal de combat. `details` porte le calcul pas à pas — c'est
 * ce qui rend le moteur vérifiable par le MJ plutôt qu'opaque.
 */
export interface LogEntry {
  id: number;
  round: number;
  kind: LogKind;
  actorId?: string;
  targetId?: string;
  text: string;
  details?: string[];
}

/* ── Rencontre ────────────────────────────────────────────────────────────── */


export interface Encounter {
  /** Identifiant serveur, absent tant que la rencontre n'est pas sauvegardée. */
  id?: string;
  name: string;
  grid: { width: number; height: number };
  /**
   * Décor du champ de bataille : case ("x,y") → clé de terrain. Les cases
   * absentes sont du sol nu. Cf. `terrain.ts` pour le catalogue.
   */
  terrain: TerrainMap;
  combatants: Combatant[];

  /** Le combat a-t-il commencé (initiative tirée) ? */
  started: boolean;
  round: number;
  /** Ids dans l'ordre d'initiative décroissant. */
  order: string[];
  /** Position dans `order` du combattant dont c'est le tour. */
  turnIndex: number;

  /** Météo active (clé de `weathers.json`), ou vide. */
  weather?: string;
  /**
   * Moment de la journée (clé de `daytime.json`). Il se cumule à la météo : une
   * tempête de nuit incline le monde deux fois dans le même sens.
   */
  daytime?: string;

  /**
   * Frappe gratuite en attente de cible. Accordée par un bonus de classe, elle
   * n'est PAS résolue d'office : le joueur choisit qui il frappe parmi ce qui
   * est à portée, ou passe. Tant qu'elle est posée, la vue demande ce choix.
   */
  pendingStrike?: {
    actorId: string;
    /** Ce avec quoi la frappe est portée : les poings, ou l'arme en main. */
    slot: 'unarmed' | 'weapon';
    /** Nom de la capacité qui l'a accordée, pour le journal. */
    source: string;
  };

  /** Fenêtre de réaction ouverte : le combat attend une décision. */
  pendingReaction?: PendingReaction;
  /** Action interrompue par cette fenêtre, rejouée une fois tranchée. */
  suspended?: SuspendedAction;

  /** Graine et compteur de jets : ensemble, ils rendent la partie rejouable. */
  seed: number;
  rollCount: number;

  log: LogEntry[];
  /** Prochain id de ligne de journal. */
  nextLogId: number;
}

/** Vue allégée pour la liste des rencontres sauvegardées. */
export interface EncounterSummary {
  id: string;
  name: string;
  round: number;
  combatants: number;
  updatedAt: string;
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

/**
 * Ce qu'un joueur demande au moteur. Le moteur est la seule porte d'entrée des
 * mutations : la vue ne touche jamais l'état à la main, elle envoie une action
 * et récupère la rencontre suivante. Cela garantit qu'aucun changement
 * n'échappe au journal.
 */
export type CombatAction =
  | { type: 'start' }
  | { type: 'move'; actorId: string; to: GridPos }
  | {
      type: 'use';
      actorId: string;
      abilityId: string;
      /** Case visée (centre de la zone, ou case de la cible unique). */
      at: GridPos;
      /** Cibles explicites pour une capacité « N cibles ». */
      targetIds?: string[];
    }
  | { type: 'endTurn' }
  /** Porte la frappe gratuite en attente sur la cible désignée. */
  | { type: 'freeStrike'; targetId: string }
  /** Renonce à la frappe gratuite en attente. */
  | { type: 'skipStrike' }
  /** Joue la réaction choisie dans la fenêtre ouverte. */
  | { type: 'react'; abilityId: string; at?: GridPos }
  /** Laisse passer la fenêtre de réaction. */
  | { type: 'skipReaction' }
  | { type: 'damage'; targetId: string; amount: number; note?: string }
  | { type: 'heal'; targetId: string; amount: number }
  | { type: 'applyStatus'; targetId: string; status: string; duration?: number }
  | { type: 'clearStatus'; targetId: string; status: string }
  | { type: 'setWeather'; weather: string }
  | { type: 'setDaytime'; daytime: string };
