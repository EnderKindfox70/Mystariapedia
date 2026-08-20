import type { AmmunitionSource, WeaponSource } from './abilities';
import type { EarthMaterialTraining } from '../character/character.types';
import type { MaterialFamilyKey } from '../wiki.types';
import { AttributeKey, StatKey, SurvivalKey } from '../character/character.types';
import { SpellRetaliate, SpellScalingSource, SpellTarget } from '../wiki.types';
import { EncounterClock } from './clock';
import { LootDrop, LootItem } from './loot';
import { SurvivalState } from './survival';
import { EncounterFeatures, TerrainMap } from './terrain';

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
  /**
   * Modificateur d'attribut ajouté à plat au coup (+2 pour une Dextérité de 14).
   *
   * Distinct de `scaling`, qui multiplie la VALEUR de la source : un ratio sur
   * la dextérité rendrait 7 pour un score de 14, là où la table attend +2. Ce
   * qu'ajoute une main qui vise juste est un modificateur, pas une fraction de
   * caractéristique — c'est ce dont vit l'attaque d'action bonus, qui n'a pas
   * l'attaque physique pour la porter.
   */
  attributeModifier?: AttributeKey;
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
  | { kind: 'targets'; count: number }
  /**
   * Tous les porteurs d'une marque du lanceur, où qu'ils soient.
   *
   * La seule forme qui ne décrit AUCUNE géométrie : elle ne part pas du
   * lanceur, ne couvre pas de surface, et ne se vise pas. Ce qu'elle touche est
   * déjà désigné — par un statut posé au tour d'avant.
   */
  | { kind: 'marked' };

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
  /**
   * Ce qu'il ajoute à chaque coup. Absent pour un revêtement qui ne blesse pas
   * de lui-même : un venin ne fait pas de dégâts, il fait passer son poison.
   */
  damage?: AbilityDamage;
  /**
   * Statuts que chaque coup porté peut faire passer, avec leur chance. C'est
   * ainsi qu'un venin agit : la lame ne frappe pas plus fort, elle empoisonne.
   */
  inflicts?: AbilityStatus[];
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
 * De quoi reconstruire une arme, quelle que soit la main qui la prendra.
 *
 * On garde la SOURCE et non la capacité toute faite, parce qu'une arme ne vaut
 * pas la même chose dans les deux mains : la main faible frappe sans la part
 * d'attaque physique et se joue en action bonus. Recopier la capacité de la
 * main droite dans la gauche aurait transporté ces règles avec elle.
 */
export interface WieldSpec {
  source: WeaponSource;
  /** Munition appariée, quand l'arme en demande une. */
  ammo?: AmmunitionSource;
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
   * Part de la réserve MAXIMALE de qui boit, rendue en plus du montant plat
   * (0–100). Résolue contre la **cible**, jamais contre celui qui tend la
   * fiole : une potion ignore qui la débouche, elle remplit le réservoir
   * qu'elle trouve. C'est ce qui la garde utile à un archimage sans la rendre
   * démesurée pour un novice — le forfait porte le début de carrière, le
   * pourcentage porte la fin.
   */
  restoreManaPercent?: number;
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
   * Le porteur MAÎTRISE-t-il cette capacité ?
   *
   * Seules les capacités maîtrisées reçoivent le bonus de maîtrise dans le jet
   * de toucher — et comme ce bonus est la seule chose qui croît avec le niveau,
   * c'est aussi la seule progression de précision du jeu. Un guerrier de niveau
   * 20 vise à l'épée comme un vétéran, et à l'arc comme un débutant.
   *
   * Vrai d'office pour ce qui n'est pas une arme de la panoplie : ses propres
   * sorts, ses compétences de classe, ses crocs.
   */
  proficient?: boolean;

  /**
   * Attribut servant au jet de toucher. À défaut : dextérité pour une arme,
   * intelligence pour un sort.
   */
  attackAttribute?: AttributeKey;
  /** `true` pour une capacité qui touche automatiquement (soins, buffs sur soi). */
  autoHit?: boolean;

