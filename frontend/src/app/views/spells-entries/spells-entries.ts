import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Navbar } from '../../components/navbar/navbar';
import { SpellWorkshop } from '../../components/spell-workshop/spell-workshop';
import { SpellDetail } from '../../components/spell-detail/spell-detail';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { DeathArchetypes } from '../../components/death-archetypes/death-archetypes';
import {
  BuilderContext,
  DEFAULT_RULES,
  assessAtLevel,
  builtNode,
  emptyBuild,
  fillTemplate,
  measureLines,
  fromSpellEntry,
  getAt,
  readNum,
} from '../../combat/spell-customization';
import { SpellsService } from '../../services/spells.service';
import { StatusEffectsService } from '../../services/status-effects.service';
import { DamageTypesService } from '../../services/damage-types.service';
import { WeathersService } from '../../services/weathers.service';
import {
  MaterialFamilyKey,
  Material,
  SpellClassBonus,
  SpellChoice,
  SpellNode,
  SpellScaling,
  SpellScalingSource,
  SpellStatEffect,
  SpellTarget,
  StatusCategory,
  StatusEffect,
  StatusSave,
  StatusTick,
} from '../../wiki.types';
import {
  MATERIAL_FAMILIES,
  MATERIAL_REGIONS,
  materialsOfFamily,
} from '../../combat/materials';
import { applyPlantToStats, bindPlant, plantTier, variantsOf } from '../../combat/plants';
import { enchantTargetOf } from '../../combat/abilities';
import { DEATH_SEVERITIES, RITUAL_DEGREE_BANDS, RITUAL_DEGREE_LABELS, ritualThreshold } from '../../combat/soul-stone';
import { ENCHANT_SHARE, WALL_THICKNESS } from '../../combat/rules';
import { SKILLS } from '../../character/universe-data';
import {
  domainColor as colorOf,
  domainIcon as iconOf,
  domainLabel as labelOf,
  domainSigil as sigilOf,
} from '../../domains.catalog';

/** Libellés FR des sources de scaling (stats de combat + attributs). */
const SOURCE_LABELS: Record<SpellScalingSource, string> = {
  atk_mag: 'Attaque magique',
  atk_phy: 'Attaque physique',
  def_mag: 'Défense magique',
  def_phy: 'Défense physique',
  hp: 'Points de vie',
  mana: 'Mana',
  endurance: 'Endurance',
  speed: 'Vitesse',
  force: 'Force',
  dexterite: 'Dextérité',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  sagesse: 'Sagesse',
  charisme: 'Charisme',
};

/** Libellés FR des cibles. */
const TARGET_LABELS: Record<SpellTarget, string> = {
  enemy: 'Ennemis',
  ally: 'Alliés',
  self: 'Soi-même',
  everyone: 'Tout le monde',
};

/** Libellés FR des classes (cf. classes.json). */
const CLASS_LABELS: Record<string, string> = {
  warrior: 'Guerrier',
  mage: 'Mage',
  ranger: 'Ranger',
  rogue: 'Vagabond',
  pugilist: 'Pugiliste',
};

/** Libellés FR des catégories de statut. */
const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  dot: 'Dégâts sur la durée',
  control: 'Contrôle',
  debuff: 'Affaiblissement',
  mental: 'Altération mentale',
  buff: 'Amélioration',
};

/** Type de dégâts par défaut d'un domaine (cf. damage_type.json). */
const DOMAIN_DAMAGE_TYPE: Record<string, string> = {
  fire: 'fire',
  water: 'water',
  earth: 'earth',
  air: 'wind',
  electricity: 'lightning',
  plant: 'plant',
  light: 'light',
  darkness: 'dark',
  life: 'life',
  death: 'death',
  time: 'time',
  space: 'space',
};

/** Nom français avec article d'une stat/attribut, pour les phrases d'effet. */
const STAT_NOUN: Record<SpellScalingSource, string> = {
  atk_mag: "l'attaque magique",
  atk_phy: "l'attaque physique",
  def_mag: 'la défense magique',
  def_phy: 'la défense physique',
  hp: 'les points de vie',
  mana: 'le mana',
  endurance: "l'endurance",
  speed: 'la vitesse',
  force: 'la force',
  dexterite: 'la dextérité',
  constitution: 'la constitution',
  intelligence: "l'intelligence",
  sagesse: 'la sagesse',
  charisme: 'le charisme',
};

