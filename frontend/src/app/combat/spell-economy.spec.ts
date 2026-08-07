import { describe, expect, it } from 'vitest';
import { SpellsService } from '../services/spells.service';
import { SpellNode, SpellNodeStats } from '../wiki.types';
import {
  areaMultiplier,
  auditNode,
  EconomyVerdict,
  expectedMana,
  isHollow,
  needsRecoil,
  rangeMultiplier,
  spellPower,
  TARGET_EFFICIENCY,
  TOLERANCE,
} from './spell-economy';

/* ──────────────────────────────────────────────────────────────────────────
   AUDIT PERMANENT DE L'ÉCONOMIE DES SORTS

   Ce fichier n'est pas un test unitaire ordinaire : c'est le garde-fou. Il
   confronte CHAQUE palier du catalogue à la loi de `spell-economy.ts` et
   échoue si l'un d'eux sort des bornes.

   Conséquence voulue : on ne peut plus ajouter un sort déséquilibré sans que
   `npm test` le dise. L'équilibrage cesse d'être une passe qu'on refait tous
   les trois mois.

   Quand un test échoue, deux issues légitimes :
   1. corriger le palier (coût, effet, ou lui donner un contre-coup) ;
   2. l'inscrire dans `DEROGATIONS` avec la raison — un choix assumé reste un
      choix, mais il doit être écrit.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Paliers autorisés à sortir de la norme, et pourquoi.
 *
 * La liste doit rester courte. Si elle s'allonge, c'est la loi qu'il faut
 * revoir, pas les exceptions qu'il faut multiplier.
 */
const DEROGATIONS: Record<string, string> = {};

interface Ligne {
  spell: string;
  node: string;
  name: string;
  tier: number;
  stats: SpellNodeStats;
  /** Contexte du sort (clé, météo) : la loi en a besoin pour juger. */
  ctx: { key: string; weather?: string };
  /** Palier sans effet de combat chiffré : la loi ne le tarife pas. */
  hollow: boolean;
  verdict: EconomyVerdict;
}

/** Tous les paliers chiffrés du catalogue, sorts de combinaison compris. */
function allNodes(): Ligne[] {
  const spells = new SpellsService();
  const out: Ligne[] = [];
  for (const page of spells.all()) {
    const ctx = { key: page.spell.key, weather: page.spell.weather };
    for (const node of page.spell.progression?.nodes ?? []) {
      const stats = node.stats as SpellNodeStats;
      if (!stats?.mana) continue;
      out.push({
        spell: page.spell.key,
        node: node.id,
        name: node.name,
        tier: node.tier ?? 1,
        stats,
        ctx,
        hollow: isHollow(stats, ctx),
        verdict: auditNode(stats, ctx),
      });
    }
  }
  return out;
}

const cle = (l: Ligne): string => `${l.spell}/${l.node}`;

describe('économie des sorts — la loi', () => {
  it('valorise la zone plus que la portée', () => {
    // Toucher trois adversaires démultiplie ; tirer de loin ne fait qu'éviter
    // la riposte. La hiérarchie doit se lire dans les multiplicateurs.
    expect(areaMultiplier('Rayon 6 m')).toBeGreaterThan(rangeMultiplier('30 m'));
    expect(areaMultiplier('Cible unique')).toBe(1);
    expect(areaMultiplier('3 cibles')).toBeCloseTo(2.2);
  });

  it('ne pénalise pas un sort de contact', () => {
    // Un sort de contact prend déjà son risque en se plaçant.
    expect(rangeMultiplier('Contact')).toBe(1);
    expect(rangeMultiplier('Personnel')).toBe(1);
    expect(rangeMultiplier('30 m')).toBeGreaterThan(1);
  });

  it('compte le contrôle plus cher que les dégâts', () => {
    const degats: SpellNodeStats = { mana: 5, damageMin: 20, damageMax: 20 };
    const controle: SpellNodeStats = {
      mana: 5,
      damageMin: 20,
      damageMax: 20,
      inflicts: [{ status: 'paralysie', chance: 100 }],
    };
    expect(spellPower(controle).total).toBeGreaterThan(spellPower(degats).total * 1.5);
  });

  it('déduit le contre-coup de la puissance', () => {
    const sans: SpellNodeStats = { mana: 5, damageMin: 60, damageMax: 60 };
    const avec: SpellNodeStats = { ...sans, recoil: { damageMin: 20, damageMax: 20 } };
    expect(spellPower(avec).total).toBe(spellPower(sans).total - 20);
    // Et donc : un contre-coup rend un sort puissant légitimement moins cher.
    expect(expectedMana(avec)).toBeLessThan(expectedMana(sans));
  });

  it('met le soin sur la même échelle que les dégâts', () => {
    const soin: SpellNodeStats = { mana: 5, heal: 30 };
    const coup: SpellNodeStats = { mana: 5, damageMin: 30, damageMax: 30 };
    expect(spellPower(soin).total).toBe(spellPower(coup).total);
  });

  it('lit la météo déclarée sur le SORT, pas seulement sur le palier', () => {
    // Un Blizzard n'écrit `weather` qu'une fois, pour ses trois paliers. Sans
    // ce contexte, la loi le croyait vide et le tarifait à 1 mana.
    const nu: SpellNodeStats = { mana: 5, damageMin: 10, damageMax: 10 };
    expect(spellPower(nu, { weather: 'blizzard' }).total).toBeGreaterThan(
      spellPower(nu).total,
    );
  });

  it('ne tient pour vide que ce qui l’est vraiment', () => {
    expect(isHollow({ mana: 5 })).toBe(true);
    // Une météo suffit à donner un effet, même sans dégâts.
    expect(isHollow({ mana: 5 }, { weather: 'storm' })).toBe(false);
    expect(isHollow({ mana: 5, teleport: true, range: '10 m' })).toBe(false);
  });

  it('valorise une durée longue plus qu’une courte', () => {
    const base = { mana: 5, effects: [{ stat: 'atk_phy' as const, value: 6 }] };
    expect(spellPower({ ...base, duration: 5 }).total).toBeGreaterThan(
      spellPower({ ...base, duration: 2 }).total,
    );
  });
});

