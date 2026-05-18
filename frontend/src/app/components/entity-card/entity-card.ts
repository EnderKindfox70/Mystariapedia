import { Component, Input } from '@angular/core';
import damageTypeCatalog from '../../../../public/resources/json/damage_type.json';
import entityTypeCatalog from '../../../../public/resources/json/entity_type.json';
import traitCatalog from '../../../../public/resources/json/trait.json';

export type EntityAffinityKind =
  | 'immunities'
  | 'resistances'
  | 'weaknesses'
  | 'absorptions';

export interface EntityStat {
  key: string;
  label: string;
  value: number | string;
}

export interface EntityTypeStats {
  hp: number;
  physical_atk: number;
  magical_atk: number;
  mana: number;
  speed: number;
}

export interface EntityType {
  id: number;
  name: string;
  description: string;
  link: string;
  stats: EntityTypeStats;
}

export interface EntityTrait {
  id: number;
  name: string;
  description: string;
}

export interface EntityAttribute {
  key: string;
  label: string;
  shortLabel: string;
  value: number;
  modifier?: string;
}

export interface EntityAffinityGroup {
  kind: EntityAffinityKind;
  label: string;
  damageTypeIds: number[];
}

export interface DamageType {
  id: number;
  name: string;
  general_damage_type_id: number;
  icon: string;
}

export interface ResolvedEntityAffinityGroup {
  kind: EntityAffinityKind;
  label: string;
  damageTypes: DamageType[];
}

export interface EntityHabitat {
  region?: string;
  frequency?: string;
}

export interface EntityLore {
  origin?: string;
  mortalRelations?: string;
  beliefs?: string;
  narrativeNotes?: string;
}

export interface EntityCardData {
  name: string;
  type?: string;
  entityTypeId?: number;
  behaviour?: string;
  imageUrl?: string;
  description: string;
  habitat?: EntityHabitat;
  lore?: EntityLore;
  usage?: string;
  openQuestions?: string;
  traits?: string[];
  traitIds?: number[];
  stats: EntityStat[];
  baseStats?: EntityStat[];
  attributes: EntityAttribute[];
  affinities: EntityAffinityGroup[];
}

const DEFAULT_ENTITY_CARD: EntityCardData = {
  name: 'Loup Gris',
  entityTypeId: 1,
  behaviour: 'Carnivore, meute',
  description:
    'Prédateur courant des terres sauvages, le loup gris est rapide et coordonné. Il chasse en meute avec une intelligence redoutable, capable de coordonner des attaques précises contre ses proies.',
  traitIds: [1, 2],
  baseStats: [
    { key: 'hp', label: 'PV', value: 20 },
    { key: 'physicalAttack', label: 'Atk phy.', value: 5 },
    { key: 'magicalAttack', label: 'Atk mag.', value: 2 },
    { key: 'mana', label: 'Mana', value: 3 },
    { key: 'speed', label: 'Vitesse', value: 8 },
  ],
  stats: [
    { key: 'hp', label: 'PV', value: 30 },
    { key: 'physicalAttack', label: 'Atk phy.', value: 5 },
    { key: 'magicalAttack', label: 'Atk mag.', value: 2 },
    { key: 'mana', label: 'Mana', value: 10 },
    { key: 'speed', label: 'Vitesse', value: 8 },
  ],
  attributes: [
    { key: 'strength', label: 'Force', shortLabel: 'FOR', value: 14, modifier: '+2' },
    { key: 'constitution', label: 'Constitution', shortLabel: 'CON', value: 13, modifier: '+1' },
    { key: 'dexterity', label: 'Dexterite', shortLabel: 'DEX', value: 16, modifier: '+3' },
    { key: 'intelligence', label: 'Intelligence', shortLabel: 'INT', value: 8, modifier: '-1' },
    { key: 'wisdom', label: 'Sagesse', shortLabel: 'SAG', value: 12, modifier: '+1' },
    { key: 'charisma', label: 'Charisme', shortLabel: 'CHA', value: 10, modifier: '+0' },
  ],
  affinities: [
    { kind: 'immunities', label: 'Immunities', damageTypeIds: [] },
    { kind: 'resistances', label: 'Resistances', damageTypeIds: [1] },
    { kind: 'weaknesses', label: 'Weaknesses', damageTypeIds: [2] },
    { kind: 'absorptions', label: 'Absorptions', damageTypeIds: [] },
  ],
};

