import { describe, expect, it } from 'vitest';
import traitCatalog from '../../../public/resources/json/trait.json';
import { CharacterSheet } from './character.types';
import {
  CREATION_TRAIT_SLOTS,
  FEAT_LEVELS,
  TRAIT_CATALOG,
  catalogTrait,
  chosenDomainFeats,
  chosenTraits,
  computeAttributes,
  computeStats,
  domainFeats,
  emptySheet,
  featAttributeBonuses,
  featDomainName,
  featDomainsFor,
  featSlotsFor,
  findDomainFeat,
  statContributions,
} from './universe-data';

/** Une fiche de niveau 20 avec un trait de création et trois paliers dépensés. */
function sheetWithFeats(): CharacterSheet {
  const sheet = emptySheet();
  sheet.level = 20;
  sheet.domains = ['light', 'fire'];
  sheet.creationTraits = ['increvable'];
  sheet.feats = [
    { level: 5, pick: 'attribute', attribute: 'force' },
    { level: 10, pick: 'trait', trait: 'canal-stable' },
    { level: 15, pick: 'domain', feat: 'light-focale', domain: 'light' },
  ];
  return sheet;
}

describe('catalogue de traits (section 16)', () => {
  it('expose les traits prenables, avec leurs effets chiffrés quand il y en a', () => {
    // 18 traits de la section 16 (Amphibie et Vision dans le noir sont
    // biologiques, donc hors catalogue de choix), + Entraînement martial,
    // Études magiques et Nageur rapatriés des backgrounds, + Akimbo.
    expect(TRAIT_CATALOG).toHaveLength(22);
    expect(TRAIT_CATALOG.every((t) => t.acquisition.pickable)).toBe(true);
    expect(catalogTrait('increvable')?.effects).toEqual([{ key: 'hp', value: 15 }]);
    expect(catalogTrait('inconnu')).toBeUndefined();
  });

  it('ne double aucune ligne de la source unique `trait.json`', () => {
    const rows = traitCatalog.traits;
    expect(new Set(rows.map((t) => t.id)).size).toBe(rows.length);
    const keys = TRAIT_CATALOG.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Deux traits jouables réutilisent une ligne déjà écrite pour les créatures.
    expect(catalogTrait('amphibie')?.id).toBe(1);
    expect(catalogTrait('sensible-au-residuel')?.id).toBe(4);
  });

  it('un trait choisi pèse sur les stats comme un trait de race', () => {
    // Une classe qui donne des PV : sans réserve de départ, le plancher
    // « min. 1 » masquerait une partie de l'écart.
    const klass = { key: 'guerrier', name: 'Guerrier', stats: [{ key: 'hp', value: 6 }] };
    const sheet = sheetWithFeats();
    sheet.statMode = 'mean';
    sheet.creationTraits = ['increvable'];
    const attrs = computeAttributes(sheet, undefined, '');
    const withTrait = computeStats(sheet, undefined, klass, chosenTraits(sheet), attrs);
    const without = computeStats(sheet, undefined, klass, [], attrs);
    expect(withTrait.hp - without.hp).toBe(15);
  });
});

describe('slots de feat (paliers 5/10/15/20)', () => {
  it("n'ouvre un palier qu'une fois le niveau atteint", () => {
    expect(FEAT_LEVELS).toEqual([5, 10, 15, 20]);
    expect(featSlotsFor(1)).toEqual([]);
    expect(featSlotsFor(12)).toEqual([5, 10]);
    expect(featSlotsFor(20)).toEqual([5, 10, 15, 20]);
  });

  it('rend un point d\'attribut quand le slot achète un attribut', () => {
    const sheet = sheetWithFeats();
    expect(featAttributeBonuses(sheet).force).toBe(1);
    expect(computeAttributes(sheet, undefined, '').force).toBe(9);
  });

  it('additionne les traits de création et ceux achetés sur un slot', () => {
    expect(chosenTraits(sheetWithFeats()).map((t) => t.key)).toEqual([
      'increvable',
      'canal-stable',
    ]);
    expect(CREATION_TRAIT_SLOTS).toBe(1);
  });

  it('suspend les choix des paliers non atteints sans les effacer', () => {
    const sheet = sheetWithFeats();
    sheet.level = 6;
    expect(chosenTraits(sheet).map((t) => t.key)).toEqual(['increvable']);
    expect(chosenDomainFeats(sheet)).toHaveLength(0);
    expect(sheet.feats).toHaveLength(3);
  });
});

