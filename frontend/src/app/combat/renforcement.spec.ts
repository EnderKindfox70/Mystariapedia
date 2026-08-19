import { describe, expect, it } from 'vitest';
import { SpellsService } from '../services/spells.service';
import { AttributeKey, StatKey } from '../character/character.types';
import { spellAbility } from './abilities';
import { Affinities, Combatant, CombatAbility, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { applyAction, CRIT_FACTOR, resolvedComponents } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   LES DEUX MÉCANIQUES DE LA MAGIE NON POLARISÉE.

   Le Renforcement n'apporte AUCUNE nature : il densifie ce qui est déjà là.
   Deux conséquences que rien d'autre dans le moteur ne produisait, et que ces
   tests figent :

     — ARME RENFORCÉE  est un revêtement dont le bonus frappe du type de l'arme
       nimbée, pas d'un élément à lui. Une lame renforcée tranche plus fort ;
       elle ne brûle pas.
     — FRAPPE ASSURÉE  ne garantit pas de toucher — le dé décide encore — mais
       tout ce qui porte est compté en dégâts critiques.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (over: Partial<Record<StatKey, number>> = {}): Record<StatKey, number> => ({
  hp: 60, mana: 50, endurance: 30, speed: 20,
  atk_phy: 20, atk_mag: 10, def_phy: 0, def_mag: 0,
  ...over,
});

const ATTRS = (): Record<AttributeKey, number> => ({
  force: 10, dexterite: 10, constitution: 10,
  intelligence: 10, sagesse: 10, charisme: 10,
});

const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(over: Partial<Combatant> & { id: string; name: string; team: Team }): Combatant {
  const base = over.base ?? STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1, pos: { x: 0, y: 0 },
    attributes: ATTRS(), proficiency: 2,
    hp: base.hp, mana: base.mana, endurance: base.endurance,
    moved: 0, actionUsed: false, bonusActionUsed: false, reactionUsed: false,
    statuses: [], effects: [], abilities: [], inventory: [],
    affinities: NO_AFFINITY(), initiative: 0, down: false,
    ...over,
    base,
  };
}

const spells = new SpellsService();

/** La capacité d'un palier de sort, désigné par sa clé et l'id de son nœud. */
function abilityOf(key: string, nodeId: string): CombatAbility {
  const page = spells.bySlug(key);
  if (!page) throw new Error(`sort introuvable : ${key}`);
  const node = page.spell.progression?.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`palier introuvable : ${key}/${nodeId}`);
  return spellAbility(page, node);
}

/** Une arme au type bien identifié, pour voir ce que le revêtement en fait. */
const sabre: CombatAbility = {
  id: 'weapon:main',
  name: 'Sabre',
  kind: 'weapon',
  rangeMeters: 1.5,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 0,
  enduranceCost: 0,
  damages: [{ min: 6, max: 6, type: 'slashing' }],
};

describe('Arme renforcée — un revêtement sans nature propre', () => {
  const revetement = abilityOf('renforcement-revetement-arme', 'ra1');

  it('est bien lu comme un revêtement d’arme', () => {
    // Sans ça, ses dégâts seraient pris pour une attaque directe et le sort ne
    // changerait rien aux coups portés.
    expect(revetement.enchant?.target).toBe('weapon');
    expect(revetement.damages).toHaveLength(0);
  });

  it('nimbe l’arme du type de l’ARME, pas d’un élément', () => {
    const porteur = mkUnit({
      id: 'a', name: 'Porteur', team: 'allies',
      effects: [
        {
          id: 'e1',
          name: revetement.name,
          remaining: 3,
          mods: [],
          enchant: revetement.enchant,
        },
      ],
    });

    const composantes = resolvedComponents(porteur, sabre);
    // L'arme elle-même, puis le bonus du revêtement — tous deux tranchants.
    expect(composantes).toHaveLength(2);
    expect(composantes.map((c) => c.type)).toEqual(['slashing', 'slashing']);
    expect(composantes[1].min).toBe(1);
  });

  it('laisse un revêtement élémentaire garder SA nature', () => {
    // La règle ne vaut que pour le marqueur du Renforcement : une lame ardente
    // doit continuer d'ajouter du feu à un coup tranchant.
    const porteur = mkUnit({
      id: 'a', name: 'Porteur', team: 'allies',
      effects: [
        {
          id: 'e1', name: 'Lame ardente', remaining: 3, mods: [],
          enchant: { target: 'weapon', damage: { min: 2, max: 3, type: 'fire' } },
        },
      ],
    });
    expect(resolvedComponents(porteur, sabre).map((c) => c.type)).toEqual(['slashing', 'fire']);
  });
});

describe('Frappe assurée — le critique porte sur les dégâts, pas sur le toucher', () => {
  const frappe = abilityOf('renforcement-frappe-assuree', 'fa1');

  it('déclare la garantie sans devenir un coup automatique', () => {
    expect(frappe.alwaysCritical).toBe(true);
    // Le point du sort : on peut encore le manquer.
    expect(frappe.autoHit).toBe(false);
  });

  /** Joue la frappe avec une graine donnée. Retourne le journal de la rencontre. */
  function frapper(seed: number): Encounter {
    const enc = emptyEncounter('Test');
    enc.seed = seed;
    enc.combatants = [
      mkUnit({
        id: 'a', name: 'Attaquant', team: 'allies', pos: { x: 0, y: 0 },
        abilities: [frappe],
      }),
      mkUnit({ id: 'b', name: 'Cible', team: 'ennemis', pos: { x: 1, y: 0 } }),
    ];
    return applyAction(applyAction(enc, { type: 'start' }), {
      type: 'use', actorId: 'a', abilityId: frappe.id, at: { x: 1, y: 0 },
    });
  }

  it('manque encore, et compte tout ce qui porte comme un critique', () => {
    const parties = [...Array(30).keys()].map((i) => frapper(i + 1));
    const touches = parties.filter((enc) => enc.log.some((l) => l.kind === 'damage'));
    const manques = parties.filter((enc) =>
      enc.log.some((l) => l.text.includes('manque')),
    );

    // Les deux issues existent : la garantie n'a pas transformé le sort en
    // coup imparable.
    expect(touches.length).toBeGreaterThan(0);
    expect(manques.length).toBeGreaterThan(0);

    for (const enc of touches) {
      const coup = enc.log.find((l) => l.kind === 'damage')!;
      expect(coup.text).toContain('coup critique');
    }
  });

  it('inflige exactement le facteur critique, cible sans armure', () => {
    const enc = [...Array(30).keys()]
      .map((i) => frapper(i + 1))
      .find((e) => e.log.some((l) => l.kind === 'damage'))!;
    const cible = enc.combatants.find((c) => c.id === 'b')!;
    const subis = cible.base.hp - cible.hp;

    // Dégâts écrits (2–3) + scaling, le tout multiplié par le facteur critique.
    // On borne plutôt que d'égaler : le dé de dégâts reste un dé.
    const attaquant = enc.combatants.find((c) => c.id === 'a')!;
    const bonus = 0.06 * attaquant.base.atk_phy;
    expect(subis).toBeGreaterThanOrEqual(Math.round((2 + bonus) * CRIT_FACTOR));
    expect(subis).toBeLessThanOrEqual(Math.round((3 + bonus) * CRIT_FACTOR));
  });
});
