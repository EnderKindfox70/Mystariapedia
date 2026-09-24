import { Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SpellsService } from '../../../services/spells.service';
import { ATTRIBUTES, STATS } from '../../../character/universe-data';
import { SpellScalingSource, SpellTarget } from '../../../wiki.types';
import * as E from '../../../combat/spell-customization';
import { CLASSES, STATUSES, TEST_PLAYERS, TEST_SPELLS, TestPlayer, catalogFrom } from './data';

/* Banc d'essai de la personnalisation de sorts par budget (WIP). Tout le calcul
   vit dans `combat/spell-customization.ts` : ce composant lit l'état, appelle
   le moteur et dessine. Rien de ce qu'il manipule n'est lu par le wiki. */

const LS = { player: 'mystaria.spellBuilder.player', rules: 'mystaria.spellBuilder.rules', selected: 'mystaria.spellBuilder.selected' };

type Flash = { msg: string; kind: 'ok' | 'warn' | 'ko' };
type StepAction = { type: 'param'; id: string } | { type: 'status' } | { type: 'knockback' } | { type: 'scaling'; src: string } | { type: 'upkeep' };

/** Une ligne de paramètre continu, prête à dessiner, et l'action de ses boutons. */
interface ParamVM extends E.ParamView {
  key: string;
  note: string;
  off: boolean;
  action: StepAction;
}

function mergeRules(saved: unknown): E.Rules {
  const rules = E.clone(E.DEFAULT_RULES) as unknown as Record<string, unknown>;
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved)) {
      const cur = rules[k];
      if (v && typeof v === 'object' && cur && typeof cur === 'object') {
        const merged = cur as Record<string, unknown>;
        for (const [k2, v2] of Object.entries(v)) {
          merged[k2] = v2 && typeof v2 === 'object' ? { ...(merged[k2] as object), ...v2 } : v2;
        }
      } else if (k in rules) {
        rules[k] = v;
      }
    }
  }
  return rules as unknown as E.Rules;
}

@Component({
  selector: 'spell-builder',
  imports: [NgTemplateOutlet],
  templateUrl: './spell-builder.html',
  styleUrl: './spell-builder.css',
})
export class SpellBuilder {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly query = inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap;
  private readonly catalog = catalogFrom(inject(SpellsService).all());

