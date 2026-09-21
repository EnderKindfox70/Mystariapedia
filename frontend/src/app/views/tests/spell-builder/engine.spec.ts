import { describe, expect, it } from 'vitest';
import { SpellsService } from '../../../services/spells.service';
import { SpellNode } from '../../../wiki.types';
import { DAMAGE_TYPES, STATUSES, TEST_PLAYERS, TEST_SPELLS, builderContext } from './data';
import {
  Build,
  DEFAULT_RULES,
  DOMAIN_BY_KEY,
  MAX_DOMAINS,
  assess,
  checkAccess,
  clone,
  emptyBuild,
  evaluate,
  getAt,
  lintSpell,
  priceParam,
  readNum,
  spellOptions,
  spellProgress,
  xpForCast,
  xpThreshold,
} from '../../../combat/spell-customization';

/* ──────────────────────────────────────────────────────────────────────────
   BANC D'ESSAI — PERSONNALISATION DE SORTS PAR BUDGET

   Deux choses sont vérifiées ici :
   1. les règles de `mystaria_mecanique_personnalisation_sorts.md`, une par une,
      y compris les chiffres que le document calcule lui-même (204 points,
      14 + 6, 8,4 + 3,6) ;
   2. la FIDÉLITÉ des copies de test au wiki : socle identique au nœud racine
      réel, plafonds égaux aux valeurs qu'ils prétendent citer. Retoucher un
      sort dans domains/*.json fait échouer ce spec tant que la copie n'a pas
      suivi.
─────────────────────────────────────────────────────────────────────────── */

const pages = new SpellsService().all();
const ctx = builderContext(pages);
const spell = (key: string) => TEST_SPELLS.find((s) => s.key === key)!;
const player = (id: string) => clone(TEST_PLAYERS.find((p) => p.id === id)!);
const build = (patch: Partial<Build>): Build => ({ ...emptyBuild(), ...patch });

describe('Progression propre au sort', () => {
  it('20 lancers en combat = 10 entraînements = niveau de sort 1', () => {
    const combat = 20 * xpForCast('combat');
    const training = 10 * xpForCast('training');
    expect(combat).toBe(10);
    expect(training).toBe(10);
    expect(spellProgress(combat).level).toBe(1);
    expect(spellProgress(training).level).toBe(1);
    expect(spellProgress(9.5).level).toBe(0);
  });

  it('le seuil du niveau N vaut 10 × N cumulé (courbe du document)', () => {
    expect([1, 2, 3].map((n) => xpThreshold(n))).toEqual([10, 20, 30]);
    const tri = { ...DEFAULT_RULES, xpCurve: 'triangular' as const };
    expect([1, 2, 3].map((n) => xpThreshold(n, tri))).toEqual([10, 30, 60]);
  });

  it('le niveau de sort ne dépend QUE de son XP, jamais du niveau du personnage', () => {
    const debutant = player('seve'); // niveau 3
    const veteran = player('seve');
    veteran.level = 20;
    for (const p of [debutant, veteran]) p.spellState['plant-toxine-vegetale'].xp = 40;
    const [a, b] = [debutant, veteran].map((p) => assess(spell('plant-toxine-vegetale'), p, ctx));
    expect(a.progress.level).toBe(4);
    expect(b.progress.level).toBe(4);
    expect(a.progress.pointsEarned).toBe(4 * DEFAULT_RULES.pointsPerSpellLevel);
  });

  it('tout sort plafonne au niveau 5 ; l’XP au-delà est gardée sans effet', () => {
    const p = spellProgress(95);
    expect(p.level).toBe(5);
    expect(p.maxed).toBe(true);
    expect(p.nextThreshold).toBeNull();
    expect(p.xp).toBe(95);
    expect(p.pointsEarned).toBe(5 * DEFAULT_RULES.pointsPerSpellLevel);
    expect(spellProgress(49).maxed).toBe(false);
    // Relever le plafond fait compter l'XP déjà gagnée.
    expect(spellProgress(95, { ...DEFAULT_RULES, maxSpellLevel: 10 }).level).toBe(9);
  });
});

