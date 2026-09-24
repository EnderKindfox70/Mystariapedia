import { describe, expect, it } from 'vitest';
import { CharacterSheet, TraitDef } from './character.types';
import {
  MAGIC_DOMAINS,
  NONPOLAR_MAGICS,
  availableSpellsFor,
  chosenTraits,
  domainIcon,
  domainName,
  domainSigil,
  domainSpells,
  emptySheet,
  featDomainsFor,
  findDomainSpell,
  grantedTraits,
  MANUAL_NONPOLAR_VIA,
  nonPolarAccess,
  nonPolarOpenedByHand,
  openNonPolarBranches,
  originByKey,
} from './universe-data';

const SOLDAT: TraitDef[] = [{ key: 'entrainement-martial', name: 'Entraînement martial' }];
const SAGE: TraitDef[] = [{ key: 'etudes-magiques', name: 'Études magiques' }];

/** Une fiche avec, au choix, une origine. */
function sheet(origin = ''): CharacterSheet {
  const s = emptySheet();
  s.identity.origin = origin;
  return s;
}

describe('magie non polarisée', () => {
  it('reste hors des douze affinités, tout en se lisant comme un domaine', () => {
    expect(NONPOLAR_MAGICS.map((m) => m.key)).toEqual(['renforcement', 'emission']);
    const affinities = MAGIC_DOMAINS.map((d) => d.key);
    expect(affinities).toHaveLength(12);
    for (const branch of NONPOLAR_MAGICS) expect(affinities).not.toContain(branch.key);

    // …mais nom, sigil, icône et sorts se résolvent comme pour un domaine.
    expect(domainName('renforcement')).toBe('Renforcement');
    expect(domainName('emission')).toBe('Émission');
    expect(domainSigil('emission')).toBe('✵');
    expect(domainIcon('renforcement')).toBeTruthy();
    expect(domainSpells('renforcement').map((s) => s.key)).toContain('renforcement-corps');
    expect(findDomainSpell('emission-voile')?.name).toBe('Voile');
  });

  it("s'ouvre par le trait d'un background", () => {
    expect(nonPolarAccess(sheet(), SOLDAT)).toEqual([
      { key: 'renforcement', via: 'Entraînement martial' },
    ]);
    expect(openNonPolarBranches(sheet(), SAGE)).toEqual(['emission']);
    expect(openNonPolarBranches(sheet(), [])).toEqual([]);
  });

  it("s'ouvre par le trait pris à la création ou sur un slot de feat", () => {
    // Section 21 : le feat Entraînement martial vaut le trait du Soldat.
    const parSlot = sheet();
    parSlot.level = 5;
    parSlot.feats = [{ level: 5, pick: 'trait', trait: 'entrainement-martial' }];
    expect(openNonPolarBranches(parSlot, chosenTraits(parSlot))).toEqual(['renforcement']);

    const aLaCreation = sheet();
    aLaCreation.creationTraits = ['etudes-magiques'];
    expect(openNonPolarBranches(aLaCreation, chosenTraits(aLaCreation))).toEqual(['emission']);
  });

  it("s'ouvre à la main quand la table en décide, sans vécu pour la justifier", () => {
    // Le cas qui manquait : une branche ouverte en partie, hors de tout
    // background — la fiche l'enregistre telle quelle.
    const ouverte = sheet();
    ouverte.nonPolarUnlocks = ['emission'];
    expect(openNonPolarBranches(ouverte, [])).toEqual(['emission']);
    expect(nonPolarAccess(ouverte, [])[0].via).toBe(MANUAL_NONPOLAR_VIA);
    expect(nonPolarOpenedByHand(ouverte, [], 'emission')).toBe(true);
    // Et ses sorts rejoignent le pool, exactement comme par un vécu.
    expect(availableSpellsFor(openNonPolarBranches(ouverte, [])).map((s) => s.key)).toContain('emission-voile');
  });

  it("n'efface pas ce qu'un vécu ouvre déjà, et ne se referme pas à sa place", () => {
    const soldat = sheet();
    // Ouverte par le trait ET cochée à la main : c'est le vécu qu'on lit.
    soldat.nonPolarUnlocks = ['renforcement'];
    expect(nonPolarAccess(soldat, SOLDAT)).toEqual([
      { key: 'renforcement', via: 'Entraînement martial' },
    ]);
    expect(nonPolarOpenedByHand(soldat, SOLDAT, 'renforcement')).toBe(false);
    // Décocher ne referme donc rien : le trait tient toujours la branche.
    soldat.nonPolarUnlocks = [];
    expect(openNonPolarBranches(soldat, SOLDAT)).toEqual(['renforcement']);
  });

  it("s'ouvre aussi par une enfance dans l'Archipel, sans feat ni background", () => {
    const access = nonPolarAccess(sheet('archipel'), []);
    expect(access.map((b) => b.key)).toEqual(['renforcement', 'emission']);
    expect(access[0].via).toBe('Origine Archipel de la Nuit');
    expect(openNonPolarBranches(sheet('luxarion'), [])).toEqual([]);
  });

  it('verse ses sorts dans le pool dès que la branche est ouverte', () => {
    const closed = availableSpellsFor(['fire']).map((s) => s.key);
    expect(closed).not.toContain('renforcement-corps');

    const open = availableSpellsFor(['fire', ...openNonPolarBranches(sheet(), SOLDAT)]);
    expect(open.map((s) => s.key)).toContain('renforcement-corps');
  });

  it('ne consomme aucun des trois emplacements de domaine', () => {
    const s = sheet('archipel');
    s.domains = ['fire', 'water', 'earth'];
    expect(s.domains).toHaveLength(3);
    // Les branches s'ajoutent par-dessus, sans rien prendre à personne.
    expect(featDomainsFor(s, [])).toEqual([
      'fire',
      'water',
      'earth',
      'renforcement',
      'emission',
    ]);
  });

  it('suit le background réellement choisi, via les traits accordés', () => {
    const soldat = { key: 'soldat', name: 'Soldat', subbackgrounds: [] };
    const traits = grantedTraits(undefined, '', soldat, originByKey(''));
    expect(openNonPolarBranches(sheet(), traits)).toEqual(['renforcement']);
  });
});
