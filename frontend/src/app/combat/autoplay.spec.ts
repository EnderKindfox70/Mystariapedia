import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import loupGris from '../../../public/resources/json/bestiary/loup-gris.json';
import { BestiaryEntry } from '../wiki.types';
import {
  AutoplaySettings,
  AutoplayStep,
  nextStep,
  progressFingerprint,
  runUntilHalt,
} from './autoplay';
import { Encounter } from './combat.types';
import { CombatantFactory } from './combatant-factory';
import { emptyEncounter } from './encounter';
import { applyAction, currentUnit, isOver } from './rules';
import { decide } from './tactician';

/* ──────────────────────────────────────────────────────────────────────────
   Ce qui doit tenir pour qu'on puisse jouer CONTRE l'adversaire autonome :
   il joue son camp, il rend la main dès que c'est à nous, et il ne fige
   jamais l'écran.
─────────────────────────────────────────────────────────────────────────── */

const wolf = loupGris as unknown as BestiaryEntry;

/** Une meute contre une meute, toutes deux prêtes à en découdre. */
function meute(): Encounter {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  const factory = TestBed.inject(CombatantFactory);

  const enc = emptyEncounter('Résolution');
  enc.seed = 5;
  enc.combatants = [
    factory.fromBestiary(wolf, 'allies', { x: 1, y: 3 }, 1),
    factory.fromBestiary(wolf, 'allies', { x: 1, y: 5 }, 2),
    factory.fromBestiary(wolf, 'ennemis', { x: 12, y: 3 }, 3),
    factory.fromBestiary(wolf, 'ennemis', { x: 12, y: 5 }, 4),
  ];
  return applyAction(enc, { type: 'start' });
}

/** Le pas, en exigeant qu'il y ait quelque chose à jouer. */
function joue(step: AutoplayStep): Extract<AutoplayStep, { kind: 'play' }> {
  if (step.kind !== 'play') throw new Error(`rien à jouer : ${step.reason}`);
  return step;
}

const contreIA: AutoplaySettings = { teams: ['ennemis'], stopOnHuman: true };
const toutSeul: AutoplaySettings = { teams: ['allies', 'ennemis'], stopOnHuman: true };

describe('résolution autonome', () => {
  it('rend la main dès que c’est à un camp humain', () => {
    // C'est TOUT le mode « je joue contre l'IA » : l'adversaire déroule, puis
    // s'arrête net et attend.
    const enc = meute();
    const run = runUntilHalt(enc, contreIA, applyAction);

    expect(run.reason).toBe('human');
    expect(currentUnit(run.encounter)?.team).toBe('allies');
  });

  it('ne joue rien quand la main est déjà humaine', () => {
    const enc = meute();
    // On force le tour d'un allié : le tacticien ne pilote pas ce camp.
    const allie = enc.combatants.find((c) => c.team === 'allies')!;
    enc.order = [allie.id, ...enc.order.filter((id) => id !== allie.id)];
    enc.turnIndex = 0;

    const step = nextStep(enc, contreIA);
    expect(step).toEqual({ kind: 'halt', reason: 'human' });
  });

  it('mène un combat entier à son terme quand les deux camps sont confiés', () => {
    let enc = meute();
    for (let tour = 0; tour < 200 && !isOver(enc); tour++) {
      const step = nextStep(enc, toutSeul);
      if (step.kind === 'halt') break;
      enc = applyAction(enc, step.decision.action);
    }
    expect(isOver(enc)).toBe(true);
  });

  it('s’arrête toute seule quand le combat est fini', () => {
    const enc = meute();
    for (const unit of enc.combatants.filter((c) => c.team === 'ennemis')) {
      unit.hp = 0;
      unit.down = true;
    }
    expect(nextStep(enc, toutSeul)).toEqual({ kind: 'halt', reason: 'over' });
  });

  it('ne joue rien avant que le combat ne soit lancé', () => {
    const enc = emptyEncounter('Pas commencé');
    expect(nextStep(enc, toutSeul)).toEqual({ kind: 'halt', reason: 'over' });
  });

  it('joue une action à la fois — c’est ce qui permet de la voir', () => {
    // Une résolution qui déroulerait le tour d'un bloc ne laisserait qu'un
    // journal à lire après coup.
    const enc = meute();
    const apres = applyAction(enc, joue(nextStep(enc, toutSeul)).decision.action);
    expect(progressFingerprint(apres)).not.toBe(progressFingerprint(enc));
  });

  it('ne fige jamais l’écran, même si le moteur refuse tout', () => {
    // Garde-fou : un moteur qui refuserait chaque action ferait boucler la
    // résolution à l'infini. Elle doit rendre la main d'elle-même.
    const enc = meute();
    const run = runUntilHalt(enc, toutSeul, (e) => e); // rien ne change jamais
    expect(run.reason).toBe('runaway');
    expect(run.played.length).toBeGreaterThan(0);
  });
});

describe('l’empreinte de progression', () => {
  it('ignore le journal — une action refusée y écrit quand même', () => {
    const enc = meute();
    const bavard: Encounter = {
      ...enc,
      log: [...enc.log, { id: 999, round: 1, kind: 'info', text: 'refus' }],
      nextLogId: enc.nextLogId + 1,
    };
    expect(progressFingerprint(bavard)).toBe(progressFingerprint(enc));
  });

  it('change dès qu’un combattant bouge ou perd des points de vie', () => {
    const enc = meute();
    const blesse: Encounter = {
      ...enc,
      combatants: enc.combatants.map((c, i) => (i ? c : { ...c, hp: c.hp - 1 })),
    };
    expect(progressFingerprint(blesse)).not.toBe(progressFingerprint(enc));
  });
});

describe('un seul cerveau', () => {
  it('la table joue exactement ce que le banc d’essai mesure', () => {
    // Si les deux divergeaient, le rapport d'équilibrage décrirait un
    // adversaire qui n'existe pas. `nextStep` ne fait que filtrer sur le camp :
    // la décision, elle, vient toujours de `decide`.
    const enc = meute();
    expect(joue(nextStep(enc, toutSeul)).decision.action).toEqual(decide(enc)!.action);
  });
});
