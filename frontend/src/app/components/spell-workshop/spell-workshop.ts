import { Component, computed, inject, input, model } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BuilderContextService } from '../../services/builder-context.service';
import { StatusEffectsService } from '../../services/status-effects.service';
import { SpellScalingSource, SpellTarget } from '../../wiki.types';
import * as C from '../../combat/spell-customization';

/* ──────────────────────────────────────────────────────────────────────────
   ATELIER DE PERSONNALISATION — la fiche d'un sort au nouveau format.

   Là où l'ancien arbre montrait des paliers figés, l'atelier montre ce que le
   budget peut changer : chaque paramètre ajustable, son plafond, le prix du
   cran suivant. Le lecteur choisit un niveau de sort (donc un budget) et
   essaie ; la fiche parente affiche le sort ainsi construit dans son panneau
   de détail habituel (`build` et `level` sont liés dans les deux sens).

   Tout le calcul vient de `combat/spell-customization.ts`.
─────────────────────────────────────────────────────────────────────────── */

type StepAction = { type: 'param'; id: string } | { type: 'status' } | { type: 'knockback' } | { type: 'scaling'; src: string } | { type: 'upkeep' };

/** Un bouton − ou + : il déplace la VALEUR affichée, quel que soit le sens d'amélioration. */
interface NudgeView {
  disabled: boolean;
  /** Crans ajoutés au build (+1 améliore, −1 mord). */
  delta: 1 | -1;
  /** Prix du cran vu du budget (« −2 » dépensés, « +2 » rendus) ou raison du blocage. */
  caption: string;
  title: string;
}

interface ParamRow extends C.ParamView {
  key: string;
  action: StepAction;
  lower: NudgeView;
  raise: NudgeView;
}

/** « coût 2 » → « −2 », « rend 2 » → « +2 » : la notation du budget. */
function caption(hint: string): string {
  if (hint.startsWith('coût ')) return `−${hint.slice(5)}`;
  if (hint.startsWith('rend ')) return `+${hint.slice(5)}`;
  return hint === 'plafond dur' ? 'plafond' : hint === 'gratuit' ? '0' : hint.slice(0, 3);
}

function nudge(step: C.StepView, delta: 1 | -1): NudgeView {
  return { disabled: step.disabled, delta, caption: caption(step.hint), title: `${step.title}${step.value ? ` → ${step.value}` : ''} (${step.hint})` };
}

@Component({
  selector: 'spell-workshop',
  imports: [NgTemplateOutlet],
  templateUrl: './spell-workshop.html',
  styleUrl: './spell-workshop.css',
})
export class SpellWorkshop {
  private readonly statuses = inject(StatusEffectsService);
  private readonly builder = inject(BuilderContextService);

  readonly spell = input.required<C.CustomizableSpell>();
  /** Le build essayé, gardé en mémoire même quand on redescend au niveau 0. */
  readonly build = model<C.Build>(C.emptyBuild());
  /** Niveau de sort supposé : il fixe le budget. 0 = le socle, tel qu'on apprend le sort. */
  readonly level = model<number>(0);
  /**
   * Le niveau se choisit-il ?
   *
   * Sur une fiche du wiki, oui : on essaie le sort à différents niveaux pour
   * voir ce qu'il devient. Sur une fiche de PERSONNAGE, non — le niveau est
   * celui que l'XP du sort a payé, et le lecteur n'a pas à s'en offrir d'autre.
   */
  readonly levelEditable = input(true);

  /** Niveau 0 : le socle de base, rien ne s'y modifie. */
  readonly locked = computed(() => this.level() === 0);
  /** Ce qui s'affiche : le socle au niveau 0, sinon le build essayé. */
  readonly shown = computed(() => (this.locked() ? C.emptyBuild() : this.build()));

  readonly rules = C.DEFAULT_RULES;
  private get ctx(): C.BuilderContext {
    return this.builder.context();
  }
  readonly levels = Array.from({ length: C.DEFAULT_RULES.maxSpellLevel + 1 }, (_, i) => i);

  readonly fmt = C.fmt;
  readonly signedPts = C.signedPts;
  readonly sourceLabel = C.sourceLabel;
  readonly domainLabel = C.domainLabel;
  readonly damageTypeLabel = C.damageTypeLabel;
  readonly targetLabel = (t: SpellTarget) => C.TARGET_LABELS[t];
  readonly statusName = (key: string) => this.statuses.byKey(key)?.name ?? key;

