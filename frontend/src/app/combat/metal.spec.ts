import { describe, expect, it } from 'vitest';
import { AttributeKey, StatKey } from '../character/character.types';
import {
  Affinities,
  CombatAbility,
  Combatant,
  Encounter,
  Team,
} from './combat.types';
import { emptyEncounter } from './encounter';
import meleeIndex from '../../../public/resources/json/weapons/melee/index.json';
import rangedIndex from '../../../public/resources/json/weapons/ranged/index.json';
import equipmentIndex from '../../../public/resources/json/equipment/index.json';
import { readFileSync } from 'node:fs';
import { compositionLabel, MATERIALS, isFerromagnetic } from './materials';
import { bearsMetal, heftDamage, metalCarriedBy, pickMetal } from './metal';
import { anchorBlocker, applyAction, applyStatus, carriedQty } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   LE MAGNÉTISME

   Trois sorts partagent une même prise sur le fer, et chacun est vérifié ici
   sur ce qu'il CHANGE réellement dans la rencontre — un sac qui se vide, une
   main qu'on désarme, un pas qu'on ne peut pas faire. Rien n'est testé sur la
   description : c'est justement ce qui manquait à ces sorts avant.

   Pas de `TestBed` : ces règles ne dépendent d'aucun service Angular, et les
   combattants se montent à la main.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (over: Partial<Record<StatKey, number>> = {}): Record<StatKey, number> => ({
  hp: 40,
  mana: 30,
  endurance: 20,
  speed: 10,
  atk_phy: 20,
  atk_mag: 20,
  def_phy: 10,
  def_mag: 10,
  ...over,
});

const ATTRS = (over: Partial<Record<AttributeKey, number>> = {}): Record<AttributeKey, number> => ({
  force: 10,
  dexterite: 10,
  constitution: 10,
  intelligence: 10,
  sagesse: 10,
  charisme: 10,
  ...over,
});

const NO_AFFINITY = (): Affinities => ({
  immunities: [],
  resistances: [],
  weaknesses: [],
  absorptions: [],
});

function mkUnit(over: Partial<Combatant> & { id: string; name: string; team: Team }): Combatant {
  const base = over.base ?? STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1,
    pos: { x: 0, y: 0 },
    attributes: ATTRS(),
    proficiency: 2,
    hp: base.hp,
    mana: base.mana,
    endurance: base.endurance,
    moved: 0,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    statuses: [],
    effects: [],
    abilities: [],
    inventory: [],
    affinities: NO_AFFINITY(),
    initiative: 0,
    down: false,
    ...over,
    base,
  };
}

/** Une épée d'acier au poing, telle que la fabrique la produit. */
const sword = (): CombatAbility => ({
  id: 'weapon:weapon',
  name: 'Épée longue',
  kind: 'weapon',
  rangeMeters: 1.5,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 0,
  enduranceCost: 1,
  damages: [{ min: 4, max: 9, type: 'slashing' }],
  metallic: true,
});

/** Un arc : du bois et de la corde, rien à quoi s'accrocher. */
const bow = (): CombatAbility => ({
  id: 'weapon:offhand',
  name: 'Arc court',
  kind: 'weapon',
  rangeMeters: 24,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 0,
  enduranceCost: 1,
  damages: [{ min: 3, max: 7, type: 'piercing' }],
  metallic: false,
});

const pull = (over: Partial<CombatAbility> = {}): CombatAbility => ({
  id: 'spell:pull',
  name: 'Attire-métal',
  kind: 'spell',
  rangeMeters: 10,
  shape: { kind: 'single' },
  targets: ['enemy', 'ally', 'self'],
  manaCost: 3,
  enduranceCost: 0,
  damages: [],
  autoHit: true,
  pullsMetal: true,
  pullDc: 12,
  ...over,
});

const throwMetal = (over: Partial<CombatAbility> = {}): CombatAbility => ({
  id: 'spell:throw',
  name: 'Projette-métal',
  kind: 'spell',
  rangeMeters: 12,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 5,
  enduranceCost: 0,
  // La composante vide que le palier réserve aux dégâts de l'objet.
  damages: [{ min: 0, max: 0, type: 'lightning' }],
  throwsMetal: true,
  ...over,
});

