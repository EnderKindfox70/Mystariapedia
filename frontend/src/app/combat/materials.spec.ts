import { describe, expect, it } from 'vitest';
import earthDomain from '../../../public/resources/json/domains/earth.json';
import { DomainSpellEntry, MaterialFamilyKey, SpellPageData } from '../wiki.types';
import { spellAbilities } from './abilities';
import { AttributeKey, StatKey } from '../character/character.types';
import { Affinities, CombatAbility, Combatant, Encounter, Team } from './combat.types';
import {
  cannotStudy,
  MATERIAL_FAMILIES,
  MATERIALS,
  MATERIAL_REGIONS,
  MATERIAL_BY_KEY,
  materialsOfFamily,
  normalizeTraining,
  resolveShaping,
  shapingOptions,
  studySlots,
} from './materials';
import { emptyEncounter } from './encounter';
import { applyAction, applyMaterial, cannotUse, ENCHANT_SHARE, WALL_THICKNESS } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   LES MATÉRIAUX DE LA TERRE

   Un sort par FAMILLE, dont la saveur vient de ce qu'on façonne. Trois
   manières d'y arriver, du meilleur marché au plus désespéré : manipuler ce
   qui est là, conjurer ce qu'on a étudié, improviser ce qu'on a touché un jour.

   Ce qui compte ici : le même sort ne coûte pas le même prix et ne fait pas les
   mêmes dégâts selon l'endroit où on le lance. C'est tout l'intérêt.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (): Record<StatKey, number> => ({
  hp: 40, mana: 60, endurance: 20, speed: 10,
  atk_phy: 20, atk_mag: 20, def_phy: 10, def_mag: 10,
});

const ATTRS = (): Record<AttributeKey, number> => ({
  force: 10, dexterite: 10, constitution: 10, intelligence: 10, sagesse: 10, charisme: 10,
});

const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(over: Partial<Combatant> & { id: string; name: string; team: Team }): Combatant {
  const base = over.base ?? STATS();
  return {
    origin: { kind: 'custom' }, footprint: 1, pos: { x: 0, y: 0 },
    attributes: ATTRS(), proficiency: 2,
    hp: base.hp, mana: base.mana, endurance: base.endurance,
    moved: 0, actionUsed: false, bonusActionUsed: false, reactionUsed: false,
    statuses: [], effects: [], abilities: [], inventory: [],
    affinities: NO_AFFINITY(), initiative: 0, down: false,
    ...over, base,
  };
}

/** Un mur de pierre générique : 10 mana, 6–10 de dégâts, +6 de défense. */
const murDePierre = (): CombatAbility => ({
  id: 'spell:mur',
  name: 'Mur de pierre',
  kind: 'spell',
  rangeMeters: 10,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 10,
  enduranceCost: 0,
  damages: [{ min: 6, max: 10, type: 'earth' }],
  duration: 3,
  mods: [{ stat: 'def_phy', value: 6 }],
  shapesMaterial: 'stone',
});

function scene(
  geology: string[] | undefined,
  training?: Combatant['earthMaterials'],
  over: Partial<CombatAbility> = {},
): Encounter {
  const enc = emptyEncounter('Carrière');
  // Graine fixe : `emptyEncounter` en tire une au hasard, ce qui rendrait tout
  // ce qui touche au journal dépendant de la chance.
  enc.seed = 11;
  enc.rollCount = 0;
  enc.phase = 'combat';
  enc.round = 1;
  enc.geology = geology;
  enc.combatants = [
    mkUnit({
      id: 'mage', name: 'Mage', team: 'allies', pos: { x: 0, y: 0 },
      abilities: [{ ...murDePierre(), ...over }], earthMaterials: training,
    }),
    mkUnit({ id: 'foe', name: 'Bandit', team: 'ennemis', pos: { x: 3, y: 0 } }),
  ];
  return enc;
}

/* ── Le catalogue ──────────────────────────────────────────────────────────── */

describe('le catalogue des matériaux', () => {
  it('range chaque matériau dans une famille connue', () => {
    const familles = MATERIAL_FAMILIES.map((f) => f.key);
    for (const m of MATERIALS) {
      expect(familles, m.key).toContain(m.family);
    }
    // Aucune famille déclarée ne doit rester vide.
    for (const f of familles) {
      expect(materialsOfFamily(f).length, f).toBeGreaterThan(0);
    }
  });

  it('ne rend façonnables que les quatre familles minérales', () => {
    // Le bois, le cuir, la fibre et le verre nomment les objets ; aucun sort de
    // Terre ne les conjure. Le filtre par famille suffit à les tenir dehors.
    for (const f of ['wood', 'leather', 'fibre', 'glass'] as const) {
      const m = materialsOfFamily(f)[0];
      expect(resolveShaping('stone', [m.key], { studied: [m.key] }), m.key).toBeNull();
      expect(resolveShaping('metal', [m.key], { studied: [m.key] }), m.key).toBeNull();
    }
  });

  it('tient le sable HORS de la roche : il attend ses propres sorts', () => {
    // Un sédiment non consolidé ne tient aucune forme — il n'a rien à faire
    // dans un mur ni dans une lame de pierre.
    for (const m of materialsOfFamily('stone')) {
      expect(m.key.startsWith('sable'), m.key).toBe(false);
      expect(m.key).not.toBe('silice');
    }
    expect(materialsOfFamily('sand').map((m) => m.key)).toContain('sable-desertique');
  });

  it('ne référence que des matériaux existants dans les régions et les alliages', () => {
    for (const r of MATERIAL_REGIONS) {
      for (const key of r.materials) expect(MATERIAL_BY_KEY.get(key), `${r.key} → ${key}`).toBeDefined();
    }
    for (const m of MATERIALS) {
      for (const req of m.requires ?? []) expect(MATERIAL_BY_KEY.get(req)).toBeDefined();
    }
  });

  it('donne à l’obsidienne son tranchant et sa fragilité', () => {
    const obs = MATERIAL_BY_KEY.get('obsidienne')!;
    expect(obs.damageType).toBe('slashing');
    expect(obs.damageFactor).toBeGreaterThan(1.2);
    // La pire défense de la famille, comme le veut sa nature cassante.
    const pierres = materialsOfFamily('stone');
    expect(Math.min(...pierres.map((m) => m.defenseFactor))).toBe(obs.defenseFactor);
  });

  it('ne rend le bronze natif d’aucune région : un alliage ne se ramasse pas', () => {
    expect(MATERIAL_BY_KEY.get('bronze')!.native).toEqual([]);
    for (const r of MATERIAL_REGIONS) expect(r.materials).not.toContain('bronze');
  });
});

