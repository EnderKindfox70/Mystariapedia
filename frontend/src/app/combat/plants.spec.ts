import { describe, expect, it } from 'vitest';
import plantDomain from '../../../public/resources/json/domains/plant.json';
import statusCatalog from '../../../public/resources/json/status_effects.json';
import materialCatalog from '../../../public/resources/json/materials.json';
import { DomainSpellEntry } from '../wiki.types';
import {
  applyPlantToStats,
  availableVariants,
  bindPlant,
  genericPlant,
  cannotStudyPlant,
  normalizePlantTraining,
  PLANTS,
  PLANT_BY_KEY,
  PLANT_FAMILIES,
  PLANT_TIERS,
  plantImpact,
  plantLabel,
  plantTier,
  plantsOfFamily,
  plantsOfRegion,
  studySlots,
  usesPlants,
  variantFor,
  variantsForSlot,
  variantsOf,
} from './plants';
import { BuilderStats } from './spell-customization';

const SPELLS = plantDomain.spells as unknown as DomainSpellEntry[];
const byKey = (key: string): DomainSpellEntry => {
  const sort = SPELLS.find((s) => s.key === key);
  if (!sort) throw new Error(`Sort introuvable : ${key}`);
  return sort;
};

const STATUS_KEYS = new Set(statusCatalog.status_effects.map((s) => s.key));
const REGION_KEYS = new Set(materialCatalog.regions.map((r) => r.key));

describe('catalogue des espèces', () => {
  it('n’a ni doublon de clé ni famille inventée', () => {
    const familles = new Set(PLANT_FAMILIES.map((f) => f.key));
    const vues = new Set<string>();
    for (const p of PLANTS) {
      expect(vues.has(p.key), `doublon : ${p.key}`).toBe(false);
      vues.add(p.key);
      expect(familles.has(p.family), `${p.key} : famille ${p.family}`).toBe(true);
    }
    expect(PLANTS.length).toBe(vues.size);
  });

  it('range chaque espèce dans une région qui existe vraiment', () => {
    for (const p of PLANTS) {
      expect(p.native.length, `${p.key} ne pousse nulle part`).toBeGreaterThan(0);
      for (const region of p.native) {
        expect(REGION_KEYS.has(region), `${p.key} → ${region}`).toBe(true);
      }
    }
  });

  it('donne à chaque espèce un nom binominal — c’est lui qui évite la méprise', () => {
    for (const p of PLANTS) {
      expect(p.latin.length, `${p.key} sans nom latin`).toBeGreaterThan(0);
      expect(plantLabel(p.key)).toBe(`${p.name} (${p.latin})`);
    }
    expect(plantLabel('chou-magique')).toBe('');
  });

  it('remplit toutes ses familles, et n’en garde aucune vide', () => {
    for (const f of PLANT_FAMILIES) {
      expect(plantsOfFamily(f.key).length, `famille vide : ${f.key}`).toBeGreaterThan(0);
    }
  });

  it('peuple chaque région d’au moins une espèce', () => {
    const peuplees = new Set(PLANTS.flatMap((p) => p.native));
    for (const region of peuplees) {
      expect(plantsOfRegion(region).length).toBeGreaterThan(0);
    }
  });
});

