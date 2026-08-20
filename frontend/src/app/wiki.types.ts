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
  | 'equipment'
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
  /**
   * Le lanceur porte AUSSITÔT une attaque gratuite avec ce que le sort vient
   * d'enchanter (« le pugiliste porte aussitôt une attaque à mains nues »).
   * Elle ne coûte ni action ni endurance, et profite de l'enchantement qui
   * vient d'être posé.
   */
  freeStrike?: boolean;
  /**
   * Le sort se lance en **action bonus** au lieu de coûter l'action du tour.
   *
   * C'est le bonus de celui pour qui le geste est un réflexe : le pugiliste
   * n'a pas à choisir entre nimber ses poings et s'en servir, il fait les deux
   * dans le même tour. Une frappe gratuite donnait un coup de plus une fois ;
   * ceci rend le tour entier disponible, ce qui est à la fois plus simple à
   * lire et plus fidèle à ce qu'est un réflexe.
   */
  bonusAction?: boolean;
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
  /**
   * Ce que la riposte punit :
   * - `melee` (défaut) — tout coup porté depuis une case adjacente, arme comprise ;
   * - `unarmed` — seulement ce qui touche **à même la chair** : poings, crocs,
   *   serres. Une lame ou une pique tenue à distance de bras n'y laisse rien.
   *   C'est le déclencheur des défenses passives (épines, carapaces) : elles
   *   blessent qui les saisit, pas qui les frappe avec du fer ;
   * - `any` — n'importe quelle attaque, quelle qu'en soit la portée.
   */
  trigger?: 'melee' | 'unarmed' | 'any';
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
  /**
   * Le coup, **s'il porte**, inflige les dégâts d'un COUP CRITIQUE.
   *
   * La garantie ne porte que sur les dégâts : le jet de toucher reste ordinaire
   * et la frappe peut se manquer. Les chiffres écrits sur la fiche sont donc
   * ceux d'un coup ORDINAIRE — le moteur applique le facteur critique par-dessus.
   */
  alwaysCritical?: boolean;
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
  /** Le sort téléporte son lanceur sur la case visée. */
  teleport?: boolean;
  /**
   * Distance franchissable par la téléportation, quand elle diffère de `range`.
   * Indispensable dès que le sort fait autre chose en arrivant : « Évasion
   * enflammée » a une portée « Autour de soi » qui décrit son BRASIER, pas la
   * longueur du saut. À défaut, `range` fait office de distance de saut.
   */
  teleportRange?: string;
  /**
   * Le sort demande un JET DE TOUCHER même s'il n'inflige aucun dégât.
   *
   * Sans lui, tout ce qui ne blesse pas porte d'office : une marque s'imprimait
   * sur un ennemi aussi sûrement que sur un allié consentant. Le jet ne
   * concerne QUE les cibles hostiles — sur soi ou sur un allié, rien à viser.
   */
  requiresHit?: boolean;
  /**
   * Points de précision retranchés au jet de ce sort : il est difficile à
   * placer. Compté sur l'échelle fine de la précision, comme le reste.
   */
  precisionPenalty?: number;
  /**
   * Statut qui GUIDE le trait : contre une cible qui le porte — et que le
   * lanceur lui a posé —, le sort ne se vise plus, il suit le lien. Il touche à
   * coup sûr et se passe de ligne de vue, mais il lui faut un CHEMIN : scellée
   * derrière des murs pleins, la cible redevient hors d'atteinte.
   */
  homingMark?: string;
  /**
   * Statut qui DÉSIGNE les cibles du sort : il frappe tous ceux qui le portent
   * de la main du lanceur, où qu'ils soient.
   *
   * À déclarer avec `area: "Tous les marqués"` : le sort ne vise alors plus rien
   * — ni portée, ni ligne de vue, ni case — puisque ses cibles ont été désignées
   * au tour où on les a marquées.
   */
  marksTargets?: string;
  /**
   * La marque est CONSUMÉE après l'effet.
   *
   * Séparé de `marksTargets` parce que les deux ne vont pas toujours ensemble :
   * un effondrement dépense ses ancres, un piège les garde en place — c'est même
   * ce qui lui permet de durer.
   */
  consumesMark?: boolean;
  /**
   * Écart que le champ d'ancrage de ce palier impose entre les porteurs qu'il
   * gouverne (« 1,5 m », « 3 m »…). C'est ce qui fait progresser un piège :
   * plus l'écart est large, plus la ligne adverse se disloque.
   */
  anchorGap?: string;
  /**
   * Le sort ÉCHANGE la place du lanceur avec celle de sa cible, au lieu de
   * l'emmener sur une case libre. Deux conséquences qui le distinguent d'une
   * `teleport` : il vise un CORPS et non un point vide, et il ne demande pas de
   * ligne de vue — on ne vise pas, on tire sur un lien déjà noué.
   */
  swap?: boolean;
  /**
   * Statut qui rend l'échange possible. La cible doit le porter, et c'est le
   * lanceur qui doit le lui avoir posé : sans cette prise, il n'y a rien à
   * tirer. Absent = n'importe qui peut être permuté.
   */
  swapMark?: string;
  /**
   * Portée d'ANCRAGE des statuts que ce palier pose : au-delà de cette distance
   * de son lanceur, le statut se rompt de lui-même. C'est ce qui permet à une
   * marque de tenir indéfiniment sans tenir pour autant à travers le monde —
   * elle tient à quelqu'un, et à une longueur de laisse.
   */
  tetherRange?: string;
  /**
   * Le sort ARRACHE un objet métallique à sa cible et le fait passer dans le
   * sac du lanceur.
   *
   * Il ne se vise pas comme un trait : on désigne quelqu'un, le moteur regarde
   * ce qu'il porte de ferreux — arme au poing, ferraille au sac — et le joueur
   * choisit sa prise. Une armure ne se déshabille pas : elle rend son porteur
   * sensible aux champs, elle ne s'arrache pas pièce à pièce.
   *
   * Ce qui est libre vient sans résistance. Ce qui est TENU se dispute : la
   * cible jette sa Force contre `pullDc`, et le garde si elle réussit.
   */
  /**
   * Le sort FAÇONNE de la matière : sa saveur vient du matériau employé, pas
   * du palier. Nomme la famille dans laquelle il puise.
   *
   * Ce qui décide du matériau et de son prix, c'est la géologie de la scène et
   * ce que le lanceur a étudié (cf. `materials.ts`) — jamais le sort
   * lui-même. C'est ce qui évite d'écrire un sort par pierre.
   */
  shapesMaterial?: MaterialFamilyKey;
  /**
   * Le sort DRESSE UN MUR sur la case visée, au lieu de frapper.
   *
   * `length` en cases, `hp` la santé de base — que la matière module : un mur
   * de basalte encaisse mieux qu'un mur de grès. Sa durée de vie suit le palier
   * de façonnage : **façonné sur place, il est permanent** ; conjuré, il tient
   * le nombre de tours de `duration` ; improvisé, moitié moins.
   */
  raisesWall?: { length: number; hp: number };
  /**
   * Combien de matière ce palier façonne, sur l'échelle du catalogue.
   *
   * Le palier ne dit PLUS les dégâts ni la défense — la matière les dit. Il ne
   * dit que l'ampleur : 1 pour la quantité de référence, 2 pour le double.
   * C'est ce qui fait qu'un mage qui change de pierre change vraiment d'arme,
   * au lieu de voir le même chiffre légèrement modulé.
   */
  materialScale?: number;
  pullsMetal?: boolean;
  /**
   * Score que la cible doit atteindre en Force pour GARDER ce qu'on lui
   * arrache. Sans lui, la prise ne se dispute pas. Ne joue que sur ce qui est
   * tenu en main : rien dans un sac ne se défend tout seul.
   */
  pullDc?: number;
  /**
   * Le sort PROJETTE un objet métallique que le lanceur porte, et l'objet ne
   * survit pas au voyage : il quitte le sac.
   *
   * Ses dégâts et leur type ne sont pas écrits sur le palier — ils viennent de
   * ce qu'on lance. Une lame arrachée taille, une enclume écrase. Le `scaling`
   * du nœud, lui, s'ajoute normalement : c'est la poussée du lanceur.
   */
  throwsMetal?: boolean;
  /**
   * Déclencheurs auxquels ce palier peut répondre HORS du tour de son lanceur.
   * `incoming-attack` en fait une parade ou une dérobade (Pas dimensionnel),
   * `leave-reach` une punition du désengagement. Absent = le sort ne se lance
   * qu'à son tour.
   */
  reaction?: ('leave-reach' | 'incoming-attack')[];
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
 * Ce qu'un statut coûte à **celui qui le tient**, et non à qui le subit.
 *
 * La plupart des statuts sont posés puis oubliés : une brûlure brûle toute
 * seule. Certains, non — le marionnettiste tient ses fils, et les tenir
 * l'occupe. Ce bloc décrit ce prix-là, du côté du lanceur.
 */