  readonly assessment = computed(() => C.assessAtLevel(this.spell(), this.shown(), this.level(), this.ctx));
  readonly opts = computed(() => C.spellOptions(this.spell()));
  readonly base = computed(() => C.baseStatsOf(this.spell()));
  readonly touched = computed(() => this.assessment().ledger.length > 0);
  /** Famille 5 : seulement ce qui concerne ce sort. */
  readonly locks = computed(() => C.relevantLocks(this.spell()));
  readonly governed = computed(() => this.spell().domainGoverned ?? []);

  /** Le socle après le swap de scaling : un ratio échangé se règle dans l'unité de sa nouvelle source. */
  readonly swapped = computed(() => C.scalingSwapPreview(this.spell(), this.shown()));

  // ── Famille 1 ──
  readonly f1 = computed<ParamRow[]>(() => {
    const b = this.shown();
    const { stats, factors } = this.swapped();
    const refs = new Map(C.scalingEntries(stats).map((r) => [`${r.path}.ratio`, r]));
    return this.opts().params.map((p) => {
      const { kind, cap } = C.convertedParam(p, C.kindOf(p, this.rules), factors);
      // Un ratio échangé porte le nom de sa nouvelle source (« Ratio Force → Vitesse »).
      const ref = factors[p.path] ? refs.get(p.path) : undefined;
      const swappedLabel = ref && `Ratio ${C.sourceLabel(ref.source)}${ref.list === 'scaling' ? '' : ` → ${ref.scales}`}`;
      return this.row(p.id, { type: 'param', id: p.id }, {
        label: swappedLabel || p.label,
        kind,
        base: C.paramBase(stats, p),
        units: b.params[p.id] ?? 0,
        cap,
        limits: p,
        locked: b.continuous && p.kind === 'duration',
      });
    });
  });

  // ── Famille 2 ──
  readonly baseStatuses = computed(() => new Set((this.base().inflicts ?? []).map((i) => i.status)));
  readonly statusChanceRow = computed<ParamRow | null>(() => {
    const su = this.shown().statusUnlock;
    if (!su || !this.opts().statusUnlock) return null;
    const pdef = C.unlockParams.statusChance(this.opts());
    return this.row('status', { type: 'status' }, {
      label: `Chance de ${this.statusName(su.status)}`, kind: this.rules.paramKinds.chance,
      base: this.rules.unlockedStatusBaseChance, units: su.steps ?? 0, cap: pdef.cap, limits: pdef,
    });
  });
  readonly knockbackRow = computed<ParamRow | null>(() => {
    const kb = this.shown().knockback;
    if (!kb || !this.opts().knockbackUnlock) return null;
    const pdef = C.unlockParams.knockbackCells(this.opts());
    return this.row('knockback', { type: 'knockback' }, {
      label: 'Repoussement', kind: this.rules.paramKinds.knockback,
      base: this.rules.unlockedKnockbackCells, units: kb.steps, cap: pdef.cap, limits: pdef,
    });
  });
  readonly scalingField = computed(() => this.opts().scalingUnlock?.field ?? 'scaling');
  readonly scalingChoices = computed(() => {
    const present = new Set((this.base()[this.scalingField()] ?? []).map((s) => s.source));
    return (this.opts().scalingUnlock?.eligible ?? []).map((src) => ({ src, on: src in this.shown().scalingUnlocks, already: present.has(src) }));
  });
  readonly scalingRows = computed<ParamRow[]>(() => {
    const pdef = C.unlockParams.scalingRatio(this.opts());
    return Object.entries(this.shown().scalingUnlocks).map(([src, steps]) =>
      this.row(`scaling:${src}`, { type: 'scaling', src }, {
        label: `Ratio ${C.sourceLabel(src)}`, kind: this.rules.paramKinds.ratio,
        base: this.rules.unlockedScalingRatio, units: steps, cap: pdef.cap, limits: pdef,
      }),
    );
  });
  readonly upkeepRow = computed<ParamRow | null>(() => {
    if (!this.shown().continuous || !this.opts().continuousMode) return null;
    const pdef = C.unlockParams.upkeep(this.opts());
    return this.row('upkeep', { type: 'upkeep' }, {
      label: 'Mana (entretien/tour)', kind: this.rules.paramKinds.upkeep,
      base: this.spell().baseStats.mana, units: this.shown().upkeepSteps, cap: pdef.cap, limits: pdef,
    });
  });
  readonly hasF2 = computed(() => {
    const o = this.opts();
    return !!(o.statusUnlock || o.knockbackUnlock || o.targetUnlock || o.scalingUnlock || o.continuousMode);
  });