/** Deux combattants côte à côte, prêts à agir. */
function duel(caster: Partial<Combatant> = {}, foe: Partial<Combatant> = {}): Encounter {
  const enc = emptyEncounter('Duel');
  enc.seed = 7;
  enc.phase = 'combat';
  enc.round = 1;
  enc.turn = 0;
  enc.combatants = [
    mkUnit({ id: 'mage', name: 'Mage', team: 'allies', pos: { x: 0, y: 0 }, ...caster }),
    mkUnit({ id: 'foe', name: 'Bandit', team: 'ennemis', pos: { x: 2, y: 0 }, ...foe }),
  ];
  return enc;
}

/* ── Ce que le champ voit ──────────────────────────────────────────────────── */

describe('ce qu’un champ magnétique peut saisir', () => {
  it('voit l’arme d’acier au poing et la ferraille au sac', () => {
    const unit = mkUnit({
      id: 'u',
      name: 'U',
      team: 'allies',
      abilities: [sword()],
      inventory: [{ name: 'Grappin', qty: 1, kind: 'other', metallic: true, weightKg: 2 }],
    });
    expect(metalCarriedBy(unit).map((i) => i.name)).toEqual(['Épée longue', 'Grappin']);
  });

  it('ignore le bois, le plomb et tout ce que le catalogue ne dit pas ferreux', () => {
    const unit = mkUnit({
      id: 'u',
      name: 'U',
      team: 'allies',
      abilities: [bow()],
      inventory: [
        { name: 'Billes de fronde', qty: 20, kind: 'ammunition', metallic: false },
        { name: 'Corde de chanvre', qty: 1, kind: 'other' },
      ],
    });
    expect(metalCarriedBy(unit)).toEqual([]);
  });

  it('ignore une ligne de sac épuisée', () => {
    const unit = mkUnit({
      id: 'u',
      name: 'U',
      team: 'allies',
      inventory: [{ name: 'Flèches', qty: 0, kind: 'ammunition', metallic: true }],
    });
    expect(metalCarriedBy(unit)).toEqual([]);
  });

  it('n’offre PAS l’armure comme prise : une cotte de mailles ne s’arrache pas', () => {
    const chevalier = mkUnit({ id: 'k', name: 'Chevalier', team: 'ennemis', metallicArmor: true });
    expect(metalCarriedBy(chevalier)).toEqual([]);
    // …mais elle suffit à faire de lui quelqu'un que le fer trahit.
    expect(bearsMetal(chevalier)).toBe(true);
  });

  it('ne retient pas quelqu’un qui ne porte rien de ferreux', () => {
    expect(bearsMetal(mkUnit({ id: 'u', name: 'U', team: 'allies', abilities: [bow()] }))).toBe(false);
  });

  it('pèse un objet de sac d’après sa masse, faute d’être une arme', () => {
    expect(heftDamage(4)).toEqual({ min: 5, max: 10, type: 'bludgeoning' });
    expect(heftDamage(0.2)).toEqual({ min: 1, max: 3, type: 'bludgeoning' });
  });

  it('prend la prise désignée, et la première venue à défaut', () => {
    const items = metalCarriedBy(
      mkUnit({
        id: 'u',
        name: 'U',
        team: 'allies',
        abilities: [sword()],
        inventory: [{ name: 'Grappin', qty: 1, kind: 'other', metallic: true }],
      }),
    );
    expect(pickMetal(items, 'Grappin')?.name).toBe('Grappin');
    expect(pickMetal(items, undefined)?.name).toBe('Épée longue');
    expect(pickMetal([], 'Grappin')).toBeUndefined();
  });
});

/* ── Les objets et leur matière ────────────────────────────────────────────
   Chaque objet du catalogue dit DE QUOI il est fait, et le magnétisme s'en
   déduit. C'est ce qui remplace le drapeau `metallic` qu'il fallait tenir à
   jour objet par objet — et qui laissait passer les incohérences.
─────────────────────────────────────────────────────────────────────────── */

