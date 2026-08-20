import { describe, expect, it } from 'vitest';
import materialsCatalog from '../../../public/resources/json/materials.json';
import { CharacterSheet } from './character.types';
import {
  DOMAIN_STANDING,
  MAGIC_DOMAINS,
  ORIGINS,
  RELIGIONS,
  TRAIT_CATALOG,
  catalogTrait,
  emptySheet,
  featDomainsFor,
  grantedTraits,
  originByKey,
  originTraits,
  religionByKey,
  standingFor,
} from './universe-data';

/** Une fiche née dans la région demandée. */
function sheetFrom(origin: string): CharacterSheet {
  const sheet = emptySheet();
  sheet.identity.origin = origin;
  return sheet;
}

describe('origine géographique', () => {
  it('couvre les régions du monde, avec les clés de `materials.json`', () => {
    expect(ORIGINS).toHaveLength(5);
    const regions = new Set(materialsCatalog.regions.map((r) => r.key));
    for (const origin of ORIGINS) expect(regions.has(origin.region)).toBe(true);
  });

  it('accorde ses traits régionaux depuis la source unique `trait.json`', () => {
    expect(originTraits(originByKey('royaume-abandonne')).map((t) => t.key)).toEqual([
      'peau-dure-a-la-corruption',
    ]);
    expect(originTraits(originByKey('etats-souterrains')).map((t) => t.key)).toEqual([
      'vision-dans-la-penombre',
    ]);
    expect(originTraits(originByKey('luxarion'))).toEqual([]);
  });

  it('un trait accordé par une origine ne se prend pas sur un slot', () => {
    const trait = catalogTrait('vision-dans-la-penombre');
    expect(trait?.acquisition.kind).toBe('regional');
    expect(trait?.acquisition.pickable).toBe(false);
    expect(trait?.grantedBy).toEqual(['origin:etats-souterrains']);
    expect(TRAIT_CATALOG.map((t) => t.key)).not.toContain('vision-dans-la-penombre');
  });

  it("verse ses traits dans ceux qu'accordent race et background", () => {
    const traits = grantedTraits(undefined, '', undefined, originByKey('royaume-abandonne'));
    expect(traits.map((t) => t.key)).toContain('peau-dure-a-la-corruption');
  });

  it("ouvre les branches non polarisées pour un natif de l'Archipel, sans feat ni background", () => {
    const archipel = featDomainsFor(sheetFrom('archipel'), []);
    expect(archipel).toContain('renforcement');
    expect(archipel).toContain('emission');
    expect(featDomainsFor(sheetFrom('luxarion'), [])).not.toContain('renforcement');
  });

  it('donne une acclimatation, un savoir régional et une faction à chaque origine', () => {
    for (const origin of ORIGINS) {
      expect(origin.acclimatation.length).toBeGreaterThan(0);
      expect(origin.language.length).toBeGreaterThan(0);
      expect(origin.factions.length).toBeGreaterThan(0);
    }
  });
});

describe('religion', () => {
  it('rattache chaque religion rédigée à un domaine existant', () => {
    const domains = new Set(MAGIC_DOMAINS.map((d) => d.key));
    expect(RELIGIONS.map((r) => r.key)).toEqual([
      'zenithisme',
      'enfants-de-la-seve',
      'culte-de-luna',
    ]);
    for (const religion of RELIGIONS) expect(domains.has(religion.domain)).toBe(true);
  });

  it('porte le rite de préparation et le rite de prière de chaque religion', () => {
    for (const religion of RELIGIONS) {
      expect(religion.ritual).toBeTruthy();
      expect(religion.prayer?.name).toBeTruthy();
      expect(religion.prayer?.place).toBeTruthy();
    }
    // Lun'a n'a pas encore de confession : la religion n'est pas rédigée.
    expect(religionByKey('culte-de-luna')?.confession).toBeUndefined();
    expect(religionByKey('culte-de-luna')?.note).toBeTruthy();
    expect(religionByKey('zenithisme')?.confession?.price).toBeTruthy();
  });

  it('donne le marqueur social des douze domaines', () => {
    expect(DOMAIN_STANDING).toHaveLength(12);
    const domains = new Set(MAGIC_DOMAINS.map((d) => d.key));
    for (const standing of DOMAIN_STANDING) expect(domains.has(standing.domain)).toBe(true);
    expect(standingFor('light')?.favourable).toContain('Luxarion');
    expect(standingFor('death')?.note).toBeTruthy();
    expect(standingFor('inconnu')).toBeUndefined();
  });
});