/* ── L'étude ───────────────────────────────────────────────────────────────── */

describe('étudier un matériau', () => {
  it('ouvre une place par palier de maîtrise, cinq en tout', () => {
    expect(studySlots(1)).toBe(1);
    expect(studySlots(4)).toBe(1);
    expect(studySlots(5)).toBe(2);
    expect(studySlots(17)).toBe(5);
    expect(studySlots(20)).toBe(5);
  });

  it('refuse au-delà des places ouvertes, et dit quand la suivante arrive', () => {
    expect(cannotStudy('granite', [], 1)).toBeNull();
    const refus = cannotStudy('basalte', ['granite'], 1);
    expect(refus).toContain('niveau 5');
  });

  it('exige cuivre ET étain avant le bronze', () => {
    expect(cannotStudy('bronze', ['cuivre'], 20)).toContain('Étain');
    expect(cannotStudy('bronze', ['etain'], 20)).toContain('Cuivre');
    expect(cannotStudy('bronze', ['cuivre', 'etain'], 20)).toBeNull();
  });

  it('refuse un doublon et un matériau inconnu', () => {
    expect(cannotStudy('granite', ['granite'], 20)).toContain('déjà étudié');
    expect(cannotStudy('kryptonite', [], 20)).toContain('inconnu');
  });
});

/* ── La persistance ────────────────────────────────────────────────────────
   La lecture d'une fiche est une LISTE BLANCHE : un champ qu'on oublie d'y
   déclarer est perdu au rechargement, quoi qu'on ait sauvegardé. C'est ce qui
   donnait l'impression que l'étude ne s'enregistrait pas.
─────────────────────────────────────────────────────────────────────────── */

describe('relire les matériaux d’une fiche sauvegardée', () => {
  it('rend ce qui a été enregistré', () => {
    const bloc = normalizeTraining(
      { studied: ['granite', 'fer'], known: ['marbre'], equipped: 'granite' },
      9,
    );
    expect(bloc).toEqual({ studied: ['granite', 'fer'], known: ['marbre'], equipped: 'granite' });
  });

  it('jette ce que le catalogue ne connaît plus', () => {
    const bloc = normalizeTraining({ studied: ['granite', 'mithril'], known: ['adamantium'] }, 9)!;
    expect(bloc.studied).toEqual(['granite']);
    expect(bloc.known).toEqual([]);
  });

  it('borne l’étude aux places que le niveau ouvre', () => {
    // Cinq matériaux enregistrés, mais un personnage de niveau 1 n'a qu'une place.
    const bloc = normalizeTraining(
      { studied: ['granite', 'fer', 'basalte', 'marbre', 'quartz'] },
      1,
    )!;
    expect(bloc.studied).toHaveLength(1);
  });

  it('lâche un matériau porté en tête qui n’est plus étudié', () => {
    // Une fiche redescendue de niveau garderait sinon un équipement fantôme.
    const bloc = normalizeTraining({ studied: ['granite'], equipped: 'diamant' }, 20)!;
    expect(bloc.equipped).toBeUndefined();
  });

  it('ne compte pas deux fois le même matériau', () => {
    const bloc = normalizeTraining({ studied: ['granite', 'granite'] }, 20)!;
    expect(bloc.studied).toEqual(['granite']);
  });

  it('ne range rien pour une fiche qui n’a jamais touché au domaine', () => {
    expect(normalizeTraining(undefined, 20)).toBeUndefined();
    expect(normalizeTraining({ studied: [], known: [] }, 20)).toBeUndefined();
  });

  it('survit à une entrée corrompue sans exploser', () => {
    expect(normalizeTraining({ studied: 'granite', known: 42 }, 20)).toBeUndefined();
    expect(normalizeTraining('n’importe quoi', 20)).toBeUndefined();
  });
});

/* ── Les trois paliers ─────────────────────────────────────────────────────── */