describe('les objets sont faits d’une matière', () => {
  const materiaux = new Map(MATERIALS.map((m) => [m.key, m]));

  /** Toutes les entrées de catalogue qui déclarent une matière. */
  function catalogue(): { nom: string; material?: string }[] {
    const out: { nom: string; material?: string }[] = [];
    for (const w of [...meleeIndex, ...rangedIndex] as { slug: string }[]) {
      out.push({ nom: w.slug });
    }
    for (const e of equipmentIndex as { name: string; material?: string }[]) {
      out.push({ nom: e.name, material: e.material });
    }
    return out;
  }

  it('ne référence que des matières du catalogue', () => {
    for (const e of equipmentIndex as { name: string; material?: string }[]) {
      if (!e.material) continue;
      expect(materiaux.get(e.material), `${e.name} → ${e.material}`).toBeDefined();
    }
  });

  it('couvre TOUT le catalogue : plus un objet sans matière', () => {
    // C'est ce qui permet de supprimer le drapeau posé à la main : si un objet
    // pouvait rester muet, il faudrait garder les deux systèmes.
    for (const e of equipmentIndex as { slug: string; material?: string }[]) {
      expect(e.material, e.slug).toBeDefined();
    }
  });

  it('déclare la matière sur les FICHES, pas seulement dans l’index', () => {
    // L'index est REGÉNÉRÉ depuis les fiches (`npm run gen:index`, branché sur
    // `prestart` et `prebuild`). Une matière écrite dans l'index seul serait
    // effacée au prochain build — et le magnétisme avec elle.
    const dir = 'public/resources/json/equipment';
    for (const e of equipmentIndex as { slug: string; material?: string }[]) {
      const fiche = JSON.parse(readFileSync(`${dir}/${e.slug}.json`, 'utf8'));
      expect(fiche.material, e.slug).toBe(e.material);
    }
  });

  it('donne à chaque matière une composition lisible', () => {
    for (const m of MATERIALS) {
      expect(compositionLabel(m.key), m.key).toContain(m.name);
    }
    // Ce dont on ignore la matière n'affiche pas de ligne creuse.
    expect(compositionLabel(undefined)).toBe('');
    expect(compositionLabel('mithril')).toBe('');
  });

  it('ne rend aimantable que le fer et l’acier', () => {
    expect(isFerromagnetic('fer')).toBe(true);
    expect(isFerromagnetic('acier')).toBe(true);
    // Des métaux, mais aucun champ n'a prise dessus.
    for (const k of ['bronze', 'cuivre', 'etain', 'or', 'argent', 'tungstene', 'plomb']) {
      expect(isFerromagnetic(k), k).toBe(false);
    }
    // Et ce qui n'est pas au catalogue ne l'est pas non plus.
    expect(isFerromagnetic(undefined)).toBe(false);
    // Le bois EST au catalogue désormais — et n'est pas magnétique pour autant.
    expect(isFerromagnetic('bois')).toBe(false);
    expect(isFerromagnetic('cuir')).toBe(false);
  });

  it('exclut la chevalière d’or et l’astrolabe de bronze SANS exception écrite', () => {
    const eq = equipmentIndex as { slug: string; material?: string }[];
    const chevaliere = eq.find((e) => e.slug === 'chevaliere-armoriee')!;
    const astrolabe = eq.find((e) => e.slug === 'astrolabe')!;
    // Ils portent bien une matière — ce sont des objets en métal…
    expect(chevaliere.material).toBe('or');
    expect(astrolabe.material).toBe('bronze');
    // …mais la physique les écarte d'elle-même.
    expect(isFerromagnetic(chevaliere.material)).toBe(false);
    expect(isFerromagnetic(astrolabe.material)).toBe(false);
  });

  it('garde les outils de fer et d’acier saisissables', () => {
    const eq = equipmentIndex as { slug: string; material?: string }[];
    for (const slug of ['entraves-de-fer', 'grappin', 'marmite-et-gamelle', 'outils-de-crocheteur']) {
      const e = eq.find((x) => x.slug === slug)!;
      expect(isFerromagnetic(e.material), slug).toBe(true);
    }
  });

  it('tire les dégâts d’un objet lancé de SA matière, pas de sa seule masse', () => {
    // Un couteau d'acier et une marmite de fer ne blessent pas pareil.
    const acier = metalCarriedBy(
      mkUnit({
        id: 'u', name: 'U', team: 'allies',
        inventory: [{ name: 'Serpe', qty: 1, kind: 'other', metallic: true, material: 'acier' }],
      }),
    )[0];
    const fer = metalCarriedBy(
      mkUnit({
        id: 'u', name: 'U', team: 'allies',
        inventory: [{ name: 'Marmite', qty: 1, kind: 'other', metallic: true, material: 'fer' }],
      }),
    )[0];
    expect(acier.thrown.type).toBe('slashing');
    expect(fer.thrown.type).toBe('slashing');
    expect(acier.thrown.max).toBeGreaterThan(fer.thrown.max);
  });

  it('retombe sur la masse quand la matière est inconnue', () => {
    const sansMatiere = metalCarriedBy(
      mkUnit({
        id: 'u', name: 'U', team: 'allies',
        inventory: [{ name: 'Truc', qty: 1, kind: 'other', metallic: true, weightKg: 4 }],
      }),
    )[0];
    expect(sansMatiere.thrown).toEqual(heftDamage(4));
  });
});

