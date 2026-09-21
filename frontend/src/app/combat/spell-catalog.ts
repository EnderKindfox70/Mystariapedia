import { SpellPageData } from '../wiki.types';
import { CatalogEntry } from './spell-customization';

/**
 * Ce que le moteur doit savoir des AUTRES sorts : leur nom, leur niveau, leurs
 * domaines. De quoi résoudre un prérequis et juger un domaine investi.
 *
 * Fonction pure, volontairement hors du service Angular qui l'expose : les
 * specs du moteur tournent sans runtime Angular, et importer un `@Injectable`
 * depuis l'un d'eux suffit à réclamer le compilateur JIT.
 */
export function catalogFrom(pages: SpellPageData[]): Record<string, CatalogEntry> {
  return Object.fromEntries(
    pages.map((p) => [
      p.spell.key,
      { name: p.spell.name, level: p.spell.level, domains: p.domains },
    ]),
  );
}
