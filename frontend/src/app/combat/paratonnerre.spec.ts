import { describe, expect, it } from 'vitest';
import electricityDomain from '../../../public/resources/json/domains/electricity.json';
import { AttributeKey, CharacterSheet, StatKey } from '../character/character.types';
import {
  characterAffinities,
  emptySheet,
  featPassives,
  findDomainFeat,
} from '../character/universe-data';
import { Affinities, CombatAbility, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import {
  applyAction,
  effectiveManaCost,
  featIncomingPrecision,
  findUnit,
  hitThreshold,
  PRECISION_PER_STEP,
} from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   PARATONNERRE

   Un feat qui n'invente aucun mécanisme : il branche une RÉSISTANCE sur les
   affinités, un FACTEUR DE MANA sur la chaîne de coût déjà tenue par la météo,
   et une PRÉCISION OFFERTE sur le seuil de toucher, à l'endroit exact où
   l'esquive naturelle se soustrait. Les chiffres viennent de la fiche de
   domaine — jamais recopiés ici.
─────────────────────────────────────────────────────────────────────────── */

const PARATONNERRE = electricityDomain.feats.find((f) => f.key === 'electricity-paratonnerre')!;
const PASSIFS = PARATONNERRE.passives!;
const RESISTANCE = PASSIFS.find((p) => 'resistance' in p)! as { resistance: string };
const CHARGE = PASSIFS.find((p) => 'chargedBy' in p)! as {
  key: string;
  chargedBy: string;
  manaFactor: number;
};
const ORAGE = PASSIFS.find((p) => 'incomingPrecision' in p)! as {
  when: { weather: string };
  incomingPrecision: number;
};

const STATS = (): Record<StatKey, number> => ({
  hp: 60, mana: 40, endurance: 20, speed: 10,
  atk_phy: 15, atk_mag: 20, def_phy: 0, def_mag: 0,
});
const ATTRS = (): Record<AttributeKey, number> => ({
  force: 12, dexterite: 12, constitution: 12, intelligence: 12, sagesse: 12, charisme: 12,
});
const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(id: string, team: Team, porteur: boolean): Combatant {
  const base = STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1,
    pos: { x: 0, y: 0 },
    attributes: ATTRS(),
    proficiency: 2,
    id,
    name: id,
    team,
    base,
    hp: base.hp,
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
    featPassives: porteur ? PASSIFS : undefined,
  } as unknown as Combatant;
}

/** Un sort de Foudre, tel que la fabrique en produit pour le domaine. */
const foudre = (id: string, manaCost = 10): CombatAbility =>
  ({
    id,
    name: 'Éclair',
    kind: 'spell',
    rangeMeters: 20,
    shape: { kind: 'single' },
    targets: ['enemy'],
    manaCost,
    enduranceCost: 0,
    damages: [{ min: 6, max: 6, type: 'lightning' }],
    domains: ['electricity'],
  }) as unknown as CombatAbility;

/** Le même sort, mais de Feu : rien de ce que le feat promet ne doit le toucher. */
const flamme = (id: string, manaCost = 10): CombatAbility =>
  ({
    ...foudre(id, manaCost),
    name: 'Flammèche',
    damages: [{ min: 6, max: 6, type: 'fire' }],
    domains: ['fire'],
  }) as unknown as CombatAbility;

describe('Paratonnerre — la fiche', () => {
  it('se prend au palier 10 et ne déclare que des clés de catalogue', () => {
    expect(PARATONNERRE.level).toBe(10);
    expect(RESISTANCE.resistance).toBe('lightning');
    expect(CHARGE.chargedBy).toBe('lightning');
    expect(CHARGE.manaFactor).toBe(0.5);
    expect(ORAGE.when.weather).toBe('storm');
    // Une charge que le combat doit suivre d'un tour à l'autre a besoin d'un nom.
    expect(CHARGE.key).toBeTruthy();
  });

  it('remonte jusqu’à la fiche, résistance à la Foudre comprise', () => {
    expect(findDomainFeat('electricity-paratonnerre')?.domain).toBe('electricity');
    const sheet: CharacterSheet = emptySheet();
    sheet.level = 10;
    sheet.domains = ['electricity'];
    sheet.feats = [
      { level: 10, pick: 'domain', feat: 'electricity-paratonnerre', domain: 'electricity' },
    ];
    expect(featPassives(sheet)).toHaveLength(PASSIFS.length);
    // Le tableau imprimé annonce exactement ce que le combat appliquera.
    expect(characterAffinities(sheet, []).resistances).toContain('lightning');
  });
});

