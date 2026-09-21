import { Injectable, computed, inject } from '@angular/core';
import classCatalog from '../../../public/resources/json/characters/classes.json';
import { BuilderContext, ClassInfo, DEFAULT_RULES, Rules } from '../combat/spell-customization';
import { catalogFrom } from '../combat/spell-catalog';
import { SpellsService } from './spells.service';

/** Les classes, réduites à ce que le moteur de personnalisation en lit. */
const CLASSES: ClassInfo[] = (
  classCatalog as { key: string; name: string; inspirationPerLevel?: number }[]
).map((c) => ({ key: c.key, name: c.name, inspirationPerLevel: c.inspirationPerLevel }));

export { catalogFrom };

/**
 * Le contexte que réclame le moteur de personnalisation.
 *
 * Il ne porte aucune règle propre : il assemble les trois référentiels que le
 * moteur ne peut pas deviner seul — le barème (`rules`), les classes, et le
 * catalogue des sorts, dont il tire prérequis et domaines investis.
 *
 * Un seul exemplaire pour toute l'application : la fiche de sort, la fiche de
 * personnage et le simulateur doivent juger un build sur les MÊMES bases,
 * sinon l'aperçu d'une fiche cesse de valoir pour la table.
 */
@Injectable({ providedIn: 'root' })
export class BuilderContextService {
  private readonly spells = inject(SpellsService);

  /** Le catalogue ne bouge pas en cours de session : on le bâtit une fois. */
  private readonly catalog = computed(() => catalogFrom(this.spells.all()));

  /** Le contexte de référence, avec le barème par défaut. */
  readonly context = computed<BuilderContext>(() => ({
    rules: DEFAULT_RULES,
    classes: CLASSES,
    catalog: this.catalog(),
  }));

  /** Le même contexte sous un barème modifié — pour comparer deux réglages. */
  withRules(rules: Rules): BuilderContext {
    return { rules, classes: CLASSES, catalog: this.catalog() };
  }
}
