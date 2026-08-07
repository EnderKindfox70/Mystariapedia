import { inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap, tap } from 'rxjs';
import damageCatalog from '../../../public/resources/json/damage_type.json';
import entityTypeCatalog from '../../../public/resources/json/entity_type.json';
import traitCatalog from '../../../public/resources/json/trait.json';
import {
  AttributeKey,
  BackgroundDef,
  CharacterSheet,
  ClassDef,
  RaceDef,
  StatKey,
} from '../character/character.types';
import {
  abilityModifier,
  computeAttributes,
  computeStats,
  EQUIPMENT_SLOTS,
  grantedTraits,
} from '../character/universe-data';
import { SpellsService } from '../services/spells.service';
import { StatusEffectsService } from '../services/status-effects.service';
import { WikiLoaderService } from '../services/wiki-loader-service';
import {
  AmmunitionEntry,
  ArmorEntry,
  BestiaryEntry,
  PotionEntry,
  ResourceIndexEntry,
  WeaponEntry,
} from '../wiki.types';
import {
  AmmunitionSource,
  classSkillsFor,
  consumableAbility,
  ConsumableSource,
  creatureAbility,
  guardAbility,
  naturalControlAbility,
  naturalMeleeAbility,
  spellAbilities,
  unarmedAbility,
  unarmedRatioFor,
  usesAmmunition,
  weaponAbility,
  WeaponSource,
} from './abilities';
import {
  Affinities,
  CarriedItem,
  Combatant,
  CombatAbility,
  GridPos,
  Team,
} from './combat.types';

/* ──────────────────────────────────────────────────────────────────────────
   FABRIQUE DE COMBATTANTS

   Une fiche de personnage et une entrée de bestiaire n'ont rien en commun :
   l'une calcule ses stats à partir d'une race, d'une classe et d'un niveau,
   l'autre les lit sur son type d'entité. Ce service est le point où les deux
   deviennent la même chose — un `Combatant` que le moteur sait faire jouer.

   Les stats sont FIGÉES à la création : une fiche modifiée ailleurs ne doit pas
   changer un combat en cours sous les pieds de la table.
─────────────────────────────────────────────────────────────────────────── */

const WEAPON_COLLECTIONS = ['weapons/melee', 'weapons/ranged'];
const ARMOR_COLLECTIONS = ['weapons/armor', 'weapons/shield'];
const AMMUNITION_COLLECTION = 'weapons/ammunition';
const POTION_COLLECTION = 'potions';

/**
 * Munitions accordées d'office quand la fiche n'en porte pas au sac.
 * L'inventaire d'une fiche est du texte libre : beaucoup d'archers y ont un arc
 * sans jamais avoir écrit « Flèches ». Plutôt que de les laisser incapables de
 * tirer, on part d'un carquois plein — et le décompte, lui, est bien réel.
 */
const DEFAULT_AMMO_QTY = 20;

/** Emplacement d'une pièce d'armure → emplacement d'équipement de la fiche. */
const PIECE_TO_EQUIP_SLOT: Record<string, string> = {
  head: 'head',
  body: 'chest',
  chest: 'chest',
  legs: 'legs',
  feet: 'feet',
  offhand: 'offhand',
  shield: 'offhand',
};

/** Empreinte au sol en cases, par taille du bestiaire. */
const FOOTPRINT_BY_SIZE: Record<string, number> = { TP: 1, P: 1, M: 1, G: 2, TG: 3 };

/** Libellés FR des types d'entité, alignés sur ceux du codex du bestiaire. */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  bestial: 'Bestial',
  arcane: 'Arcane',
  undead: 'Mort-vivant',
  elemental: 'Élémentaire',
  construct: 'Créature artificielle',
  abberation: 'Aberration',
};

/** Abréviation d'attribut du bestiaire → clé du modèle. */
const ATTRIBUTE_BY_SHORT: Record<string, AttributeKey> = {
  FOR: 'force',
  DEX: 'dexterite',
  CON: 'constitution',
  INT: 'intelligence',
  SAG: 'sagesse',
  CHA: 'charisme',
};

const DAMAGE_TYPE_BY_ID = new Map<number, string>(
  damageCatalog.specific_damage_types.map((t) => [t.id, t.name]),
);

const TRAIT_BY_ID = new Map<number, { name: string; description: string }>(
  (traitCatalog.traits as { id: number; name: string; description: string }[]).map((t) => [
    t.id,
    t,
  ]),
);

const EMPTY_AFFINITIES = (): Affinities => ({
  immunities: [],
  resistances: [],
  weaknesses: [],
  absorptions: [],
});

