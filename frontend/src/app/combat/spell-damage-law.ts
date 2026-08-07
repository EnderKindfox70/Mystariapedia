/* ──────────────────────────────────────────────────────────────────────────
   LA LOI DES DÉGÂTS.

   L'économie du mana (`spell-economy.ts`) dit ce qu'un sort doit COÛTER. Celle-ci
   dit ce qu'il doit FAIRE. Les deux sont nécessaires : un sort correctement
   tarifé peut rester absurdement mortel, et c'était le cas — l'audit a trouvé
   210 nœuds de dégâts dont **86 % au-dessus de la cible**, avec une médiane à
   74 % des points de vie de la cible en un seul coup.

   LE NOMBRE QUI GOUVERNE TOUT. Un combat doit durer quatre à six échanges, donc
   un coup doit retirer environ un cinquième des points de vie de sa cible :

       dégâts ≈ 0,20 × PV de la cible

   Tout le reste n'est que la traduction de cette ligne, niveau par niveau.

   POURQUOI UNE LOI ET NON DES VALEURS À LA MAIN. Les dégâts d'un sort valent
   `dés + ratio × attaque du lanceur`, et l'attaque croît deux fois plus vite que
   les points de vie sur les premiers niveaux. Un ratio qui semble raisonnable à
   la lecture d'une fiche devient mortel dix niveaux plus loin. Aucune relecture
   humaine ne rattrape ça sur 210 nœuds ; une loi et un test, si.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Points de vie d'un personnage, niveau par niveau.
 *
 * Relevés sur les VRAIES fiches sauvegardées, pas déduits d'une formule : c'est
 * contre ces valeurs-là que les combats se jouent. Les niveaux absents sont
 * interpolés.
 */
export const HP_CURVE: Record<number, number> = {
  1: 15,
  2: 18,
  3: 22,
  5: 27,
  7: 35,
  10: 48,
  15: 69,
  20: 100,
};

/** PV de référence à un niveau donné, interpolés entre les points relevés. */
export function referenceHp(level: number): number {
  const levels = Object.keys(HP_CURVE).map(Number).sort((a, b) => a - b);
  if (level <= levels[0]) return HP_CURVE[levels[0]];
  if (level >= levels[levels.length - 1]) return HP_CURVE[levels[levels.length - 1]];
  for (let i = 0; i < levels.length - 1; i++) {
    const [bas, haut] = [levels[i], levels[i + 1]];
    if (level >= bas && level <= haut) {
      const part = (level - bas) / (haut - bas);
      return Math.round(HP_CURVE[bas] + part * (HP_CURVE[haut] - HP_CURVE[bas]));
    }
  }
  return HP_CURVE[levels[levels.length - 1]];
}

/**
 * Rapport attaque / points de vie, par tranche de niveau.
 *
 * Mesuré, et c'est la donnée la plus importante du fichier : l'attaque vaut
 * presque le double des PV dès le niveau 7. Un ratio de scaling `r` produit donc
 * des dégâts valant `r × 1,8` des PV de la cible — ce qui rend mortel tout ce qui
 * dépasse 0,15, et explique à lui seul l'état des fiches.
 */
export function referenceAttack(level: number): number {
  const hp = referenceHp(level);
  const facteur = level < 3 ? 0.9 : level < 7 ? 1.4 : 1.8;
  return hp * facteur;
}

/** Part des PV de la cible qu'un coup doit retirer : un combat de 4 à 6 échanges. */
export const TARGET_HP_SHARE = 0.2;

/** Niveaux écoulés, en moyenne, entre deux paliers d'un même sort. */
export const LEVELS_PER_TIER = 3;

/**
 * Niveau auquel un palier se joue réellement.
 *
 * Un palier V ne s'atteint pas le jour où l'on apprend le sort : il s'achète des
 * niveaux plus tard. Le juger contre les PV du niveau d'accès le condamnerait
 * injustement — et l'y calibrer le rendrait ridicule quand on y arrive.
 */
export const tierPlayedAt = (spellLevel: number, tier: number): number =>
  spellLevel + LEVELS_PER_TIER * Math.max(0, tier - 1);

/**
 * Ce qu'il reste du scaling à ce palier, érosion comprise.
 *
 * La loi DOIT connaître la règle du moteur (`scalingFalloff`) : sans elle, les
 * ratios calculés ici seraient systématiquement sous-évalués aux hauts paliers,
 * puisque le moteur en rogne une part au moment de frapper.
 */
export const tierFalloff = (spellLevel: number, tier: number): number =>
  1 / (1 + (tierPlayedAt(spellLevel, tier) - spellLevel) / 10);

