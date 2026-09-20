import { describe, expect, it } from 'vitest';
import statusCatalog from '../../../public/resources/json/status_effects.json';
import damageTypeCatalog from '../../../public/resources/json/damage_type.json';
import { SpellsService } from '../services/spells.service';
import {
  CustomizableSpell,
  DEFAULT_RULES,
  comparisonFor,
  assessAtLevel,
  describeStats,
  expectedOutput,
  emptyBuild,
  fillTemplate,
  fromSpellEntry,
  formatVolume,
  formatWeight,
  lintSpell,
  measureLines,
  paramView,
  relevantLocks,
  SCALING_SWAP_SOURCES,
  baseStatsOf as C_base,
  scalingEntries,
  scalingSwapSources,
  spellOptions,
  swapAreaShape,
} from './spell-customization';
import { REFERENCE_CASTER } from './spell-economy';

/* ──────────────────────────────────────────────────────────────────────────
   PERSONNALISATION PAR BUDGET — ce que ce fichier vérifie, et ce qu'il ne
   vérifie PAS.

   Il ne fige AUCUN chiffre de fiche. L'équilibrage se règle sort après sort,
   souvent ; un test qui répète ces valeurs ne protège rien et vire au rouge à
   chaque réglage, jusqu'à ce qu'on ne le lise plus. Baisser des dégâts,
   remonter une durée ou déplacer un plafond ne doit jamais casser la suite.

   Restent deux garde-fous, qui ne parlent pas d'équilibrage :
   - toute fiche publiée doit rester LISIBLE par le moteur — chemins de
     paramètres qui pointent le socle, statuts connus, verrous non contournés,
     socle jouable à tout niveau de sort ;
   - les RÈGLES du moteur (conversion des ratios, forfaits, substitutions,
     effets propres) tiennent, éprouvées sur un sort d'essai écrit ici même,
     dont les chiffres n'appartiennent à aucun domaine.
─────────────────────────────────────────────────────────────────────────── */

const pages = new SpellsService().all();
const customizable = pages.filter((p) => p.spell.customization);
const ctx = { rules: DEFAULT_RULES, classes: [], catalog: {} };
const refSets = {
  statusKeys: new Set(statusCatalog.status_effects.map((s) => s.key)),
  damageTypes: new Set(damageTypeCatalog.specific_damage_types.map((d) => d.name)),
};

/**
 * Le sort d'essai : un revêtement imaginaire qui porte, en un seul endroit,
 * tout ce que le moteur sait faire — un pool de dégâts, un effet de stat, une
 * riposte, des effets propres, une substitution de type. Ses chiffres ne sont
 * l'équilibrage de personne : on peut les lire dans les attentes des tests
 * sans que le catalogue ait son mot à dire.
 */
function sample(over: Partial<CustomizableSpell> = {}): CustomizableSpell {
  return {
    key: 'essai-revetement',
    name: "Sort d'essai",
    domain: 'fire',
    level: 3,
    damageType: 'fire',
    baseStats: {
      damageMin: 2,
      damageMax: 4,
      mana: 4,
      range: '8 m',
      area: 'Cible unique',
      targets: ['enemy'],
      duration: 3,
      scaling: [{ source: 'atk_mag', ratio: 0.1 }],
      effects: [{ stat: 'speed', value: 2, scaling: [{ source: 'dexterite', ratio: 0.5 }] }],
      retaliate: {
        trigger: 'melee',
        damageMin: 2,
        damageMax: 4,
        damageType: 'fire',
        scaling: [{ source: 'atk_mag', ratio: 0.2 }],
        inflicts: [{ status: 'brulure', chance: 20 }],
      },
    },
    customization: {
      params: [
        { id: 'damage', kind: 'damage', label: 'Dégâts', path: 'damageMax', shift: ['damageMin'], min: 1, cap: { value: 8 } },
        { id: 'atkMagRatio', kind: 'ratio', label: 'Ratio Attaque magique', path: 'scaling.0.ratio', step: 0.1, min: 0, cap: { value: 0.5 } },
        { id: 'riposteRatio', kind: 'ratio', label: 'Ratio Attaque magique (riposte)', path: 'retaliate.scaling.0.ratio', step: 0.05, min: 0, cap: { value: 0.5 } },
        { id: 'mana', kind: 'mana', label: 'Mana', path: 'mana', min: 1, cap: { value: 2 } },
      ],
      scalingSwap: [
        { path: 'scaling.0', eligible: ['atk_mag', 'intelligence', 'sagesse', 'charisme'] },
        { path: 'effects.0.scaling.0', eligible: ['dexterite', 'constitution'] },
        { path: 'retaliate.scaling.0', eligible: ['atk_mag', 'intelligence', 'charisme'] },
      ],
    },
    lockedFields: [{ field: 'classBonuses', reason: "Propre à l'identité de la classe — hors budget." }],
    ...over,
  };
}

