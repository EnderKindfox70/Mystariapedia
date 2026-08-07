import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import weatherCatalog from '../../../../public/resources/json/weathers.json';
import { CharacterSheetSummary } from '../../character/character.types';
import { Navbar } from '../../components/navbar/navbar';
import { CombatantFactory } from '../../combat/combatant-factory';
import {
  Combatant,
  CombatAbility,
  EncounterSummary,
  GridPos,
  LogEntry,
  Team,
} from '../../combat/combat.types';
import { freeSpot, TEAM_LABELS } from '../../combat/encounter';
import { TERRAIN_KINDS, TerrainKind, terrainKind } from '../../combat/terrain';
import {
  cellKey,
  cellsInShape,
  CELL_METERS,
  hasLineOfSight,
  occupiedCells,
  shapeLabel,
  unitToCellMeters,
} from '../../combat/grid';
import {
  abilityDamageRanges,
  abilityHealAmount,
  abilityManaAmount,
  aims,
  allDaytimes,
  cannotUse,
  HIT_TARGET_BASE,
  PRECISION_PER_STEP,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  precisionOf,
  effectiveManaCost,
  carriedQty,
  effectiveStat,
  enduranceRecovery,
  findUnit,
  isValidTarget,
  movementOverlay,
  pendingStrikeTargets,
  statusByKey,
  teleportRangeOf,
} from '../../combat/rules';
import { DamageTypesService } from '../../services/damage-types.service';
import { CharacterSheetService } from '../../services/character-sheet.service';
import { EncounterService } from '../../services/encounter.service';
import { StatusEffectsService } from '../../services/status-effects.service';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { BestiaryEntry, BestiaryIndexEntry, Weather } from '../../wiki.types';

/**
 * Ce que le clic sur une case déclenche. `play` couvre aussi la préparation :
 * avant le lancement, cliquer un pion le sélectionne et cliquer une case libre
 * l'y déplace — pas de mode à activer pour ce geste-là.
 */
type Mode = 'play' | 'terrain';

/** Regroupement des actions par nature, pour ne pas noyer le joueur. */
interface ActionGroup {
  key: string;
  label: string;
  kinds: CombatAbility['kind'][];
}

/**
 * Les cinq familles d'action. L'ordre est celui du réflexe : on frappe, puis on
 * cherche mieux, puis on se protège.
 */
const ACTION_GROUPS: ActionGroup[] = [
  { key: 'attaque', label: 'Attaque de base', kinds: ['weapon', 'natural'] },
  { key: 'competences', label: 'Compétences', kinds: ['class'] },
  { key: 'magie', label: 'Magie', kinds: ['spell'] },
  { key: 'objets', label: 'Objets', kinds: ['item'] },
  { key: 'garde', label: 'Garde', kinds: ['guard'] },
];

/** Une case prête à dessiner. */
interface Cell {
  key: string;
  pos: GridPos;
}

@Component({
  selector: 'app-combat',
  imports: [DecimalPipe, FormsModule, RouterLink, Navbar],
  templateUrl: './combat.html',
  styleUrl: './combat.css',
})
export class CombatView {
  private readonly encounters = inject(EncounterService);
  private readonly factory = inject(CombatantFactory);
  private readonly sheets = inject(CharacterSheetService);
  private readonly wiki = inject(WikiLoaderService);
  private readonly damageTypes = inject(DamageTypesService);

  /* ── État partagé avec le service ─────────────────────────────────────── */

  readonly encounter = this.encounters.encounter;
  readonly active = this.encounters.active;
  readonly movementLeft = this.encounters.movementLeft;
  readonly finished = this.encounters.finished;
  readonly canUndo = this.encounters.canUndo;
  readonly saving = this.encounters.saving;
  readonly saveError = this.encounters.error;

  /* ── État propre à la vue ─────────────────────────────────────────────── */

