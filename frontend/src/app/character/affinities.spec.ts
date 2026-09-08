import { describe, expect, it } from 'vitest';
import damageCatalog from '../../../public/resources/json/damage_type.json';
import { DAMAGE_LABELS, damageSigil } from '../combat/damage-labels';
import { CharacterSheet } from './character.types';
import { characterAffinities, emptySheet } from './universe-data';

/** Une fiche qui a pris Croissance végétale (faiblesse au feu assumée). */
function withCroissance(): CharacterSheet {
  const sheet = emptySheet();
  sheet.level = 10;
  sheet.domains = ['plant'];
  sheet.feats = [{ level: 5, pick: 'domain', feat: 'plant-croissance', domain: 'plant' }];
  return sheet;
}

describe('types de dégâts affichés', () => {
  it('donne un nom ET un glyphe à chaque type du catalogue', () => {
    for (const type of damageCatalog.specific_damage_types) {
      expect(DAMAGE_LABELS[type.name]).toBeTruthy();
      expect(damageSigil(type.name)).not.toBe('');
    }
  });

  it("ne rend rien pour un type qu'on ne connaît pas", () => {
    expect(damageSigil('inconnu')).toBe('');
    expect(damageSigil(undefined)).toBe('');
  });
});

describe('affinités du personnage', () => {
  it("part vide : sans rien porter, tout s'encaisse pareil", () => {
    const aff = characterAffinities(emptySheet(), []);
    expect(aff).toEqual({ immunities: [], resistances: [], weaknesses: [], absorptions: [] });
  });

  it("rassemble ce que l'équipement porté donne, sans doublon", () => {
    const aff = characterAffinities(emptySheet(), [
      { resistances: ['fire'], weaknesses: ['lightning'] },
      { resistances: ['fire', 'ice'] },
      { immunities: ['poison'], absorptions: ['life'] },
    ]);
    expect(aff.resistances).toEqual(['fire', 'ice']);
    expect(aff.weaknesses).toEqual(['lightning']);
    expect(aff.immunities).toEqual(['poison']);
    expect(aff.absorptions).toEqual(['life']);
  });

  it('ajoute la faiblesse assumée par un feat domanial', () => {
    expect(characterAffinities(withCroissance(), []).weaknesses).toEqual(['fire']);
  });

  it('ne compte pas deux fois une faiblesse déjà portée', () => {
    const aff = characterAffinities(withCroissance(), [{ weaknesses: ['fire'] }]);
    expect(aff.weaknesses).toEqual(['fire']);
  });
});
