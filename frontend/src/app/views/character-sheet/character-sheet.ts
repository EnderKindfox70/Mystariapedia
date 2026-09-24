import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { Navbar } from '../../components/navbar/navbar';
import { CharacterSheetService } from '../../services/character-sheet.service';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { damageLabel, damageSigil } from '../../combat/damage-labels';
import {
  ArmorEntry,
  MaterialFamilyKey,
  Material,
  ResourceIndexEntry,
  SpellNode,
  WeaponEntry,
} from '../../wiki.types';
import {
  cannotStudy,
  EARTH_FAMILIES,
  isEarthMaterial,
  MATERIALS,
  MATERIAL_REGIONS,
  MATERIAL_BY_KEY,
  materialsOfFamily,
  normalizeTraining,
  studySlots,
} from '../../combat/materials';
import {
  cannotStudyPlant,
  normalizePlantTraining,
  PLANT_BY_KEY,
  PLANT_FAMILIES,
  PLANT_TIERS,
  plantTier,
  plantsOfFamily,
} from '../../combat/plants';
import { PlantFamily, PlantFamilyKey, PlantSpecies } from '../../wiki.types';
import {
  AttributeKey,
  BackgroundDef,
  CharacterSheet,
  ClassDef,
  CatalogTrait,
  CharacterSpells,
  InventoryItem,
  LanguageDef,
  ClassSpell,
  DomainFeatDef,
  DomainStanding,
  EarthMaterialTraining,
  FeatChoice,
  PlantSpeciesTraining,
  FeatPick,
  OriginDef,
  ReligionDef,
  PoolKey,
  RaceDef,
  SpellState,
  StatKey,
  StatMode,
  SubraceDef,
  TraitDef,
} from '../../character/character.types';
import {
  Build,
  BuilderStats,
  builtNode,
  CustomizableSpell,
  DEFAULT_RULES,
  emptyBuild,
  fillTemplate,
  fromSpellEntry,
  spellProgress,
  xpForCast,
  xpThreshold,
} from '../../combat/spell-customization';
import { SpellsService } from '../../services/spells.service';
import { SpellWorkshop } from '../../components/spell-workshop/spell-workshop';
import { SpellDetail } from '../../components/spell-detail/spell-detail';
import { Pager } from '../../components/pager/pager';
import {
  ATTRIBUTES,
  ATTRIBUTE_POINTS,
  BASE_ATTRIBUTE,
  MIN_ATTRIBUTE,
  MAX_ATTRIBUTE,
  attributeCost,
  attributeIncrementCost,
  BAR_STATS,
  MAX_LEVEL,
  XP_MAX,
  levelForXp,
  xpForLevel,
  xpProgress,
  xpToNextLevel,
  type XpProgress,
  DEFAULT_TRAIT_ICON,
  EQUIPMENT_SLOTS,
  DEFENSE_STATS,
  MAGIC_DEFENSE_SPARK,
  MAGIC_DOMAINS,
  SURVIVAL_GAUGES,
  clampSurvival,
  describeNeedEffect,
  hungerPerSegment,
  MANA_NEED,
  manaEffect,
  manaTier,
  needEffect,
  noSurvivalLoss,
  sheetSurvivalLoss,
  survivalMaxima,
  survivalPoints,
  survivalTier,
  type SurvivalGauge,
  type SurvivalTier,
  POOL_GAUGES,
  clampPoolLoss,
  noPoolLoss,
  poolCurrent,
  poolStage,
  type PoolGauge,
  SKILLS,
  STATS,
  abilityModifier,
  attributeBonuses,
  attributeKeyOf,
  freeAttributePicks,
  backgroundSkillBonuses,
  computeAttributes,
  computeGold,
  computeStats,
  purseDelta,
  purseTotal,
  maxTheoreticalScale,
  statContributions,
  type StatContribution,
  domainName,
  domainIcon,
  domainSigil,
  availableSpellsFor,
  findDomainSpell,
  type DomainSpell,
  emptySheet,
  formatBonus,
  grantedTraits,
  CREATION_TRAIT_SLOTS,
  FEAT_LEVELS,
  TRAIT_CATALOG,
  TRAIT_CATEGORIES,
  NONPOLAR_MAGICS,
  ORIGINS,
  RELIGIONS,
  MANUAL_NONPOLAR_VIA,
  nonPolarAccess,
  openNonPolarBranches,
  catalogTrait,
  isPickableTrait,
  originByKey,
  originTraits,
  religionByKey,
  standingFor,
  traitRequirement,
  characterAffinities,
  type CharacterAffinities,
  LANGUAGES,
  grantedLanguages,
  languageByKey,
  languageName,
  languageSlotsFrom,
  traitSkillBonuses,
  chosenDomainFeats,
  chosenTraits,
  domainFeats,
  featAttributeBonuses,
  featChoiceAt,
  featDomainsFor,
  featSlotsFor,
  findDomainFeat,
  LEARNABLE_ARMOR_CATEGORIES,
  WEAPON_CATEGORIES,
  armorCategory,
  armorCategoryName,
  armorMastery,
  isTwoHanded,
  weaponCategory,
  armorProficiencies,
  weaponProficiencies,
  resolveArmorCategory,
  resolveWeaponCategory,
  type ArmorMastery,
  type Proficiency,
  randomSeed,
  roll4d6DropLowest,
  skillLabel,
} from '../../character/universe-data';
import {
  AFFINITY_ODDS,
  rollMagicAffinity,
  type MagicAffinityRoll,
} from '../../character/magic-affinity';
import type { PdfSlotRow, PdfSpellRow, SheetPdfData } from './sheet-pdf';

/** Tailles max des images importées (octets bruts du fichier, avant recompression). */
const MAX_PORTRAIT_BYTES = 10 * 1024 * 1024;
const MAX_FULL_IMAGE_BYTES = 10 * 1024 * 1024;


/** Collections du wiki proposées comme objets d'inventaire (avec poids). */
const INVENTORY_COLLECTIONS = [
  'potions',
  'equipment',
  'natural-resources/fauna',
  'natural-resources/flora',
  'natural-resources/minerals',
  'natural-resources/liquids',
  'natural-resources/remains',
  'weapons/melee',
  'weapons/ranged',
  'weapons/ammunition',
  'weapons/armor',
  'weapons/shield',
  'artifacts/simple',
  'artifacts/complex',
  'artifacts/soul',
];

/** Collections d'armes proposées dans les emplacements d'arme (main/secondaire). */
const WEAPON_COLLECTIONS = ['weapons/melee', 'weapons/ranged'];

/** Collections de sets (armures, vêtements, boucliers) dont on tire les pièces équipables. */
const ARMOR_COLLECTIONS = ['weapons/armor', 'weapons/shield'];

/**
 * Catalogues d'objets magiques. Contrairement aux armures, ils ne se rangent pas
 * par pièce : chaque fiche déclare elle-même l'emplacement où elle se porte
 * (`slot`), ce qui permet à un pendentif d'aller à l'amulette sans que la fiche
 * de personnage ait à connaître les artefacts un par un.
 */
const ARTIFACT_COLLECTIONS = ['artifacts/simple', 'artifacts/complex', 'artifacts/soul'];

/** Emplacement de pièce d'armure (cf. ArmorPiece.slot) → emplacement d'équipement. */
const PIECE_TO_EQUIP_SLOT: Record<string, string> = {
  head: 'head',
  body: 'chest',
  legs: 'legs',
  feet: 'feet',
  shield: 'offhand',
};

/** Libellés FR des attributs. */
const ATTRIBUTE_LABELS: Record<string, string> = {
  force: 'Force',
  dexterite: 'Dextérité',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  sagesse: 'Sagesse',
  charisme: 'Charisme',
};

/** Libellés FR des types de dégâts physiques. */
const DAMAGE_TYPE_LABELS: Record<string, string> = {
  slashing: 'Tranchant',
  piercing: 'Perforant',
  bludgeoning: 'Contondant',
};

/** Une réserve prête à afficher : maximum calculé, niveau du moment, verdict. */
export interface PoolRow {
  gauge: PoolGauge;
  /** Maximum recalculé (race, classe, niveau, équipement). */
  max: number;
  /** Niveau du moment, maximum moins le creux stocké. */
  current: number;
  /** Remplissage de la barre, en pourcentage. */
  pct: number;
  stage: string;
}

/** Une jauge de survie prête à afficher : points, palier, et ce qu'il coûte. */
export interface SurvivalRow {
  gauge: SurvivalGauge;
  /** Taille du réservoir (dépend de la Constitution). */
  max: number;
  /** Points restants, maximum moins le creux stocké. */
  current: number;
  pct: number;
  tier: SurvivalTier;
  stage: string;
  /** Malus du palier, en toutes lettres (vide tant qu'il n'y en a pas). */
  effects: string;
}

/** Détail de combat d'une arme équipée, prêt à afficher sur la fiche. */
export interface EquippedWeapon {
  slotKey: string;
  slotLabel: string;
  name: string;
  minDamage: number;
  maxDamage: number;
  /** Dégâts min/max une fois le modificateur de l'attribut de dégâts appliqué. */
  modMin: number;
  modMax: number;
  damageType: string;
  attributeDamage: string;
  enduranceCost: number;
  /** Catégorie de l'arme, en toutes lettres (« Épée longue »). */
  category: string;
  /** Le personnage sait-il manier cette catégorie ? (classe + ajouts manuels) */
  proficient: boolean;
}

/** Pièce d'armure équipée, telle que la fiche l'affiche dans son emplacement. */
export interface EquippedArmor {
  physicalArmor: number;
  magicalProtection: number;
  /** Catégorie du set, en toutes lettres (vide si la fiche ne la déclare pas). */
  category: string;
  /** Verdict de maîtrise — `clothing` et `unknown` ne se commentent pas. */
  mastery: ArmorMastery;
}

/** Ce qui ouvrirait une branche non polarisée encore fermée. */
const NONPOLAR_HINT: Record<string, string> = {
  renforcement: 'Background Soldat, origine Archipel, ou feat Entraînement martial',
  emission: 'Background Sage, origine Archipel, ou feat Études magiques',
};

/** Catégories d'armes réservées à la main secondaire (jamais en main principale). */
const OFFHAND_ONLY_CATEGORIES = new Set(['handCrossbow']);

/** Les deux emplacements tenus en main. */
const MAIN_HAND_SLOT = 'weapon';
const OFFHAND_SLOT = 'offhand';

/** Contribution d'un objet équipé aux défenses et au poids. */
interface EquipmentStat {
  physicalArmor: number;
  magicalProtection: number;
  weight: number;
  /** Bonus de stats accordés tant que l'objet est porté (talismans, anneaux…). */
  statEffects?: { key: string; value: number }[];
  /** Catégorie du set dont la pièce provient (cf. armor_category.json). */
  armorCategory?: string;
  /** Types de dégâts auxquels le set résiste (déclarés sur le set, pas la pièce). */
  resistances?: string[];
  /** Types de dégâts auxquels le set rend vulnérable. */
  weaknesses?: string[];
}

/**
 * Sacs à dos : ce sont des fiches d'équipement comme les autres. Une fiche est
 * un sac dès qu'elle annonce une capacité ou un allègement dans sa bande
 * d'identité — le build en dérive les valeurs dans equipment/index.json.
 */
const isBag = (e: ResourceIndexEntry): boolean =>
  e.capacityBonus != null || e.weightReductionPct != null;

/** Liste de clés reçue d'une fiche : chaînes non vides, sans doublon. */
const normalizeKeys = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((k): k is string => typeof k === 'string' && !!k.trim()))]
    : [];

/**
 * Part du poids des objets PORTÉS qui compte dans la charge. Bien réparti sur le
 * corps, l'équipement « pèse » moins qu'au fond du sac (≈ 50 %).
 */
const EQUIPPED_WEIGHT_FACTOR = 0.5;

/** Le socle, pour les sorts dont l'atelier n'a jamais été ouvert. Jamais modifié. */
const EMPTY_BUILD: Build = emptyBuild();

/** Les six sections du formulaire de fiche (cf. `formSections`). */
export type FormSectionKey =
  | 'identity'
  | 'race'
  | 'background'
  | 'stats'
  | 'magic'
  | 'spells'
  | 'traits'
  | 'skills'
  | 'gear';

@Component({
  selector: 'app-character-sheet',
  imports: [FormsModule, RouterLink, Navbar, SpellWorkshop, SpellDetail, Pager],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.css',
})
export class CharacterSheetEditor {
  private readonly sheets = inject(CharacterSheetService);
  private readonly spellPages = inject(SpellsService);
  private readonly wiki = inject(WikiLoaderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Modèle édité : objet simple lié par ngModel. Chaque modification passe par un
  // évènement DOM (input/click) qui déclenche la détection, donc les valeurs
  // calculées du template (modificateurs, poids total…) se rafraîchissent.
  model: CharacterSheet = emptySheet();
  sheetId: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);
  readonly exporting = signal(false);
  readonly importing = signal(false);

  // Listes chargées depuis les datasets JSON.
  readonly races = signal<RaceDef[]>([]);
  readonly backgrounds = signal<BackgroundDef[]>([]);
  readonly classes = signal<ClassDef[]>([]);
  /** Objets d'inventaire proposés (nom + poids) issus du wiki. */
  readonly itemCatalog = signal<{ name: string; weight: number }[]>([]);
  /**
   * Usages par exemplaire des objets qui en comptent plusieurs (un lot de
   * rations : 7 jours). Le simulateur entame l'exemplaire ; la fiche le montre.
   */
  private readonly itemUses = new Map<string, number>();
  private readonly itemWeights = new Map<string, number>();
  /** Suggestions d'équipement par emplacement (datalists), issues du wiki. */
  readonly equipmentOptions = signal<Record<string, string[]>>({});
  /** Contribution (défense + poids) de chaque objet équipable, indexée par nom. */
  private readonly equipmentStats = signal<Map<string, EquipmentStat>>(new Map());
  /** Dégâts et catégorie des armes, indexés par nom (pour le détail combat de la fiche). */
  private readonly weaponInfo = signal<
    Map<string, { minDamage: number; maxDamage: number; weaponCategory?: string }>
  >(new Map());
  /** Sacs à dos indexés par nom (capacité, allègement, poids propre). */
  private readonly bagByName = signal<Map<string, ResourceIndexEntry>>(new Map());
  /** Objets du wiki indexés par slug (pour le matériel de départ des backgrounds). */
  private readonly itemBySlug = signal<Map<string, { name: string; weight: number }>>(new Map());
  /** Tenue/armure complète indexée par slug (pour l'auto-équipement). */
  private readonly outfitBySlug = signal<Map<string, ArmorEntry>>(new Map());
  /** Nom d'arme indexé par slug (pour l'auto-équipement). */
  private readonly weaponNameBySlug = signal<Map<string, string>>(new Map());

  // Constantes de l'univers exposées au template.
  readonly domains = MAGIC_DOMAINS;
  readonly attributes = ATTRIBUTES;
  readonly skills = SKILLS;
  readonly equipmentSlots = EQUIPMENT_SLOTS;
  readonly leftSlots = EQUIPMENT_SLOTS.filter((s) => s.side === 'left');
  readonly rightSlots = EQUIPMENT_SLOTS.filter((s) => s.side === 'right');
  readonly stats = STATS;
  readonly barStats = BAR_STATS;
  readonly survivalGauges = SURVIVAL_GAUGES;
  readonly poolGauges = POOL_GAUGES;
  readonly defenseStats = DEFENSE_STATS;
  readonly magicDefenseSpark = MAGIC_DEFENSE_SPARK;

  readonly domainName = domainName;
  readonly domainSigil = domainSigil;
  readonly domainIcon = domainIcon;
  readonly formatBonus = formatBonus;

  /* ── Navigation par sections ───────────────────────────────────────────────
     Les dix-neuf fieldsets du formulaire sont regroupés en six sections dont
     une seule est ouverte à la fois. Le même état sert aux deux rendus : rail
     d'onglets sur grand écran, accordéon à 900px et moins (cf. la feuille de style).
     Le corps d'une section fermée n'est pas rendu — ça évite de faire tourner
     la détection de changement sur un millier de lignes invisibles.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly formSections = [
    { key: 'identity', label: 'Identité' },
    { key: 'race', label: 'Race' },
    { key: 'background', label: 'Background' },
    { key: 'stats', label: 'Stats' },
    { key: 'magic', label: 'Magie' },
    { key: 'spells', label: 'Sorts' },
    { key: 'traits', label: 'Traits' },
    { key: 'skills', label: 'Compétences' },
    { key: 'gear', label: 'Équipement' },
  ] as const;

  readonly activeSection = signal<FormSectionKey>('identity');

  /**
   * Aperçu de la fiche : replié par défaut, et alors pas rendu du tout. Il
   * prenait la moitié de la largeur, dont le formulaire a besoin pour tenir
   * sur un écran.
   */
  readonly previewOpen = signal(false);

  /** Vrai quand c'est l'impression qui a déplié l'aperçu, à replier après. */
  private previewForPrint = false;

  /**
   * L'aperçu porte la fiche imprimée — le formulaire, lui, est en `no-print`.
   * Replié il n'existe pas dans le DOM, donc un Ctrl+P sortirait une page
   * blanche : on le déplie le temps de l'impression. Le bouton « Télécharger
   * PDF » n'en dépend pas, son rendu est vectoriel (cf. sheet-pdf.ts).
   */
  @HostListener('window:beforeprint')
  onBeforePrint(): void {
    if (this.previewOpen()) return;
    this.previewForPrint = true;
    this.previewOpen.set(true);
  }

  @HostListener('window:afterprint')
  onAfterPrint(): void {
    if (!this.previewForPrint) return;
    this.previewForPrint = false;
    this.previewOpen.set(false);
  }