  readonly mode = signal<Mode>('play');
  /** Capacité armée : le prochain clic sur la grille la déclenche. */
  readonly armed = signal<CombatAbility | null>(null);
  readonly hover = signal<GridPos | null>(null);
  /** Cibles désignées une à une pour une capacité « N cibles ». */
  readonly picked = signal<string[]>([]);
  /** Combattant sélectionné hors combat (pour le déplacer ou le retirer). */
  readonly selectedId = signal<string | null>(null);
  readonly panel = signal<'roster' | 'log'>('roster');

  /** Catalogues du montage de rencontre. */
  readonly sheetList = signal<CharacterSheetSummary[]>([]);
  readonly bestiary = signal<BestiaryIndexEntry[]>([]);
  readonly savedList = signal<EncounterSummary[]>([]);
  readonly loadingRoster = signal(true);
  readonly rosterError = signal<string | null>(null);

  /** Équipe dans laquelle atterrissent les ajouts. */
  readonly addTeam = signal<Team>('ennemis');
  readonly bestiaryFilter = signal('');
  readonly sheetFilter = signal('');
  /** Catalogue affiché : ses fiches, ou le bestiaire. */
  readonly rosterTab = signal<'sheets' | 'bestiary'>('sheets');

  readonly weathers = weatherCatalog.weathers as unknown as Weather[];
  readonly daytimes = allDaytimes();
  readonly teams = Object.entries(TEAM_LABELS) as [Team, string][];
  readonly cellMeters = CELL_METERS;
  readonly shapeLabel = shapeLabel;
  readonly statusByKey = statusByKey;
  readonly effectiveStat = effectiveStat;
  readonly enduranceRecovery = enduranceRecovery;
  readonly carriedQty = carriedQty;

  constructor() {
    this.factory.load().subscribe({
      next: () => this.loadingRoster.set(false),
      error: () => {
        this.loadingRoster.set(false);
        this.rosterError.set("Les catalogues d'armes et d'armures n'ont pas pu être chargés.");
      },
    });

    this.sheets
      .list()
      .pipe(catchError(() => of([] as CharacterSheetSummary[])))
      .subscribe((list) => this.sheetList.set(list));

    this.wiki
      .loadAll<BestiaryIndexEntry>('bestiary')
      .pipe(catchError(() => of([] as BestiaryIndexEntry[])))
      .subscribe((list) => this.bestiary.set(list));

    this.encounters
      .list()
      .pipe(catchError(() => of([] as EncounterSummary[])))
      .subscribe((list) => this.savedList.set(list));
  }

  /* ── Grille ───────────────────────────────────────────────────────────── */

