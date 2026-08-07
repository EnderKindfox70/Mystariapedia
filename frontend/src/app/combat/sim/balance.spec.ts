import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CharacterSheet } from '../../character/character.types';
import { BestiaryEntry } from '../../wiki.types';
import { CombatantFactory } from '../combatant-factory';
import { TestBed } from '@angular/core/testing';
import { spellAbility } from '../abilities';
import { Combatant } from '../combat.types';
import { abilityDamageRanges, effectiveStat } from '../rules';
import { SpellsService } from '../../services/spells.service';
import { FightReport, fight } from './arena';
import { fromRoot } from './paths';
import { Matchup, UnitDigest, digest, pct, round1, table, unitDigests } from './report';
import { arena, beastSide, bestiary, loadedFactory, sheetSide, storedSheets } from './roster';

/* ──────────────────────────────────────────────────────────────────────────
   LE RAPPORT D'ÉQUILIBRAGE.

   Ce fichier ne teste presque rien : il MESURE. Il fait jouer au moteur
   quelques centaines de combats entre les vraies fiches et les vraies bêtes,
   puis écrit `docs/balance-report.md`.

   Les quelques `expect` qu'il porte sont des garde-fous de méthode, pas des
   objectifs d'équilibrage : ils vérifient que le banc mesure quelque chose (des
   combats se concluent, des dégâts passent). Les objectifs, eux, se lisent dans
   le rapport et se discutent — les figer ici ferait échouer la suite à chaque
   ajustement de fiche, ce qui est le contraire du but.
─────────────────────────────────────────────────────────────────────────── */

/** Assez de graines pour que la médiane soit stable, assez peu pour rester rapide. */
const SEEDS = 12;

const sheets = storedSheets();
const sheetOf = (name: string): CharacterSheet =>
  sheets.find((s) => s.sheet.identity.name === name)!.sheet;

/** Les fiches groupées par niveau : on ne compare que ce qui est comparable. */
function byLevel(): Map<number, { name: string; sheet: CharacterSheet }[]> {
  const groups = new Map<number, { name: string; sheet: CharacterSheet }[]>();
  for (const { sheet } of sheets) {
    const list = groups.get(sheet.level) ?? [];
    list.push({ name: sheet.identity.name, sheet });
    groups.set(sheet.level, list);
  }
  return groups;
}

/**
 * Une série de combats entre deux camps, jouée des deux côtés du terrain.
 *
 * Le côté n'est pas neutre : celui de gauche joue d'abord à initiative égale et
 * n'a pas le même décor derrière lui. Sans l'inversion, on mesurerait la
 * position autant que la fiche.
 */
function series(
  factory: CombatantFactory,
  left: ReturnType<typeof sheetSide>,
  right: ReturnType<typeof sheetSide>,
): FightReport[] {
  const out: FightReport[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    out.push(fight(arena(factory, left, right, { seed })));
    // Manche retour : les mêmes, échangés. On remet les rapports dans le sens
    // de la première manche pour que « victoires à gauche » garde un sens.
    const back = fight(arena(factory, right, left, { seed: seed + 1000 }));
    out.push({
      ...back,
      winner: back.winner === 'allies' ? 'ennemis' : back.winner === 'ennemis' ? 'allies' : 'timeout',
      units: back.units.map((u) => ({
        ...u,
        team: u.team === 'allies' ? ('ennemis' as const) : ('allies' as const),
      })),
    });
  }
  return out;
}

/* ── Le rapport ────────────────────────────────────────────────────────────── */

const matchupTable = (rows: Matchup[]): string =>
  table(
    [
      'Affrontement',
      'Tours',
      'dont contact',
      'Non conclus',
      'Victoires gauche',
      'PV du vainqueur',
      'Absorbé',
    ],
    rows.map((m) => [
      m.label,
      round1(m.medianRounds),
      round1(m.contactRounds),
      pct(m.timeouts),
      pct(m.leftWins),
      pct(m.margin),
      pct(m.absorbed),
    ]),
  );