/** Les swaps d'un build, sans avoir à réécrire les quatre champs à chaque fois. */
const withSwaps = (over: Partial<ReturnType<typeof emptyBuild>['swaps']>) => ({ ...emptyBuild().swaps, ...over });

describe('Fiches officielles : lisibles par le moteur', () => {
  it('le catalogue expose bien des sorts au nouveau format', () => {
    expect(customizable.length).toBeGreaterThan(0);
  });

  for (const page of customizable) {
    const spell = fromSpellEntry(page.spell, page.domains)!;

    it(`${page.spell.key} : se lit par le moteur et respecte les principes du document`, () => {
      expect(spell).not.toBeNull();
      // `lintSpell` ne juge aucune valeur : il vérifie que la fiche se tient
      // (chemins réels, statuts connus, verrous non contournés).
      expect(lintSpell(spell, DEFAULT_RULES, refSets)).toEqual([]);
      // Le socle seul, sans rien dépenser, reste un build valide à tout niveau.
      for (let lvl = 0; lvl <= DEFAULT_RULES.maxSpellLevel; lvl++) {
        expect(assessAtLevel(spell, emptyBuild(), lvl, ctx).valid).toBe(true);
      }
      // Un texte vivant ne laisse aucune variable en clair (une faute de chemin se verrait).
      const socle = assessAtLevel(spell, emptyBuild(), 0, ctx).stats;
      for (const text of Object.values(page.spell.liveText ?? {})) {
        expect(fillTemplate(text!, spell, socle), text).not.toMatch(/\{[\w.:]+\}/);
      }
    });
  }
});