describe('feats domaniaux passifs (statEffects)', () => {
  /** Un mage de niveau 20 : il faut une vraie réserve pour voir le mana baisser. */
  const MAGE = { key: 'mage', name: 'Mage', stats: [{ key: 'mana', value: 5 }] };

  function sheetWithPassives(): CharacterSheet {
    const sheet = emptySheet();
    sheet.level = 20;
    sheet.statMode = 'mean';
    sheet.identity.origin = 'archipel'; // ouvre les branches non polarisées
    sheet.feats = [
      { level: 5, pick: 'domain', feat: 'renforcement-peau-dure', domain: 'renforcement' },
      { level: 10, pick: 'domain', feat: 'renforcement-muscle-renforce', domain: 'renforcement' },
    ];
    return sheet;
  }

  it('laisse prendre les deux feats de palier 5 du Renforcement', () => {
    const five = domainFeats('renforcement').filter((f) => f.level === 5);
    expect(five.map((f) => f.name)).toEqual(['Peau dure', 'Muscle renforcé']);
    // Non exclusifs : rien n'empêche d'avoir les deux, sur deux paliers.
    expect(five.every((f) => !f.excludes)).toBe(true);
    expect(chosenDomainFeats(sheetWithPassives())).toHaveLength(2);
  });

  it('applique leurs effets aux stats et aux attributs de la fiche', () => {
    const withFeats = sheetWithPassives();
    const bare = emptySheet();
    bare.level = 20;
    bare.statMode = 'mean';

    const attrsBare = computeAttributes(bare, undefined, '');
    const attrsFeats = computeAttributes(withFeats, undefined, '');
    expect(attrsFeats.force - attrsBare.force).toBe(1);

    const statsBare = computeStats(bare, undefined, MAGE, [], attrsBare);
    const statsFeats = computeStats(withFeats, undefined, MAGE, [], attrsFeats);
    expect(statsFeats.def_phy - statsBare.def_phy).toBe(5);
    expect(statsFeats.mana - statsBare.mana).toBe(-8);
  });

  it('nomme chaque feat dans le détail de calcul', () => {
    const parts = statContributions(
      sheetWithPassives(),
      undefined,
      MAGE,
      [],
      computeAttributes(sheetWithPassives(), undefined, ''),
      'mana',
    ).parts;
    expect(parts).toContainEqual({ label: 'Feat : Peau dure', value: -3 });
    expect(parts).toContainEqual({ label: 'Feat : Muscle renforcé', value: -5 });
  });
});

describe('feats domaniaux sur la fiche', () => {
  it('lit les feats déclarés par les fiches de domaine', () => {
    expect(domainFeats('light')).toHaveLength(4);
    expect(domainFeats('emission')).toHaveLength(4);
    expect(findDomainFeat('light-focale')?.domain).toBe('light');
    expect(featDomainName('renforcement')).toBe('Renforcement');
  });

  it('résout le feat choisi avec son domaine', () => {
    const [taken] = chosenDomainFeats(sheetWithFeats());
    expect(taken.feat.name).toBe('Lumière focale');
    expect(taken.domain).toBe('light');
  });

  it("n'ouvre une branche non polarisée que si le background y donne accès", () => {
    const sheet = sheetWithFeats();
    const soldat = [{ key: 'entrainement-martial', name: 'Entraînement martial' }];
    expect(featDomainsFor(sheet, soldat)).toContain('renforcement');
    expect(featDomainsFor(sheet, [])).not.toContain('renforcement');
  });
});