const unitTable = (rows: UnitDigest[]): string =>
  table(
    [
      'Combattant',
      'Niv.',
      'PV',
      'Dégâts / tour',
      'Tient (tours)',
      'Sorts',
      'Compétences',
      'Perdus',
      'Mana brûlé',
      'End. max',
      'Souffle / tour',
      'Réserve au plus bas',
    ],
    rows.map((u) => [
      `${u.name} (${u.kind})`,
      u.level,
      u.maxHp,
      round1(u.damagePerRound),
      Number.isFinite(u.survivalRounds) ? round1(u.survivalRounds) : '∞',
      pct(u.spellShare),
      pct(u.skillShare),
      pct(u.idleShare),
      u.manaBurn ? pct(u.manaBurn) : '—',
      u.maxEndurance,
      round1(u.breathPerRound),
      pct(u.breathFloor),
    ]),
  );

/**
 * Le rapport complet joue plusieurs centaines de combats et réécrit un fichier
 * du dépôt : il n'a rien à faire dans la suite ordinaire, qui doit rester
 * rapide et sans effet de bord. On le déclenche à la demande :
 *
 *     BALANCE_REPORT=1 npm test
 *
 * Un test de fumée reste allumé en permanence, lui, pour que le banc d'essai ne
 * pourrisse pas en silence entre deux campagnes de mesure.
 */
describe('banc d’essai', () => {
  it('joue un combat entre deux vraies fiches', () => {
    const factory = loadedFactory();
    const runs = series(factory, sheetSide(sheetOf('Haru')), sheetSide(sheetOf('Erza')));
    const measured = digest('fumée', 'Guerrier', 'Guerrier', runs);
    expect(runs.length).toBeGreaterThan(0);
    // Deux guerriers de niveau 1 doivent en découdre, pas se regarder.
    expect(measured.timeouts).toBeLessThan(0.5);
    expect(measured.connect).toBeGreaterThan(0);
  });
});