/* ── Attire-métal ──────────────────────────────────────────────────────────── */

describe('Attire-métal', () => {
  it('fait passer un objet du sac de la cible à celui du lanceur', () => {
    let enc = duel(
      { abilities: [pull()] },
      { inventory: [{ name: 'Grappin', qty: 2, kind: 'other', metallic: true, weightKg: 2 }] },
    );
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 2, y: 0 },
      item: 'Grappin',
    });

    const [mage, bandit] = enc.combatants;
    expect(carriedQty(mage, 'Grappin')).toBe(1);
    expect(carriedQty(bandit, 'Grappin')).toBe(1);
    // Ce qui est en fer le reste en changeant de main : sans quoi le lanceur ne
    // pourrait plus le projeter au tour suivant.
    expect(mage.inventory.find((i) => i.name === 'Grappin')?.metallic).toBe(true);
  });

  it('désarme la cible quand elle rate son jet de Force', () => {
    // Force 1 : le modificateur est si bas qu'aucun d20 n'atteint le DD 30.
    let enc = duel(
      { abilities: [pull({ pullDc: 30 })] },
      { abilities: [sword()], attributes: ATTRS({ force: 1 }) },
    );
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 2, y: 0 },
      item: 'Épée longue',
    });

    const [mage, bandit] = enc.combatants;
    expect(bandit.abilities.find((a) => a.id === 'weapon:weapon')).toBeUndefined();
    expect(carriedQty(mage, 'Épée longue')).toBe(1);
  });

  it('laisse l’arme au poing quand le jet de Force passe', () => {
    // Force 30 (mod. +10) et maîtrise +2 : même un d20 à 1 franchit le DD 12.
    let enc = duel(
      { abilities: [pull({ pullDc: 12 })] },
      { abilities: [sword()], attributes: ATTRS({ force: 30 }) },
    );
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 2, y: 0 },
      item: 'Épée longue',
    });

    const [mage, bandit] = enc.combatants;
    expect(bandit.abilities.find((a) => a.id === 'weapon:weapon')).toBeDefined();
    expect(carriedQty(mage, 'Épée longue')).toBe(0);
  });

  it('ne dispute pas ce qui dort dans un sac : aucun jet, la prise est acquise', () => {
    // Même avec un DD inatteignable, une ligne de sac ne se défend pas.
    let enc = duel(
      { abilities: [pull({ pullDc: 99 })] },
      { inventory: [{ name: 'Entraves de fer', qty: 1, kind: 'other', metallic: true }] },
    );
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 2, y: 0 },
    });
    expect(carriedQty(enc.combatants[0], 'Entraves de fer')).toBe(1);
  });

  it('le dit, et ne prend rien, quand la cible n’a rien de ferreux', () => {
    let enc = duel({ abilities: [pull()] }, { abilities: [bow()] });
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 2, y: 0 },
    });
    expect(enc.combatants[0].inventory).toEqual([]);
    expect(enc.log.some((l) => l.text.includes('ne porte rien de ferreux'))).toBe(true);
  });
});

/* ── Projette-métal ────────────────────────────────────────────────────────── */