  // ── Famille 3 ──
  /** Plafond de cibles simultanées de CE sort (propre au sort, sous le plafond absolu). */
  readonly targetsCeiling = computed(() => C.extraTargetsCeiling(this.opts().extraTargets ?? {}, this.rules));
  readonly extraTargetsTotal = computed(() => (this.opts().extraTargets?.base ?? 0) + this.shown().extraTargets);
  readonly effectsCount = computed(() => (this.base().effects ?? []).length + this.shown().extraEffects.length);
  readonly hasF3 = computed(() => !!(this.opts().extraTargets || this.opts().extraEffects || this.opts().ownEffects));

  // ── Famille 4 ──
  /** Chaque ratio du sort, sa source actuelle, et vers quoi il peut basculer (ratio converti). */
  readonly scalingSwapRows = computed(() => {
    const opt = this.opts().scalingSwap;
    if (!opt) return [];
    const entries = C.scalingEntries(this.base());
    const chosen = new Map(this.shown().swaps.scalings.map((s) => [s.path, s.to]));
    return entries
      .map((e) => {
        const siblings = entries.filter((x) => x.list === e.list).map((x) => x.source);
        return {
          path: e.path,
          label: e.scales.charAt(0).toUpperCase() + e.scales.slice(1),
          current: `${C.fmt(e.ratio)} × ${C.sourceLabel(e.source)}`,
          value: chosen.get(e.path) ?? '',
          // Chaque ratio n'ouvre que les sources qui ont du sens pour lui.
          choices: opt
            .eligibleFor(e.path)
            .filter((to) => !siblings.includes(to))
            .map((to) => ({ value: to, label: `${C.sourceLabel(to)} (${C.fmt(C.convertRatio(e.ratio, e.source, to))})` })),
        };
      })
      .filter((r) => r.choices.length);
  });
  readonly currentShape = computed(() => C.AREA_SHAPES.find((s) => (this.base().area ?? '').startsWith(s)) ?? '');
  readonly shapeChoices = computed(() => (this.opts().areaShapeSwap?.shapes ?? []).filter((s) => s !== this.currentShape()));
  readonly statusSwapChoices = computed(() =>
    (this.base().inflicts ?? []).flatMap((inf, i) =>
      (this.opts().statusTypeSwap?.eligible ?? [])
        .filter((to) => to !== inf.status)
        .map((to) => ({ value: `${i}:${to}`, label: `${this.statusName(inf.status)} → ${this.statusName(to)}` })),
    ),
  );
  readonly statusSwapValue = computed(() => {
    const s = this.shown().swaps.statusType;
    return s ? `${s.index}:${s.to}` : '';
  });
  readonly mixTargets = computed(() => C.mixTargets(this.spell(), this.shown()));
  readonly mix = computed(() => {
    const targets = this.mixTargets();
    // La fiche peut partir d'une répartition déjà acquise (lave : moitié roche).
    const m = C.effectiveMix(this.spell(), this.shown());
    const type = m && targets.includes(m.type) ? m.type : targets[0] ?? null;
    const start = C.defaultMix(this.spell());
    return {
      type,
      tenths: type && m?.type === type ? m.tenths : 0,
      start: start && start.type === type ? start.tenths : 0,
      steps: C.mixSteps(this.spell(), this.shown().mix),
      baseType: C.baseDamageType(this.spell()),
    };
  });
  /** Ce qu'un cran de plus (d = +1) ou de moins (d = −1) change au prix, en texte signé. */
  mixHint(d: number): string {
    const { type, tenths, steps } = this.mix();
    if (!type) return '';
    const next = C.mixSteps(this.spell(), { type, tenths: tenths + d });
    return C.signedPts((next - steps) * this.rules.costs.mixPerTenth);
  }
  readonly hasDamage = computed(() => this.base().damageMin != null);
  /** Un sort ne se substitue pas son propre type : la liste l'écarte. */
  readonly baseDamageType = computed(() => C.baseDamageType(this.spell()));
  readonly damageTypeSwapChoices = computed(() =>
    (this.opts().damageTypeSwap?.eligible ?? []).filter((t) => t !== this.baseDamageType()),
  );
  readonly hasF4 = computed(() => {
    const o = this.opts();
    return !!(o.scalingSwap || o.areaShapeSwap || o.defaultTargetSwap || o.statusTypeSwap || o.damageTypeSwap || o.crossDomain || o.mix);
  });