export interface StatusSustain {
  /**
   * Mains du lanceur immobilisées par CHAQUE porteur. Avec deux mains, un coût
   * de 1 dit à la fois « un pantin par main » et « deux au maximum » : le
   * plafond n'a pas à être écrit ailleurs, il tombe de l'anatomie.
   *
   * Une main prise coûte l'usage de la main faible ; les deux prises ne
   * laissent que le déplacement.
   */
  bindsHands?: number;
  /**
   * Le lanceur **dirige** le porteur : celui-ci agit dans le camp de son
   * maître, prend ses anciens alliés pour cibles, et c'est le camp du lanceur
   * qui joue son tour.
   */
  commands?: boolean;
  /**
   * Concentration : un coup encaissé par le LANCEUR peut rompre le lien. Il
   * jette alors sa Sagesse contre ce DD, relevé par la violence du coup.
   * Absent = le statut tient quoi qu'il arrive à celui qui l'a posé.
   */
  concentrationDc?: number;
  /**
   * Mana que TENIR ce statut coûte au lanceur **à chaque tour**.
   *
   * Le prix du maintien, distinct de celui de l'incantation : un sort qu'on
   * garde ouvert doit se payer tant qu'il dure, sinon rien n'incite jamais à le
   * relâcher. Faute de pouvoir payer, le lien se rompt de lui-même.
   */
  upkeep?: number;
  /**
   * Le champ ne gouverne que les porteurs de CE statut, posés par le même
   * lanceur — et il les gouverne en continu : marquer quelqu'un après coup le
   * fait entrer dans le champ.
   */
  governs?: string;
  /**
   * Le champ gouverne quiconque PORTE DU MÉTAL — armure de fer, arme d'acier,
   * ferraille au sac. Rien à marquer au préalable : c'est l'équipement qui
   * désigne, et il désigne en continu. Qui vient les mains nues n'est pas tenu.
   */
  governsMetal?: boolean;
  /**
   * L'écart se compte depuis LE PORTEUR du statut, et non entre les gouvernés.
   *
   * C'est ce qui sépare un bouclier d'un piège : le piège disloque une ligne
   * adverse en interdisant à ses marqués de se toucher **entre eux** ; le
   * bouclier ne protège que celui qui le tend, et laisse les autres se serrer
   * comme ils veulent.
   */
  repelsFromHolder?: boolean;
}