/** Contribution d'un objet équipé aux défenses. */
interface EquipmentStat {
  physicalArmor: number;
  magicalProtection: number;
  /** Résistances/faiblesses accordées par le set dont la pièce provient. */
  resistances: string[];
  weaknesses: string[];
}

let counter = 0;
/** Identifiant unique d'un combattant dans la rencontre. */
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${counter++}`;

@Injectable({ providedIn: 'root' })
export class CombatantFactory {
  private readonly wiki = inject(WikiLoaderService);
  private readonly spells = inject(SpellsService);

  /** Armes du wiki, indexées par nom. */
  private readonly weaponsByName = new Map<string, WeaponSource>();
  /** Munitions du wiki, dans l'ordre du catalogue. */
  private readonly ammunition: AmmunitionSource[] = [];
  /** Consommables (potions) indexés par nom, pour reconnaître les lignes du sac. */
  private readonly consumablesByName = new Map<string, ConsumableSource>();
  /** Nom FR d'un statut → sa clé, pour lire les purges écrites sur les fioles. */
  private readonly statusKeys = new Map<string, string>(
    inject(StatusEffectsService)
      .all()
      .map((s) => [s.name.toLowerCase(), s.key]),
  );
  /** Pièces d'équipement (défenses + affinités), indexées par nom. */
  private readonly equipmentByName = new Map<string, EquipmentStat>();

  private readonly races = signal<RaceDef[]>([]);
  private readonly classes = signal<ClassDef[]>([]);
  private readonly backgrounds = signal<BackgroundDef[]>([]);

  /** Les catalogues sont-ils prêts ? La vue attend ce signal avant d'ajouter. */
  readonly ready = signal(false);

  /**
   * Charge une fois les catalogues dont dépend la conversion (armes, armures,
   * races, classes). Idempotent : les appels suivants sont immédiats.
   */
  load(): Observable<void> {
    if (this.ready()) return of(void 0);

    const weapons$ = forkJoin(
      WEAPON_COLLECTIONS.map((col) =>
        this.wiki.loadAll<ResourceIndexEntry>(col).pipe(
          catchError(() => of([] as ResourceIndexEntry[])),
          switchMap((index) =>
            index.length
              ? forkJoin(
                  index.map((e) =>
                    this.wiki.load<WeaponEntry>(col, e.slug).pipe(
                      map((w) => ({
                        name: w.name || e.name,
                        slug: e.slug,
                        minDamage: w.minDamage ?? e.minDamage ?? 1,
                        maxDamage: w.maxDamage ?? e.maxDamage ?? 3,
                        weaponCategory: w.weaponCategory ?? e.weaponCategory,
                      })),
                      catchError(() => of(null)),
                    ),
                  ),
                )
              : of([] as (WeaponSource | null)[]),
          ),
        ),
      ),
    ).pipe(map((lists) => lists.flat().filter((w): w is WeaponSource => !!w)));

    const armor$ = forkJoin(
      ARMOR_COLLECTIONS.map((col) =>
        this.wiki.loadAll<ResourceIndexEntry>(col).pipe(
          catchError(() => of([] as ResourceIndexEntry[])),
          switchMap((index) =>
            index.length
              ? forkJoin(
                  index.map((e) =>
                    this.wiki.load<ArmorEntry>(col, e.slug).pipe(catchError(() => of(null))),
                  ),
                )
              : of([] as (ArmorEntry | null)[]),
          ),
        ),
      ),
    ).pipe(map((lists) => lists.flat().filter((a): a is ArmorEntry => !!a)));

    // Munitions : c'est leur `compatibleWith` qui dit à quelles armes elles vont,
    // donc l'appariement se déduit du catalogue et n'est écrit nulle part ici.
    const ammunition$ = this.wiki.loadAll<ResourceIndexEntry>(AMMUNITION_COLLECTION).pipe(
      catchError(() => of([] as ResourceIndexEntry[])),
      switchMap((index) =>
        index.length
          ? forkJoin(
              index.map((e) =>
                this.wiki
                  .load<AmmunitionEntry>(AMMUNITION_COLLECTION, e.slug)
                  .pipe(catchError(() => of(null))),
              ),
            )
          : of([] as (AmmunitionEntry | null)[]),
      ),
      map((list) => list.filter((a): a is AmmunitionEntry => !!a)),
    );

    // Potions : leurs `effects` sont du texte, lu au mieux par `consumableAbility`.
    const potions$ = this.wiki.loadAll<ResourceIndexEntry>(POTION_COLLECTION).pipe(
      catchError(() => of([] as ResourceIndexEntry[])),
      switchMap((index) =>
        index.length
          ? forkJoin(
              index.map((e) =>
                this.wiki.load<PotionEntry>(POTION_COLLECTION, e.slug).pipe(
                  map((p) => ({ name: p.name || e.name, slug: e.slug, effects: p.effects })),
                  catchError(() => of(null)),
                ),
              ),
            )
          : of([] as (ConsumableSource | null)[]),
      ),
      map((list) => list.filter((p): p is ConsumableSource => !!p)),
    );

    return forkJoin([
      weapons$,
      armor$,
      ammunition$,
      potions$,
      this.wiki.load<RaceDef[]>('characters', 'races').pipe(catchError(() => of([]))),
      this.wiki.load<ClassDef[]>('characters', 'classes').pipe(catchError(() => of([]))),
      this.wiki.load<BackgroundDef[]>('characters', 'backgrounds').pipe(catchError(() => of([]))),
    ]).pipe(
      tap(([weapons, armors, ammunition, potions, races, classes, backgrounds]) => {
        for (const potion of potions) this.consumablesByName.set(potion.name, potion);
        for (const weapon of weapons) this.weaponsByName.set(weapon.name, weapon);
        this.ammunition.length = 0;
        this.ammunition.push(
          ...ammunition.map((a) => ({
            name: a.name,
            damageType: a.damageType,
            damageBonus: a.damageBonus,
            compatibleWith: a.compatibleWith,
          })),
        );
        for (const set of armors) {
          for (const piece of set.pieces ?? []) {
            const label = piece.label || set.name;
            this.equipmentByName.set(label, {
              physicalArmor: piece.physicalArmor ?? 0,
              magicalProtection: piece.magicalProtection ?? 0,
              resistances: set.resistances ?? [],
              weaknesses: set.weaknesses ?? [],
            });
          }
        }
        this.races.set(races);
        this.classes.set(classes);
        this.backgrounds.set(backgrounds);
        this.ready.set(true);
      }),
      map(() => void 0),
    );
  }

  /* ── Fiche de personnage ────────────────────────────────────────────────── */

  /**
   * Convertit une fiche en combattant. Les stats sont recalculées ici par les
   * mêmes fonctions que l'éditeur (`computeStats`, `computeAttributes`) : il n'y
   * a qu'une définition des règles de personnage, et le combat ne peut pas en
   * diverger.
   */
  fromSheet(sheet: CharacterSheet, team: Team, pos: GridPos, sheetId?: string): Combatant {
    const race = this.races().find((r) => r.name === sheet.identity.race);
    const klass = this.classes().find((c) => c.name === sheet.identity.class);
    const background = this.backgrounds().find((b) => b.name === sheet.identity.background);
    const traits = grantedTraits(race, sheet.identity.subrace, background);

    const attributes = computeAttributes(sheet, race, sheet.identity.subrace);
    const stats = computeStats(sheet, race, klass, traits, attributes);

    // Les défenses ne viennent que du porté : on ajoute l'armure équipée, comme
    // le fait la fiche.
    const affinities = EMPTY_AFFINITIES();
    for (const slot of EQUIPMENT_SLOTS) {
      const name = sheet.equipment[slot.key];
      const piece = name ? this.equipmentByName.get(name) : undefined;
      if (!piece) continue;
      stats.def_phy += piece.physicalArmor;
      stats.def_mag += piece.magicalProtection;
      for (const r of piece.resistances) if (!affinities.resistances.includes(r)) affinities.resistances.push(r);
      for (const w of piece.weaknesses) if (!affinities.weaknesses.includes(w)) affinities.weaknesses.push(w);
    }

    const inventory = this.carriedFrom(sheet);

    return {
      id: nextId('pc'),
      name: sheet.identity.name || 'Personnage',
      team,
      origin: sheetId ? { kind: 'sheet', sheetId } : { kind: 'custom' },
      portrait: sheet.identity.portrait || sheet.identity.fullImage || undefined,
      role: klass?.name || sheet.identity.class || undefined,
      level: sheet.level,
      footprint: 1,
      pos,
      base: stats,
      attributes,
      proficiency: sheet.proficiencyBonus ?? 2,
      hp: stats.hp,
      mana: stats.mana,
      endurance: stats.endurance,
      winded: false,
      moved: 0,
      actionUsed: false,
      reactionUsed: false,
      statuses: [],
      effects: [],
      abilities: this.sheetAbilities(sheet, klass, inventory),
      inventory,
      affinities,
      initiative: 0,
      down: false,
    };
  }

  /**
   * Le sac emporté au combat : les lignes d'inventaire de la fiche, chacune
   * classée selon ce que le wiki en dit (munition, consommable, bagage). Un
   * carquois est ajouté d'office pour une arme à projectile qui n'en a pas.
   */
  private carriedFrom(sheet: CharacterSheet): CarriedItem[] {
    const carried: CarriedItem[] = (sheet.inventory ?? []).map((line) => {
      const ammo = this.ammunition.find((a) => a.name === line.name);
      const potion = this.consumablesByName.get(line.name);
      return {
        name: line.name,
        qty: Math.max(0, Math.round(line.qty ?? 0)),
        slug: potion?.slug,
        kind: ammo ? 'ammunition' : potion ? 'consumable' : 'other',
      };
    });

    for (const slot of ['weapon', 'offhand']) {
      const name = sheet.equipment[slot];
      const weapon = name ? this.weaponsByName.get(name) : undefined;
      const ammo = weapon ? this.ammunitionFor(weapon) : undefined;
      if (!ammo || carried.some((c) => c.name === ammo.name)) continue;
      carried.push({ name: ammo.name, qty: DEFAULT_AMMO_QTY, kind: 'ammunition' });
    }
    return carried;
  }

  /**
   * Capacités d'un personnage : armes équipées, sorts **équipés** (le loadout de
   * combat de la fiche), compétences de classe débloquées à son niveau, et les
   * consommables reconnus dans son sac. Sans arme en main, l'attaque à mains
   * nues reste disponible.
   */
  private sheetAbilities(
    sheet: CharacterSheet,
    klass: ClassDef | undefined,
    inventory: CarriedItem[],
  ): CombatAbility[] {
    const abilities: CombatAbility[] = [];

    for (const slot of ['weapon', 'offhand']) {
      const name = sheet.equipment[slot];
      const weapon = name ? this.weaponsByName.get(name) : undefined;
      if (!weapon) continue;
      const ammo = this.ammunitionFor(weapon);
      const ability = weaponAbility(weapon, slot, ammo);
      // Une arme à projectile puise dans le carquois : c'est ce qui rend le
      // décompte des munitions effectif plutôt qu'informatif.
      if (ammo) ability.consumes = { item: ammo.name, qty: 1 };
      abilities.push(ability);
    }
    // Le poing est toujours là : armé ou non, on peut frapper. C'est aussi le
    // recours quand le carquois est vide ou l'arme hors de portée. Sa puissance
    // dépend de la classe — le pugiliste en fait son arme.
    abilities.push(unarmedAbility(unarmedRatioFor(klass?.key)));
    // Se couvrir est toujours une option : c'est ce qui rend un mauvais tour
    // jouable au lieu d'être perdu.
    abilities.push(guardAbility());

    for (const key of sheet.spells?.equipped ?? []) {
      const page = this.spells.bySlug(key);
      if (!page) continue;
      // La classe compte : elle module le coût, le scaling et parfois le
      // fonctionnement du sort (cf. `classBonuses` des fiches de domaine).
      abilities.push(...spellAbilities(page, sheet.spells.nodes?.[key] ?? [], klass?.key));
    }

    abilities.push(...classSkillsFor(klass, sheet.level));

    for (const line of inventory) {
      if (line.kind !== 'consumable') continue;
      const source = this.consumablesByName.get(line.name);
      if (source) abilities.push(consumableAbility(source, this.statusKeys));
    }
    return abilities;
  }

  /**
   * Munition d'une arme à projectile. La fiche de personnage ne suit pas les
   * carquois (son inventaire est du texte libre), donc on équipe d'office la
   * munition standard de la catégorie : un arc sans flèches ne serait pas une
   * règle, juste une gêne. Une arme de mêlée n'en reçoit aucune.
   */
  private ammunitionFor(weapon: WeaponSource): AmmunitionSource | undefined {
    if (!usesAmmunition(weapon)) return undefined;
    return this.ammunition.find((a) =>
      (a.compatibleWith ?? []).includes(weapon.weaponCategory ?? ''),
    );
  }

  /** Nom FR d'un type d'entité, ou `undefined` si le catalogue ne le connaît pas. */
  private entityTypeLabel(id: number | undefined): string | undefined {
    const type = entityTypeCatalog.entity_types.find((t) => t.id === id);
    if (!type) return undefined;
    return ENTITY_TYPE_LABELS[type.name] ?? type.name;
  }

  /* ── Bestiaire ──────────────────────────────────────────────────────────── */

  /**
   * Convertit une créature du bestiaire en combattant.
   *
   * Deux valeurs manquent aux fiches et sont dérivées ici : les défenses (le
   * bestiaire ne chiffre que l'attaque) et l'endurance. On les tire des
   * attributs et de l'indice de menace, ce qui garde une bête coriace coriace
   * sans exiger de réécrire tout le bestiaire.
   */
  fromBestiary(entry: BestiaryEntry, team: Team, pos: GridPos, index = 1): Combatant {
    const typeStats = entityTypeCatalog.entity_types.find((t) => t.id === entry.entityTypeId)?.stats;
    const bonuses = entry.statBonuses ?? {};
    const statOf = (key: 'hp' | 'physical_atk' | 'magical_atk' | 'mana' | 'speed'): number =>
      (typeStats?.[key] ?? 0) + (bonuses[key] ?? 0);

    const attributes: Record<AttributeKey, number> = {
      force: 10,
      dexterite: 10,
      constitution: 10,
      intelligence: 10,
      sagesse: 10,
      charisme: 10,
    };
    for (const attr of entry.attributes ?? []) {
      const key = ATTRIBUTE_BY_SHORT[attr.shortLabel?.toUpperCase() ?? ''];
      if (key) attributes[key] = attr.value;
    }

    const cr = Math.max(0, Math.round(entry.cr ?? 0));
    const base: Record<StatKey, number> = {
      hp: Math.max(1, statOf('hp')),
      mana: Math.max(0, statOf('mana')),
      // L'endurance n'existe pas au bestiaire : une bête tient sur son souffle,
      // donc sur sa Constitution.
      endurance: Math.max(1, 10 + abilityModifier(attributes.constitution) * 2),
      speed: Math.max(1, statOf('speed') + 10),
      atk_phy: Math.max(0, statOf('physical_atk')),
      atk_mag: Math.max(0, statOf('magical_atk')),
      def_phy: Math.max(0, abilityModifier(attributes.constitution) + cr),
      def_mag: Math.max(0, abilityModifier(attributes.sagesse) + cr),
    };

    const affinities = EMPTY_AFFINITIES();
    for (const group of entry.affinities ?? []) {
      const names = group.damageTypeIds
        .map((id) => DAMAGE_TYPE_BY_ID.get(id))
        .filter((n): n is string => !!n);
      affinities[group.kind].push(...names);
    }

    // Ce que la FICHE déclare prime : le bélier charge, le loup hurle pour sa
    // meute, le serpent fantôme paralyse. Une créature dont la fiche ne dit
    // rien retombe sur la morsure et la prise au sol génériques — le bestiaire
    // reste jouable même à moitié rempli.
    const propres = (entry.abilities ?? []).map((a, i) => creatureAbility(a, i));
    const abilities: CombatAbility[] = propres.length
      ? [...propres]
      : [naturalMeleeAbility(), naturalControlAbility()];
    // Se couvrir reste toujours possible, quoi qu'annonce la fiche.
    abilities.push(guardAbility());

    const traits = (entry.traitIds ?? [])
      .map((id) => TRAIT_BY_ID.get(id))
      .filter((t): t is { name: string; description: string } => !!t);

    return {
      id: nextId('npc'),
      name: index > 1 ? `${entry.name} ${index}` : entry.name,
      team,
      origin: { kind: 'bestiary', slug: entry.slug },
      portrait: entry.icon,
      // Une créature n'a pas de classe : son type d'entité tient le même rôle
      // dans la liste d'initiative — il dit à quoi on a affaire.
      role: this.entityTypeLabel(entry.entityTypeId),
      // Une créature n'a pas de niveau : son indice de menace en tient lieu.
      level: cr,
      footprint: FOOTPRINT_BY_SIZE[entry.size?.toUpperCase() ?? 'M'] ?? 1,
      pos,
      base,
      attributes,
      // Le bonus de maîtrise d'une créature suit sa menace, comme un niveau.
      proficiency: 2 + Math.floor(cr / 4),
      hp: base.hp,
      mana: base.mana,
      endurance: base.endurance,
      winded: false,
      moved: 0,
      actionUsed: false,
      reactionUsed: false,
      statuses: [],
      effects: [],
      abilities,
      // Une bête ne porte pas de sac : ce qu'elle rend se ramasse après coup
      // (cf. `loot` de la fiche), ça ne se consomme pas en combat.
      inventory: [],
      affinities,
      initiative: 0,
      down: false,
      // Les traits du bestiaire n'ont pas d'effet chiffré : on les rappelle au
      // MJ en note plutôt que de faire semblant de les automatiser.
      notes: traits.map((t) => `${t.name} — ${t.description}`).join('\n') || undefined,
    };
  }
}
