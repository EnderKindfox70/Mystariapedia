import { Combatant, CombatAbility, CombatAction, Encounter, GridPos, Team } from '../combat.types';
import { cellsInShape, occupiedCells, reachableCells, unitToCellMeters } from '../grid';
import {
  abilityDamageRanges,
  abilityHealAmount,
  aims,
  applyAction,
  cannotUse,
  expectedHitFactor,
  hitThreshold,
  currentUnit,
  damageReduction,
  effectiveStat,
  findUnit,
  isOver,
  affordableMovement,
  pendingStrikeTargets,
  teleportRangeOf,
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

/**
 * Combien un buff vaut, rapporté à la meilleure attaque disponible.
 *
 * Juste au-dessus de 1 : on se prépare au premier tour, puis on frappe.
 */
const BUFF_PREFERENCE = 1.15;

/* ── Lecture d'état ────────────────────────────────────────────────────────── */

const alive = (enc: Encounter, team?: Team): Combatant[] =>
  enc.combatants.filter((c) => !c.down && c.hp > 0 && (!team || c.team === team));

const enemiesOf = (enc: Encounter, unit: Combatant): Combatant[] =>
  alive(enc).filter((c) => c.team !== unit.team);

const alliesOf = (enc: Encounter, unit: Combatant): Combatant[] =>
  alive(enc).filter((c) => c.team === unit.team && c.id !== unit.id);

/**
 * Dégâts moyens attendus sur cette cible-ci : défense comprise, JET COMPRIS,
 * sans compter le surplus.
 *
 * Le jet de toucher doit entrer ici, sinon l'IA préférerait systématiquement la
 * grosse frappe hasardeuse au coup sûr — et le rapport mesurerait un jeu que
 * personne ne jouerait ainsi.
 */
function expectedDamage(actor: Combatant, ability: CombatAbility, target: Combatant): number {
  const accuracy = aims(ability) ? expectedHitFactor(hitThreshold(actor, ability, target)) : 1;
  let total = 0;
  for (const range of abilityDamageRanges(actor, ability)) {
    const avg = (range.min + range.max) / 2;
    total += avg * accuracy * (1 - damageReduction(target, range.type));
  }
  // Frapper un mourant pour trois fois ses PV restants ne vaut pas mieux que
  // de l'achever : sans ce plafond, l'IA gaspille ses grosses frappes.
  return Math.min(total, target.hp);
}

/** Dégâts bruts annoncés, avant tout ce qui les amortit. Sert au rapport. */
function rawDamage(actor: Combatant, ability: CombatAbility): number {
  return abilityDamageRanges(actor, ability).reduce((sum, r) => sum + (r.min + r.max) / 2, 0);
}

/** Cibles effectivement touchées si la capacité est centrée sur `at`. */
function unitsHit(enc: Encounter, ability: CombatAbility, at: GridPos, from: Combatant): Combatant[] {
  if (ability.shape.kind === 'single' || ability.shape.kind === 'self') {
    const one = alive(enc).find((c) => c.pos.x === at.x && c.pos.y === at.y);
    return one ? [one] : [];
  }
  const cells = new Set(
    cellsInShape(ability.shape, from.pos, at, enc.grid).map((c) => `${c.x},${c.y}`),
  );
  return alive(enc).filter((c) => cells.has(`${c.pos.x},${c.pos.y}`));
}

/**
 * Où pointer cette capacité pour frapper `enemy`.
 *
 * Une attaque ordinaire se vise sur la cible. Une TÉLÉPORTATION, non : son `at`
 * est la case d'ARRIVÉE, et viser la case occupée par l'ennemi fait échouer le
 * saut. Le moteur refuse alors l'action sans rien consommer — l'IA la
 * reproposerait indéfiniment et le combat s'enliserait jusqu'à la limite de
 * tours. On cherche donc une case libre au contact de la cible, ce que ferait
 * n'importe quel joueur avec un sort de ce genre.
 */
function aimFor(
  enc: Encounter,
  unit: Combatant,
  ability: CombatAbility,
  enemy: Combatant,
): GridPos | null {
  if (!ability.teleport) return cannotUse(enc, unit, ability, enemy.pos) ? null : enemy.pos;

  const taken = new Set(
    enc.combatants.filter((c) => c.id !== unit.id).flatMap((c) => occupiedCells(c).map((p) => `${p.x},${p.y}`)),
  );
  const jump = teleportRangeOf(ability);
  let best: GridPos | null = null;
  let bestCost = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const cell = { x: enemy.pos.x + dx, y: enemy.pos.y + dy };
      if (cell.x < 0 || cell.y < 0 || cell.x >= enc.grid.width || cell.y >= enc.grid.height) continue;
      if (taken.has(`${cell.x},${cell.y}`)) continue;
      const cost = unitToCellMeters(unit, cell);
      if (cost > jump + 1e-6 || cost >= bestCost) continue;
      if (cannotUse(enc, unit, ability, cell)) continue;
      best = cell;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Où atterrir pour ÉCHAPPER à `threat`, avec une téléportation jouée en
 * réaction.
 *
 * C'est l'exact inverse de la visée offensive : un Pas dimensionnel joué pour
 * parer doit sortir de l'allonge, pas s'y jeter. Viser l'assaillant ferait
 * échouer le saut, et le moteur rendrait la main sans rien consommer.
 */
function escapeFrom(enc: Encounter, unit: Combatant, ability: CombatAbility, threat: Combatant): GridPos | null {
  const taken = new Set(
    enc.combatants.filter((c) => c.id !== unit.id).flatMap((c) => occupiedCells(c).map((p) => `${p.x},${p.y}`)),
  );
  const jump = teleportRangeOf(ability);
  let best: GridPos | null = null;
  let bestGain = unitToCellMeters(threat, unit.pos);
  for (let x = 0; x < enc.grid.width; x++) {
    for (let y = 0; y < enc.grid.height; y++) {
      const cell = { x, y };
      if (taken.has(`${x},${y}`)) continue;
      if (unitToCellMeters(unit, cell) > jump + 1e-6) continue;
      const gain = unitToCellMeters(threat, cell);
      if (gain <= bestGain) continue;
      if (cannotUse(enc, unit, ability, cell)) continue;
      best = cell;
      bestGain = gain;
    }
  }
  return best;
}

/** L'unité porte-t-elle déjà l'effet de cette capacité ? Le relancer serait perdu. */
const alreadyBuffed = (unit: Combatant, ability: CombatAbility): boolean =>
  unit.effects.some((e) => e.name === ability.name);

/* ── La décision ───────────────────────────────────────────────────────────── */

interface Candidate {
  action: CombatAction;
  value: number;
  ability: CombatAbility;
  /** Dégâts bruts annoncés, pour la comptabilité du rapport. */
  raw: number;
  /** Part de ces dégâts que les défenses de la cible vont manger. */
  soaked?: number;
}

/**
 * Ce que l'unité peut faire de mieux, tout de suite, sans bouger.
 *
 * Le barème est volontairement grossier — dégâts attendus, soins utiles, buffs
 * pas encore posés. Il ne cherche pas le coup parfait : il cherche à ne pas
 * jouer stupidement, ce qui suffit à faire ressortir un déséquilibre de fiche.
 */
function bestPlay(enc: Encounter, unit: Combatant, allowSupport = true): Candidate | null {
  const enemies = enemiesOf(enc, unit);
  if (!enemies.length) return null;

  let best: Candidate | null = null;
  /** Buffs retenus, à départager une fois les attaques chiffrées. */
  const pending: CombatAbility[] = [];
  /** Gardes envisagées, avec le besoin de souffle qui les justifie. */
  const support: { ability: CombatAbility; urgency: number }[] = [];
  const keep = (c: Candidate) => {
    if (!best || c.value > best.value) best = c;
  };

  for (const ability of unit.abilities) {
    // La garde n'est plus un simple repli : c'est le seul geste qui refait le
    // souffle. On la joue quand la réserve est basse — sans quoi le banc
    // mesurerait des combattants qui s'épuisent sans jamais reprendre haleine,
    // c'est-à-dire un jeu que personne ne joue.
    if (ability.kind === 'guard') {
      if (!ability.restoreEndurance) continue;
      const max = unit.base.endurance;
      const manque = max - unit.endurance;
      if (unit.winded || manque >= ability.restoreEndurance) {
        // D'autant plus attirante qu'on est bas : à bout de souffle, se couvrir
        // vaut mieux que n'importe quelle frappe qu'on porterait mal.
        const besoin = unit.winded ? 2 : manque / Math.max(1, max);
        support.push({ ability, urgency: besoin });
      }
      continue;
    }

    const damages = abilityDamageRanges(unit, ability);
    const heal = abilityHealAmount(unit, ability);

    if (damages.length) {
      for (const enemy of enemies) {
        const at = aimFor(enc, unit, ability, enemy);
        if (!at) continue;
        // Une téléportation frappe DEPUIS sa case d'arrivée : c'est de là qu'il
        // faut lire la zone, sans quoi on compterait des cibles hors d'atteinte.
        const touched = ability.teleport
          ? unitsHit(enc, ability, enemy.pos, { ...unit, pos: at })
          : unitsHit(enc, ability, at, unit);
        let value = 0;
        for (const hit of touched) {
          // Une zone qui prend ses propres alliés se paie : c'est ce qui rend
          // un souffle moins évident qu'il n'en a l'air sur la fiche.
          const sign = hit.team === unit.team ? -1.2 : 1;
          value += sign * expectedDamage(unit, ability, hit);
        }
        if (value > 0) {
          keep({
            action: { type: 'use', actorId: unit.id, abilityId: ability.id, at },
            value,
            ability,
            raw: rawDamage(unit, ability) * Math.max(1, touched.length),
            soaked:
              rawDamage(unit, ability) * Math.max(1, touched.length) -
              touched.reduce((s, h) => s + expectedDamage(unit, ability, h), 0),
          });
        }
      }
      continue;
    }

    if (heal > 0) {
      const wounded = [unit, ...alliesOf(enc, unit)]
        .filter((c) => c.hp < c.base.hp)
        .sort((a, b) => a.hp / a.base.hp - b.hp / b.base.hp)[0];
      if (wounded && !cannotUse(enc, unit, ability, wounded.pos)) {
        // Un soin ne vaut que ce qu'il rend vraiment : rendre 40 PV à qui en a
        // perdu 5 n'est pas une bonne action.
        const useful = Math.min(heal, wounded.base.hp - wounded.hp);
        keep({
          action: { type: 'use', actorId: unit.id, abilityId: ability.id, at: wounded.pos },
          value: useful * 0.8,
          ability,
          raw: 0,
        });
      }
      continue;
    }

    // Buff : il ne vaut que s'il n'est pas déjà là — les effets ne s'empilent
    // pas, le relancer serait un tour perdu. On les met de côté : leur valeur
    // se juge PAR RAPPORT à ce qu'on renonce à frapper, ce qu'on ne saura
    // qu'une fois toutes les attaques évaluées.
    const buffs = !!ability.mods?.length || !!ability.enchant || !!ability.retaliate;
    if (buffs && ability.duration && !alreadyBuffed(unit, ability)) {
      pending.push(ability);
    }
  }

  // Un buff vaut un peu plus qu'une attaque — assez pour être posé au premier
  // tour, pas assez pour qu'on y passe le combat.
  //
  // Le rapporter à l'attaque, et non aux PV du porteur, est le point important :
  // adossée aux PV max, la valeur explosait chez les gros combattants, au point
  // qu'un personnage de 174 PV préférait s'enchanter indéfiniment plutôt que de
  // frapper. Le banc mesurait alors un jeu que personne ne joue.
  const reference = best ? (best as Candidate).value : 1;
  if (!allowSupport) return best;

  // Reprendre haleine vaut d'autant plus qu'on est à bout : à sec, on frappe
  // avec deux crans de précision en moins et l'on se traîne.
  for (const { ability, urgency } of support) {
    if (cannotUse(enc, unit, ability, unit.pos)) continue;
    keep({
      action: { type: 'use', actorId: unit.id, abilityId: ability.id, at: unit.pos },
      value: reference * urgency,
      ability,
      raw: 0,
    });
  }

  for (const ability of pending) {
    const on = unit.pos;
    if (cannotUse(enc, unit, ability, on)) continue;
    keep({
      action: { type: 'use', actorId: unit.id, abilityId: ability.id, at: on },
      value: reference * BUFF_PREFERENCE,
      ability,
      raw: 0,
    });
  }

  return best;
}

/** La case, à portée de jambes, qui rapproche le plus de l'ennemi le plus proche. */
function stepToward(enc: Encounter, unit: Combatant): GridPos | null {
  const enemies = enemiesOf(enc, unit);
  if (!enemies.length) return null;

  const budget = affordableMovement(unit);
  if (budget <= 0) return null;

  const cells = reachableCells(unit, budget, enc.grid, enc.terrain, enc.combatants);
  const distanceFrom = (pos: GridPos): number =>
    Math.min(...enemies.map((e) => unitToCellMeters(e, pos)));

  let bestCell: GridPos | null = null;
  let bestScore = distanceFrom(unit.pos);
  for (const { pos } of cells.values()) {
    const score = distanceFrom(pos);
    if (score < bestScore - 1e-6) {
      bestScore = score;
      bestCell = pos;
    }
  }
  return bestCell;
}

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
      .map((c) => `${c.pos.x},${c.pos.y},${c.hp},${c.mana},${c.endurance},${c.moved},${c.actionUsed ? 1 : 0}`)
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
    // 1) Une fenêtre de réaction gèle tout le reste : elle se tranche d'abord.
    if (enc.pendingReaction) {
      reactionWindows++;
      const pending = enc.pendingReaction;
      const reactor = findUnit(enc, pending.actorId);
      const source = findUnit(enc, pending.sourceId);
      let played = false;
      for (const option of reactor?.abilities ?? []) {
        if (!pending.options.includes(option.id)) continue;
        const at =
          option.teleport && source ? escapeFrom(enc, reactor!, option, source) : pending.at;
        if (!at || cannotUse(enc, reactor!, option, at)) continue;
        play({ type: 'react', abilityId: option.id, at }, reactor!.id);
        played = true;
        break;
      }
      // Une réaction que le moteur a refusée laisserait la fenêtre ouverte : on
      // passe, plutôt que de la reproposer indéfiniment.
      if (!played || stalled) play({ type: 'skipReaction' });
      continue;
    }

    // 2) Une frappe offerte se porte sur le plus mal en point : c'est elle qui
    //    transforme un avantage en élimination.
    if (enc.pendingStrike) {
      const targets = pendingStrikeTargets(enc);
      const prey = targets.sort((a, b) => a.hp - b.hp)[0];
      const striker = enc.pendingStrike.actorId;
      if (prey) play({ type: 'freeStrike', targetId: prey.id }, striker);
      else play({ type: 'skipStrike' });
      continue;
    }

    const unit = currentUnit(enc);
    if (!unit || unit.down) {
      play({ type: 'endTurn' });
      continue;
    }

    const turnKey = `${enc.round}:${enc.turnIndex}`;
    if (turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      actionsThisTurn = 0;
    }
    // Un combattant qui a déjà frappé n'a plus rien à faire de son tour : ce
    // reliquat n'est ni une approche ni un tour perdu, et le compter comme tel
    // ferait passer pour mou un combat où tout le monde agit.
    if (unit.actionUsed) {
      play({ type: 'endTurn' });
      continue;
    }
    if (++actionsThisTurn > maxActionsPerTurn) {
      play({ type: 'endTurn' });
      continue;
    }

    // 3) Frapper si l'on peut. On exclut d'abord les soins et les buffs : ils
    //    sont jouables à n'importe quelle distance, donc les proposer ici ferait
    //    passer un combattant hors de portée son tour à se préparer plutôt qu'à
    //    marcher — et il ne rejoindrait jamais l'ennemi.
    const play1 = bestPlay(enc, unit, false);
    if (play1) {
      const t = tally.get(unit.id)!;
      if (play1.raw > 0) {
        rawAttempted += play1.raw;
        soakedTotal += Math.max(0, play1.soaked ?? 0);
        t.attacks++;
        if (play1.ability.kind === 'spell') t.spells++;
        else if (play1.ability.kind === 'class') t.classSkills++;
        else if (play1.ability.kind === 'weapon') t.basicAttacks++;
      }
      play(play1.action, unit.id);
      if (stalled) play({ type: 'endTurn' });
      continue;
    }

    // 4) Sinon se rapprocher, et retenter au tour de boucle suivant.
    const step = stepToward(enc, unit);
    if (step) {
      play({ type: 'move', actorId: unit.id, to: step }, unit.id);
      if (!stalled && bestPlay(enc, findUnit(enc, unit.id)!, false)) continue;
      // Avancer sans pouvoir frapper n'est pas un tour perdu : c'est le prix de
      // la distance. On le compte à part, sans quoi tout combat qui commence
      // loin passerait pour un combat mou.
      tally.get(unit.id)!.approachTurns++;
      play({ type: 'endTurn' });
      continue;
    }

    // 5) Hors de portée et immobile : c'est le moment de se préparer, pas de
    //    passer son tour. Un buff posé maintenant servira au contact.
    const support = bestPlay(enc, unit, true);
    if (support) {
      play(support.action, unit.id);
      if (stalled) play({ type: 'endTurn' });
      continue;
    }

    // 6) Rien à faire : on note POURQUOI, c'est là que se lit l'économie.
    const t = tally.get(unit.id)!;
    t.idleTurns++;
    const starved = starvation(enc, unit);
    if (starved === 'mana') t.manaStarvedTurns++;
    if (starved === 'endurance') t.enduranceStarvedTurns++;
    play({ type: 'endTurn' });
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
