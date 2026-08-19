import { Combatant, CombatAction, Encounter, Team } from '../combat.types';
import { aliveIn, decide } from '../tactician';
import {
  abilityDamageRanges,
  applyAction,
  cannotUse,
  currentUnit,
  findUnit,
  isOver,
  pendingStrikeTargets,
} from '../rules';

/* ──────────────────────────────────────────────────────────────────────────
   L'ARÈNE — faire jouer le moteur tout seul, en masse.

   Équilibrer à la main ne dit rien : une fiche se lit bien et se joue mal, et
   l'inverse est plus vrai encore. Ce module prend une rencontre montée, la
   joue jusqu'au bout avec une IA sommaire, et rend des CHIFFRES : combien de
   tours, qui gagne, avec quelle marge, ce que l'armure a mangé, à quel moment
   les réserves lâchent.

   Il n'ajoute AUCUNE règle. Il ne fait qu'appeler `applyAction`, exactement
   comme la vue : ce qu'il mesure est donc ce qui se passera vraiment à table.
   Une correction du moteur change le rapport dès la prochaine exécution, sans
   qu'on ait à retoucher quoi que ce soit ici.

   Ce que l'IA n'est PAS : un joueur. Elle vise le plus rentable à l'instant,
   sans plan ni économie de ressources. Les chiffres qu'elle produit sont donc
   un PLANCHER de complexité — si un combat est déjà intéressant joué bêtement,
   il le restera joué bien. À l'inverse, un déséquilibre qu'elle trouve, un
   joueur le trouvera aussi.
─────────────────────────────────────────────────────────────────────────── */

/** Ce qu'un combattant a fait, et subi, pendant un combat. */
export interface UnitReport {
  id: string;
  name: string;
  team: Team;
  level: number;
  /** Étiquette de regroupement : classe, ou nom d'espèce. */
  kind: string;
  maxHp: number;
  /** PV restants à la fin (0 = tombé). */
  hp: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  /** Actions offensives portées (hors déplacements et tours passés). */
  attacks: number;
  /** Dont attaques de base (arme ou poing). */
  basicAttacks: number;
  spells: number;
  /** Dont compétences de classe — celles qui coûtent cher en souffle. */
  classSkills: number;
  /** Tours passés à courir après l'adversaire sans pouvoir le toucher. */
  approachTurns: number;
  /** Tours vraiment perdus : ni action, ni déplacement utile. */
  idleTurns: number;
  /** Tours où le mana manquait pour le meilleur sort connu. */
  manaStarvedTurns: number;
  /** Tours où l'endurance manquait pour la meilleure action connue. */
  enduranceStarvedTurns: number;
  manaSpent: number;
  /** Réserve de mana au départ (0 pour qui n'en a pas). */
  maxMana: number;
  enduranceSpent: number;
  /** Réserve d'endurance au départ. */
  maxEndurance: number;
  /** Plus bas niveau d'endurance atteint : à quel point on a tiré sur la corde. */
  enduranceFloor: number;
  /** Tour où l'unité est tombée, si elle est tombée. */
  fellOnRound?: number;
}

/** Le compte rendu d'un combat. */
export interface FightReport {
  /** Graine : rejouer ce combat exactement, c'est repasser la même. */
  seed: number;
  rounds: number;
  /** Équipe victorieuse, ou `timeout` si personne n'a conclu à temps. */
  winner: Team | 'timeout';
  units: UnitReport[];
  /** Dégâts bruts annoncés par les attaques portées, avant défense et esquive. */
  rawDamageAttempted: number;
  /** Dégâts réellement encaissés. L'écart, c'est l'armure et les esquives. */
  damageApplied: number;
  /** Dégâts que les défenses ont mangés, sur ce que les attaques annonçaient. */
  armorAbsorption: number;
  /** Round du premier point de vie perdu : ce qui précède n'est que l'approche. */
  firstBloodRound: number;
  /** Part des PV que l'équipe gagnante conserve (0–1). La marge de victoire. */
  winnerHpShare: number;
  /** Nombre de fenêtres de réaction ouvertes pendant le combat. */
  reactionWindows: number;
}

