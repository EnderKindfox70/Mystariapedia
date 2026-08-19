import { describe, expect, it } from 'vitest';
import airDomain from '../../../public/resources/json/domains/air.json';
import darknessDomain from '../../../public/resources/json/domains/darkness.json';
import deathDomain from '../../../public/resources/json/domains/death.json';
import fireDomain from '../../../public/resources/json/domains/fire.json';
import waterDomain from '../../../public/resources/json/domains/water.json';
import { DomainSpellEntry, SpellPageData } from '../wiki.types';
import { spellAbilities } from './abilities';

/* ──────────────────────────────────────────────────────────────────────────
   LE BONUS DU PUGILISTE SUR LES SORTS « POINGS »

   Nimber ses poings coûtait l'action du tour — donc l'enchantement posé, il ne
   restait plus rien pour frapper avec. Le bonus « attaque directe » compensait
   d'un coup gratuit, mais il n'était écrit nulle part ailleurs que dans une
   phrase : le moteur ne le résolvait pas.

   Il devient un **créneau** : le sort se lance en action bonus, et l'action du
   tour reste entière. Plus simple à lire, et fidèle à ce qu'est un réflexe.

   Ces tests lisent les VRAIES fiches de domaine : retoucher un JSON sans
   retoucher le moteur se voit tout de suite.
─────────────────────────────────────────────────────────────────────────── */

/** Les cinq domaines dont le poing accorde le créneau au pugiliste. */
const REFLEXE: { domaine: string; data: { spells?: unknown[] }; key: string }[] = [
  { domaine: 'air', data: airDomain, key: 'air-revetement-poings' },
  { domaine: 'darkness', data: darknessDomain, key: 'darkness-revetement-poings' },
  { domaine: 'death', data: deathDomain, key: 'death-revetement-poings' },
  { domaine: 'fire', data: fireDomain, key: 'fire-revetement-poings' },
  { domaine: 'water', data: waterDomain, key: 'water-revetement-poings' },
];

/** La page telle que le moteur la reçoit, pour un sort donné d'un domaine. */
function page(data: { spells?: unknown[] }, domaine: string, key: string): SpellPageData {
  const spell = (data.spells as DomainSpellEntry[]).find((s) => s.key === key);
  if (!spell) throw new Error(`sort introuvable : ${key}`);
  return { spell, domains: [domaine] } as SpellPageData;
}

/** Tous les paliers d'un sort, résolus pour une classe. */
const paliers = (data: { spells?: unknown[] }, domaine: string, key: string, classe?: string) => {
  const p = page(data, domaine, key);
  const ids = (p.spell.progression?.nodes ?? []).map((n) => n.id);
  return spellAbilities(p, ids, classe);
};

describe('le poing du pugiliste se lance en action bonus', () => {
  for (const { domaine, data, key } of REFLEXE) {
    it(`${domaine} — le sort prend le créneau bonus`, () => {
      const pugiliste = paliers(data, domaine, key, 'pugilist');
      expect(pugiliste.length).toBeGreaterThan(0);
      for (const palier of pugiliste) expect(palier.bonusAction).toBe(true);
    });

    it(`${domaine} — les autres classes y passent toujours leur action`, () => {
      for (const classe of ['mage', 'warrior', undefined]) {
        for (const palier of paliers(data, domaine, key, classe)) {
          expect(palier.bonusAction).toBeFalsy();
        }
      }
    });
  }

  it('remplace bel et bien la frappe gratuite : le bonus ne fait plus les deux', () => {
    // Les ténèbres étaient le seul domaine où l'attaque directe était chiffrée
    // (`freeStrike`). Elle a cédé la place au créneau, elle ne s'y ajoute pas.
    for (const palier of paliers(darknessDomain, 'darkness', 'darkness-revetement-poings', 'pugilist')) {
      expect(palier.freeStrike).toBeUndefined();
      expect(palier.bonusAction).toBe(true);
    }
  });

  it('nimbe toujours les poings, et non l’arme', () => {
    for (const palier of paliers(fireDomain, 'fire', 'fire-revetement-poings', 'pugilist')) {
      expect(palier.enchant?.target).toBe('unarmed');
    }
  });
});

describe('les autres formes du bonus pugiliste restent intactes', () => {
  it('l’eau garde son mana divisé par deux sur la Brume, sans créneau', () => {
    const brume = paliers(waterDomain, 'water', 'water-revetement-brume-poings', 'pugilist');
    const sansBonus = paliers(waterDomain, 'water', 'water-revetement-brume-poings', 'mage');
    expect(brume.length).toBe(sansBonus.length);
    for (let i = 0; i < brume.length; i++) {
      expect(brume[i].manaCost).toBeLessThan(sansBonus[i].manaCost);
      // Le mana à moitié prix n'accorde PAS le créneau : une forme, pas deux.
      expect(brume[i].bonusAction).toBeFalsy();
    }
  });

  it('l’eau garde son ratio de dégâts accru sur la Glace, sans créneau', () => {
    for (const palier of paliers(waterDomain, 'water', 'water-revetement-glace-poings', 'pugilist')) {
      expect(palier.bonusAction).toBeFalsy();
      expect(palier.enchant?.damage.scaling?.length).toBeGreaterThan(0);
    }
  });
});
