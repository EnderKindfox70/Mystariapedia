import { nourishmentOf } from './survival';

/* ──────────────────────────────────────────────────────────────────────────
   LES OBJETS À PLUSIEURS USAGES

   Un lot de rations de voyage, c'est sept jours de vivres ; un flacon de sels
   odorants, trois doses ; un sachet de sel de conservation, cinq dépouilles.
   Manger une journée ne fait pas disparaître le lot : on l'ENTAME.

   Le sac compte donc deux choses sur une même ligne :
   - `qty`, les exemplaires (lots, flacons, sachets) — ce que le wiki vend et
     ce que la fiche écrit ;
   - `usesLeft`, ce qui reste dans l'exemplaire entamé. Absent, il est intact.

   Un seul exemplaire est entamé à la fois : on finit un flacon avant d'ouvrir
   le suivant. C'est ce qui permet de tout ramener à un total d'usages et de le
   redécouper, quand deux lignes se rejoignent.
─────────────────────────────────────────────────────────────────────────── */

/** Ce qu'il faut savoir d'une ligne pour compter ses usages. */
export interface UsesCarrier {
  name: string;
  slug?: string;
  qty: number;
  /** Usages par exemplaire, quand le catalogue en déclare plusieurs. */
  usesPer?: number;
  /** Usages restants de l'exemplaire entamé ; absent = intact. */
  usesLeft?: number;
}

/**
 * Usages que contient un exemplaire. Le catalogue le dit pour ce qu'il connaît
 * (`usesPer`, posé par la fabrique) ; les vivres le disent d'eux-mêmes, pour
 * qu'une ration rapportée de la chasse — hors catalogue — se compte pareil.
 */
export function usesPerOf(line: Pick<UsesCarrier, 'name' | 'slug' | 'usesPer'>): number {
  return Math.max(1, Math.round(line.usesPer ?? nourishmentOf(line)?.uses ?? 1));
}

/** Tout ce que la ligne peut encore servir, exemplaire entamé compris. */
export function remainingUses(line: UsesCarrier): number {
  const qty = Math.max(0, Math.round(line.qty));
  if (qty <= 0) return 0;
  const per = usesPerOf(line);
  const open = Math.min(per, Math.max(1, Math.round(line.usesLeft ?? per)));
  return (qty - 1) * per + open;
}

/** Redécoupe un total d'usages en exemplaires, le dernier seul entamé. */
function setRemaining(line: UsesCarrier, total: number, per: number): void {
  const uses = Math.max(0, Math.round(total));
  line.qty = Math.ceil(uses / per);
  const open = uses - (line.qty - 1) * per;
  if (line.qty > 0 && open < per) line.usesLeft = open;
  else delete line.usesLeft;
}

/**
 * Dépense UN usage. Rend `true` quand l'exemplaire s'est vidé — c'est là, et
 * là seulement, qu'une outre devient une outre vide.
 *
 * La ligne n'est jamais retirée du sac ici : c'est à l'appelant de décider si
 * une ligne à zéro reste visible (un carquois vide) ou disparaît (une ration
 * finie).
 */
export function spendUse(line: UsesCarrier): boolean {
  if (line.qty <= 0) return false;
  const per = usesPerOf(line);
  const left = Math.min(per, line.usesLeft ?? per);
  if (per > 1 && left > 1) {
    line.usesLeft = left - 1;
    return false;
  }
  line.qty -= 1;
  delete line.usesLeft;
  return true;
}

/**
 * Verse `qty` exemplaires dans une ligne déjà présente. `usesLeft` décrit le
 * dernier exemplaire versé, s'il était entamé.
 *
 * Deux flacons entamés qui se retrouvent dans le même sac ne font pas deux
 * flacons entamés : on transvase, et il en reste un plein et un entamé — ou un
 * seul, si les deux fonds tenaient ensemble.
 */
export function absorbUses(
  into: UsesCarrier,
  qty: number,
  usesLeft?: number,
  usesPer?: number,
): void {
  into.usesPer ??= usesPer;
  const per = usesPerOf(into);
  if (per <= 1 || (into.usesLeft === undefined && usesLeft === undefined)) {
    into.qty += qty;
    return;
  }
  const incoming = remainingUses({ name: into.name, slug: into.slug, qty, usesPer: per, usesLeft });
  setRemaining(into, remainingUses(into) + incoming, per);
}

/**
 * Ce qui part quand on retire `moved` exemplaires d'une ligne qui en avait
 * `before` : l'exemplaire entamé ne suit que si TOUT part. On donne les pleins
 * d'abord, comme on le ferait à la main.
 */
export const usesLeftMoving = (
  line: Pick<UsesCarrier, 'usesLeft'>,
  moved: number,
  before: number,
): number | undefined => (moved >= before ? line.usesLeft : undefined);

/**
 * Ce qu'il reste, en clair : « 5/7 » pour un lot entamé, rien pour un objet à
 * usage unique ou un exemplaire intact.
 */
export function usesLabel(line: UsesCarrier): string {
  const per = usesPerOf(line);
  if (per <= 1 || line.qty <= 0 || line.usesLeft === undefined) return '';
  return `${line.usesLeft}/${per}`;
}