describe('le palier employé', () => {
  it('manipule ce qui est sous les pieds, sans rien avoir appris', () => {
    const forme = resolveShaping('stone', ['granite'], { studied: [] })!;
    expect(forme.tier).toBe('manipulation');
    expect(forme.stable).toBe(true);
    // Rien à créer : moins cher que de le conjurer.
    expect(forme.manaFactor).toBeLessThan(MATERIAL_BY_KEY.get('granite')!.manaFactor);
  });

  it('conjure un matériau étudié là où le sol n’offre rien', () => {
    const forme = resolveShaping('stone', [], { studied: ['granite'], equipped: 'granite' })!;
    expect(forme.tier).toBe('ex-nihilo');
    // Universel, mais il se décompose.
    expect(forme.stable).toBe(false);
    expect(forme.effectFactor).toBe(1);
  });

  it('improvise ce qu’on a touché sans l’étudier — cher, fragile, à moitié', () => {
    const forme = resolveShaping('stone', [], { studied: [], known: ['marbre'], equipped: 'marbre' })!;
    expect(forme.tier).toBe('improvisation');
    expect(forme.effectFactor).toBe(0.5);
    expect(forme.precisionPenalty).toBe(10); // deux crans
    expect(forme.manaFactor).toBeGreaterThan(MATERIAL_BY_KEY.get('marbre')!.manaFactor);
  });

  it('ne rend rien quand la matière n’est ni là, ni étudiée, ni connue', () => {
    expect(resolveShaping('stone', [], { studied: [], equipped: 'granite' })).toBeNull();
    expect(resolveShaping('stone', [], undefined)).toBeNull();
  });

  it('le sol l’emporte sur ce qu’on porte en tête', () => {
    // Équipé granite, mais on se tient sur du basalte : c'est le basalte qui sort.
    const forme = resolveShaping('stone', ['basalte'], { studied: ['granite'], equipped: 'granite' })!;
    expect(forme.material.key).toBe('basalte');
    expect(forme.tier).toBe('manipulation');
  });

  it('laisse forcer son matériau, contre du mana', () => {
    const forme = resolveShaping('stone', ['basalte'], { studied: ['granite'], equipped: 'granite' }, 'granite')!;
    expect(forme.material.key).toBe('granite');
    expect(forme.tier).toBe('ex-nihilo');
  });

  it('ne confond pas les familles : un sort de métal ignore la pierre au sol', () => {
    expect(resolveShaping('metal', ['granite'], { studied: [] })).toBeNull();
    expect(resolveShaping('metal', ['granite', 'fer'], { studied: [] })!.material.key).toBe('fer');
  });

  it('laisse façonner N’IMPORTE quelle matière du sol, pas seulement la première', () => {
    // Le défaut : seule la première matière du terrain était manipulable. Sur un
    // sol de granite ET de basalte, choisir le basalte retombait en « rien à
    // appeler » — donc le joueur n'avait jamais de choix réel.
    const sol = ['granite', 'basalte'];
    const granite = resolveShaping('stone', sol, { studied: [] }, 'granite')!;
    const basalte = resolveShaping('stone', sol, { studied: [] }, 'basalte')!;
    expect(granite.material.key).toBe('granite');
    expect(basalte.material.key).toBe('basalte');
    // Les deux sont sous les pieds : les deux se façonnent, et gratuitement.
    expect(granite.tier).toBe('manipulation');
    expect(basalte.tier).toBe('manipulation');
  });

  it('propose toutes les matières du sol au choix', () => {
    const options = shapingOptions('stone', ['granite', 'basalte', 'obsidienne'], undefined);
    expect(options.map((o) => o.material.key).sort()).toEqual(['basalte', 'granite', 'obsidienne']);
    expect(options.every((o) => o.tier === 'manipulation')).toBe(true);
  });

  it('offre au choix tout ce qui est employable ici, du moins cher au plus cher', () => {
    const options = shapingOptions('stone', ['gres'], { studied: ['granite'], known: ['marbre'] });
    expect(options.map((o) => o.material.key)).toContain('gres');
    expect(options.map((o) => o.material.key)).toContain('granite');
    const couts = options.map((o) => o.manaFactor);
    expect([...couts].sort((a, b) => a - b)).toEqual(couts);
  });
});

/* ── Ce que ça change en jeu ───────────────────────────────────────────────── */

describe('le même sort ne vaut pas la même chose selon l’endroit', () => {
  const lance = (enc: Encounter, item?: string): Encounter =>
    applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'spell:mur', at: { x: 3, y: 0 }, item });

  it('coûte moins cher sur du grès que conjuré loin de tout', () => {
    const surGres = lance(scene(['gres']));
    const conjure = lance(scene([], { studied: ['granite'], equipped: 'granite' }));
    const depense = (e: Encounter) => 60 - e.combatants[0].mana;
    expect(depense(surGres)).toBeLessThan(depense(conjure));
  });

  it('nomme la matière employée dans le journal', () => {
    const enc = lance(scene(['obsidienne']));
    const journal = enc.log.map((l) => l.text).join('\n');
    expect(journal).toContain('Obsidienne');
    expect(journal).toContain('façonné sur place');
  });

  it('laisse l’obsidienne imposer son tranchant', () => {
    // `autoHit` écarte le jet de toucher : ce qu'on vérifie est le TYPE des
    // dégâts, et un coup manqué n'en dirait rien.
    const enc = lance(scene(['obsidienne'], undefined, { autoHit: true }));
    const journal = enc.log.map((l) => [l.text, ...(l.details ?? [])].join(' ')).join('\n').toLowerCase();
    expect(journal).toContain('tranchant');
  });

  it('refuse le sort quand il n’y a rien à façonner, sans rien dépenser', () => {
    const enc = scene([], { studied: [] });
    const avant = enc.combatants[0].mana;
    const apres = lance(enc);
    expect(apres.combatants[0].mana).toBe(avant);
    expect(apres.combatants[0].actionUsed).toBe(false);
  });

  it('grise le sort dans la vue quand aucun matériau n’est disponible', () => {
    const enc = scene([], { studied: [] });
    const refus = cannotUse(enc, enc.combatants[0], enc.combatants[0].abilities[0], { x: 3, y: 0 });
    expect(refus).toContain('Aucun matériau disponible');
  });

  it('ne fait PAS payer le choix d’une matière que le sol porte aussi', () => {
    // Préférer le basalte au granite quand les deux affleurent n'est pas un
    // forçage : c'est un choix, et il ne doit rien coûter de plus.
    const impose = lance(scene(['granite', 'basalte'], undefined), 'basalte');
    const defaut = lance(scene(['granite', 'basalte'], undefined));
    const depense = (e: Encounter) => 60 - e.combatants[0].mana;
    expect(depense(impose)).toBeLessThanOrEqual(depense(defaut) + 1);
  });

  it('fait payer le fait de forcer sa matière contre le terrain', () => {
    const impose = lance(scene(['gres'], { studied: ['granite'], equipped: 'granite' }), 'granite');
    const suitLeSol = lance(scene(['gres'], { studied: ['granite'], equipped: 'granite' }));
    const depense = (e: Encounter) => 60 - e.combatants[0].mana;
    expect(depense(impose)).toBeGreaterThan(depense(suitLeSol));
  });
});