describe('Projette-métal', () => {
  it('emprunte ses dégâts et son type à l’objet lancé', () => {
    // `autoHit` neutralise le jet de toucher : ce qu'on vérifie ici est la
    // SUBSTITUTION des dégâts, et un coup manqué n'en dirait rien. Le tir
    // ordinaire, lui, se manque — c'est le comportement voulu.
    let enc = duel({ abilities: [throwMetal({ autoHit: true })], inventory: [] });
    enc.combatants[0].abilities.push(sword());
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 2, y: 0 },
      item: 'Épée longue',
    });
    // Le type vient de la lame (tranchant), pas du domaine (foudre).
    const journal = enc.log.map((l) => [l.text, ...(l.details ?? [])].join(' ')).join('\n');
    expect(journal).toContain('Épée longue');
    expect(journal.toLowerCase()).toContain('tranchant');
    expect(journal.toLowerCase()).not.toContain('foudre');
  });

  it('consomme le projectile : l’objet quitte le sac', () => {
    let enc = duel({
      abilities: [throwMetal()],
      inventory: [{ name: 'Flèches', qty: 3, kind: 'ammunition', metallic: true }],
    });
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 2, y: 0 },
      item: 'Flèches',
    });
    expect(carriedQty(enc.combatants[0], 'Flèches')).toBe(2);
  });

  it('désarme celui qui projette l’arme qu’il tenait', () => {
    let enc = duel({ abilities: [throwMetal(), sword()] });
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 2, y: 0 },
      item: 'Épée longue',
    });
    expect(enc.combatants[0].abilities.find((a) => a.id === 'weapon:weapon')).toBeUndefined();
  });

  it('refuse de partir quand le lanceur n’a rien de ferreux', () => {
    let enc = duel({ abilities: [throwMetal()], inventory: [] });
    const avant = enc.combatants[0].mana;
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 2, y: 0 },
    });
    // Ni mana dépensé, ni action consommée : le refus arrive avant le coût.
    expect(enc.combatants[0].mana).toBe(avant);
    expect(enc.combatants[0].actionUsed).toBe(false);
    expect(enc.log.some((l) => l.text.includes('Rien de ferreux à projeter'))).toBe(true);
  });
});

/* ── Le bouclier électromagnétique ─────────────────────────────────────────── */

describe('Bouclier électromagnétique', () => {
  /** Le champ tendu, tel que le sort le pose : sur soi, écart de 3 m. */
  function shielded(foe: Partial<Combatant>): Encounter {
    const enc = duel({}, { pos: { x: 4, y: 0 }, ...foe });
    applyStatus(enc, enc.combatants[0], 'repulsion-magnetique', enc.combatants[0], {
      duration: -1,
      gapMeters: 3,
    });
    return enc;
  }

  it('interdit à un homme en armure d’entrer dans le champ', () => {
    const enc = shielded({ metallicArmor: true });
    const [mage, chevalier] = enc.combatants;
    // Une case adjacente au lanceur : sous les 3 m d'écart.
    expect(anchorBlocker(enc, chevalier, { x: 1, y: 0 })?.id).toBe(mage.id);
  });

  it('laisse passer qui vient sans métal', () => {
    const enc = shielded({ abilities: [bow()] });
    expect(anchorBlocker(enc, enc.combatants[1], { x: 1, y: 0 })).toBeUndefined();
  });

  it('prend aussi celui qui n’a qu’une lame au poing', () => {
    const enc = shielded({ abilities: [sword()] });
    expect(anchorBlocker(enc, enc.combatants[1], { x: 1, y: 0 })).toBeDefined();
  });

  it('ne repousse pas son propre porteur', () => {
    // Le lanceur porte lui-même une épée : sans l'exception, son champ le
    // chasserait de sa propre place.
    const enc = shielded({});
    enc.combatants[0].abilities.push(sword());
    expect(anchorBlocker(enc, enc.combatants[0], { x: 1, y: 0 })).toBeUndefined();
  });

  it('n’écarte pas les gouvernés les uns des autres : ce n’est pas un piège', () => {
    const enc = shielded({ metallicArmor: true });
    enc.combatants.push(
      mkUnit({
        id: 'foe2',
        name: 'Sergent',
        team: 'ennemis',
        pos: { x: 6, y: 0 },
        metallicArmor: true,
      }),
    );
    // Les deux hommes en armure peuvent se serrer l'un contre l'autre, loin du
    // lanceur : l'écart ne se compte que depuis celui qui tend le champ.
    expect(anchorBlocker(enc, enc.combatants[2], { x: 5, y: 0 })).toBeUndefined();
  });
});
