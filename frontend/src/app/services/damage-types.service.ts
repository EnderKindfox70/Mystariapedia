import { Injectable } from '@angular/core';
import damageData from '../../../public/resources/json/damage_type.json';
import { DAMAGE_LABELS, WEAPON_DAMAGE_TYPE } from '../combat/damage-labels';

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
  /**
   * Explication à montrer au survol, pour un type qui ne se lit pas tout seul.
   *
   * Un type ordinaire n'en a pas besoin : « Feu » se comprend. Mais un type qui
   * ne DÉSIGNE pas une nature — celui qui renvoie à l'arme portée — doit dire
   * de quoi il dépend, sinon la fiche annonce des dégâts que rien n'explique.
   */
  hint?: string;
}

/** Libellés FR des types spécifiques (clés = `name` de damage_type.json). */

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
        label: DAMAGE_LABELS[s.name] ?? s.name,
        general,
        generalLabel: GENERAL_LABEL[general],
      });
    }
    // Le marqueur des revêtements sans nature propre (Renforcement) n'est pas un
    // type du catalogue : il DÉSIGNE celui de l'arme nimbée, et se résout au
    // moment du coup. La fiche doit quand même savoir l'écrire.
    map.set(WEAPON_DAMAGE_TYPE, {
      key: WEAPON_DAMAGE_TYPE,
      label: DAMAGE_LABELS[WEAPON_DAMAGE_TYPE],
      general: 'physical',
      generalLabel: GENERAL_LABEL['physical'],
      hint: 'Les dégâts supplémentaires dépendent de votre arme : ils prennent son type. Une lame tranche, une masse écrase.',
    });
    return map;
  }

  /** Résout un type de dégâts, ou `undefined` si inconnu. */
  resolve(name: string | undefined | null): ResolvedDamageType | undefined {
    return name ? this.index.get(name) : undefined;
  }
}