  /**
   * Le coup, **s'il porte**, vaut un coup critique.
   *
   * La garantie ne concerne QUE les dégâts : le jet de toucher reste ordinaire,
   * on peut manquer. C'est ce qui distingue une frappe assurée d'une frappe
   * imparable — et ce qui l'empêche d'être un simple sort de dégâts déguisé.
   */
  alwaysCritical?: boolean;

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
   * La capacité ÉCHANGE la place du lanceur avec celle du combattant visé.
   * Contrairement à `teleport`, elle vise un corps et non une case libre, et
   * elle se passe de ligne de vue : le lien est déjà noué, il n'y a rien à
   * viser. Jouée en réaction, c'est ce qui permet de prendre le coup à la place
   * d'un allié — ou de tirer l'assaillant hors de son propre élan.
   */
  /**
   * La capacité exige un jet de toucher même sans dégâts, et seulement contre
   * une cible hostile : un sceau qu'on impose se rate, un sceau qu'on offre non.
   */
  requiresHit?: boolean;
  /** Points de précision retranchés à son jet : la capacité est exigeante. */
  precisionPenalty?: number;
  /**
   * Statut qui guide le trait. Sur une cible qui le porte de la main du
   * lanceur, la capacité touche à coup sûr et se passe de ligne de vue —
   * pourvu qu'un chemin mène jusqu'à elle.
   */
  homingMark?: string;
  /**
   * Statut qui DÉSIGNE les cibles : la capacité frappe tous ceux qui le portent
   * de la main du lanceur. Va de pair avec `shape.kind` `marked`, qui dit que la
   * capacité ne vise rien d'autre.
   */
  marksTargets?: string;
  /** La marque est consumée après l'effet (un éclat la dépense, un piège non). */
  consumesMark?: boolean;
  /**
   * Écart, en mètres, qu'un champ d'ancrage posé par cette capacité impose
   * entre les porteurs qu'il gouverne. À défaut : `ANCHOR_GAP_METERS`.
   */
  anchorGapMeters?: number;
  /**
   * La capacité ARRACHE un objet ferreux à sa cible et le verse au sac du
   * lanceur. L'objet n'est pas choisi ici : il dépend de ce que la cible porte
   * au moment du lancer, donc il arrive avec l'action (cf. `CombatAction`).
   */
  /**
   * La capacité FAÇONNE de la matière : ce qu'elle produit dépend du matériau
   * employé, pas d'un chiffre écrit sur le palier. Nomme la famille.
   */
  shapesMaterial?: MaterialFamilyKey;
  /** La capacité dresse un mur : longueur en cases, santé de base. */
  raisesWall?: { length: number; hp: number };
  /** Combien de matière ce palier façonne (cf. `SpellNodeStats.materialScale`). */
  materialScale?: number;
  pullsMetal?: boolean;
  /** Score de Force à atteindre pour garder une arme qu'on tient. */
  pullDc?: number;
  /**
   * La capacité PROJETTE un objet ferreux du sac du lanceur. Ses dégâts ne sont
   * pas dans `damages` : ils viennent de l'objet, et s'ajoutent au `scaling` de
   * la capacité.
   */
  throwsMetal?: boolean;
  /**
   * L'outil de cette capacité est-il saisissable par un champ magnétique ?
   * DÉRIVÉ de `material` : fer et acier seulement.
   */
  metallic?: boolean;
  /** Matière de l'outil (clé de `materials.json`), quand on la connaît. */
  material?: string;
  /**
   * De quoi REPOSER cette arme dans une autre main — ou dans un sac, puis dans
   * une main. Présent sur toute capacité d'arme.
   *
   * Sans lui, désarmer quelqu'un détruisait l'arme en tant qu'arme : elle
   * tombait au sac en bagage inerte, et la ramasser ne rendait qu'un nom.
   */
  wield?: WieldSpec;
  swap?: boolean;
  /**
   * Statut que la cible doit porter, et que le LANCEUR doit lui avoir posé,
   * pour qu'un `swap` ait prise sur elle. Absent = n'importe qui.
   */
  swapMark?: string;
  /**
   * Portée d'ancrage des statuts posés par cette capacité, en mètres. Un statut
   * ancré se rompt dès que son porteur s'éloigne davantage de celui qui l'a
   * posé — c'est la laisse de la Marque spatiale.
   */
  tetherMeters?: number;
  /**
   * La capacité se paie en **action bonus**, pas en action.
   *
   * C'est le second créneau du tour, et il ne sert qu'à ce que la main
   * principale ne fait pas : l'arme secondaire et les objets du sac. Sans lui,
   * boire une potion coûtait l'attaque du tour — donc personne ne buvait, et
   * une main gauche armée n'était qu'une arme de rechange.
   *
   * Un créneau ne se reporte pas sur l'autre : ce qui se joue en action bonus
   * ne peut PAS être joué à la place de l'action, sans quoi le tour de celui
   * qui porte deux armes serait simplement le double de celui des autres.
   */
  bonusAction?: boolean;
  /**
   * L'arme se tient à DEUX mains. Elle ne laisse donc rien à la main faible :
   * ni arme secondaire, ni bouclier. La fabrique n'équipe déjà pas les deux,
   * mais le moteur le vérifie quand même — une rencontre se retouche à la main,
   * et une claymore ne doit pas se retrouver escortée d'une dague.
   */
  twoHanded?: boolean;
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
   * Laisse, en mètres : au-delà de cette distance de `sourceId`, le statut se
   * rompt de lui-même. C'est ce qui laisse une marque durer indéfiniment sans
   * qu'elle suive son porteur au bout du monde. Absent = pas d'ancrage.
   */
  tetherMeters?: number;
  /**
   * Écart, en mètres, qu'un champ d'ancrage impose entre ses porteurs. Posé à
   * l'application parce qu'il dépend du PALIER lancé, pas du statut.
   */
  gapMeters?: number;
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
  /** Munition, fiole à boire, venin à étaler, ou simple bagage. */
  kind: 'ammunition' | 'consumable' | 'venom' | 'other';
  /**
   * Un aimant a-t-il prise dessus ? DÉRIVÉ de `material` par la fabrique — fer
   * et acier seulement. Une chevalière d'or et un astrolabe de bronze sont en
   * métal sans être saisissables.
   */
  metallic?: boolean;
  /** Matière de l'objet (clé de `materials.json`), quand on la connaît. */
  material?: string;
  /** Masse en kilos, quand le catalogue la connaît : c'est elle qui décide de
   * ce que l'objet fait en arrivant, quand ce n'est pas une arme. */
  weightKg?: number;
  /**
   * Ce que l'objet devient une fois EN MAIN.
   *
   * Une arme rangée au sac n'est pas une capacité — on ne frappe pas avec ce
   * qu'on ne tient pas — mais elle doit pouvoir le redevenir. Porter la
   * capacité toute faite plutôt que le nom de l'arme évite au moteur d'aller
   * rechercher un catalogue qu'il ne connaît pas : il est en TypeScript pur, et
   * les fiches d'armes arrivent par le réseau.
   *
   * La maîtrise, elle, est rejugée à l'équipement — elle appartient au bras,
   * pas à la lame.
   */
  weapon?: WieldSpec;
}