export interface ArenaOptions {
  /** Au-delà, le combat est déclaré non conclu. */
  maxRounds?: number;
  /**
   * Garde-fou : un tour ne peut pas consommer plus d'actions que ça. Protège
   * d'une IA qui tournerait en rond sur une action que le moteur refuse.
   */
  maxActionsPerTurn?: number;
}

const DEFAULTS = { maxRounds: 40, maxActionsPerTurn: 16 } as const;

/* ── Lecture d'état ────────────────────────────────────────────────────────── */

const alive = (enc: Encounter, team?: Team): Combatant[] => aliveIn(enc, team);

/**
 * Combien un buff vaut, rapporté à la meilleure attaque disponible.
 *
 * Juste au-dessus de 1 : on se prépare au premier tour, puis on frappe.
 */
const BUFF_PREFERENCE = 1.15;

/* ── La boucle ─────────────────────────────────────────────────────────────── */

/** Accumulateur privé, converti en `UnitReport` à la fin. */
interface Tally {
  damageDealt: number;
  approachTurns: number;
  healingDone: number;
  attacks: number;
  basicAttacks: number;
  spells: number;
  classSkills: number;
  idleTurns: number;
  manaStarvedTurns: number;
  enduranceStarvedTurns: number;
  manaSpent: number;
  maxMana: number;
  enduranceSpent: number;
  maxEndurance: number;
  enduranceFloor: number;
  fellOnRound?: number;
}

const emptyTally = (maxMana: number, maxEndurance: number): Tally => ({
  damageDealt: 0,
  approachTurns: 0,
  healingDone: 0,
  attacks: 0,
  basicAttacks: 0,
  spells: 0,
  classSkills: 0,
  idleTurns: 0,
  manaStarvedTurns: 0,
  enduranceStarvedTurns: 0,
  manaSpent: 0,
  maxMana,
  enduranceSpent: 0,
  maxEndurance,
  enduranceFloor: maxEndurance,
});

/**
 * Pourquoi ce tour n'a rien donné : réserve vide, ou simplement rien à portée ?
 *
 * La distinction est le cœur du rapport sur l'économie. Un mage qui passe son
 * tour parce qu'il court après sa cible ne dit rien ; le même qui le passe
 * parce qu'il est à sec dit que sa réserve est mal calibrée.
 */
function starvation(enc: Encounter, unit: Combatant): 'mana' | 'endurance' | null {
  let mana = false;
  let endurance = false;
  for (const ability of unit.abilities) {
    if (ability.kind === 'guard' || !abilityDamageRanges(unit, ability).length) continue;
    // On regarde le refus tel que le moteur le formule, sur une cible fictive
    // placée sous les pieds : seules les réserves sont en cause ici.
    const reason = cannotUse(enc, unit, ability, unit.pos) ?? '';
    if (reason.startsWith('Mana insuffisant')) mana = true;
    if (reason.startsWith('Endurance insuffisante')) endurance = true;
  }
  return endurance ? 'endurance' : mana ? 'mana' : null;
}

/**
 * Joue une rencontre déjà montée jusqu'à sa conclusion.
 *
 * La rencontre passée n'est pas modifiée : comme le moteur, l'arène travaille
 * sur des copies. Une même graine rejoue exactement le même combat.
 */
