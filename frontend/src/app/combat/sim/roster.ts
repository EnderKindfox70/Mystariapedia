import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CharacterSheet } from '../../character/character.types';
import { BestiaryEntry } from '../../wiki.types';
import { Combatant, Encounter, GridPos, Team } from '../combat.types';
import { CombatantFactory } from '../combatant-factory';
import { emptyEncounter } from '../encounter';
import { fromRoot } from './paths';
import { provideFileSystemWiki } from './wiki-fs';

/* ──────────────────────────────────────────────────────────────────────────
   LE PLATEAU — monter des combattants réels et les poser face à face.

   Le banc d'essai ne vaut que par ce qu'il fait combattre. On refuse ici toute
   fiche inventée : les personnages viennent des sauvegardes du serveur, les
   bêtes du bestiaire livré. Une valeur mal calibrée sur une vraie fiche doit
   apparaître dans le rapport, et une fiction de test la masquerait.
─────────────────────────────────────────────────────────────────────────── */

/** Une sauvegarde du serveur, telle qu'elle est rangée dans `sheets.json`. */
interface StoredSheet {
  id: string;
  data: CharacterSheet;
}

/**
 * Les fiches sauvegardées, portraits ôtés.
 *
 * Les portraits sont des images encodées en base64 de plusieurs dizaines de
 * kilo-octets. Le moteur recopie la rencontre entière à CHAQUE action : les
 * traîner ferait passer une série de mille combats de quelques secondes à
 * plusieurs minutes, pour une donnée que personne ne lit ici.
 */
export function storedSheets(): { id: string; sheet: CharacterSheet }[] {
  const raw = readFileSync(fromRoot('backend/data/sheets.json'), 'utf8');
  return (JSON.parse(raw) as StoredSheet[])
    .filter((row) => row.data?.identity?.name)
    .map((row) => ({
      id: row.id,
      sheet: {
        ...row.data,
        identity: { ...row.data.identity, portrait: '', fullImage: '' },
      },
    }));
}

/** Le bestiaire livré, fiche par fiche. */
export function bestiary(): BestiaryEntry[] {
  const dir = fromRoot('frontend/public/resources/json/bestiary');
  const index = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as { slug: string }[];
  return index
    .map((entry) => {
      try {
        return JSON.parse(readFileSync(resolve(dir, `${entry.slug}.json`), 'utf8')) as BestiaryEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is BestiaryEntry => !!e);
}

/**
 * Une fabrique branchée sur les fichiers du wiki, catalogues chargés.
 *
 * `load()` est asynchrone par signature mais synchrone en fait : le backend
 * disque répond dans l'instant, donc l'abonnement se résout avant de rendre la
 * main. C'est ce qui permet de rester dans un test synchrone.
 */
export function loadedFactory(): CombatantFactory {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideFileSystemWiki()] });
  const factory = TestBed.inject(CombatantFactory);
  factory.load().subscribe();
  if (!factory.ready()) {
    throw new Error('Catalogues du wiki non chargés : le banc d’essai mesurerait des fiches vides.');
  }
  return factory;
}

/* ── Montage d'une rencontre ───────────────────────────────────────────────── */

/** Un camp : les combattants d'un côté du terrain. */
export type Side = (factory: CombatantFactory, team: Team, pos: GridPos) => Combatant[];

/** Un camp fait d'une fiche de personnage. */
export const sheetSide =
  (sheet: CharacterSheet): Side =>
  (factory, team, pos) =>
    [factory.fromSheet(sheet, team, pos)];

/** Un camp fait de `count` exemplaires d'une même bête, alignés. */
export const beastSide =
  (entry: BestiaryEntry, count = 1): Side =>
  (factory, team, pos) =>
    Array.from({ length: count }, (_, i) =>
      factory.fromBestiary(entry, team, { x: pos.x, y: pos.y + i }, i + 1),
    );

export interface ArenaSetup {
  /** Largeur du terrain, en cases. La distance de départ, donc. */
  width?: number;
  height?: number;
  seed: number;
}

/**
 * Deux camps face à face sur un terrain nu.
 *
 * Le terrain est vide À DESSEIN : on mesure ici les fiches, pas le décor. Un
 * couvert ou un gouffre changerait tout, mais changerait tout DIFFÉREMMENT
 * pour chaque affrontement, et le rapport ne saurait plus ce qu'il compare.
 */
export function arena(
  factory: CombatantFactory,
  left: Side,
  right: Side,
  setup: ArenaSetup,
): Encounter {
  const width = setup.width ?? 16;
  const height = setup.height ?? 10;

  const enc = emptyEncounter('Banc d’essai');
  enc.grid = { width, height };
  enc.seed = setup.seed;
  enc.combatants = [
    ...left(factory, 'allies', { x: 1, y: Math.floor(height / 2) }),
    ...right(factory, 'ennemis', { x: width - 2, y: Math.floor(height / 2) }),
  ];
  return enc;
}
