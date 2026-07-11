import { Injectable } from '@angular/core';
import damageData from '../../../public/resources/json/damage_type.json';

/** Catégorie générale d'un type de dégâts, pour le style. */
export type DamageGeneral = 'physical' | 'magical' | 'true';

/** Type de dégâts résolu, prêt à afficher. */
export interface ResolvedDamageType {
  key: string;
  /** Libellé français du type spécifique (ex. « Feu »). */
  label: string;
  /** Catégorie générale (physical / magical / true). */
  general: DamageGeneral;
  /** Libellé français de la catégorie (ex. « Magique »). */
  generalLabel: string;
}

/** Libellés FR des types spécifiques (clés = `name` de damage_type.json). */
const LABELS: Record<string, string> = {
  bludgeoning: 'Contondant',
  piercing: 'Perforant',
  slashing: 'Tranchant',
  fire: 'Feu',
  ice: 'Glace',
  lightning: 'Foudre',
  water: 'Eau',
  earth: 'Terre',
  wind: 'Vent',
  plant: 'Végétal',
  dark: 'Ténèbres',
  light: 'Lumière',
  life: 'Vie',
  death: 'Mort',
  space: 'Espace',
  time: 'Temps',
};

const GENERAL_KEY: Record<string, DamageGeneral> = {
  Physical: 'physical',
  Magical: 'magical',
  True: 'true',
};
const GENERAL_LABEL: Record<DamageGeneral, string> = {
  physical: 'Physique',
  magical: 'Magique',
  true: 'Absolu',
};

/**
 * Catalogue des types de dégâts (damage_type.json). Résout un type spécifique
 * (« fire », « ice »…) en libellé français + catégorie générale pour l'affichage.
 */
@Injectable({ providedIn: 'root' })
export class DamageTypesService {
  private readonly index = this.build();

  private build(): Map<string, ResolvedDamageType> {
    const generalById = new Map<number, string>(
      damageData.general_damage_types.map((g) => [g.id, g.name])
    );
    const map = new Map<string, ResolvedDamageType>();
    for (const s of damageData.specific_damage_types) {
      const generalName = generalById.get(s.general_damage_type_id) ?? 'Magical';
      const general = GENERAL_KEY[generalName] ?? 'magical';
      map.set(s.name, {
        key: s.name,
        label: LABELS[s.name] ?? s.name,
        general,
        generalLabel: GENERAL_LABEL[general],
      });
    }
    return map;
  }

  /** Résout un type de dégâts, ou `undefined` si inconnu. */
  resolve(name: string | undefined | null): ResolvedDamageType | undefined {
    return name ? this.index.get(name) : undefined;
  }
}