/**
 * Page auto-générée et interactive d'un sort (`/magics/spell/:spell`).
 *
 * Un sort se lit par sa PERSONNALISATION : la fiche montre l'atelier, où l'on
 * règle les curseurs dans les limites d'un budget, et le panneau de détail
 * affiche le sort tel que le build essayé le construit. Un sort qui ne déclare
 * pas de `customization` reste une simple carte descriptive.
 */
@Component({
  selector: 'spell-entry',
  imports: [RouterLink, Navbar, NgTemplateOutlet, SpellWorkshop, SpellDetail, WikiLinkPipe, DeathArchetypes],
  templateUrl: './spells-entries.html',
  styleUrl: './spells-entries.css',
})
export class SpellEntryComponent {
  private route = inject(ActivatedRoute);
  private spells = inject(SpellsService);
  private statusService = inject(StatusEffectsService);
  private damageTypes = inject(DamageTypesService);
  private weathers = inject(WeathersService);

  private paramMap = toSignal(this.route.paramMap, { requireSync: true });

  /** Slug du sort demandé. */
  slug = computed(() => this.paramMap().get('spell') ?? '');

  /** Données de la page (sort + origine), ou `undefined` si le slug est inconnu. */
  page = computed(() => this.spells.bySlug(this.slug()));

  /** Déroulé du rituel, pour un sort de la catégorie `ritual` (sinon `null`). */
  ritual = computed(() => {
    const spell = this.page()?.spell;
    return spell?.category === 'ritual' ? (spell.ritual ?? null) : null;
  });

  /** Ce qu'un rituel fait d'une Pierre d'âme, en clair. */
  readonly soulStoneRoles = { fills: 'Remplit une pierre vide', draws: 'Puise dans une pierre habitée' } as const;

  /** Libellés FR des attributs des jets de rituel. */
  readonly checkAttributes: Record<string, string> = SOURCE_LABELS;

  readonly degreeLabels = RITUAL_DEGREE_LABELS;
  readonly degreeBands = RITUAL_DEGREE_BANDS;

  /** Maîtrise supposée pour lire la table des seuils (2 : celle d'un débutant). */
  readonly ritualMastery = linkedSignal({ source: this.slug, computation: () => 2 });
  readonly masteryChoices = [0, 1, 2, 3, 4, 5, 6];
  /** Modificateurs d'attribut en colonnes de la table des seuils. */
  readonly ritualMods = [-1, 0, 1, 2, 3, 4, 5];

  /**
   * Seuils du d20 par sévérité de mort (lignes) et modificateur (colonnes),
   * à la maîtrise choisie : le jet de Capture comme celui de Lecture.
   */
  readonly severityTable = computed(() =>
    DEATH_SEVERITIES.map((s) => ({
      ...s,
      thresholds: this.ritualMods.map((m) => ritualThreshold(m, s.severity, this.ritualMastery())),
    })),
  );

  /** Signe explicite d'un modificateur (« +2 », « −1 »). */
  readonly signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

  /** Le rituel a-t-il un jet mesuré contre la sévérité d'une mort ? */
  readonly usesSeverityTable = computed(() =>
    (this.ritual()?.checks ?? []).some((c) => c.difficulty === 'death-severity'),
  );

  setRitualMastery(event: Event): void {
    this.ritualMastery.set(Number((event.target as HTMLSelectElement).value));
  }

  /** Une étape de rituel, remplie avec le sort tel qu'il est construit. */
  ritualText(text: string): string {
    return this.live(text) ?? text;
  }

  /** Domaine principal (premier composant) — pilote le thème et la navigation. */
  primaryDomain = computed(() => this.page()?.domains[0] ?? '');

  /** Emblème du sort : icône effective (propre ou sous-domaine), sinon icône du domaine. */
  emblem = computed(() => {
    const p = this.page();
    if (!p) return '';
    return p.icon || this.domainIcon(this.primaryDomain());
  });

  /* ─────────────────────────────────────────────
     PERSONNALISATION

     Un sort se règle par curseurs sous budget : la fiche montre l'atelier, et
     le panneau de détail affiche le sort tel que le build essayé le construit.
  ───────────────────────────────────────────── */

  /** Le sort vu par le moteur de personnalisation, ou `null` s'il n'en déclare pas. */
  customizable = computed(() => {
    const p = this.page();
    return p ? fromSpellEntry(p.spell, p.domains) : null;
  });

