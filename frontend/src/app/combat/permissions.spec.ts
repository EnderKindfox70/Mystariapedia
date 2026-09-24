import { describe, expect, it } from 'vitest';
import { Combatant, Encounter } from './combat.types';
import { emptyEncounter } from './encounter';
import { playerRefusal } from './permissions';

/* Les actions qu'un MJ accepte d'un joueur : son pion, et rien d'autre. */

const pion = (id: string, owner?: string): Combatant =>
  ({
    id,
    name: id,
    team: 'allies',
    owner: owner ? { userId: owner, username: owner } : undefined,
  }) as Combatant;

function table(): Encounter {
  const enc = emptyEncounter('Table');
  enc.combatants = [pion('kael', 'alice'), pion('mira', 'bob'), pion('loup')];
  return enc;
}

describe('Ce qu’un joueur peut jouer', () => {
  it('laisse un joueur jouer son pion', () => {
    expect(playerRefusal(table(), { type: 'move', actorId: 'kael', to: { x: 1, y: 1 } }, 'alice')).toBeNull();
    expect(playerRefusal(table(), { type: 'hunt', actorId: 'kael' }, 'alice')).toBeNull();
  });

  it('refuse le pion d’un autre joueur, et celui du MJ', () => {
    expect(playerRefusal(table(), { type: 'move', actorId: 'mira', to: { x: 1, y: 1 } }, 'alice')).not.toBeNull();
    expect(playerRefusal(table(), { type: 'move', actorId: 'loup', to: { x: 1, y: 1 } }, 'alice')).not.toBeNull();
  });

  it('ne laisse finir que son propre tour', () => {
    const enc = table();
    enc.started = true;
    enc.order = ['mira', 'kael'];
    enc.turnIndex = 0;
    expect(playerRefusal(enc, { type: 'endTurn' }, 'alice')).not.toBeNull();
    expect(playerRefusal(enc, { type: 'endTurn' }, 'bob')).toBeNull();
  });

  it('garde au MJ ce qui touche au monde', () => {
    const enc = table();
    expect(playerRefusal(enc, { type: 'passTime', seconds: 60, activity: 'repos' }, 'alice')).not.toBeNull();
    expect(playerRefusal(enc, { type: 'damage', targetId: 'kael', amount: 5 }, 'alice')).not.toBeNull();
    expect(playerRefusal(enc, { type: 'meal', gauge: 'hunger', team: 'allies' }, 'alice')).not.toBeNull();
    expect(playerRefusal(enc, { type: 'door', cell: '1,1', act: 'unlock', actorId: 'kael' }, 'alice')).not.toBeNull();
  });

  it('laisse manger pour soi, pas pour le groupe', () => {
    expect(playerRefusal(table(), { type: 'meal', gauge: 'hunger', actorId: 'kael' }, 'alice')).toBeNull();
  });

  it('ne laisse relever que ses propres pièges', () => {
    const enc = table();
    enc.campTraps = [
      { id: 't1', item: 'Chausse-trappes', ownerId: 'kael' },
      { id: 't2', item: 'Chausse-trappes', ownerId: 'mira' },
    ];
    expect(playerRefusal(enc, { type: 'campTrap', act: 'lift', trapId: 't1' }, 'alice')).toBeNull();
    expect(playerRefusal(enc, { type: 'campTrap', act: 'lift', trapId: 't2' }, 'alice')).not.toBeNull();
    expect(playerRefusal(enc, { type: 'campTrap', act: 'spring', trapId: 't1' }, 'alice')).not.toBeNull();
  });
});