/* ── Le comparatif de la fiche ─────────────────────────────────────────────
   La fiche d'un sort qui façonne doit montrer ce que chaque matière donne,
   sinon elle ne dit rien de ce que le sort vaut : ses chiffres ne sont pas
   écrits sur le palier.
─────────────────────────────────────────────────────────────────────────── */

describe('le comparatif des matières', () => {
  /** Le même calcul que la fiche, sur un palier réel du catalogue. */
  function lignes(mana: number, defBase: number) {
    return materialsOfFamily('stone').map((m) => ({
      key: m.key,
      manaLocal: Math.round(mana * m.manaFactor * 0.6),
      manaStudied: Math.round(mana * m.manaFactor),
      manaImprovised: Math.round(mana * m.manaFactor * 1.5),
      defense: Math.max(1, Math.round(defBase * m.defenseFactor)),
    }));
  }

  it('classe toujours les trois coûts dans le même ordre', () => {
    for (const l of lignes(7, 18)) {
      expect(l.manaLocal, l.key).toBeLessThanOrEqual(l.manaStudied);
      expect(l.manaStudied, l.key).toBeLessThanOrEqual(l.manaImprovised);
    }
  });

  it('sépare vraiment les matières sur une valeur qui a de l’ampleur', () => {
    // Armure de pierre au dernier palier : défense de base 18. On compare à
    // l'intérieur de la FAMILLE — le diamant est un cristal, il n'a rien à
    // faire dans un sort de pierre.
    const parCle = new Map(lignes(7, 18).map((l) => [l.key, l.defense]));
    expect(parCle.get('basalte')).toBeGreaterThan(parCle.get('granite')!);
    expect(parCle.get('granite')).toBeGreaterThan(parCle.get('obsidienne')!);
    // L'écart doit être lisible, pas cosmétique.
    expect(parCle.get('basalte')! - parCle.get('obsidienne')!).toBeGreaterThanOrEqual(10);
  });

  it('garde le facteur brut disponible : l’arrondi écrase les petits chiffres', () => {
    // Sur une défense de base 2, granite et andésite tombent tous deux sur +2.
    const petit = new Map(lignes(4, 2).map((l) => [l.key, l.defense]));
    expect(petit.get('granite')).toBe(petit.get('andesite'));
    // …mais leurs facteurs, eux, diffèrent — c'est ce que la fiche affiche.
    expect(MATERIAL_BY_KEY.get('granite')!.defenseFactor).not.toBe(
      MATERIAL_BY_KEY.get('andesite')!.defenseFactor,
    );
  });
});

/* ── Tous les chemins de construction ──────────────────────────────────────
   `spellAbility` a DEUX `return` : un pour les revêtements (poings, arme) et un
   pour tout le reste. Ce qu'on ajoute à l'un doit l'être à l'autre — les poings
   de pierre avaient perdu leur matière exactement pour cette raison.
─────────────────────────────────────────────────────────────────────────── */

describe('la matière survit à tous les chemins de construction', () => {
  const spells = earthDomain.spells as DomainSpellEntry[];

  const capacites = (key: string) => {
    const spell = spells.find((s) => s.key === key)!;
    const page = { spell, domains: ['earth'] } as SpellPageData;
    return spellAbilities(page, (spell.progression?.nodes ?? []).map((n) => n.id), undefined);
  };

  it('porte shapesMaterial sur CHAQUE sort de Terre qui façonne', () => {
    for (const spell of spells) {
      if (!spell.shapesMaterial) continue;
      for (const a of capacites(spell.key)) {
        expect(a.shapesMaterial, `${spell.key} / ${a.id}`).toBe(spell.shapesMaterial);
      }
    }
  });

  it('n’oublie ni les revêtements de poings ni ceux d’arme', () => {
    // Ce sont eux qui passaient par la branche oubliée.
    for (const key of ['earth-revetement-poings', 'earth-revetement-arme']) {
      const abs = capacites(key);
      expect(abs.length).toBeGreaterThan(0);
      expect(abs.every((a) => a.shapesMaterial === 'stone'), key).toBe(true);
      // …et ils restent bien des enchantements.
      expect(abs.every((a) => !!a.enchant), key).toBe(true);
    }
  });

  it('applique la matière aux dégâts de l’ENCHANTEMENT, pas seulement aux dégâts directs', () => {
    const poings = capacites('earth-revetement-poings').at(-1)!;
    const base = poings.enchant!.damage;
    const enc = emptyEncounter('Essai');
    enc.geology = ['obsidienne'];
    enc.combatants = [
      mkUnit({ id: 'mage', name: 'Mage', team: 'allies', abilities: [poings] }),
    ];
    const apres = applyAction(enc, {
      type: 'use', actorId: 'mage', abilityId: poings.id, at: { x: 0, y: 0 },
    });
    const actif = apres.combatants[0].effects.find((e) => e.enchant)?.enchant;
    expect(actif).toBeDefined();
    // L'obsidienne taille (×1,35) au lieu d'écraser.
    expect(actif!.damage.type).toBe('slashing');
    expect(actif!.damage.max).toBeGreaterThan(base.max);
  });
});