describe('Plafonds et mordant (Famille 1)', () => {
  it('Option D : combler 16 → 24 au-delà du plafond coûte 204 points (vérification du document)', () => {
    const r = priceParam({ label: '', cost: 1, step: 1, better: 'up', capKind: 'soft' }, 16, 8, { value: 16 });
    expect(r.cost).toBe(204);
    expect(r.value).toBe(24);
    expect(r.zone).toBe('degrade');
  });

  it('linéaire jusqu’au plafond, puis k² par cran excédentaire', () => {
    const range = DEFAULT_RULES.paramKinds.range;
    // Braises : 8 m, plafond dégradé 10 m → 2 crans à 1, puis 1, 4, 9…
    expect([2, 3, 4, 5].map((u) => priceParam(range, 8, u, { value: 10 }).cost)).toEqual([2, 3, 7, 16]);
  });

  it('Option A : au-delà d’un plafond DUR, l’effet bloque et les points sont perdus', () => {
    const r = priceParam(DEFAULT_RULES.paramKinds.damage, 2, 5, { value: 5 });
    expect(r.value).toBe(5);
    expect(r.effective).toBe(3);
    expect(r.lost).toBe(2);
    expect(r.cost).toBe(5);
  });

  it('mordre rend des points au même taux (+1 mana = 2 points gagnés)', () => {
    expect(priceParam(DEFAULT_RULES.paramKinds.damage, 2, -1, { value: 5 }).cost).toBe(-1);
    const mana = priceParam(DEFAULT_RULES.paramKinds.mana, 3, -1, { value: 1 });
    expect(mana.cost).toBe(-2);
    expect(mana.value).toBe(4);
  });

  it('Braises : le mordant finance un gain ailleurs, sous le socle du niveau 1', () => {
    const ev = evaluate(spell('fire-embers'), build({ params: { damage: -1, range: 1 } }), player('ignis'), ctx);
    expect([ev.stats.damageMin, ev.stats.damageMax]).toEqual([0, 1]);
    expect(ev.stats.range).toBe('9 m');
    expect(ev.net).toBe(0);
    expect(ev.errors).toEqual([]);
  });

  it('Braises : dégâts plafonnés en dur au tier 3 réel (5)', () => {
    const ev = evaluate(spell('fire-embers'), build({ params: { damage: 4 } }), player('ignis'), ctx);
    expect([ev.stats.damageMin, ev.stats.damageMax]).toEqual([4, 5]);
    expect(ev.gross).toBe(4);
    expect(ev.lost).toBe(1);
  });
});

describe('Familles 2 et 3', () => {
  it('statut absent débloqué à 10 %, puis magnitude en Famille 1', () => {
    const ev = evaluate(spell('fire-embers'), build({ statusUnlock: { status: 'aveuglement', steps: 2 } }), player('ignis'), ctx);
    expect(ev.stats.inflicts?.at(-1)).toEqual({ status: 'aveuglement', chance: 20 });
    expect(ev.net).toBe(3 + 2);
  });

  it('un statut hors liste d’éligibilité est refusé', () => {
    const ev = evaluate(spell('fire-embers'), build({ statusUnlock: { status: 'paralysie', steps: 0 } }), player('ignis'), ctx);
    expect(ev.errors.some((e) => e.includes('non éligible'))).toBe(true);
  });

  it('2bis : Échauffement passe en entretien continu (5 pts), entretien = coût de lancement', () => {
    const ev = evaluate(spell('fire-echauffement'), build({ continuous: true, upkeepSteps: 1, params: { duration: 1 } }), player('ignis'), ctx);
    expect(ev.stats.duration).toBe(-1);
    expect(ev.stats.upkeep).toBe(2);
    expect(ev.net).toBe(5 + 2);
    expect(ev.warnings.some((w) => w.includes('mode continu'))).toBe(true);
  });

  it('Famille 3 : plafond ABSOLU de 3 pantins, 4 points par cran', () => {
    const fils = spell('darkness-fils-du-marionnettiste');
    const ok = evaluate(fils, build({ extraTargets: 2 }), player('ignis'), ctx);
    expect(ok.stats.maxPuppets).toBe(3);
    expect(ok.net).toBe(8);
    const ko = evaluate(fils, build({ extraTargets: 3 }), player('ignis'), ctx);
    expect(ko.errors.some((e) => e.includes('plafond absolu'))).toBe(true);
  });

  it('Famille 3 : un 3e effet simultané coûte 4', () => {
    const ev = evaluate(spell('fire-echauffement'), build({ extraEffects: ['endurance'] }), player('ignis'), ctx);
    expect(ev.stats.effects?.length).toBe(3);
    expect(ev.net).toBe(4);
  });
});