  /** Toutes les cases, à plat, pour le rendu du template. */
  readonly cells = computed<Cell[]>(() => {
    const { width, height } = this.encounter().grid;
    const out: Cell[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) out.push({ key: `${x},${y}`, pos: { x, y } });
    }
    return out;
  });

  /** Décor de la rencontre, case par case. */
  readonly terrain = computed(() => this.encounter().terrain);
  readonly terrainKinds = TERRAIN_KINDS;
  /** Décor que le prochain clic pose (ou efface si la case le porte déjà). */
  readonly brush = signal<string>('mur');

  terrainAt(key: string): TerrainKind | undefined {
    return terrainKind(this.terrain()[key]);
  }

  /* ── Actions groupées ─────────────────────────────────────────────────── */

  readonly actionGroups = ACTION_GROUPS;
  /** Famille d'action affichée. */
  readonly actionTab = signal<string>('attaque');

  /** Capacités du combattant actif, rangées par famille. */
  readonly abilitiesByGroup = computed(() => {
    const unit = this.active();
    const out = new Map<string, CombatAbility[]>();
    for (const group of ACTION_GROUPS) {
      out.set(group.key, (unit?.abilities ?? []).filter((a) => group.kinds.includes(a.kind)));
    }
    return out;
  });

  /** Capacités de la famille affichée. */
  readonly visibleAbilities = computed(
    () => this.abilitiesByGroup().get(this.actionTab()) ?? [],
  );

  /** Combien d'actions disponibles dans une famille (pour la pastille). */
  countIn(group: string): number {
    return this.abilitiesByGroup().get(group)?.length ?? 0;
  }

  /** Cases atteignables par le combattant actif (surbrillance du déplacement). */
  readonly reachable = computed(() => {
    const unit = this.active();
    if (!unit || this.armed()) return new Map<string, number>();
    return movementOverlay(this.encounter(), unit);
  });

  /* ── Réactions ──────────────────────────────────────────────────────────
     Une fenêtre ouverte gèle le combat : tant qu'elle n'est pas tranchée, le
     plateau ne sert qu'à ça.
  ─────────────────────────────────────────────────────────────────────── */

  /** Fenêtre de réaction ouverte, s'il y en a une. */
  readonly reaction = computed(() => this.encounter().pendingReaction);

  /** Le combattant à qui la fenêtre est offerte. */
  readonly reactor = computed(() => {
    const pending = this.reaction();
    return pending ? findUnit(this.encounter(), pending.actorId) : undefined;
  });

  /** Capacités qu'il peut employer en réponse. */
  readonly reactionChoices = computed<CombatAbility[]>(() => {
    const pending = this.reaction();
    const unit = this.reactor();
    if (!pending || !unit) return [];
    return unit.abilities.filter((a) => pending.options.includes(a.id));
  });

  /**
   * Réaction de téléportation en attente de destination. Les autres se jouent
   * d'un clic ; celle-ci demande où l'on va, sinon elle n'a aucun sens.
   */
  readonly teleporting = signal<CombatAbility | null>(null);

  /** Cases où le réacteur peut se téléporter. */
  readonly teleportCells = computed(() => {
    const ability = this.teleporting();
    const unit = this.reactor();
    const cells = new Set<string>();
    if (!ability || !unit) return cells;
    const taken = new Set(
      this.encounter()
        .combatants.filter((c) => c.id !== unit.id)
        .flatMap((c) => occupiedCells(c).map(cellKey)),
    );
    for (const cell of this.cells()) {
      if (taken.has(cell.key)) continue;
      if (unitToCellMeters(unit, cell.pos) <= teleportRangeOf(ability) + 1e-6) cells.add(cell.key);
    }
    return cells;
  });

  /** Choisit une réaction : soit elle part, soit elle attend sa destination. */
  chooseReaction(ability: CombatAbility): void {
    if (ability.teleport) {
      this.teleporting.set(ability);
      return;
    }
    this.encounters.dispatch({ type: 'react', abilityId: ability.id });
  }

  skipReaction(): void {
    this.teleporting.set(null);
    this.encounters.dispatch({ type: 'skipReaction' });
  }

  /** Frappe gratuite en attente de cible, s'il y en a une. */
  readonly pending = computed(() => this.encounter().pendingStrike);

  /** Combattants que la frappe gratuite peut atteindre. */
  readonly pendingTargets = computed(() => pendingStrikeTargets(this.encounter()));

  /** Cases où cliquer déclenche la frappe gratuite. */
  readonly pendingCells = computed(() => {
    const cells = new Set<string>();
    for (const unit of this.pendingTargets()) {
      for (const cell of occupiedCells(unit)) cells.add(cellKey(cell));
    }
    return cells;
  });

  /**
   * Zone de gêne de l'arme armée : y tirer coûte la moitié des dégâts. On la
   * mesure avec la même fonction que le moteur, donc ce qui est surligné est
   * exactement ce qui sera pénalisé.
   */
  readonly disadvantageCells = computed(() => {
    const ability = this.armed();
    const unit = this.active();
    const cells = new Set<string>();
    if (!ability?.disadvantageMeters || !unit) return cells;
    for (const cell of this.cells()) {
      if (unitToCellMeters(unit, cell.pos) <= ability.disadvantageMeters + 1e-6) {
        cells.add(cell.key);
      }
    }
    return cells;
  });

  /**
   * Cases à portée de la capacité armée. On mesure avec la même fonction que le
   * moteur (`unitToCellMeters`) et on écarte ce que la vue ne voit pas : une
   * case surlignée est donc une case réellement ciblable, jamais un espoir.
   */
  readonly rangeOverlay = computed(() => {
    const ability = this.armed();
    const unit = this.active();
    const cells = new Set<string>();
    if (!ability || !unit || ability.shape.kind === 'self') return cells;

    const terrain = this.encounter().terrain;
    for (const cell of this.cells()) {
      if (unitToCellMeters(unit, cell.pos) > ability.rangeMeters + 1e-6) continue;
      if (!hasLineOfSight(unit.pos, cell.pos, terrain)) continue;
      cells.add(cell.key);
    }
    return cells;
  });

  /**
   * Empreinte de la capacité armée sous le curseur. C'est la même fonction que
   * celle du moteur : ce qui est surligné est exactement ce qui sera touché.
   */
  readonly areaPreview = computed(() => {
    const ability = this.armed();
    const unit = this.active();
    const at = this.hover();
    if (!ability || !unit || !at) return new Set<string>();
    if (ability.shape.kind === 'self') return new Set(occupiedCells(unit).map(cellKey));
    if (ability.shape.kind === 'targets') return new Set<string>();
    return new Set(cellsInShape(ability.shape, unit.pos, at, this.encounter().grid).map(cellKey));
  });

  /** Combattants indexés par case occupée (une grande créature en couvre plusieurs). */
  readonly unitByCell = computed(() => {
    const map = new Map<string, Combatant>();
    for (const unit of this.encounter().combatants) {
      for (const cell of occupiedCells(unit)) map.set(cellKey(cell), unit);
    }
    return map;
  });

  unitAt(key: string): Combatant | undefined {
    return this.unitByCell().get(key);
  }

  /** Le token n'est dessiné qu'à sa case d'ancrage (les autres sont son corps). */
  isAnchor(unit: Combatant, pos: GridPos): boolean {
    return unit.pos.x === pos.x && unit.pos.y === pos.y;
  }

  /* ── Interactions ─────────────────────────────────────────────────────── */

  onCellClick(pos: GridPos): void {
    const key = cellKey(pos);

    // Une réaction en attente prime sur tout le reste.
    if (this.reaction()) {
      const teleport = this.teleporting();
      if (teleport && this.teleportCells().has(key)) {
        this.encounters.dispatch({ type: 'react', abilityId: teleport.id, at: pos });
        this.teleporting.set(null);
      }
      return;
    }

    // Une frappe gratuite en attente prime ensuite : tant qu'elle n'est pas
    // tranchée, le plateau ne sert qu'à désigner sa cible.
    if (this.pending()) {
      const target = this.unitAt(key);
      if (target && this.pendingCells().has(key)) {
        this.encounters.dispatch({ type: 'freeStrike', targetId: target.id });
      }
      return;
    }

    // Peinture du décor : hors combat uniquement, une rencontre lancée ne voit
    // pas les murs pousser sous les pieds des combattants.
    if (this.mode() === 'terrain') {
      const pinceau = this.brush();
      this.encounters.edit((draft) => {
        // Repasser le même décor l'efface : un seul geste pour poser et retirer.
        if (draft.terrain[key] === pinceau) delete draft.terrain[key];
        else draft.terrain[key] = pinceau;
      });
      return;
    }

    // Avant le lancement, le plateau se manipule directement : cliquer un pion
    // le sélectionne, cliquer une case libre y déplace le pion sélectionné.
    // Pas de mode à activer — c'est le geste attendu.
    if (!this.encounter().started) {
      const onCell = this.unitAt(key);
      if (onCell) {
        this.selectedId.set(this.selectedId() === onCell.id ? null : onCell.id);
        return;
      }
      const id = this.selectedId();
      if (!id) return;
      this.encounters.edit((draft) => {
        const unit = draft.combatants.find((c) => c.id === id);
        if (unit) unit.pos = { ...pos };
      });
      return;
    }

    const ability = this.armed();
    const unit = this.active();
    if (!unit) return;

    if (ability) {
      // Capacité à cibles désignées : on accumule les clics jusqu'au compte.
      if (ability.shape.kind === 'targets') {
        const target = this.unitAt(key);
        if (target && isValidTarget(ability, unit, target) && !target.down) {
          const next = [...new Set([...this.picked(), target.id])];
          this.picked.set(next.slice(0, ability.shape.count));
          if (next.length >= ability.shape.count) this.fire(pos);
        }
        return;
      }
      this.fire(pos);
      return;
    }

    // Aucune capacité armée : le clic déplace, si la case est atteignable.
    if (this.reachable().has(key)) {
      this.encounters.dispatch({ type: 'move', actorId: unit.id, to: pos });
    }
  }

  private fire(at: GridPos): void {
    const ability = this.armed();
    const unit = this.active();
    if (!ability || !unit) return;
    this.encounters.dispatch({
      type: 'use',
      actorId: unit.id,
      abilityId: ability.id,
      at,
      targetIds: this.picked(),
    });
    this.armed.set(null);
    this.picked.set([]);
  }

  /** Arme une capacité (ou la désarme si on reclique dessus). */
  toggleAbility(ability: CombatAbility): void {
    this.picked.set([]);
    this.armed.set(this.armed()?.id === ability.id ? null : ability);
  }

  /** Raison pour laquelle une capacité est indisponible, ou `null`. */
  abilityBlocker(ability: CombatAbility): string | null {
    const unit = this.active();
    if (!unit) return 'Le combat n’a pas commencé.';
    // On teste sur la case du lanceur : les motifs de refus indépendants de la
    // cible (action déjà jouée, mana, statut) remontent tout de suite.
    return cannotUse(this.encounter(), unit, { ...ability, rangeMeters: Infinity }, unit.pos);
  }

  /**
   * Ce que la capacité infligera réellement, prêt à afficher : les dés PLUS le
   * scaling et les buffs de poing. Le moteur fait le calcul (`abilityDamageRanges`),
   * la vue ne fait que le mettre en forme — le bouton ne peut donc pas annoncer
   * autre chose que ce que l'action fera.
   *
   * Les coups identiques d'un enchaînement sont regroupés : « 3 × 16 contondant »
   * se lit mieux que trois fois la même ligne.
   */
  damageChips(unit: Combatant, ability: CombatAbility): string[] {
    const chips: string[] = [];
    for (const range of abilityDamageRanges(unit, ability)) {
      const label = this.damageTypes.resolve(range.type)?.label ?? range.type;
      const amount = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
      const previous = chips.length ? chips[chips.length - 1] : null;
      const text = `${amount} ${label}`;
      // Regroupement : on incrémente le compteur du dernier chip s'il est identique.
      const repeated = previous?.match(/^(?:(\d+) × )?(.+)$/);
      if (repeated && repeated[2] === text) {
        chips[chips.length - 1] = `${Number(repeated[1] ?? 1) + 1} × ${text}`;
      } else {
        chips.push(text);
      }
    }
    return chips;
  }

  /**
   * Seuil de touche annoncé sur le bouton, ou `null` pour ce qui ne vise pas.
   *
   * Il est APPROCHÉ : la cible n'est pas encore choisie au moment où le joueur
   * lit ses options, donc ni son esquive naturelle ni la gêne d'un tir à bout
   * portant n'entrent dans le calcul. Le jet exact est détaillé au journal.
   *
   * L'afficher quand même est le point important : décider d'une action sans
   * savoir ce qu'elle risque n'est pas un choix, c'est un pari.
   */
  hitThresholdHint(unit: Combatant, ability: CombatAbility): number | null {
    if (!aims(ability) || !abilityDamageRanges(unit, ability).length) return null;
    const steps = Math.round(precisionOf(unit, ability) / PRECISION_PER_STEP);
    return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, HIT_TARGET_BASE - steps));
  }

  /**
   * Coût en mana réellement payé, météo et heure du jour comprises. Un sort de
   * ténèbres coûte moins la nuit : le bouton doit le dire.
   */
  manaCost(ability: CombatAbility): number {
    return effectiveManaCost(this.encounter(), ability);
  }

  /** Soin annoncé par une capacité (0 si elle n'en accorde pas). */
  healAmount(unit: Combatant, ability: CombatAbility): number {
    return abilityHealAmount(unit, ability);
  }

  /** Mana rendu annoncé par une capacité (0 si elle n'en rend pas). */
  manaAmount(unit: Combatant, ability: CombatAbility): number {
    return abilityManaAmount(unit, ability);
  }

  /** Distance du combattant actif à une case, pour l'infobulle de portée. */
  distanceTo(pos: GridPos): number {
    const unit = this.active();
    return unit ? unitToCellMeters(unit, pos) : 0;
  }

  /* ── Commandes ────────────────────────────────────────────────────────── */

  start(): void {
    this.mode.set('play');
    this.encounters.dispatch({ type: 'start' });
  }

  endTurn(): void {
    this.armed.set(null);
    this.picked.set([]);
    this.encounters.dispatch({ type: 'endTurn' });
  }

  undo(): void {
    this.armed.set(null);
    this.encounters.undo();
  }

  setWeather(key: string): void {
    this.encounters.dispatch({ type: 'setWeather', weather: key });
  }

  setDaytime(key: string): void {
    this.encounters.dispatch({ type: 'setDaytime', daytime: key });
  }

  /** Porte la frappe gratuite sur la cible désignée. */
  strikeAt(unit: Combatant): void {
    this.encounters.dispatch({ type: 'freeStrike', targetId: unit.id });
  }

  /** Renonce à la frappe gratuite. */
  skipStrike(): void {
    this.encounters.dispatch({ type: 'skipStrike' });
  }

  adjustHp(unit: Combatant, delta: number): void {
    if (delta < 0) this.encounters.dispatch({ type: 'damage', targetId: unit.id, amount: -delta });
    else this.encounters.dispatch({ type: 'heal', targetId: unit.id, amount: delta });
  }

  applyStatusTo(unit: Combatant, key: string): void {
    if (!key) return;
    this.encounters.dispatch({ type: 'applyStatus', targetId: unit.id, status: key });
  }

  removeStatus(unit: Combatant, key: string): void {
    this.encounters.dispatch({ type: 'clearStatus', targetId: unit.id, status: key });
  }

  rename(name: string): void {
    this.encounters.edit((draft) => {
      draft.name = name;
    });
  }

  resize(width: number, height: number): void {
    this.encounters.edit((draft) => {
      draft.grid = {
        width: Math.max(5, Math.min(60, Math.round(width) || draft.grid.width)),
        height: Math.max(5, Math.min(60, Math.round(height) || draft.grid.height)),
      };
      // Personne ne doit se retrouver hors du plateau après un rétrécissement.
      for (const unit of draft.combatants) {
        unit.pos.x = Math.min(unit.pos.x, draft.grid.width - 1);
        unit.pos.y = Math.min(unit.pos.y, draft.grid.height - 1);
      }
    });
  }

  /* ── Montage de la rencontre ──────────────────────────────────────────── */

  addSheet(summary: CharacterSheetSummary): void {
    this.sheets.get(summary.id).subscribe((stored) => {
      this.encounters.edit((draft) => {
        const team = this.addTeam();
        draft.combatants.push(
          this.factory.fromSheet(stored.data, team, freeSpot(draft, team), stored.id),
        );
      });
    });
  }

  addCreature(index: BestiaryIndexEntry): void {
    this.wiki.load<BestiaryEntry>('bestiary', index.slug).subscribe((entry) => {
      this.encounters.edit((draft) => {
        const team = this.addTeam();
        // Numérotation : « Loup Gris 2 » plutôt que deux pions homonymes.
        const already = draft.combatants.filter(
          (c) => c.origin.kind === 'bestiary' && c.origin.slug === entry.slug,
        ).length;
        draft.combatants.push(
          this.factory.fromBestiary(entry, team, freeSpot(draft, team), already + 1),
        );
      });
    });
  }

  removeCombatant(id: string): void {
    this.encounters.edit((draft) => {
      draft.combatants = draft.combatants.filter((c) => c.id !== id);
      draft.order = draft.order.filter((o) => o !== id);
    });
    if (this.selectedId() === id) this.selectedId.set(null);
  }

  /** Sélectionne (ou désélectionne) un combattant depuis la liste d'initiative. */
  select(unit: Combatant): void {
    this.selectedId.set(this.selectedId() === unit.id ? null : unit.id);
    // Sélectionner depuis la liste doit permettre de le poser sur le plateau :
    // on quitte donc un éventuel mode de peinture du décor.
    if (this.selectedId() && this.mode() !== 'play') this.mode.set('play');
  }

  /** Fiches de personnage filtrées par le champ de recherche. */
  readonly filteredSheets = computed(() => {
    const needle = this.sheetFilter().trim().toLowerCase();
    const list = this.sheetList();
    if (!needle) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) || (s.race ?? '').toLowerCase().includes(needle),
    );
  });

  /** Créatures du bestiaire filtrées par le champ de recherche. */
  readonly filteredBestiary = computed(() => {
    const needle = this.bestiaryFilter().trim().toLowerCase();
    const list = this.bestiary();
    if (!needle) return list.slice(0, 40);
    return list.filter((e) => e.name.toLowerCase().includes(needle)).slice(0, 40);
  });

  /* ── Persistance ──────────────────────────────────────────────────────── */

  save(): void {
    this.encounters.save().subscribe({
      next: () => this.encounters.list().subscribe((l) => this.savedList.set(l)),
      error: () => undefined,
    });
  }

  open(summary: EncounterSummary): void {
    this.encounters.load(summary.id).subscribe();
  }

  discard(summary: EncounterSummary): void {
    this.encounters.remove(summary.id).subscribe(() => {
      this.savedList.update((l) => l.filter((e) => e.id !== summary.id));
      if (this.encounters.encounterId() === summary.id) this.encounters.reset();
    });
  }

  fresh(): void {
    this.encounters.reset();
    this.mode.set('play');
    this.armed.set(null);
  }

  /* ── Affichage ────────────────────────────────────────────────────────── */

  hpPercent(unit: Combatant): number {
    return Math.max(0, Math.min(100, (unit.hp / Math.max(1, unit.base.hp)) * 100));
  }

  /** Remplissage de la barre d'endurance, sur la réserve COURANTE (buffs compris). */
  endurancePercent(unit: Combatant): number {
    const max = Math.max(1, effectiveStat(unit, 'endurance'));
    return Math.max(0, Math.min(100, (unit.endurance / max) * 100));
  }

  /** Remplissage de la barre de mana, sur la réserve courante elle aussi. */
  manaPercent(unit: Combatant): number {
    const max = Math.max(1, effectiveStat(unit, 'mana'));
    return Math.max(0, Math.min(100, (unit.mana / max) * 100));
  }

  /** Ordre d'initiative affiché : la liste de tour, ou le roster avant le combat. */
  readonly turnOrder = computed<Combatant[]>(() => {
    const enc = this.encounter();
    if (!enc.started) return enc.combatants;
    return enc.order
      .map((id) => enc.combatants.find((c) => c.id === id))
      .filter((c): c is Combatant => !!c);
  });

  /** Journal du plus récent au plus ancien (on lit ce qui vient d'arriver). */
  readonly recentLog = computed<LogEntry[]>(() => [...this.encounter().log].reverse().slice(0, 60));

  /**
   * Statuts proposés au MJ. Dérivés du catalogue et non d'une liste écrite à la
   * main : un statut ajouté à `status_effects.json` apparaît ici tout seul.
   */
  readonly allStatuses = inject(StatusEffectsService)
    .all()
    .map((s) => ({ key: s.key, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  trackCell = (_: number, cell: Cell): string => cell.key;
  trackUnit = (_: number, unit: Combatant): string => unit.id;
  trackLog = (_: number, entry: LogEntry): number => entry.id;
}
