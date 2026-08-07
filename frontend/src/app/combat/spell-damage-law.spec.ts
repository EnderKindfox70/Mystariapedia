import { describe, expect, it } from 'vitest';
import { SpellsService } from '../services/spells.service';
import { SpellPageData } from '../wiki.types';
import {
  DAMAGE_TOLERANCE,
  DICE_SHARE,
  actualDamage,
  auditDamage,
  damageBudget,
  referenceAttack,
  referenceHp,
  shapeShare,
  tierPlayedAt,
} from './spell-damage-law';

/* ──────────────────────────────────────────────────────────────────────────
   LE GARDE-FOU DES DÉGÂTS.

   Il ne teste pas du code : il audite les DONNÉES. Chaque nœud de dégâts du
   jeu est confronté à la loi, et la suite échoue si l'un d'eux sort des
   bornes.

   C'est le seul moyen tenable. Les dégâts d'un sort valent `dés + ratio ×
   attaque`, et l'attaque croît deux fois plus vite que les points de vie sur
   les premiers niveaux : un ratio qui semble raisonnable à la lecture devient
   mortel dix niveaux plus loin. Aucune relecture humaine ne rattrape ça sur
   210 nœuds répartis dans seize domaines.
─────────────────────────────────────────────────────────────────────────── */

describe('loi des dégâts', () => {
  it('vise un cinquième des PV de la cible', () => {
    // C'est LE nombre : un combat de quatre à six échanges.
    const budget = damageBudget(1, 1);
    expect(budget.total).toBeCloseTo(referenceHp(1) * 0.2, 5);
  });

  it('juge un palier au niveau où il se joue, pas où le sort s’apprend', () => {
    // Un palier V ne s'atteint pas le jour où l'on apprend le sort. Le juger
    // contre les PV du niveau d'accès le condamnerait injustement.
    expect(tierPlayedAt(5, 1)).toBe(5);
    expect(tierPlayedAt(5, 5)).toBeGreaterThan(5);
    expect(damageBudget(5, 5).total).toBeGreaterThan(damageBudget(5, 1).total);
  });

  it('fait frapper une zone moins fort qu’une cible unique', () => {
    // Elle touche plusieurs adversaires : à dégâts égaux elle rapporte plus.
    expect(shapeShare('Rayon 5 m')).toBeLessThan(shapeShare('Cible unique'));
    expect(damageBudget(3, 1, 'Cône 8 m').total).toBeLessThan(damageBudget(3, 1, 'Cible unique').total);
  });

  it('confie l’essentiel aux dés, pas au scaling', () => {
    // Les dés sont la puissance PROPRE du sort, celle que la fiche annonce et
    // qui ne s'érode pas. Si le scaling dominait, un sort ne serait plus qu'un
    // multiplicateur de la stat du lanceur.
    expect(DICE_SHARE).toBeGreaterThan(0.5);
    const b = damageBudget(5, 1);
    expect((b.diceMin + b.diceMax) / 2).toBeGreaterThan(b.total * 0.5);
  });

  it('compense l’érosion du moteur dans le ratio qu’elle prescrit', () => {
    // Le moteur rogne le scaling des vieux sorts ; la loi doit viser sa cible
    // APRÈS ce prélèvement, sinon les hauts paliers arriveraient tous mous.
    const b = damageBudget(1, 5);
    expect(actualDamage(1, 5, b.diceMin, b.diceMax, b.ratio)).toBeCloseTo(b.total, 0);
  });

  it('reconnaît l’attaque comme croissant plus vite que les PV', () => {
    // La donnée qui explique tout le déséquilibre d'origine.
    expect(referenceAttack(1) / referenceHp(1)).toBeLessThan(1);
    expect(referenceAttack(15) / referenceHp(15)).toBeGreaterThan(1.5);
  });
});

describe('les fiches de sorts', () => {
  /** Chaque nœud qui inflige des dégâts, avec son verdict. */
  const verdicts = new SpellsService().all().flatMap((page: SpellPageData) =>
    (page.spell.progression?.nodes ?? [])
      .filter((node) => node.stats?.damageMax)
      .map((node) => {
        const stats = node.stats;
        const ratio = (stats.scaling ?? [])
          .filter((s) => /^atk_/.test(s.source))
          .reduce((sum, s) => sum + s.ratio, 0);
        return {
          label: `${page.spell.key}/${node.id}`,
          name: node.name,
          ...auditDamage(
            page.spell.level ?? 1,
            node.tier ?? 1,
            stats.damageMin ?? 0,
            stats.damageMax ?? 0,
            ratio,
            stats.area,
            (page.spell.requires ?? []).length >= 2,
          ),
        };
      }),
  );

  it('audite tout le catalogue', () => {
    expect(verdicts.length).toBeGreaterThan(150);
  });

  it('n’a AUCUN nœud de dégâts hors des bornes', () => {
    const fautifs = verdicts.filter((v) => v.verdict !== 'ok');
    if (fautifs.length) {
      const detail = fautifs
        .slice(0, 25)
        .map(
          (v) =>
            `  ${v.label.padEnd(34)} ${(v.name ?? '').padEnd(28)} ` +
            `${Math.round(v.actual)} dégâts (loi : ${Math.round(v.budget.total)}) — ×${v.factor.toFixed(1)} ${v.verdict}`,
        )
        .join('\n');
      throw new Error(`${fautifs.length} nœud(s) hors des bornes :\n${detail}`);
    }
    expect(fautifs).toHaveLength(0);
  });

  it('reste dans une fourchette resserrée, pas seulement dans les bornes', () => {
    // Les bornes laissent passer du simple au triple ; la MÉDIANE, elle, doit
    // tomber près de 1. Sans ce second garde-fou, tout le catalogue pourrait
    // dériver ensemble vers une extrémité sans qu'aucun nœud n'échoue.
    const facteurs = verdicts.map((v) => v.factor).sort((a, b) => a - b);
    const mediane = facteurs[facteurs.length >> 1];
    expect(mediane).toBeGreaterThan(DAMAGE_TOLERANCE.min * 1.4);
    expect(mediane).toBeLessThan(DAMAGE_TOLERANCE.max * 0.8);
  });
});