/* ── L'aperçu du sélecteur ─────────────────────────────────────────────────
   Le panneau de choix montre ce que le sort DEVIENDRA avec chaque matière. Il
   passe par `applyMaterial`, la fonction que le moteur emploie lui-même : une
   seconde formule d'affichage aurait fini par diverger.
─────────────────────────────────────────────────────────────────────────── */

describe('l’aperçu par matière', () => {
  const armure = (): CombatAbility => ({
    id: 'spell:armure',
    name: 'Armure de pierre',
    kind: 'spell',
    rangeMeters: 0,
    shape: { kind: 'self' },
    targets: ['self'],
    manaCost: 7,
    enduranceCost: 0,
    damages: [],
    duration: 3,
    mods: [{ stat: 'def_phy', value: 18 }],
    shapesMaterial: 'stone',
    autoHit: true,
  });

  it('sépare vraiment les matières sur la défense accordée', () => {
    const sol = ['gres', 'granite', 'basalte', 'obsidienne'];
    const parCle = new Map(
      shapingOptions('stone', sol, undefined).map((o) => [
        o.material.key,
        applyMaterial(armure(), o, 0).mods![0].value,
      ]),
    );
    expect(parCle.get('basalte')).toBeGreaterThan(parCle.get('granite')!);
    expect(parCle.get('granite')).toBeGreaterThan(parCle.get('gres')!);
    expect(parCle.get('gres')).toBeGreaterThan(parCle.get('obsidienne')!);
    // Et l'écart se voit : c'est tout l'objet du passage en valeurs absolues.
    expect(parCle.get('basalte')! - parCle.get('obsidienne')!).toBeGreaterThanOrEqual(5);
  });

  it('fait DICTER les dégâts par la matière, au lieu de moduler ceux du palier', () => {
    // Deux pierres, deux armes différentes — pas le même chiffre à 10 % près.
    const sol = ['granite', 'obsidienne'];
    const options = shapingOptions('stone', sol, undefined);
    const lame: CombatAbility = {
      ...armure(), mods: undefined,
      damages: [{ min: 1, max: 2, type: 'earth' }],
    };
    const parCle = new Map(
      options.map((o) => [o.material.key, applyMaterial(lame, o, 0).damages[0]]),
    );
    // Le type vient de la matière, pas du sort : l'obsidienne tranche.
    expect(parCle.get('obsidienne')!.type).toBe('slashing');
    expect(parCle.get('granite')!.type).toBe('bludgeoning');
    // …et les montants n'ont plus rien à voir avec le 1–2 écrit sur le palier.
    expect(parCle.get('obsidienne')!.max).toBeGreaterThan(parCle.get('granite')!.max);
    expect(parCle.get('granite')!.min).toBeGreaterThan(2);
  });

  it('montre EXACTEMENT ce que le moteur appliquera', () => {
    // L'aperçu et la résolution doivent tomber sur le même mana : c'est tout
    // l'intérêt de partager `applyMaterial`.
    const enc = emptyEncounter('Carrière');
    enc.seed = 3;
    enc.rollCount = 0;
    enc.phase = 'combat';
    enc.round = 1;
    enc.geology = ['granite', 'basalte'];
    enc.combatants = [
      mkUnit({ id: 'mage', name: 'Mage', team: 'allies', abilities: [armure()] }),
    ];

    const option = shapingOptions('stone', enc.geology, undefined).find(
      (o) => o.material.key === 'basalte',
    )!;
    const apercu = applyMaterial(armure(), option, 0);

    const apres = applyAction(enc, {
      type: 'use', actorId: 'mage', abilityId: 'spell:armure', at: { x: 0, y: 0 }, item: 'basalte',
    });
    const depense = 60 - apres.combatants[0].mana;
    expect(depense).toBe(apercu.manaCost);
    // …et la défense réellement posée est celle annoncée.
    const pose = apres.combatants[0].effects.find((e) => e.mods.length)?.mods[0].value;
    expect(pose).toBe(apercu.mods![0].value);
  });

  it('répercute la matière sur la solidité d’un mur annoncé', () => {
    const mur: CombatAbility = { ...armure(), mods: undefined, raisesWall: { length: 3, hp: 30 } };
    const sol = ['gres', 'basalte'];
    const parCle = new Map(
      shapingOptions('stone', sol, undefined).map((o) => [
        o.material.key,
        applyMaterial(mur, o, 0).raisesWall!.hp,
      ]),
    );
    expect(parCle.get('basalte')).toBeGreaterThan(parCle.get('gres')!);
  });
});

/* ── La fiche de sort et le moteur doivent s'accorder ──────────────────────
   La page wiki recalcule le tableau de son côté (elle n'a pas de rencontre).
   Elle doit tomber sur les mêmes chiffres que la résolution, sinon elle promet
   ce que le combat ne donne pas.
─────────────────────────────────────────────────────────────────────────── */

