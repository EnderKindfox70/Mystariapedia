import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import loupGris from '../../../public/resources/json/bestiary/loup-gris.json';
import { BestiaryEntry } from '../wiki.types';
import { emptyEncounter } from './encounter';
import { CombatantFactory } from './combatant-factory';
import { applyAction, effectiveStat, findUnit } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   La fabrique lue contre les VRAIES données du wiki.

   Les tests du moteur travaillent sur des combattants synthétiques : ils
   valident les règles, pas la lecture des fichiers. Ici on prend une fiche du
   bestiaire telle qu'elle est livrée et on vérifie qu'elle devient un
   combattant jouable — c'est ce qui casserait en silence si le format des
   fiches évoluait.
─────────────────────────────────────────────────────────────────────────── */

const factory = (): CombatantFactory => {
  TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  return TestBed.inject(CombatantFactory);
};

const wolf = loupGris as unknown as BestiaryEntry;

describe('fabrique — bestiaire', () => {
  it('compose les stats depuis le type d’entité et les bonus de la fiche', () => {
    const unit = factory().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    // Type « bestial » : 20 PV de base, +20 de bonus sur la fiche.
    expect(unit.base.hp).toBe(40);
    // Attaque physique : 5 (type) + 5 (fiche).
    expect(unit.base.atk_phy).toBe(10);
    expect(unit.hp).toBe(unit.base.hp);
    expect(unit.name).toBe('Loup Gris');
  });

  it('lit les caractéristiques de la fiche', () => {
    const unit = factory().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    expect(unit.attributes.force).toBe(14);
    expect(unit.attributes.dexterite).toBe(14);
    expect(unit.attributes.intelligence).toBe(3);
  });

  it('résout les affinités en types de dégâts nommés', () => {
    const unit = factory().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    // Ids 1 et 2 de damage_type.json.
    expect(unit.affinities.resistances).toEqual(['bludgeoning']);
    expect(unit.affinities.weaknesses).toEqual(['piercing']);
  });

  it('dérive des défenses là où le bestiaire n’en chiffre pas', () => {
    const unit = factory().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    // Constitution 12 (mod. +1) + menace 1.
    expect(unit.base.def_phy).toBe(2);
    expect(unit.base.def_mag).toBe(2);
  });

  it('donne une attaque jouable à une créature qui n’en déclare aucune', () => {
    const muette = { ...wolf, abilities: undefined } as BestiaryEntry;
    const unit = factory().fromBestiary(muette, 'ennemis', { x: 0, y: 0 });
    expect(unit.abilities.length).toBeGreaterThan(0);
    const melee = unit.abilities[0];
    expect(melee.damages[0].scaling?.[0].source).toBe('atk_phy');
    expect(melee.rangeMeters).toBe(1.5);
  });

  it('préfère les capacités écrites sur la fiche', () => {
    const unit = factory().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    expect(unit.abilities.map((a) => a.name)).toContain('Hurlement de meute');
  });

  it('numérote les exemplaires d’une même créature', () => {
    const f = factory();
    expect(f.fromBestiary(wolf, 'ennemis', { x: 0, y: 0 }, 1).name).toBe('Loup Gris');
    expect(f.fromBestiary(wolf, 'ennemis', { x: 0, y: 0 }, 2).name).toBe('Loup Gris 2');
  });

  it('donne une empreinte d’une case à une créature de taille M', () => {
    expect(factory().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 }).footprint).toBe(1);
  });

  it('produit un combattant que le moteur sait faire jouer', () => {
    const f = factory();
    const enc = emptyEncounter('Meute');
    enc.seed = 3;
    enc.combatants = [
      f.fromBestiary(wolf, 'allies', { x: 0, y: 0 }, 1),
      f.fromBestiary(wolf, 'ennemis', { x: 1, y: 0 }, 2),
    ];

    let state = applyAction(enc, { type: 'start' });
    expect(state.order).toHaveLength(2);

    const actor = state.order[0];
    const target = state.combatants.find((c) => c.id !== actor)!;
    // La première capacité de la bête, quelle qu'elle soit : elle joue avec ce
    // que sa fiche déclare, pas avec un identifiant figé.
    const attaque = findUnit(state, actor)!.abilities.find((a) => a.damages.length)!;
    state = applyAction(state, {
      type: 'use',
      actorId: actor,
      abilityId: attaque.id,
      at: target.pos,
    });

    // Le coup a été résolu : il a soit touché, soit manqué, mais il a été joué.
    expect(state.log.some((l) => l.kind === 'attack')).toBe(true);
    expect(findUnit(state, actor)!.actionUsed).toBe(true);
    expect(state.rollCount).toBeGreaterThan(0);
  });

  it('applique les buffs de vitesse d’un loup comme de n’importe qui', () => {
    const unit = factory().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    // Vitesse « bestial » 0 + 10 de fiche, ramenée sur l'échelle des joueurs.
    expect(effectiveStat(unit, 'speed')).toBe(20);
  });
});
