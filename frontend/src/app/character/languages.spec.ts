import { describe, expect, it } from 'vitest';
import {
  LANGUAGES,
  ORIGINS,
  catalogTrait,
  grantedLanguages,
  grantedTraits,
  languageName,
  languageSlotsFrom,
  originByKey,
  traitSkillBonuses,
} from './universe-data';

describe('langues', () => {
  it('donne le commun à tout le monde, sans emplacement', () => {
    const commun = LANGUAGES.filter((l) => l.common);
    expect(commun).toHaveLength(1);
    expect(grantedLanguages(undefined)).toEqual(['commun']);
  });

  it("ajoute la langue de l'origine, elle aussi acquise d'office", () => {
    expect(grantedLanguages(originByKey('luxarion'))).toEqual(['commun', 'solaire-liturgique']);
    expect(grantedLanguages(originByKey('etats-souterrains'))).toEqual([
      'commun',
      'langue-des-galeries',
    ]);
    expect(languageName('haut-sylvain')).toBe('Haut-sylvain');
  });

  it('rattache chaque origine à une langue qui existe', () => {
    const keys = new Set(LANGUAGES.map((l) => l.key));
    for (const origin of ORIGINS) {
      expect(origin.languages?.length).toBeGreaterThan(0);
      for (const key of origin.languages ?? []) expect(keys.has(key)).toBe(true);
    }
  });

  it('ouvre trois emplacements avec le Linguiste, aucun sans lui', () => {
    const linguiste = catalogTrait('linguiste')!;
    expect(linguiste.languageSlots).toBe(3);
    expect(languageSlotsFrom([linguiste])).toBe(3);
    expect(languageSlotsFrom([catalogTrait('chef-cuisinier')!])).toBe(0);
    expect(languageSlotsFrom([])).toBe(0);
  });
});

describe('bonus de compétence des traits', () => {
  it('donne +1 en Médecine au Soigneur', () => {
    const soigneur = catalogTrait('soigneur')!;
    expect(soigneur.skillEffects).toEqual([{ key: 'medicine', value: 1 }]);
    expect(traitSkillBonuses([soigneur]).get('medicine')).toBe(1);
  });

  it('ne rend rien pour un trait sans effet de compétence', () => {
    expect(traitSkillBonuses([catalogTrait('akimbo')!]).size).toBe(0);
  });

  it('suit le sous-background : un Médecin d’armée soigne mieux qu’un fantassin', () => {
    const soldat = { key: 'soldat', name: 'Soldat', subbackgrounds: [
      { key: 'footman', name: 'Fantassin' },
      { key: 'field-medic', name: "Médecin d'armée" },
    ] };
    const medic = grantedTraits(undefined, '', soldat, undefined, "Médecin d'armée");
    expect(traitSkillBonuses(medic).get('medicine')).toBe(1);
    const footman = grantedTraits(undefined, '', soldat, undefined, 'Fantassin');
    expect(traitSkillBonuses(footman).get('medicine')).toBeUndefined();
  });
});
