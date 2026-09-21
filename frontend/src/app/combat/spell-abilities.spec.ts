import { describe, expect, it } from 'vitest';
import { SpellsService } from '../services/spells.service';
import { catalogFrom } from './spell-catalog';
import classCatalog from '../../../public/resources/json/characters/classes.json';
import { spellAbilities, builtSpellNode } from './abilities';
import { BuilderContext, DEFAULT_RULES, SpellState, emptyBuild } from './spell-customization';

/* Un sort équipé doit redevenir une action jouable, maintenant qu'il se lit par
   son socle et son build et non plus par un arbre de paliers. */

const spells = new SpellsService();
const ctx: BuilderContext = {
  rules: DEFAULT_RULES,
  classes: (classCatalog as { key: string; name: string }[]).map((c) => ({ key: c.key, name: c.name })),
  catalog: catalogFrom(spells.all()),
};

describe('un sort équipé devient une capacité', () => {
  it('chaque sort du wiki produit au moins une action', () => {
    const muets = spells.all().filter((p) => spellAbilities(p, ctx).length === 0);
    expect(muets.map((p) => p.spell.key)).toEqual([]);
  });

  it('au socle, le sort porte les chiffres de sa fiche', () => {
    const page = spells.bySlug('fire-embers')!;
    const [action] = spellAbilities(page, ctx);
    const socle = page.spell.baseStats!;
    expect(action.name).toBe(page.spell.name);
    expect(action.manaCost).toBe(socle.mana);
    expect(action.damages[0]?.min).toBe(socle.damageMin);
    expect(action.damages[0]?.max).toBe(socle.damageMax);
  });

  it('sans état enregistré, le sort se joue au socle — pas d’erreur', () => {
    const page = spells.bySlug('fire-embers')!;
    const node = builtSpellNode(page.spell, page.domains, undefined, ctx)!;
    expect(node.stats).toEqual(expect.objectContaining({ mana: page.spell.baseStats!.mana }));
  });

  it('l’XP du sort ouvre un budget : le build dépensé change ce qui est joué', () => {
    const page = spells.bySlug('fire-embers')!;
    // 3 niveaux de sort = 3 × pointsPerSpellLevel à dépenser ; on pousse les dégâts.
    const state: SpellState = {
      xp: DEFAULT_RULES.xpBase * 3,
      build: { ...emptyBuild(), params: { damage: 2 } },
      lastReassignedAt: null,
    };
    const socle = builtSpellNode(page.spell, page.domains, undefined, ctx)!;
    const monte = builtSpellNode(page.spell, page.domains, state, ctx)!;
    expect(monte.stats.damageMax!).toBeGreaterThan(socle.stats.damageMax!);
  });

  it('un sort à options donne une action par option', () => {
    const aOptions = spells.all().filter((p) => (p.spell.baseStats?.choices?.length ?? 0) > 1);
    for (const page of aOptions) {
      expect(spellAbilities(page, ctx).length).toBe(page.spell.baseStats!.choices!.length);
    }
  });
});