/**
 * Un objet métallique qu'un champ peut saisir — au poing de quelqu'un ou dans
 * son sac. Ce n'est pas un état stocké : la liste se recalcule à chaque fois,
 * parce que ce qu'on porte change en cours de combat.
 */
export interface MetalItem {
  /** Nom affiché, et clé de la ligne de sac quand il en vient une. */
  name: string;
  /**
   * D'où l'objet vient. Une arme au poing se DISPUTE (jet de Force) et sa perte
   * désarme ; une ligne de sac se prend sans que personne s'en aperçoive ; ce
   * qui gît par terre n'appartient à personne et se saisit sans un geste.
   */
  source: 'weapon' | 'bag' | 'ground';
  /** Id de la capacité d'arme, quand l'objet est une arme tenue. */
  abilityId?: string;
  /** Case où l'objet repose, quand il vient du sol. */
  at?: GridPos;
  /**
   * Ce qu'il faut pour que l'objet redevienne une arme EN MAIN, s'il en est
   * une. Voyage avec lui : sans cela, une épée projetée retombait en bagage
   * inerte et la ramasser ne rendait qu'un nom — plus rien ne disait que
   * c'était une épée, donc plus moyen de la dégainer.
   */
  wield?: WieldSpec;
  /** Ce que l'objet inflige quand on le projette. */
  thrown: { min: number; max: number; type: string };
}

