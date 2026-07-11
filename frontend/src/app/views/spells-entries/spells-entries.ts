import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Navbar } from '../../components/navbar/navbar';
import { SpellsService } from '../../services/spells.service';
import { StatusEffectsService } from '../../services/status-effects.service';
import { DamageTypesService } from '../../services/damage-types.service';
import { WeathersService } from '../../services/weathers.service';
import {
  SpellClassBonus,
  SpellChoice,
  SpellNode,
  SpellScaling,
  SpellScalingSource,
  SpellStatEffect,
  SpellTarget,
  StatusCategory,
} from '../../wiki.types';
import {
  domainColor as colorOf,
  domainIcon as iconOf,
  domainLabel as labelOf,
  domainSigil as sigilOf,
} from '../../domains.catalog';

/** Dimensions de la grille de l'arbre (unités du repère SVG/pixels). */
const COL_W = 200;
const ROW_H = 122;
const NODE_W = 158;
const NODE_H = 90;

/** Palette d'accents des branches (le tronc utilise la couleur du domaine). */
const BRANCH_PALETTE = ['#c47a2c', '#3d79a8', '#7a9a3d', '#9a5bb0'];

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

/** Un nœud positionné dans le repère de l'arbre. */
interface LaidOutNode {
  node: SpellNode;
  col: number;
  lane: number;
  x: number;
  y: number;
}

/** Une arête parent → enfant, avec ses extrémités et son tracé de courbe. */
interface LaidOutEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Attribut `d` d'une courbe de Bézier reliant les deux nœuds. */
  d: string;
}

/**
 * Page auto-générée et interactive d'un sort (`/magics/spell/:spell`).
 *
 * Quand le sort porte un arbre d'amélioration (`progression`), la fiche affiche
 * un arbre cliquable : chaque nœud est un palier aux stats explicites, l'arbre
 * se scinde en branches, et un simulateur calcule les valeurs effectives selon
 * les stats/attributs d'un personnage hypothétique. Sans `progression`, la fiche
 * reste une simple carte descriptive.
 */