/**
 * Ce que vaut une forme de zone.
 *
 * Une zone frappe plusieurs cibles : à dégâts égaux elle rapporte davantage, donc
 * elle doit frapper moins fort. C'est le même arbitrage que dans l'économie du
 * mana, avec la même conclusion.
 */
export function shapeShare(area: string | undefined): number {
  const texte = (area ?? '').toLowerCase();
  if (/rayon|cône|cone|ligne|zone|autour/.test(texte)) return 0.6;
  return 1;
}

/**
 * Part des dégâts portée par les DÉS plutôt que par le scaling.
 *
 * Majoritaire à dessein : les dés sont la puissance propre du sort, celle que la
 * fiche annonce et qui ne s'érode pas. Laisser le scaling dominer ferait d'un
 * sort un simple multiplicateur de la stat du lanceur, et c'est précisément ce
 * qui rendait un sort d'apprenti mortel entre les mains d'une archimage.
 */
export const DICE_SHARE = 0.6;

/** Écart entre le minimum et le maximum des dés, autour de leur moyenne. */
export const DICE_SPREAD = 0.25;

/**
 * Prime accordée à un sort de combinaison.
 *
 * Une combinaison exige d'avoir investi dans DEUX domaines et d'y avoir monté
 * les sorts requis. Ce n'est pas un sort de plus, c'est l'aboutissement de deux
 * arbres : lui donner le même budget qu'à un sort ordinaire du même niveau
 * reviendrait à punir l'investissement.
 */
export const COMBO_PREMIUM = 1.5;

/** Ce qu'un nœud devrait infliger, et comment le répartir. */
export interface DamageBudget {
  /** Niveau auquel ce palier se joue. */
  playedAt: number;
  /** Dégâts totaux visés à ce niveau. */
  total: number;
  diceMin: number;
  diceMax: number;
  /** Somme des ratios de scaling sur les attaques. */
  ratio: number;
}

/** Le budget de dégâts d'un nœud, déduit de son niveau d'accès et de son palier. */
export function damageBudget(
  spellLevel: number,
  tier: number,
  area?: string,
  combo = false,
): DamageBudget {
  const playedAt = tierPlayedAt(spellLevel, tier);
  const total =
    TARGET_HP_SHARE * referenceHp(playedAt) * shapeShare(area) * (combo ? COMBO_PREMIUM : 1);

  const diceAvg = total * DICE_SHARE;
  const scaled = total * (1 - DICE_SHARE);
  return {
    playedAt,
    total,
    diceMin: Math.max(1, Math.round(diceAvg * (1 - DICE_SPREAD))),
    diceMax: Math.max(2, Math.round(diceAvg * (1 + DICE_SPREAD))),
    // On divise par l'érosion : le moteur en reprendra sa part au moment de
    // frapper, et le nœud doit atteindre sa cible APRÈS ce prélèvement.
    ratio:
      Math.round(
        (scaled / (referenceAttack(playedAt) * tierFalloff(spellLevel, tier))) * 100,
      ) / 100,
  };
}

/** Ce qu'un nœud inflige réellement, tel qu'il est écrit. */
export function actualDamage(
  spellLevel: number,
  tier: number,
  diceMin: number,
  diceMax: number,
  ratio: number,
): number {
  const playedAt = tierPlayedAt(spellLevel, tier);
  return (
    (diceMin + diceMax) / 2 + ratio * referenceAttack(playedAt) * tierFalloff(spellLevel, tier)
  );
}

/**
 * Marge tolérée autour de la loi.
 *
 * Large à dessein : un sort a le droit d'être une signature, et figer 210 nœuds
 * sur une formule au dixième près produirait un jeu sans relief. Ce qu'on
 * interdit, ce sont les ordres de grandeur — pas les écarts d'intention.
 */
export const DAMAGE_TOLERANCE = { min: 0.5, max: 1.8 } as const;

/** Le verdict porté sur un nœud. */
export interface DamageVerdict {
  budget: DamageBudget;
  actual: number;
  /** Rapport entre ce qui est écrit et ce que la loi prévoit. */
  factor: number;
  verdict: 'ok' | 'trop-fort' | 'trop-faible';
}

export function auditDamage(
  spellLevel: number,
  tier: number,
  diceMin: number,
  diceMax: number,
  ratio: number,
  area?: string,
  combo = false,
): DamageVerdict {
  const budget = damageBudget(spellLevel, tier, area, combo);
  const actual = actualDamage(spellLevel, tier, diceMin, diceMax, ratio);
  const factor = budget.total > 0 ? actual / budget.total : 1;
  return {
    budget,
    actual,
    factor,
    verdict:
      factor > DAMAGE_TOLERANCE.max ? 'trop-fort' : factor < DAMAGE_TOLERANCE.min ? 'trop-faible' : 'ok',
  };
}
