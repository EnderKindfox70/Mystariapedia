/**
 * Générateur de jets déterministe.
 *
 * Le tirage n'a pas d'état caché : la n-ième valeur est une fonction pure de
 * `(seed, n)`. Sérialiser `{ seed, count }` avec la rencontre suffit donc à
 * reprendre une partie exactement là où elle en était — et à rejouer un combat
 * entier pour vérifier un calcul contesté.
 */
export class Rng {
  constructor(
    readonly seed: number,
    /** Nombre de tirages déjà consommés. */
    public count = 0,
  ) {}

  /** Valeur dans [0, 1) pour le n-ième tirage (pure : même n → même valeur). */
  private at(n: number): number {
    let t = (Math.imul(n, 0x6d2b79f5) + this.seed) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Tirage suivant dans [0, 1). */
  next(): number {
    return this.at(++this.count);
  }

  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Un dé à `sides` faces (1 à `sides`). */
  die(sides: number): number {
    return this.int(1, Math.max(1, Math.round(sides)));
  }

  /** Le d20 des jets de toucher et de sauvegarde. */
  d20(): number {
    return this.die(20);
  }

  /** `true` avec une probabilité de `percent` % (0–100). */
  chance(percent: number): boolean {
    if (percent >= 100) return true;
    if (percent <= 0) return false;
    return this.next() * 100 < percent;
  }

  /** Un élément au hasard, ou `undefined` si la liste est vide. */
  pick<T>(items: readonly T[]): T | undefined {
    return items.length ? items[this.int(0, items.length - 1)] : undefined;
  }
}

/** Graine aléatoire pour une nouvelle rencontre. */
export const newSeed = (): number => Math.floor(Math.random() * 0xffffffff);