describe('Paratonnerre — la charge captée', () => {
  /** Le porteur encaisse une décharge, tirée par un ennemi. */
  function frappe(): { enc: Encounter; porteur: Combatant } {
    const porteur = mkUnit('porteur', 'allies', true);
    const lanceur = mkUnit('lanceur', 'ennemis', false);
    const eclair = { ...foudre('test:eclair', 0), autoHit: true } as CombatAbility;
    lanceur.abilities = [eclair];
    lanceur.pos = { x: 2, y: 0 };

    let enc: Encounter = { ...emptyEncounter('Test'), combatants: [porteur, lanceur] };
    enc = applyAction(enc, { type: 'start' });
    enc.order = [lanceur.id];
    enc.turnIndex = 0;
    enc = applyAction(enc, {
      type: 'use',
      actorId: lanceur.id,
      abilityId: eclair.id,
      at: porteur.pos,
    });
    return { enc, porteur: findUnit(enc, porteur.id)! };
  }

  it('s’arme quand la foudre le frappe', () => {
    const { porteur } = frappe();
    expect(porteur.featCharges).toEqual([CHARGE.key]);
  });

  it('divise le coût du prochain sort de Foudre, et lui seul', () => {
    const { enc, porteur } = frappe();
    const sort = foudre('test:sort', 10);
    expect(effectiveManaCost(enc, sort, porteur)).toBe(Math.round(10 * CHARGE.manaFactor));
    // Le Feu n'a rien à voir avec la charge, et le prix sans lanceur non plus.
    expect(effectiveManaCost(enc, flamme('test:feu', 10), porteur)).toBe(10);
    expect(effectiveManaCost(enc, sort)).toBe(10);
  });

  it('se dépense au premier sort de Foudre lancé, et pas au second', () => {
    const { enc, porteur } = frappe();
    const sort = foudre('test:sort', 10);
    porteur.abilities = [sort];
    porteur.actionUsed = false;

    let combat: Encounter = { ...enc, order: [porteur.id], turnIndex: 0 };
    const cible = combat.combatants.find((c) => c.id !== porteur.id)!;
    const avant = porteur.mana;
    combat = applyAction(combat, {
      type: 'use',
      actorId: porteur.id,
      abilityId: sort.id,
      at: cible.pos,
    });

    const apres = findUnit(combat, porteur.id)!;
    expect(avant - apres.mana).toBe(5);
    expect(apres.featCharges).toEqual([]);
    // Charge vide : le sort suivant repasse au plein tarif.
    expect(effectiveManaCost(combat, sort, apres)).toBe(10);
  });

  it('ne se charge pas d’un coup qui n’est pas de la foudre', () => {
    const porteur = mkUnit('porteur', 'allies', true);
    const lanceur = mkUnit('lanceur', 'ennemis', false);
    const brasier = { ...flamme('test:feu', 0), autoHit: true } as CombatAbility;
    lanceur.abilities = [brasier];
    lanceur.pos = { x: 2, y: 0 };

    let enc: Encounter = { ...emptyEncounter('Test'), combatants: [porteur, lanceur] };
    enc = applyAction(enc, { type: 'start' });
    enc.order = [lanceur.id];
    enc.turnIndex = 0;
    enc = applyAction(enc, {
      type: 'use',
      actorId: lanceur.id,
      abilityId: brasier.id,
      at: porteur.pos,
    });

    expect(findUnit(enc, porteur.id)!.featCharges ?? []).toEqual([]);
  });
});

describe('Paratonnerre — la contrepartie de l’orage', () => {
  const calme = emptyEncounter('Test');
  const orage: Encounter = { ...emptyEncounter('Test'), weather: ORAGE.when.weather };

  it('n’offre de précision que sous l’orage, et qu’à ce qui est électrique', () => {
    const porteur = mkUnit('porteur', 'allies', true);
    expect(featIncomingPrecision(orage, porteur, foudre('a'))).toBe(ORAGE.incomingPrecision);
    expect(featIncomingPrecision(calme, porteur, foudre('a'))).toBe(0);
    expect(featIncomingPrecision(orage, porteur, flamme('b'))).toBe(0);
  });

  it('vise le domaine OU le type de dégâts : la foudre d’un monstre compte aussi', () => {
    const porteur = mkUnit('porteur', 'allies', true);
    // Une bête qui foudroie ne déclare aucun domaine — elle profite quand même
    // du point haut que le porteur est devenu.
    const morsure = { ...foudre('c'), domains: undefined } as unknown as CombatAbility;
    expect(featIncomingPrecision(orage, porteur, morsure)).toBe(ORAGE.incomingPrecision);
  });

  it('abaisse le seuil de toucher d’autant de crans, et de pas un de plus', () => {
    const porteur = mkUnit('porteur', 'allies', true);
    const quidam = mkUnit('quidam', 'allies', false);
    const lanceur = mkUnit('lanceur', 'ennemis', false);
    const crans = ORAGE.incomingPrecision / PRECISION_PER_STEP;

    const sec = hitThreshold(lanceur, foudre('d'), porteur, calme);
    expect(hitThreshold(lanceur, foudre('d'), porteur, orage)).toBe(sec - crans);
    // Sans passif, l'orage ne change rien ; sans rencontre, on ne devine rien.
    expect(hitThreshold(lanceur, foudre('d'), quidam, orage)).toBe(sec);
    expect(hitThreshold(lanceur, foudre('d'), porteur)).toBe(sec);
  });
});