/**
 * Un mur dressé par un sort.
 *
 * Il occupe des cases, arrête les pas et les regards comme n'importe quel mur,
 * mais il a une santé : on peut le briser. C'est ce qui le distingue d'un
 * obstacle de décor, et ce qui rend le sort intéressant à jouer contre — on
 * n'attend pas qu'il disparaisse, on le démolit.
 */
export interface ConjuredWall {
  id: string;
  /** Nom affiché, matière comprise (« Mur de granite »). */
  name: string;
  /** Clé du matériau : c'est lui qui décide de sa solidité et de ses failles. */
  material: string;
  /** Les cases qu'il occupe. */
  cells: GridPos[];
  hp: number;
  maxHp: number;
  /**
   * Tours restants avant qu'il ne se décompose. **-1 = permanent** : une pierre
   * façonnée dans le sol n'a aucune raison de s'évaporer, seule une matière
   * tirée du néant doit être soutenue.
   */
  remaining: number;
  /** Qui l'a dressé, pour le journal. */
  sourceId?: string;
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
  /**
   * Sait-il nager ? Décide du passage en eau profonde.
   *
   * Posé par la fabrique — un personnage entraîné en Athlétisme sait nager, une
   * créature aquatique aussi — et rectifiable à la main : le MJ sait mieux que
   * le moteur si ce marin d'eau douce se jetterait à l'eau.
   */
  canSwim?: boolean;
  /**
   * Bonus de compétence RÉSOLUS, par clé de `SKILLS` (mod. d'attribut + apport
   * du background + maîtrise si la compétence est choisie).
   *
   * Résolus par la fabrique plutôt que recalculés par le moteur : le calcul
   * demande la classe et le background, que le moteur ne connaît pas — et il
   * n'existe qu'une définition de la règle, celle de la fiche.
   *
   * Absent pour une créature : le bestiaire ne tient pas de compétences.
   */
  skills?: Record<string, number>;

  /** Ressources courantes. `hp` à 0 = hors de combat. */
  hp: number;
  mana: number;
  endurance: number;

  /** Mètres de déplacement déjà consommés dans le tour courant. */
  moved: number;
  actionUsed: boolean;
  /**
   * Action bonus déjà dépensée ? Un créneau par tour, réservé à ce que la main
   * principale ne fait pas : l'arme secondaire et les objets (cf.
   * `CombatAbility.bonusAction`). Les deux créneaux sont étanches — dépenser
   * l'un ne rend ni ne consomme l'autre.
   */
  bonusActionUsed: boolean;
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
  /**
   * Porte-t-il une armure de métal ? Plaques, mailles, brigandine — pas des
   * bottes ferrées.
   *
   * Une armure ne s'arrache pas pièce à pièce, donc elle n'entre pas dans ce
   * qu'un champ peut prendre. Mais elle suffit à faire de son porteur quelqu'un
   * qu'un bouclier électromagnétique tient à distance, et c'est justement ce
   * qui distingue le chevalier du bretteur en cuir.
   */
  metallicArmor?: boolean;
  /**
   * Catégories d'armes que le combattant MAÎTRISE (cf. sa classe et ses
   * maîtrises supplémentaires). Posées par la fabrique.
   *
   * Sans elles, une arme ramassée en plein combat aurait gardé la maîtrise de
   * son ancien propriétaire : le bretteur désarmé aurait rendu son talent avec
   * sa lame, et le voleur qui la ramasse en aurait hérité.
   */
  weaponProficiencies?: string[];
  /**
   * Ce que le combattant sait des matériaux de Terre. Recopié de la fiche à
   * l'ajout, comme le reste : une étude faite entre deux séances ne doit pas
   * changer un combat en cours.
   */
  earthMaterials?: EarthMaterialTraining;
  affinities: Affinities;

  /* ── Hors combat ──────────────────────────────────────────────────────── */