describe('la fiche annonce ce que le moteur applique', () => {
  const spells = earthDomain.spells as DomainSpellEntry[];

  /** Le calcul de la fiche, reproduit tel quel. */
  const fiche = (scale: number, base: number) => Math.max(1, Math.round(base * scale));

  it('accorde la défense annoncée pour l’armure de pierre', () => {
    const spell = spells.find((s) => s.key === 'earth-revetement-armure')!;
    const node = spell.progression!.nodes.at(-1)!;
    const page = { spell, domains: ['earth'] } as SpellPageData;
    const ability = spellAbilities(page, [node.id], undefined)[0];

    for (const m of materialsOfFamily('stone')) {
      const forme = resolveShaping('stone', [m.key], undefined)!;
      const moteur = applyMaterial(ability, forme, 0).mods![0].value;
      expect(moteur, m.key).toBe(fiche(node.stats.materialScale ?? 1, m.defense));
    }
  });

  it('accorde la solidité annoncée pour le mur', () => {
    const spell = spells.find((s) => s.key === 'earth-mur-de-pierre')!;
    const node = spell.progression!.nodes.at(-1)!;
    const page = { spell, domains: ['earth'] } as SpellPageData;
    const ability = spellAbilities(page, [node.id], undefined)[0];

    for (const m of materialsOfFamily('stone')) {
      const forme = resolveShaping('stone', [m.key], undefined)!;
      const moteur = applyMaterial(ability, forme, 0).raisesWall!.hp;
      expect(moteur, m.key).toBe(
        fiche(node.stats.materialScale ?? 1, m.defense * WALL_THICKNESS),
      );
    }
  });

  it('n’annonce qu’une PART de la matière pour un revêtement', () => {
    const spell = spells.find((s) => s.key === 'earth-revetement-poings')!;
    const node = spell.progression!.nodes.at(-1)!;
    const page = { spell, domains: ['earth'] } as SpellPageData;
    const ability = spellAbilities(page, [node.id], undefined)[0];
    const granite = MATERIAL_BY_KEY.get('granite')!;

    const forme = resolveShaping('stone', ['granite'], undefined)!;
    const moteur = applyMaterial(ability, forme, 0).enchant!.damage;
    // Un poing nimbé ajoute à chaque coup : il ne vaut pas une frappe entière.
    expect(moteur.max).toBeLessThan(granite.damage.max);
    expect(moteur.max).toBe(
      Math.max(2, Math.round(granite.damage.max * (node.stats.materialScale ?? 1) * ENCHANT_SHARE)),
    );
  });
});

/* ── Ce que la fiche AFFICHE ───────────────────────────────────────────────
   La description du sort lisait les chiffres bruts du palier — « Inflige 1–2
   Terre » — qui ne veulent plus rien dire. Elle doit suivre la matière choisie.
─────────────────────────────────────────────────────────────────────────── */

describe('la description suit la matière choisie', () => {
  const spells = earthDomain.spells as DomainSpellEntry[];

  /** Le calcul de la fiche pour une matière donnée, reproduit tel quel. */
  function affiche(key: string, nodeIndex: number, materialKey: string, nimbe: boolean) {
    const spell = spells.find((s) => s.key === key)!;
    const node = spell.progression!.nodes[nodeIndex];
    const m = MATERIAL_BY_KEY.get(materialKey)!;
    const echelle = (node.stats.materialScale ?? 1) * (nimbe ? ENCHANT_SHARE : 1);
    return {
      min: Math.max(1, Math.round(m.damage.min * echelle)),
      max: Math.max(1, Math.round(m.damage.max * echelle)),
      type: m.damageType,
    };
  }

  it('n’annonce plus le 1–2 « Terre » du palier, quelle que soit la pierre', () => {
    const granite = affiche('earth-revetement-poings', 2, 'granite', true);
    const obsidienne = affiche('earth-revetement-poings', 2, 'obsidienne', true);

    // Le vieux texte disait 1–2 Terre pour tout le monde.
    expect(granite.min).toBeGreaterThan(2);
    expect(granite.type).toBe('bludgeoning');
    expect(obsidienne.type).toBe('slashing');
    expect(obsidienne.max).toBeGreaterThan(granite.max);
  });

  it('change de chiffres à chaque matière, pas seulement de nom', () => {
    const vus = new Set(
      materialsOfFamily('stone').map((m) => {
        const v = affiche('earth-revetement-poings', 2, m.key, true);
        return `${v.min}-${v.max}-${v.type}`;
      }),
    );
    // Huit pierres ne doivent pas donner une seule et même ligne.
    expect(vus.size).toBeGreaterThan(3);
  });

  it('reste d’accord avec le moteur sur la matière affichée', () => {
    const spell = spells.find((s) => s.key === 'earth-revetement-poings')!;
    const node = spell.progression!.nodes.at(-1)!;
    const page = { spell, domains: ['earth'] } as SpellPageData;
    const ability = spellAbilities(page, [node.id], undefined)[0];

    for (const m of materialsOfFamily('stone')) {
      const forme = resolveShaping('stone', [m.key], undefined)!;
      const moteur = applyMaterial(ability, forme, 0).enchant!.damage;
      const fiche = affiche('earth-revetement-poings', 2, m.key, true);
      expect(moteur.type, m.key).toBe(fiche.type);
      expect(moteur.min, m.key).toBe(fiche.min);
    }
  });
});

/* ── Le poids d'une armure ─────────────────────────────────────────────────
   La défense n'est que la moitié du choix : ce que la matière coûte en vitesse
   est l'autre. Sans ce contrepoids, on prendrait toujours la plus dure.
─────────────────────────────────────────────────────────────────────────── */

