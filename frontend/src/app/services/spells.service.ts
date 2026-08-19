import { Injectable } from '@angular/core';
import fireDomain from '../../../public/resources/json/domains/fire.json';
import waterDomain from '../../../public/resources/json/domains/water.json';
import earthDomain from '../../../public/resources/json/domains/earth.json';
import airDomain from '../../../public/resources/json/domains/air.json';
import electricityDomain from '../../../public/resources/json/domains/electricity.json';
import plantDomain from '../../../public/resources/json/domains/plant.json';
import lightDomain from '../../../public/resources/json/domains/light.json';
import darknessDomain from '../../../public/resources/json/domains/darkness.json';
import lifeDomain from '../../../public/resources/json/domains/life.json';
import deathDomain from '../../../public/resources/json/domains/death.json';
import timeDomain from '../../../public/resources/json/domains/time.json';
import spaceDomain from '../../../public/resources/json/domains/space.json';
import renforcementDomain from '../../../public/resources/json/domains/renforcement.json';
import emissionDomain from '../../../public/resources/json/domains/emission.json';
import combinations from '../../../public/resources/json/domains/combinations.json';
import { DomainCombination, DomainEntry, DomainSpellEntry, SpellPageData } from '../wiki.types';

/**
 * Source unique et automatique des pages de sorts.
 *
 * Le service parcourt les 12 fichiers de domaine, les deux usages non polarisés
 * (Renforcement, Émission) + `combinations.json` et
 * construit un index de tous les sorts par leur `key` (= slug de page). Chaque
 * sort déclaré dans un JSON obtient donc automatiquement sa page
 * `/magics/spell/<key>` — aucun enregistrement manuel n'est nécessaire.
 */
@Injectable({ providedIn: 'root' })
export class SpellsService {
  /** Domaines statiques indexés par slug (source des sorts élémentaires). */
  private readonly domainsBySlug: Record<string, DomainEntry> = {
    fire: fireDomain as unknown as DomainEntry,
    water: waterDomain as unknown as DomainEntry,
    earth: earthDomain as unknown as DomainEntry,
    air: airDomain as unknown as DomainEntry,
    electricity: electricityDomain as unknown as DomainEntry,
    plant: plantDomain as unknown as DomainEntry,
    light: lightDomain as unknown as DomainEntry,
    darkness: darknessDomain as unknown as DomainEntry,
    life: lifeDomain as unknown as DomainEntry,
    death: deathDomain as unknown as DomainEntry,
    time: timeDomain as unknown as DomainEntry,
    space: spaceDomain as unknown as DomainEntry,
    // Magie non polarisée : deux usages de la mana brute, sans domaine ni
    // affinité. Leurs sorts se lisent et se tarifent comme les autres.
    renforcement: renforcementDomain as unknown as DomainEntry,
    emission: emissionDomain as unknown as DomainEntry,
  };

  /** Index `key → page`, construit une fois au démarrage. */
  private readonly index = new Map<string, SpellPageData>(this.buildIndex());

  /** Page d'un sort par son slug (clé), ou `undefined` si inconnu. */
  bySlug(key: string): SpellPageData | undefined {
    return this.index.get(key);
  }

  /** Toutes les pages de sorts (utile pour un index ou du prefetch). */
  all(): SpellPageData[] {
    return [...this.index.values()];
  }

  /** Sorts requis pour débloquer `key` (prérequis déclarés par le sort). */
  prerequisites(key: string): SpellPageData[] {
    const page = this.bySlug(key);
    return (page?.spell.requires ?? [])
      .map((k) => this.bySlug(k))
      .filter((p): p is SpellPageData => !!p);
  }

  /** Sorts qui requièrent `key` pour être débloqués (relation inverse, dérivée). */
  unlocks(key: string): SpellPageData[] {
    return this.all().filter((p) => (p.spell.requires ?? []).includes(key));
  }

  /** Les slugs des sorts d'un domaine (élémentaires + combinaisons), triés par niveau. */
  spellSlugsForDomain(slug: string): string[] {
    return this.all()
      .filter((p) => p.domains.includes(slug))
      .sort((a, b) => a.spell.level - b.spell.level)
      .map((p) => p.spell.key);
  }

  private *buildIndex(): Iterable<[string, SpellPageData]> {
    // Sorts élémentaires : un par domaine. Icône effective = icône propre du sort,
    // sinon celle de son sous-domaine (repli via la liste `subdomains`).
    for (const [slug, domain] of Object.entries(this.domainsBySlug)) {
      const subIcon = new Map((domain.subdomains ?? []).map((s) => [s.name, s.icon]));
      for (const spell of domain.spells ?? []) {
        const icon =
          spell.icon ||
          (spell.subdomains ?? []).map((n) => subIcon.get(n)).find((v) => !!v) ||
          '';
        yield [spell.key, { spell, kind: 'domain', domains: [slug], icon }];
      }
    }
    // Sorts de combinaison : croisent 2+ domaines.
    for (const combo of combinations as unknown as DomainCombination[]) {
      for (const spell of combo.spells ?? []) {
        yield [
          spell.key,
          {
            spell: spell as DomainSpellEntry,
            kind: 'combination',
            domains: combo.components,
            comboName: combo.name.trim() || undefined,
            icon: spell.icon || '',
          },
        ];
      }
    }
  }
}