/**
 * Jet d'attribut imposé par un statut. Sa réussite lève le statut (`clear`),
 * permet à la cible d'agir malgré lui (`act`), ou lui permet de refuser
 * l'ordre qu'on lui donne (`refuse`).
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
  /**
   * Conséquence d'une réussite :
   * - `clear` — le statut est levé ;
   * - `act` — la cible agit malgré lui (la peur qu'on surmonte) ;
   * - `refuse` — la cible **refuse l'ordre** qu'on lui donne : l'action voulue
   *   par son maître n'a pas lieu. C'est l'exact miroir d'`act` — ici l'échec
   *   laisse l'action se faire, et c'est la réussite qui l'annule.
   */
  onSuccess: 'clear' | 'act' | 'refuse';
  /**
   * Ce qu'un 20 naturel accorde en plus, quel que soit le DD. `clear` fait de
   * chaque jet une chance de rupture définitive : on ne se libère pas des fils
   * en tirant dessus, mais un sursaut peut les casser net.
   */
  onCritical?: 'clear';
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
  /**
   * Ce que TENIR ce statut coûte à celui qui l'a posé. Absent = rien : le
   * statut vit sa vie une fois lancé.
   */
  sustain?: StatusSustain;
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

/* ──────────────────────────────────────────
   MOMENTS DE LA JOURNÉE
   Source : public/resources/json/daytime.json
─────────────────────────────────────────── */