@Component({
  selector: 'spell-entry',
  imports: [RouterLink, Navbar, NgTemplateOutlet],
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

  /** Domaine principal (premier composant) — pilote le thème et la navigation. */
  primaryDomain = computed(() => this.page()?.domains[0] ?? '');

  /** Emblème du sort : icône effective (propre ou sous-domaine), sinon icône du domaine. */
  emblem = computed(() => {
    const p = this.page();
    if (!p) return '';
    return p.icon || this.domainIcon(this.primaryDomain());
  });

  /** Arbre d'amélioration du sort, si défini. */
  progression = computed(() => this.page()?.spell.progression);
  hasProgression = computed(() => !!this.progression());

  /* ─────────────────────────────────────────────
     UTILISATION : bascule combat / hors combat
  ───────────────────────────────────────────── */

  /** Utilisation déclarée au niveau du sort (repli hérité par les paliers). */
  usage = computed(() => this.page()?.spell.usage);

  /**
   * Un contexte est « disponible » s'il est renseigné au niveau du sort OU d'au
   * moins un palier — un palier peut gagner une utilité que le sort de base n'a pas.
   */
  hasCombatUsage = computed(() =>
    !!this.usage()?.combat || (this.progression()?.nodes ?? []).some((n) => !!n.usage?.combat),
  );
  hasOutOfCombatUsage = computed(() =>
    !!this.usage()?.outOfCombat || (this.progression()?.nodes ?? []).some((n) => !!n.usage?.outOfCombat),
  );
  /** La bascule n'existe que si le sort a une utilité dans les deux contextes. */
  hasBothUsages = computed(() => this.hasCombatUsage() && this.hasOutOfCombatUsage());

  /** Mode choisi par l'utilisateur (peut pointer un contexte non disponible). */
  private usagePick = signal<'combat' | 'outOfCombat'>('combat');

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

  /** Texte hors-combat effectif du palier sélectionné (palier → repli sort). */
  nodeOutOfCombat = computed(() => {
    const n = this.selectedNode();
    return n?.usage?.outOfCombat ?? this.usage()?.outOfCombat;
  });

  /** Texte de contexte combat éventuel du palier (palier → repli sort). */
  nodeCombat = computed(() => {
    const n = this.selectedNode();
    return n?.usage?.combat ?? this.usage()?.combat;
  });

  /** Sorts requis pour débloquer ce sort (prérequis d'arbre de sorts). */
  prerequisites = computed(() => this.spells.prerequisites(this.slug()));
  /** Sorts que ce sort débloque (relation inverse dérivée). */
  unlocks = computed(() => this.spells.unlocks(this.slug()));

  domainSigil = (slug: string): string => sigilOf(slug);
  domainLabel = (slug: string): string => labelOf(slug);
  domainColor = (slug: string): string => colorOf(slug);
  domainIcon = (slug: string): string => iconOf(slug);

  sourceLabel = (s: SpellScalingSource): string => SOURCE_LABELS[s] ?? s;
  targetLabel = (t: SpellTarget): string => TARGET_LABELS[t] ?? t;

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
     ARBRE D'AMÉLIORATION : mise en page
  ───────────────────────────────────────────── */

  /** Nœud → son parent (premier rencontré), pour tracer le chemin racine → nœud. */
  private parentMap = computed(() => {
    const prog = this.progression();
    const parent = new Map<string, string>();
    if (!prog) return parent;
    for (const n of prog.nodes) {
      for (const c of n.next ?? []) if (!parent.has(c)) parent.set(c, n.id);
    }
    return parent;
  });

  private nodeById = computed(() => {
    const prog = this.progression();
    return new Map((prog?.nodes ?? []).map((n) => [n.id, n]));
  });

  /**
   * Disposition en couches : colonne = palier (tier), rangée (lane) calculée par
   * un parcours en profondeur (les feuilles reçoivent des lanes successives, un
   * nœud interne se centre sur la moyenne de ses enfants).
   */
  layout = computed(() => {
    const prog = this.progression();
    if (!prog) return null;
    const byId = this.nodeById();

    const laneOf = new Map<string, number>();
    let nextLane = 0;
    const assign = (id: string): number => {
      const n = byId.get(id);
      if (!n) return nextLane++;
      const kids = n.next ?? [];
      if (!kids.length) {
        const l = nextLane++;
        laneOf.set(id, l);
        return l;
      }
      const ls = kids.map((k) => assign(k));
      const l = ls.reduce((a, b) => a + b, 0) / ls.length;
      laneOf.set(id, l);
      return l;
    };
    assign(prog.root);

    const minTier = Math.min(...prog.nodes.map((n) => n.tier));
    const nodes: LaidOutNode[] = prog.nodes.map((n) => {
      const col = n.tier - minTier;
      const lane = laneOf.get(n.id) ?? 0;
      return { node: n, col, lane, x: col * COL_W, y: lane * ROW_H };
    });

    const pos = new Map(nodes.map((l) => [l.node.id, l]));
    const edges: LaidOutEdge[] = [];
    for (const n of prog.nodes) {
      const from = pos.get(n.id);
      if (!from) continue;
      for (const cid of n.next ?? []) {
        const to = pos.get(cid);
        if (!to) continue;
        const x1 = from.x + NODE_W;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_H / 2;
        const cx = (COL_W - NODE_W) * 0.6;
        edges.push({
          from: n.id,
          to: cid,
          x1, y1, x2, y2,
          d: `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`,
        });
      }
    }

    const maxCol = Math.max(...nodes.map((l) => l.col));
    const maxLane = Math.max(...nodes.map((l) => l.lane));
    return {
      nodes,
      edges,
      width: (maxCol + 1) * COL_W - (COL_W - NODE_W),
      height: (maxLane + 1) * ROW_H - (ROW_H - NODE_H),
    };
  });

  readonly nodeW = NODE_W;
  readonly nodeH = NODE_H;

  /* ─────────────────────────────────────────────
     SÉLECTION
  ───────────────────────────────────────────── */

  private picked = signal<string | null>(null);

  /** Nœud sélectionné (repli sur la racine, ou si le pick vient d'un autre sort). */
  selectedId = computed(() => {
    const prog = this.progression();
    if (!prog) return null;
    const cur = this.picked();
    return cur && this.nodeById().has(cur) ? cur : prog.root;
  });

  selectedNode = computed(() => {
    const id = this.selectedId();
    return id ? this.nodeById().get(id) : undefined;
  });

  select(id: string): void {
    this.picked.set(id);
  }

  /** Ids des nœuds du chemin racine → sélection (surlignage). */
  pathIds = computed(() => {
    const ids = new Set<string>();
    let cur = this.selectedId();
    const parent = this.parentMap();
    while (cur) {
      ids.add(cur);
      cur = parent.get(cur) ?? undefined!;
      if (cur && ids.has(cur)) break;
    }
    return ids;
  });

  isOnPath = (id: string): boolean => this.pathIds().has(id);
  isSelected = (id: string): boolean => this.selectedId() === id;
  isEdgeOnPath = (e: LaidOutEdge): boolean =>
    this.pathIds().has(e.from) && this.pathIds().has(e.to);

  /* ─────────────────────────────────────────────
     BRANCHES
  ───────────────────────────────────────────── */

  private branchIndex = computed(() => {
    const prog = this.progression();
    const idx = new Map<string, number>();
    (prog?.branches ?? []).forEach((b, i) => idx.set(b.id, i));
    return idx;
  });

  /** Couleur d'accent d'une branche (tronc = couleur du domaine). */
  branchColor = (branchId?: string): string => {
    if (!branchId || branchId === 'trunk') return this.domainColor(this.primaryDomain());
    const i = this.branchIndex().get(branchId);
    return i === undefined ? this.domainColor(this.primaryDomain()) : BRANCH_PALETTE[i % BRANCH_PALETTE.length];
  };

  branches = computed(() => this.progression()?.branches ?? []);

  /* ─────────────────────────────────────────────
     SCALING (formules de décomposition, pour calcul à la main)
  ───────────────────────────────────────────── */

  /** Formules de scaling (ratio × source) du nœud sélectionné pour une valeur cible. */
  private scalingParts(affects: 'damage' | 'heal') {
    const node = this.selectedNode();
    return (node?.stats.scaling ?? [])
      .filter((sc) => (sc.affects ?? 'damage') === affects)
      .map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio }));
  }

  /**
   * Composantes de dégâts du nœud sélectionné (base + type + formules de scaling).
   * Gère la forme simple (`damageMin/damageMax`) comme la forme multi-composantes
   * (`damages[]`, ex. lumière + ténèbres). Les valeurs ne sont pas injectées :
   * le survol montre la formule pour un calcul manuel.
   */
  damageComponents = computed(() => {
    const p = this.page();
    const s = this.selectedNode()?.stats;
    if (!p || !s) return [];
    const domainType = DOMAIN_DAMAGE_TYPE[this.primaryDomain()];
    const build = (baseMin: number, baseMax: number, type: string | undefined, scaling?: SpellScaling[]) => ({
      baseMin,
      baseMax,
      parts: (scaling ?? [])
        .filter((sc) => (sc.affects ?? 'damage') === 'damage')
        .map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio })),
      type: this.damageTypes.resolve(type ?? p.spell.damageType ?? domainType),
    });
    if (s.damages?.length) return s.damages.map((d) => build(d.min, d.max, d.type, d.scaling));
    if (s.damageMin !== undefined) return [build(s.damageMin, s.damageMax ?? s.damageMin, s.damageType, s.scaling)];
    return [];
  });

  /**
   * Décompositions des dégâts en % de PV du nœud sélectionné, une par forme
   * présente (PV max, PV actuels). Base + formules de scaling en points de %.
   */
  damagePercentBreakdowns = computed(() => {
    const s = this.selectedNode()?.stats;
    if (!s) return [];
    const parts = this.scalingParts('damage');
    const out: { of: 'max' | 'current'; baseMin: number; baseMax: number; parts: typeof parts }[] = [];
    if (s.damagePercentMaxHp) {
      const d = s.damagePercentMaxHp;
      out.push({ of: 'max', baseMin: d.min, baseMax: d.max ?? d.min, parts });
    }
    if (s.damagePercentCurrentHp) {
      const d = s.damagePercentCurrentHp;
      out.push({ of: 'current', baseMin: d.min, baseMax: d.max ?? d.min, parts });
    }
    return out;
  });

  /** Libellé des PV de référence pour les dégâts en pourcentage. */
  percentOfLabel = (of: 'max' | 'current'): string =>
    of === 'current' ? 'PV actuels' : 'PV max';

  /** Type de dégâts du nœud sélectionné (nœud propre → sort → domaine), si offensif. */
  damageTypeInfo = computed(() => {
    const p = this.page();
    const s = this.selectedNode()?.stats;
    const hasPercent = !!s?.damagePercentMaxHp || !!s?.damagePercentCurrentHp;
    if (!p || !s || (s.damageMin === undefined && !hasPercent)) return undefined;
    const key = s.damageType ?? p.spell.damageType ?? DOMAIN_DAMAGE_TYPE[this.primaryDomain()];
    return this.damageTypes.resolve(key);
  });

  /** Décomposition du soin (base + formules de scaling), pour le survol. */
  healBreakdown = computed(() => {
    const s = this.selectedNode()?.stats;
    if (!s || s.heal === undefined) return null;
    return { base: s.heal, parts: this.scalingParts('heal') };
  });

  /** Décomposition du contre-coup (base + formules de scaling). */
  recoilBreakdown = computed(() => {
    const r = this.selectedNode()?.stats.recoil;
    if (!r) return null;
    return {
      baseMin: r.damageMin,
      baseMax: r.damageMax ?? r.damageMin,
      parts: (r.scaling ?? []).map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio })),
      note: r.note,
    };
  });

  /* ─────────────────────────────────────────────
     DESCRIPTION INTERACTIVE (valeurs effectives + survol)
  ───────────────────────────────────────────── */

  /** Complément de cible : « à un ennemi », « à un allié ou à soi-même » (+ zone). */
  targetsPhrase(node: SpellNode): string {
    const t = node.stats.targets ?? [];
    const area = node.stats.area;
    const areaSuffix = area && area !== 'Cible unique' ? ` (${area.toLowerCase()})` : '';
    const has = (x: SpellTarget) => t.includes(x);
    let who = '';
    if (has('everyone')) who = 'à toutes les créatures';
    else if (has('enemy')) who = 'à un ennemi';
    else if (has('ally') && has('self')) who = 'à un allié ou à soi-même';
    else if (has('ally')) who = 'à un allié';
    else if (has('self')) who = 'à soi-même';
    return who ? ` ${who}${areaSuffix}` : areaSuffix;
  }

  /** Nom français (avec article) d'une stat/attribut : « la vitesse », « l'attaque physique ». */
  statNoun = (s: SpellScalingSource): string => STAT_NOUN[s] ?? this.sourceLabel(s);

  /** Verbe d'action de la phrase d'effet selon les cibles (buff vs malus). */
  effectActionVerb = (node: SpellNode): string =>
    (node.stats.targets ?? []).includes('enemy') ? 'Réduit' : 'Augmente';

  /** Signe d'affichage d'un effet selon les cibles du nœud (+ buff / − malus). */
  effectSign = (node: SpellNode): string =>
    (node.stats.targets ?? []).includes('enemy') ? '−' : '+';

  /** Vrai si le nœud inflige des dégâts sous une forme quelconque (fixe, multi, % PV). */
  nodeHasDamage = (node: SpellNode): boolean => {
    const s = node.stats;
    return (
      s.damageMin !== undefined ||
      !!s.damages?.length ||
      !!s.damagePercentMaxHp ||
      !!s.damagePercentCurrentHp
    );
  };

  /** Vrai si le nœud n'est qu'un malus (cible ennemie, aucun dégât ni soin). */
  isPureMalus = (node: SpellNode): boolean =>
    this.effectSign(node) === '−' && !this.nodeHasDamage(node) && node.stats.heal === undefined;

  /** Vrai si la durée du nœud est scalée par une stat/attribut. */
  durationScaled = (node: SpellNode): boolean => (node.stats.durationScaling?.length ?? 0) > 0;

  /**
   * Décomposition de la durée : durée de base + formules de scaling
   * (`ratio × source`), sans injecter de valeur — pour un calcul à la main.
   */
  durationBreakdown = (node: SpellNode) => ({
    base: node.stats.duration ?? 0,
    parts: (node.stats.durationScaling ?? []).map((sc) => ({
      label: this.sourceLabel(sc.source),
      ratio: sc.ratio,
    })),
  });

  /** Nombre formaté à la française (« 0,2 »). */
  num = (n: number): string => String(n).replace('.', ',');

  /**
   * Décomposition d'un effet : valeur de base + formules de scaling
   * (`ratio × source`), sans injecter de valeur — pour un calcul à la main.
   */
  effectBreakdown = (e: SpellStatEffect) => ({
    base: e.value ?? 0,
    parts: (e.scaling ?? []).map((sc) => ({
      label: this.sourceLabel(sc.source),
      ratio: sc.ratio,
    })),
  });

  /* ─────────────────────────────────────────────
     STATUTS INFLIGÉS + BONUS DE CLASSE
  ───────────────────────────────────────────── */

  /** Statuts infligés par le nœud sélectionné, résolus depuis le catalogue. */
  inflictedStatuses = computed(() => {
    const node = this.selectedNode();
    return (node?.stats.inflicts ?? []).map((app) => {
      const def = this.statusService.byKey(app.status);
      return {
        chance: app.chance,
        duration: app.duration ?? def?.defaultDuration ?? 0,
        def,
      };
    });
  });

  /** Bonus de classe du nœud sélectionné. */
  classBonuses = computed<SpellClassBonus[]>(() => this.selectedNode()?.stats.classBonuses ?? []);

  /** Choix disponibles du nœud sélectionné (sorts à options). */
  choices = computed<SpellChoice[]>(() => this.selectedNode()?.stats.choices ?? []);

  /** Libellé FR d'un type de dégâts (pour faiblesses/résistances). */
  dmgTypeLabel = (key: string): string => this.damageTypes.resolve(key)?.label ?? key;

  /** Météo invoquée par le nœud sélectionné, résolue avec ses effets. */
  weatherInfo = computed(() => {
    const key = this.selectedNode()?.stats.weather ?? this.page()?.spell.weather;
    const w = key ? this.weathers.byKey(key) : undefined;
    if (!w) return undefined;
    return {
      weather: w,
      statuses: (w.appliesStatus ?? [])
        .map((k) => this.statusService.byKey(k))
        .filter((s): s is NonNullable<typeof s> => !!s),
      randomType: w.randomDamage ? this.damageTypes.resolve(w.randomDamage.type) : undefined,
      costMods: (w.costModifiers ?? []).map((m) => ({
        label: this.domainLabel(m.domain),
        factor: m.factor,
        pct: Math.round((m.factor - 1) * 100),
      })),
      damageMods: (w.damageModifiers ?? []).map((m) => ({
        label: this.domainLabel(m.domain),
        factor: m.factor,
        pct: Math.round((m.factor - 1) * 100),
      })),
    };
  });

  /** Statuts résolus d'un choix (nom, chance, durée, définition), pour l'affichage. */
  choiceStatuses = (choice: SpellChoice) =>
    (choice.inflicts ?? []).map((app) => {
      const def = this.statusService.byKey(app.status);
      return { chance: app.chance, duration: app.duration ?? def?.defaultDuration ?? 0, def };
    });

  /** Type de dégâts résolu d'un choix (choix → sort → domaine), pour couleur/badge. */
  choiceDamageType = (choice: SpellChoice) => {
    const key =
      choice.damageType ??
      this.page()?.spell.damageType ??
      DOMAIN_DAMAGE_TYPE[this.primaryDomain()];
    return this.damageTypes.resolve(key);
  };

  /** Libellé FR d'une classe. */
  classLabel = (key: string): string => CLASS_LABELS[key] ?? key;

  /** Libellé FR d'une catégorie de statut. */
  statusCategoryLabel = (cat: StatusCategory): string => STATUS_CATEGORY_LABELS[cat] ?? cat;

  /** Puce d'un modificateur de classe : « +2 Attaque physique ». */
  classEffectChip = (e: SpellStatEffect): string => {
    const v = e.value ?? 0;
    return `${v > 0 ? '+' : ''}${v} ${this.sourceLabel(e.stat)}`;
  };

  /** Puce d'un scaling de classe : « +0,3 × Force (dégâts) ». */
  classScalingChip = (sc: SpellScaling): string => {
    const target = (sc.affects ?? 'damage') === 'heal' ? 'soin' : 'dégâts';
    return `+${this.num(sc.ratio)} × ${this.sourceLabel(sc.source)} (${target})`;
  };

  /** Puce d'un facteur de mana de classe : « Mana −50 % » (0.5) ou « Mana ×1,5 ». */
  manaFactorChip = (f: number): string =>
    f < 1 ? `Mana −${Math.round((1 - f) * 100)} %` : `Mana ×${this.num(f)}`;

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