  /** Build essayé dans l'atelier ; repart du socle à chaque changement de sort. */
  readonly customBuild = linkedSignal({ source: this.slug, computation: () => emptyBuild() });
  /** Niveau de sort supposé (donc budget) ; 0 par défaut : le socle, tel qu'on apprend le sort. */
  readonly customLevel = linkedSignal({ source: this.slug, computation: () => 0 });
  /**
   * L'espèce essayée sur un sort de Plantes ; se repose en changeant de sort.
   *
   * Sur le wiki, on choisit sans contrainte : la fiche montre ce que le sort
   * DEVIENT avec telle plante, pas ce qu'un personnage donné en tirerait.
   */
  readonly customPlant = linkedSignal<string, string | null>({
    source: this.slug,
    computation: () => null,
  });

  /**
   * Le lancer avec l'espèce choisie, lu comme si elle était étudiée.
   *
   * `null` hors des Plantes ou tant qu'aucune espèce n'est choisie : le sort
   * s'affiche alors nu, ce qui reste sa lecture de référence.
   */
  private readonly plantBinding = computed(() => {
    const spell = this.page()?.spell;
    const choisie = this.customPlant();
    if (!spell || !choisie) return null;
    const slot = variantsOf(spell).find((v) => v.plant === choisie)?.slot;
    return bindPlant(spell, choisie, plantTier(choisie, null), slot);
  });

  private readonly customCtx: BuilderContext = { rules: DEFAULT_RULES, classes: [], catalog: {} };

  customAssessment = computed(() => {
    const spell = this.customizable();
    if (!spell) return null;
    // Niveau 0 : le socle, verrouillé — le build essayé reste en mémoire pour
    // réapparaître si l'on remonte, mais ne s'affiche pas.
    const build = this.customLevel() === 0 ? emptyBuild() : this.customBuild();
    return assessAtLevel(spell, build, this.customLevel(), this.customCtx);
  });

  /**
   * Le sort construit : c'est ce qui permet au panneau de détail (dégâts
   * colorés, statuts, bonus de classe…) de l'afficher sans rien réécrire.
   */
  selectedNode = computed<SpellNode | undefined>(() => {
    const spell = this.customizable();
    const a = this.customAssessment();
    if (!spell || !a) return undefined;
    // Les textes vivants décrivent le sort TEL QU'IL EST CONSTRUIT : ils
    // passent donc avant l'`usage` figé de la fiche.
    const p = this.page()?.spell;
    const live = p?.liveText;
    const base = p?.usage;
    // Même fabrique que le moteur de combat : ce que la fiche montre est
    // exactement ce que le simulateur jouera. L'espèce employée passe en
    // dernier : elle ne coûte pas de points, elle relit le sort construit.
    return builtNode(spell, applyPlantToStats(a.stats, this.plantBinding()), {
      // Sans texte vivant, l'accroche reste la description de la fiche :
      // le panneau ne doit jamais s'ouvrir sur un blanc.
      description: this.live(live?.lead) ?? this.live(live?.description) ?? p?.description,
      usage: {
        ...base,
        ...(live?.combat ? { combat: this.live(live.combat) ?? base?.combat } : {}),
        ...(live?.outOfCombat ? { outOfCombat: this.live(live.outOfCombat) ?? base?.outOfCombat } : {}),
      },
    });
  });

  /**
   * Entretien par tour d'un sort passé en mode continu (2bis). `SpellNodeStats`
   * ne connaît pas ce champ : il n'existe que dans un build.
   */
  upkeep = computed(() => this.customAssessment()?.stats.upkeep);

  /** Sur-titre du panneau de détail : l'état du build affiché. */
  detailKicker = computed(() =>
    this.customAssessment()?.ledger.length
      ? `Build essayé · sort niv. ${this.customLevel()}`
      : 'Socle du sort',
  );

  /* ─────────────────────────────────────────────
     UTILISATION : bascule combat / hors combat
  ───────────────────────────────────────────── */

  /** Utilisation déclarée au niveau du sort (repli hérité par les paliers). */
  /**
   * Remplit un texte vivant avec le sort tel qu'il est construit (socle ou
   * build essayé) ; `null` sans texte vivant ou hors atelier.
   */
  private live(text: string | undefined): string | null {
    const spell = this.customizable();
    const a = this.customAssessment();
    if (!text || !spell || !a) return null;
    return fillTemplate(text, spell, a.stats);
  }

