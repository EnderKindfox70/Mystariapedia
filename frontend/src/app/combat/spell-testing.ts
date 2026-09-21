import classCatalog from '../../../public/resources/json/characters/classes.json';
import { SpellPageData, SpellNode } from '../wiki.types';
import { SpellsService } from '../services/spells.service';
import { catalogFrom } from './spell-catalog';
import { builtSpellNode } from './abilities';
import {
  BuilderContext,
  DEFAULT_RULES,
  SpellState,
  emptyBuild,
  xpThreshold,
} from './spell-customization';

/* ──────────────────────────────────────────────────────────────────────────
   OUTILLAGE DE TEST DES SORTS

   Les specs interrogeaient l'arbre d'un sort (`spell.progression.nodes[2]`)
   pour obtenir un palier précis. Les fiches n'ont plus d'arbre : un sort se
   lit à son SOCLE, ou à ce qu'un niveau de sort permet d'en faire. Ces deux
   fonctions remplacent l'accès aux nœuds, et rien d'autre.

   Réservé aux specs — l'application n'importe jamais ce fichier.
─────────────────────────────────────────────────────────────────────────── */

/** Le contexte du moteur, bâti sur le vrai catalogue du wiki. */
export function testContext(spells: SpellsService): BuilderContext {
  return {
    rules: DEFAULT_RULES,
    classes: (classCatalog as { key: string; name: string; inspirationPerLevel?: number }[]).map(
      (c) => ({ key: c.key, name: c.name, inspirationPerLevel: c.inspirationPerLevel }),
    ),
    catalog: catalogFrom(spells.all()),
  };
}

/** L'état d'un sort : son XP et son build, comme la fiche les porte. */
export const spellState = (xp = 0, build: SpellState['build'] = null): SpellState => ({
  xp,
  build,
  lastReassignedAt: null,
});

/** L'XP qu'il faut pour amener un sort à ce niveau. */
export const xpForLevel = (level: number): number => xpThreshold(level, DEFAULT_RULES);

/**
 * Le sort à son socle : ce que joue un personnage qui vient de l'apprendre.
 * Remplace l'ancien `spell.progression.nodes[0]`.
 */
export function socle(page: SpellPageData, ctx: BuilderContext): SpellNode {
  const node = builtSpellNode(page.spell, page.domains, undefined, ctx);
  if (!node) throw new Error(`${page.spell.key} ne déclare pas de personnalisation`);
  return node;
}

/**
 * Le sort tel qu'un niveau donné permet de le construire.
 *
 * `params` dit quels curseurs pousser, et de combien de crans — l'équivalent
 * choisi de ce qu'un palier d'arbre imposait. Sans budget suffisant, le moteur
 * refuse le build et le sort retombe à son socle : un test qui monte un
 * curseur doit donc donner le niveau qui le paie.
 */
export function built(
  page: SpellPageData,
  ctx: BuilderContext,
  level: number,
  params: Record<string, number> = {},
): SpellNode {
  const node = builtSpellNode(
    page.spell,
    page.domains,
    spellState(xpForLevel(level), { ...emptyBuild(), params }),
    ctx,
  );
  if (!node) throw new Error(`${page.spell.key} ne déclare pas de personnalisation`);
  return node;
}
