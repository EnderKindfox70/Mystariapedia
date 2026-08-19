import { CombatAction, Encounter, Team } from './combat.types';
import { isOver } from './rules';
import { Decision, decide, isDriven, pendingDecider } from './tactician';

/* ──────────────────────────────────────────────────────────────────────────
   LA RÉSOLUTION AUTONOME.

   Faire jouer l'adversaire tout seul, mais SOUS LES YEUX du MJ. C'est la
   contrainte qui gouverne tout ce module : une fonction qui déroulerait le tour
   entier serait plus simple à écrire, et ne laisserait qu'un journal à lire
   après coup. On rend donc **une action à la fois**, et l'appelant décide du
   rythme.

   Le module ne connaît ni Angular, ni horloge, ni rendu : il dit *quoi* jouer
   et *quand s'arrêter*. Qui l'appelle et à quelle cadence ne le regarde pas —
   c'est ce qui le rend testable sans attendre de minuteur.
─────────────────────────────────────────────────────────────────────────── */

/** Ce qui gouverne une résolution autonome. */
export interface AutoplaySettings {
  /** Camps confiés au tacticien. Les autres restent au MJ. */
  teams: Team[];
  /**
   * S'arrêter dès que la main revient à un camp joué par le MJ, plutôt que de
   * dérouler tout le round. C'est le mode « je joue contre l'IA ».
   */
  stopOnHuman: boolean;
}

/** Pourquoi la résolution autonome s'arrête. */
export type AutoplayHalt =
  /** Le combat est terminé. */
  | 'over'
  /** La main revient à un camp que le MJ pilote. */
  | 'human'
  /** Le moteur a refusé l'action : insister tournerait en rond. */
  | 'stalled'
  /** Garde-fou : trop d'actions d'affilée sans que le tour avance. */
  | 'runaway';

/** Ce que la résolution a à faire, maintenant. */
export type AutoplayStep =
  | { kind: 'play'; decision: Decision }
  | { kind: 'halt'; reason: AutoplayHalt };

/**
 * Le pas suivant : jouer une action, ou s'arrêter en disant pourquoi.
 *
 * Rendre la RAISON de l'arrêt plutôt qu'un simple `null` est ce qui permet à la
 * vue de distinguer « à toi de jouer » de « le combat est fini » — deux
 * situations qui n'appellent pas du tout la même chose à l'écran.
 */
export function nextStep(enc: Encounter, settings: AutoplaySettings): AutoplayStep {
  if (isOver(enc) || !enc.started) return { kind: 'halt', reason: 'over' };

  // À qui revient la main : celui dont c'est le tour, ou celui à qui l'on
  // demande de réagir. Une fenêtre de réaction déplace la décision, et l'on
  // doit rendre la main au MJ si c'est SON combattant qui peut réagir.
  // On lit son ALLÉGEANCE et non son camp : un combattant sous contrôle est
  // joué par celui qui le tient. Un héros aux mains d'un marionnettiste ennemi
  // passe donc au tacticien, et un pantin arraché à l'ennemi revient au MJ.
  const decider = pendingDecider(enc);
  if (settings.stopOnHuman && decider && !isDriven(enc, decider, settings.teams)) {
    return { kind: 'halt', reason: 'human' };
  }

  const decision = decide(enc);
  if (!decision) return { kind: 'halt', reason: 'over' };
  return { kind: 'play', decision };
}

/**
 * Empreinte de ce qui compte pour l'avancement d'un combat.
 *
 * Le journal en est exclu à dessein : une action REFUSÉE y écrit quand même sa
 * ligne d'explication, et c'est précisément ce cas qu'on veut reconnaître. Deux
 * empreintes identiques de part et d'autre d'une action signifient qu'elle n'a
 * rien fait, et qu'insister boucherait la partie.
 */
export function progressFingerprint(enc: Encounter): string {
  return (
    `${enc.round}/${enc.turnIndex}/${enc.pendingStrike?.actorId ?? ''}/` +
    `${enc.pendingReaction?.actorId ?? ''}/` +
    enc.combatants
      .map(
        (c) =>
          `${c.pos.x},${c.pos.y},${c.hp},${c.mana},${c.endurance},` +
          `${c.actionUsed ? 1 : 0}${c.bonusActionUsed ? 1 : 0}`,
      )
      .join(';')
  );
}

/**
 * Combien d'actions d'affilée on tolère sans que le tour change de main.
 *
 * Un combattant enchaîne légitimement plusieurs gestes en un tour — se
 * déplacer, frapper, subir une riposte. Au-delà, quelque chose tourne en rond
 * et il vaut mieux rendre la main que figer l'écran.
 */
export const RUNAWAY_GUARD = 24;

/** Un tour de résolution, sans horloge : utile aux tests et au « pas à pas ». */
export interface AutoplayRun {
  encounter: Encounter;
  /** Les actions jouées, dans l'ordre. */
  played: CombatAction[];
  reason: AutoplayHalt;
}

/**
 * Déroule la résolution jusqu'à un point d'arrêt, sans attendre.
 *
 * La table ne s'en sert pas — elle joue pas à pas pour qu'on voie. C'est
 * l'outil des tests, et du bouton « jusqu'à mon tour » quand on ne veut pas
 * regarder l'adversaire réfléchir.
 */
export function runUntilHalt(
  encounter: Encounter,
  settings: AutoplaySettings,
  apply: (enc: Encounter, action: CombatAction) => Encounter,
): AutoplayRun {
  let enc = encounter;
  const played: CombatAction[] = [];

  for (let garde = 0; garde < RUNAWAY_GUARD; garde++) {
    const step = nextStep(enc, settings);
    if (step.kind === 'halt') return { encounter: enc, played, reason: step.reason };

    const avant = progressFingerprint(enc);
    enc = apply(enc, step.decision.action);
    played.push(step.decision.action);

    if (progressFingerprint(enc) === avant) {
      // Le moteur a refusé : on passe le tour plutôt que d'insister.
      enc = apply(enc, { type: 'endTurn' });
      played.push({ type: 'endTurn' });
    }
  }
  return { encounter: enc, played, reason: 'runaway' };
}