  /** Échap referme l'aperçu, comme tout panneau posé au premier plan. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.previewOpen()) this.previewOpen.set(false);
  }

  isSection(key: FormSectionKey): boolean {
    return this.activeSection() === key;
  }

  /** Ouvre une section et l'inscrit dans l'URL, pour qu'un rechargement y revienne. */
  openSection(key: FormSectionKey): void {
    this.activeSection.set(key);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: key },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Résumé porté par l'onglet et par l'en-tête replié : la valeur du moment,
   * pas le titre. `warn` marque ce qu'il reste à dépenser ou à décider, pour
   * qu'on le voie sans entrer dans la section.
   */
  sectionBadge(key: FormSectionKey): { text: string; warn: boolean } {
    switch (key) {
      case 'identity': {
        const name = this.model.identity.name?.trim();
        return name
          ? { text: `${name} · ${this.model.level}`, warn: false }
          : { text: 'à nommer', warn: true };
      }
      case 'race': {
        const nom = this.model.identity.race?.trim();
        if (!nom) return { text: 'à choisir', warn: true };
        // Des points libres non posés valent un avertissement : le personnage
        // est incomplet alors que la race, elle, est choisie.
        const reste = this.raceFreeLeft;
        return reste
          ? { text: reste + (reste > 1 ? " pts libres" : " pt libre"), warn: true }
          : { text: nom, warn: false };
      }
      case 'background': {
        const nom = this.model.identity.background?.trim();
        return nom ? { text: nom, warn: false } : { text: 'à choisir', warn: true };
      }
      case 'stats':
        return this.attributeMode === 'pointbuy'
          ? { text: `${this.pointsRemaining} pts`, warn: this.pointsRemaining !== 0 }
          : { text: `${this.rollsAssigned}/6 dés`, warn: this.rollsAssigned < 6 };
      case 'magic':
        return {
          text: `${this.model.domains.length}/3`,
          warn: this.model.domains.length === 0,
        };
      case 'spells': {
        const debloques = this.model.spells.unlocked.length;
        if (!debloques) return { text: '—', warn: false };
        // Un sort débloqué mais non équipé ne sert à rien en combat : on le dit.
        return {
          text: `${this.equippedSpells.length}/${this.equippedCap}`,
          warn: this.equippedSpells.length === 0,
        };
      }
      case 'traits': {
        const left = this.creationTraitsLeft + this.featSlotsPending;
        return {
          text: `${this.creationTraitKeys.length}/${this.creationTraitSlots}`,
          warn: left > 0,
        };
      }
      case 'skills': {
        if (!this.classSkillChoices) return { text: '—', warn: false };
        return {
          text: `${this.chosenSkillCount}/${this.classSkillChoices}`,
          warn: this.chosenSkillCount < this.classSkillChoices,
        };
      }
      case 'gear': {
        const n = this.model.inventory.length;
        return { text: `${n} obj.`, warn: this.overweight };
      }
    }
  }

