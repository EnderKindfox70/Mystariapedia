import { Combatant, CombatAbility, CombatAction, Encounter, GridPos, Team } from './combat.types';
import { cellsInShape, occupiedCells, reachableCells, unitToCellMeters } from './grid';
import {
  abilityDamageRanges,
  abilityHealAmount,
  affordableMovement,
  aims,
  cannotUse,
  currentUnit,
  damageReduction,
  expectedHitFactor,
  findUnit,
  hitThreshold,
  isOver,
  allegianceOf,
  controllerOf,
  pendingStrikeTargets,
  swapPartnerAt,
  teleportRangeOf,
  unitsInEffect,
  terrainFor,
} from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   LE TACTICIEN — ce que ferait un combattant laissé à lui-même.

   UN SEUL CERVEAU, DEUX USAGES. Il pilote les adversaires à la table, et il
   pilote les combattants du banc d'essai. C'est délibéré et c'est le point
   important du module : si les deux divergeaient, le rapport d'équilibrage
   mesurerait un joueur qui n'existe pas, et les chiffres qu'on en tire ne
   diraient rien de ce qui se passe vraiment en partie.

   IL NE CONNAÎT QUE `applyAction`. Il ne lit ni n'écrit l'état directement : il
   REGARDE une rencontre et RÉPOND une action. Le moteur reste seul juge de ce
   qui est légal — le tacticien peut proposer l'impossible sans rien casser.

   CE QU'IL N'EST PAS : un joueur. Il vise le plus rentable à l'instant, sans
   plan, sans feinte, sans économiser ses réserves au-delà de ce que le tour
   exige. C'est un adversaire honnête, pas un adversaire retors.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Combien un buff vaut, rapporté à la meilleure attaque disponible.
 *
 * Juste au-dessus de 1 : on se prépare au premier tour, puis on frappe. Adossée
 * aux PV du porteur, cette valeur explosait chez les gros combattants, au point
 * qu'un personnage de 174 PV préférait s'enchanter indéfiniment plutôt que de
 * frapper.
 */
const BUFF_PREFERENCE = 1.15;

/* ── Lecture d'état ────────────────────────────────────────────────────────── */

export const aliveIn = (enc: Encounter, team?: Team): Combatant[] =>
  enc.combatants.filter((c) => !c.down && c.hp > 0 && (!team || c.team === team));

/**
 * Adversaires et compagnons se lisent sur l'ALLÉGEANCE, pas sur le camp
 * d'origine : un pantin se retourne contre les siens, et les siens le savent.
 *
 * Les règles autorisent bien un camp à frapper le pantin qu'il tient — c'est
 * ainsi qu'on coupe les fils, et sans quoi certains combats ne finiraient pas.
 * Mais le tacticien ne le CHOISIT pas de lui-même : on ne casse pas son propre
 * outil tant qu'il reste un adversaire debout. Le MJ garde la main pour le
 * faire, la règle ne l'en empêche pas.
 */
export const enemiesOf = (enc: Encounter, unit: Combatant): Combatant[] =>
  aliveIn(enc).filter(
    (c) =>
      allegianceOf(enc, c) !== allegianceOf(enc, unit) &&
      controllerOf(enc, c)?.team !== unit.team,
  );

const alliesOf = (enc: Encounter, unit: Combatant): Combatant[] =>
  aliveIn(enc).filter((c) => allegianceOf(enc, c) === allegianceOf(enc, unit) && c.id !== unit.id);

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
  // Une détonation de marques ne se lit pas sur la grille : ses cibles sont
  // celles que `from` a marquées, où qu'elles soient. Le moteur sait déjà les
  // trouver, et le tacticien doit compter les mêmes — sinon il croit ce sort
  // vide et ne le lance jamais.
  if (ability.shape.kind === 'marked') return unitsInEffect(enc, from, ability, at);
  if (ability.shape.kind === 'single' || ability.shape.kind === 'self') {
    const one = aliveIn(enc).find((c) => c.pos.x === at.x && c.pos.y === at.y);
    return one ? [one] : [];
  }
  const cells = new Set(
    cellsInShape(ability.shape, from.pos, at, enc.grid).map((c) => `${c.x},${c.y}`),
  );
  return aliveIn(enc).filter((c) => cells.has(`${c.pos.x},${c.pos.y}`));
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
 * Avec QUI permuter pour se soustraire à `threat`, quand la réaction est un
 * échange de place.
 *
 * L'ordre de préférence est celui du bon sens : si l'assaillant lui-même porte
 * la marque, on le tire hors de son élan — son coup se perd. Sinon on va se
 * mettre le plus loin possible de lui, en prenant la place du porteur qui en
 * est le plus éloigné.
 */