describe('économie des sorts — audit du catalogue', () => {
  const lignes = allNodes();
  const chiffres = lignes.filter((l) => !l.hollow);

  it('couvre bien tout le catalogue', () => {
    expect(lignes.length).toBeGreaterThan(400);
    expect(chiffres.length).toBeGreaterThan(400);
  });

  it('n’a AUCUN palier chiffré hors des bornes', () => {
    const fautifs = chiffres
      .filter((l) => l.verdict.verdict === 'trop-fort' || l.verdict.verdict === 'trop-cher')
      .filter((l) => !(cle(l) in DEROGATIONS))
      .sort((a, b) => b.verdict.deviation - a.verdict.deviation);

    if (fautifs.length) {
      const rapport = fautifs
        .map((l) => {
          const v = l.verdict;
          return (
            `  ${cle(l).padEnd(38)} ${l.name.padEnd(30)} ` +
            `${v.mana} mana (loi : ${v.expected}) — ×${v.deviation.toFixed(1)} ${v.verdict}`
          );
        })
        .join('\n');
      throw new Error(
        `${fautifs.length} palier(s) hors norme sur ${chiffres.length} :\n${rapport}\n\n` +
          `Corriger le coût, alléger l'effet, ajouter un contre-coup, ` +
          `ou inscrire une dérogation motivée dans DEROGATIONS.`,
      );
    }
    expect(fautifs).toHaveLength(0);
  });

  it('fait payer les paliers avancés à proportion de leur puissance', () => {
    // Le défaut d'origine : la puissance ×3,6 du palier 1 au 5, mais le coût
    // seulement ×1,9 — monter en palier rendait le mana deux fois plus
    // rentable. L'efficacité doit désormais rester stable d'un palier à l'autre.
    const parTier = new Map<number, number[]>();
    for (const l of chiffres) {
      const liste = parTier.get(l.tier) ?? [];
      liste.push(l.verdict.efficiency);
      parTier.set(l.tier, liste);
    }
    const moyenne = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const paliers = [...parTier.entries()].filter(([, v]) => v.length > 10).sort((a, b) => a[0] - b[0]);
    const effs = paliers.map(([, v]) => moyenne(v));
    expect(Math.max(...effs) / Math.min(...effs)).toBeLessThan(1.6);
  });

  it('exige un contre-coup de ce qui ne peut plus se payer en mana', () => {
    // Au-delà du plafond, l'économie passe le relais : le sort se paie en sang,
    // en risque pour ses alliés, ou il n'est pas défendable.
    const sansContrepartie = chiffres
      .filter((l) => needsRecoil(l.stats, l.ctx))
      .filter((l) => !(cle(l) in DEROGATIONS));
    expect(sansContrepartie.map((l) => `${cle(l)} (${l.name})`)).toEqual([]);
  });

  it('protège le prix voulu par l’auteur plutôt que de le brader', () => {
    // La loi trouve ces paliers chers, mais elle refuse de descendre sous la
    // moitié du prix d'origine. Ce n'est pas une faute : c'est le garde-fou.
    // On veut juste que leur nombre reste petit et visible.
    const proteges = lignes.filter((l) => l.verdict.verdict === 'protege');
    expect(proteges.length).toBeLessThanOrEqual(35);
  });

  it('recense les paliers sans effet de combat chiffré', () => {
    // Ils ne sont pas fautifs : ce sont des sorts hors combat, ou des fiches
    // qui attendent leurs chiffres. On veut juste savoir combien, et que ce
    // nombre ne dérive pas en silence.
    expect(lignes.filter((l) => l.hollow).length).toBeLessThanOrEqual(40);
  });

  it('garde un écart d’efficacité raisonnable dans le catalogue', () => {
    // Avant ce cadre, l'écart entre le meilleur et le pire sort était de 39×.
    // On mesure sur les paliers que la loi a pu tarifer librement : ceux dont
    // le prix est retenu par le plancher tirent l'écart vers le bas sans que
    // ce soit un déséquilibre.
    const libres = chiffres.filter((l) => l.verdict.verdict !== 'protege');
    const eff = libres.map((l) => l.verdict.efficiency).sort((a, b) => a - b);
    expect(eff[eff.length - 1] / eff[0]).toBeLessThan(7);

    // Le catalogue entier, protégés compris, reste très en deçà du désordre initial.
    const tous = chiffres.map((l) => l.verdict.efficiency).sort((a, b) => a - b);
    expect(tous[tous.length - 1] / tous[0]).toBeLessThan(30);
  });

  it('reste calé sur la cible d’efficacité', () => {
    const eff = chiffres.map((l) => l.verdict.efficiency).sort((a, b) => a - b);
    const mediane = eff[Math.floor(eff.length / 2)];
    expect(mediane).toBeGreaterThan(TARGET_EFFICIENCY * 0.7);
    expect(mediane).toBeLessThan(TARGET_EFFICIENCY * 1.4);
  });
});
