import { FightReport, UnitReport } from './arena';

/* ──────────────────────────────────────────────────────────────────────────
   MISE EN FORME DU RAPPORT.

   Séparé du banc d'essai à dessein : `arena.ts` produit des nombres, ce module
   les rend lisibles. On peut changer la présentation sans toucher à la mesure,
   et vérifier la mesure sans lire du markdown.
─────────────────────────────────────────────────────────────────────────── */

export const round1 = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : '—');
export const pct = (n: number): string => (Number.isFinite(n) ? `${Math.round(n * 100)} %` : '—');

export const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Un tableau markdown dont les colonnes sont déduites des en-têtes. */
export function table(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, rule, body].join('\n');
}

/* ── Agrégats d'un affrontement ────────────────────────────────────────────── */

/** Ce qu'une série de combats identiques a donné. */
export interface Matchup {
  label: string;
  /** Ce qui se bat à gauche et à droite, pour lire le tableau sans contexte. */
  left: string;
  right: string;
  fights: number;
  medianRounds: number;
  /** Part de combats non conclus dans la limite de tours. */
  timeouts: number;
  /** Victoires du camp de gauche, sur les combats conclus. */
  leftWins: number;
  /** PV moyens que garde le vainqueur. La marge : 0 = de justesse, 1 = intact. */
  margin: number;
  /** Round du premier point de vie perdu. Ce qui précède n'est que l'approche. */
  firstBlood: number;
  /** Tours de contact réel : du premier sang à la conclusion. */
  contactRounds: number;
  /** Part des dégâts annoncés que les défenses absorbent. */
  absorbed: number;
  /**
   * Dégâts encaissés rapportés aux dégâts annoncés par les attaques. Au-dessus
   * de 100 %, la différence vient de ce que les attaques n'annoncent pas :
   * poisons, saignements, ripostes, contre-coups.
   */
  connect: number;
  /** Tours d'approche par combattant et par combat. */
  approachPerFight: number;
  /** Tours vraiment perdus, par combattant et par combat. */
  idlePerFight: number;
  /** Part des tours perdus dus à une réserve vide. */
  starvedShare: number;
  /** Part des tours perdus dus au SOUFFLE, précisément. */
  breathlessShare: number;
}

export function digest(label: string, left: string, right: string, fights: FightReport[]): Matchup {
  const concluded = fights.filter((f) => f.winner !== 'timeout');
  const units = fights.flatMap((f) => f.units);
  const idle = units.reduce((s, u) => s + u.idleTurns, 0);
  const approach = units.reduce((s, u) => s + u.approachTurns, 0);
  const starved = units.reduce((s, u) => s + u.manaStarvedTurns + u.enduranceStarvedTurns, 0);
  const breathless = units.reduce((s, u) => s + u.enduranceStarvedTurns, 0);
  const bled = fights.filter((f) => f.firstBloodRound > 0);
  const perFight = Math.max(1, fights[0]?.units.length ?? 1);
  return {
    label,
    left,
    right,
    fights: fights.length,
    medianRounds: median(fights.map((f) => f.rounds)),
    timeouts: fights.filter((f) => f.winner === 'timeout').length / fights.length,
    leftWins: concluded.length
      ? concluded.filter((f) => f.winner === 'allies').length / concluded.length
      : NaN,
    margin: mean(concluded.map((f) => f.winnerHpShare)),
    firstBlood: median(bled.map((f) => f.firstBloodRound)),
    contactRounds: median(bled.map((f) => Math.max(1, f.rounds - f.firstBloodRound + 1))),
    absorbed: mean(fights.filter((f) => f.rawDamageAttempted > 0).map((f) => f.armorAbsorption)),
    connect: mean(
      fights.filter((f) => f.rawDamageAttempted > 0).map((f) => f.damageApplied / f.rawDamageAttempted),
    ),
    approachPerFight: approach / fights.length / perFight,
    idlePerFight: idle / fights.length / perFight,
    starvedShare: idle ? starved / idle : 0,
    breathlessShare: idle ? breathless / idle : 0,
  };
}

/* ── Fiche d'un combattant, toutes séries confondues ───────────────────────── */

export interface UnitDigest {
  name: string;
  kind: string;
  level: number;
  maxHp: number;
  fights: number;
  winRate: number;
  /** Dégâts infligés par tour de combat. La cadence réelle, pas la théorique. */
  damagePerRound: number;
  /** Tours qu'il faut pour user ses PV au rythme où il les perd. */
  survivalRounds: number;
  /** Part des actions offensives qui sont des sorts. */
  spellShare: number;
  /** Part des actions offensives qui sont des compétences de classe. */
  skillShare: number;
  /** Part de ses tours passés à courir après l'adversaire. */
  approachShare: number;
  /** Part de ses tours vraiment perdus. */
  idleShare: number;
  /** Part de mana dépensée sur la réserve totale. */
  manaBurn: number;
  /** Souffle dépensé par tour de combat. */
  breathPerRound: number;
  /** Réserve d'endurance de départ. */
  maxEndurance: number;
  /** Part de la réserve d'endurance encore là au plus bas du combat. */
  breathFloor: number;
}

export function unitDigests(fights: FightReport[]): UnitDigest[] {
  const byName = new Map<string, { u: UnitReport; rounds: number; won: boolean }[]>();
  for (const fight of fights) {
    for (const unit of fight.units) {
      const entry = { u: unit, rounds: fight.rounds, won: fight.winner === unit.team };
      const list = byName.get(unit.name);
      if (list) list.push(entry);
      else byName.set(unit.name, [entry]);
    }
  }

  return [...byName.entries()]
    .map(([name, entries]) => {
      const totalRounds = entries.reduce((s, e) => s + e.rounds, 0);
      const dealt = entries.reduce((s, e) => s + e.u.damageDealt, 0);
      const taken = entries.reduce((s, e) => s + e.u.damageTaken, 0);
      const attacks = entries.reduce((s, e) => s + e.u.attacks, 0);
      const spells = entries.reduce((s, e) => s + e.u.spells, 0);
      const skills = entries.reduce((s, e) => s + e.u.classSkills, 0);
      const idle = entries.reduce((s, e) => s + e.u.idleTurns, 0);
      const approach = entries.reduce((s, e) => s + e.u.approachTurns, 0);
      const manaSpent = entries.reduce((s, e) => s + e.u.manaSpent, 0);
      const manaPool = entries.reduce((s, e) => s + e.u.maxMana, 0);
      const breath = entries.reduce((s, e) => s + e.u.enduranceSpent, 0);
      const floors = entries.map((e) => e.u.enduranceFloor / Math.max(1, e.u.maxEndurance));
      const first = entries[0].u;
      return {
        name,
        kind: first.kind,
        level: first.level,
        maxHp: first.maxHp,
        fights: entries.length,
        winRate: entries.filter((e) => e.won).length / entries.length,
        damagePerRound: dealt / Math.max(1, totalRounds),
        // Combien de tours ce combattant tient au rythme où on l'entame.
        survivalRounds: taken > 0 ? (first.maxHp * totalRounds) / taken : Infinity,
        spellShare: attacks ? spells / attacks : 0,
        skillShare: attacks ? skills / attacks : 0,
        approachShare: approach / Math.max(1, totalRounds),
        idleShare: idle / Math.max(1, totalRounds),
        manaBurn: manaPool ? manaSpent / manaPool : 0,
        breathPerRound: breath / Math.max(1, totalRounds),
        maxEndurance: first.maxEndurance,
        breathFloor: mean(floors),
      };
    })
    .sort((a, b) => a.level - b.level || b.damagePerRound - a.damagePerRound);
}