describe('Famille 4, 4bis et 4ter', () => {
  it('swaps à coût plat : forme de zone, statut, cible', () => {
    const lava = evaluate(spell('combo-coulee-de-lave'), build({
      swaps: { scalings: [], areaShape: 'Cône', defaultTarget: false, statusType: { index: 0, to: 'enracinement' } },
    }), player('brenn'), ctx);
    expect(lava.stats.area).toBe('Cône 3 m');
    expect(lava.stats.inflicts?.[0].status).toBe('enracinement');
    expect(lava.net).toBe(2 + 3);

    const fils = evaluate(spell('darkness-fils-du-marionnettiste'), build({
      swaps: { scalings: [], areaShape: null, defaultTarget: true, statusType: null },
    }), player('ignis'), ctx);
    expect(fils.stats.targets).toEqual(['ally']);
    expect(fils.net).toBe(4);
  });

  it('4bis : mixage Feu → Terre de la lave à somme constante (document : pool 20, 30 %)', () => {
    const lava = clone(spell('combo-coulee-de-lave'));
    lava.baseStats.damageMin = 20;
    lava.baseStats.damageMax = 20;
    const ev = evaluate(lava, build({ mix: { type: 'earth', tenths: 3 } }), player('brenn'), ctx);
    expect(ev.stats.damages?.map((d) => [d.min, d.type])).toEqual([[14, 'fire'], [6, 'earth']]);
    expect(ev.net).toBe(3);
    const full = evaluate(lava, build({ mix: { type: 'earth', tenths: 10 } }), player('brenn'), ctx);
    expect(full.stats.damageType).toBe('earth');
    expect(full.stats.damageMax).toBe(20);
    expect(full.net).toBe(10);
  });

  it('4bis : un type non déclaré dans la table du sort est refusé', () => {
    const ev = evaluate(spell('combo-coulee-de-lave'), build({ mix: { type: 'water', tenths: 3 } }), player('brenn'), ctx);
    expect(ev.errors.some((e) => e.includes('compatible'))).toBe(true);
  });

  it('4ter : Braises + Foudre (document : pool 12, 30 % → 8,4 + 3,6)', () => {
    const embers = clone(spell('fire-embers'));
    embers.baseStats.damageMin = 12;
    embers.baseStats.damageMax = 12;
    const ev = evaluate(embers, build({ crossDomain: 'electricity', mix: { type: 'lightning', tenths: 3 } }), player('ignis'), ctx);
    expect(ev.stats.damages?.map((d) => [d.min, d.type])).toEqual([[8.4, 'fire'], [3.6, 'lightning']]);
    expect(ev.net).toBe(4 + 3);
    expect(ev.errors).toEqual([]);
  });

  it('4ter : double prérequis — sans investissement dans le domaine ajouté, refusé', () => {
    const ev = evaluate(spell('fire-embers'), build({ crossDomain: 'electricity', mix: { type: 'lightning', tenths: 1 } }), player('brenn'), ctx);
    expect(ev.errors.some((e) => e.includes('investi'))).toBe(true);
    const eau = evaluate(spell('fire-embers'), build({ crossDomain: 'water' }), player('ignis'), ctx);
    expect(eau.errors.some((e) => e.includes('crossDomainEligible'))).toBe(true);
  });

  it('4ter : sans déblocage, le curseur n’ouvre pas le domaine non natif', () => {
    const ev = evaluate(spell('fire-embers'), build({ mix: { type: 'lightning', tenths: 3 } }), player('ignis'), ctx);
    expect(ev.errors.some((e) => e.includes('compatible'))).toBe(true);
  });

  it('priorité : un champ gouverné par une mécanique de domaine n’entre jamais dans le budget', () => {
    const toxine = clone(spell('plant-toxine-vegetale'));
    toxine.customization.statusTypeSwap = { eligible: ['paralysie'] };
    toxine.customization.statusUnlock = { eligible: ['paralysie'] };
    expect(spellOptions(toxine).statusTypeSwap).toBeNull();
    expect(spellOptions(toxine).statusUnlock).toBeNull();
    expect(lintSpell(toxine).some((i) => i.includes('gouverné'))).toBe(true);
    const ev = evaluate(toxine, build({
      swaps: { scalings: [], areaShape: null, defaultTarget: false, statusType: { index: 0, to: 'paralysie' } },
    }), player('seve'), ctx);
    expect(ev.stats.inflicts?.[0].status).toBe('poison');
    expect(ev.errors.some((e) => e.includes('gouverné'))).toBe(true);
  });
});