function swapAwayFrom(
  enc: Encounter,
  unit: Combatant,
  ability: CombatAbility,
  threat: Combatant | undefined,
): GridPos | null {
  if (threat && swapPartnerAt(enc, unit, ability, threat.pos)) return { ...threat.pos };

  let best: GridPos | null = null;
  let bestGain = threat ? unitToCellMeters(threat, unit.pos) : 0;
  for (const other of enc.combatants) {
    if (!swapPartnerAt(enc, unit, ability, other.pos)) continue;
    const gain = threat ? unitToCellMeters(threat, other.pos) : 1;
    if (gain <= bestGain) continue;
    best = { ...other.pos };
    bestGain = gain;
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

export interface Candidate {
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
export function bestPlay(enc: Encounter, unit: Combatant, allowSupport = true): Candidate | null {
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
          const sign = allegianceOf(enc, hit) === allegianceOf(enc, unit) ? -1.2 : 1;
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
export function stepToward(enc: Encounter, unit: Combatant): GridPos | null {
  const enemies = enemiesOf(enc, unit);
  if (!enemies.length) return null;

  const budget = affordableMovement(unit);
  if (budget <= 0) return null;

  const cells = reachableCells(unit, budget, enc.grid, terrainFor(enc, unit), enc.combatants);
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


/* ── Ce qu'il joue ─────────────────────────────────────────────────────────── */

/** Pourquoi le tacticien joue ce qu'il joue. Le banc d'essai s'en sert pour
 *  distinguer un tour d'approche d'un tour perdu. */
export type Intent = 'react' | 'strike' | 'attack' | 'move' | 'support' | 'endTurn';

/** Ce que le tacticien a décidé, et de quoi l'expliquer. */
export interface Decision {
  action: CombatAction;
  intent: Intent;
  /** Qui décide : celui dont c'est le tour, ou celui à qui l'on demande de réagir. */
  actorId?: string;
  ability?: CombatAbility;
  /** Dégâts bruts annoncés, et part que les défenses vont manger. */
  raw?: number;
  soaked?: number;
}

/**
 * La décision suivante, et une seule.
 *
 * C'est l'unique porte de sortie du tacticien : la table l'appelle pour jouer
 * un adversaire, le banc d'essai pour mesurer. Les deux passent donc exactement
 * par le même raisonnement — sans quoi le rapport d'équilibrage décrirait un
 * joueur qui n'existe pas.
 */
export function decide(enc: Encounter): Decision | null {
  if (!enc.started || isOver(enc)) return null;

  const pending = enc.pendingReaction;
  if (pending) {
    const reactor = findUnit(enc, pending.actorId);
    const source = findUnit(enc, pending.sourceId);
    for (const option of reactor?.abilities ?? []) {
      if (!pending.options.includes(option.id)) continue;
      // Une téléportation défensive s'ÉLOIGNE : viser l'assaillant ferait
      // échouer le saut, et le moteur rendrait la main sans rien consommer.
      const at = option.teleport && source
        ? escapeFrom(enc, reactor!, option, source)
        : option.swap
          ? swapAwayFrom(enc, reactor!, option, source)
          : pending.at;
      if (!at || cannotUse(enc, reactor!, option, at)) continue;
      return {
        action: { type: 'react', abilityId: option.id, at },
        intent: 'react',
        actorId: reactor!.id,
        ability: option,
      };
    }
    return { action: { type: 'skipReaction' }, intent: 'react', actorId: reactor?.id };
  }

  if (enc.pendingStrike) {
    const striker = enc.pendingStrike.actorId;
    const prey = [...pendingStrikeTargets(enc)].sort((a, b) => a.hp - b.hp)[0];
    return {
      action: prey ? { type: 'freeStrike', targetId: prey.id } : { type: 'skipStrike' },
      intent: 'strike',
      actorId: striker,
    };
  }

  const unit = currentUnit(enc);
  if (!unit || unit.down || (unit.actionUsed && unit.bonusActionUsed)) {
    return { action: { type: 'endTurn' }, intent: 'endTurn', actorId: unit?.id };
  }

  // Action dépensée, action bonus encore là : la main gauche a son mot à dire,
  // et une fiole se boit sans y passer le tour. On ne repart PAS en approche
  // pour autant — le tour reste ce qu'il était, avec un geste de plus.
  //
  // `cannotUse` fait déjà le tri : une fois l'action jouée, seules les
  // capacités d'action bonus lui restent accessibles.
  if (unit.actionUsed) {
    const bonus = bestPlay(enc, unit);
    if (!bonus) return { action: { type: 'endTurn' }, intent: 'endTurn', actorId: unit.id };
    return {
      action: bonus.action,
      intent: bonus.raw > 0 ? 'attack' : 'support',
      actorId: unit.id,
      ability: bonus.ability,
      raw: bonus.raw,
      soaked: bonus.soaked,
    };
  }

  // Frapper si l'on peut. On exclut d'abord soins et buffs : ils sont jouables
  // à n'importe quelle distance, donc les proposer ici ferait passer son tour à
  // se préparer plutôt qu'à marcher — et l'on ne rejoindrait jamais l'ennemi.
  const offensif = bestPlay(enc, unit, false);
  if (offensif) {
    return {
      action: offensif.action,
      intent: 'attack',
      actorId: unit.id,
      ability: offensif.ability,
      raw: offensif.raw,
      soaked: offensif.soaked,
    };
  }

  const pas = stepToward(enc, unit);
  if (pas) {
    return { action: { type: 'move', actorId: unit.id, to: pas }, intent: 'move', actorId: unit.id };
  }

  // Hors de portée et immobile : c'est le moment de se préparer.
  const soutien = bestPlay(enc, unit, true);
  if (soutien) {
    return {
      action: soutien.action,
      intent: 'support',
      actorId: unit.id,
      ability: soutien.ability,
    };
  }

  return { action: { type: 'endTurn' }, intent: 'endTurn', actorId: unit.id };
}

/**
 * L'action suivante, et une seule.
 *
 * Rendre UN coup à la fois est ce qui permet de le regarder jouer : la table
 * l'applique, laisse voir le résultat, puis redemande. Une fonction qui
 * déroulerait le tour entier ne donnerait qu'un journal à lire après coup.
 *
 * Pure : elle ne modifie rien et ne retient rien d'un appel à l'autre. C'est
 * l'appelant qui détecte une action refusée — le moteur laisse alors la
 * rencontre inchangée — et qui passe au tour suivant.
 */
export const nextAction = (enc: Encounter): CombatAction | null => decide(enc)?.action ?? null;

/**
 * Le tacticien a-t-il la main sur ce combattant ?
 *
 * On regarde qui le JOUE, pas d'où il vient : un héros aux mains d'un
 * marionnettiste ennemi est joué par l'adversaire, et un pantin arraché à
 * l'ennemi revient au camp qui tient ses fils.
 */
export const isDriven = (
  enc: Encounter,
  unit: Combatant | undefined,
  teams: readonly Team[],
): boolean => !!unit && teams.includes(allegianceOf(enc, unit));

/**
 * À qui revient la décision en cours — celui dont c'est le tour, ou celui à qui
 * l'on demande de réagir. Une fenêtre de réaction déplace la main.
 */
export function pendingDecider(enc: Encounter): Combatant | undefined {
  if (enc.pendingReaction) return findUnit(enc, enc.pendingReaction.actorId);
  if (enc.pendingStrike) return findUnit(enc, enc.pendingStrike.actorId);
  return currentUnit(enc);
}