describe.runIf(process.env['BALANCE_REPORT'])('rapport d’équilibrage', () => {
  it('joue les séries et écrit docs/balance-report.md', { timeout: 600_000 }, () => {
    const factory = loadedFactory();
    const beasts = bestiary();
    const levels = byLevel();
    const sections: string[] = [];
    const everything: FightReport[] = [];

    /* 1) Duels entre personnages de même niveau. ---------------------------- */
    const duels: Matchup[] = [];
    for (const [level, group] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const runs = series(factory, sheetSide(a.sheet), sheetSide(b.sheet));
          everything.push(...runs);
          duels.push(
            digest(
              `niv. ${level} — ${a.name} vs ${b.name}`,
              a.sheet.identity.class,
              b.sheet.identity.class,
              runs,
            ),
          );
        }
      }
    }

    /* 2) Miroirs : la même fiche des deux côtés. ---------------------------- */
    const mirrors: Matchup[] = [];
    for (const { sheet } of sheets) {
      const runs = series(factory, sheetSide(sheet), sheetSide(sheet));
      everything.push(...runs);
      mirrors.push(
        digest(
          `${sheet.identity.name} (niv. ${sheet.level}, ${sheet.identity.class})`,
          sheet.identity.class,
          sheet.identity.class,
          runs,
        ),
      );
    }

    /* 3) Personnages contre bestiaire. -------------------------------------- */
    const champions = ['Haru', 'Erza', 'Aelloelle', 'Ender Kindfox', 'Derrieri', 'Merlin'];
    const versus: Matchup[] = [];
    for (const beast of beasts) {
      for (const champion of champions) {
        const sheet = sheetOf(champion);
        const runs = series(factory, sheetSide(sheet), beastSide(beast) as never);
        everything.push(...runs);
        versus.push(
          digest(
            `${champion} (niv. ${sheet.level}) vs ${beast.name} (FP ${beast.cr ?? '?'})`,
            sheet.identity.class,
            beast.name,
            runs,
          ),
        );
      }
    }

    /* 4) Économie d'action : un personnage contre une meute. ---------------- */
    const packs: Matchup[] = [];
    const wolf = beasts.find((b) => b.slug === 'loup-gris');
    if (wolf) {
      for (const champion of ['Haru', 'Ender Kindfox', 'Merlin']) {
        for (const count of [1, 2, 3]) {
          const sheet = sheetOf(champion);
          const runs = series(factory, sheetSide(sheet), beastSide(wolf, count) as never);
          everything.push(...runs);
          packs.push(
            digest(
              `${champion} (niv. ${sheet.level}) vs ${count} loup${count > 1 ? 's' : ''}`,
              sheet.identity.class,
              `${count} × Loup Gris`,
              runs,
            ),
          );
        }
      }
    }

    /* 5) Courbe de puissance : ce que vaut un coup, niveau par niveau. ------ */
    //
    // C'est la table qui manque pour parler de « feel » : elle met côte à côte
    // ce qu'un personnage ENCAISSE et ce qu'il INFLIGE. Le nombre de coups pour
    // tomber s'en déduit, et c'est lui qu'on ressent à table.
    const spells = TestBed.inject(SpellsService);
    /** Un nœud de sortilège nommé, monté comme le moteur le monterait. */
    const node = (slug: string, index = 0) => {
      const page = spells.bySlug(slug);
      const spec = page?.spell.progression?.nodes[index];
      return page && spec ? spellAbility(page, spec) : undefined;
    };
    const braises = node('fire-embers');
    const boule = node('fire-fireball');

    /** Dégâts moyens de cette capacité dans les mains de ce combattant. */
    const moyenne = (unit: Combatant, ability = braises): number => {
      if (!ability) return NaN;
      return abilityDamageRanges(unit, ability).reduce((sum, r) => sum + (r.min + r.max) / 2, 0);
    };

    const porteurs = sheets
      .map(({ sheet }) => ({ sheet, unit: factory.fromSheet(sheet, 'allies', { x: 0, y: 0 }) }))
      .sort((a, b) => a.sheet.level - b.sheet.level);

    const courbe = table(
      ['Personnage', 'Niv.', 'PV', 'atk phy', 'atk mag', 'Braises I', 'Boule de feu I', 'Coups pour le tuer'],
      porteurs.map(({ sheet, unit }) => {
        const feu = moyenne(unit, boule);
        return [
          sheet.identity.name,
          sheet.level,
          effectiveStat(unit, 'hp'),
          effectiveStat(unit, 'atk_phy'),
          effectiveStat(unit, 'atk_mag'),
          round1(moyenne(unit, braises)),
          round1(feu),
          feu > 0 ? round1(effectiveStat(unit, 'hp') / feu) : '—',
        ];
      }),
    );

    /* ── Écriture ─────────────────────────────────────────────────────────── */

    const all = digest('toutes séries', '—', '—', everything);
    sections.push(
      '# Rapport d’équilibrage',
      '',
      `_Généré par \`frontend/src/app/combat/sim/balance.spec.ts\` — ${everything.length} combats joués par le moteur._`,
      '',
      'Ce rapport est **mesuré, pas estimé**. Le banc d’essai monte les vraies fiches',
      'sauvegardées et les vraies bêtes du bestiaire, les fait s’affronter sur terrain nu,',
      'et compte. Il n’applique aucune règle de son cru : il appelle `applyAction` comme',
      'le fait la table de combat.',
      '',
      'L’IA qui pilote les combattants est délibérément sommaire — elle frappe ce qui',
      'rapporte le plus, tout de suite, sans économiser ses réserves. Les durées qu’elle',
      'produit sont donc un **plancher** : un joueur qui temporise fera durer davantage.',
      '',
      '## Vue d’ensemble',
      '',
      table(
        ['Mesure', 'Valeur', 'Ce qu’on cherche'],
        [
          ['Combats joués', everything.length, '—'],
          ['Tours médians', round1(all.medianRounds), '5 à 10'],
          ['Premier sang au round', round1(all.firstBlood), '1 à 2'],
          ['Tours de contact réel', round1(all.contactRounds), '4 à 8'],
          ['Combats non conclus', pct(all.timeouts), '< 5 %'],
          ['PV conservés par le vainqueur', pct(all.margin), '20 à 50 %'],
          ['Absorbé par les défenses', pct(all.absorbed), '25 à 45 %'],
          ['Encaissé / annoncé', pct(all.connect), '—'],
          ['Tours d’approche par combattant', round1(all.approachPerFight), '< 1,5'],
          ['Tours perdus par combattant', round1(all.idlePerFight), '< 0,5'],
          ['Dont réserve vide', pct(all.starvedShare), '20 à 50 %'],
          ['Dont souffle coupé', pct(all.breathlessShare), '—'],
        ],
      ),
      '',
      '## 1. Duels entre personnages de même niveau',
      '',
      'Chaque paire est jouée dans les deux sens, pour que la position et l’ordre',
      'd’initiative ne comptent pas dans le résultat. « Victoires gauche » à 50 % =',
      'affrontement équilibré ; à 100 % = une des deux fiches domine l’autre sans partage.',
      '',
      matchupTable(duels),
      '',
      '## 2. Miroirs',
      '',
      'La même fiche des deux côtés. Le vainqueur ne doit rien qu’à l’initiative et aux',
      'dés : ces lignes mesurent donc la **létalité pure** d’une fiche contre elle-même,',
      'et c’est le meilleur indicateur du rythme d’un combat à ce niveau.',
      '',
      matchupTable(mirrors),
      '',
      '## 3. Personnages contre bestiaire',
      '',
      'Un contre un, sur terrain nu. Sert à vérifier que l’indice de menace (FP) annoncé',
      'sur les fiches correspond à ce qu’on ressent en jeu.',
      '',
      matchupTable(versus),
      '',
      '## 4. Économie d’action : un contre plusieurs',
      '',
      'Le nombre est la variable la plus brutale d’un jeu au tour par tour : chaque bête',
      'en plus est un tour d’actions en plus par round. Ces lignes disent à partir de',
      'combien d’adversaires un personnage seul décroche.',
      '',
      matchupTable(packs),
      '',
      '## 5. Fiche par fiche',
      '',
      '« Tient (tours) » = combien de tours le combattant survit au rythme où on l’entame,',
      'toutes séries confondues. « Mana brûlé » = part de la réserve dépensée dans un',
      'combat moyen : au-delà de 100 %, la réserve n’est pas la contrainte qu’elle devrait être.',
      '',
      unitTable(unitDigests(everything)),
      '',
      '## 6. Courbe de puissance',
      '',
      'Ce que chaque personnage encaisse, et ce qu’un même sort inflige dans ses mains.',
      '',
      '**Braises** s’apprend au niveau 1 ; **Boule de feu** exige Braises et le niveau 5.',
      'Les deux colonnes montrent donc le PREMIER nœud de chacune — et ce que le scaling en',
      'fait entre les mains d’un lanceur bien plus avancé que le sort. Un sort de bas niveau',
      'ne cesse jamais de croître avec l’attaque de qui le lance : c’est là qu’il faut regarder.',
      '',
      '« Coups pour le tuer » = ses points de vie divisés par ce que Boule de feu I lui ferait,',
      'lancée par lui-même. En dessous de 3, l’initiative décide du combat ; au-dessus de 8,',
      'on s’ennuie.',
      '',
      courbe,
      '',
    );

    writeFileSync(fromRoot('docs/balance-report.md'), sections.join('\n'), 'utf8');

    // Garde-fous de méthode : le banc mesure-t-il vraiment quelque chose ?
    expect(everything.length).toBeGreaterThan(100);
    expect(all.timeouts).toBeLessThan(0.5);
    expect(all.connect).toBeGreaterThan(0);
  });
});
