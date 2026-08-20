import { describe, expect, it } from 'vitest';
import backgroundsCatalog from '../../../public/resources/json/characters/backgrounds.json';
import racesCatalog from '../../../public/resources/json/characters/races.json';
import traitCatalog from '../../../public/resources/json/trait.json';
import { BackgroundDef, RaceDef } from './character.types';
import {
  CHARACTER_TRAITS,
  ORIGINS,
  TRAIT_CATALOG,
  catalogTrait,
  grantedTraits,
  isPickableTrait,
  traitRequirement,
  traitsGrantedBy,
} from './universe-data';

const RACES = Object.values(racesCatalog) as unknown as RaceDef[];
const BACKGROUNDS = Object.values(backgroundsCatalog) as unknown as BackgroundDef[];
const race = (key: string) => RACES.find((r) => r.key === key);
const background = (key: string) => BACKGROUNDS.find((b) => b.key === key);

describe('catalogue unique des traits', () => {
  it("est le seul endroit où un trait est écrit : plus aucune copie inline", () => {
    for (const r of RACES) {
      expect(r).not.toHaveProperty('traits');
      for (const sub of r.subraces) expect(sub).not.toHaveProperty('traits');
    }
    for (const b of BACKGROUNDS) {
      expect(b).not.toHaveProperty('traits');
      for (const sub of b.subbackgrounds) expect(sub).not.toHaveProperty('traits');
    }
    for (const o of ORIGINS) expect(o).not.toHaveProperty('traitIds');
  });

  it('donne à chaque trait portable ses conditions d’obtention', () => {
    for (const trait of CHARACTER_TRAITS) {
      expect(['acquis', 'biologique', 'regional']).toContain(trait.acquisition.kind);
      expect(trait.acquisition.condition.length).toBeGreaterThan(0);
      // Ce qui ne s'apprend pas doit venir de quelque part.
      if (!trait.acquisition.pickable) expect(trait.grantedBy.length).toBeGreaterThan(0);
    }
  });

  it('ne référence que des sources qui existent vraiment', () => {
    const known = new Set<string>([
      ...RACES.map((r) => `race:${r.key}`),
      ...RACES.flatMap((r) => r.subraces.map((s) => `subrace:${s.key}`)),
      ...BACKGROUNDS.map((b) => `background:${b.key}`),
      ...BACKGROUNDS.flatMap((b) => b.subbackgrounds.map((s) => `subbackground:${s.key}`)),
      ...ORIGINS.map((o) => `origin:${o.key}`),
    ]);
    for (const trait of CHARACTER_TRAITS) {
      for (const ref of trait.grantedBy) expect(known.has(ref)).toBe(true);
    }
  });

  it('garde les lignes du bestiaire lisibles par leur id', () => {
    const ids = traitCatalog.traits.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(traitCatalog.traits.every((t) => !!t.name && !!t.description)).toBe(true);
  });
});

describe("conditions d'obtention", () => {
  it("interdit de prendre une particularité biologique", () => {
    for (const key of ['amphibie', 'vision-dans-le-noir', 'robustesse', 'protection-magique']) {
      const trait = catalogTrait(key);
      expect(trait?.acquisition.kind).toBe('biologique');
      expect(isPickableTrait(key)).toBe(false);
      expect(TRAIT_CATALOG.map((t) => t.key)).not.toContain(key);
    }
  });

  it('laisse Akimbo à la portée de tout le monde, sans source qui le donne', () => {
    const akimbo = catalogTrait('akimbo');
    expect(akimbo?.acquisition.kind).toBe('acquis');
    expect(isPickableTrait('akimbo')).toBe(true);
    expect(akimbo?.grantedBy).toEqual([]);
    // Règle de main faible : aucun effet chiffré à sommer sur la fiche.
    expect(akimbo?.effects).toBeUndefined();
  });

  it("laisse Nageur à la portée de tout le monde, en plus des backgrounds qui l'offrent", () => {
    const nageur = catalogTrait('nageur');
    expect(nageur?.acquisition.kind).toBe('acquis');
    expect(isPickableTrait('nageur')).toBe(true);
    expect(nageur?.grantedBy).toEqual(['background:sailor', 'background:fisherman']);
  });
});