/**
 * Un moment de la journée (aube, midi, nuit…). Il ne cause pas de dégâts par
 * lui-même : il incline le monde, en rendant certains domaines plus ou moins
 * puissants et plus ou moins coûteux. Même structure de modificateurs que la
 * météo, avec laquelle il se cumule.
 */
export interface Daytime {
  id: number;
  key: string;
  name: string;
  icon: string;
  description: string;
  /** Modificateurs de dégâts des sorts, par domaine (facteur multiplicatif). */
  damageModifiers?: WeatherCostModifier[];
  /** Modificateurs de coût en mana, par domaine. */
  costModifiers?: WeatherCostModifier[];
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
  /**
   * Rôle du sort dans l'arsenal, et donc la puissance attendue de lui (cf.
   * `spell-damage-law.ts`). Un Inferno ne se juge pas à l'aune d'un trait de
   * feu : sans cette déclaration, la loi nivelle et l'on obtient un sort à 70
   * mana qui frappe moins fort qu'un sort à 1.
   *
   * `majeur` et `signature` doivent PAYER leur puissance — en mana, en
   * contre-coup, ou en danger pour ses propres alliés.
   */
  power?: 'standard' | 'majeur' | 'signature';
  /** Icône du sort (généralement celle de son sous-domaine). */
  icon?: string;
  /** Sous-domaines auxquels le sort appartient. */
  subdomains: string[];
  /**
   * Type de dégâts par défaut du sort (cf. damage_type.json : fire, ice, dark…).
   * À défaut, dérivé du domaine ; surchargeable par nœud.
   *
   * Valeur spéciale `weapon` (revêtements uniquement) : le bonus prend le type
   * de l'arme qu'il nimbe au lieu d'y ajouter une nature propre — c'est le cas
   * du Renforcement, qui densifie sans rien changer à ce qu'il touche.
   */
  damageType?: string;
  /**
   * Famille de matériau que ce sort façonne (Terre). Déclarée sur le SORT et
   * non sur chaque palier : une lame de pierre reste de la pierre en montant
   * en puissance. Surchargeable par nœud si un palier changeait de famille.
   */
  shapesMaterial?: MaterialFamilyKey;
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

/**
 * Palier de niveau auquel un slot de feat se dépense (en concurrence avec le
 * point d'attribut du même palier).
 */
export type DomainFeatLevel = 5 | 10 | 15 | 20;

/**
 * Nature mécanique d'un feat domanial, qui dicte OÙ il s'applique à la
 * résolution :
 * - `multiplier` : un facteur de plus dans la chaîne déjà posée pour la météo
 *   et le moment de la journée (dégâts/coût), jamais une valeur réécrite sort
 *   par sort ;
 * - `override` : une propriété structurelle (ciblage, portée, durée, type
 *   d'effet) vérifiée au moment de la résolution, comme l'attribut d'attaque ;
 * - `unlock` : ouvre une possibilité qui n'existait pas (branche, usage hors
 *   combat, accès à un sort) ;
 * - `passive` : une valeur en dur sur la fiche (stat ou attribut), lue par le
 *   calcul de personnage via `statEffects` — rien à jouer, c'est acquis.
 */
export type DomainFeatKind = 'multiplier' | 'override' | 'unlock' | 'passive';

/** Sens d'une ligne d'effet : ce que le feat donne, ce qu'il coûte, ou un fait neutre. */
export type DomainFeatTone = 'boon' | 'cost' | 'neutral';

/** Une ligne d'effet d'un feat : ce qui change, et de combien. */
export interface DomainFeatEffect {
  /** Ce qui est modifié (« Dégâts des sorts offensifs », « Ciblage »…). */
  label: string;
  /** La modification elle-même (« ×1,25 », « Zone, rayon 3 m »…). */
  value: string;
  /** Sens de la ligne. Absent = `neutral`. */
  tone?: DomainFeatTone;
}

/**
 * Feat domanial : un passif de portée large (il modifie tous les sorts d'un
 * domaine ou débloque une branche entière), pris sur un slot de feat aux
 * paliers 5/10/15/20. Les passifs plus étroits relèvent d'un nœud d'arbre de
 * sort, d'un créneau d'étude ou d'une résonance domaniale — pas d'ici.
 */
export interface DomainFeat {
  /** Identifiant stable, préfixé par le slug du domaine (`light-focale`). */
  key: string;
  name: string;
  /** Palier de slot minimal auquel le feat peut être pris. */
  level: DomainFeatLevel;
  kind: DomainFeatKind;
  /** Condition d'accès (palier de maîtrise atteint, aspect pratiqué, autre feat). */
  prerequisite: string;
  /** Background/origine qui accorde le feat sans dépenser de slot, s'il en existe un. */
  freeWith?: string;
  /** Ce que le feat change, en une phrase de fiction jouable. */
  description: string;
  /** Aspects du domaine concernés. Absent ou vide = le domaine entier. */
  subdomains?: string[];
  /** Clés des feats incompatibles (choix exclusif : on ne peut en avoir qu'un). */
  excludes?: string[];
  /** Le détail chiffré, une ligne par changement (affichage). */
  effects: DomainFeatEffect[];
  /**
   * Effets appliqués POUR DE VRAI à la fiche : une clé de stat (`def_phy`,
   * `mana`…) ou d'attribut (`force`…) et sa valeur, sommées comme celles d'un
   * trait. `effects` reste la lecture humaine ; ceci est ce que le calcul lit.
   */
  statEffects?: { key: string; value: number }[];
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
  /** Feats domaniaux : passifs de large portée pris sur un slot de feat. */
  feats?: DomainFeat[];
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
 * Une ligne de butin : l'item récupérable, et ce qu'une dépouille en rend.
 * Le rendement appartient à la créature, pas à l'item — un même venin ne se
 * prélève pas dans les mêmes quantités selon la bête dont il provient.
 */
export interface BestiaryLoot extends CrossRef {
  /** Chance d'obtenir l'item en dépouillant (0–100). Absent = systématique. */
  chance?: number;
  /** Quantité prélevée quand l'item tombe. Absent = 1. */
  min?: number;
  /** Borne haute de la quantité, si elle diffère du `min`. */
  max?: number;
}

/**
 * Une capacité propre à une créature.
 *
 * Sans elle, toutes les bêtes se battraient de la même façon — une morsure
 * générique dérivée de leur attaque. Ce bloc leur donne ce que leur fiche
 * raconte : le bélier charge, le loup hurle pour sa meute, le serpent fantôme
 * paralyse. Les champs reprennent le vocabulaire d'un nœud de sort, de sorte
 * qu'une capacité de créature se lit exactement comme un palier de magie.
 *
 * Une créature sans `abilities` retombe sur la morsure et la prise au sol par
 * défaut : le bestiaire reste jouable même à moitié rempli.
 */
export interface BestiaryAbility {
  name: string;
  /** Ce que fait la capacité, en clair. Affichée sur le bouton et au journal. */
  description?: string;
  /** Dégâts de base (forme simple, un seul type). */
  damageMin?: number;
  damageMax?: number;
  damageType?: string;
  /** Dégâts multi-composantes (rafale, morsure + venin). */
  damages?: { min: number; max: number; type?: string }[];
  /**
   * Scaling. Sans lui, une créature de haut niveau frapperait comme une poule :
   * l'essentiel de sa puissance doit venir de son attaque, pas d'un dé fixe.
   */
  scaling?: { source: string; ratio: number; affects?: string }[];
  heal?: number;
  /** Portée et zone, écrites comme sur une fiche de sort. */
  range?: string;
  area?: string;
  targets?: ('enemy' | 'ally' | 'self' | 'everyone')[];
  /** Coûts. Une bête n'a pas de mana à gaspiller : l'endurance suffit souvent. */
  enduranceCost?: number;
  manaCost?: number;
  duration?: number;
  effects?: { stat: string; value: number }[];
  inflicts?: { status: string; chance: number; duration?: number }[];
  cleanses?: string[];
  evadeChance?: number;
  retaliate?: {
    trigger?: 'melee' | 'any';
    damageMin?: number;
    damageMax?: number;
    damageType?: string;
    inflicts?: { status: string; chance: number }[];
  };
  /**
   * Ce que la créature paie de sa personne. `effects` porte une magnitude
   * POSITIVE : le signe négatif est appliqué par le moteur — c'est ce qui
   * permet à une posture défensive de coûter réellement sa mobilité.
   */
  recoil?: {
    damageMin?: number;
    damageMax?: number;
    effects?: { stat: string; value: number }[];
    note?: string;
  };
  /** Déclencheurs auxquels la capacité peut répondre hors du tour de la bête. */
  reaction?: ('leave-reach' | 'incoming-attack')[];
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
  /**
   * Capacités propres à la créature. Absent = elle se rabat sur la morsure et
   * la prise au sol génériques.
   */
  abilities?: BestiaryAbility[];
  affinities?: BestiaryAffinityGroup[];
  loot?: BestiaryLoot[];
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
  /**
   * Section du catalogue d'alchimie où la fiche est rangée (cf. vue Alchemy).
   * Absent = 'potion'.
   */
  category?: 'potion' | 'elixir' | 'tonique';
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
  /**
   * Matière dont l'objet est fait (clé de `materials.json`).
   *
   * C'est elle qui décide si un champ magnétique a prise dessus : seuls le fer
   * et l'acier sont ferromagnétiques. Une chevalière d'or et un astrolabe de
   * bronze sont donc en métal sans être saisissables — la physique le dit, on
   * n'a plus à l'écrire objet par objet.
   *
   * Absente pour ce qui n'est pas fait d'une matière du catalogue (bois, cuir,
   * plomb) : ces objets ne sont simplement pas concernés.
   */
  material?: string;
  /** Catégorie d'arme (armes uniquement) : pilote le maniement et les emplacements. */
  weaponCategory?: WeaponCategoryKey;
  /** Dégâts minimum / maximum (armes uniquement). */
  minDamage?: number;
  maxDamage?: number;
  /**
   * Sacs à dos uniquement : capacité de charge ajoutée (kg) et/ou allègement du
   * contenu (%). Dérivés au build des champs `info` 'capacity' et 'lightening'
   * de la fiche — celle-ci reste la source unique des règles de portage.
   */
  capacityBonus?: number;
  weightReductionPct?: number;
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
  /**
   * Matière dont l'objet est fait (clé de `materials.json`).
   *
   * Source UNIQUE : la bande « Caractéristiques » la rend à la volée, on ne la
   * recopie pas dans `info` — deux écritures de la même chose finiraient par
   * diverger.
   */
  material?: string;
  /**
   * Section de la page d'index où la fiche est rangée, pour les collections
   * plates dont les catégories ne sont pas des dossiers (équipement :
   * 'outils' | 'soins'). Inutile pour les ressources naturelles, rangées par dossier.
   */
  category?: string;
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

/** Clés de catégorie d'armure (alignées sur armor_category.json). */
export type ArmorCategoryKey = 'clothing' | 'light' | 'medium' | 'heavy' | 'shield';

/**
 * Une catégorie d'armure. Pendant de `WeaponCategoryDef` : ce qu'une classe
 * apprend à porter s'énonce par catégorie, jamais set par set.
 */
export interface ArmorCategoryDef {
  id: number;
  key: ArmorCategoryKey;
  /** Libellé affiché (FR). */
  name: string;
  /**
   * La catégorie s'apprend-elle ? Faux pour les vêtements : une robe d'érudit
   * n'est pas une armure, et exiger de la « maîtriser » ferait dire à la fiche
   * qu'un mage porte mal sa propre robe.
   */
  requiresProficiency: boolean;
  /** Ce que la catégorie recouvre, en une phrase. */
  description: string;
  /** Quelques pièces représentatives, pour situer la catégorie à la table. */
  examples: string[];
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
  /**
   * Catégorie du set (cf. armor_category.json). C'est elle, et non les valeurs
   * de protection, qui décide si le porteur sait ce qu'il fait : les classes
   * énoncent leurs maîtrises par catégorie (`ClassDef.armorProficiencies`).
   */
  armorCategory?: ArmorCategoryKey;
  /**
   * Matière dont l'objet est fait (clé de `materials.json`).
   *
   * C'est elle qui décide si un champ magnétique a prise dessus : seuls le fer
   * et l'acier sont ferromagnétiques. Une chevalière d'or et un astrolabe de
   * bronze sont donc en métal sans être saisissables — la physique le dit, on
   * n'a plus à l'écrire objet par objet.
   *
   * Absente pour ce qui n'est pas fait d'une matière du catalogue (bois, cuir,
   * plomb) : ces objets ne sont simplement pas concernés.
   */
  material?: string;
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
  /**
   * Matière dont l'objet est fait (clé de `materials.json`).
   *
   * C'est elle qui décide si un champ magnétique a prise dessus : seuls le fer
   * et l'acier sont ferromagnétiques. Une chevalière d'or et un astrolabe de
   * bronze sont donc en métal sans être saisissables — la physique le dit, on
   * n'a plus à l'écrire objet par objet.
   *
   * Absente pour ce qui n'est pas fait d'une matière du catalogue (bois, cuir,
   * plomb) : ces objets ne sont simplement pas concernés.
   */
  material?: string;
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
  /**
   * Matière du projectile (clé de `materials.json`). C'est elle qui dit
   * si un champ le saisit : les billes de fronde sont en plomb, donc hors
   * catalogue et hors de portée d'un aimant.
   */
  material?: string;
  /** Catégories d'armes capables de tirer cette munition. */
  compatibleWith?: WeaponCategoryKey[];
  /** Bande « Caractéristiques » : champs libres (lot, rareté…). */
  info?: ResourceInfoField[];
  properties?: string[];
  notes?: string[];
}

/* ──────────────────────────────────────────
   MATÉRIAUX DE TERRE
   Source : public/resources/json/materials.json

   Le domaine de la Terre n'a pas un sort par matériau : il a un sort par
   FAMILLE, dont la saveur vient de ce qu'on façonne réellement. Ce qui décide,
   c'est la géologie sous les pieds et ce que le lanceur a étudié.
─────────────────────────────────────────── */

/** Famille de matériau : un sort de Terre puise dans une seule d'entre elles. */
export type MaterialFamilyKey =
  /** Façonnables par le domaine de la Terre. */
  | 'stone' | 'metal' | 'crystal' | 'sand'
  /** Matières du monde qu'aucun sort ne conjure : elles nomment les objets. */
  | 'wood' | 'leather' | 'fibre' | 'glass';

export interface MaterialFamily {
  key: MaterialFamilyKey;
  name: string;
  description: string;
}

/** Un matériau du catalogue, avec ce qu'il vaut une fois façonné. */
export interface Material {
  key: string;
  name: string;
  family: MaterialFamilyKey;
  /** Comment la matière se forme, pour la fiche. */
  formation: string;
  /** Sa propriété physique réelle, en une ligne. */
  property: string;
  /** Ce qu'elle donne en jeu, en toutes lettres. */
  effect: string;
  /**
   * Facteurs multiplicatifs, dans la même chaîne que la météo et le moment de
   * la journée (cf. `ambienceDamageFactor`) : une pierre tendre coûte moins et
   * protège moins, l'obsidienne tranche mieux et casse plus vite.
   */
  defenseFactor: number;
  damageFactor: number;
  manaFactor: number;
  /**
   * Type de dégâts imposé par la matière. Dans ce domaine, ce n'est jamais le
   * sort qui décide : l'obsidienne tranche, le granite écrase, le rubis brûle.
   */
  damageType: string;
  /** Faiblesses et résistances que la matière transmet à ce qu'elle protège. */
  weaknesses?: string[];
  resistances?: string[];
  /** Statuts que la matière tient à distance (améthyste → peur, charme). */
  cleanses?: string[];
  /**
   * Teinte de la matière, pour la dessiner sur le plateau.
   *
   * C'est ce qui rend le choix de matériau lisible d'un coup d'œil : un mur
   * d'obsidienne ne ressemble pas à un mur de marbre, et le joueur d'en face
   * doit pouvoir le voir sans survoler la case.
   */
  color: string;
  /**
   * Ce que la matière VAUT, en absolu — pas en pourcentage d'un chiffre écrit
   * sur le sort.
   *
   * C'est la spécificité du domaine de la Terre : ailleurs, le palier dit les
   * dégâts et le reste module ; ici, c'est la MATIÈRE qui les dit, et le palier
   * ne fait que dire combien on en façonne (`materialScale`). Un mage qui
   * change de pierre change vraiment d'arme.
   */
  damage: { min: number; max: number };
  /** Ce qu'elle protège, en absolu, sur la même échelle. */
  defense: number;
  /**
   * Ce qu'elle oppose à la MAGIE, quand elle y oppose quelque chose.
   *
   * **Absent pour la plupart des pierres** : une paroi arrête les coups, pas
   * les sorts. Les métaux en ont un peu, les cristaux beaucoup — ce sont eux
   * qui entrent en résonance. Un sort qui accorde de la défense magique n'en
   * accorde donc AUCUNE s'il est façonné dans une matière qui n'en a pas.
   */
  magicDefense?: number;
  /**
   * Ce qu'elle coûte en VITESSE à qui la porte — sa densité, en somme.
   *
   * C'est le contrepoids de la défense : l'or est le plus lourd des métaux
   * courants et protège mal, ce qui en fait délibérément une mauvaise armure.
   * L'ardoise, qui se clive en plaques minces, suit le corps.
   */
  speedPenalty: number;
  /**
   * Un aimant a-t-il prise dessus ?
   *
   * **Fer et acier seulement.** Le bronze, le cuivre, l'étain, l'or, l'argent
   * et le tungstène sont des métaux, mais aucun champ magnétique ne les tient —
   * c'est de la physique, pas une convenance. C'est cette propriété, et non un
   * drapeau posé à la main sur chaque objet, qui décide de ce qu'Attire-métal
   * peut arracher.
   */
  ferromagnetic: boolean;
  /** Rareté de l'étude : 1 courant, 2 rare, 3 précieux. */
  studyCost: number;
  /**
   * Matériaux à avoir étudiés AVANT celui-ci. Un alliage n'existe pas dans le
   * sol : le bronze demande le cuivre et l'étain.
   */
  requires?: string[];
  /** Régions où la matière se trouve vraiment. Vide = nulle part (alliage). */
  native: string[];
}

/** La géologie plausible d'une région, pour peupler une scène d'un clic. */
export interface MaterialRegion {
  key: string;
  name: string;
  description: string;
  materials: string[];
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