  /**
   * Faim, soif, sommeil — en secondes écoulées depuis le dernier plein (cf.
   * `survival.ts`). Absent pour une créature : une bête ne tient pas de jauges,
   * elle est ce qu'elle est le jour où on la rencontre.
   */
  survival?: SurvivalState;
  /**
   * Bourse portée, en pièces d'or. Se ramasse sur un corps comme le reste du
   * sac ; c'est le seul butin qu'un adversaire humanoïde rend à coup sûr.
   */
  purse?: number;
  /**
   * Or que le TIRAGE du background accorde, hors écart de campagne.
   *
   * Sans lui, on ne saurait pas quelle part de la bourse vient de la fiche et
   * quelle part vient de la table : la fiche ne stocke pas un montant mais un
   * écart au tirage (cf. `goldDelta`), et le report a besoin des deux bouts.
   */
  purseBase?: number;
  /**
   * Table de butin recopiée depuis le bestiaire, **pas encore jetée**. Le
   * moteur étant du TypeScript pur, il ne peut pas relire un JSON au moment de
   * la fouille : la table voyage avec le combattant.
   */
  lootTable?: LootDrop[];
  /**
   * Ce que la dépouille a rendu une fois fouillée, et qui n'a pas encore été
   * pris. `undefined` tant que personne n'a fouillé — c'est ce qui distingue
   * « pas encore cherché » de « rien trouvé ».
   */
  loot?: LootItem[];
  /** Or trouvé sur le corps, en attente d'être ramassé. */
  lootGold?: number;
  /** Le corps a déjà été fouillé : on ne rejette pas les dés dessus. */
  searched?: boolean;

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
  | 'death'
  /** Le temps qui passe hors combat. */
  | 'time'
  /** Fouille d'une dépouille, transfert de butin. */
  | 'loot'
  /** Faim, soif, sommeil : cran perdu ou jauge comblée. */
  | 'survival';

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

/**
 * Ce que la table est en train de faire.
 *
 * Une séance n'est pas une suite de bagarres : on monte la scène, on se bat,
 * puis on fouille, on soigne, on mange et on repart. Les trois phases partagent
 * la MÊME rencontre — mêmes combattants, même journal, même horloge — parce que
 * ce qui vient de se passer en combat est précisément ce qui compte après.
 *
 * - `setup` : montage, avant que l'initiative ne soit tirée.
 * - `combat` : le tour par tour, la grille, l'initiative.
 * - `exploration` : hors combat. Le temps s'écoule par tranches décidées, les
 *   corps se fouillent, les jauges de survie descendent et se comblent.
 */
export type EncounterPhase = 'setup' | 'combat' | 'exploration';

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
  /**
   * État des éléments manipulables du décor — les portes : ouvertes, fermées,
   * verrouillées, enfoncées. Rangé à côté du décor et non dedans : le décor dit
   * ce qu'EST la case, ceci dit dans quelle position elle se trouve.
   */
  features?: EncounterFeatures;
  /**
   * Ce qui traîne par terre : case (« x,y ») → objets posés dessus.
   *
   * Sur la rencontre et non sur les combattants, parce que le sol n'appartient
   * à personne — et c'est justement l'intérêt : une épée tombée entre deux
   * lignes revient à qui ose aller la chercher. Absent tant que rien n'est
   * tombé, et les cases vidées sont retirées plutôt que laissées vides.
   */
  ground?: Record<string, CarriedItem[]>;
  /**
   * Ce que le sol de la scène offre VRAIMENT : clés de matériaux de Terre.
   *
   * C'est elle qui décide du palier Manipulation — façonner ce qui est là ne
   * demande aucune étude et coûte moins cher. Absente ou vide = pas de
   * géologie exploitable (un pont de navire, une salle dallée de bois), et
   * tout doit alors être conjuré.
   */
  geology?: string[];
  /**
   * Murs dressés par magie, avec leur santé et ce qu'il leur reste à vivre.
   *
   * Un mur n'est PAS du décor : le décor était là avant et ne s'abat pas. Un
   * mur conjuré s'attaque, s'écroule, et — s'il a été tiré du néant plutôt que
   * façonné dans le sol — se décompose tout seul.
   */
  walls?: ConjuredWall[];
  combatants: Combatant[];

  /** Le combat a-t-il commencé (initiative tirée) ? */
  started: boolean;
  round: number;
  /** Ids dans l'ordre d'initiative décroissant. */
  order: string[];
  /** Position dans `order` du combattant dont c'est le tour. */
  turnIndex: number;