  private row(key: string, action: StepAction, view: Parameters<typeof C.paramView>[0]): ParamRow {
    const v = C.paramView({ ...view, locked: view.locked || this.locked() });
    // La mana s'améliore en baissant : son « − » est le cran qui coûte.
    const [lower, raise] = v.better === 'down'
      ? [nudge(v.up, 1), nudge(v.down, -1)]
      : [nudge(v.down, -1), nudge(v.up, 1)];
    return { ...v, key, action, lower, raise };
  }

  private mutate(fn: (b: C.Build) => void): void {
    if (this.locked()) return;
    const next = C.clone(this.build());
    fn(next);
    this.build.set(next);
  }

  valueOf(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  checkedOf(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  setLevel(n: number): void {
    if (this.levelEditable()) this.level.set(n);
  }

  reset(): void {
    this.build.set(C.emptyBuild());
  }

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
      if (!on) {
        b.upkeepSteps = 0;
        return;
      }
      // Plus de durée à allonger : ce qui avait été acheté pour elle est rendu.
      for (const p of this.opts().params) if (p.kind === 'duration') delete b.params[p.id];
      if (this.scalingField() === 'durationScaling') b.scalingUnlocks = {};
    });
  }

  /** En mode continu, un scaling de durée n'a plus d'objet. */
  readonly durationMoot = computed(() => this.shown().continuous && this.scalingField() === 'durationScaling');

  toggleOwnEffect(id: string, on: boolean): void {
    this.mutate((b) => (b.ownEffects = on ? [...new Set([...b.ownEffects, id])] : b.ownEffects.filter((x) => x !== id)));
  }

  extraTargets(d: number): void {
    this.mutate((b) => (b.extraTargets = Math.max(0, b.extraTargets + d)));
  }

  toggleEffect(stat: string, on: boolean): void {
    this.mutate((b) => (b.extraEffects = on ? [...new Set([...b.extraEffects, stat])] : b.extraEffects.filter((x) => x !== stat)));
  }

  swapScaling(path: string, to: string): void {
    this.mutate((b) => {
      b.swaps.scalings = b.swaps.scalings.filter((s) => s.path !== path);
      if (to) b.swaps.scalings.push({ path, to: to as SpellScalingSource });
    });
  }

  swapArea(v: string): void {
    this.mutate((b) => (b.swaps.areaShape = v || null));
  }

  swapTarget(on: boolean): void {
    this.mutate((b) => (b.swaps.defaultTarget = on));
  }

  swapDamageType(v: string): void {
    this.mutate((b) => (b.swaps.damageType = v || null));
  }

  swapStatus(v: string): void {
    const [i, to] = v.split(':');
    this.mutate((b) => (b.swaps.statusType = v ? { index: Number(i), to } : null));
  }

  setCrossDomain(v: string): void {
    this.mutate((b) => {
      b.crossDomain = v || null;
      if (b.mix && !C.mixTargets(this.spell(), b).includes(b.mix.type)) b.mix = null;
    });
  }

  setMixType(v: string): void {
    this.mutate((b) => (b.mix = { type: v, tenths: this.mix().tenths }));
  }

  mixStep(d: number): void {
    const { type, tenths: current } = this.mix();
    if (!type) return;
    const start = C.defaultMix(this.spell());
    this.mutate((b) => {
      const tenths = Math.max(0, Math.min(10, current + d));
      // Revenir pile à la répartition de départ, c'est ne rien avoir changé.
      const atStart = start ? start.type === type && start.tenths === tenths : tenths === 0;
      b.mix = atStart ? null : { type, tenths };
    });
  }
}