  /** Description du bandeau : elle suit le build si le sort déclare un texte vivant. */
  heroDescription = computed(() => {
    const spell = this.page()?.spell;
    return this.live(spell?.liveText?.description) ?? spell?.description ?? '';
  });

  /** Mana affichée au bandeau : celle du sort construit dans l'atelier, sinon la fiche. */
  heroMana = computed(() => this.customAssessment()?.stats.mana ?? this.page()?.spell.mana);

  usage = computed(() => {
    const spell = this.page()?.spell;
    const base = spell?.usage;
    const live = spell?.liveText;
    if (!live?.combat && !live?.outOfCombat) return base;
    return {
      ...base,
      ...(live.combat ? { combat: this.live(live.combat) ?? base?.combat } : {}),
      ...(live.outOfCombat ? { outOfCombat: this.live(live.outOfCombat) ?? base?.outOfCombat } : {}),
    };
  });

  /** Un contexte est « disponible » s'il est renseigné sur la fiche. */
  hasCombatUsage = computed(() => !!this.usage()?.combat);
  hasOutOfCombatUsage = computed(() => !!this.usage()?.outOfCombat);
  /** La bascule n'existe que si le sort a une utilité dans les deux contextes. */
  hasBothUsages = computed(() => this.hasCombatUsage() && this.hasOutOfCombatUsage());

  /** Mode choisi par l'utilisateur (peut pointer un contexte non disponible). */
  /**
   * Contexte choisi par le lecteur. Public : la carte du sort construit porte
   * la même bascule dans son en-tête, et les deux doivent tourner ensemble —
   * c'est le MÊME choix, montré à deux endroits.
   */
  readonly usagePick = signal<'combat' | 'outOfCombat'>('combat');

  /** Mode effectif : le pick s'il est disponible, sinon l'unique contexte présent. */
  usageMode = computed<'combat' | 'outOfCombat'>(() => {
    const pick = this.usagePick();
    if (pick === 'combat' && this.hasCombatUsage()) return 'combat';
    if (pick === 'outOfCombat' && this.hasOutOfCombatUsage()) return 'outOfCombat';
    return this.hasCombatUsage() ? 'combat' : this.hasOutOfCombatUsage() ? 'outOfCombat' : 'combat';
  });

  setUsageMode(mode: 'combat' | 'outOfCombat'): void {
    this.usagePick.set(mode);
  }

  /** Sorts requis pour débloquer ce sort (prérequis d'arbre de sorts). */
  prerequisites = computed(() => this.spells.prerequisites(this.slug()));
  /** Sorts que ce sort débloque (relation inverse dérivée). */
  unlocks = computed(() => this.spells.unlocks(this.slug()));

  domainSigil = (slug: string): string => sigilOf(slug);
  domainLabel = (slug: string): string => labelOf(slug);
  domainIcon = (slug: string): string => iconOf(slug);
  domainColor = (slug: string): string => colorOf(slug);

  /** Dégradé de ruban mêlant les couleurs des domaines d'origine. */
  originGradient = computed(() => {
    const p = this.page();
    if (!p) return '';
    const stops = p.domains.map((c) => this.domainColor(c)).join(', ');
    return (
      'linear-gradient(180deg, rgba(10, 8, 7, .34), rgba(10, 8, 7, .5)),' +
      `linear-gradient(100deg, ${stops})`
    );
  });


  /* ─────────────────────────────────────────────
     NAVIGATION ENTRE SORTS
  ───────────────────────────────────────────── */

  private siblings = computed(() => this.spells.spellSlugsForDomain(this.primaryDomain()));
  private siblingIndex = computed(() => this.siblings().indexOf(this.slug()));

  prevSpell = computed(() => {
    const sibs = this.siblings();
    const i = this.siblingIndex();
    if (sibs.length < 2 || i < 0) return undefined;
    return this.spells.bySlug(sibs[(i - 1 + sibs.length) % sibs.length]);
  });

  nextSpell = computed(() => {
    const sibs = this.siblings();
    const i = this.siblingIndex();
    if (sibs.length < 2 || i < 0) return undefined;
    return this.spells.bySlug(sibs[(i + 1) % sibs.length]);
  });
}
