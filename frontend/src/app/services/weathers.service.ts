import { Injectable } from '@angular/core';
import weatherData from '../../../public/resources/json/weathers.json';
import { Weather } from '../wiki.types';

/**
 * Catalogue des météos (tempête, blizzard, pluie…). Une météo invoquée par un
 * sort applique des statuts de zone, module le coût des sorts d'un domaine et
 * peut infliger des dégâts aléatoires.
 */
@Injectable({ providedIn: 'root' })
export class WeathersService {
  private readonly index = new Map<string, Weather>(
    (weatherData.weathers as unknown as Weather[]).map((w) => [w.key, w])
  );

  /** Une météo par sa clé, ou `undefined`. */
  byKey(key: string): Weather | undefined {
    return this.index.get(key);
  }

  /** Toutes les météos. */
  all(): Weather[] {
    return [...this.index.values()];
  }
}
