import { Component } from '@angular/core';
import { EntityCard, EntityCardData } from '../../components/entity-card/entity-card';
import { Navbar } from '../../components/navbar/navbar';

@Component({
  selector: 'app-tests',
  imports: [EntityCard,Navbar],
  templateUrl: './tests.html',
  styleUrl: './tests.css',
})
export class Tests {
  readonly sampleEntity: EntityCardData = {
    name: 'Loup Gris',
    entityTypeId: 1,
    behaviour: 'Carnivore, meute',
    imageUrl:
      './resources/media/pictures/Loups.jpg',
    description:
      'Prédateur courant des terres sauvages, le loup gris est rapide et coordonné. Il chasse en meute avec une intelligence redoutable, capable de surprendre des proies plus grandes.',
    traitIds: [2, 5],
    stats: [
      { key: 'hp', label: 'PV', value: 20 },
      { key: 'physicalAttack', label: 'Atk phy.', value: 5 },
      { key: 'magicalAttack', label: 'Atk mag.', value: 2 },
      { key: 'mana', label: 'Mana', value: 3 },
      { key: 'speed', label: 'Vitesse', value: 10 },
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
}