describe('Règles du moteur, sur le sort d’essai', () => {
  it('swap de scaling : liste centrale par défaut, restreinte ratio par ratio par la fiche', () => {
    const spell = sample();

    // Rien de déclaré : la liste centrale s'applique.
    const plain = sample({ customization: { ...spell.customization, scalingSwap: undefined } });
    expect(scalingSwapSources(plain, 'scaling.0')).toEqual(SCALING_SWAP_SOURCES);

    // Une règle par ratio : les dégâts, l'effet et la riposte n'ouvrent pas les mêmes sources.
    expect(scalingSwapSources(spell, 'scaling.0')).toEqual(['atk_mag', 'intelligence', 'sagesse', 'charisme']);
    expect(scalingSwapSources(spell, 'effects.0.scaling.0')).toEqual(['dexterite', 'constitution']);
    expect(scalingSwapSources(spell, 'retaliate.scaling.0')).toEqual(['atk_mag', 'intelligence', 'charisme']);

    // Une source hors liste est refusée.
    const refused = assessAtLevel(spell, { ...emptyBuild(), swaps: withSwaps({ scalings: [{ path: 'scaling.0', to: 'force' }] }) }, 5, ctx);
    expect(refused.valid).toBe(false);
    expect(refused.errors.join(' ')).toContain('pas une source permise');

    // Verrouiller le scaling ferme le swap.
    const locked = sample({ lockedFields: [{ field: 'scaling', reason: 'identité' }] });
    expect(spellOptions(locked).scalingSwap).toBeNull();
    expect(scalingSwapSources(locked, 'scaling.0')).toEqual([]);
  });

  it('swap de scaling : le ratio est converti, le rendement ne change pas', () => {
    const spell = sample();
    const toInt = withSwaps({ scalings: [{ path: 'scaling.0', to: 'intelligence' as const }] });
    const a = assessAtLevel(spell, { ...emptyBuild(), swaps: toInt }, 5, ctx);
    expect(a.stats.scaling).toEqual([{ source: 'intelligence', ratio: 0.5 }]); // 0,1 × 80 / 16
    expect(a.net).toBe(DEFAULT_RULES.costs.scalingSwap);
    const yieldOf = (s: { source: string; ratio: number }) => s.ratio * REFERENCE_CASTER[s.source];
    expect(yieldOf(a.stats.scaling![0])).toBeCloseTo(yieldOf(spell.baseStats.scaling![0]), 5);

    // Le réglage de ratio suit la nouvelle source : pas et plafond ×5.
    const tuned = assessAtLevel(spell, { ...emptyBuild(), swaps: toInt, params: { atkMagRatio: 1 } }, 5, ctx);
    expect(tuned.stats.scaling?.[0].ratio).toBe(1); // 0,5 + 0,1 × 5
    const direct = assessAtLevel(spell, { ...emptyBuild(), params: { atkMagRatio: 1 } }, 5, ctx);
    expect(tuned.net - a.net).toBe(direct.net); // même prix qu'avant le swap
  });

  it('swap de scaling : les ratios des effets et de la riposte s’échangent aussi, chacun son forfait', () => {
    const spell = sample();
    expect(scalingEntries(C_base(spell)).map((e) => `${e.path}:${e.scales}`)).toEqual([
      'scaling.0:dégâts',
      'effects.0.scaling.0:Vitesse',
      'retaliate.scaling.0:riposte',
    ]);

    const both = assessAtLevel(spell, { ...emptyBuild(), swaps: withSwaps({ scalings: [
      { path: 'effects.0.scaling.0', to: 'constitution' },
      { path: 'retaliate.scaling.0', to: 'charisme' },
    ] }) }, 5, ctx);
    expect(both.stats.effects?.[0].scaling).toEqual([{ source: 'constitution', ratio: 0.5 }]); // 0,5 × 14 / 14
    expect(both.stats.retaliate?.scaling).toEqual([{ source: 'charisme', ratio: 1.333 }]); // 0,2 × 80 / 12
    expect(both.net).toBe(2 * DEFAULT_RULES.costs.scalingSwap);

    // Un même ratio ne s'échange qu'une fois.
    const twice = assessAtLevel(spell, { ...emptyBuild(), swaps: withSwaps({ scalings: [
      { path: 'retaliate.scaling.0', to: 'charisme' },
      { path: 'retaliate.scaling.0', to: 'intelligence' },
    ] }) }, 5, ctx);
    expect(twice.valid).toBe(false);
  });

  it('effets propres : ce que le sort seul sait faire s’ajoute et se paie', () => {
    const spell = sample({
      customization: {
        ...sample().customization,
        ownEffects: [
          { id: 'vivifiant', label: 'Vivifiant', grants: { inflicts: [{ status: 'regeneration', chance: 100 }] } },
          { id: 'purifiant', label: 'Purifiant', grants: { cleanses: ['poison', 'brulure'] } },
        ],
      },
    });

    const both = assessAtLevel(spell, { ...emptyBuild(), ownEffects: ['vivifiant', 'purifiant'] }, 5, ctx);
    expect(both.errors).toEqual([]);
    expect(both.stats.inflicts).toEqual([{ status: 'regeneration', chance: 100 }]);
    expect(both.stats.cleanses).toEqual(['poison', 'brulure']);
    expect(both.net).toBe(2 * DEFAULT_RULES.costs.extraEffect);

    // Rien n'arrive tant qu'on ne les achète pas.
    const bare = assessAtLevel(spell, emptyBuild(), 5, ctx);
    expect(bare.stats.cleanses).toBeUndefined();
    expect(bare.stats.inflicts).toBeUndefined();

    // Un effet propre inconnu du sort est refusé.
    const unknown = assessAtLevel(spell, { ...emptyBuild(), ownEffects: ['inconnu'] }, 5, ctx);
    expect(unknown.valid).toBe(false);
  });

  it('substitution de type : le sort change de nature, pas de puissance', () => {
    const spell = sample({
      customization: { ...sample().customization, damageTypeSwap: { eligible: ['slashing'] } },
    });

    const cut = assessAtLevel(spell, { ...emptyBuild(), swaps: withSwaps({ damageType: 'slashing' }) }, 5, ctx);
    expect(cut.errors).toEqual([]);
    expect(cut.stats.damageType).toBe('slashing');
    // Une substitution, pas une répartition : pas de pool partagé en deux.
    expect(cut.stats.damages).toBeUndefined();
    expect(cut.stats.damageMin).toBe(spell.baseStats.damageMin);
    expect(cut.stats.damageMax).toBe(spell.baseStats.damageMax);
    expect(cut.net).toBe(DEFAULT_RULES.costs.damageTypeSwap);

    // Un type non déclaré reste hors de portée, et un sort qui n'en déclare aucun aussi.
    expect(assessAtLevel(spell, { ...emptyBuild(), swaps: withSwaps({ damageType: 'ice' }) }, 5, ctx).valid).toBe(false);
    expect(assessAtLevel(sample(), { ...emptyBuild(), swaps: withSwaps({ damageType: 'slashing' }) }, 5, ctx).valid).toBe(false);
  });

  it('mixage : une répartition de départ est acquise au socle, seul l’écart se paie', () => {
    const spell = sample({ swapOptions: { damageTypes: ['fire', 'earth'], defaultMix: { type: 'earth', tenths: 5 } } });
    const cost = DEFAULT_RULES.costs.mixPerTenth;

    // Sans rien dépenser : le pool est déjà partagé moitié-moitié.
    const bare = assessAtLevel(spell, emptyBuild(), 5, ctx);
    expect(bare.errors).toEqual([]);
    expect(bare.net).toBe(0);
    expect(bare.stats.damages).toEqual([
      { min: 1, max: 2, type: 'fire' },
      { min: 1, max: 2, type: 'earth' },
    ]);

    // Pousser vers la roche ou revenir au feu pur : on paie l'écart au départ, dans les deux sens.
    const more = assessAtLevel(spell, { ...emptyBuild(), mix: { type: 'earth', tenths: 7 } }, 5, ctx);
    expect(more.net).toBe(2 * cost);
    const pure = assessAtLevel(spell, { ...emptyBuild(), mix: { type: 'earth', tenths: 0 } }, 5, ctx);
    expect(pure.stats.damages).toBeUndefined();
    expect(pure.stats.damageType ?? spell.damageType).toBe('fire');
    expect(pure.net).toBe(5 * cost);

    // Sans départ déclaré, rien ne change : le socle reste pur et chaque dixième se paie.
    const plain = sample({ swapOptions: { damageTypes: ['fire', 'earth'] } });
    expect(assessAtLevel(plain, emptyBuild(), 5, ctx).stats.damages).toBeUndefined();
    expect(assessAtLevel(plain, { ...emptyBuild(), mix: { type: 'earth', tenths: 5 } }, 5, ctx).net).toBe(5 * cost);

    // Un départ vers un type hors table est une fiche incohérente.
    const wrong = sample({ swapOptions: { damageTypes: ['fire', 'earth'], defaultMix: { type: 'death', tenths: 5 } } });
    expect(lintSpell(wrong).some((i) => i.includes('defaultMix'))).toBe(true);
  });

  it('repoussement : un déblocage cher, puis chaque case de plus se paie', () => {
    const spell = sample({ customization: { ...sample().customization, knockbackUnlock: { cellsCap: { value: 3 } } } });
    const r = DEFAULT_RULES;

    // Rien sans déblocage.
    expect(assessAtLevel(spell, emptyBuild(), 5, ctx).stats.knockback).toBeUndefined();

    // Le déblocage seul : une case, au prix d'entrée.
    const one = assessAtLevel(spell, { ...emptyBuild(), knockback: { steps: 0 } }, 5, ctx);
    expect(one.errors).toEqual([]);
    expect(one.stats.knockback).toBe(r.unlockedKnockbackCells);
    expect(one.net).toBe(r.costs.knockbackUnlock);

    // Une case de plus : le prix d'un cran en sus.
    const two = assessAtLevel(spell, { ...emptyBuild(), knockback: { steps: 1 } }, 5, ctx);
    expect(two.stats.knockback).toBe(r.unlockedKnockbackCells + 1);
    expect(two.net).toBe(r.costs.knockbackUnlock + r.paramKinds.knockback.cost);

    // Un sort qui ne le déclare pas ne l'offre pas.
    expect(assessAtLevel(sample(), { ...emptyBuild(), knockback: { steps: 0 } }, 5, ctx).valid).toBe(false);
  });

  it('zone persistante : un effet propre peut l’attacher au lanceur', () => {
    const spell = sample({
      baseStats: { ...sample().baseStats, lingers: 'ground' },
      customization: {
        ...sample().customization,
        ownEffects: [{ id: 'suit', label: 'Suit le lanceur', cost: 6, grants: { lingers: 'caster' } }],
      },
    });
    expect(assessAtLevel(spell, emptyBuild(), 5, ctx).stats.lingers).toBe('ground');
    const follows = assessAtLevel(spell, { ...emptyBuild(), ownEffects: ['suit'] }, 5, ctx);
    expect(follows.errors).toEqual([]);
    expect(follows.stats.lingers).toBe('caster');
    // Le prix propre à l'effet l'emporte sur le forfait générique.
    expect(follows.net).toBe(6);
  });

  it('échelle qualitative : chaque cran est un échelon nommé, et se paie', () => {
    const ladder = [{ label: 'Trouble' }, { label: 'Claire' }, { label: 'Pure' }];
    const spell = sample({
      baseStats: { ...sample().baseStats, grades: { eau: 0 } },
      customization: {
        ...sample().customization,
        params: [{ id: 'eau', kind: 'grade', label: 'Degré', path: 'grades.eau', min: 0, max: 2, cap: { value: 2 }, ladder }],
      },
    });
    expect(lintSpell(spell)).toEqual([]);

    const two = assessAtLevel(spell, { ...emptyBuild(), params: { eau: 2 } }, 5, ctx);
    expect(two.errors).toEqual([]);
    expect(two.stats.grades?.['eau']).toBe(2);
    expect(two.net).toBe(2 * DEFAULT_RULES.paramKinds.grade.cost);
    // Pas d'échelon au-delà du dernier.
    expect(assessAtLevel(spell, { ...emptyBuild(), params: { eau: 3 } }, 5, ctx).stats.grades?.['eau']).toBe(2);

    // L'affichage montre le nom de l'échelon, pas un nombre.
    const view = paramView({ label: 'Degré', kind: DEFAULT_RULES.paramKinds.grade, base: 0, units: 1, cap: { value: 2 }, limits: { min: 0, max: 2 }, ladder });
    expect([view.baseText, view.valueText, view.up.value]).toEqual(['Trouble', 'Claire', 'Pure']);

    // Une échelle dont le socle n'est pas un échelon est une fiche incohérente.
    const off = sample({ ...spell, baseStats: { ...spell.baseStats, grades: { eau: 5 } } });
    expect(lintSpell(off).some((i) => i.includes('échelon'))).toBe(true);
  });

  it('progression multiplicative : petit au début, grand ensuite', () => {
    const vol = (growth: number | '1-2-5', cap?: number) => sample({
      baseStats: { ...sample().baseStats, volume: 100 },
      customization: {
        ...sample().customization,
        params: [{ id: 'v', kind: 'volume', label: 'Volume', path: 'volume', growth, min: 10, cap: cap ? { value: cap } : undefined }],
      },
    });
    const at = (spell: CustomizableSpell, n: number) => assessAtLevel(spell, { ...emptyBuild(), params: { v: n } }, 5, ctx).stats.volume;

    // Suite 1-2-5 : 100 mL → 200 → 500 → 1 L → 2 L → 5 L → 10 L.
    const nice = vol('1-2-5');
    expect(lintSpell(nice)).toEqual([]);
    expect([1, 2, 3, 4, 5, 6].map((n) => at(nice, n))).toEqual([200, 500, 1000, 2000, 5000, 10000]);
    // Mordre redescend la même suite.
    expect(at(nice, -2)).toBe(20);

    // Facteur libre : ×2 par cran.
    expect([1, 2, 3].map((n) => at(vol(2), n))).toEqual([200, 400, 800]);

    // Le plafond se compte en crans qui tiennent dessous : 1 L = 3 crans, le 4e passe en zone dégradée.
    const capped = vol('1-2-5', 1000);
    expect(assessAtLevel(capped, { ...emptyBuild(), params: { v: 3 } }, 5, ctx).net).toBe(3);
    expect(assessAtLevel(capped, { ...emptyBuild(), params: { v: 4 } }, 5, ctx).net).toBe(3 + 1);

    // L'affichage change d'unité tout seul.
    expect([formatVolume(250), formatVolume(2000), formatVolume(1_500_000)]).toEqual(['250 mL', '2 L', '1,5 m³']);

    // Une suite 1-2-5 doit partir d'une valeur ronde.
    const odd = sample({ ...nice, baseStats: { ...nice.baseStats, volume: 300 } });
    expect(lintSpell(odd).some((i) => i.includes('1-2-5'))).toBe(true);
  });

  it('texte vivant : chaque variable se lit comme son curseur', () => {
    const ladder = [
      { label: 'Trouble', description: 'On ne voit pas le fond.', action: 'de troubler' },
      { label: 'Claire', description: 'On voit le fond.', action: "d'éclaircir" },
    ];
    const spell = sample({
      baseStats: { ...sample().baseStats, volume: 200, grades: { eau: 0 } },
      customization: {
        ...sample().customization,
        params: [
          { id: 'v', kind: 'volume', label: 'Volume', path: 'volume', growth: '1-2-5', min: 10 },
          { id: 'eau', kind: 'grade', label: 'Degré', path: 'grades.eau', min: 0, max: 1, cap: { value: 1 }, ladder },
        ],
      },
    });
    const text = "{volume} d'eau {grades.eau} ({grades.eau:description}) — portée {range}, {inconnu}.";
    const socle = assessAtLevel(spell, emptyBuild(), 5, ctx).stats;
    expect(fillTemplate(text, spell, socle)).toBe("200 mL d'eau Trouble (On ne voit pas le fond.) — portée 8 m, {inconnu}.");
    const built = assessAtLevel(spell, { ...emptyBuild(), params: { v: 4, eau: 1 } }, 5, ctx).stats;
    expect(fillTemplate(text, spell, built)).toBe("5 L d'eau Claire (On voit le fond.) — portée 8 m, {inconnu}.");
    // Tout champ texte de l'échelon se lit : de quoi écrire une vraie phrase.
    expect(fillTemplate("Le sort permet {grades.eau:action} l'eau.", spell, built)).toBe("Le sort permet d'éclaircir l'eau.");
    // Un champ absent reste visible, comme un chemin inconnu.
    expect(fillTemplate('{grades.eau:inexistant}', spell, built)).toBe('{grades.eau:inexistant}');
  });

  it('comparaisons : un repère par seuil, puis un texte général', () => {
    const comparisons = [{ upTo: 200, text: 'un verre' }, { upTo: 1000, text: 'une bouteille' }, { text: 'beaucoup' }];
    const p = { id: 'v', kind: 'volume' as const, label: 'Volume', path: 'volume', growth: '1-2-5' as const, min: 10, comparisons };
    expect([100, 200, 500, 1000, 2000].map((v) => comparisonFor(p, v))).toEqual(['un verre', 'un verre', 'une bouteille', 'une bouteille', 'beaucoup']);

    const spell = sample({
      baseStats: { ...sample().baseStats, volume: 200 },
      customization: { ...sample().customization, params: [p] },
    });
    expect(lintSpell(spell)).toEqual([]);
    const built = assessAtLevel(spell, { ...emptyBuild(), params: { v: 2 } }, 5, ctx).stats;
    expect(fillTemplate('{volume}, soit {volume:comparison}', spell, built)).toBe('1 L, soit une bouteille');

    // Des seuils dans le désordre, ou un texte général qui n'est pas le dernier : fiche incohérente.
    const messy = sample({ ...spell, customization: { params: [{ ...p, comparisons: [{ text: 'tout' }, { upTo: 5, text: 'peu' }] }] } });
    expect(lintSpell(messy).some((i) => i.includes('comparaison'))).toBe(true);
  });

  it('forme de zone : le rectangle garde ses deux mesures, les autres n’en gardent qu’une', () => {
    expect(swapAreaShape('Rectangle 6 × 3 m', 'Rectangle', 'Cône')).toBe('Cône 6 m');
    // Un rayon devenu rectangle : une bande aussi large que le cercle, d'une case de profondeur.
    expect(swapAreaShape('Rayon 3 m', 'Rayon', 'Rectangle')).toBe('Rectangle 7,5 × 1,5 m');
    expect(swapAreaShape('Rayon 3 m', 'Rayon', 'Anneau')).toBe('Anneau 3 m');

    // Un curseur d'étendue règle la PREMIÈRE mesure du rectangle : sa largeur.
    const wave = sample({
      baseStats: { ...sample().baseStats, area: 'Rectangle 4,5 × 3 m' },
      customization: {
        ...sample().customization,
        params: [
          { id: 'front', kind: 'radius', label: 'Largeur du front', path: 'area', min: 1.5, cap: { value: 12 } },
          { id: 'depth', kind: 'radius', label: 'Profondeur', path: 'area', measure: 2, min: 1.5, cap: { value: 6 } },
        ],
        areaShapeSwap: { shapes: ['Rectangle', 'Cône'] },
      },
    });
    expect(lintSpell(wave)).toEqual([]);
    expect(assessAtLevel(wave, { ...emptyBuild(), params: { front: 1 } }, 5, ctx).stats.area).toBe('Rectangle 6 × 3 m');
    // La seconde mesure se règle à part : la profondeur, sans toucher au front.
    const deep = assessAtLevel(wave, { ...emptyBuild(), params: { depth: 2 } }, 5, ctx);
    expect(deep.stats.area).toBe('Rectangle 4,5 × 6 m');
    expect(deep.net).toBe(2 * DEFAULT_RULES.paramKinds.radius.cost);
    // Une profondeur visée sur un libellé qui n'en a pas est une fiche incohérente.
    const flat = sample({ ...wave, baseStats: { ...wave.baseStats, area: 'Rayon 3 m' } });
    expect(lintSpell(flat).some((i) => i.includes('mesure 2'))).toBe(true);
    const cone = assessAtLevel(wave, { ...emptyBuild(), swaps: withSwaps({ areaShape: 'Cône' }) }, 5, ctx);
    expect(cone.stats.area).toBe('Cône 4,5 m');
    expect(cone.net).toBe(DEFAULT_RULES.costs.areaShapeSwap);
  });

  it('mesures : un poids se lit en g, kg ou t, avec son repère, comme un volume', () => {
    expect([formatWeight(200), formatWeight(2000), formatWeight(1_500_000)]).toEqual(['200 g', '2 kg', '1,5 t']);
    const spell = sample({
      baseStats: { ...sample().baseStats, weight: 100, volume: 200 },
      customization: {
        ...sample().customization,
        params: [
          { id: 'w', kind: 'weight', label: 'Puissance', path: 'weight', growth: '1-2-5', min: 10,
            comparisons: [{ upTo: 500, text: 'une dague' }, { text: 'bien plus' }] },
          { id: 'v', kind: 'volume', label: 'Volume', path: 'volume', growth: '1-2-5', min: 10 },
        ],
      },
    });
    expect(lintSpell(spell)).toEqual([]);
    const built = assessAtLevel(spell, { ...emptyBuild(), params: { w: 4, v: 1 } }, 5, ctx).stats;
    // Une case par mesure : le poids avec son repère, le volume sans (il n'en déclare pas).
    expect(measureLines(spell, built)).toEqual([
      { id: 'w', label: 'Puissance', value: '2 kg', comparison: 'bien plus' },
      { id: 'v', label: 'Volume', value: '500 mL', comparison: '' },
    ]);
  });

  it('effet propre : il pose un champ que le socle n’a pas, jamais un qu’il a', () => {
    const drain = { id: 'drain', label: 'Drain', cost: 6, grants: { set: { damagePercentCurrentHp: { min: 3, max: 5 } } } };
    const spell = sample({ customization: { ...sample().customization, ownEffects: [drain] } });
    expect(lintSpell(spell)).toEqual([]);
    const a = assessAtLevel(spell, { ...emptyBuild(), ownEffects: ['drain'] }, 5, ctx);
    expect(a.errors).toEqual([]);
    expect(a.stats.damagePercentCurrentHp).toEqual({ min: 3, max: 5 });
    expect(a.net).toBe(6);

    // Poser un champ que le socle porte déjà, ce serait le remplacer : refusé.
    const clash = sample({
      customization: { ...sample().customization, ownEffects: [{ id: 'x', label: 'X', grants: { set: { range: '30 m' } } }] },
    });
    expect(lintSpell(clash).some((i) => i.includes('porte déjà'))).toBe(true);
    expect(assessAtLevel(clash, { ...emptyBuild(), ownEffects: ['x'] }, 5, ctx).valid).toBe(false);
  });

  it('un verrou ne se contourne pas par une option', () => {
    const locked = sample({ lockedFields: [{ field: 'targets', reason: 'le sort ne choisit pas ses victimes' }] });
    const sneaky = sample({
      lockedFields: locked.lockedFields,
      customization: { ...sample().customization, targetUnlock: { eligible: ['self'] } },
    });
    expect(lintSpell(sneaky).some((i) => i.includes('verrouillé'))).toBe(true);
    // Un effet propre ne sert pas de porte dérobée non plus.
    const backdoor = sample({
      lockedFields: [{ field: 'inflicts', reason: 'ce que le sort inflige EST le sort' }],
      customization: {
        ...sample().customization,
        ownEffects: [{ id: 'x', label: 'X', grants: { inflicts: [{ status: 'brulure', chance: 50 }] } }],
      },
    });
    expect(lintSpell(backdoor).some((i) => i.includes('verrouillé'))).toBe(true);
  });

  it('drain : une part des dégâts, réglée par crans de 5 %, et lue comme telle', () => {
    // Le miroir du contre-coup : le sort d'essai en gagne un, à 20 %.
    const base = sample();
    const spell = sample({
      baseStats: { ...base.baseStats, drain: 0.2 },
      customization: {
        ...base.customization,
        params: [
          ...(base.customization.params ?? []),
          { id: 'drain', kind: 'drain', label: 'Part siphonnée', path: 'drain', step: 0.05, min: 0, cap: { value: 0.5 } },
        ],
      },
    });
    expect(lintSpell(spell, DEFAULT_RULES, refSets)).toEqual([]);

    // Deux crans montent la part de 10 points de pourcentage…
    const monte = assessAtLevel(spell, { params: { drain: 2 } }, 5, ctx);
    expect(monte.stats.drain).toBeCloseTo(0.3, 6);
    // … et se paient au tarif du drain, plus cher que le soin.
    expect(monte.net).toBe(2 * DEFAULT_RULES.paramKinds.drain.cost);

    // La fiche parle en pourcentage de ce qui est porté, jamais en fraction.
    const ligne = describeStats(monte.stats).find((r) => r.key === 'drain');
    expect(ligne?.value).toContain('30 %');
    // Et ce qu'il rend suit les dégâts : rien à drainer, rien de rendu.
    const player = { attributes: {}, stats: { mana: 20 }, spellState: {} } as unknown as Parameters<typeof expectedOutput>[1];
    expect(expectedOutput(monte.stats, player).some((r) => r.label === 'Drain moyen')).toBe(true);
    const sansDegats = { ...monte.stats, damageMin: undefined, damageMax: undefined };
    expect(expectedOutput(sansDegats, player).some((r) => r.label === 'Drain moyen')).toBe(false);
  });

  it('la Famille 5 ne montre que ce qui concerne le sort', () => {
    // Le verrou reste dans la donnée (c'est un principe)…
    const spell = sample();
    expect((spell.lockedFields ?? []).map((l) => l.field)).toContain('classBonuses');
    // … mais un sort sans bonus de classe n'a rien à dire au lecteur.
    expect(relevantLocks(spell)).toEqual([]);
    const withBonus = sample({ baseStats: { ...sample().baseStats, classBonuses: [{ class: 'mage', description: 'x' }] } });
    expect(relevantLocks(withBonus).map((l) => l.field)).toEqual(['classBonuses']);
    // Un verrou narratif (hors stats) compte toujours.
    const narrative = sample({ lockedFields: [{ field: 'narrativeResistance', reason: 'seul un 20 naturel' }] });
    expect(relevantLocks(narrative)).toHaveLength(1);
  });
});
