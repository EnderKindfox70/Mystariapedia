import { describe, expect, it } from 'vitest';
import { CharacterSheet } from '../character/character.types';
import { Combatant } from './combat.types';
import { applyReport, diffAgainstSheet, summarize } from './sheet-report';
import { DEFAULT_RULES, emptyBuild, spellProgress, xpForCast } from './spell-customization';

/* La boucle entière : un sort lancé ou travaillé sur la table gagne de l'XP,
   et cette XP redescend sur la fiche au report — jamais avant. */

const fiche = (xp = 0): CharacterSheet =>
  ({
    spells: {
      unlocked: ['fire-embers'],
      equipped: ['fire-embers'],
      states: { 'fire-embers': { xp, build: null, lastReassignedAt: null } },
    },
  }) as unknown as CharacterSheet;

const pion = (casts?: Record<string, number>, training?: Record<string, number>): Combatant =>
  ({
    id: 'u1',
    name: 'Ambre',
    base: {},
    inventory: [],
    origin: { kind: 'sheet', sheetId: 's1' },
    spellCasts: casts,
    spellTraining: training,
  }) as unknown as Combatant;

describe('l’XP des sorts redescend sur la fiche', () => {
  it('un lancer en combat vaut la moitié d’une séance', () => {
    expect(xpForCast('combat')).toBe(0.5);
    expect(xpForCast('training')).toBe(1);
  });

  it('quatre lancers font 2 XP', () => {
    const r = diffAgainstSheet(pion({ 'fire-embers': 4 }), fiche(), 's1');
    expect(r.spellXp).toEqual([{ key: 'fire-embers', casts: 4, training: 0, xp: 2 }]);
    expect(r.changed).toBe(true);
  });

  it('les deux sources s’additionnent, chacune à son taux', () => {
    const r = diffAgainstSheet(pion({ 'fire-embers': 3 }, { 'fire-embers': 2 }), fiche(), 's1');
    expect(r.spellXp[0].xp).toBe(3 * 0.5 + 2 * 1);
  });

  it('un sort que la fiche ne connaît pas ne rapporte rien', () => {
    const r = diffAgainstSheet(pion({ 'water-jet-d-eau': 5 }), fiche(), 's1');
    expect(r.spellXp).toEqual([]);
    expect(r.changed).toBe(false);
  });

  it('le report AJOUTE l’XP à celle déjà acquise', () => {
    const avant = fiche(8);
    const r = diffAgainstSheet(pion({ 'fire-embers': 4 }), avant, 's1');
    const apres = applyReport(avant, r, pion(), () => 0);
    expect(apres.spells.states['fire-embers'].xp).toBe(10);
    // Et la fiche d'origine n'a pas bougé : le report travaille sur une copie.
    expect(avant.spells.states['fire-embers'].xp).toBe(8);
  });

  it('l’XP reportée fait monter le niveau du sort', () => {
    const avant = fiche(0);
    const r = diffAgainstSheet(pion(undefined, { 'fire-embers': 20 }), avant, 's1');
    const apres = applyReport(avant, r, pion(), () => 0);
    const p = spellProgress(apres.spells.states['fire-embers'].xp);
    expect(p.level).toBe(2);
    expect(p.pointsEarned).toBe(2 * DEFAULT_RULES.pointsPerSpellLevel);
  });

  it('rien n’est écrit tant que le report n’est pas confirmé', () => {
    const avant = fiche(0);
    diffAgainstSheet(pion({ 'fire-embers': 10 }), avant, 's1');
    expect(avant.spells.states['fire-embers'].xp).toBe(0);
  });

  it('le résumé dit d’où vient l’XP', () => {
    const r = diffAgainstSheet(pion({ 'fire-embers': 2 }, { 'fire-embers': 1 }), fiche(), 's1');
    expect(summarize(r)).toContain('fire-embers');
    expect(summarize(r)).toContain('lancers');
    expect(summarize(r)).toContain('entraînement');
  });

  it('le build enregistré survit au report', () => {
    const avant = fiche(0);
    avant.spells.states['fire-embers'].build = emptyBuild();
    const r = diffAgainstSheet(pion({ 'fire-embers': 2 }), avant, 's1');
    const apres = applyReport(avant, r, pion(), () => 0);
    expect(apres.spells.states['fire-embers'].build).toEqual(emptyBuild());
  });
});