export function fight(encounter: Encounter, options: ArenaOptions = {}): FightReport {
  const maxRounds = options.maxRounds ?? DEFAULTS.maxRounds;
  const maxActionsPerTurn = options.maxActionsPerTurn ?? DEFAULTS.maxActionsPerTurn;

  let enc = applyAction(encounter, { type: 'start' });

  const tally = new Map<string, Tally>();
  for (const unit of enc.combatants) tally.set(unit.id, emptyTally(unit.mana, unit.endurance));
  const maxHp = new Map(enc.combatants.map((c) => [c.id, c.base.hp]));
  const damageTaken = new Map(enc.combatants.map((c) => [c.id, 0]));

  let rawAttempted = 0;
  let soakedTotal = 0;
  let applied = 0;
  let firstBlood = 0;
  let reactionWindows = 0;
  let actionsThisTurn = 0;
  let lastTurnKey = '';

  /**
   * Empreinte de l'état qui compte pour le déroulement. Le journal en est exclu
   * : une action REFUSÉE y écrit quand même sa ligne d'explication, et on
   * veut justement pouvoir reconnaître qu'elle n'a rien fait.
   */
  const fingerprint = (): string =>
    `${enc.round}/${enc.turnIndex}/${enc.pendingStrike?.actorId ?? ''}/${enc.pendingReaction?.actorId ?? ''}/` +
    enc.combatants
      .map(
        (c) =>
          `${c.pos.x},${c.pos.y},${c.hp},${c.mana},${c.endurance},${c.moved},` +
          `${c.actionUsed ? 1 : 0}${c.bonusActionUsed ? 1 : 0}`,
      )
      .join(';');

  let stalled = false;

  /** Applique une action en mesurant ce qu'elle a coûté à chacun. */
  const play = (action: CombatAction, actorId?: string): void => {
    const signature = fingerprint();
    const before = new Map(
      enc.combatants.map((c) => [c.id, { hp: c.hp, mana: c.mana, endurance: c.endurance }]),
    );
    enc = applyAction(enc, action);

    const actor = actorId ? tally.get(actorId) : undefined;
    for (const unit of enc.combatants) {
      const was = before.get(unit.id);
      if (!was) continue;
      const lost = was.hp - unit.hp;
      if (lost > 0) {
        applied += lost;
        if (!firstBlood) firstBlood = enc.round;
        damageTaken.set(unit.id, (damageTaken.get(unit.id) ?? 0) + lost);
        // Les dégâts d'un tour sont mis au compte de qui a agi — y compris le
        // contre-coup qu'il s'inflige, qui est bien le prix de SON action.
        if (actor && unit.id !== actorId) actor.damageDealt += lost;
      } else if (lost < 0 && actor && unit.id !== actorId) {
        actor.healingDone += -lost;
      }
      if (unit.down && !tally.get(unit.id)!.fellOnRound) {
        tally.get(unit.id)!.fellOnRound = enc.round;
      }
      const spent = was.mana - unit.mana;
      if (spent > 0 && unit.id === actorId && actor) actor.manaSpent += spent;
      // Le souffle se dépense ET se reprend : on ne compte que ce qui SORT,
      // sinon la récupération de chaque tour effacerait la dépense.
      const souffle = was.endurance - unit.endurance;
      const compte = tally.get(unit.id);
      if (compte) {
        if (souffle > 0) compte.enduranceSpent += souffle;
        compte.enduranceFloor = Math.min(compte.enduranceFloor, unit.endurance);
      }
    }

    // Une action que le moteur a refusée laisse le monde exactement tel quel.
    // La reproposer serait une boucle : le tour se termine.
    stalled = action.type !== 'endTurn' && fingerprint() === signature;

    // Le journal grossit à chaque ligne, et `applyAction` recopie la rencontre
    // entière à chaque appel : sans élagage, le coût d'un combat croît avec son
    // carré. On garde de quoi enquêter, pas l'intégralité.
    if (enc.log.length > 60) enc.log = enc.log.slice(-40);
  };

  while (!isOver(enc) && enc.round <= maxRounds) {
    if (enc.pendingReaction) reactionWindows++;

    // TOUT passe par le tacticien, sans exception : c'est ce qui garantit que
    // ce rapport décrit l'adversaire qu'on affronte réellement à la table.
    const choix = decide(enc);
    if (!choix) break;

    const turnKey = `${enc.round}:${enc.turnIndex}`;
    if (turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      actionsThisTurn = 0;
    }
    if (++actionsThisTurn > maxActionsPerTurn) {
      play({ type: 'endTurn' });
      continue;
    }

    const t = choix.actorId ? tally.get(choix.actorId) : undefined;
    if (t) {
      if (choix.intent === 'attack' && choix.raw) {
        rawAttempted += choix.raw;
        soakedTotal += Math.max(0, choix.soaked ?? 0);
        t.attacks++;
        const kind = choix.ability?.kind;
        if (kind === 'spell') t.spells++;
        else if (kind === 'class') t.classSkills++;
        else if (kind === 'weapon') t.basicAttacks++;
      }
      // Avancer sans pouvoir frapper n'est pas un tour perdu : c'est le prix de
      // la distance. On le compte à part, sans quoi tout combat qui commence
      // loin passerait pour un combat mou.
      if (choix.intent === 'move') t.approachTurns++;
      if (choix.intent === 'endTurn') {
        const unit = choix.actorId ? findUnit(enc, choix.actorId) : undefined;
        // Un combattant qui a déjà frappé n'a rien perdu : son tour est fait.
        if (unit && !unit.actionUsed && !unit.down) {
          t.idleTurns++;
          const starved = starvation(enc, unit);
          if (starved === 'mana') t.manaStarvedTurns++;
          if (starved === 'endurance') t.enduranceStarvedTurns++;
        }
      }
    }

    play(choix.action, choix.actorId);
    // Une action que le moteur a refusée laisse le monde tel quel : la
    // reproposer serait une boucle.
    if (stalled) play({ type: 'endTurn' });
  }

  const survivors = alive(enc);
  const teams = [...new Set(survivors.map((c) => c.team))];
  const winner: Team | 'timeout' = teams.length === 1 ? teams[0] : 'timeout';

  const winners = winner === 'timeout' ? [] : enc.combatants.filter((c) => c.team === winner);
  const winnerHpShare = winners.length
    ? winners.reduce((s, c) => s + Math.max(0, c.hp), 0) /
      winners.reduce((s, c) => s + (maxHp.get(c.id) ?? c.base.hp), 0)
    : 0;

  return {
    seed: encounter.seed,
    rounds: enc.round,
    winner,
    rawDamageAttempted: rawAttempted,
    damageApplied: applied,
    armorAbsorption: rawAttempted > 0 ? soakedTotal / rawAttempted : 0,
    firstBloodRound: firstBlood,
    winnerHpShare,
    reactionWindows,
    units: enc.combatants.map((c) => {
      const t = tally.get(c.id)!;
      return {
        id: c.id,
        name: c.name,
        team: c.team,
        level: c.level ?? 1,
        kind: c.role ?? c.name,
        maxHp: maxHp.get(c.id) ?? c.base.hp,
        hp: Math.max(0, c.hp),
        damageDealt: t.damageDealt,
        damageTaken: damageTaken.get(c.id) ?? 0,
        healingDone: t.healingDone,
        approachTurns: t.approachTurns,
        attacks: t.attacks,
        basicAttacks: t.basicAttacks,
        spells: t.spells,
        classSkills: t.classSkills,
        idleTurns: t.idleTurns,
        manaStarvedTurns: t.manaStarvedTurns,
        enduranceStarvedTurns: t.enduranceStarvedTurns,
        manaSpent: t.manaSpent,
        maxMana: t.maxMana,
        enduranceSpent: t.enduranceSpent,
        maxEndurance: t.maxEndurance,
        enduranceFloor: t.enduranceFloor,
        fellOnRound: t.fellOnRound,
      };
    }),
  };
}