  /**
   * Phase courante. Absente sur une rencontre sauvegardée avant les phases :
   * `migrateEncounter` la déduit alors de `started`.
   */
  phase?: EncounterPhase;
  /**
   * L'heure qu'il est. Elle avance de six secondes par round de combat et de ce
   * que le MJ décide hors combat ; c'est elle qui use les jauges de survie.
   */
  clock?: EncounterClock;

  /** Météo active (clé de `weathers.json`), ou vide. */
  weather?: string;
  /**
   * Moment de la journée (clé de `daytime.json`). Il se cumule à la météo : une
   * tempête de nuit incline le monde deux fois dans le même sens.
   *
   * D'ordinaire **déduit de l'horloge** — mais le MJ peut le figer
   * (`daytimeLocked`) pour un souterrain, une éclipse ou un plan d'ombre, où
   * l'heure qu'il est dehors ne décide plus de rien.
   */
  daytime?: string;
  /**
   * Le moment de la journée est forcé à la main : l'horloge continue de tourner
   * mais ne le change plus.
   */
  daytimeLocked?: boolean;

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
  /**
   * Corps jetés dans la ligne de mire pendant qu'une action était suspendue.
   *
   * Un coup part vers une CASE. Si une réaction y met quelqu'un d'autre entre
   * temps, c'est lui qui le reçoit — fût-il du camp de l'attaquant. C'est tout
   * l'intérêt d'un Change-place joué en parade : on ne se dérobe pas, on met
   * quelqu'un à sa place. Sans cette liste, l'allégeance ferait échouer le coup
   * et le sort ne servirait qu'à fuir.
   *
   * Purement transitoire : posée par l'échange, consommée par l'action qui
   * reprend, effacée à la fin de l'action de plus haut niveau.
   */
  inTheWay?: string[];
  /**
   * Le trajet que la dernière action a fait PARCOURIR, case par case.
   *
   * Posé par la marche, et par elle seule : une téléportation ou un échange de
   * place n'en laissent aucun. C'est le moteur qui tranche, et c'est le seul
   * moyen fiable de le savoir — une destination franchissable à pied l'est
   * souvent aussi d'un pas dimensionnel, et deviner d'après les cases faisait
   * marcher les téléportations.
   *
   * Purement transitoire : effacé à l'ouverture de chaque action.
   */
  walked?: { unitId: string; path: GridPos[] };

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
      /**
       * Objet désigné, pour ce qui saisit ou projette du métal. Il ne peut pas
       * vivre dans la capacité : ce qu'on peut arracher dépend de ce que la
       * cible porte à l'instant du lancer, et cela change à chaque tour.
       * Absent = le moteur prend la première prise venue.
       */
      item?: string;
    }
  /**
   * Ramasse un objet posé au sol, sur sa propre case ou une case voisine.
   *
   * Se paie en **action bonus** pendant un combat — se baisser est un geste
   * bref, du même créneau que porter la main au sac — et ne coûte rien hors
   * combat, où personne ne compte les gestes. `item` absent = toute la pile.
   */
  | { type: 'pickUp'; actorId: string; at: GridPos; item?: string; qty?: number }
  /**
   * Prend en main une arme du sac. Ce qu'on tenait retourne au sac — on ne
   * porte pas trois épées.
   *
   * Se paie en **action bonus** pendant un combat : changer d'arme est un geste
   * qui n'occupe pas le bras qui frappe, et le faire gratuitement rendrait le
   * choix d'armement sans conséquence. Gratuit hors combat.
   */
  | { type: 'equip'; actorId: string; item: string; slot?: 'weapon' | 'offhand' }
  /** Range l'arme d'un emplacement : elle retourne au sac, la main se libère. */
  | { type: 'unequip'; actorId: string; slot: 'weapon' | 'offhand' }
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
  /**
   * Fixe la géologie de la scène : ce que le sol offre vraiment à qui façonne
   * la matière. Une liste vide dit « rien d'exploitable » — un pont de navire,
   * un plancher — et ce n'est pas la même chose qu'une géologie non renseignée.
   */
  | { type: 'setGeology'; materials: string[] }
  /** Abat un mur conjuré d'autorité (la main du MJ). */
  | { type: 'breakWall'; wallId: string }
  | { type: 'setDaytime'; daytime: string }
  /** Fige (ou libère) le moment de la journée face à l'horloge. */
  | { type: 'lockDaytime'; locked: boolean }

  /* ── Hors combat ──────────────────────────────────────────────────────── */

  /** Bascule de phase : montage, combat, exploration. */
  | { type: 'setPhase'; phase: EncounterPhase }
  /**
   * Marcher **hors combat**. Distincte de `move`, qui est le déplacement d'un
   * tour : ici il n'y a ni budget en mètres, ni souffle dépensé, ni attaque
   * d'opportunité — personne ne se bat.
   *
   * Mais le décor, lui, est le même : un mur reste un mur, une porte fermée
   * reste fermée, et l'eau profonde arrête qui ne sait pas nager. C'est ce qui
   * distingue marcher au camp de POSER un pion au montage.
   */
  | { type: 'walk'; actorId: string; to: GridPos }
  /** Le MJ décide qui sait nager. */
  | { type: 'setSwim'; actorId: string; canSwim: boolean }

  /* ── Le décor qu'on manipule ──────────────────────────────────────────── */

  /**
   * Agir sur une porte. `open`/`close` sont gratuits sur une porte non
   * verrouillée ; `pick` et `break` demandent un jet et un acteur à portée.
   * `lock` est la main du MJ, sans jet.
   */
  | {
      type: 'door';
      cell: string;
      act: 'open' | 'close' | 'pick' | 'break' | 'lock' | 'unlock';
      actorId?: string;
    }
  /**
   * Fait passer le temps. `activity` (clé de `ACTIVITIES`) décide de ce que la
   * durée coûte aux jauges : huit heures de marche et huit heures de sommeil
   * n'usent pas le groupe de la même façon.
   */
  | { type: 'passTime'; seconds: number; activity: string; note?: string }
  /** Règle l'horloge à une heure précise (arrivée quelque part, ellipse). */
  | { type: 'setClock'; day: number; seconds: number }
  /** Fouille une dépouille : jette sa table de butin, une seule fois. */
  | { type: 'search'; targetId: string; actorId?: string }
  /**
   * Prend une ligne de butin sur un corps. `item` absent = tout ce qui reste,
   * or compris.
   */
  | { type: 'takeLoot'; targetId: string; actorId: string; item?: string; qty?: number }
  /**
   * Comble une jauge SANS rien prendre au sac : l'eau d'une rivière, le gibier
   * d'une chasse réussie, la table d'une auberge. C'est au MJ de dire qu'il y
   * en avait. `actorId` absent = tout le groupe.
   */
  | {
      type: 'restore';
      gauge: SurvivalKey;
      notches: number;
      actorId?: string;
      team?: Team;
      source?: string;
    }
  /**
   * Le repas (ou la halte d'eau) pris SUR LES VIVRES : chacun sort de son sac
   * de quoi combler la jauge, et ce qu'il y prend en disparaît. Qui n'a rien
   * reste sur sa faim, et le journal le nomme.
   *
   * `team` restreint le partage — le repas du groupe ne nourrit pas les
   * adversaires assis en face.
   */
  | { type: 'meal'; gauge: SurvivalKey; team?: Team; actorId?: string }
  /** Remplit les outres vides du groupe à une source. */
  | { type: 'refill'; team?: Team }
  /**
   * Verse des vivres dans un sac sans rien tirer : un achat au village, un don,
   * une correction du MJ. Pour la chasse, voir `hunt`.
   */
  | { type: 'provision'; item: string; qty?: number; actorId?: string; source?: string }
  /**
   * Une battue. Le moteur **jette les dés** (cf. `HUNT_TABLE`) : une fois sur
   * quatre on rentre bredouille, sinon on ramène du petit ou du moyen gibier.
   *
   * La prise revient à **celui qui a lancé la chasse** — c'est son sac qui la
   * porte, et son poids qu'elle grève.
   */
  | { type: 'hunt'; actorId: string }
  /** Consomme une ligne nourrissante précise du sac. */
  | { type: 'eat'; actorId: string; item: string }
  /** Correction manuelle d'une jauge par le MJ, en crans restants. */
  | { type: 'setSurvival'; actorId: string; gauge: SurvivalKey; notches: number };
