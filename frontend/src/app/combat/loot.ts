import { CarriedItem, WieldSpec } from './combat.types';
import { Rng } from './dice';

/* ──────────────────────────────────────────────────────────────────────────
   FOUILLER LES CORPS

   Le bestiaire porte déjà ce que rendent les bêtes (`loot` : une référence,
   une chance, une fourchette de quantité) ; personne ne s'en servait à table.
   Ce module en tire une **pile** posée sur la dépouille, que le groupe vide
   ensuite ligne par ligne.

   Deux gestes distincts, à dessein :
   - **fouiller** — on jette les dés, une seule fois par corps. Ce qui n'est pas
     tombé n'y est pas, et refouiller ne le fera pas apparaître.
   - **prendre** — on transfère de la pile vers un sac. Rien n'atterrit tout
     seul dans l'inventaire de qui que ce soit : un sac a un poids et un
     propriétaire, c'est au joueur de dire qui porte quoi.

   Le tirage passe par le `Rng` de la rencontre, donc une partie rechargée
   redonne exactement le même butin.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Une entrée de table de butin, figée sur le combattant à sa création.
 *
 * Recopiée depuis la fiche du bestiaire plutôt que relue au moment de la
 * fouille : le moteur est du TypeScript pur, il ne va pas chercher un JSON sur
 * le réseau au milieu d'une action.
 */
export interface LootDrop {
  /** Nom affiché de la ressource. */
  name: string;
  /** Slug de la fiche wiki, pour lier la dépouille à sa page. */
  slug?: string;
  /** Collection du wiki (« natural-resources/remains »…), pour bâtir le lien. */
  collection?: string;
  /** Chance que la ligne tombe (0–100). Absente = systématique. */
  chance?: number;
  min?: number;
  max?: number;
}

/** Une ligne posée sur une dépouille, prête à être prise. */
export interface LootItem {
  name: string;
  qty: number;
  slug?: string;
  collection?: string;
  /**
   * Ce qui fait l'IDENTITÉ de l'objet, quand la ligne vient d'un sac plutôt
   * que d'une table de butin.
   *
   * Une dépouille rend ce qu'elle portait, et ce qu'elle portait était en fer
   * ou était une arme. Perdre ces deux-là au passage rendait le butin inerte :
   * l'épée d'un garde tombé se ramassait, figurait bien au sac, mais ne se
   * dégainait plus et aucun champ magnétique n'avait prise dessus.
   */
  metallic?: boolean;
  weightKg?: number;
  weapon?: WieldSpec;
}

/** Ce qu'une dépouille a rendu, en plus de ses lignes : sa bourse. */
export interface LootPile {
  items: LootItem[];
  gold: number;
}

/**
 * Jette la table de butin d'une créature.
 *
 * Le `Rng` avance d'un tirage par ligne testée, plus un par quantité : c'est
 * volontairement dépensier en tirages, mais parfaitement reproductible.
 */
export function rollDrops(drops: LootDrop[] | undefined, rng: Rng): LootItem[] {
  const out: LootItem[] = [];
  for (const drop of drops ?? []) {
    const chance = drop.chance ?? 100;
    if (!rng.chance(chance)) continue;

    const min = Math.max(1, Math.round(drop.min ?? 1));
    const max = Math.max(min, Math.round(drop.max ?? min));
    const qty = rng.int(min, max);
    if (qty <= 0) continue;

    add(out, { name: drop.name, qty, slug: drop.slug, collection: drop.collection });
  }
  return out;
}

/**
 * Ajoute une quantité à une pile, en fusionnant les lignes de même nom. Sans
 * cette fusion, quatre crocs de loup tombés séparément feraient quatre lignes,
 * et le sac deviendrait illisible après trois combats.
 */
export function add(pile: LootItem[], item: LootItem): LootItem[] {
  const existing = pile.find((l) => l.name === item.name);
  if (existing) existing.qty += item.qty;
  else pile.push({ ...item });
  return pile;
}

/** Retire une quantité d'une pile ; rend ce qui a réellement pu être retiré. */
export function take(pile: LootItem[], name: string, qty: number): number {
  const line = pile.find((l) => l.name === name);
  if (!line) return 0;
  const taken = Math.min(line.qty, Math.max(0, Math.round(qty)));
  line.qty -= taken;
  if (line.qty <= 0) pile.splice(pile.indexOf(line), 1);
  return taken;
}

/**
 * Verse une ligne de butin dans un sac.
 *
 * Le butin entre en `other` : une dépouille n'est ni une munition ni une
 * potion. Elle le deviendra peut-être une fois travaillée, mais pas sur le
 * champ de bataille.
 */
export function pour(bag: CarriedItem[], item: LootItem): void {
  const existing = bag.find((c) => c.name === item.name);
  if (existing) {
    existing.qty += item.qty;
    // Une ligne homonyme déjà présente peut venir d'une saisie à la main, donc
    // sans identité connue. L'arrivée la renseigne.
    existing.metallic ??= item.metallic;
    existing.weightKg ??= item.weightKg;
    existing.weapon ??= item.weapon;
    return;
  }
  bag.push({
    name: item.name,
    qty: item.qty,
    slug: item.slug,
    kind: 'other',
    metallic: item.metallic,
    weightKg: item.weightKg,
    weapon: item.weapon,
  });
}

/**
 * Ce qu'un combattant abandonne derrière lui : tout son sac.
 *
 * Un humanoïde tombé rend ce qu'il portait — c'est la moitié du butin d'une
 * embuscade de bandits, et le bestiaire ne le dira jamais puisque ça vient de
 * sa fiche, pas de son espèce. Les munitions et les potions comprises : elles
 * sont exactement ce qu'un survivant ramasse en premier.
 */
export function carriedAsLoot(bag: CarriedItem[]): LootItem[] {
  return bag.filter((c) => c.qty > 0).map((c) => ({
    name: c.name,
    qty: c.qty,
    slug: c.slug,
    collection: undefined,
    // Ce que l'objet EST survit à son propriétaire.
    metallic: c.metallic,
    weightKg: c.weightKg,
    weapon: c.weapon,
  }));
}

/** Total des lignes d'une pile, pour l'affichage (« 7 pièces »). */
export const pileSize = (pile: LootItem[] | undefined): number =>
  (pile ?? []).reduce((sum, l) => sum + l.qty, 0);