describe("prérequis d'attribut", () => {
  const attrs = (intelligence: number) => ({
    force: 10,
    dexterite: 10,
    constitution: 10,
    intelligence,
    sagesse: 10,
    charisme: 10,
  });

  it('exige 13 en Intelligence pour Linguiste et Empoisonneur', () => {
    for (const key of ['linguiste', 'empoisonneur']) {
      const trait = catalogTrait(key)!;
      expect(trait.acquisition.requires).toEqual({ attribute: 'intelligence', min: 13 });
      expect(traitRequirement(trait, attrs(12))).toBe('Intelligence 13 requis (12)');
      expect(traitRequirement(trait, attrs(13))).toBe('');
    }
  });

  it('laisse passer un trait sans prérequis', () => {
    expect(traitRequirement(catalogTrait('chef-cuisinier')!, attrs(8))).toBe('');
  });
});

describe('résolution des traits accordés', () => {
  it('rend les aptitudes raciales depuis le catalogue', () => {
    const nain = grantedTraits(race('nain'), 'Nain des profondeurs');
    expect(nain.map((t) => t.key)).toContain('robustesse');
    const elfe = grantedTraits(race('elf'), '');
    expect(elfe.map((t) => t.key)).toEqual(['affinite-arcanique', 'protection-magique']);
  });

  it('rend la vision nocturne à la seule sous-race qui la porte', () => {
    const deep = race('nain')?.subraces.find((s) => s.key === 'deep-dwarf');
    expect(deep).toBeTruthy();
    expect(grantedTraits(race('nain'), deep!.name).map((t) => t.key)).toContain(
      'vision-dans-le-noir',
    );
    const mountain = race('nain')?.subraces.find((s) => s.key === 'mountain-dwarf');
    expect(grantedTraits(race('nain'), mountain!.name).map((t) => t.key)).not.toContain(
      'vision-dans-le-noir',
    );
  });

  it("rend le trait d'un sous-background au seul métier qui le porte", () => {
    const soldat = background('soldat');
    const medic = soldat?.subbackgrounds.find((s) => s.key === 'field-medic');
    expect(medic).toBeTruthy();
    expect(
      grantedTraits(undefined, '', soldat, undefined, medic!.name).map((t) => t.key),
    ).toEqual(['entrainement-martial', 'soigneur']);
    // Un fantassin n'est pas médecin : il garde l'entraînement, pas le kit.
    const footman = soldat?.subbackgrounds.find((s) => s.key === 'footman');
    expect(
      grantedTraits(undefined, '', soldat, undefined, footman!.name).map((t) => t.key),
    ).toEqual(['entrainement-martial']);
  });

  it("rend l'immunité au poison à la seule sous-race reptilienne", () => {
    const beast = race('beast-human');
    const reptile = beast?.subraces.find((s) => s.key === 'reptilian');
    expect(grantedTraits(beast, reptile!.name).map((t) => t.key)).toContain('mithridatisation');
    const feline = beast?.subraces.find((s) => s.key === 'feline');
    expect(grantedTraits(beast, feline!.name).map((t) => t.key)).not.toContain('mithridatisation');
    expect(isPickableTrait('mithridatisation')).toBe(false);
  });

  it('rend les traits de background et cumule les sources', () => {
    const marin = grantedTraits(undefined, '', background('sailor'));
    expect(marin.map((t) => t.key)).toEqual(['nageur']);
    expect(traitsGrantedBy(['background:soldat']).map((t) => t.key)).toEqual([
      'entrainement-martial',
    ]);
  });
});