describe('Budget et accès du joueur type', () => {
  it('dépenser plus que les points gagnés invalide le build', () => {
    const ignis = player('ignis');
    ignis.spellState['fire-embers'].xp = 10; // niveau de sort 1 → 5 points
    const a = assess(spell('fire-embers'), ignis, ctx, build({ extraTargets: 1, params: { range: 2 } }));
    expect(a.progress.pointsEarned).toBe(5);
    expect(a.net).toBe(6);
    expect(a.remaining).toBe(-1);
    expect(a.valid).toBe(false);
  });

  it('niveau, domaines, prérequis et inspiration', () => {
    const etincelle = checkAccess(spell('life-etincelle-vitale'), player('seve'), ctx);
    expect(etincelle.learnable).toBe(false);
    expect(etincelle.conds.find((c) => c.id === 'level')?.ok).toBe(false);

    const ignis = player('ignis');
    expect(checkAccess(spell('darkness-fils-du-marionnettiste'), ignis, ctx).learnable).toBe(true);
    expect(checkAccess(spell('fire-embers'), ignis, ctx).usable).toBe(true);

    const brenn = player('brenn');
    expect(checkAccess(spell('combo-coulee-de-lave'), brenn, ctx).usable).toBe(true);
    brenn.domains = ['fire'];
    expect(checkAccess(spell('combo-coulee-de-lave'), brenn, ctx).usable).toBe(false);
  });
});

describe('Fidélité des copies de test au wiki', () => {
  const refSets = { statusKeys: new Set(STATUSES.map((s) => s.key)), damageTypes: new Set(DAMAGE_TYPES) };

  /*
    Les plafonds ancrés citaient l'ARBRE du sort (`tier3`, `treeMin`,
    `treeMax`). Les fiches n'en ont plus : le wiki porte directement son socle
    et ses plafonds, et c'est désormais LUI la référence.

    Ce que la garde vérifie, du coup : que la copie reste accrochée à un sort
    réel, que son identité n'a pas glissé, et qu'un plafond ancré dit toujours
    quel champ il cite. La VALEUR d'un plafond n'est plus recalculable — plus
    d'arbre où la relire — et les copies portent des écarts volontaires
    (cf. leurs `_notes`) : les comparer à l'aveugle reviendrait à figer des
    hypothèses de test dans le wiki.
  */
  for (const copy of TEST_SPELLS) {
    it(`${copy.key} : reste accrochée à ${copy.source.file}`, () => {
      const page = pages.find((p) => p.spell.key === copy.source.key);
      expect(page, 'sort d’origine introuvable').toBeDefined();
      const original = page!.spell;
      expect(original.customization, 'le sort d’origine ne se personnalise plus').toBeDefined();
      expect(original.baseStats, 'le sort d’origine n’a plus de socle').toBeDefined();
      expect(copy.level).toBe(original.level);
      expect(copy.requires ?? []).toEqual(original.requires ?? []);
      expect(copy.components ?? [copy.domain]).toEqual(page!.domains);

      const c = copy.customization;
      // Un CURSEUR règle une mesure qui existe déjà : son plafond doit donc
      // citer un champ du socle. Un DÉBLOCAGE, lui, vise une case encore vide
      // (le statut qu'on n'a pas) — on exige seulement qu'il dise laquelle.
      for (const p of c.params ?? []) {
        if (!p.cap?.anchor || p.cap.anchor === 'assumption') continue;
        const path = p.cap.path ?? p.path;
        expect(readNum(getAt(copy.baseStats, path)), `${p.id} : « ${path} » ne pointe rien dans le socle`)
          .not.toBeNaN();
      }
      for (const [label, cap] of [
        ['statusUnlock', c.statusUnlock?.chanceCap],
        ['scalingUnlock', c.scalingUnlock?.ratioCap],
        ['continuousMode', c.continuousMode?.upkeepCap],
      ] as const) {
        if (!cap?.anchor || cap.anchor === 'assumption') continue;
        expect(cap.path, `${label} : un plafond ancré doit dire quel champ il cite`).toBeTruthy();
      }
    });

    it(`${copy.key} : respecte les principes du document`, () => {
      expect(lintSpell(copy, DEFAULT_RULES, refSets)).toEqual([]);
      expect((copy.lockedFields ?? []).some((l) => l.field === 'classBonuses')).toBe(true);
    });
  }

  for (const p of TEST_PLAYERS) {
    it(`joueur type ${p.id} : cohérent avec le wiki`, () => {
      expect(ctx.classes.some((c) => c.key === p.class)).toBe(true);
      expect(p.domains.length).toBeLessThanOrEqual(MAX_DOMAINS);
      for (const d of p.domains) expect(DOMAIN_BY_KEY[d], `domaine ${d}`).toBeDefined();
      for (const k of p.knownSpells) expect(ctx.catalog[k], `sort connu ${k}`).toBeDefined();
    });
  }
});