  // Référentiels exposés au gabarit.
  readonly spells = TEST_SPELLS;
  readonly presets = TEST_PLAYERS;
  readonly classes = CLASSES;
  readonly domains = E.DOMAINS;
  readonly attributes = ATTRIBUTES;
  readonly combatStats = STATS;
  readonly maxDomains = E.MAX_DOMAINS;
  readonly catalogList = Object.entries(this.catalog)
    .map(([key, v]) => ({ key, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  readonly fmt = E.fmt;
  readonly signedPts = E.signedPts;
  readonly domainLabel = E.domainLabel;
  readonly sourceLabel = E.sourceLabel;
  readonly damageTypeLabel = E.damageTypeLabel;
  readonly targetLabel = (t: SpellTarget) => E.TARGET_LABELS[t];
  readonly statusName = (k: string) => STATUSES.find((s) => s.key === k)?.name ?? k;

  // ── État ──
  readonly rules = signal<E.Rules>(mergeRules(this.load(LS.rules)));
  readonly player = signal<TestPlayer>(this.initialPlayer());
  readonly selectedKey = signal<string>(this.initialSpell());
  /** Repos long en cours : seule fenêtre où un build se réassigne. */
  readonly resting = signal(false);
  /** Builds en cours d'édition pendant le repos, par clé de sort. */
  readonly drafts = signal<Record<string, E.Build>>({});
  readonly flash = signal<Flash | null>(null);
  readonly knownInput = signal('');
  private flashTimer?: ReturnType<typeof setTimeout>;

  // ── Dérivés ──
  readonly ctx = computed<E.BuilderContext>(() => ({ rules: this.rules(), classes: CLASSES, catalog: this.catalog }));
  readonly spell = computed(() => TEST_SPELLS.find((s) => s.key === this.selectedKey()) ?? TEST_SPELLS[0]);
  readonly access = computed(() => E.checkAccess(this.spell(), this.player(), this.ctx()));
  readonly insp = computed(() => E.inspirationSummary(this.player(), this.ctx()));
  readonly classInspiration = computed(() => E.classInspiration(this.player(), this.ctx()));
  readonly invested = computed(() => [...E.investedDomains(this.player(), this.ctx())]);
  readonly preset = computed(() => TEST_PLAYERS.find((x) => x.id === this.player().id));
  readonly presetModified = computed(() => {
    const preset = this.preset();
    return !!preset && JSON.stringify(preset) !== JSON.stringify(this.player());
  });
  readonly knownList = computed(() =>
    this.player().knownSpells.map((key) => {
      const cat = this.catalog[key];
      return {
        key,
        name: cat?.name ?? key,
        meta: cat ? `${cat.domains.map(E.domainLabel).join(' + ')} · niv. ${cat.level}` : 'inconnu du wiki',
      };
    }),
  );

  readonly cards = computed(() =>
    TEST_SPELLS.map((s) => {
      const acc = E.checkAccess(s, this.player(), this.ctx());
      const [cls, label] = acc.usable
        ? ['ok', 'Connu']
        : acc.known ? ['warn', 'Conditions rompues'] : acc.learnable ? ['info', 'Apprenable'] : ['ko', 'Fermé'];
      const level = acc.known ? E.spellProgress(this.player().spellState[s.key]?.xp ?? 0, this.rules()).level : null;
      return {
        key: s.key,
        name: s.name,
        meta: `${E.spellDomains(s).map(E.domainLabel).join(' + ')} · niv. ${s.level}${s.power && s.power !== 'standard' ? ` · ${s.power}` : ''}`,
        cls,
        label,
        level,
      };
    }),
  );

  readonly committed = computed(() => E.normalizeBuild(this.player().spellState[this.selectedKey()]?.build));
  readonly build = computed(() =>
    this.resting() ? this.drafts()[this.selectedKey()] ?? this.committed() : this.committed(),
  );
  readonly progress = computed(() =>
    E.spellProgress(this.player().spellState[this.selectedKey()]?.xp ?? 0, this.rules()),
  );
  readonly progressPct = computed(() => {
    const p = this.progress();
    if (p.nextThreshold === null) return 100;
    const span = p.nextThreshold - p.prevThreshold;
    return span > 0 ? Math.max(0, Math.min(100, ((p.xp - p.prevThreshold) / span) * 100)) : 0;
  });
  readonly opts = computed(() => E.spellOptions(this.spell()));

  /* ── Seuils de niveau ──
     Le niveau vient de l'XP du sort chez CE joueur : le banc ferme donc ce que
     le moteur refuserait, au lieu de laisser cocher puis lire l'erreur. */

  /** Le seuil qui ferme cette option au niveau atteint, ou `null`. */
  gate(key: string): E.Gate | null {
    return E.gateAt(this.spell(), key, this.progress().level);
  }

  /** Le jeton accolé à un libellé fermé (« · niv. 3 »). */
  gateTag(key: string): string {
    const g = this.gate(key);
    return g ? ` · niv. ${g.minLevel}` : '';
  }

  /** Tous les seuils du sort, franchis ou non. */
  readonly gates = computed(() => E.gateSummary(this.spell(), this.progress().level));
  readonly base = computed(() => E.baseStatsOf(this.spell()));
  readonly assessment = computed(() => E.assess(this.spell(), this.player(), this.ctx(), this.build()));
  readonly governedStatus = computed(() => E.governedFields(this.spell()).has('statusType'));

  // Famille 1
  readonly f1 = computed<ParamVM[]>(() => {
    const rules = this.rules();
    const b = this.build();
    // Un ratio échangé se règle dans l'unité de sa nouvelle source.
    const { stats, factors } = E.scalingSwapPreview(this.spell(), b);
    return this.opts().params.map((p) => {
      const gate = this.gate(`param:${p.id}`);
      const off = (b.continuous && p.kind === 'duration') || !!gate;
      const { kind, cap } = E.convertedParam(p, E.kindOf(p, rules), factors);
      return this.paramVM({
        key: p.id,
        label: p.label,
        kind,
        base: E.paramBase(stats, p),
        units: b.params[p.id] ?? 0,
        cap,
        limits: p,
        action: { type: 'param', id: p.id },
        off,
        note: gate
          ? `Seuil : ${E.gateText(gate)}.`
          : off ? 'Sans objet en mode continu.' : '',
      });
    });
  });

  // Famille 2
  readonly baseStatuses = computed(() => new Set((this.base().inflicts ?? []).map((i) => i.status)));
  readonly statusChanceRow = computed<ParamVM | null>(() => {
    const su = this.build().statusUnlock;
    if (!su || !this.opts().statusUnlock) return null;
    const pdef = E.unlockParams.statusChance(this.opts());
    return this.paramVM({
      key: 'status', label: `Chance de ${this.statusName(su.status)}`, kind: this.rules().paramKinds.chance,
      base: this.rules().unlockedStatusBaseChance, units: su.steps ?? 0, cap: pdef.cap, limits: pdef, action: { type: 'status' },
    });
  });
  readonly knockbackRow = computed<ParamVM | null>(() => {
    const kb = this.build().knockback;
    if (!kb || !this.opts().knockbackUnlock) return null;
    const pdef = E.unlockParams.knockbackCells(this.opts());
    return this.paramVM({
      key: 'knockback', label: 'Repoussement', kind: this.rules().paramKinds.knockback,
      base: this.rules().unlockedKnockbackCells, units: kb.steps, cap: pdef.cap, limits: pdef, action: { type: 'knockback' },
    });
  });
  readonly scalingField = computed(() => this.opts().scalingUnlock?.field ?? 'scaling');
  readonly scalingChoices = computed(() => {
    const def = this.opts().scalingUnlock;
    const present = new Set((this.base()[this.scalingField()] ?? []).map((s) => s.source));
    return (def?.eligible ?? []).map((src) => ({ src, on: src in this.build().scalingUnlocks, already: present.has(src) }));
  });
  readonly scalingRows = computed<ParamVM[]>(() => {
    const pdef = E.unlockParams.scalingRatio(this.opts());
    return Object.entries(this.build().scalingUnlocks).map(([src, steps]) =>
      this.paramVM({
        key: `scaling:${src}`, label: `Ratio ${E.sourceLabel(src)}`, kind: this.rules().paramKinds.ratio,
        base: this.rules().unlockedScalingRatio, units: steps, cap: pdef.cap, limits: pdef, action: { type: 'scaling', src },
      }),
    );
  });
  readonly upkeepRow = computed<ParamVM | null>(() => {
    if (!this.build().continuous || !this.opts().continuousMode) return null;
    const pdef = E.unlockParams.upkeep(this.opts());
    return this.paramVM({
      key: 'upkeep', label: 'Mana (entretien/tour)', kind: this.rules().paramKinds.upkeep,
      base: this.spell().baseStats.mana, units: this.build().upkeepSteps, cap: pdef.cap, limits: pdef, action: { type: 'upkeep' },
    });
  });

  // Famille 3
  readonly targetsCeiling = computed(() => E.extraTargetsCeiling(this.opts().extraTargets ?? {}, this.rules()));
  readonly extraTargetsTotal = computed(() => (this.opts().extraTargets?.base ?? 0) + this.build().extraTargets);
  readonly effectsCount = computed(() => (this.base().effects ?? []).length + this.build().extraEffects.length);

  // Famille 4
  /** Le banc garde un seul swap à la fois : « chemin|source ». L'atelier officiel en permet un par ratio. */
  readonly scalingSwapChoices = computed(() => {
    const def = this.opts().scalingSwap;
    const entries = E.scalingEntries(this.base());
    return entries.flatMap((e) =>
      (def?.eligibleFor(e.path) ?? [])
        .filter((to) => !entries.some((x) => x.list === e.list && x.source === to))
        .map((to) => ({ value: `${e.path}|${to}`, label: `${e.scales} : ${E.sourceLabel(e.source)} → ${E.sourceLabel(to)}` })),
    );
  });
  readonly scalingSwapValue = computed(() => {
    const s = this.build().swaps.scalings[0];
    return s ? `${s.path}|${s.to}` : '';
  });
  readonly currentShape = computed(() => E.AREA_SHAPES.find((s) => (this.base().area ?? '').startsWith(s)) ?? '');
  readonly shapeChoices = computed(() => (this.opts().areaShapeSwap?.shapes ?? []).filter((s) => s !== this.currentShape()));
  readonly statusSwapChoices = computed(() => {
    const def = this.opts().statusTypeSwap;
    return (this.base().inflicts ?? []).flatMap((inf, i) =>
      (def?.eligible ?? [])
        .filter((to) => to !== inf.status)
        .map((to) => ({ value: `${i}:${to}`, label: `${this.statusName(inf.status)} → ${this.statusName(to)}` })),
    );
  });
  readonly statusSwapValue = computed(() => {
    const s = this.build().swaps.statusType;
    return s ? `${s.index}:${s.to}` : '';
  });
  readonly ownInvested = computed(() => E.spellDomains(this.spell()).every((d) => this.invested().includes(d)));
  readonly crossChoices = computed(() =>
    (this.opts().crossDomain?.eligible ?? []).map((d) => ({ key: d, name: E.domainLabel(d), invested: this.invested().includes(d) })),
  );
  readonly baseDamageType = computed(() => E.baseDamageType(this.spell()));
  readonly damageTypeSwapChoices = computed(() =>
    (this.opts().damageTypeSwap?.eligible ?? []).filter((t) => t !== this.baseDamageType()),
  );
  readonly hasDamage = computed(() => this.base().damageMin != null);
  readonly mixTargets = computed(() => E.mixTargets(this.spell(), this.build()));
  readonly mix = computed(() => {
    const targets = this.mixTargets();
    // La fiche peut partir d'une répartition déjà acquise (lave : moitié roche).
    const m = E.effectiveMix(this.spell(), this.build());
    const type = m && targets.includes(m.type) ? m.type : targets[0] ?? null;
    const start = E.defaultMix(this.spell());
    return {
      type,
      tenths: type && m?.type === type ? m.tenths : 0,
      start: start && start.type === type ? start.tenths : 0,
      steps: E.mixSteps(this.spell(), this.build().mix),
      baseType: E.baseDamageType(this.spell()),
    };
  });
  /** Ce qu'un cran de plus (d = +1) ou de moins (d = −1) change au prix, en texte signé. */
  mixHint(d: number): string {
    const { type, tenths, steps } = this.mix();
    if (!type) return '';
    const next = E.mixSteps(this.spell(), { type, tenths: tenths + d });
    return E.signedPts((next - steps) * this.rules().costs.mixPerTenth);
  }

  // Résultat
  readonly statsDiff = computed(() => {
    const names = Object.fromEntries(STATUSES.map((s) => [s.key, s.name]));
    const baseRows = E.describeStats(this.base(), names);
    const finalRows = E.describeStats(this.assessment().stats, names);
    const keys = [...new Set([...baseRows.map((r) => r.key), ...finalRows.map((r) => r.key)])];
    return keys.map((k) => {
      const b = baseRows.find((r) => r.key === k);
      const f = finalRows.find((r) => r.key === k);
      return {
        label: (f ?? b)!.label,
        base: b?.value ?? '—',
        final: f?.value ?? '—',
        cls: !b ? 'added' : !f ? 'removed' : b.value !== f.value ? 'changed' : '',
      };
    });
  });
  readonly baseRows = computed(() =>
    E.describeStats(this.base(), Object.fromEntries(STATUSES.map((s) => [s.key, s.name]))),
  );
  readonly expected = computed(() => {
    const b = E.expectedOutput(this.base(), this.player());
    const f = E.expectedOutput(this.assessment().stats, this.player());
    const labels = [...new Set([...b.map((r) => r.label), ...f.map((r) => r.label)])];
    return labels.map((label) => {
      const base = b.find((r) => r.label === label)?.value ?? '—';
      const final = f.find((r) => r.label === label)?.value ?? '—';
      return { label, base, final, changed: base !== final };
    });
  });
  readonly exportJson = computed(() =>
    JSON.stringify(E.exportSpell(this.spell(), this.player(), this.ctx(), this.build()), null, 2),
  );
  readonly paramKindEntries = computed(() => Object.entries(this.rules().paramKinds) as [E.ParamKindKey, E.ParamKind][]);
  readonly costEntries = computed(() => Object.entries(this.rules().costs) as [keyof E.Rules['costs'], number][]);

  constructor() {
    effect(() => {
      this.save(LS.player, this.player());
      this.save(LS.rules, this.rules());
      this.save(LS.selected, this.selectedKey());
    });
  }

  // ── Stockage local (navigateur seulement) ──

  private load(key: string): unknown {
    if (!this.browser) return null;
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  }

  private save(key: string, value: unknown): void {
    if (!this.browser) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible : le banc marche sans */
    }
  }

  /** `?player=<id>` l'emporte, puis la fiche gardée localement, puis le joueur par défaut. */
  private initialPlayer(): TestPlayer {
    const asked = TEST_PLAYERS.find((p) => p.id === this.query?.get('player'));
    if (asked) return E.clone(asked);
    const saved = this.load(LS.player) as TestPlayer | null;
    if (saved?.domains && saved.knownSpells) return saved;
    return E.clone(TEST_PLAYERS.find((p) => p.default) ?? TEST_PLAYERS[0]);
  }

  private initialSpell(): string {
    const asked = this.query?.get('spell') ?? (this.load(LS.selected) as string | null);
    return TEST_SPELLS.some((s) => s.key === asked) ? asked! : 'fire-embers';
  }

  // ── Aides ──

  private say(msg: string, kind: Flash['kind'] = 'ok'): void {
    this.flash.set({ msg, kind });
    clearTimeout(this.flashTimer);
    if (this.browser) this.flashTimer = setTimeout(() => this.flash.set(null), 5000);
  }

  private editPlayer(fn: (p: TestPlayer) => void): void {
    this.player.update((p) => {
      const next = E.clone(p);
      fn(next);
      return next;
    });
  }

  private spellState(p: TestPlayer, key: string): E.SpellState {
    return (p.spellState[key] ??= { xp: 0, build: null, lastReassignedAt: null });
  }

  /** Toute modification de build passe par ici : hors repos long, le build est figé. */
  private mutate(fn: (b: E.Build) => void): void {
    if (!this.resting()) {
      this.say('Hors repos long : la personnalisation est figée. Lancez un repos long pour réassigner.', 'warn');
      return;
    }
    const next = E.clone(this.build());
    fn(next);
    const key = this.selectedKey();
    this.drafts.update((d) => ({ ...d, [key]: next }));
  }

  /** Une ligne de paramètre : valeur, zone, et prix du cran suivant dans chaque sens. */
  private paramVM(a: {
    key: string; label: string; kind: E.ParamKind; base: number; units: number;
    cap: E.Cap | null | undefined; limits: E.Limits; action: StepAction; off?: boolean; note?: string;
  }): ParamVM {
    return {
      ...E.paramView({ ...a, locked: !this.resting() || !!a.off }),
      key: a.key,
      note: a.note ?? '',
      off: !!a.off,
      action: a.action,
    };
  }

  valueOf(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  checkedOf(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  // ── Joueur type ──

  selectSpell(key: string): void {
    this.selectedKey.set(key);
  }

  loadPreset(id: string): void {
    const preset = TEST_PLAYERS.find((p) => p.id === id);
    if (!preset) return;
    this.player.set(E.clone(preset));
    this.resting.set(false);
    this.drafts.set({});
  }

  resetPlayer(): void {
    const preset = this.preset() ?? TEST_PLAYERS.find((p) => p.default) ?? TEST_PLAYERS[0];
    this.loadPreset(preset.id);
    this.say(`Joueur type « ${preset.name} » rechargé depuis data/players/.`);
  }

  setName(v: string): void {
    this.editPlayer((p) => (p.name = v));
  }

  setClass(v: string): void {
    this.editPlayer((p) => (p.class = v));
  }

  setLevel(v: string): void {
    this.editPlayer((p) => (p.level = Math.max(1, Math.min(20, Math.round(Number(v)) || 1))));
  }

  setAttribute(key: string, v: string): void {
    this.editPlayer((p) => ((p.attributes as Record<string, number>)[key] = Number(v) || 0));
  }

  setStat(key: string, v: string): void {
    this.editPlayer((p) => ((p.stats as Record<string, number>)[key] = Number(v) || 0));
  }

  toggleDomain(key: string, on: boolean): void {
    this.editPlayer((p) => {
      if (on && !p.domains.includes(key) && p.domains.length < E.MAX_DOMAINS) p.domains.push(key);
      if (!on) p.domains = p.domains.filter((d) => d !== key);
    });
  }

  forget(key: string): void {
    this.editPlayer((p) => (p.knownSpells = p.knownSpells.filter((k) => k !== key)));
  }

  addKnown(): void {
    const key = this.knownInput().trim();
    if (!key) return;
    if (!this.catalog[key]) return this.say(`« ${key} » n'existe pas dans le wiki.`, 'ko');
    if (this.player().knownSpells.includes(key)) return this.say('Déjà connu.', 'warn');
    this.editPlayer((p) => p.knownSpells.push(key));
    this.knownInput.set('');
    this.say(`${this.catalog[key].name} ajouté aux sorts connus.`);
  }

  learn(): void {
    const spell = this.spell();
    if (!this.access().learnable) return this.say('Conditions non remplies.', 'ko');
    this.editPlayer((p) => {
      p.knownSpells.push(spell.key);
      this.spellState(p, spell.key);
    });
    this.say(`${spell.name} appris (−${this.rules().learnCost} inspiration).`);
  }

  learnKey(key: string): void {
    this.editPlayer((p) => {
      if (!p.knownSpells.includes(key)) p.knownSpells.push(key);
    });
    this.say(`${this.catalog[key]?.name ?? key} marqué comme connu (coûte l'inspiration).`);
  }

  copyPlayer(): void {
    void this.copy(JSON.stringify(this.player(), null, 4));
  }

  async importPlayer(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.domains) || !data.attributes) throw new Error('format');
      this.player.set({ knownSpells: [], spellState: {}, stats: {}, ...data });
      this.resting.set(false);
      this.drafts.set({});
      this.say(`Joueur « ${data.name} » importé.`);
    } catch {
      this.say('Fichier illisible : un JSON de joueur type est attendu.', 'ko');
    }
    input.value = '';
  }

  // ── Progression et repos long ──

  addXp(context: 'combat' | 'training', n: number): void {
    if (context === 'training' && !this.resting()) return this.say("L'entraînement dédié se fait pendant un repos long.", 'warn');
    const key = this.selectedKey();
    const before = this.progress().level;
    this.editPlayer((p) => {
      const st = this.spellState(p, key);
      st.xp = E.round(st.xp + n * E.xpForCast(context, this.rules()), 2);
    });
    const after = this.progress().level;
    if (after > before) this.say(`Niveau de sort ${after} ! +${(after - before) * this.rules().pointsPerSpellLevel} point(s) de personnalisation.`);
  }

  setXp(v: string): void {
    const key = this.selectedKey();
    this.editPlayer((p) => (this.spellState(p, key).xp = Math.max(0, Number(v) || 0)));
  }

  restStart(): void {
    this.resting.set(true);
    this.drafts.set({});
  }

  restCancel(): void {
    this.resting.set(false);
    this.drafts.set({});
    this.say('Repos annulé : builds inchangés.', 'warn');
  }

  restEnd(): void {
    const drafts = this.drafts();
    const invalid = Object.entries(drafts)
      .filter(([key, b]) => {
        const spell = TEST_SPELLS.find((s) => s.key === key);
        return spell && !E.assess(spell, this.player(), this.ctx(), b).valid;
      })
      .map(([key]) => TEST_SPELLS.find((s) => s.key === key)!.name);
    if (invalid.length) return this.say(`Build invalide : ${invalid.join(', ')}. Corrigez ou annulez le repos.`, 'ko');
    const now = new Date().toISOString();
    let changed = 0;
    this.editPlayer((p) => {
      for (const [key, b] of Object.entries(drafts)) {
        const st = this.spellState(p, key);
        if (JSON.stringify(E.normalizeBuild(st.build)) !== JSON.stringify(b)) {
          st.build = b;
          st.lastReassignedAt = now;
          changed++;
        }
      }
    });
    this.resting.set(false);
    this.drafts.set({});
    this.say(`Repos long terminé — ${changed} build(s) réassigné(s).`);
  }

  buildReset(): void {
    this.mutate((b) => Object.assign(b, E.emptyBuild()));
  }

  // ── Build ──

  step(action: StepAction, d: number): void {
    this.mutate((b) => {
      switch (action.type) {
        case 'param':
          b.params[action.id] = (b.params[action.id] ?? 0) + d;
          if (!b.params[action.id]) delete b.params[action.id];
          break;
        case 'status':
          if (b.statusUnlock) b.statusUnlock.steps = (b.statusUnlock.steps ?? 0) + d;
          break;
        case 'knockback':
          if (b.knockback) b.knockback.steps += d;
          break;
        case 'scaling':
          if (action.src in b.scalingUnlocks) b.scalingUnlocks[action.src] += d;
          break;
        case 'upkeep':
          b.upkeepSteps += d;
          break;
      }
    });
  }

  setStatusUnlock(v: string): void {
    this.mutate((b) => (b.statusUnlock = v ? { status: v, steps: 0 } : null));
  }

  toggleKnockback(on: boolean): void {
    this.mutate((b) => (b.knockback = on ? { steps: 0 } : null));
  }

  toggleTarget(t: SpellTarget, on: boolean): void {
    this.mutate((b) => (b.targetUnlocks = on ? [...new Set([...b.targetUnlocks, t])] : b.targetUnlocks.filter((x) => x !== t)));
  }

  toggleScaling(src: string, on: boolean): void {
    this.mutate((b) => {
      if (on) b.scalingUnlocks[src] = 0;
      else delete b.scalingUnlocks[src];
    });
  }

  setContinuous(on: boolean): void {
    this.mutate((b) => {
      b.continuous = on;
      if (!on) b.upkeepSteps = 0;
    });
  }

  extraTargets(d: number): void {
    this.mutate((b) => (b.extraTargets = Math.max(0, b.extraTargets + d)));
  }

  toggleEffect(stat: string, on: boolean): void {
    this.mutate((b) => (b.extraEffects = on ? [...new Set([...b.extraEffects, stat])] : b.extraEffects.filter((x) => x !== stat)));
  }

  swapDamageType(v: string): void {
    this.mutate((b) => (b.swaps.damageType = v || null));
  }

  toggleOwnEffect(id: string, on: boolean): void {
    this.mutate((b) => (b.ownEffects = on ? [...new Set([...b.ownEffects, id])] : b.ownEffects.filter((x) => x !== id)));
  }

  swapScaling(v: string): void {
    const [path, to] = v.split('|');
    this.mutate((b) => (b.swaps.scalings = v ? [{ path, to: to as SpellScalingSource }] : []));
  }

  swapArea(v: string): void {
    this.mutate((b) => (b.swaps.areaShape = v || null));
  }

  swapTarget(on: boolean): void {
    this.mutate((b) => (b.swaps.defaultTarget = on));
  }

  swapStatus(v: string): void {
    const [i, to] = v.split(':');
    this.mutate((b) => (b.swaps.statusType = v ? { index: Number(i), to } : null));
  }

  setCrossDomain(v: string): void {
    this.mutate((b) => {
      b.crossDomain = v || null;
      // Le type ouvert par l'ancien déblocage n'est plus permis : le curseur retombe.
      if (b.mix && !E.mixTargets(this.spell(), b).includes(b.mix.type)) b.mix = null;
    });
  }

  setMixType(v: string): void {
    this.mutate((b) => (b.mix = { type: v, tenths: this.mix().tenths }));
  }

  mixStep(d: number): void {
    const { type, tenths: current } = this.mix();
    if (!type) return;
    const start = E.defaultMix(this.spell());
    this.mutate((b) => {
      const tenths = Math.max(0, Math.min(10, current + d));
      // Revenir pile à la répartition de départ, c'est ne rien avoir changé.
      const atStart = start ? start.type === type && start.tenths === tenths : tenths === 0;
      b.mix = atStart ? null : { type, tenths };
    });
  }

  // ── Règles et export ──

  setRule(path: string, raw: string, numeric: boolean): void {
    this.rules.update((r) => {
      const next = E.clone(r);
      E.setAt(next, path, numeric ? Number(raw) : raw);
      return next;
    });
  }

  resetRules(): void {
    this.rules.set(E.clone(E.DEFAULT_RULES));
    this.say('Règles du document rétablies.');
  }

  copyExport(): void {
    void this.copy(this.exportJson());
  }

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.say('JSON copié dans le presse-papiers.');
    } catch {
      this.say('Copie refusée par le navigateur — sélectionnez le texte à la main.', 'warn');
    }
  }
}