describe('le malus de vitesse d’une armure', () => {
  const armure = () => {
    const spell = (earthDomain.spells as DomainSpellEntry[]).find(
      (s) => s.key === 'earth-revetement-armure',
    )!;
    const node = spell.progression!.nodes.at(-1)!;
    const page = { spell, domains: ['earth'] } as SpellPageData;
    return spellAbilities(page, [node.id], undefined)[0];
  };

  const porte = (materialKey: string) => {
    const forme = resolveShaping('stone', [materialKey], undefined)!;
    const a = applyMaterial(armure(), forme, 0);
    return {
      defense: a.mods!.find((m) => m.stat === 'def_phy')!.value,
      lenteur: a.recoil!.mods!.find((m) => m.stat === 'speed')!.value,
    };
  };

  it('alourdit à proportion de la densité de la matière', () => {
    // Le basalte est dense, l'ardoise se clive en plaques minces.
    expect(porte('basalte').lenteur).toBeGreaterThan(porte('ardoise').lenteur);
    expect(porte('granite').lenteur).toBeGreaterThanOrEqual(porte('marbre').lenteur);
  });

  it('crée un vrai arbitrage : la plus dure n’est pas gratuite', () => {
    const basalte = porte('basalte');
    const ardoise = porte('ardoise');
    // Le basalte protège mieux, mais il coûte en vitesse.
    expect(basalte.defense).toBeGreaterThan(ardoise.defense);
    expect(basalte.lenteur).toBeGreaterThan(ardoise.lenteur);
  });

  it('fait de l’or une mauvaise armure, densément', () => {
    // L'or est le plus lourd des métaux courants et protège mal : c'est un
    // mauvais choix ASSUMÉ, pas un oubli.
    const or = MATERIAL_BY_KEY.get('or')!;
    const fer = MATERIAL_BY_KEY.get('fer')!;
    expect(or.speedPenalty).toBeGreaterThan(fer.speedPenalty);
    expect(or.defense).toBeLessThan(fer.defense);
  });

  it('ne touche pas au contre-coup d’un sort qui n’alourdit pas', () => {
    const mur = (earthDomain.spells as DomainSpellEntry[]).find(
      (s) => s.key === 'earth-mur-de-pierre',
    )!;
    const node = mur.progression!.nodes.at(-1)!;
    const page = { spell: mur, domains: ['earth'] } as SpellPageData;
    const a = spellAbilities(page, [node.id], undefined)[0];
    const forme = resolveShaping('stone', ['basalte'], undefined)!;
    expect(applyMaterial(a, forme, 0).recoil).toBeUndefined();
  });

  it('donne une valeur à CHAQUE matière du catalogue', () => {
    for (const m of MATERIALS) {
      expect(typeof m.speedPenalty, m.key).toBe('number');
      expect(m.speedPenalty, m.key).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ── Deux défenses, pas une ────────────────────────────────────────────────
   La dureté arrête les coups ; la résonance arrête les sorts. Les confondre
   prêtait silencieusement à une paroi de grès autant de protection magique que
   physique — ce qu'aucune pierre ne fait.
─────────────────────────────────────────────────────────────────────────── */

describe('la défense magique', () => {
  const armure = (key: string) => {
    const spell = (earthDomain.spells as DomainSpellEntry[]).find((s) => s.key === key)!;
    const node = spell.progression!.nodes.at(-1)!;
    const page = { spell, domains: ['earth'] } as SpellPageData;
    return spellAbilities(page, [node.id], undefined)[0];
  };

  const porte = (spellKey: string, family: MaterialFamilyKey, materialKey: string) => {
    const a = applyMaterial(armure(spellKey), resolveShaping(family, [materialKey], undefined)!, 0);
    return {
      phy: a.mods!.find((m) => m.stat === 'def_phy')?.value ?? 0,
      mag: a.mods!.find((m) => m.stat === 'def_mag')?.value,
    };
  };

  it('n’en accorde AUCUNE quand la matière n’en a pas', () => {
    // Le sort de métal accorde def_mag ; taillé dans une pierre, il ne doit
    // rien accorder du tout — pas la valeur de sa dureté.
    for (const m of materialsOfFamily('stone')) {
      expect(m.magicDefense, m.key).toBeUndefined();
    }
    const pierre = porte('earth-revetement-metal', 'stone', 'granite');
    expect(pierre.mag).toBeUndefined();
    expect(pierre.phy).toBeGreaterThan(0);
  });

  it('ne confond plus les deux : le métal protège moins de la magie que des coups', () => {
    const fer = porte('earth-revetement-metal', 'metal', 'fer');
    expect(fer.mag).toBeGreaterThan(0);
    expect(fer.mag!).toBeLessThan(fer.phy);
  });

  it('donne aux cristaux leur identité : ils résonnent', () => {
    const diamant = MATERIAL_BY_KEY.get('diamant')!;
    const fer = MATERIAL_BY_KEY.get('fer')!;
    expect(diamant.magicDefense!).toBeGreaterThan(fer.magicDefense!);
    for (const m of materialsOfFamily('crystal')) {
      expect(m.magicDefense, m.key).toBeGreaterThan(0);
    }
  });

  it('donne enfin une raison de choisir l’or : il oppose la magie', () => {
    // Or : mauvaise armure physique, la plus lourde — mais la meilleure des
    // métaux contre les sorts. Un choix de niche, pas un piège.
    const or = MATERIAL_BY_KEY.get('or')!;
    for (const m of materialsOfFamily('metal')) {
      if (m.key === 'or') continue;
      expect(or.magicDefense!, m.key).toBeGreaterThanOrEqual(m.magicDefense ?? 0);
    }
    expect(or.defense).toBeLessThan(MATERIAL_BY_KEY.get('fer')!.defense);
  });

  it('laisse la défense physique intacte dans tous les cas', () => {
    for (const m of materialsOfFamily('metal')) {
      const v = porte('earth-revetement-metal', 'metal', m.key);
      expect(v.phy, m.key).toBeGreaterThan(0);
    }
  });
});

/* ── Les trois métaux ajoutés ──────────────────────────────────────────────
   Argent, acier, tungstène — chacun avec un profil que sa physique réelle
   justifie, et aucun qui domine les autres sur tous les tableaux.
─────────────────────────────────────────────────────────────────────────── */

describe('argent, acier, tungstène', () => {
  const m = (key: string) => MATERIAL_BY_KEY.get(key)!;

  it('existent, dans la famille du métal', () => {
    for (const key of ['argent', 'acier', 'tungstene']) {
      expect(MATERIAL_BY_KEY.get(key), key).toBeDefined();
      expect(m(key).family, key).toBe('metal');
    }
  });

  it('fait de l’acier un alliage : le fer d’abord', () => {
    // Le carbone vient de la forge, pas du sol : le fer suffit.
    expect(m('acier').requires).toEqual(['fer']);
    expect(m('acier').native).toEqual([]);
    expect(cannotStudy('acier', [], 20)).toContain('Fer');
    expect(cannotStudy('acier', ['fer'], 20)).toBeNull();
  });

  it('donne au tungstène la meilleure dureté et le pire poids', () => {
    const metaux = materialsOfFamily('metal');
    expect(Math.max(...metaux.map((x) => x.defense))).toBe(m('tungstene').defense);
    expect(Math.max(...metaux.map((x) => x.speedPenalty))).toBe(m('tungstene').speedPenalty);
    // Réfractaire : rien ne le fait fondre.
    expect(m('tungstene').resistances).toContain('fire');
    // …mais il ne résonne à rien.
    expect(m('tungstene').magicDefense!).toBeLessThan(m('fer').magicDefense!);
  });

  it('donne à l’argent sa vieille réputation, et sa faille', () => {
    // Le meilleur réflecteur qui soit : la lumière glisse dessus. C'est le
    // miroir de l'or, qui lui oppose les ténèbres.
    expect(m('argent').resistances).toEqual(expect.arrayContaining(['light', 'death']));
    expect(m('or').resistances).toContain('dark');
    // Meilleur conducteur du catalogue : la foudre y entre comme chez elle.
    expect(m('argent').weaknesses).toContain('lightning');
    expect(m('argent').magicDefense!).toBeGreaterThan(m('fer').magicDefense!);
  });

  it('fait de l’acier le meilleur compromis, sans le rendre dominant', () => {
    // Il bat le fer partout côté matière…
    expect(m('acier').defense).toBeGreaterThan(m('fer').defense);
    expect(m('acier').damage.max).toBeGreaterThan(m('fer').damage.max);
    // …mais ne surpasse ni le tungstène en dureté, ni l'or en résonance.
    expect(m('acier').defense).toBeLessThan(m('tungstene').defense);
    expect(m('acier').magicDefense!).toBeLessThan(m('or').magicDefense!);
  });

  it('laisse l’or seul maître de la résonance', () => {
    for (const x of MATERIALS) {
      if (x.key === 'or') continue;
      expect(x.magicDefense ?? 0, x.key).toBeLessThanOrEqual(m('or').magicDefense!);
    }
    // Et il le paie : mauvaise dureté, poids écrasant.
    expect(m('or').defense).toBeLessThan(m('fer').defense);
    expect(m('or').speedPenalty).toBeGreaterThan(m('fer').speedPenalty);
  });

  it('n’a aucun métal qui domine tous les autres partout', () => {
    // Le COÛT est un axe comme un autre : le cuivre est médiocre partout mais
    // le moins cher à façonner, et c'est ce qui lui garde une raison d'être.
    // L'oublier faisait passer un choix légitime pour un choix mort.
    const metaux = materialsOfFamily('metal');
    for (const a of metaux) {
      const ecrase = metaux.some(
        (b) =>
          b.key !== a.key &&
          b.defense >= a.defense &&
          (b.magicDefense ?? 0) >= (a.magicDefense ?? 0) &&
          b.damage.max >= a.damage.max &&
          b.speedPenalty <= a.speedPenalty &&
          b.manaFactor <= a.manaFactor &&
          // Ce qu'une matière ENCAISSE est un axe de choix comme un autre :
          // l'or et l'argent ont les mêmes chiffres et ne s'opposent pas aux
          // mêmes choses — l'un aux ténèbres, l'autre à la lumière.
          (a.resistances ?? []).every((r) => (b.resistances ?? []).includes(r)),
      );
      expect(ecrase, `${a.name} est dominé sur tous les tableaux`).toBe(false);
    }
  });
});

/* ── Les fiches de sorts ───────────────────────────────────────────────────── */

describe('les sorts de Terre du catalogue', () => {
  const spells = earthDomain.spells as { key: string; shapesMaterial?: string }[];

  it('marque ce qui façonne, et laisse le reste tranquille', () => {
    const parCle = new Map(spells.map((s) => [s.key, s.shapesMaterial]));
    expect(parCle.get('earth-mur-de-pierre')).toBe('stone');
    expect(parCle.get('earth-revetement-armure')).toBe('stone');
    expect(parCle.get('earth-faconnage-du-metal')).toBe('metal');
    expect(parCle.get('earth-revetement-metal')).toBe('metal');
    // Une secousse ne produit aucune matière ; un écho non plus.
    expect(parCle.get('earth-tremblement')).toBeUndefined();
    expect(parCle.get('earth-echo-de-la-pierre')).toBeUndefined();
  });

  it('ne nomme que des familles du catalogue', () => {
    for (const s of spells) {
      if (s.shapesMaterial) expect(['stone', 'metal', 'crystal']).toContain(s.shapesMaterial);
    }
  });
});
