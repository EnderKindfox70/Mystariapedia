import { Injectable } from '@angular/core';
import statusData from '../../../public/resources/json/status_effects.json';
import { StatusEffect } from '../wiki.types';

/**
 * Catalogue des effets de statut (brûlure, poison, paralysie, rage…).
 *
 * Charge `status_effects.json` une fois et l'indexe par `key`, pour que les
 * sorts puissent référencer un statut par sa clé et afficher ses détails
 * (effet mécanique, dégâts par tour, durée, condition de fin).
 */
@Injectable({ providedIn: 'root' })
export class StatusEffectsService {
  private readonly index = new Map<string, StatusEffect>(
    (statusData.status_effects as unknown as StatusEffect[]).map((s) => [s.key, s])
  );

  /** Un statut par sa clé, ou `undefined` si inconnu. */
  byKey(key: string): StatusEffect | undefined {
    return this.index.get(key);
  }

  /** Tous les statuts du catalogue. */
  all(): StatusEffect[] {
    return [...this.index.values()];
  }
}
