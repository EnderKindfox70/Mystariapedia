import { describe, expect, it } from 'vitest';
import { AttributeKey, StatKey } from '../character/character.types';
import { SpellsService } from '../services/spells.service';
import { spellAbility } from './abilities';
import { Combatant } from './combat.types';
import { abilityDamageRanges } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   LA HIÉRARCHIE DES SORTS DE PUISSANCE.

   Certains sorts n'ont pas d'autre utilité que de frapper fort. Entre eux,
   l'ordre doit se sentir immédiatement, et il ne peut pas naître tout seul du
   niveau d'accès : la loi des dégâts nivelle par construction, et l'on s'était
   retrouvé avec un Inferno à 70 mana frappant moins fort que des Braises à 1.

   Trois rôles, trois usages :
     — BRAISES     faible mais qu'on enchaîne, une ou deux poignées de mana ;
     — BOULE DE FEU la médiane, le sort qu'on lance quand ça compte ;
     — INFERNO      dévastateur, ruineux, et il brûle vos alliés avec le reste.

   Ce fichier fige cet ordre. Il mesure sur des combattants de niveau 20 —
   l'un aux points de vie MÉDIANS de sa génération, l'autre aux MEILLEURS —
   parce qu'un pourcentage de PV ne veut rien dire sans dire de qui.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (over: Partial<Record<StatKey, number>>): Record<StatKey, number> => ({
  hp: 100, mana: 200, endurance: 40, speed: 20,
  atk_phy: 20, atk_mag: 20, def_phy: 0, def_mag: 0,
  ...over,
});

const ATTRS = (over: Partial<Record<AttributeKey, number>> = {}): Record<AttributeKey, number> => ({
  force: 10, dexterite: 10, constitution: 10,
  intelligence: 10, sagesse: 10, charisme: 10,
  ...over,
});

const combattant = (
  name: string,
  level: number,
  base: Record<StatKey, number>,
  attributes = ATTRS(),
): Combatant => ({
  id: name, name, team: 'allies', origin: { kind: 'custom' },
  level, footprint: 1, pos: { x: 0, y: 0 },
  base, attributes, proficiency: 6,
  hp: base.hp, mana: base.mana, endurance: base.endurance,
  moved: 0, actionUsed: false, bonusActionUsed: false, reactionUsed: false,
  statuses: [], effects: [], abilities: [], inventory: [],
  affinities: { immunities: [], resistances: [], weaknesses: [], absorptions: [] },
  initiative: 0, down: false,
});

/* ── Les combattants de référence, au niveau 20 ────────────────────────────
   PV relevés sur la progression des classes : le Ranger tient la médiane, le
   Guerrier le sommet. C'est contre eux que se lisent les pourcentages.
─────────────────────────────────────────────────────────────────────────── */

const MEDIAN_HP = 124;
const BEST_HP = 200;

const median = combattant('Médian', 20, STATS({ hp: MEDIAN_HP }));
const costaud = combattant('Costaud', 20, STATS({ hp: BEST_HP }));

/** Une archimage de niveau 20 : c'est elle qui lance tout ce qui suit. */
const archimage = combattant(
  'Archimage',
  20,
  STATS({ hp: 105, atk_mag: 161, mana: 300 }),
  ATTRS({ intelligence: 20 }),
);

const spells = new SpellsService();

/** Ce que le dernier palier d'un sort inflige, tout scaling compris. */
function pointeDe(slug: string): number {
  const page = spells.bySlug(slug);
  if (!page) throw new Error(`sort introuvable : ${slug}`);
  const nodes = page.spell.progression?.nodes.filter((n) => n.stats?.damageMax) ?? [];
  const damages = nodes.map((node) => {
    const ability = spellAbility(page, node);
    return abilityDamageRanges(archimage, ability).reduce(
      (sum, r) => sum + (r.min + r.max) / 2,
      0,
    );
  });
  return Math.max(...damages);
}

describe('hiérarchie des sorts de puissance', () => {
  const braises = pointeDe('fire-embers');
  const boule = pointeDe('fire-fireball');
  const inferno = pointeDe('fire-inferno');

  it('ordonne les trois sorts, sans ambiguïté', () => {
    // L'ordre doit se SENTIR : pas « un peu plus », franchement plus.
    expect(boule).toBeGreaterThan(braises * 1.5);
    expect(inferno).toBeGreaterThan(boule * 1.5);
  });

  it('garde Braises faible, mais donné', () => {
    // Son identité n'est pas la puissance : c'est qu'on peut l'enchaîner tout
    // le combat sans y penser.
    expect(braises).toBeLessThan(MEDIAN_HP * 0.15);
    const cout = Math.min(
      ...(spells.bySlug('fire-embers')!.spell.progression?.nodes ?? [])
        .filter((n) => n.stats?.damageMax)
        .map((n) => n.stats.mana ?? 0),
    );
    expect(cout).toBeLessThanOrEqual(3);
  });

  it('place Boule de feu à la médiane', () => {
    expect(boule).toBeGreaterThan(braises);
    expect(boule).toBeLessThan(inferno);
  });

  it('fait d’Inferno un cataclysme : 40 à 50 % du plus résistant', () => {
    // La mesure demandée : contre le combattant le mieux doté en PV du jeu.
    const part = inferno / BEST_HP;
    expect(part).toBeGreaterThanOrEqual(0.4);
    expect(part).toBeLessThanOrEqual(0.5);
  });

  it('en fait presque une exécution pour un combattant médian', () => {
    // C'est le prix de la démesure : contre qui n'est pas un colosse, Inferno
    // emporte plus de la moitié de ce qu'il a.
    expect(inferno / MEDIAN_HP).toBeGreaterThan(0.5);
  });

  it('le paie en mana ET en danger pour ses propres alliés', () => {
    // La puissance ne se justifie que par ses contreparties, et elles doivent
    // être écrites sur la fiche — pas seulement dans l'intention.
    const nodes = spells.bySlug('fire-inferno')!.spell.progression?.nodes ?? [];
    const dernier = nodes[nodes.length - 1];
    const braisesMana = Math.min(
      ...(spells.bySlug('fire-embers')!.spell.progression?.nodes ?? [])
        .filter((n) => n.stats?.damageMax)
        .map((n) => n.stats.mana ?? 0),
    );

    expect(dernier.stats.mana).toBeGreaterThan(braisesMana * 20);
    expect(dernier.stats.targets).toContain('everyone');
    expect(dernier.stats.area).toMatch(/Rayon/);
  });
});
