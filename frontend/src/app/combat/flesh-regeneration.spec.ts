import { describe, expect, it } from 'vitest';
import lifeDomain from '../../../public/resources/json/domains/life.json';
import statusCatalog from '../../../public/resources/json/status_effects.json';
import { AttributeKey, StatKey } from '../character/character.types';
import { Affinities, CombatAbility, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { parseRangeMeters } from './grid';
import { abilityHealAmount, applyAction, applyStatus, findUnit } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   RÉGÉNÉRATION DE LA CHAIR

   Un soin qui n'est pas gratuit : il se joue au CONTACT, il tire sa matière du
   corps soigné, il ressoude une Fracture — et il peut se retourner. Le jet est
   celui du PATIENT, et le DD baisse de palier en palier. Tous les chiffres
   viennent de la fiche de domaine, jamais recopiés ici.
─────────────────────────────────────────────────────────────────────────── */

const SORT = lifeDomain.spells.find((s) => s.key === 'life-regeneration-de-la-chair')!;
/**
 * Le socle du sort : ce que tout soigneur qui l'apprend sait déjà faire.
 *
 * Le sort n'a plus cinq paliers écrits d'avance — il a un socle et des
 * curseurs. Ce que ces tests protègent n'a pas changé pour autant : la matière
 * vient du soigné, le geste est guidé par la Médecine, et la Fracture se lève.
 */
const SOCLE = SORT.baseStats as {
  heal: number;
  range: string;
  scaling?: { source: string; ratio: number }[];
  cleanses?: string[];
  healTargetScaling?: { source: string; ratio: number }[];
  healCasterSkill?: { skill: string; ratio: number };
  targetSave?: {
    attribute: string;
    dc: number;
    backlash: number;
    damageType?: string;
    casterSkill?: { skill: string; ratio: number };
  };
};

const STATS = (): Record<StatKey, number> => ({
  hp: 60, mana: 40, endurance: 20, speed: 10,
  atk_phy: 10, atk_mag: 10, def_phy: 0, def_mag: 0,
});
const ATTRS = (con: number, sag: number): Record<AttributeKey, number> => ({
  force: 10, dexterite: 10, constitution: con, intelligence: 10, sagesse: sag, charisme: 10,
});
const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(id: string, team: Team, con = 10, medecine = 0): Combatant {
  const base = STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1,
    pos: { x: 0, y: 0 },
    attributes: ATTRS(con, 10),
    skills: { medicine: medecine },
    proficiency: 2,
    id,
    name: id,
    team,
    base,
    hp: 20,
    mana: base.mana,
    endurance: base.endurance,
    moved: 0,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    statuses: [],
    effects: [],
    abilities: [],
    inventory: [],
    affinities: NO_AFFINITY(),
    initiative: 0,
    down: false,
  } as unknown as Combatant;
}

/** La capacité telle que la fabrique la produit, à partir du socle du sort. */
const sortDe = (): CombatAbility => {
  const stats = SOCLE;
  return {
    id: 'spell:life-regeneration-de-la-chair:build',
    name: 'Régénération de la chair',
    kind: 'spell',
    rangeMeters: parseRangeMeters(stats.range),
    shape: { kind: 'single' },
    targets: ['self', 'ally'],
    manaCost: 0,
    enduranceCost: 0,
    damages: [],
    heal: stats.heal,
    healTargetScaling: stats.healTargetScaling?.map((s) => ({
      source: s.source,
      ratio: s.ratio,
    })),
    healCasterSkill: stats.healCasterSkill,
    cleanses: stats.cleanses,
    targetSave: stats.targetSave,
    domains: ['life'],
    autoHit: true,
  } as unknown as CombatAbility;
};

/**
 * Une rencontre où `soigneur` peut poser la main sur `blesse`.
 *
 * Le fâcheux au fond de la carte n'est là que pour que le combat existe : deux
 * alliés seuls sur la grille, et il se termine avant qu'on ait pu jouer.
 */
function table(soigneur: Combatant, blesse: Combatant): Encounter {
  blesse.pos = { x: 1, y: 0 };
  const facheux = mkUnit('facheux', 'ennemis');
  facheux.pos = { x: 12, y: 12 };
  let enc: Encounter = {
    ...emptyEncounter('Test'),
    combatants: [soigneur, blesse, facheux],
  };
  enc = applyAction(enc, { type: 'start' });
  enc.order = [soigneur.id];
  enc.turnIndex = 0;
  return enc;
}

describe('Régénération de la chair — la fiche', () => {
  it('se joue au contact', () => {
    expect(SOCLE.range).toBe('Contact');
    // La portée n'est pas négociable : soigner, c'est poser les mains.
    expect((SORT.lockedFields ?? []).some((l) => l.field === 'range')
      || !(SORT.customization?.params ?? []).some((p) => p.path === 'range')).toBe(true);
  });

  it('tire sa matière de la CONSTITUTION du soigné, et de rien d’autre', () => {
    expect(SOCLE.healTargetScaling?.[0].source).toBe('constitution');
    expect(SOCLE.healTargetScaling![0].ratio).toBeGreaterThan(0);
    // Le soigneur n'apporte pas sa sagesse brute : c'est ce qu'il a ÉTUDIÉ
    // qui compte, et le corps d'en face qui fournit la chair.
    expect(SOCLE.scaling ?? []).toEqual([]);
    expect(SOCLE.healCasterSkill?.skill).toBe('medicine');
    expect(SOCLE.healCasterSkill!.ratio).toBeGreaterThan(0);
  });

  it('fait guider le jet par la Médecine du lanceur', () => {
    expect(SOCLE.targetSave?.casterSkill?.skill).toBe('medicine');
    expect(SOCLE.targetSave!.casterSkill!.ratio).toBeGreaterThan(0);
  });

  it('lève une Fracture, et la Fracture existe au catalogue', () => {
    expect(SOCLE.cleanses).toContain('fracture');
    const def = statusCatalog.status_effects.find((s) => s.key === 'fracture');
    expect(def).toBeTruthy();
    // Un os cassé ne se remet pas tout seul au bout de trois tours.
    expect(def!.defaultDuration).toBe(-1);
  });

  it('impose un jet de constitution, et un échec fait mal', () => {
    expect(SOCLE.targetSave?.attribute).toBe('constitution');
    expect(SOCLE.targetSave!.backlash).toBeGreaterThan(0);
    // Le geste reste risqué au socle : c'est ce qui le distingue d'un soin
    // ordinaire. Le DD se travaille ensuite, cran par cran, avec le budget.
    expect(SOCLE.targetSave!.dc).toBeGreaterThan(0);
  });
});