/* ── Agrégats ──────────────────────────────────────────────────────────────── */

/** Statistiques d'une série de combats. Un combat isolé ne prouve rien. */
export interface SeriesStats {
  fights: number;
  /** Tours médians. La médiane, pas la moyenne : un combat qui s'éternise ne
   *  doit pas déplacer le chiffre à lui seul. */
  medianRounds: number;
  meanRounds: number;
  minRounds: number;
  maxRounds: number;
  /** Part de combats non conclus dans le temps imparti. */
  timeoutRate: number;
  /** Part de victoires de l'équipe `allies`. */
  alliesWinRate: number;
  /** PV moyens conservés par le vainqueur (0–1). La marge. */
  meanWinnerHpShare: number;
  /** Part des dégâts annoncés qui atteint vraiment sa cible. */
  connectRate: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export function summarize(reports: FightReport[]): SeriesStats {
  const rounds = reports.map((r) => r.rounds);
  const concluded = reports.filter((r) => r.winner !== 'timeout');
  return {
    fights: reports.length,
    medianRounds: median(rounds),
    meanRounds: mean(rounds),
    minRounds: Math.min(...rounds),
    maxRounds: Math.max(...rounds),
    timeoutRate: reports.filter((r) => r.winner === 'timeout').length / reports.length,
    alliesWinRate: concluded.length
      ? concluded.filter((r) => r.winner === 'allies').length / concluded.length
      : 0,
    meanWinnerHpShare: mean(concluded.map((r) => r.winnerHpShare)),
    connectRate: mean(
      reports.filter((r) => r.rawDamageAttempted > 0).map((r) => r.damageApplied / r.rawDamageAttempted),
    ),
  };
}