  constructor() {
    // Datasets pilotant les listes déroulantes race/sous-race/background/classe.
    this.wiki.load<RaceDef[]>('characters', 'races').subscribe((races) => this.races.set(races));
    this.wiki
      .load<BackgroundDef[]>('characters', 'backgrounds')
      .subscribe((bg) => this.backgrounds.set(bg));
    this.wiki.load<ClassDef[]>('characters', 'classes').subscribe((cls) => this.classes.set(cls));

    // Catalogue d'inventaire : agrège les index du wiki (objets + leur poids).
    forkJoin(
      INVENTORY_COLLECTIONS.map((c) =>
        this.wiki.loadAll<ResourceIndexEntry>(c).pipe(catchError(() => of([] as ResourceIndexEntry[]))),
      ),
    ).subscribe((lists) => {
      const byName = new Map<string, number>();
      const bySlug = new Map<string, { name: string; weight: number }>();
      this.itemUses.clear();
      for (const entry of lists.flat()) {
        if (entry?.name && !byName.has(entry.name)) byName.set(entry.name, entry.weight ?? 0);
        if (entry?.name && (entry.uses ?? 1) > 1) this.itemUses.set(entry.name, entry.uses!);
        // Slug → objet : sert à résoudre le matériel de départ d'un background.
        if (entry?.slug && !bySlug.has(entry.slug)) {
          bySlug.set(entry.slug, { name: entry.name, weight: entry.weight ?? 0 });
        }
      }
      this.itemBySlug.set(bySlug);
      this.itemWeights.clear();
      byName.forEach((w, name) => this.itemWeights.set(name, w));
      this.itemCatalog.set(
        [...byName.entries()]
          .map(([name, weight]) => ({ name, weight }))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      );
    });

    // Suggestions d'équipement : armes (slots arme) + pièces d'armure par emplacement.
    // Les index d'armes ne portent que nom/poids : les dégâts et la catégorie
    // (maniement, type de dégâts, attribut, endurance) ne vivent que dans la
    // fiche détaillée de chaque arme, qu'on va donc chercher entrée par entrée.
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
                        ...e,
                        weaponCategory: w.weaponCategory ?? e.weaponCategory,
                        minDamage: w.minDamage ?? e.minDamage,
                        maxDamage: w.maxDamage ?? e.maxDamage,
                      })),
                      catchError(() => of(e)),
                    ),
                  ),
                )
              : of([] as ResourceIndexEntry[]),
          ),
        ),
      ),
    ).pipe(map((lists) => lists.flat()));

    const armorSets$ = forkJoin(
      ARMOR_COLLECTIONS.map((col) =>
        this.wiki.loadAll<ResourceIndexEntry>(col).pipe(
          catchError(() => of([] as ResourceIndexEntry[])),
          switchMap((index) =>
            index.length
              ? forkJoin(
                  index.map((e) =>
                    this.wiki.load<ArmorEntry>(col, e.slug).pipe(
                      map((set) => ({ slug: e.slug, set })),
                      catchError(() => of(null)),
                    ),
                  ),
                )
              : of([] as ({ slug: string; set: ArmorEntry } | null)[]),
          ),
        ),
      ),
    ).pipe(map((lists) => lists.flat()));

    // Sacs à dos : les fiches d'équipement qui annoncent une capacité ou un allègement.
    const bags$ = this.wiki.loadAll<ResourceIndexEntry>('equipment').pipe(
      catchError(() => of([] as ResourceIndexEntry[])),
      map((index) => index.filter(isBag)),
    );

    // Objets magiques portés : l'index suffit, il porte le nom, le poids et
    // l'emplacement déclaré par la fiche.
    const artifacts$ = forkJoin(
      ARTIFACT_COLLECTIONS.map((col) =>
        this.wiki
          .loadAll<ResourceIndexEntry>(col)
          .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
      ),
    ).pipe(map((lists) => lists.flat()));

    forkJoin([weapons$, armorSets$, bags$, artifacts$]).subscribe(([weapons, sets, bags, artifacts]) => {
      const opts: Record<string, string[]> = {
        head: [], chest: [], legs: [], feet: [],
        weapon: [], offhand: [], amulet: [], ring: [], bag: [],
      };
      const stats = new Map<string, EquipmentStat>();
      const weapons2 = new Map<string, { minDamage: number; maxDamage: number; weaponCategory?: string }>();
      const weaponNames = new Map<string, string>();
      const outfits = new Map<string, ArmorEntry>();
      const push = (slot: string, name: string) => {
        if (name && !opts[slot].includes(name)) opts[slot].push(name);
      };

      // Sacs à dos : proposés dans l'emplacement « bag », avec leur poids propre.
      for (const b of bags) {
        push('bag', b.name);
        stats.set(b.name, { physicalArmor: 0, magicalProtection: 0, weight: b.weight ?? 0 });
      }
      this.bagByName.set(new Map(bags.map((b) => [b.name, b])));

      // Armes : main principale (sauf catégories réservées) et/ou main secondaire (1 main).
      for (const w of weapons) {
        if (!w.name) continue;
        const offhandOnly = !!w.weaponCategory && OFFHAND_ONLY_CATEGORIES.has(w.weaponCategory);
        if (!offhandOnly) push(MAIN_HAND_SLOT, w.name);
        // Une arme à deux mains ne se propose jamais en main faible : elle n'y
        // tiendrait pas plus qu'elle ne laisse de place à côté d'elle.
        if (!isTwoHanded(w.weaponCategory)) push(OFFHAND_SLOT, w.name);
        stats.set(w.name, { physicalArmor: 0, magicalProtection: 0, weight: w.weight ?? 0 });
        weapons2.set(w.name, {
          minDamage: w.minDamage ?? 0,
          maxDamage: w.maxDamage ?? 0,
          weaponCategory: w.weaponCategory,
        });
        if (w.slug) weaponNames.set(w.slug, w.name);
      }

      // Pièces d'armure (et boucliers) : ventilées par emplacement, avec leurs protections.
      for (const item of sets) {
        if (!item) continue;
        outfits.set(item.slug, item.set);
        for (const piece of item.set?.pieces ?? []) {
          const slot = PIECE_TO_EQUIP_SLOT[piece.slot];
          if (!slot) continue;
          const label = piece.label || item.set?.name || piece.slot;
          push(slot, label);
          stats.set(label, {
            physicalArmor: piece.physicalArmor ?? 0,
            magicalProtection: piece.magicalProtection ?? 0,
            weight: piece.weight ?? 0,
            // La catégorie se déclare sur le set, pas sur la pièce : un heaume
            // de plaques est lourd parce que l'armure dont il vient l'est.
            armorCategory: item.set?.armorCategory,
            // Les affinités aussi : une cotte de mailles protège pareil de la
            // coiffe aux solerets.
            resistances: item.set?.resistances ?? [],
            weaknesses: item.set?.weaknesses ?? [],
          });
        }
      }

      // Objets magiques : chacun va dans l'emplacement que sa fiche déclare. Un
      // emplacement inconnu est ignoré plutôt que créé — la liste des
      // emplacements appartient au paperdoll, pas au catalogue.
      for (const item of artifacts) {
        if (!item.name || !item.slot || !(item.slot in opts)) continue;
        push(item.slot, item.name);
        stats.set(item.name, {
          physicalArmor: 0,
          magicalProtection: 0,
          weight: item.weight ?? 0,
          statEffects: item.statEffects,
        });
      }

      for (const key of Object.keys(opts)) {
        opts[key].sort((a, b) => a.localeCompare(b, 'fr'));
      }
      this.equipmentOptions.set(opts);
      this.equipmentStats.set(stats);
      this.weaponInfo.set(weapons2);
      this.outfitBySlug.set(outfits);
      this.weaponNameBySlug.set(weaponNames);
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);

    // ?section=magie : on reprend la fiche là où on l'avait laissée.
    const section = this.route.snapshot.queryParamMap.get('section');
    if (this.formSections.some((s) => s.key === section)) {
      this.activeSection.set(section as FormSectionKey);
    }
  }

  /* ── Ce que la race et le background accordent ───────────────────────────
     Les deux ont leur propre onglet : ce sont des choix structurants, et ce
     qu'ils donnent (attributs, traits, compétences, matériel) se lisait
     jusqu’ici éparpillé entre Identité, Traits et Équipement. */

  /* ── Points d’attribut libres de la race ─────────────────────────────────

     Une race peut laisser au joueur des points à poser (l'Humain en a trois,
     au lieu d’un profil imposé). La règle : un point par attribut, donc
     autant d’attributs DIFFÉRENTS que de points. Le modèle ne garde que les
     clés choisies, la validation vit dans `freeAttributePicks`. */

  /** Combien de points la race laisse à poser (0 si elle impose son profil). */
  get raceFreePoints(): number {
    return this.selectedRace?.freeAttributePoints ?? 0;
  }

  /** Les points effectivement posés, validés. */
  get raceFreePicks(): AttributeKey[] {
    return freeAttributePicks(this.selectedRace, this.model.raceAttributePicks);
  }

  get raceFreeLeft(): number {
    return Math.max(0, this.raceFreePoints - this.raceFreePicks.length);
  }

  isRaceAttrPicked(key: AttributeKey): boolean {
    return this.raceFreePicks.includes(key);
  }

  /**
   * Pose ou retire un point sur un attribut.
   *
   * Un attribut ne peut pas en recevoir deux : cliquer un attribut déjà pris
   * rend son point. Au-delà du quota, le clic ne fait rien plutôt que de
   * remplacer un choix au hasard.
   */
  toggleRaceAttrPick(key: AttributeKey): void {
    const poses = this.raceFreePicks;
    if (poses.includes(key)) {
      this.model.raceAttributePicks = poses.filter((k) => k !== key);
      return;
    }
    if (poses.length >= this.raceFreePoints) return;
    this.model.raceAttributePicks = [...poses, key];
  }

  /** Bonus d'attribut dus à la SEULE race (et sa sous-race), sans les feats. */
  get raceAttrBonuses(): { label: string; value: number }[] {
    const bonus = attributeBonuses(
      this.selectedRace,
      this.model.identity.subrace,
      this.model.raceAttributePicks,
    );
    return this.attributes
      .map((a) => ({ label: a.label, value: bonus[a.key] }))
      .filter((b) => b.value !== 0);
  }

  /* ── Génome de la race ────────────────────────────────────────────────────

     Les `genetics-stats` d'une race sont son point de départ : six valeurs
     brutes (PV, attaques, endurance, mana, vitesse) sur lesquelles tout le
     reste se construit. Six valeurs, donc six allèles : on les dessine sur
     une double hélice, chacun désigné par une flèche qui porte sa stat.

     La géométrie est calculée ici et non écrite dans le template : les deux
     brins, les barreaux et les amorces de flèche doivent rester cohérents,
     et une seule constante de pas suffit à tout replacer.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Repères du dessin, en unités du viewBox. */
  private readonly geneGeom = {
    cx: 250,
    top: 42,
    step: 54,
    amp: 34,
    /** Où commence le texte, de chaque côté. */
    labelRight: 336,
    labelLeft: 164,
  };

  /** Hauteur du dessin : six barreaux plus une marge. */
  get geneHeight(): number {
    const g = this.geneGeom;
    return g.top + 5 * g.step + g.top;
  }

  /**
   * Les six allèles de la race, prêts à dessiner : position du barreau, côté
   * où pointe la flèche, et longueur de la jauge de comparaison.
   *
   * `null` tant aucune race n’est choisie — le panneau invite alors à choisir.
   */
  get raceGenome(): {
    strandA: string;
    strandB: string;
    alleles: {
      label: string;
      value: number;
      y: number;
      nodeX: number;
      otherX: number;
      side: string;
      labelX: number;
      arrowFrom: number;
      arrowTo: number;
      bar: number;
    }[];
  } | null {
    const genes = this.selectedRace?.['genetics-stats'];
    if (!genes?.length) return null;

    const g = this.geneGeom;
    const nom = (cle: string) => this.stats.find((st) => st.key === cle)?.label ?? cle;
    // La jauge se lit par comparaison : la plus forte valeur fait la longueur.
    const plafond = Math.max(...genes.map((x) => x.value), 1);

    const alleles = genes.map((gene, i) => {
      const y = g.top + i * g.step;
      // Un barreau sur deux part du brin de droite : les flèches alternent
      // donc d'elles-mêmes, trois d'un côté, trois de l'autre.
      const droite = i % 2 === 0;
      return {
        label: nom(gene.key),
        value: gene.value,
        y,
        nodeX: droite ? g.cx + g.amp : g.cx - g.amp,
        otherX: droite ? g.cx - g.amp : g.cx + g.amp,
        side: droite ? 'right' : 'left',
        labelX: droite ? g.labelRight : g.labelLeft,
        arrowFrom: droite ? g.labelRight - 8 : g.labelLeft + 8,
        arrowTo: droite ? g.cx + g.amp + 10 : g.cx - g.amp - 10,
        bar: Math.round((gene.value / plafond) * 58),
      };
    });

    // Les brins : une demi-période par barreau, en S adoucie. Le brin B est
    // le miroir du brin A, d'où le même tracé lu à l'envers.
    const brin = (depart: number) => {
      let d = `M ${depart} ${g.top}`;
      let x = depart;
      for (let i = 1; i < genes.length; i++) {
        const y0 = g.top + (i - 1) * g.step;
        const y1 = g.top + i * g.step;
        const suivant = x === g.cx + g.amp ? g.cx - g.amp : g.cx + g.amp;
        const k = g.step / 2;
        d += ` C ${x} ${y0 + k} ${suivant} ${y1 - k} ${suivant} ${y1}`;
        x = suivant;
      }
      return d;
    };

    return {
      strandA: brin(g.cx + g.amp),
      strandB: brin(g.cx - g.amp),
      alleles,
    };
  }

  /**
   * Ce à quoi une race est bonne, en deux mots : ses deux plus fortes stats
   * génétiques. Sert de sous-titre sur les cartes de sélection.
   */
  raceProfile(race: RaceDef): string {
    const genes = race['genetics-stats'] ?? [];
    if (!genes.length) return '';
    return [...genes]
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((x) => `${this.stats.find((st) => st.key === x.key)?.label ?? x.key} ${x.value}`)
      .join(' · ');
  }

  /**
   * Ce qu'une sous-race change, en deux mots : ses écarts d'attribut.
   *
   * Une sous-race affine, elle ne refait pas le génome — elle n'a donc pas de
   * `genetics-stats`, seulement des écarts, souvent un gain contre une perte.
   */
  subraceProfile(sub: SubraceDef): string {
    return (sub.attributes ?? [])
      .filter((a) => a.value !== 0)
      .map((a) => {
        // Les datasets nomment les attributs en anglais, le moteur en français.
        const cle = attributeKeyOf(a.key);
        const nom = this.attributes.find((x) => x.key === cle)?.label ?? a.key;
        return `${nom} ${formatBonus(a.value)}`;
      })
      .join(' · ');
  }

  /** Traits accordés par une catégorie de source (`race`, `subrace`, `background`). */
  private traitsGrantedBy(...kinds: string[]): CatalogTrait[] {
    return this.grantedTraitDefs.filter((t) =>
      (t.grantedBy ?? []).some((ref) => kinds.includes(ref.split(':')[0])),
    );
  }

  get raceTraitDefs(): CatalogTrait[] {
    return this.traitsGrantedBy('race', 'subrace');
  }

  get backgroundTraitDefs(): CatalogTrait[] {
    return this.traitsGrantedBy('background');
  }

  /** Compétences accordées par le background, en lignes affichables. */
  get backgroundSkillRows(): { label: string; value: number }[] {
    const bonus = this.backgroundSkills;
    return this.skills
      .filter((s) => bonus.get(s.key))
      .map((s) => ({ label: s.label, value: bonus.get(s.key)! }));
  }

  /** Matériel de départ du sous-background, résolu en noms lisibles. */
  get startingGearNames(): string[] {
    const sub = this.selectedSubbackground;
    if (!sub) return [];
    const noms: string[] = [];
    const arme = sub.startingWeapon && this.weaponNameBySlug().get(sub.startingWeapon);
    if (arme) noms.push(arme);
    const tenue = this.outfitBySlug().get(sub.key);
    if (tenue?.name) noms.push(tenue.name);
    for (const slug of sub.startingItems ?? []) {
      const it = this.itemBySlug().get(slug);
      if (it?.name) noms.push(it.name);
    }
    return noms;
  }

  /** Sous-races disponibles pour la race actuellement sélectionnée. */
  get subracesForSelected(): SubraceDef[] {
    return this.races().find((r) => r.name === this.model.identity.race)?.subraces ?? [];
  }

  /** Sous-backgrounds disponibles pour le background sélectionné. */
  get subbackgroundsForSelected(): SubraceDef[] {
    return (
      this.backgrounds().find((b) => b.name === this.model.identity.background)?.subbackgrounds ?? []
    );
  }

  /** Définition du sous-background sélectionné (porte tenue + arme de départ). */
  get selectedSubbackground(): SubraceDef | undefined {
    return this.subbackgroundsForSelected.find((s) => s.name === this.model.identity.subbackground);
  }

  /** Vrai si on peut auto-équiper : un sous-background est choisi et ses sets sont chargés. */
  get canAutoEquip(): boolean {
    const sub = this.selectedSubbackground;
    return (
      !!sub &&
      (this.outfitBySlug().has(sub.key) || !!sub.startingWeapon || !!sub.startingItems?.length)
    );
  }

  /** Équipe la tenue, l'arme et le matériel de départ du sous-background sélectionné. */
  autoEquipStartingGear(): void {
    const sub = this.selectedSubbackground;
    if (!sub) return;
    const outfit = this.outfitBySlug().get(sub.key);
    if (outfit) {
      for (const piece of outfit.pieces ?? []) {
        const slot = PIECE_TO_EQUIP_SLOT[piece.slot];
        if (slot) this.model.equipment[slot] = piece.label || outfit.name;
      }
    }
    const weaponName = sub.startingWeapon
      ? this.weaponNameBySlug().get(sub.startingWeapon)
      : undefined;
    if (weaponName) this.model.equipment['weapon'] = weaponName;

    // Matériel de départ : un sac à dos va dans son emplacement, le reste à
    // l'inventaire. Idempotent : re-cliquer n'empile pas les doublons.
    const bySlug = this.itemBySlug();
    const bags = this.bagByName();
    for (const slug of sub.startingItems ?? []) {
      const item = bySlug.get(slug);
      if (!item) continue;
      if (bags.has(item.name)) {
        this.model.equipment['bag'] = item.name;
        continue;
      }
      if (this.model.inventory.some((line) => line.name === item.name)) continue;
      this.model.inventory.push({ name: item.name, qty: 1, weight: item.weight });
    }

    // La tenue de départ peut apporter un bouclier et l'arme une claymore : on
    // tranche après coup, quand les deux sont posés.
    this.onEquipmentChange();
  }

  /** À chaque changement de race, on invalide une sous-race devenue incohérente. */
  onRaceChange(): void {
    const valid = this.subracesForSelected.some((s) => s.name === this.model.identity.subrace);
    if (!valid) this.model.identity.subrace = '';
    // Les points libres appartiennent à la race qu'on quitte : on les rend.
    this.model.raceAttributePicks = [];
  }

  /** Idem pour le background → sous-background. */
  onBackgroundChange(): void {
    const valid = this.subbackgroundsForSelected.some(
      (s) => s.name === this.model.identity.subbackground,
    );
    if (!valid) this.model.identity.subbackground = '';
    // Le background porte le trait qui ouvre Renforcement ou le Voile : en
    // changer peut refermer une branche, et ses sorts avec.
    this.onMagicAccessChange();
  }

  // ── Expérience ─────────────────────────────────────────────────────────────

  readonly maxLevel = MAX_LEVEL;
  readonly xpMax = XP_MAX;

  /** Avancement dans le niveau courant (barre, restant, seuils). */
  get xp(): XpProgress {
    return xpProgress(this.model.xp);
  }

  /** Coût du palier suivant, pour l'afficher sans recalcul dans le gabarit. */
  get xpToNext(): number {
    return xpToNextLevel(this.model.level);
  }

  /**
   * Saisie d'XP : borne la valeur puis en redéduit le niveau. L'XP est la
   * source de vérité, le niveau la suit.
   */
  onXpChange(): void {
    const xp = Math.round(Number(this.model.xp) || 0);
    this.model.xp = Math.max(0, Math.min(XP_MAX, xp));
    this.model.level = levelForXp(this.model.xp);
  }

  /**
   * Saisie directe du niveau — pratique pour poser un personnage sans compter
   * ses XP. On borne, puis on cale l'XP au seuil du niveau demandé, sauf si
   * l'XP courant y correspond déjà : sinon changer le niveau perdrait
   * l'avancement en cours dès qu'on repasse sur le champ.
   */
  clampLevel(): void {
    const n = Math.round(Number(this.model.level) || 1);
    this.model.level = Math.max(1, Math.min(MAX_LEVEL, n));
    if (levelForXp(this.model.xp) !== this.model.level) {
      this.model.xp = xpForLevel(this.model.level);
    }
  }

  /** Ajoute (ou retire) des XP — les boutons de gain rapide. */
  addXp(amount: number): void {
    this.model.xp = Math.max(0, Math.min(XP_MAX, Math.round(Number(this.model.xp) || 0) + amount));
    this.model.level = levelForXp(this.model.xp);
  }

  // ── Race / classe / traits / stats calculées ───────────────────────────────

  /** Définition de la race actuellement sélectionnée. */
  get selectedRace(): RaceDef | undefined {
    return this.races().find((r) => r.name === this.model.identity.race);
  }

  /** Définition de la classe actuellement sélectionnée. */
  get selectedClass(): ClassDef | undefined {
    return this.classes().find((c) => c.name === this.model.identity.class);
  }

  /** Définition du background actuellement sélectionné. */
  get selectedBackground(): BackgroundDef | undefined {
    return this.backgrounds().find((b) => b.name === this.model.identity.background);
  }

  // ── Bourse ─────────────────────────────────────────────────────────────────

  /** Or de départ, tiré entre min/max du background et lié à la graine. */
  get goldBase(): number {
    return computeGold(this.model, this.selectedBackground);
  }

  /**
   * Bourse courante = tirage de départ + tout ce que la partie a rapporté ou
   * coûté. Modifiable : la saisie est reconvertie en écart, pour que la base
   * reste celle du background.
   */
  get gold(): number {
    return purseTotal(this.goldBase, this.model.goldDelta);
  }

  set gold(value: number) {
    this.model.goldDelta = purseDelta(this.goldBase, value);
  }

  /** Ajoute (ou retire) des pièces, sans jamais passer sous zéro. */
  addGold(amount: number): void {
    this.gold = this.gold + amount;
  }

  /** Vrai si la bourse a bougé depuis le tirage du background. */
  get goldAdjusted(): boolean {
    return this.model.goldDelta !== 0;
  }

  /** Revient au montant tiré par le background. */
  resetGold(): void {
    this.model.goldDelta = 0;
  }

  /** Sorts de la classe, triés par niveau requis. */
  get classSpells(): ClassSpell[] {
    return [...(this.selectedClass?.spells ?? [])].sort((a, b) => a.level - b.level);
  }

  /** Un sort de classe est débloqué quand le niveau du perso l'atteint. */
  spellUnlocked(spell: ClassSpell): boolean {
    return this.model.level >= spell.level;
  }

  /** Sorts de classe effectivement débloqués (pour la fiche). */
  get unlockedClassSpells(): ClassSpell[] {
    return this.classSpells.filter((s) => this.spellUnlocked(s));
  }

  /* ── Origine géographique & religion (deux axes de création) ─────────────
     L'origine ancre le personnage dans une région, la religion dans un
     domaine. Ni l'une ni l'autre ne recouvre la race (biologie) ou le
     background (métier) : elles donnent gratuitement ce qui coûterait sinon un
     trait, un feat ou une compétence.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly origins = ORIGINS;
  readonly religions = RELIGIONS;

  get selectedOrigin(): OriginDef | undefined {
    return originByKey(this.model.identity.origin);
  }

  get selectedReligion(): ReligionDef | undefined {
    return religionByKey(this.model.identity.religion);
  }

  /** Traits que l'origine accorde d'office (résistance régionale, sens adapté). */
  get originTraitDefs(): CatalogTrait[] {
    return originTraits(this.selectedOrigin);
  }

  /**
   * Le regard des régions sur ce personnage : sur le domaine de sa religion
   * d'abord, puis sur ses domaines d'affinité. C'est un marqueur social, il
   * vaut même sans religion déclarée.
   */
  get standings(): DomainStanding[] {
    const keys = [
      ...(this.selectedReligion ? [this.selectedReligion.domain] : []),
      ...this.model.domains,
    ];
    return [...new Set(keys)]
      .map((d) => standingFor(d))
      .filter((st): st is DomainStanding => !!st);
  }

  /** Nom lisible d'un domaine, pour les lignes de marqueur social. */
  standingDomainName(domain: string): string {
    return domainName(domain);
  }

  /**
   * Ce qui accorde un trait, en clair. Les références vivent dans le catalogue
   * (`grantedBy`) : on les résout ici contre les datasets chargés.
   */
  traitSources(trait: CatalogTrait): string[] {
    return trait.grantedBy.map((ref) => {
      const [kind, key] = ref.split(':');
      if (kind === 'race') return `Race ${this.races().find((r) => r.key === key)?.name ?? key}`;
      if (kind === 'subrace') {
        const sub = this.races().flatMap((r) => r.subraces).find((x) => x.key === key);
        return `Sous-race ${sub?.name ?? key}`;
      }
      if (kind === 'background') {
        return `Background ${this.backgrounds().find((b) => b.key === key)?.name ?? key}`;
      }
      if (kind === 'origin') return `Origine ${originByKey(key)?.name ?? key}`;
      return ref;
    });
  }

  /** Traits accordés par la race, la sous-race, le background, son métier et l'origine. */
  get grantedTraitDefs(): CatalogTrait[] {
    return grantedTraits(
      this.selectedRace,
      this.model.identity.subrace,
      this.selectedBackground,
      this.selectedOrigin,
      this.model.identity.subbackground,
    ).map((t) => ({ ...t, icon: t.icon ?? DEFAULT_TRAIT_ICON }));
  }

  /** Traits pris dans le catalogue : ceux de la création et ceux d'un slot de feat. */
  get chosenTraitDefs(): CatalogTrait[] {
    return chosenTraits(this.model).map((t) => ({ ...t, icon: t.icon ?? DEFAULT_TRAIT_ICON }));
  }

  /**
   * Tout ce que le personnage porte comme trait, accordé ou choisi. C'est cette
   * liste — et pas seulement celle de la race — qui nourrit le calcul des stats
   * et le bloc Traits de la fiche imprimée.
   */
  get traits(): TraitDef[] {
    return [...this.grantedTraitDefs, ...this.chosenTraitDefs];
  }

  /* ── Traits de création & slots de feat (paliers 5/10/15/20) ──────────────
     Un slot de feat n'ajoute rien par lui-même : il ACHÈTE une chose parmi
     trois, jamais deux (point d'attribut, trait du catalogue, feat domanial).
     Le modèle ne garde donc qu'un seul choix par palier.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly featLevels = FEAT_LEVELS;
  readonly creationTraitSlots = CREATION_TRAIT_SLOTS;
  readonly traitCategories = TRAIT_CATEGORIES;

  /** Traits déjà accordés par la race ou le background — inutile de les reprendre. */
  private get grantedTraitKeys(): Set<string> {
    return new Set(this.grantedTraitDefs.map((t) => t.key));
  }

  /** Clés de traits déjà prises ailleurs (création + autres paliers). */
  private takenTraitKeys(exceptLevel?: number): Set<string> {
    const keys = [
      ...(this.model.creationTraits ?? []),
      ...(this.model.feats ?? [])
        .filter((f) => f.pick === 'trait' && f.trait && f.level !== exceptLevel)
        .map((f) => f.trait!),
    ];
    return new Set(keys);
  }

  /** Le catalogue groupé par famille, pour une liste de choix lisible. */
  get traitGroups(): { key: string; label: string; traits: CatalogTrait[] }[] {
    return this.traitCategories
      .map((c) => ({
        key: c.key,
        label: c.label,
        traits: TRAIT_CATALOG.filter((t) => t.category === c.key),
      }))
      .filter((g) => g.traits.length > 0);
  }

  /**
   * Pourquoi ce trait n'est pas prenable — chaîne vide s'il l'est. Déjà porté,
   * déjà pris ailleurs, ou attribut trop bas (Linguist et Poisoner demandent 13
   * en Intelligence).
   */
  traitBlockedReason(trait: CatalogTrait, exceptLevel?: number): string {
    if (this.grantedTraitKeys.has(trait.key)) return 'Déjà accordé';
    if (this.takenTraitKeys(exceptLevel).has(trait.key)) return 'Déjà pris';
    return traitRequirement(trait, this.finalAttributes);
  }

  /** Un trait est indisponible dès qu'une raison le bloque. */
  traitUnavailable(trait: CatalogTrait, exceptLevel?: number): boolean {
    return !!this.traitBlockedReason(trait, exceptLevel);
  }

  /* Traits de création */

  get creationTraitKeys(): string[] {
    return this.model.creationTraits ?? [];
  }

  get creationTraitsLeft(): number {
    return Math.max(0, this.creationTraitSlots - this.creationTraitKeys.length);
  }

  isCreationTrait(key: string): boolean {
    return this.creationTraitKeys.includes(key);
  }

  /** Prend ou rend un trait de création (dans la limite des emplacements). */
  toggleCreationTrait(trait: CatalogTrait): void {
    const current = [...this.creationTraitKeys];
    const at = current.indexOf(trait.key);
    if (at >= 0) current.splice(at, 1);
    else if (current.length < this.creationTraitSlots && !this.traitUnavailable(trait)) {
      current.push(trait.key);
    }
    this.model.creationTraits = current;
  }

  /* Slots de feat */

  /** Les quatre paliers, ouverts ou non, avec le choix qui y a été fait. */
  get featSlots(): { level: number; open: boolean; choice: FeatChoice | undefined }[] {
    const open = new Set(featSlotsFor(this.model.level));
    return this.featLevels.map((level) => ({
      level,
      open: open.has(level),
      choice: featChoiceAt(this.model, level),
    }));
  }

  /** Paliers ouverts encore vides — ce qu'il reste à dépenser. */
  get featSlotsPending(): number {
    return this.featSlots.filter((s) => s.open && !s.choice).length;
  }

  featChoiceAt(level: number): FeatChoice | undefined {
    return featChoiceAt(this.model, level);
  }

  /** Nature du choix fait à un palier (`''` = rien de décidé). */
  featPick(level: number): FeatPick | '' {
    return this.featChoiceAt(level)?.pick ?? '';
  }

  /** Fixe (ou efface) la nature du choix d'un palier, en repartant à vide. */
  setFeatPick(level: number, pick: FeatPick | ''): void {
    const feats = (this.model.feats ?? []).filter((f) => f.level !== level);
    if (pick) feats.push({ level, pick });
    this.model.feats = feats.sort((a, b) => a.level - b.level);
  }

  /** Complète le choix d'un palier (attribut, trait ou feat domanial). */
  private patchFeat(level: number, patch: Partial<FeatChoice>): void {
    const feats = [...(this.model.feats ?? [])];
    const at = feats.findIndex((f) => f.level === level);
    if (at < 0) return;
    feats[at] = { ...feats[at], ...patch };
    this.model.feats = feats;
  }

  setFeatAttribute(level: number, attribute: AttributeKey | ''): void {
    this.patchFeat(level, { attribute: attribute || undefined });
  }

  setFeatTrait(level: number, trait: string): void {
    this.patchFeat(level, { trait: trait || undefined });
  }

  setFeatDomainFeat(level: number, key: string): void {
    const found = key ? findDomainFeat(key) : undefined;
    this.patchFeat(level, { feat: found?.feat.key, domain: found?.domain });
  }

  /** Points d'attribut déjà achetés sur un slot, par attribut. */
  get featAttributePoints(): Record<AttributeKey, number> {
    return featAttributeBonuses(this.model);
  }

  /** Domaines où ce personnage peut prendre un feat (affinités + branche du background). */
  get featDomains(): string[] {
    return featDomainsFor(this.model, this.traits);
  }

  featDomainName(key: string): string {
    return domainName(key);
  }

  /** Feats proposés à un palier, groupés par domaine. */
  featOptions(level: number): { domain: string; label: string; feats: DomainFeatDef[] }[] {
    return this.featDomains
      .map((domain) => ({
        domain,
        label: domainName(domain),
        feats: domainFeats(domain).filter((f) => f.level <= level),
      }))
      .filter((g) => g.feats.length > 0);
  }

  /** Feats domaniaux déjà pris ailleurs (clés), palier courant exclu. */
  private takenFeatKeys(exceptLevel?: number): Set<string> {
    return new Set(
      (this.model.feats ?? [])
        .filter((f) => f.pick === 'domain' && f.feat && f.level !== exceptLevel)
        .map((f) => f.feat!),
    );
  }

  /**
   * Pourquoi ce feat n'est pas prenable à ce palier — chaîne vide s'il l'est.
   * Sert autant à désactiver l'option qu'à expliquer le refus.
   */
  featBlockedReason(feat: DomainFeatDef, level: number): string {
    const taken = this.takenFeatKeys(level);
    if (taken.has(feat.key)) return 'Déjà pris';
    const clash = (feat.excludes ?? []).filter((k) => taken.has(k));
    if (clash.length) {
      const names = clash.map((k) => findDomainFeat(k)?.feat.name ?? k).join(', ');
      return 'Exclusif avec ' + names;
    }
    if (feat.level > level) return 'Palier ' + feat.level + ' requis';
    return '';
  }

  /** Feat domanial choisi à un palier, résolu depuis la fiche de domaine. */
  featDefAt(level: number): DomainFeatDef | undefined {
    const key = this.featChoiceAt(level)?.feat;
    return key ? findDomainFeat(key)?.feat : undefined;
  }

  /** Trait choisi à un palier, résolu depuis le catalogue. */
  traitDefAt(level: number): CatalogTrait | undefined {
    const key = this.featChoiceAt(level)?.trait;
    return key ? catalogTrait(key) : undefined;
  }

  /** Feats domaniaux portés par la fiche (bloc imprimé). */
  get sheetDomainFeats(): { feat: DomainFeatDef; domain: string }[] {
    return chosenDomainFeats(this.model);
  }

  /** Ce que chaque palier atteint a acheté, prêt à afficher sur la fiche. */
  get featRows(): { level: number; label: string; detail: string }[] {
    const rows: { level: number; label: string; detail: string }[] = [];
    for (const slot of this.featSlots) {
      const c = slot.choice;
      if (!slot.open || !c) continue;
      if (c.pick === 'attribute' && c.attribute) {
        const label = this.attributes.find((a) => a.key === c.attribute)?.label ?? c.attribute;
        rows.push({ level: slot.level, label: "Point d'attribut", detail: label + ' +1' });
      } else if (c.pick === 'trait') {
        const t = c.trait ? catalogTrait(c.trait) : undefined;
        if (t) rows.push({ level: slot.level, label: 'Trait', detail: t.name });
      } else if (c.pick === 'domain') {
        const found = c.feat ? findDomainFeat(c.feat) : undefined;
        if (found) {
          rows.push({
            level: slot.level,
            label: domainName(found.domain),
            detail: found.feat.name,
          });
        }
      }
    }
    return rows;
  }

  /* ── Ce que les mains peuvent tenir ───────────────────────────────────────
     Une arme à deux mains prend les DEUX : ni arme secondaire, ni bouclier.
     La règle se joue à trois endroits qui doivent s'accorder — la saisie (on
     ne peut plus rien y écrire), l'affichage (l'emplacement est montré
     condamné) et les totaux (ce qui y traîne ne compte pas). Une fiche
     enregistrée avant la règle peut très bien porter les deux : on l'ignore
     plutôt que de la laisser jouer.
  ─────────────────────────────────────────────────────────────────────────── */

  /** L'arme de main principale réclame-t-elle les deux mains ? */
  get bothHandsTaken(): boolean {
    const name = this.model.equipment[MAIN_HAND_SLOT];
    const weapon = name ? this.weaponInfo().get(name) : undefined;
    return isTwoHanded(weapon?.weaponCategory);
  }

  /** L'emplacement est-il condamné par ce qu'on tient déjà ? */
  slotBlocked(slotKey: string): boolean {
    return slotKey === OFFHAND_SLOT && this.bothHandsTaken;
  }

  /** Ce qu'un emplacement porte VRAIMENT — rien s'il est condamné. */
  itemIn(slotKey: string): string {
    return this.slotBlocked(slotKey) ? '' : (this.model.equipment[slotKey] ?? '');
  }

  /** Suggestions d'un emplacement : aucune tant qu'il est condamné. */
  optionsFor(slotKey: string): string[] {
    return this.slotBlocked(slotKey) ? [] : (this.equipmentOptions()[slotKey] ?? []);
  }

  /**
   * Vide la main faible dès que la main principale réclame les deux mains.
   *
   * Appelé à chaque changement d'équipement : c'est le moment où la contrainte
   * peut naître (on vient de prendre une claymore) comme disparaître (on repose
   * la claymore, l'emplacement se rouvre — vide, ce qui est honnête : on ne
   * rend pas une dague qu'on n'a plus).
   */
  onEquipmentChange(): void {
    if (this.bothHandsTaken && this.model.equipment[OFFHAND_SLOT]) {
      this.model.equipment[OFFHAND_SLOT] = '';
    }
  }

  /** Somme des contributions de l'équipement porté : défenses + poids. */
  get equipmentBonus(): { def_phy: number; def_mag: number; weight: number } {
    const stats = this.equipmentStats();
    let defPhy = 0;
    let defMag = 0;
    let weight = 0;
    for (const slot of EQUIPMENT_SLOTS) {
      const name = this.itemIn(slot.key);
      const s = name ? stats.get(name) : undefined;
      if (!s) continue;
      defPhy += s.physicalArmor;
      defMag += s.magicalProtection;
      weight += s.weight;
    }
    return { def_phy: defPhy, def_mag: defMag, weight: this.round2(weight) };
  }

  /**
   * Bonus de stats accordés par ce qui est PORTÉ, une ligne par objet et par
   * stat. L'objet est nommé plutôt que fondu dans un « Équipement » anonyme :
   * l'infobulle sert à vérifier un total, donc à savoir d'où vient chaque point.
   */
  private get wornStatEffects(): { label: string; key: string; value: number }[] {
    const stats = this.equipmentStats();
    const out: { label: string; key: string; value: number }[] = [];
    for (const slot of EQUIPMENT_SLOTS) {
      const name = this.itemIn(slot.key);
      const worn = name ? stats.get(name) : undefined;
      for (const effect of worn?.statEffects ?? []) {
        const value = Number(effect.value) || 0;
        if (value) out.push({ label: name, key: effect.key, value });
      }
    }
    return out;
  }

  /** Détail combat des armes équipées (main + secondaire), pour l'affichage de la fiche. */
  get equippedWeapons(): EquippedWeapon[] {
    const info = this.weaponInfo();
    const out: EquippedWeapon[] = [];
    for (const slot of EQUIPMENT_SLOTS) {
      if (slot.key !== MAIN_HAND_SLOT && slot.key !== OFFHAND_SLOT) continue;
      const name = this.itemIn(slot.key);
      const w = name ? info.get(name) : undefined;
      if (!w) continue;
      const cat = w.weaponCategory ? weaponCategory(w.weaponCategory) : undefined;
      const mod = cat ? abilityModifier(this.finalAttributes[cat.attributeDamage]) : 0;
      out.push({
        slotKey: slot.key,
        slotLabel: slot.label,
        name,
        minDamage: w.minDamage,
        maxDamage: w.maxDamage,
        modMin: Math.max(0, w.minDamage + mod),
        modMax: Math.max(0, w.maxDamage + mod),
        damageType: cat ? DAMAGE_TYPE_LABELS[cat.damageType] ?? cat.damageType : '—',
        attributeDamage: cat ? ATTRIBUTE_LABELS[cat.attributeDamage] ?? cat.attributeDamage : '—',
        enduranceCost: cat?.enduranceCost ?? 0,
        category: cat?.name ?? '—',
        // Ce que le combat en fera : sans maîtrise, l'entraînement ne compte pas
        // dans le seuil de toucher (cf. `masterySteps` dans combat/rules.ts).
        proficient: !!w.weaponCategory && this.masteredWeapons.some((p) => p.key === w.weaponCategory),
      });
    }
    return out;
  }

  /** Arme équipée dans un emplacement donné (pour afficher ses dégâts dans le slot). */
  weaponForSlot(slotKey: string): EquippedWeapon | undefined {
    return this.equippedWeapons.find((w) => w.slotKey === slotKey);
  }

  /** Valeurs de protection de la pièce équipée dans un emplacement (armure + magie). */
  armorForSlot(slotKey: string): EquippedArmor | undefined {
    const name = this.itemIn(slotKey);
    const s = name ? this.equipmentStats().get(name) : undefined;
    if (!s || (s.physicalArmor === 0 && s.magicalProtection === 0)) return undefined;
    return {
      physicalArmor: s.physicalArmor,
      magicalProtection: s.magicalProtection,
      category: s.armorCategory ? armorCategoryName(s.armorCategory) : '',
      mastery: armorMastery(s.armorCategory, this.masteredArmors),
    };
  }

  /** Stats finales = génétique + montée de niveau (+ modif. d'attribut) + traits + équipement. */
  get finalStats(): Record<StatKey, number> {
    const stats = computeStats(
      this.model,
      this.selectedRace,
      this.selectedClass,
      this.traits,
      this.finalAttributes,
    );
    const eq = this.equipmentBonus;
    stats.def_phy += eq.def_phy;
    stats.def_mag += eq.def_mag;
    // Bonus des objets portés (talismans, anneaux…). Une clé hors des stats de
    // combat est ignorée ici : un objet qui prétendrait relever la Force ne peut
    // pas le faire par ce chemin, les attributs se calculent ailleurs.
    for (const { key, value } of this.wornStatEffects) {
      if (key in stats) stats[key as StatKey] += value;
    }
    return stats;
  }

  /** Détail du calcul d'une stat (pour l'infobulle de vérification). */
  statParts(statKey: StatKey): StatContribution[] {
    const parts = statContributions(
      this.model,
      this.selectedRace,
      this.selectedClass,
      this.traits,
      this.finalAttributes,
      statKey,
    ).parts;
    if (statKey === 'def_phy' || statKey === 'def_mag') {
      const eq = this.equipmentBonus;
      const value = statKey === 'def_phy' ? eq.def_phy : eq.def_mag;
      if (value) parts.push({ label: 'Équipement', value });
    }
    for (const effect of this.wornStatEffects) {
      if (effect.key === statKey) parts.push({ label: effect.label, value: effect.value });
    }
    return parts;
  }

  /** Échelle des barres = plus haute valeur THÉORIQUE par niveau (classe +
   *  modif. d'attribut + génétique) parmi les stats en barre. */
  get barScale(): number {
    return maxTheoreticalScale(
      this.model,
      this.selectedRace,
      this.selectedClass,
      this.traits,
      this.finalAttributes,
      this.barStats.map((s) => s.key),
    );
  }

  /** Largeur (%) d'une barre, relative à la plus haute stat, bornée 0–100. */
  barPct(value: number, max: number): number {
    return Math.min(100, Math.max(0, (Math.max(0, value) / max) * 100));
  }

  /** Bascule entre tirage aléatoire et moyenne. */
  setStatMode(mode: StatMode): void {
    this.model.statMode = mode;
  }

  /** Relance le tirage aléatoire des stats (nouvelle graine). */
  rerollStats(): void {
    this.model.statSeed = randomSeed();
  }

  // ── Survie : faim, soif, fatigue ──────────────────────────────────────────

  /**
   * Les trois jauges prêtes à afficher. Comme les réserves, la fiche n'en
   * garde que le CREUX : le maximum dépend de la Constitution (Faim 48 + CON×6,
   * Soif 16 + CON×2, Repos 15) et se recalcule à chaque lecture.
   */
  get survivalRows(): SurvivalRow[] {
    const attributes = this.finalAttributes;
    const maxima = survivalMaxima(attributes);
    const loss = sheetSurvivalLoss(this.model, attributes);
    const con = abilityModifier(attributes.constitution);
    return SURVIVAL_GAUGES.map((gauge) => {
      const max = maxima[gauge.key];
      const current = survivalPoints(max, loss[gauge.key]);
      const tier = survivalTier(gauge.key, current, max);
      return {
        gauge,
        max,
        current,
        pct: max > 0 ? (current / max) * 100 : 0,
        tier,
        stage: gauge.stages[tier],
        effects: describeNeedEffect(needEffect(gauge.key, tier, con)).join(' · '),
      };
    });
  }

  /**
   * Le Manque de mana, lu sur la Réserve : il n'a pas de jauge à lui, mais il
   * pèse comme les trois autres (cf. section 18 du document de survie).
   * Rien pour un personnage sans Réserve.
   */
  get manaNeed(): { tier: SurvivalTier; stage: string; effects: string } | null {
    const mana = this.poolRows.find((row) => row.gauge.key === 'mana');
    const tier = mana ? manaTier(mana.current, mana.max) : undefined;
    if (!tier) return null;
    const con = abilityModifier(this.finalAttributes.constitution);
    return {
      tier,
      stage: MANA_NEED.stages[tier],
      effects: describeNeedEffect(manaEffect(tier, con)).join(' · '),
    };
  }

  /** Points de Faim consommés par segment (FOR élevée : plus d'un). */
  get hungerRate(): number {
    return hungerPerSegment(this.finalAttributes);
  }

  /** Une jauge au moins est entamée : le bouton « tout au plein » a un sens. */
  get survivalDrained(): boolean {
    return this.survivalRows.some((row) => row.current < row.max);
  }

  /**
   * Fixe les points restants d'une jauge. On stocke le creux ; une fiche
   * d'avant la refonte est convertie au premier geste.
   */
  setSurvival(row: SurvivalRow, current: number | null): void {
    // Champ vidé le temps de retaper un nombre : ce n'est pas un zéro.
    if (current === null || current === undefined || Number.isNaN(Number(current))) return;
    const loss = sheetSurvivalLoss(this.model, this.finalAttributes);
    loss[row.gauge.key] = row.max - Math.round(clampSurvival(row.max, current));
    this.model.survivalLoss = loss;
    delete this.model.survival;
  }

  /** Un segment passe, un repas tombe : la jauge bouge d'un pas. */
  adjustSurvival(row: SurvivalRow, delta: number): void {
    this.setSurvival(row, row.current + delta);
  }

  /** Remet toutes les jauges au plein (repas chaud, gourde remplie, nuit entière). */
  refillSurvival(): void {
    this.model.survivalLoss = noSurvivalLoss();
    delete this.model.survival;
  }

  // ── Réserves : points de vie, endurance, mana ─────────────────────────────

  /**
   * Les trois réserves prêtes à afficher : maximum recalculé, niveau du moment,
   * remplissage et verdict.
   *
   * Une seule lecture de `finalStats` pour les trois — le calcul remonte race,
   * classe, traits et équipement, on ne le refait pas par ligne. Le template
   * mémorise le résultat (`@let`), comme il le fait déjà des stats.
   */
  get poolRows(): PoolRow[] {
    const stats = this.finalStats;
    return POOL_GAUGES.map((gauge) => {
      const max = Math.max(0, Math.round(stats[gauge.key]));
      const current = poolCurrent(max, this.model.poolLoss?.[gauge.key]);
      return {
        gauge,
        max,
        current,
        pct: max > 0 ? (current / max) * 100 : 0,
        stage: poolStage(gauge, current, max),
      };
    });
  }

  /** Une réserve au moins est entamée : le bouton de récupération a un sens. */
  get poolsDrained(): boolean {
    return this.poolRows.some((row) => row.current < row.max);
  }

  /**
   * Fixe le niveau du moment d'une réserve. C'est le CREUX qui est stocké : la
   * fiche ne garde jamais un total, elle garde ce qui manque au maximum (cf.
   * `poolLoss`).
   */
  setPool(key: PoolKey, current: number | null, max: number): void {
    // Champ vidé le temps de retaper un nombre : on ne le lit pas comme un
    // zéro, sinon la réserve tombe à sec sous les doigts du joueur.
    if (current === null || current === undefined || Number.isNaN(Number(current))) return;
    const loss = (this.model.poolLoss ??= noPoolLoss());
    loss[key] = clampPoolLoss(max, max - Number(current));
  }

  /** Coup encaissé, souffle repris, sort lancé : la réserve bouge d'un pas. */
  adjustPool(row: PoolRow, delta: number): void {
    this.setPool(row.gauge.key, row.current + delta, row.max);
  }

  /** Tout au plein — une nuit de repos referme les plaies et refait les forces. */
  refillPools(): void {
    this.model.poolLoss = noPoolLoss();
  }

  /**
   * Redimensionne et recompresse une image (WebP, repli PNG) pour alléger
   * fortement la fiche. C'est aussi la définition qui partira dans le PDF, où
   * l'image est retranscodée en JPEG (cf. `toPdfImage` dans sheet-pdf.ts).
   */
  private compressImage(file: File, maxDim: number, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/webp', quality);
        if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
        resolve(out);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image'));
      };
      img.src = url;
    });
  }

  /** Lit, valide, compresse une image puis confie son data URL à `assign`. */
  private async readImage(
    event: Event,
    maxBytes: number,
    maxDim: number,
    assign: (url: string) => void,
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de re-sélectionner le même fichier plus tard
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Le fichier choisi n’est pas une image.');
      return;
    }
    if (file.size > maxBytes) {
      this.error.set(`Image trop lourde (max ${Math.round(maxBytes / 1024 / 1024)} Mo).`);
      return;
    }
    this.error.set(null);
    try {
      assign(await this.compressImage(file, maxDim));
    } catch {
      this.error.set('Image illisible.');
    }
  }

  // Image originale du portrait, gardée en mémoire pour recadrer à la volée.
  private portraitImg: HTMLImageElement | null = null;

  async onPortraitSelected(event: Event): Promise<void> {
    await this.readImage(event, MAX_PORTRAIT_BYTES, 512, (url) => {
      this.model.identity.portraitOriginal = url;
      this.model.identity.portraitZoom = 1;
      this.model.identity.portraitPosX = 50;
      this.model.identity.portraitPosY = 50;
    });
    if (this.model.identity.portraitOriginal) this.loadPortraitOriginal(true);
  }

  removePortrait(): void {
    this.portraitImg = null;
    this.model.identity.portrait = '';
    this.model.identity.portraitOriginal = '';
    this.model.identity.portraitZoom = 1;
    this.model.identity.portraitPosX = 50;
    this.model.identity.portraitPosY = 50;
  }

  /** Charge l'image originale en mémoire ; rebake ensuite si demandé. */
  private loadPortraitOriginal(rebake = false): void {
    const src = this.model.identity.portraitOriginal;
    if (!src) {
      this.portraitImg = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      this.portraitImg = img;
      if (rebake) this.rebakePortrait();
    };
    img.src = src;
  }

  /** Recadre le portrait (zoom + point focal) dans une image cuite, façon
   *  object-fit: cover. L'image stockée est donc déjà recadrée → même cadrage
   *  dans l'aperçu et dans le PDF. */
  rebakePortrait(): void {
    const img = this.portraitImg;
    if (!img || !img.naturalWidth) return;
    const TW = 240;
    const TH = 296; // ratio proche du cadre de la fiche
    const aspect = TW / TH;
    const i = this.model.identity;
    const zoom = Math.max(1, Number(i.portraitZoom) || 1);
    const px = Math.min(100, Math.max(0, Number(i.portraitPosX) || 0));
    const py = Math.min(100, Math.max(0, Number(i.portraitPosY) || 0));

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    let rw: number;
    let rh: number;
    if (iw / ih > aspect) {
      rh = ih;
      rw = ih * aspect;
    } else {
      rw = iw;
      rh = iw / aspect;
    }
    rw /= zoom;
    rh /= zoom;
    const rx = (iw - rw) * (px / 100);
    const ry = (ih - rh) * (py / 100);

    const canvas = document.createElement('canvas');
    canvas.width = TW;
    canvas.height = TH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, rx, ry, rw, rh, 0, 0, TW, TH);
    let out = canvas.toDataURL('image/webp', 0.85);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
    this.model.identity.portrait = out;
  }

  onFullImageSelected(event: Event): void {
    void this.readImage(event, MAX_FULL_IMAGE_BYTES, 1024, (url) => (this.model.identity.fullImage = url));
  }

  removeFullImage(): void {
    this.model.identity.fullImage = '';
  }

  private load(id: string): void {
    this.sheetId = id;
    this.loading.set(true);
    this.sheets.get(id).subscribe({
      next: (stored) => {
        this.model = this.normalize(stored.data);
        this.loadPortraitOriginal(false); // permet de réajuster le recadrage
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Fiche introuvable.');
        this.loading.set(false);
      },
    });
  }

  // Complète une fiche reçue avec les valeurs par défaut manquantes (robustesse
  // si le modèle évolue ou si une fiche ancienne n'a pas tous les champs).
  private normalize(data: Partial<CharacterSheet>): CharacterSheet {
    const base = emptySheet();
    // XP d'abord : c'est lui qui fixe le niveau. Une fiche antérieure à ce champ
    // n'a qu'un niveau — on la place alors au seuil exact de ce niveau.
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(data.level) || 1)));
    const xp =
      typeof data.xp === 'number' && Number.isFinite(data.xp)
        ? Math.max(0, Math.min(XP_MAX, Math.round(data.xp)))
        : xpForLevel(level);

    return {
      identity: { ...base.identity, ...data.identity },
      xp,
      level: levelForXp(xp),
      domains: Array.isArray(data.domains) ? data.domains.slice(0, 3) : base.domains,
      attributes: { ...base.attributes, ...data.attributes },
      attributeMode: data.attributeMode === 'roll' ? 'roll' : 'pointbuy',
      attributePointBuy: { ...base.attributePointBuy!, ...data.attributePointBuy },
      attributeRolls: Array.isArray(data.attributeRolls) ? data.attributeRolls : [],
      attributeAssign: { ...base.attributeAssign!, ...data.attributeAssign },
      // Jauges de survie : on garde le creux. Une fiche d'avant la refonte en
      // points garde ses anciens crans, convertis à la lecture (cf.
      // `sheetSurvivalLoss`) ; une fiche d'avant les jauges repart au plein.
      survival: data.survivalLoss ? undefined : data.survival,
      survivalLoss: data.survivalLoss
        ? (Object.fromEntries(
            SURVIVAL_GAUGES.map((g) => [g.key, Math.max(0, Number(data.survivalLoss?.[g.key]) || 0)]),
          ) as CharacterSheet['survivalLoss'])
        : undefined,
      // Réserves : on ne borne pas le creux ici (le maximum dépend de stats que
      // la fiche n'a pas encore assemblées), seulement à l'affichage.
      poolLoss: Object.fromEntries(
        POOL_GAUGES.map((g) => [g.key, Math.max(0, Math.round(Number(data.poolLoss?.[g.key]) || 0))]),
      ) as CharacterSheet['poolLoss'],
      statMode: data.statMode === 'mean' ? 'mean' : 'random',
      // Graine stockée conservée (stats stables) ; sinon valeur stable par défaut.
      statSeed: typeof data.statSeed === 'number' ? data.statSeed : 1,
      proficiencyBonus: data.proficiencyBonus ?? base.proficiencyBonus,
      skills: Array.isArray(data.skills) ? data.skills : [],
      // Ouvertures manuelles : seulement des branches qui existent.
      nonPolarUnlocks: Array.isArray(data.nonPolarUnlocks)
        ? [...new Set(data.nonPolarUnlocks.filter((k): k is string => NONPOLAR_MAGICS.some((m) => m.key === k)))]
        : [],
      creationTraits: this.normalizeCreationTraits(data.creationTraits),
      raceAttributePicks: Array.isArray(data.raceAttributePicks)
        ? (data.raceAttributePicks.filter(
            (k): k is AttributeKey => typeof k === 'string',
          ) as AttributeKey[])
        : [],
      languages: Array.isArray(data.languages)
        ? [...new Set(data.languages.filter((k): k is string => typeof k === 'string' && !!languageByKey(k)))]
        : [],
      feats: this.normalizeFeats(data.feats),
      spells: this.normalizeSpells(data.spells),
      // Ajouts manuels : une fiche antérieure à ces champs n'en a aucun.
      extraWeaponProficiencies: normalizeKeys(data.extraWeaponProficiencies),
      extraArmorProficiencies: normalizeKeys(data.extraArmorProficiencies),
      goldDelta: Math.round(Number(data.goldDelta) || 0),
      inventory: data.inventory ?? [],
      equipment: { ...base.equipment, ...data.equipment },
      // Matériaux de Terre : cette lecture est une LISTE BLANCHE — un champ
      // absent d'ici est purement et simplement perdu au rechargement, quoi
      // qu'on ait sauvegardé. C'est ce qui donnait l'impression que l'étude ne
      // s'enregistrait pas.
      earthMaterials: normalizeTraining(data.earthMaterials, levelForXp(xp)),
      // Les deux catalogues se partagent les cinq places : ce que la Terre a
      // pris n'est plus disponible pour les Plantes, et la relecture doit le
      // savoir — sans quoi une fiche chargée rouvrirait des places déjà prises.
      plantSpecies: normalizePlantTraining(
        data.plantSpecies,
        levelForXp(xp),
        normalizeTraining(data.earthMaterials, levelForXp(xp))?.studied.length ?? 0,
      ),
      notes: data.notes ?? '',
    };
  }

  /**
   * Traits de création retenus : des clés du catalogue, sans doublon, dans la
   * limite des emplacements. Une fiche antérieure au champ n'en a aucun.
   */
  private normalizeCreationTraits(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const keys = value.filter((k): k is string => typeof k === 'string' && isPickableTrait(k) && !!catalogTrait(k));
    return [...new Set(keys)].slice(0, CREATION_TRAIT_SLOTS);
  }

  /**
   * Choix de feat retenus : un par palier connu, et seulement ce que le choix
   * exige réellement (l'attribut d'un point d'attribut, la clé d'un trait, celle
   * d'un feat domanial). Un choix incomplet reste enregistré tel quel — la
   * fiche affiche alors le palier comme « à terminer » plutôt que de l'effacer.
   */
  private normalizeFeats(value: unknown): FeatChoice[] {
    if (!Array.isArray(value)) return [];
    const out = new Map<number, FeatChoice>();
    for (const raw of value) {
      const f = (raw ?? {}) as Partial<FeatChoice>;
      const level = Math.round(Number(f.level));
      if (!FEAT_LEVELS.includes(level)) continue;
      if (f.pick !== 'attribute' && f.pick !== 'trait' && f.pick !== 'domain') continue;
      const choice: FeatChoice = { level, pick: f.pick };
      if (f.pick === 'attribute' && ATTRIBUTES.some((a) => a.key === f.attribute)) {
        choice.attribute = f.attribute;
      }
      if (f.pick === 'trait' && typeof f.trait === 'string' && catalogTrait(f.trait) && isPickableTrait(f.trait)) {
        choice.trait = f.trait;
      }
      if (f.pick === 'domain' && typeof f.feat === 'string') {
        const found = findDomainFeat(f.feat);
        if (found) {
          choice.feat = found.feat.key;
          choice.domain = found.domain;
        }
      }
      out.set(level, choice);
    }
    return [...out.values()].sort((a, b) => a.level - b.level);
  }

  /**
   * Normalise le bloc de sorts. Accepte le nouveau format
   * `{ unlocked, equipped }` et migre l'ancien `{ known: Spell[] }` en gardant
   * uniquement les clés en `unlocked` (migration « débloqués seulement »).
   */
  private normalizeSpells(s: unknown): CharacterSpells {
    const rec = (s ?? {}) as {
      unlocked?: unknown; equipped?: unknown; states?: unknown;
      nodes?: unknown; ranks?: unknown; known?: unknown;
    };
    const uniqStrings = (arr: unknown): string[] =>
      Array.isArray(arr) ? [...new Set(arr.filter((k): k is string => typeof k === 'string' && !!k))] : [];

    // Clés débloquées (nouveau format `unlocked`, sinon migration de l'ancien `known`).
    const unlockedRaw = Array.isArray(rec.unlocked)
      ? uniqStrings(rec.unlocked)
      : uniqStrings((Array.isArray(rec.known) ? rec.known : []).map((x) => (x as { key?: unknown })?.key));
    const unlocked = unlockedRaw.filter((k) => !!findDomainSpell(k));

    // Les paliers de l'ancien arbre (`nodes`, `ranks`) deviennent de l'XP, pas
    // un build : ce qu'un joueur avait GAGNÉ lui est rendu, ce qu'il aurait
    // CHOISI ne lui est pas dicté. Il redépense son budget dans l'atelier.
    const src = (rec.states ?? {}) as Record<string, unknown>;
    const legacyNodes = (rec.nodes ?? {}) as Record<string, unknown>;
    const legacyRanks = (rec.ranks ?? {}) as Record<string, unknown>;
    const states: Record<string, SpellState> = {};
    for (const k of unlocked) {
      const state = this.normalizeSpellState(src[k]);
      if (!state.xp && !state.build) {
        state.xp = this.legacyXp(legacyNodes[k], legacyRanks[k]);
      }
      states[k] = state;
    }

    const equipped = uniqStrings(rec.equipped).filter((k) => unlocked.includes(k));
    return { unlocked, equipped, states };
  }

  /**
   * L'XP que vaut une progression de l'ancien format.
   *
   * Un arbre comptait sa racine comme un palier : un sort à N nœuds valait donc
   * N−1 améliorations, qu'on relit comme N−1 niveaux de sort. Le plafond de
   * niveau s'applique comme pour n'importe quelle XP — un arbre plus profond
   * que le barème ne donne pas plus que le maximum.
   */
  private legacyXp(nodes: unknown, rank: unknown): number {
    const paliers = Array.isArray(nodes)
      ? Math.max(0, nodes.filter((n) => typeof n === 'string').length - 1)
      : typeof rank === 'number' && Number.isFinite(rank)
        ? Math.max(0, Math.round(rank) - 1)
        : 0;
    if (!paliers) return 0;
    return xpThreshold(Math.min(paliers, DEFAULT_RULES.maxSpellLevel), DEFAULT_RULES);
  }

  /** Un état de sort relu d'une sauvegarde, ramené à quelque chose d'exploitable. */
  private normalizeSpellState(raw: unknown): SpellState {
    const r = (raw ?? {}) as { xp?: unknown; build?: unknown; lastReassignedAt?: unknown };
    const xp = typeof r.xp === 'number' && Number.isFinite(r.xp) && r.xp > 0 ? r.xp : 0;
    // Un build est un objet libre côté données : le moteur le normalise
    // lui-même (`normalizeBuild`) et ignore ce qu'il ne reconnaît pas.
    const build = r.build && typeof r.build === 'object' ? (r.build as SpellState['build']) : null;
    const at = typeof r.lastReassignedAt === 'string' ? r.lastReassignedAt : null;
    return { xp, build, lastReassignedAt: at };
  }

  // ── Valeurs calculées (appelées dans le template) ──────────────────────────

  /** Attributs finaux = base saisie + bonus de race + bonus de sous-race. */
  get finalAttributes(): Record<AttributeKey, number> {
    return computeAttributes(this.model, this.selectedRace, this.model.identity.subrace);
  }

  /**
   * Ce qui s'ajoute à la valeur saisie d'un attribut : race, sous-race, et les
   * points d'attribut achetés sur un slot de feat. Doit rester d'accord avec
   * `computeAttributes`, sinon la colonne « Total » ne s'expliquerait plus.
   */
  attrBonus(key: AttributeKey): number {
    return (
      attributeBonuses(this.selectedRace, this.model.identity.subrace, this.model.raceAttributePicks)[key] +
      this.featAttributePoints[key]
    );
  }

  // ── Achat de points des attributs (point-buy : base 8, budget 27, max 15) ──

  readonly baseAttribute = BASE_ATTRIBUTE;
  readonly minAttribute = MIN_ATTRIBUTE;
  readonly maxAttribute = MAX_ATTRIBUTE;
  readonly attributePoints = ATTRIBUTE_POINTS;

  /** Points dépensés = somme des coûts d'achat de chaque score (14/15 plus chers ;
   *  descendre sous 8 rend des points). */
  get pointsSpent(): number {
    return this.attributes.reduce(
      (sum, a) => sum + attributeCost(this.model.attributes[a.key]),
      0,
    );
  }

  get pointsRemaining(): number {
    return this.attributePoints - this.pointsSpent;
  }

  /** Vrai si on peut encore monter cet attribut (sous le max et budget suffisant). */
  canIncAttr(key: AttributeKey): boolean {
    const score = this.model.attributes[key];
    return score < MAX_ATTRIBUTE && this.pointsRemaining >= attributeIncrementCost(score);
  }

  /** Vrai si on peut encore baisser cet attribut (au-dessus du plancher). */
  canDecAttr(key: AttributeKey): boolean {
    return this.model.attributes[key] > MIN_ATTRIBUTE;
  }

  incAttr(key: AttributeKey): void {
    if (this.canIncAttr(key)) this.model.attributes[key]++;
  }

  decAttr(key: AttributeKey): void {
    if (this.canDecAttr(key)) this.model.attributes[key]--;
  }

  // ── Mode de génération des attributs (achat de points ou lancer de dés) ─────

  get attributeMode(): 'pointbuy' | 'roll' {
    return this.model.attributeMode ?? 'pointbuy';
  }

  /** Bascule le mode en conservant l'état de chaque mode (achat de points vs dés). */
  setAttributeMode(mode: 'pointbuy' | 'roll'): void {
    if (this.attributeMode === mode) return;
    if (mode === 'roll') {
      // On quitte l'achat de points : on mémorise ses scores, puis on rétablit les dés.
      this.model.attributePointBuy = { ...this.model.attributes };
      this.model.attributeMode = 'roll';
      this.applyRollAssignment();
    } else {
      // On revient à l'achat de points : on restaure les scores mémorisés.
      this.model.attributeMode = 'pointbuy';
      this.model.attributes = {
        ...(this.model.attributePointBuy ?? this.model.attributes),
      };
    }
  }

  private resetAssignment(): void {
    this.model.attributeAssign = Object.fromEntries(
      this.attributes.map((a) => [a.key, -1]),
    ) as Record<AttributeKey, number>;
  }

  /** Recalcule les scores depuis l'affectation des dés (base si non affecté). */
  private applyRollAssignment(): void {
    for (const a of this.attributes) {
      const idx = this.assignmentOf(a.key);
      this.model.attributes[a.key] =
        idx >= 0 ? this.attributeRolls[idx] ?? BASE_ATTRIBUTE : BASE_ATTRIBUTE;
    }
  }

  /** Valeurs actuellement tirées (4d6, dé le plus bas retiré). */
  get attributeRolls(): number[] {
    return this.model.attributeRolls ?? [];
  }

  /** Lance 6 fois 4d6 (dé le plus bas retiré) et réinitialise l'affectation. */
  rollAttributes(): void {
    this.model.attributeRolls = Array.from({ length: 6 }, () => roll4d6DropLowest());
    this.resetAssignment();
    this.applyRollAssignment();
  }

  /** Index du tirage affecté à un attribut (-1 si aucun). */
  assignmentOf(key: AttributeKey): number {
    return this.model.attributeAssign?.[key] ?? -1;
  }

  /** Tirages disponibles pour un attribut : ceux non pris par un autre attribut. */
  rollOptionsFor(key: AttributeKey): { idx: number; value: number }[] {
    const assign = this.model.attributeAssign ?? ({} as Record<AttributeKey, number>);
    const used = new Set(
      this.attributes.filter((a) => a.key !== key).map((a) => assign[a.key]).filter((i) => i >= 0),
    );
    return this.attributeRolls
      .map((value, idx) => ({ idx, value }))
      .filter((o) => !used.has(o.idx));
  }

  /** Affecte (ou retire) un tirage à un attribut et met à jour le score. */
  assignRoll(key: AttributeKey, idx: number): void {
    const assign =
      this.model.attributeAssign ??
      (this.model.attributeAssign = Object.fromEntries(
        this.attributes.map((a) => [a.key, -1]),
      ) as Record<AttributeKey, number>);
    assign[key] = idx;
    this.model.attributes[key] = idx >= 0 ? this.attributeRolls[idx] ?? BASE_ATTRIBUTE : BASE_ATTRIBUTE;
  }

  /** Vrai si un tirage donné est déjà affecté à un attribut. */
  isRollUsed(idx: number): boolean {
    const assign = this.model.attributeAssign ?? ({} as Record<AttributeKey, number>);
    return this.attributes.some((a) => assign[a.key] === idx);
  }

  /** Nombre de tirages déjà affectés (sur 6). */
  get rollsAssigned(): number {
    return this.attributeRolls.length ? this.attributes.filter((a) => this.assignmentOf(a.key) >= 0).length : 0;
  }

  modifier(key: AttributeKey): number {
    return abilityModifier(this.finalAttributes[key]);
  }

  // ── Compétences ────────────────────────────────────────────────────────────

  readonly skillLabel = skillLabel;

  /** Bonus de compétences accordés par le background (clé → valeur). */
  get backgroundSkills(): Map<string, number> {
    return backgroundSkillBonuses(this.selectedBackground);
  }

  /** Compétences sélectionnables pour la classe (clés). */
  get classSkillOptions(): string[] {
    return this.selectedClass?.skillOptions ?? [];
  }

  /** Nombre de compétences à choisir pour la classe. */
  get classSkillChoices(): number {
    return this.selectedClass?.skillChoices ?? 0;
  }

  /** Compétences choisies valides (présentes dans les options de la classe). */
  get chosenSkillCount(): number {
    const opts = this.classSkillOptions;
    return this.model.skills.filter((k) => opts.includes(k)).length;
  }

  isSkillChosen(key: string): boolean {
    return this.model.skills.includes(key);
  }

  /** Vraie si la compétence est « entraînée » (choisie via classe OU background). */
  isSkillTrained(key: string): boolean {
    return this.isSkillChosen(key) || (this.backgroundSkills.get(key) ?? 0) > 0;
  }

  toggleSkill(key: string): void {
    const i = this.model.skills.indexOf(key);
    if (i >= 0) {
      this.model.skills.splice(i, 1);
    } else if (this.chosenSkillCount < this.classSkillChoices) {
      this.model.skills.push(key);
    }
  }

  /** Au changement de classe : on retire les choix hors des nouvelles options. */
  onClassChange(): void {
    const opts = this.classSkillOptions;
    this.model.skills = this.model.skills.filter((k) => opts.includes(k));
  }

  /* ── Maîtrises d'armes et d'armures ─────────────────────────────────────── */

  /** Catalogue proposé à la saisie (datalist) — les catégories du jeu. Côté
   *  armures, seules celles qui s'apprennent : pas les vêtements. */
  readonly weaponCategories = WEAPON_CATEGORIES;
  readonly armorCategories = LEARNABLE_ARMOR_CATEGORIES;

  /** Champs de saisie des ajouts manuels (hors modèle : ils ne sont pas persistés). */
  weaponProficiencyDraft = '';
  armorProficiencyDraft = '';

  /** Armes maîtrisées : celles de la classe, puis celles ajoutées à la main. */
  get masteredWeapons(): Proficiency[] {
    return weaponProficiencies(this.selectedClass, this.model);
  }

  /** Armures maîtrisées : celles de la classe, puis celles ajoutées à la main. */
  get masteredArmors(): Proficiency[] {
    return armorProficiencies(this.selectedClass, this.model);
  }

  /** Infobulle d'une maîtrise : ce que la catégorie recouvre, quand on le sait. */
  weaponProficiencyHint(key: string): string {
    const cat = weaponCategory(key);
    if (!cat) return 'Ajoutée à la main';
    return `${cat.range} · ${cat.handling === 1 ? 'une main' : 'deux mains'} · ${cat.enduranceCost} end.`;
  }

  armorProficiencyHint(key: string): string {
    return armorCategory(key)?.description ?? 'Ajoutée à la main';
  }

  /**
   * Mention portée sous une pièce d'armure équipée. Vide pour un vêtement ou
   * pour un set qui ne déclare pas sa catégorie : la fiche ne commente que ce
   * qu'elle sait, faute de quoi elle ferait douter d'une tenue irréprochable.
   */
  armorNote(armor: EquippedArmor): string {
    // Tournure sans accord : les catégories mêlent féminin (armure lourde) et
    // masculin (bouclier), et « bouclier non maîtrisée » se voyait.
    if (armor.mastery === 'mastered') return `✦ ${armor.category.toLowerCase()} — sait s'en servir`;
    if (armor.mastery === 'unmastered') return `⚠ ${armor.category.toLowerCase()} — sans entraînement`;
    return '';
  }

  armorNoteHint(armor: EquippedArmor): string {
    return armor.mastery === 'mastered'
      ? `${armor.category} : le porteur a appris à s'en servir`
      : `${armor.category} : le porteur ne l'a jamais appris — il la porte, il ne la maîtrise pas`;
  }

  /**
   * Ajoute une maîtrise saisie à la main. La saisie est résolue en clé de
   * catégorie quand elle en désigne une (« Hache » → `axe`) : c'est à cette
   * condition que le combat la reconnaîtra sur une arme équipée.
   */
  addWeaponProficiency(): void {
    const key = resolveWeaponCategory(this.weaponProficiencyDraft);
    if (!key) return;
    const extra = (this.model.extraWeaponProficiencies ??= []);
    // Rien à ajouter si la classe l'accorde déjà, ou si elle y figure.
    if (!this.masteredWeapons.some((p) => p.key === key)) extra.push(key);
    this.weaponProficiencyDraft = '';
  }

  addArmorProficiency(): void {
    const key = resolveArmorCategory(this.armorProficiencyDraft);
    if (!key) return;
    const extra = (this.model.extraArmorProficiencies ??= []);
    if (!this.masteredArmors.some((p) => p.key === key)) extra.push(key);
    this.armorProficiencyDraft = '';
  }

  /** Retire une maîtrise ajoutée à la main (celles de la classe ne se retirent pas ici). */
  removeWeaponProficiency(key: string): void {
    const extra = this.model.extraWeaponProficiencies ?? [];
    const i = extra.indexOf(key);
    if (i >= 0) extra.splice(i, 1);
  }

  removeArmorProficiency(key: string): void {
    const extra = this.model.extraArmorProficiencies ?? [];
    const i = extra.indexOf(key);
    if (i >= 0) extra.splice(i, 1);
  }

  /** Bonus total : mod. attribut + valeurs du background + maîtrise (si choisie). */
  skillBonus(skillKey: string, attribute: AttributeKey): number {
    const bg = this.backgroundSkills.get(skillKey) ?? 0;
    const fromTraits = this.traitSkills.get(skillKey) ?? 0;
    const prof = this.isSkillChosen(skillKey) ? this.model.proficiencyBonus : 0;
    return abilityModifier(this.finalAttributes[attribute]) + bg + fromTraits + prof;
  }

  /** Bonus de compétence accordés par les traits portés (Soigneur : +1 en Médecine). */
  get traitSkills(): Map<string, number> {
    return traitSkillBonuses([...this.grantedTraitDefs, ...this.chosenTraitDefs]);
  }

  /** Arrondi à 2 décimales (évite les flottants type 0.30000000000004). */
  round2(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  /** Sac à dos actuellement équipé (donne un bonus de capacité et/ou allège le sac). */
  get equippedBag(): ResourceIndexEntry | undefined {
    return this.bagByName().get(this.model.equipment['bag'] ?? '');
  }

  get totalWeight(): number {
    // Contenu du sac, éventuellement allégé par le sac à dos équipé.
    const reduction = (this.equippedBag?.weightReductionPct ?? 0) / 100;
    const inventory =
      this.model.inventory.reduce(
        (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.weight) || 0),
        0,
      ) *
      (1 - reduction);
    // Équipement porté : ne compte qu'à 50 % (bien réparti sur le corps).
    const equipped = this.equipmentBonus.weight * EQUIPPED_WEIGHT_FACTOR;
    return this.round2(inventory + equipped);
  }

  /** Capacité de charge (kg) : 1,5 × score de Force + bonus du sac à dos équipé. */
  get carryCapacity(): number {
    return Math.round(this.finalAttributes.force * 1.5) + (this.equippedBag?.capacityBonus ?? 0);
  }

  /** Vrai si le poids transporté dépasse la capacité. */
  get overweight(): boolean {
    return this.totalWeight > this.carryCapacity;
  }

  /** Borne la quantité d'un objet entre 1 et 99. */
  clampQty(item: { qty: number }): void {
    item.qty = Math.max(1, Math.min(99, Math.round(Number(item.qty) || 1)));
  }

  // Affichage « sous-valeur (valeur) » façon « Elfe continental (elfe) ».
  private compose(main: string, parenthetical: string): string {
    const m = main?.trim();
    const p = parenthetical?.trim();
    if (m && p) return `${m} (${p})`;
    return m || p || '';
  }

  get raceDisplay(): string {
    return this.compose(this.model.identity.subrace, this.model.identity.race);
  }

  get backgroundDisplay(): string {
    return this.compose(this.model.identity.subbackground, this.model.identity.background);
  }

  /* ── Matériaux de Terre ──────────────────────────────────────────────────
     Le domaine de la Terre n'a pas un sort par pierre : il a un sort par
     famille, dont la saveur vient de ce qu'on sait façonner. Cette section est
     donc de la construction de personnage au même titre qu'une maîtrise
     d'arme — et elle n'apparaît que pour qui a le domaine.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly earthMaterials = MATERIALS.filter((m) => isEarthMaterial(m.key));
  readonly earthFamilies = EARTH_FAMILIES;


  /** Le personnage touche-t-il à la Terre ? Sinon, la section n'a rien à dire. */
  get hasEarthDomain(): boolean {
    return this.model.domains.includes('earth');
  }

  /** Le bloc de la fiche, créé à la première utilisation. */
  private get earthTraining(): EarthMaterialTraining {
    return (this.model.earthMaterials ??= { studied: [], known: [] });
  }

  /*
   * Filtrés : une fiche enregistrée avant que l'offre soit restreinte peut
   * porter du bois ou du cuir. On les ignore au lieu de les réécrire — ils ne
   * comptent alors plus de place d'étude et ne s'affichent plus, mais la
   * donnée reste intacte si la règle changeait.
   */
  get studiedMaterials(): string[] {
    return (this.model.earthMaterials?.studied ?? []).filter(isEarthMaterial);
  }

  get knownMaterials(): string[] {
    return (this.model.earthMaterials?.known ?? []).filter(isEarthMaterial);
  }

  get equippedMaterial(): string | undefined {
    return this.model.earthMaterials?.equipped;
  }

  /** Places d'étude ouvertes par le niveau, et celles déjà prises. */
  get studySlotsTotal(): number {
    return studySlots(this.model.level);
  }

  /**
   * Places prises, TOUTES sources confondues.
   *
   * Le repos long qu'on passe sur une belladone n'est plus disponible pour une
   * pierre : compter les deux catalogues séparément laisserait croire à dix
   * places quand il n'y en a que cinq.
   */
  get studySlotsUsed(): number {
    return this.studiedMaterials.length + this.studiedPlants.length;
  }

  /** Les matériaux d'une famille, pour l'affichage par colonne. */
  materialsIn(family: MaterialFamilyKey): Material[] {
    return materialsOfFamily(family);
  }

  /** Ce qui empêche d'étudier ce matériau, ou `null`. */
  studyBlocker(key: string): string | null {
    if (this.studiedMaterials.includes(key)) return null;
    return cannotStudy(key, this.studiedMaterials, this.model.level, this.studiedPlants.length);
  }

  /** Étudie le matériau, ou renonce à l'étude. */
  toggleStudied(key: string): void {
    const bloc = this.earthTraining;
    const i = bloc.studied.indexOf(key);
    if (i >= 0) {
      bloc.studied.splice(i, 1);
      // Renoncer à un composant, c'est renoncer à l'alliage qu'il permettait.
      bloc.studied = bloc.studied.filter(
        (m) => !(MATERIAL_BY_KEY.get(m)?.requires ?? []).includes(key),
      );
      if (bloc.equipped && !bloc.studied.includes(bloc.equipped)) bloc.equipped = undefined;
      return;
    }
    if (cannotStudy(key, bloc.studied, this.model.level, this.studiedPlants.length)) return;
    bloc.studied.push(key);
  }

  /** Marque un matériau comme vu ET touché, sans l'avoir étudié. */
  toggleKnown(key: string): void {
    const bloc = this.earthTraining;
    bloc.known ??= [];
    const i = bloc.known.indexOf(key);
    if (i >= 0) bloc.known.splice(i, 1);
    else bloc.known.push(key);
  }

  /** Le matériau qu'on porte en tête. Se change au repos, pas en plein combat. */
  setEquipped(key: string): void {
    const bloc = this.earthTraining;
    bloc.equipped = bloc.equipped === key ? undefined : key;
  }

  /** Nom affiché d'un matériau, depuis sa clé (résumé de l'aperçu). */
  materialName(key: string): string {
    return MATERIAL_BY_KEY.get(key)?.name ?? key;
  }

  /** Infobulle d'un matériau depuis sa clé. */
  materialTitle(key: string): string {
    const m = MATERIAL_BY_KEY.get(key);
    return m ? this.materialHint(m) : key;
  }

  /** Une ligne lisible pour l'infobulle d'un matériau. */
  materialHint(m: Material): string {
    return `${m.formation} — ${m.property}. ${m.effect}`;
  }

  /** Les régions où la matière se trouve vraiment, en clair. */
  materialRegions(m: Material): string {
    if (!m.native.length) return 'Nulle part : alliage, à conjurer';
    return m.native
      .map((k) => MATERIAL_REGIONS.find((r) => r.key === k)?.name ?? k)
      .join(', ');
  }

  /* ── Espèces végétales ───────────────────────────────────────────────────
     Le pendant botanique des matériaux : le domaine des Plantes a un sort par
     geste, et l'espèce employée décide de ce que ce geste produit. Trois
     degrés, comme la Terre, mais la plante CONNUE garde toute sa spécificité —
     elle coûte seulement plus cher à lancer.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly plantFamilies: PlantFamily[] = PLANT_FAMILIES;
  readonly plantTierLegend = [PLANT_TIERS.etudiee, PLANT_TIERS.connue, PLANT_TIERS.inconnue];

  /** Le personnage touche-t-il aux Plantes ? Sinon, la section n'a rien à dire. */
  get hasPlantDomain(): boolean {
    return this.model.domains.includes('plant');
  }

  /** Le bloc de la fiche, créé à la première utilisation. */
  private get plantTrainingBlock(): PlantSpeciesTraining {
    return (this.model.plantSpecies ??= { studied: [], known: [] });
  }

  /** Ce que l'atelier doit savoir du lecteur pour lire chaque espèce au bon degré. */
  get plantTraining(): PlantSpeciesTraining {
    return this.model.plantSpecies ?? { studied: [], known: [] };
  }

  get studiedPlants(): string[] {
    return (this.model.plantSpecies?.studied ?? []).filter((k) => PLANT_BY_KEY.has(k));
  }

  get knownPlants(): string[] {
    return (this.model.plantSpecies?.known ?? []).filter((k) => PLANT_BY_KEY.has(k));
  }

  get equippedPlant(): string | null {
    return this.model.plantSpecies?.equipped ?? null;
  }

  plantsIn(family: PlantFamilyKey): PlantSpecies[] {
    return plantsOfFamily(family);
  }

  /** Ce qui empêche d'étudier cette espèce, ou `null`. */
  plantStudyBlocker(key: string): string | null {
    if (this.studiedPlants.includes(key)) return null;
    return cannotStudyPlant(key, this.studiedPlants, this.model.level, this.studiedMaterials.length);
  }

  /** Étudie l'espèce, ou renonce à l'étude. */
  togglePlantStudied(key: string): void {
    const bloc = this.plantTrainingBlock;
    const i = bloc.studied.indexOf(key);
    if (i >= 0) {
      bloc.studied.splice(i, 1);
      return;
    }
    if (this.plantStudyBlocker(key)) return;
    bloc.studied.push(key);
    // Étudier ce qu'on connaissait déjà : la plante quitte la liste des connues,
    // sinon elle apparaîtrait aux deux degrés à la fois.
    bloc.known = (bloc.known ?? []).filter((k) => k !== key);
  }

  /** Marque une espèce comme reconnue et déjà maniée, sans étude. */
  togglePlantKnown(key: string): void {
    const bloc = this.plantTrainingBlock;
    // Une espèce étudiée est déjà mieux que connue : le bouton n'a rien à dire.
    if (bloc.studied.includes(key)) return;
    bloc.known ??= [];
    const i = bloc.known.indexOf(key);
    if (i >= 0) {
      bloc.known.splice(i, 1);
      if (bloc.equipped === key) bloc.equipped = undefined;
    } else bloc.known.push(key);
  }

  /**
   * L'espèce qu'on a dans la besace.
   *
   * Seulement une espèce étudiée ou connue : emporter une plante qu'on ne
   * saurait pas nommer ne changerait rien — le sort retomberait de toute façon
   * sur son geste nu.
   */
  setEquippedPlant(key: string | null): void {
    const bloc = this.plantTrainingBlock;
    if (!key || !(bloc.studied.includes(key) || (bloc.known ?? []).includes(key))) {
      bloc.equipped = undefined;
      return;
    }
    bloc.equipped = bloc.equipped === key ? undefined : key;
  }

  /** Le degré auquel le personnage connaît cette espèce. */
  plantTierOf(key: string): string {
    return PLANT_TIERS[plantTier(key, this.plantTraining)].label;
  }

  /** Une ligne lisible pour l'infobulle d'une espèce. */
  plantHint(p: PlantSpecies): string {
    return `${p.latin} — ${p.part}, ${p.property.toLowerCase()}. ${p.habitat}.`;
  }

  /** Nom affiché d'une espèce, depuis sa clé (résumé de l'aperçu). */
  plantName(key: string): string {
    return PLANT_BY_KEY.get(key)?.name ?? key;
  }

  /** Les régions où l'espèce pousse d'elle-même, en clair. */
  plantRegions(p: PlantSpecies): string {
    return p.native.map((k) => MATERIAL_REGIONS.find((r) => r.key === k)?.name ?? k).join(', ');
  }

  // ── Domaines de magie ──────────────────────────────────────────────────────

  isDomainSelected(key: string): boolean {
    return this.model.domains.includes(key);
  }

  /**
   * Dernier tirage d'affinité magique. Volontairement hors modèle : c'est le
   * compte rendu du jet (« Deux affinités », ou l'absence d'éveil), pas une
   * donnée de la fiche — seuls les domaines obtenus y sont écrits.
   */
  readonly magicRoll = signal<MagicAffinityRoll | null>(null);

  /** Chances du tirage, reprises du lore (affichées sous les domaines). */
  readonly affinityOdds = AFFINITY_ODDS;

  /**
   * Tire les affinités magiques : d'abord leur nombre (0 à 3, poids du lore),
   * puis les domaines selon la répartition du peuple choisi. Remplace la
   * sélection en cours — les sorts devenus hors domaine sont retirés.
   */
  rollMagicDomains(): void {
    const roll = rollMagicAffinity(this.selectedRace?.key);
    this.model.domains = [...roll.domains];
    this.magicRoll.set(roll);
    this.pruneSpells();
  }

  /** Domaines du dernier tirage, en toutes lettres (« Feu, Terre »). */
  get rolledDomainNames(): string {
    return (this.magicRoll()?.domains ?? []).map((k) => domainName(k)).join(', ');
  }

  /** Peuple servant de table de tirage (à défaut : moyenne des populations). */
  get affinitySourceLabel(): string {
    return this.selectedRace?.name ?? 'moyenne des peuples';
  }

  /* ── Magie non polarisée ──────────────────────────────────────────────
     Renforcement et Émission ne sont pas des affinités : rien à choisir, rien
     à tirer, et ils ne mangent aucun des trois emplacements de domaine. Ils
     s'ouvrent par un vécu — le trait d'un background, ou une enfance dans
     l'Archipel — et leurs sorts rejoignent alors le pool de la fiche.
  ─────────────────────────────────────────────────────────────────────────── */

  /**
   * Les deux branches, ouvertes ou non, avec ce qui les ouvre (ou ce qu'il
   * faudrait). On lit TOUS les traits portés, pas seulement ceux qu'accordent
   * race et background : Entraînement martial et Études magiques se prennent
   * aussi à la création ou sur un slot de feat (section 21), et ouvrent alors
   * la branche exactement pareil.
   */
  get nonPolarMagics(): {
    key: string;
    name: string;
    sigil: string;
    open: boolean;
    /** Ouverte à la main, et par rien d'autre : la seule qu'on puisse refermer. */
    byHand: boolean;
    via: string;
  }[] {
    const open = new Map(nonPolarAccess(this.model, this.traits).map((b) => [b.key, b.via]));
    return NONPOLAR_MAGICS.map((m) => ({
      ...m,
      open: open.has(m.key),
      byHand: open.get(m.key) === MANUAL_NONPOLAR_VIA,
      via: open.get(m.key) ?? NONPOLAR_HINT[m.key] ?? '',
    }));
  }

  /**
   * Ouvre ou referme une branche à la main.
   *
   * Sans effet sur une branche qu'un vécu ouvre déjà : la case n'aurait rien à
   * refermer. Refermer, en revanche, retire ses sorts du pool — comme un
   * changement de background le ferait.
   */
  toggleNonPolar(key: string): void {
    const opened = this.nonPolarMagics.find((m) => m.key === key);
    if (opened?.open && !opened.byHand) return;
    const current = this.model.nonPolarUnlocks ?? [];
    this.model.nonPolarUnlocks = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    this.onMagicAccessChange();
  }

  /** Clés des branches réellement ouvertes. */
  get openNonPolar(): string[] {
    return openNonPolarBranches(this.model, this.traits);
  }

  /**
   * Tout ce dont le personnage tire des sorts : ses domaines d'affinité et ses
   * branches non polarisées ouvertes.
   */
  get magicSources(): string[] {
    return [...this.model.domains, ...this.openNonPolar];
  }

  /**
   * Un changement de background ou d'origine peut FERMER une branche : les
   * sorts qu'elle fournissait ne sont alors plus proposés, donc plus tenus.
   */
  onMagicAccessChange(): void {
    this.pruneSpells();
  }

  toggleDomain(key: string): void {
    const selected = this.model.domains;
    const idx = selected.indexOf(key);
    if (idx >= 0) {
      selected.splice(idx, 1);
      this.pruneSpells(); // retirer les sorts d'un domaine désélectionné
    } else if (selected.length < 3) {
      selected.push(key);
    }
  }

  // ── Sorts : débloqués (appris) & équipés (loadout de combat) ────────────────

  /** Tout le pool de sorts de base des domaines choisis (+ combinaisons), trié par niveau puis nom. */
  get domainSpellPool(): DomainSpell[] {
    return availableSpellsFor(this.magicSources)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  /* ── Affinités : ce que le personnage encaisse mal, bien, ou pas du tout ──
     Assemblées par la MÊME fonction que la fabrique de combattants : ce que le
     tableau annonce est exactement ce que le simulateur appliquera.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Les quatre colonnes du tableau, de ce qui protège le mieux à ce qui expose. */
  readonly affinityRows: { key: keyof CharacterAffinities; label: string; note: string }[] = [
    { key: 'absorptions', label: 'Absorptions', note: 'soigne au lieu de blesser' },
    { key: 'immunities', label: 'Immunités', note: 'aucun dégât' },
    { key: 'resistances', label: 'Résistances', note: '×0,5' },
    { key: 'weaknesses', label: 'Faiblesses', note: '×1,5' },
  ];

  /** Les colonnes prêtes à afficher : type, nom français et glyphe. */
  get affinityColumns(): {
    key: string;
    label: string;
    note: string;
    types: { key: string; label: string; sigil: string }[];
  }[] {
    const all = this.affinities;
    return this.affinityRows.map((row) => ({
      key: row.key,
      label: row.label,
      note: row.note,
      types: all[row.key].map((type) => ({
        key: type,
        label: damageLabel(type),
        sigil: damageSigil(type),
      })),
    }));
  }

  /** Affinités du personnage : ce que l'équipement porté donne, plus ses feats. */
  get affinities(): CharacterAffinities {
    const worn = EQUIPMENT_SLOTS.filter((slot) => !this.slotBlocked(slot.key))
      .map((slot) => this.equipmentStats().get(this.itemIn(slot.key)))
      .filter((piece): piece is EquipmentStat => !!piece)
      .map((piece) => ({ resistances: piece.resistances, weaknesses: piece.weaknesses }));
    return characterAffinities(this.model, worn);
  }

  /** Vrai si le personnage a au moins une affinité à montrer. */
  get hasAffinities(): boolean {
    const all = this.affinities;
    return this.affinityRows.some((row) => all[row.key].length > 0);
  }

  /* ── Langues ──────────────────────────────────────────────────────────
     Le commun et la langue de l'origine sont acquis d'office : ils se
     recalculent, la fiche ne les stocke pas. Les autres se prennent dans les
     emplacements qu'un trait ouvre — trois pour le Linguiste.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly languages = LANGUAGES;

  /** Langues acquises sans rien dépenser (commun + origine). */
  get grantedLanguageKeys(): string[] {
    return grantedLanguages(this.selectedOrigin);
  }

  /** Langues apprises, débarrassées de celles déjà acquises d'office. */
  get learnedLanguageKeys(): string[] {
    const granted = new Set(this.grantedLanguageKeys);
    return (this.model.languages ?? []).filter((k) => !granted.has(k));
  }

  /** Emplacements ouverts par les traits portés. */
  get languageSlots(): number {
    return languageSlotsFrom([...this.grantedTraitDefs, ...this.chosenTraitDefs]);
  }

  get languageSlotsLeft(): number {
    return Math.max(0, this.languageSlots - this.learnedLanguageKeys.length);
  }

  /** Langues encore proposées : ni déjà connues, ni déjà apprises. */
  get languageOptions(): LanguageDef[] {
    const known = new Set([...this.grantedLanguageKeys, ...this.learnedLanguageKeys]);
    return this.languages.filter((l) => !known.has(l.key));
  }

  languageName(key: string): string {
    return languageName(key);
  }

  languageHint(key: string): string {
    return languageByKey(key)?.description ?? '';
  }

  /** Apprend une langue, si un emplacement reste ouvert. */
  addLanguage(key: string): void {
    if (!key || this.languageSlotsLeft <= 0) return;
    const known = new Set([...this.grantedLanguageKeys, ...this.learnedLanguageKeys]);
    if (known.has(key)) return;
    this.model.languages = [...(this.model.languages ?? []), key];
  }

  /** Oublie une langue apprise (une langue acquise d'office ne s'oublie pas). */
  removeLanguage(key: string): void {
    this.model.languages = (this.model.languages ?? []).filter((k) => k !== key);
  }

  /* ── Onglets du pool de sorts ─────────────────────────────────────────
     Trois domaines plus deux branches, c'est vite quarante lignes d'affilée.
     Un onglet par magie ramène la liste à ce qu'on regarde vraiment ; « Tous »
     reste à un clic pour ceux qui veulent la vue d'ensemble.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Clé de l'onglet « Tous » — jamais une clé de magie. */
  readonly ALL_MAGIC = '*';

  private spellTabKey = signal<string>('');

  /**
   * Onglet courant. Un onglet dont la magie a disparu (domaine retiré, branche
   * refermée) retombe sur la première magie disponible plutôt que d'afficher
   * une liste vide.
   */
  get spellTab(): string {
    const stored = this.spellTabKey();
    if (stored === this.ALL_MAGIC || this.magicSources.includes(stored)) return stored;
    return this.magicSources[0] ?? this.ALL_MAGIC;
  }

  selectSpellTab(key: string): void {
    this.spellTabKey.set(key);
    // Changer d'onglet change la liste : rester page 3 y afficherait du vide.
    this.spellPage.set(0);
  }

  /* ── Pool de sorts : par pages plutôt qu’en défilement ──────────────────
     Trois domaines donnent une trentaine de sorts, et la liste poussait le
     réglage du sort sélectionné hors de vue. Huit par page : la barre
     latérale reste en regard du pool. */

  readonly spellsPerPage = 8;
  readonly spellPage = signal(0);

  /** La page courante du pool, déjà filtré par l'onglet de magie. */
  get shownSpellPage(): DomainSpell[] {
    const debut = this.spellPage() * this.spellsPerPage;
    return this.shownSpellPool.slice(debut, debut + this.spellsPerPage);
  }

  /** Un onglet par magie du personnage, plus « Tous » — avec ce que chacun contient. */
  get spellTabs(): {
    key: string;
    label: string;
    icon: string | undefined;
    sigil: string;
    total: number;
    unlocked: number;
  }[] {
    const pool = this.domainSpellPool;
    const countFor = (key: string) =>
      key === this.ALL_MAGIC ? pool : pool.filter((sp) => this.domainSpellKeys(sp).includes(key));
    return [...this.magicSources, this.ALL_MAGIC].map((key) => {
      const spells = countFor(key);
      return {
        key,
        label: key === this.ALL_MAGIC ? 'Tous' : domainName(key),
        icon: key === this.ALL_MAGIC ? undefined : domainIcon(key),
        sigil: key === this.ALL_MAGIC ? '✧' : domainSigil(key),
        total: spells.length,
        unlocked: spells.filter((sp) => this.isSpellUnlocked(sp.key)).length,
      };
    });
  }

  /** Les sorts réellement listés : le pool filtré par l'onglet courant. */
  get shownSpellPool(): DomainSpell[] {
    const tab = this.spellTab;
    if (tab === this.ALL_MAGIC) return this.domainSpellPool;
    return this.domainSpellPool.filter((sp) => this.domainSpellKeys(sp).includes(tab));
  }

  /** Plafond de sorts équipés = 3 + modificateur d'Intelligence (jamais sous 3). */
  get equippedCap(): number {
    return 3 + Math.max(0, abilityModifier(this.finalAttributes.intelligence));
  }

  /* ── Points d'inspiration (débloquer & améliorer) ── */

  /** Points d'inspiration accordés par niveau selon la classe (0 si aucune). */
  get inspirationPerLevel(): number {
    return this.selectedClass?.inspirationPerLevel ?? 0;
  }
  /** Budget total = points/niveau × niveau. */
  get inspirationTotal(): number {
    return this.inspirationPerLevel * this.model.level;
  }
  /** Points dépensés = nombre de sorts débloqués (1 sort = 1 point). */
  get inspirationSpent(): number {
    return this.model.spells.unlocked.length;
  }
  /** Points disponibles. */
  get inspirationLeft(): number {
    return this.inspirationTotal - this.inspirationSpent;
  }

  /** L'état d'un sort : son XP et son build. Le socle pour un sort non débloqué. */
  spellState(key: string): SpellState {
    return this.model.spells.states[key] ?? { xp: 0, build: null, lastReassignedAt: null };
  }

  /** Niveau d'un sort, déduit de sa seule XP (plafonné par le barème). */
  spellLevel(key: string): number {
    return spellProgress(this.spellState(key).xp).level;
  }

  /** Tout ce que l'XP d'un sort lui vaut : niveau, seuils, points gagnés. */
  spellProgressOf(key: string) {
    return spellProgress(this.spellState(key).xp);
  }

  /** Part du chemin parcourue vers le niveau suivant, en %, pour la jauge. */
  spellXpPercent(key: string): number {
    const p = this.spellProgressOf(key);
    if (p.nextThreshold === null) return 100;
    const span = p.nextThreshold - p.prevThreshold;
    return span > 0 ? Math.round(((p.xp - p.prevThreshold) / span) * 100) : 0;
  }

  /** Le sort vu par le moteur de personnalisation, ou `null` s'il n'en déclare pas. */
  customizableSpell(key: string): CustomizableSpell | null {
    const page = this.spellPages.bySlug(key);
    return page ? fromSpellEntry(page.spell, page.domains) : null;
  }

  /**
   * Le build enregistré du sort.
   *
   * L'atelier reçoit CET objet, pas une copie : un build reconstruit à chaque
   * cycle de détection réécrirait l'entrée de l'atelier à chaque frappe, et
   * les réglages ne tiendraient pas. `openSpellWorkshop` garantit qu'il existe.
   */
  spellBuild(key: string): Build {
    return this.spellState(key).build ?? EMPTY_BUILD;
  }

  /**
   * Enregistre le build réglé dans l'atelier.
   *
   * On écrit sur la fiche à chaque cran : un budget dépensé est une décision de
   * jeu, pas un brouillon — et c'est ce que le simulateur lira au prochain combat.
   */
  setSpellBuild(key: string, build: Build): void {
    const state = this.model.spells.states[key];
    if (state) state.build = build;
  }

  /**
   * Une séance d'entraînement sur un sort : le travail hors combat, qui rapporte
   * plein tarif là où un lancer en situation ne rend que la moitié.
   *
   * Le geste est SUR LA FICHE et non dans le simulateur, parce qu'il ne se joue
   * pas : il se décide entre deux séances, et le MJ l'accorde.
   */
  trainSpell(key: string): void {
    const state = this.model.spells.states[key];
    if (state) state.xp = Math.round((state.xp + xpForCast('training')) * 1000) / 1000;
  }

  /** Retire une séance d'entraînement — une erreur de saisie se corrige. */
  untrainSpell(key: string): void {
    const state = this.model.spells.states[key];
    if (state) state.xp = Math.max(0, Math.round((state.xp - xpForCast('training')) * 1000) / 1000);
  }

  /** Ce qu'un entraînement rapporte, pour l'annoncer sur le bouton. */
  readonly trainingXp = xpForCast('training');
  /** Ce que vaut un lancer en situation : moitié moins, et c'est voulu. */
  readonly combatXp = xpForCast('combat');

  /** L'atelier ouvert, ou `null` : un seul sort se règle à la fois. */
  readonly openWorkshop = signal<string | null>(null);

  /**
   * Le sort dont l'atelier est ouvert, s'il est toujours dans le pool.
   *
   * L'atelier ne vit plus dans la ligne du sort mais dans la barre latérale
   * de la section : c'est ce getter qui lui dit quoi montrer. `null` quand
   * rien n'est sélectionné, ou quand le sort a quitté le pool (domaine
   * retiré) — la barre affiche alors son invitation.
   */
  get workshopSpell(): DomainSpell | null {
    const key = this.openWorkshop();
    return key ? (this.domainSpellPool.find((sp) => sp.key === key) ?? null) : null;
  }

  /**
   * Ce sort a-t-il un build à MONTRER ?
   *
   * Débloqué ou non : un sort qu'on n'a pas encore appris se consulte quand
   * même — on veut voir ce qu’il donnera avant de dépenser son inspiration.
   * Seuls les sorts que le moteur ne sait pas personnaliser restent inertes.
   */
  canOpenWorkshop(key: string): boolean {
    return !!this.customizableSpell(key);
  }

  /** Le sort ouvert n'est pas encore appris : on n'en montre que le socle. */
  get workshopIsPreview(): boolean {
    const s = this.workshopSpell;
    return !!s && !this.isSpellUnlocked(s.key);
  }

  /**
   * Ce que l'atelier doit dire à la place de sa phrase de niveau 0, quand le
   * sort n'est pas débloqué. `null` pour un sort appris : la phrase d'origine
   * convient alors.
   */
  get workshopLockedNote(): string | null {
    const s = this.workshopSpell;
    if (!s || this.isSpellUnlocked(s.key)) return null;
    const socle = "Sort non débloqué — voici son socle, tel qu’on l’apprendra. ";
    if (this.canUnlock(s)) return socle + "Débloque-le pour gagner de l’XP dessus et le régler.";
    const raison = this.lockReason(s);
    return socle + (raison ? raison + "." : "Hors de portée pour l’instant.");
  }

  /* ── Ce que le sort réglé FAIT ───────────────────────────────────────────
     L'atelier montre des chiffres ; la barre latérale doit aussi dire la
     phrase. Elle se projette dans la colonne de résultat, à côté des
     réglages, et suit le build quand la fiche du sort déclare un texte
     vivant — les `stats` viennent de l'atelier lui-même (cf. `#shop`).
  ───────────────────────────────────────────────────────────────────────── */

  /** La description du sort tel qu'il est construit ; jamais vide. */
  spellText(key: string, stats: BuilderStats): string {
    const page = this.spellPages.bySlug(key);
    if (!page) return '';
    const live = page.spell.liveText;
    return this.fillLive(key, live?.lead ?? live?.description, stats) ?? page.spell.description ?? '';
  }

  /** Ce que le sort construit vaut dans un contexte ; `''` si la fiche n'en dit rien. */
  spellUsageText(key: string, mode: 'combat' | 'outOfCombat', stats: BuilderStats): string {
    const page = this.spellPages.bySlug(key);
    if (!page) return '';
    return this.fillLive(key, page.spell.liveText?.[mode], stats) ?? page.spell.usage?.[mode] ?? '';
  }

  /** Remplit un texte vivant avec les stats du build ; `null` sans texte vivant. */
  private fillLive(key: string, text: string | undefined, stats: BuilderStats): string | null {
    if (!text) return null;
    const spell = this.customizableSpell(key);
    return spell ? fillTemplate(text, spell, stats) : null;
  }

  /**
   * Le sort construit, sous la forme que lit la carte de détail — la même
   * fabrique (`builtNode`) que la fiche du wiki et que le moteur de combat.
   *
   * Mémoïsé sur les stats : la carte le reçoit en ENTRÉE, et un nœud neuf à
   * chaque cycle de détection la ferait se redessiner sans fin.
   */
  workshopNode(key: string, stats: BuilderStats): SpellNode | null {
    const signature = `${key}|${JSON.stringify(stats)}`;
    if (this.nodeMemo?.signature !== signature) {
      const spell = this.customizableSpell(key);
      if (!spell) return null;
      const combat = this.spellUsageText(key, 'combat', stats);
      const horsCombat = this.spellUsageText(key, 'outOfCombat', stats);
      this.nodeMemo = {
        signature,
        node: builtNode(spell, stats, {
          description: this.spellText(key, stats),
          usage: { combat: combat || undefined, outOfCombat: horsCombat || undefined },
        }),
      };
    }
    return this.nodeMemo.node;
  }
  private nodeMemo: { signature: string; node: SpellNode } | null = null;

  /**
   * La fiche du sort telle que le wiki la déclare.
   *
   * La carte de détail y lit ses replis : la matière qu'un sort façonne, la
   * météo qu'il invoque — des champs que le nœud construit ne porte que s'il
   * les change lui-même.
   */
  spellEntry(key: string) {
    return this.spellPages.bySlug(key)?.spell ?? null;
  }

  /** Sur-titre de la carte : l'état du sort qu'elle décrit. */
  workshopKicker(key: string, touched: boolean): string {
    return touched ? `Build réglé · sort niv. ${this.spellLevel(key)}` : 'Socle du sort';
  }

  /**
   * Les domaines où le personnage a RÉELLEMENT investi : ceux d'au moins un
   * sort appris. Même règle que le moteur (`investedDomains`), pour que
   * l'atelier ferme d'avance le domaine non natif que l'export refuserait.
   *
   * Mémoïsé sur la liste des sorts appris : c'est une ENTRÉE de l'atelier, et
   * un tableau neuf à chaque cycle de détection le ferait recalculer sans fin.
   */
  get investedDomains(): string[] {
    const signature = this.model.spells.unlocked.join('|');
    if (signature !== this.investedMemo.signature) {
      const domaines = new Set<string>();
      for (const s of this.unlockedSpells) for (const d of this.domainSpellKeys(s)) domaines.add(d);
      this.investedMemo = { signature, domains: [...domaines] };
    }
    return this.investedMemo.domains;
  }
  private investedMemo: { signature: string; domains: string[] } = { signature: '\u0000', domains: [] };

  /**
   * Sélectionne un sort : son build s'ouvre dans la barre latérale.
   *
   * C'est la LIGNE entière qui appelle ceci, pas une pastille — d'où le garde
   * sur les boutons : équiper, débloquer et oublier vivent dans la ligne et ne
   * doivent pas la sélectionner au passage.
   *
   * Sélectionner, jamais basculer : refermer se fait par la croix du panneau.
   * Un second clic sur une ligne déjà ouverte le fermerait par surprise.
   */
  selectWorkshopSpell(key: string, event?: Event): void {
    if (event && (event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    if (!this.canOpenWorkshop(key)) return;
    // Ouvrir l'atelier matérialise le build : tant qu'il vaut `null`, le sort
    // est à son socle, et l'atelier n'aurait rien de stable à régler. Rien
    // n'est écrit pour un sort non débloqué — la consultation ne doit pas
    // laisser de trace dans la fiche.
    if (this.isSpellUnlocked(key)) {
      const state = this.model.spells.states[key];
      if (state && !state.build) state.build = emptyBuild();
    }
    this.openWorkshop.set(key);
  }

  isSpellUnlocked(key: string): boolean {
    return this.model.spells.unlocked.includes(key);
  }
  isSpellEquipped(key: string): boolean {
    return this.model.spells.equipped.includes(key);
  }

  /** Prérequis d'un sort encore non débloqués (résolus). */
  missingPrereqs(spell: DomainSpell): DomainSpell[] {
    return (spell.requires ?? [])
      .filter((k) => !this.isSpellUnlocked(k))
      .map((k) => findDomainSpell(k))
      .filter((s): s is DomainSpell => !!s);
  }

  /**
   * Peut-on débloquer ce sort ? Niveau atteint + prérequis débloqués + pas déjà
   * appris + au moins 1 point d'inspiration disponible.
   */
  canUnlock(spell: DomainSpell): boolean {
    return (
      !this.isSpellUnlocked(spell.key) &&
      spell.level <= this.model.level &&
      this.missingPrereqs(spell).length === 0 &&
      this.inspirationLeft >= 1
    );
  }

  /** Libellé de la raison de verrouillage (niveau, prérequis ou inspiration). */
  lockReason(spell: DomainSpell): string {
    if (spell.level > this.model.level) return `Niveau ${spell.level} requis`;
    const miss = this.missingPrereqs(spell);
    if (miss.length) return 'Requiert : ' + miss.map((m) => m.name).join(', ');
    if (this.inspirationLeft < 1) return "Plus de points d'inspiration";
    return '';
  }

  /** Noms des prérequis d'un sort (pour l'affichage). */
  requiresLabel(spell: DomainSpell): string {
    return (spell.requires ?? []).map((k) => findDomainSpell(k)?.name ?? k).join(', ');
  }

  unlockSpell(spell: DomainSpell): void {
    if (!this.canUnlock(spell)) return;
    this.model.spells.unlocked.push(spell.key);
    // Un sort s'apprend à son socle : pas d'XP, pas d'arbitrage.
    this.model.spells.states[spell.key] = { xp: 0, build: null, lastReassignedAt: null };
  }

  /** Un sort débloqué a-t-il des dépendants débloqués (qui le requièrent) ? */
  hasUnlockedDependents(key: string): boolean {
    return this.model.spells.unlocked.some((k) => {
      const s = findDomainSpell(k);
      return !!s && (s.requires ?? []).includes(key);
    });
  }

  /** Oublie un sort débloqué (rend toute l'inspiration, retire l'équipement) — refusé s'il a des dépendants. */
  forgetSpell(key: string): void {
    if (this.hasUnlockedDependents(key)) return;
    this.model.spells.unlocked = this.model.spells.unlocked.filter((k) => k !== key);
    this.model.spells.equipped = this.model.spells.equipped.filter((k) => k !== key);
    delete this.model.spells.states[key];
  }

  /** Équipe / déséquipe un sort débloqué (dans la limite du plafond). */
  toggleEquip(key: string): void {
    if (!this.isSpellUnlocked(key)) return;
    const eq = this.model.spells.equipped;
    const i = eq.indexOf(key);
    if (i >= 0) {
      eq.splice(i, 1);
    } else if (eq.length < this.equippedCap) {
      eq.push(key);
    }
  }

  /** Domaines d'un sort : un seul pour un sort de base, tous les composants
   *  pour une combinaison. Sert à afficher leurs icônes sur la fiche. */
  domainSpellKeys(s: DomainSpell): string[] {
    const keys = s.components?.length ? s.components : [s.domain ?? ''];
    return keys.filter(Boolean);
  }

  /** Domaines d'un sort en toutes lettres (infobulles, export PDF). */
  domainSpellNames(s: DomainSpell): string {
    return this.domainSpellKeys(s).map((k) => domainName(k)).join(' + ');
  }

  /** Sorts débloqués résolus, triés par niveau (pour la fiche). */
  get unlockedSpells(): DomainSpell[] {
    return this.resolveSpellKeys(this.model.spells.unlocked);
  }
  /** Sorts équipés résolus, triés par niveau. */
  get equippedSpells(): DomainSpell[] {
    return this.resolveSpellKeys(this.model.spells.equipped);
  }
  /** Sorts débloqués mais non équipés (liste secondaire de la fiche). */
  get unlockedNotEquipped(): DomainSpell[] {
    return this.unlockedSpells.filter((s) => !this.isSpellEquipped(s.key));
  }

  private resolveSpellKeys(keys: string[]): DomainSpell[] {
    return keys
      .map((k) => findDomainSpell(k))
      .filter((s): s is DomainSpell => !!s)
      .sort((a, b) => a.level - b.level);
  }

  /** Retire des sorts débloqués/équipés/rangs ceux qui ne sont plus proposés (domaine retiré). */
  private pruneSpells(): void {
    const valid = new Set(availableSpellsFor(this.magicSources).map((s) => s.key));
    this.model.spells.unlocked = this.model.spells.unlocked.filter((k) => valid.has(k));
    const stillUnlocked = new Set(this.model.spells.unlocked);
    this.model.spells.equipped = this.model.spells.equipped.filter((k) => stillUnlocked.has(k));
    for (const k of Object.keys(this.model.spells.states)) {
      if (!stillUnlocked.has(k)) delete this.model.spells.states[k];
    }
  }

  /* ── Sac : pagination plutôt que défilement ───────────────────────────────
     Un sac se remplit vite, et sa liste poussait la section hors de l'écran.
     Elle se lit donc par pages de six. On garde l'index RÉEL de chaque ligne :
     les noms de champ (`in-3`, `iq-3`…) et le retrait s'appuient dessus, pas
     sur le rang dans la page. */

  readonly bagPerPage = 6;
  readonly bagPage = signal(0);

  /** Les lignes de la page courante, chacune avec son index dans l'inventaire. */
  get bagPageItems(): { item: InventoryItem; index: number }[] {
    const debut = this.bagPage() * this.bagPerPage;
    return this.model.inventory
      .map((item, index) => ({ item, index }))
      .slice(debut, debut + this.bagPerPage);
  }

  /** Ajoute un objet et saute à la page où il vient d'atterrir. */
  addItem(): void {
    this.model.inventory.push({ name: '', qty: 1, weight: 0 });
    this.bagPage.set(Math.floor((this.model.inventory.length - 1) / this.bagPerPage));
  }

  removeItem(index: number): void {
    this.model.inventory.splice(index, 1);
  }

  /** Quand l'objet correspond à une entrée du wiki, on auto-remplit son poids. */
  onItemNameChange(item: InventoryItem): void {
    const w = this.itemWeights.get(item.name);
    if (w !== undefined) item.weight = w;
    // Un autre objet n'hérite pas de l'entame du précédent.
    delete item.usesLeft;
  }

  /** Usages par exemplaire d'un objet du catalogue (1 s'il n'en compte qu'un). */
  usesPer(name: string): number {
    return this.itemUses.get(name) ?? 1;
  }

  /** Remet l'exemplaire entamé à neuf : le MJ tranche un réassort. */
  refillUses(item: InventoryItem): void {
    delete item.usesLeft;
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ── Persistance & impression ───────────────────────────────────────────────

  save(): void {
    if (this.saving()) return;
    if (!this.model.identity.name.trim()) {
      this.error.set('Donne au moins un nom à ton personnage.');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    this.justSaved.set(false);

    const request$ = this.sheetId
      ? this.sheets.update(this.sheetId, this.model)
      : this.sheets.create(this.model);

    request$.subscribe({
      next: (stored) => {
        this.saving.set(false);
        this.justSaved.set(true);
        // Première sauvegarde : on bascule en mode édition sans recharger la page.
        if (!this.sheetId) {
          this.sheetId = stored.id;
          this.router.navigate(['/characters', stored.id], { replaceUrl: true });
        }
      },
      error: () => {
        this.error.set('Enregistrement impossible. Réessaie.');
        this.saving.set(false);
      },
    });
  }

  /**
   * Assemble la fiche pour l'export PDF. Tout ce que le gabarit affiche est
   * résolu ici (stats finales, bonus, libellés) : `sheet-pdf.ts` ne redessine
   * que des valeurs prêtes, il ne connaît rien aux règles de l'univers.
   */
  private pdfData(): SheetPdfData {
    const stats = this.finalStats;
    const attrs = this.finalAttributes;
    const maxBar = this.barScale;

    const spellRow = (s: DomainSpell): PdfSpellRow => ({
      level: s.level,
      name: s.name,
      rank: undefined,
      mana: s.mana,
      domainIcons: this.domainSpellKeys(s)
        .map((k) => domainIcon(k))
        .filter((icon): icon is string => !!icon),
      // Repli si une icône manque : les sigils sont des glyphes Unicode absents
      // des polices embarquées dans le PDF, on écrit donc les noms.
      domains: this.domainSpellNames(s),
    });

    const slotRow = (slot: { key: string; label: string }): PdfSlotRow => {
      const lines: string[] = [];
      const weapon = this.weaponForSlot(slot.key);
      if (weapon) {
        lines.push(
          `${weapon.minDamage}–${weapon.maxDamage} (${weapon.modMin}–${weapon.modMax}) · ${weapon.damageType}`,
        );
        lines.push(`${weapon.attributeDamage} · ${weapon.enduranceCost} end.`);
        lines.push(
          weapon.proficient
            ? `${weapon.category} · maîtrisée`
            : `${weapon.category} · non maîtrisée`,
        );
      }
      const armor = this.armorForSlot(slot.key);
      if (armor) {
        lines.push(`Arm. ${armor.physicalArmor} · Mag. ${armor.magicalProtection}`);
        const note = this.armorNote(armor);
        if (note) lines.push(note);
      }
      return { label: slot.label, item: this.itemIn(slot.key), lines };
    };

    return {
      fileName: (this.model.identity.name || 'fiche').replace(/[^\p{L}\p{N}_-]+/gu, '_'),
      source: this.model,
      identity: {
        name: this.model.identity.name,
        race: this.raceDisplay,
        className: this.model.identity.class,
        level: this.model.level,
        background: this.backgroundDisplay,
        origin: this.selectedOrigin?.name ?? '',
        religion: this.selectedReligion?.name ?? '',
        age: this.model.identity.age,
        gold: this.gold,
        portrait: this.model.identity.portrait,
        fullImage: this.model.identity.fullImage,
      },
      xp: {
        total: this.model.xp,
        into: this.xp.into,
        needed: this.xp.needed,
        pct: this.xp.pct,
        atMax: this.model.level >= MAX_LEVEL,
      },
      domains: this.magicSources.map((k) => ({ name: domainName(k), icon: domainIcon(k) })),
      attributes: this.attributes.map((a) => ({
        label: a.label,
        score: attrs[a.key],
        mod: formatBonus(this.modifier(a.key)),
      })),
      bars: this.barStats.map((st) => ({
        label: st.label,
        icon: st.icon,
        value: stats[st.key],
        pct: this.barPct(stats[st.key], maxBar),
      })),
      survival: this.survivalRows.map((row) => ({
        label: row.gauge.label,
        icon: row.gauge.icon,
        filled: row.current,
        segments: row.max,
        stage: row.stage,
      })),
      pools: this.poolRows.map((row) => ({
        label: row.gauge.label,
        icon: row.gauge.icon,
        current: row.current,
        max: row.max,
        pct: row.pct,
        stage: row.stage,
      })),
      defenses: this.defenseStats.map((st) => ({
        label: st.label,
        icon: st.icon,
        spark: st.key === 'def_mag' ? MAGIC_DEFENSE_SPARK : undefined,
        value: stats[st.key],
      })),
      spells: {
        cap: this.equippedCap,
        inspirationLeft: this.inspirationLeft,
        inspirationTotal: this.inspirationTotal,
        equipped: this.equippedSpells.map(spellRow),
        unlocked: this.unlockedNotEquipped.map(spellRow),
      },
      classSpells: this.unlockedClassSpells.map((sp) => ({
        level: sp.level,
        name: sp.name,
        endurance: sp.endurance,
        description: sp.description,
      })),
      proficiencies: {
        weapons: this.masteredWeapons.map((p) => ({ label: p.label, manual: p.source === 'manual' })),
        armors: this.masteredArmors.map((p) => ({ label: p.label, manual: p.source === 'manual' })),
      },
      equipment: {
        left: this.leftSlots.map(slotRow),
        right: this.rightSlots.map(slotRow),
      },
      skills: this.skills.map((s) => ({
        label: s.label,
        bonus: formatBonus(this.skillBonus(s.key, s.attribute)),
        trained: this.isSkillTrained(s.key),
      })),
      inventory: this.model.inventory.map((i) => ({
        name: i.name,
        qty: Number(i.qty) || 0,
        weight: Number(i.weight) || 0,
      })),
      weight: {
        total: this.totalWeight,
        capacity: this.carryCapacity,
        over: this.overweight,
      },
      traits: [
        ...this.traits.map((t) => ({
          name: t.name,
          description: t.description,
          icon: t.icon ?? DEFAULT_TRAIT_ICON,
        })),
        ...this.sheetDomainFeats.map(({ feat, domain }) => ({
          name: feat.name,
          description: domainName(domain) + ' — ' + feat.description,
          icon: DEFAULT_TRAIT_ICON,
        })),
      ],
      // Les quatre colonnes partent entières : c'est leur alignement qui rend
      // le tableau lisible, pas la présence de contenu dans chacune.
      affinities: this.hasAffinities
        ? this.affinityColumns.map((col) => ({
            label: col.label,
            types: col.types.map((type) => type.label),
          }))
        : [],
      notes: this.model.notes,
    };
  }

  /**
   * Recharge une fiche depuis un PDF exporté. Les données éditables voyagent
   * dans les métadonnées du document (cf. sheet-transfer.ts) : on ne relit donc
   * rien de ce qui est dessiné, et la fiche est restituée à l'identique.
   *
   * L'import remplit l'éditeur SANS rien enregistrer, et détache la fiche
   * courante : la sauvegarde suivante crée une nouvelle fiche plutôt que
   * d'écraser celle qu'on était en train de consulter.
   */
  async importPdf(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de re-sélectionner le même fichier plus tard
    if (!file || this.importing()) return;

    if (this.hasContent && !confirm(
      'Importer cette fiche remplacera ce qui est actuellement à l’écran. Continuer ?',
    )) {
      return;
    }

    this.importing.set(true);
    this.error.set(null);
    this.justSaved.set(false);
    try {
      const { extractSheetFromPdf, SheetImportError } = await import('./sheet-transfer');
      try {
        this.model = this.normalize(await extractSheetFromPdf(file));
      } catch (err) {
        this.error.set(
          err instanceof SheetImportError ? err.message : 'Import impossible : fichier illisible.',
        );
        return;
      }
      this.loadPortraitOriginal(false); // rend le recadrage du portrait à nouveau ajustable
      if (this.sheetId) {
        this.sheetId = null;
        this.router.navigate(['/characters/new'], { replaceUrl: true });
      }
    } finally {
      this.importing.set(false);
    }
  }

  /** Vrai si l'éditeur contient déjà quelque chose qu'un import écraserait. */
  private get hasContent(): boolean {
    const m = this.model;
    return !!(
      m.identity.name.trim() ||
      m.identity.race ||
      m.identity.class ||
      m.domains.length ||
      m.skills.length ||
      m.inventory.length ||
      m.spells.unlocked.length ||
      m.notes.trim()
    );
  }

  /**
   * Génère et télécharge le PDF de la fiche. Le rendu est vectoriel : la fiche
   * est redessinée en primitives PDF plutôt que photographiée (cf. sheet-pdf.ts).
   */
  async downloadPdf(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.error.set(null);
    try {
      const { exportSheetPdf } = await import('./sheet-pdf');
      await exportSheetPdf(this.pdfData());
    } catch {
      this.error.set('Échec de la génération du PDF.');
    } finally {
      this.exporting.set(false);
    }
  }
}