describe('Régénération de la chair — le soin', () => {
  it('rend davantage à un corps solide qu’à un corps fragile', () => {
    const soigneur = mkUnit('soigneur', 'allies');
    const robuste = mkUnit('robuste', 'allies', 20);
    const chetif = mkUnit('chetif', 'allies', 6);
    const sort = sortDe();

    expect(abilityHealAmount(soigneur, sort, robuste)).toBeGreaterThan(
      abilityHealAmount(soigneur, sort, chetif),
    );
  });

  it('rend davantage sous une main qui a étudié la médecine', () => {
    const medecin = mkUnit('medecin', 'allies', 10, 8);
    const rustre = mkUnit('rustre', 'allies', 10, 0);
    const patient = mkUnit('patient', 'allies', 12);
    const sort = sortDe();

    expect(abilityHealAmount(medecin, sort, patient)).toBeGreaterThan(
      abilityHealAmount(rustre, sort, patient),
    );
  });

  it('ne lit du soigneur que sa Médecine, pas sa constitution', () => {
    const costaud = mkUnit('costaud', 'allies', 20, 4);
    const frele = mkUnit('frele', 'allies', 6, 4);
    const patient = mkUnit('patient', 'allies', 12);
    const sort = sortDe();

    // Deux corps opposés, une même science : même résultat.
    expect(abilityHealAmount(costaud, sort, patient)).toBe(
      abilityHealAmount(frele, sort, patient),
    );
  });
});

describe('Régénération de la chair — en combat', () => {
  /** Lance le sort et rend l'état d'après. */
  function lance(
    con: number,
    seed: number,
    medecine = 0,
  ): { blesse: Combatant; enc: Encounter } {
    const soigneur = mkUnit('soigneur', 'allies', 10, medecine);
    const blesse = mkUnit('blesse', 'allies', con);
    const sort = sortDe();
    soigneur.abilities = [sort];

    let enc = table(soigneur, blesse);
    enc.seed = seed;
    applyStatus(enc, findUnit(enc, blesse.id)!, 'fracture', undefined);
    enc = applyAction(enc, {
      type: 'use',
      actorId: soigneur.id,
      abilityId: sort.id,
      at: { x: 1, y: 0 },
    });
    return { blesse: findUnit(enc, blesse.id)!, enc };
  }

  it('ressoude la Fracture et rend des PV quand le corps suit', () => {
    // Le socle sur une constitution de 20 : le modificateur suffit à lui seul,
    // le jet ne peut pas tomber sous le DD quel que soit le dé.
    const { blesse, enc } = lance(20, 1);
    expect(blesse.statuses.some((s) => s.key === 'fracture')).toBe(false);
    expect(blesse.hp).toBeGreaterThan(20);
    expect(enc.log.some((l) => l.kind === 'save')).toBe(true);
  });

  it('ne soigne pas, ne ressoude pas et fait perdre de la vie quand il rate', () => {
    // Le socle sur une constitution de 3 : le modificateur est négatif, et le
    // dé doit compenser. On balaie les graines jusqu'à en trouver une qui
    // tombe en dessous — le dé n'est pas truqué, seulement choisi.
    let rate: { blesse: Combatant; enc: Encounter } | undefined;
    for (let seed = 1; seed <= 200 && !rate; seed++) {
      const essai = lance(3, seed);
      if (essai.blesse.statuses.some((s) => s.key === 'fracture')) rate = essai;
    }
    expect(rate).toBeTruthy();
    // L'os reste cassé, et le blessé est plus mal qu'avant.
    expect(rate!.blesse.statuses.some((s) => s.key === 'fracture')).toBe(true);
    expect(rate!.blesse.hp).toBeLessThan(20);
    expect(rate!.enc.log.some((l) => l.text.includes('se reconstruit de travers'))).toBe(true);
  });

  it('rattrape le même jet quand la main qui soigne a étudié la médecine', () => {
    // Même corps, même dé : seule la science du lanceur change. On cherche la
    // graine qui sépare les deux — elle existe, sinon la Médecine ne servirait
    // à rien sur ce jet.
    let separante = 0;
    for (let seed = 1; seed <= 200 && !separante; seed++) {
      const rustre = lance(3, seed, 0);
      const medecin = lance(3, seed, 10);
      const rustreEchoue = rustre.blesse.statuses.some((st) => st.key === 'fracture');
      const medecinReussit = !medecin.blesse.statuses.some((st) => st.key === 'fracture');
      if (rustreEchoue && medecinReussit) separante = seed;
    }
    expect(separante).toBeGreaterThan(0);
  });
});
