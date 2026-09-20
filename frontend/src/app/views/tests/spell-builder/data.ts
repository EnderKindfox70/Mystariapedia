/* Données du banc d'essai : les COPIES de sorts et les joueurs types, plus ce
   que le moteur a besoin de lire du wiki réel (catalogue des sorts, statuts,
   classes). Ajouter une copie = déposer le JSON dans `data/spells/` et
   l'importer ici. Le wiki, lui, ne lit jamais ces copies. */

import statusCatalog from '../../../../../public/resources/json/status_effects.json';
import classCatalog from '../../../../../public/resources/json/characters/classes.json';
import damageTypeCatalog from '../../../../../public/resources/json/damage_type.json';
import { SpellPageData } from '../../../wiki.types';
import {
  BuilderContext,
  CatalogEntry,
  ClassInfo,
  CustomizableSpell,
  CustomizingPlayer,
  DEFAULT_RULES,
  Rules,
} from '../../../combat/spell-customization';

/** Une copie de test : un sort personnalisable, plus d'où il vient. */
export interface TestSpell extends CustomizableSpell {
  _test?: string;
  _notes?: string[];
  source: { file: string; key: string; rootNode: string; capNode: string };
  description: string;
  subdomains: string[];
  power?: string;
}

/** Un joueur type : un personnage, plus sa note de test. */
export interface TestPlayer extends CustomizingPlayer {
  _test?: string;
  default?: boolean;
}

import fireEmbers from './data/spells/fire-embers.json';
import fireEchauffement from './data/spells/fire-echauffement.json';
import darknessFils from './data/spells/darkness-fils-du-marionnettiste.json';
import lifeEtincelle from './data/spells/life-etincelle-vitale.json';
import electricityAttire from './data/spells/electricity-attire-metal.json';
import comboLave from './data/spells/combo-coulee-de-lave.json';
import plantToxine from './data/spells/plant-toxine-vegetale.json';

import ignis from './data/players/ignis.json';
import brenn from './data/players/brenn.json';
import seve from './data/players/seve.json';

export const TEST_SPELLS = [
  fireEmbers,
  fireEchauffement,
  darknessFils,
  lifeEtincelle,
  electricityAttire,
  comboLave,
  plantToxine,
] as unknown as TestSpell[];

export const TEST_PLAYERS = [ignis, brenn, seve] as unknown as TestPlayer[];

export const STATUSES: { key: string; name: string }[] = statusCatalog.status_effects.map((s) => ({ key: s.key, name: s.name }));

export const CLASSES: ClassInfo[] = (classCatalog as { key: string; name: string; inspirationPerLevel?: number }[]).map((c) => ({
  key: c.key,
  name: c.name,
  inspirationPerLevel: c.inspirationPerLevel,
}));

export const DAMAGE_TYPES: string[] = damageTypeCatalog.specific_damage_types.map((d) => d.name);

/** Catalogue `clé → sort` bâti sur l'index de `SpellsService` : les vrais sorts du wiki. */
export function catalogFrom(pages: SpellPageData[]): Record<string, CatalogEntry> {
  return Object.fromEntries(pages.map((p) => [p.spell.key, { name: p.spell.name, level: p.spell.level, domains: p.domains }]));
}

export function builderContext(pages: SpellPageData[], rules: Rules = DEFAULT_RULES): BuilderContext {
  return { rules, classes: CLASSES, catalog: catalogFrom(pages) };
}