@Component({
  selector: 'entity-card',
  imports: [],
  templateUrl: './entity-card.html',
  styleUrl: './entity-card.css',
})
export class EntityCard {
  @Input() entity: EntityCardData = DEFAULT_ENTITY_CARD;

  level: number = 1;

  readonly affinityStyles: Record<EntityAffinityKind, string> = {
    immunities: 'affinity-immunity',
    resistances: 'affinity-resistance',
    weaknesses: 'affinity-weakness',
    absorptions: 'affinity-absorption',
  };

  private readonly damageTypes = damageTypeCatalog.specific_damage_types;
  private readonly entityTypes = entityTypeCatalog.entity_types;
  private readonly traits = traitCatalog.traits;

  increaseLevel(): void {
    this.level = Math.min(this.level + 1, 10);
  }

  decreaseLevel(): void {
    this.level = Math.max(this.level - 1, 1);
  }

  getCalculatedStat(stat: EntityStat): number {
    const baseStat = typeof stat.value === 'number' ? stat.value : Number.parseFloat(stat.value);
    if (!Number.isFinite(baseStat)) {
      return 0;
    }
    
    const typeBonus = this.getTypeStatBonus(stat.key);
    const calculated = baseStat * this.level + typeBonus;
    
    return Math.round(calculated);
  }

  get resolvedEntityType(): EntityType | undefined {
    return this.entity.entityTypeId
      ? this.entityTypes.find((entityType) => entityType.id === this.entity.entityTypeId)
      : undefined;
  }

  get entityTypeName(): string {
    return this.resolvedEntityType?.name ?? this.entity.type ?? 'unknown';
  }

  get threatLevel(): string {
    const statTotal = this.entity.stats.reduce((total, stat) => {
      const value = typeof stat.value === 'number' ? stat.value : Number.parseFloat(stat.value);
      return Number.isFinite(value) ? total + value : total;
    }, 0);

    if (statTotal >= 320) {
      return 'Oméga';
    }

    if (statTotal >= 220) {
      return 'Élevé';
    }

    if (statTotal >= 140) {
      return 'Modéré';
    }

    return 'Faible';
  }

  getStatPercent(stat: EntityStat): number {
    const value = this.getCalculatedStat(stat);

    if (!Number.isFinite(value)) {
      return 8;
    }

    const maxByKey: Record<string, number> = {
      hp: 400,
      physicalAttack: 100,
      magicalAttack: 100,
      mana: 100,
      speed: 100,
    };

    const max = maxByKey[stat.key] ?? 50;

    return Math.max(6, Math.min(100, Math.round((value / max) * 100)));
  }

  get resolvedTraits(): EntityTrait[] {
    const catalogTraits = this.entity.traitIds
      ? this.entity.traitIds
          .map((id) => this.traits.find((trait) => trait.id === id))
          .filter((trait): trait is EntityTrait => trait !== undefined)
      : [];

    const inlineTraits = this.entity.traits?.map((trait, index) => ({
      id: -index - 1,
      name: trait,
      description: '',
    })) ?? [];

    return [...catalogTraits, ...inlineTraits];
  }

  getTypeStatBonus(statKey: string): number {
    const typeStats = this.resolvedEntityType?.stats;

    if (!typeStats) {
      return 0;
    }

    const typeStatKeys: Record<string, keyof EntityTypeStats> = {
      hp: 'hp',
      physicalAttack: 'physical_atk',
      magicalAttack: 'magical_atk',
      mana: 'mana',
      speed: 'speed',
    };

    const typeStatKey = typeStatKeys[statKey];

    return typeStatKey ? typeStats[typeStatKey] : 0;
  }

  get resolvedAffinities(): ResolvedEntityAffinityGroup[] {
    return this.entity.affinities.map((affinity) => ({
      ...affinity,
      damageTypes: affinity.damageTypeIds
        .map((id) => this.damageTypes.find((damageType) => damageType.id === id))
        .filter((damageType): damageType is DamageType => damageType !== undefined),
    }));
  }
}
