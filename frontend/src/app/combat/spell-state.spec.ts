import { describe, expect, it } from 'vitest';
import { SpellsService } from '../services/spells.service';
import { catalogFrom } from './spell-catalog';
import classCatalog from '../../../public/resources/json/characters/classes.json';
import { spellAbilities } from './abilities';
import {
  BuilderContext,
  DEFAULT_RULES,
  SpellState,
  emptyBuild,
  spellProgress,
  xpThreshold,
} from './spell-customization';

/* L'XP d'un sort ouvre son budget, et ce budget change ce que la table joue.
   C'est la chaîne entière : fiche de personnage → moteur → barre d'actions. */

const spells = new SpellsService();
const ctx: BuilderContext = {
  rules: DEFAULT_RULES,
  classes: (classCatalog as { key: string; name: string }[]).map((c) => ({ key: c.key, name: c.name })),
  catalog: catalogFrom(spells.all()),
};

const etat = (xp: number, build: SpellState['build'] = null): SpellState =>
  ({ xp, build, lastReassignedAt: null });

describe('l’état d’un sort porté par la fiche', () => {
  it('un sort sans XP est au niveau 0 : aucun point à dépenser', () => {
    const p = spellProgress(0, DEFAULT_RULES);
    expect(p.level).toBe(0);
    expect(p.pointsEarned).toBe(0);
  });

  it('l’XP monte le niveau, et le niveau ouvre le budget', () => {
    const niv3 = spellProgress(xpThreshold(3, DEFAULT_RULES), DEFAULT_RULES);
    expect(niv3.level).toBe(3);
    expect(niv3.pointsEarned).toBe(3 * DEFAULT_RULES.pointsPerSpellLevel);
  });

  it('le niveau plafonne : l’XP au-delà ne donne plus rien', () => {
    const max = DEFAULT_RULES.maxSpellLevel;
    const enorme = spellProgress(xpThreshold(max, DEFAULT_RULES) * 10, DEFAULT_RULES);
    expect(enorme.level).toBe(max);
    expect(enorme.maxed).toBe(true);
  });

  it('un build payé par l’XP change les dégâts joués en combat', () => {
    const page = spells.bySlug('fire-embers')!;
    const [socle] = spellAbilities(page, ctx, etat(0));
    const [monte] = spellAbilities(page, ctx, etat(
      xpThreshold(3, DEFAULT_RULES),
      { ...emptyBuild(), params: { damage: 2 } },
    ));
    expect(monte.damages[0].max).toBeGreaterThan(socle.damages[0].max);
  });

  it('un build que le budget ne couvre pas ne s’applique pas gratuitement', () => {
    const page = spells.bySlug('fire-embers')!;
    // Aucun point gagné (niveau 0) mais un build gourmand : le sort ne doit pas
    // jouer ce qui n'a pas été payé.
    const [sansBudget] = spellAbilities(page, ctx, etat(0, { ...emptyBuild(), params: { damage: 3 } }));
    const [socle] = spellAbilities(page, ctx, etat(0));
    expect(sansBudget.damages[0].max).toBe(socle.damages[0].max);
  });

  it('un état absent vaut le socle : une fiche ancienne reste jouable', () => {
    const page = spells.bySlug('fire-embers')!;
    const [sansEtat] = spellAbilities(page, ctx, undefined);
    const [socle] = spellAbilities(page, ctx, etat(0));
    expect(sansEtat.damages[0].max).toBe(socle.damages[0].max);
    expect(sansEtat.manaCost).toBe(socle.manaCost);
  });
});