describe('espèces compatibles des sorts de Plantes', () => {
  it('donne à chaque sort du domaine au moins une espèce à employer', () => {
    for (const sort of SPELLS) {
      expect(usesPlants(sort), `${sort.key} n’emploie aucune plante`).toBe(true);
    }
  });

  it('ne cite que des espèces du catalogue, et chacune une seule fois par branche', () => {
    for (const sort of SPELLS) {
      const vues = new Set<string>();
      for (const variante of variantsOf(sort)) {
        expect(PLANT_BY_KEY.has(variante.plant), `${sort.key} → ${variante.plant}`).toBe(true);
        const id = `${variante.slot ?? ''}/${variante.plant}`;
        expect(vues.has(id), `${sort.key} : ${id} en double`).toBe(false);
        vues.add(id);
        expect(variante.effect.length, `${sort.key}/${variante.plant} sans effet`).toBeGreaterThan(0);
      }
    }
  });

  it('n’emploie chaque espèce du catalogue que si un sort sait en faire quelque chose', () => {
    const employees = new Set(SPELLS.flatMap((s) => variantsOf(s).map((v) => v.plant)));
    for (const p of PLANTS) {
      expect(employees.has(p.key), `${p.key} n’est employé par aucun sort`).toBe(true);
    }
  });

  it('ne nomme que des statuts du catalogue central', () => {
    for (const sort of SPELLS) {
      for (const variante of variantsOf(sort)) {
        if (variante.inflicts) {
          expect(STATUS_KEYS.has(variante.inflicts), `${sort.key} → ${variante.inflicts}`).toBe(true);
        }
        for (const ajout of variante.adds ?? []) {
          expect(STATUS_KEYS.has(ajout.status), `${sort.key} → ${ajout.status}`).toBe(true);
          expect(ajout.chance).toBeGreaterThan(0);
          expect(ajout.chance).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  /**
   * L'invariant qui tient tout le domaine : une espèce ne REMPLACE le statut
   * que là où le sort a déclaré son type de statut gouverné par le domaine.
   * Ailleurs, le statut est verrouillé — les ronces enserrent, point — et
   * l'espèce ne peut que le moduler ou en ajouter un.
   */
  it('n’impose un statut que là où le sort l’a délégué au domaine', () => {
    for (const sort of SPELLS) {
      const gouverne = (sort.domainGoverned ?? []).some((g) => g.field === 'statusType');
      for (const variante of variantsOf(sort)) {
        if (variante.inflicts && !gouverne) {
          throw new Error(`${sort.key} : ${variante.plant} impose un statut hors gouvernance`);
        }
      }
    }
  });

  it('garde ses facteurs dans des bornes jouables', () => {
    const facteurs = [
      'damageFactor', 'chanceFactor', 'durationFactor', 'manaFactor',
      'radiusFactor', 'effectFactor', 'healFactor', 'recoilFactor',
    ] as const;
    for (const sort of SPELLS) {
      for (const variante of variantsOf(sort)) {
        for (const nom of facteurs) {
          const valeur = variante[nom];
          if (valeur === undefined) continue;
          expect(valeur, `${sort.key}/${variante.plant}.${nom}`).toBeGreaterThanOrEqual(0.4);
          expect(valeur, `${sort.key}/${variante.plant}.${nom}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('vise des branches qui existent vraiment sur le sort', () => {
    const symbiose = byKey('plant-symbiose-vegetale');
    const branches = new Set((symbiose.baseStats?.choices ?? []).map((c) => c.name));
    for (const variante of variantsOf(symbiose)) {
      expect(branches.has(variante.slot ?? ''), `slot inconnu : ${variante.slot}`).toBe(true);
    }

    const armure = byKey('plant-revetement-armure');
    const propres = new Set((armure.customization?.ownEffects ?? []).map((e) => e.id));
    for (const variante of variantsOf(armure)) {
      if (variante.slot === undefined) continue;
      expect(propres.has(variante.slot), `slot inconnu : ${variante.slot}`).toBe(true);
    }
  });

  it('couvre chaque branche de Symbiose végétale d’au moins deux espèces', () => {
    const symbiose = byKey('plant-symbiose-vegetale');
    for (const choix of symbiose.baseStats?.choices ?? []) {
      expect(
        variantsForSlot(symbiose, choix.name).length,
        `branche sous-fournie : ${choix.name}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('laisse la ronce faire trois métiers différents selon le sort', () => {
    const enracine = variantFor(byKey('plant-ronces-etreignantes'), 'ronce-commune');
    const riposte = variantFor(byKey('plant-revetement-armure'), 'ronce-commune', 'epines-sanglantes');
    const lame = variantFor(byKey('plant-revetement-arme'), 'ronce-commune');
    expect(enracine?.effect).not.toBe(riposte?.effect);
    expect(riposte?.effect).not.toBe(lame?.effect);
  });
});

describe('les trois degrés de connaissance', () => {
  const toxine = byKey('plant-toxine-vegetale');

  it('lit une fiche sans personnage comme si tout était étudié', () => {
    // La fiche du wiki montre le sort en soi : on y choisit librement, au plein
    // effet, sinon on comparerait des espèces dégradées entre elles.
    expect(plantTier('belladone', null)).toBe('etudiee');
    expect(plantTier('belladone', { studied: ['belladone'] })).toBe('etudiee');
    expect(plantTier('belladone', { known: ['belladone'] })).toBe('connue');
    expect(plantTier('belladone', { studied: ['aconit'] })).toBe('inconnue');
  });

  it('applique la variante en plein pour une espèce étudiée', () => {
    const lien = bindPlant(toxine, 'narcisse', 'etudiee');
    expect(lien?.tier).toBe('etudiee');
    expect(lien?.inflicts).toBe('sommeil');
    expect(lien?.manaFactor).toBe(1);
    expect(lien?.note).toContain('s’endort');
  });

  it('garde toute la spécificité d’une espèce connue, et fait payer le mana', () => {
    const connue = bindPlant(toxine, 'narcisse', 'connue');
    const etudiee = bindPlant(toxine, 'narcisse', 'etudiee');
    expect(connue?.variant).not.toBeNull();
    expect(connue?.inflicts).toBe('sommeil');
    expect(connue?.damageFactor).toBe(etudiee?.damageFactor);
    expect(connue?.manaFactor).toBeGreaterThan(etudiee!.manaFactor);
    expect(connue?.note).toContain('approximation');
  });

  it('fait tourner le sort sur le concept quand rien n’est employable', () => {
    const lien = genericPlant();
    expect(lien.species).toBeNull();
    expect(lien.variant).toBeNull();
    // Aucune spécificité : le sort retombe sur son socle.
    expect(lien.inflicts).toBeUndefined();
    expect(lien.adds).toEqual([]);
    expect(lien.manaFactor).toBe(PLANT_TIERS.inconnue.manaFactor);
    expect(lien.damageFactor).toBe(PLANT_TIERS.inconnue.effectFactor);
    expect(PLANT_TIERS.inconnue.manaFactor).toBeGreaterThan(1);
    expect(PLANT_TIERS.inconnue.effectFactor).toBeLessThan(1);
    // Le contrecoup, lui, ne profite jamais du tâtonnement.
    expect(lien.recoilFactor).toBe(1);
  });

  it('ne laisse jamais DÉSIGNER une espèce qu’on ne sait pas reconnaître', () => {
    // On ne choisit pas ce qu'on ne sait pas nommer : le lancer retombe sur le
    // geste nu, sans rien devoir au narcisse.
    const lien = bindPlant(toxine, 'narcisse', 'inconnue');
    expect(lien?.species).toBeNull();
    expect(lien?.inflicts).toBeUndefined();
  });

  it('n’offre au choix que ce que le lanceur a réellement en main', () => {
    // Fiche du wiki : tout le compatible, puisqu'on y lit le sort en soi.
    expect(availableVariants(toxine, null)).toHaveLength(variantsOf(toxine).length);

    const offertes = availableVariants(toxine, { studied: ['narcisse'], known: ['datura'] });
    expect(offertes.map((v) => v.plant)).toEqual(['datura', 'narcisse']);

    // Rien en main : plus rien à choisir, et c'est le geste nu qui s'applique.
    expect(availableVariants(toxine, { studied: [], known: [] })).toEqual([]);
    // Une espèce sue mais inutile à CE geste ne s'y invite pas davantage.
    expect(availableVariants(toxine, { studied: ['cactus'] })).toEqual([]);
  });

  it('refuse franchement une espèce que le geste n’emploie pas', () => {
    // Le cactus nimbe les poings ; il n'y a rien à en distiller.
    expect(bindPlant(toxine, 'cactus', 'etudiee')).toBeNull();
    expect(bindPlant(toxine, 'plante-inventee', 'etudiee')).toBeNull();
  });

  it('lit la bonne branche quand le sort en a plusieurs', () => {
    const armure = byKey('plant-revetement-armure');
    const nue = bindPlant(armure, 'chene', 'etudiee');
    const sanglante = bindPlant(armure, 'ronce-commune', 'etudiee', 'epines-sanglantes');
    expect(nue?.effectFactor).toBe(1.25);
    expect(sanglante?.chanceFactor).toBe(1.3);
    expect(bindPlant(armure, 'chene', 'etudiee', 'epines-venimeuses')).toBeNull();
  });

  it('garde chaque canal distinct : soin, défense et dégâts ne se mélangent pas', () => {
    const symbiose = byKey('plant-symbiose-vegetale');
    const aloe = bindPlant(symbiose, 'aloe-vera', 'etudiee', 'Lierre régénérant');
    const sequoia = bindPlant(symbiose, 'sequoia', 'etudiee', 'Écorce protectrice');
    expect(aloe?.healFactor).toBe(1.6);
    expect(aloe?.effectFactor).toBe(1);
    expect(sequoia?.effectFactor).toBe(1.5);
    expect(sequoia?.manaFactor).toBe(1.4);
  });
});

describe('l’impact réel sur les stats construites', () => {
  const toxine = byKey('plant-toxine-vegetale');
  const socle = (): BuilderStats => JSON.parse(JSON.stringify(toxine.baseStats));

  it('ne touche à rien sans espèce choisie', () => {
    const stats = socle();
    expect(applyPlantToStats(stats, null)).toBe(stats);
  });

  it('remplace le statut du socle et bouge les chiffres de la variante', () => {
    // Narcisse : le poison cède au Sommeil, rien d'autre ne change.
    const dormeur = applyPlantToStats(socle(), bindPlant(toxine, 'narcisse', 'etudiee'));
    expect(dormeur.inflicts?.[0].status).toBe('sommeil');
    expect(dormeur.mana).toBe(socle().mana);

    // Belladone : chance en baisse, dégâts en hausse.
    const belle = applyPlantToStats(socle(), bindPlant(toxine, 'belladone', 'etudiee'));
    expect(belle.inflicts?.[0].chance).toBeLessThan(socle().inflicts![0].chance);
    expect(belle.inflicts?.[0].status).toBe('poison');
  });

  it('ajoute le statut secondaire sans effacer celui du sort', () => {
    const datura = applyPlantToStats(socle(), bindPlant(toxine, 'datura', 'etudiee'));
    expect(datura.inflicts?.map((i) => i.status)).toEqual(['poison', 'confusion']);
  });

  it('fait vraiment payer le mana, palier par palier', () => {
    const base = socle().mana;
    const etudiee = applyPlantToStats(socle(), bindPlant(toxine, 'narcisse', 'etudiee')).mana;
    const connue = applyPlantToStats(socle(), bindPlant(toxine, 'narcisse', 'connue')).mana;
    const nue = applyPlantToStats(socle(), genericPlant()).mana;
    expect(etudiee).toBe(base);
    expect(connue).toBeGreaterThan(etudiee);
    expect(nue).toBe(connue);
  });

  it('amoindrit le socle quand le geste se fait sans espèce', () => {
    const stats = socle();
    stats.damageMin = 10;
    stats.damageMax = 10;
    const nu = applyPlantToStats(stats, genericPlant());
    expect(nu.damageMax).toBeLessThan(10);
    // Le statut du socle reste celui du sort : rien ne l'a remplacé.
    expect(nu.inflicts?.[0].status).toBe('poison');
    expect(nu.inflicts).toHaveLength(1);
  });

  it('amoindrit ce que le sort donne sans espèce, jamais le contrecoup', () => {
    const stats = socle();
    stats.recoil = { damageMin: 4, damageMax: 6 };
    const avant = JSON.parse(JSON.stringify(stats.recoil));
    expect(applyPlantToStats(stats, genericPlant()).recoil).toEqual(avant);
  });

  it('ne touche qu’à la branche que l’espèce vise', () => {
    const symbiose = byKey('plant-symbiose-vegetale');
    const stats = JSON.parse(JSON.stringify(symbiose.baseStats)) as BuilderStats;
    const avant = JSON.parse(JSON.stringify(stats.choices));
    // Le séquoia protège mieux et coûte plus cher… mais seulement en Écorce.
    const apres = applyPlantToStats(stats, bindPlant(symbiose, 'sequoia', 'etudiee', 'Écorce protectrice'));
    expect(apres.choices![2].mana).toBeGreaterThan(avant[2].mana);
    expect(apres.choices![2].effects![0].value).toBeGreaterThan(avant[2].effects![0].value);
    // Les trois autres symbioses n'ont pas bougé d'un point.
    expect(apres.choices![0]).toEqual(avant[0]);
    expect(apres.choices![1]).toEqual(avant[1]);
    expect(apres.choices![3]).toEqual(avant[3]);
    // Et le socle du sort non plus : ce qu'on paie, c'est la branche.
    expect(apres.mana).toBe(stats.mana);
  });

  it('rapporte l’impact d’une branche sous son propre nom', () => {
    const symbiose = byKey('plant-symbiose-vegetale');
    const stats = JSON.parse(JSON.stringify(symbiose.baseStats)) as BuilderStats;
    const lignes = plantImpact(stats, bindPlant(symbiose, 'sequoia', 'etudiee', 'Écorce protectrice'));
    expect(lignes.length).toBeGreaterThan(0);
    for (const l of lignes) {
      expect(l.key.startsWith('choice:')).toBe(true);
      expect(l.label).toContain('Écorce protectrice');
    }
  });

  it('élargit la zone sans perdre le libellé', () => {
    const ronces = byKey('plant-ronces-etreignantes');
    const stats = JSON.parse(JSON.stringify(ronces.baseStats)) as BuilderStats;
    const large = applyPlantToStats(stats, bindPlant(ronces, 'salsepareille', 'etudiee'));
    expect(stats.area).toBe('Rayon 1,5 m');
    expect(large.area).toBe('Rayon 2,4 m');
  });

  it('applique la riposte de l’écorce au bon endroit', () => {
    const armure = byKey('plant-revetement-armure');
    const stats = JSON.parse(JSON.stringify(armure.baseStats)) as BuilderStats;
    // Ce que l'effet propre « Épines sanglantes » pose sur le build.
    stats.retaliate = {
      trigger: 'melee',
      damageMin: 2,
      damageMax: 4,
      inflicts: [{ status: 'saignement', chance: 40 }],
    };
    const sumac = applyPlantToStats(stats, bindPlant(armure, 'sumac', 'etudiee', 'epines-sanglantes'));
    const ronce = applyPlantToStats(stats, bindPlant(armure, 'ronce-commune', 'etudiee', 'epines-sanglantes'));
    // Le sumac aggrave la plaie, la ronce la rend plus probable.
    expect(sumac.retaliate!.damageMax).toBe(5);
    expect(sumac.retaliate!.inflicts![0].chance).toBe(40);
    expect(ronce.retaliate!.damageMax).toBe(4);
    expect(ronce.retaliate!.inflicts![0].chance).toBe(52);
  });

  it('ne laisse jamais une chance sortir de ses bornes', () => {
    const stats = socle();
    stats.inflicts![0].chance = 90;
    const curare = applyPlantToStats(stats, bindPlant(toxine, 'curare', 'etudiee'));
    expect(curare.inflicts![0].chance).toBe(100);
  });

  it('ne rapporte que les lignes qui bougent, dans les deux sens', () => {
    const lignes = plantImpact(socle(), bindPlant(toxine, 'narcisse', 'etudiee'), {
      poison: 'Poison',
      sommeil: 'Sommeil',
    });
    // Le troc entier : le Sommeil arrive, le Poison s'en va.
    const arrivee = lignes.find((l) => l.key === 'inflict:sommeil');
    const depart = lignes.find((l) => l.key === 'inflict:poison');
    expect(arrivee?.label).toContain('Sommeil');
    expect(arrivee?.before).toBe('—');
    expect(depart?.label).toContain('Poison');
    expect(depart?.after).toBe('—');
    // Et rien d'autre : le narcisse ne touche ni au mana ni à la portée.
    expect(lignes).toHaveLength(2);

    expect(plantImpact(socle(), null)).toEqual([]);
  });
});

describe('places d’étude, partagées avec le reste du personnage', () => {
  it('ouvre les mêmes places que pour les matériaux', () => {
    expect(studySlots(1)).toBe(1);
    expect(studySlots(20)).toBe(5);
  });

  it('compte les études faites ailleurs dans le même pool', () => {
    expect(cannotStudyPlant('belladone', [], 5)).toBeNull();
    expect(cannotStudyPlant('belladone', [], 5, 2)).toMatch(/place/i);
    expect(cannotStudyPlant('belladone', ['belladone'], 5)).toMatch(/déjà/);
    expect(cannotStudyPlant('rutabaga', [], 20)).toMatch(/inconnue/i);
  });

  it('nettoie une fiche sauvegardée : clés mortes, places perdues, plante fantôme', () => {
    expect(normalizePlantTraining(undefined, 5)).toBeUndefined();
    expect(normalizePlantTraining({ studied: ['rutabaga'] }, 20)).toBeUndefined();

    const range = normalizePlantTraining(
      { studied: ['belladone', 'belladone', 'aconit', 'ricin'], equipped: 'ricin' },
      5,
    );
    expect(range?.studied).toEqual(['belladone', 'aconit']);
    // Le ricin est tombé hors des places ouvertes : on ne sait plus le
    // reconnaître, il ne peut plus être dans la besace.
    expect(range?.equipped).toBeUndefined();
    expect(plantTier('ricin', range)).toBe('inconnue');

    // Une plante jamais vue ne se ramasse pas : on ne saurait pas s'en servir.
    expect(normalizePlantTraining({ equipped: 'ortie' }, 1)).toBeUndefined();

    const tenue = normalizePlantTraining({ studied: ['belladone'], equipped: 'belladone' }, 5);
    expect(tenue?.equipped).toBe('belladone');

    // Une plante simplement reconnue se porte quand même au sac, et ne prend
    // aucune place d'étude.
    const sac = normalizePlantTraining({ known: ['ortie', 'belladone'], equipped: 'ortie' }, 1);
    expect(sac?.studied).toEqual([]);
    expect(sac?.known).toEqual(['ortie', 'belladone']);
    expect(sac?.equipped).toBe('ortie');

    // Étudier ce qu'on connaissait déjà : la plante quitte la liste des connues.
    const promue = normalizePlantTraining({ studied: ['ortie'], known: ['ortie'] }, 5);
    expect(promue?.known).toEqual([]);
  });
});
