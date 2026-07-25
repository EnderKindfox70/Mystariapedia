import fireDomain from '../../public/resources/json/domains/fire.json';
import waterDomain from '../../public/resources/json/domains/water.json';
import earthDomain from '../../public/resources/json/domains/earth.json';
import airDomain from '../../public/resources/json/domains/air.json';
import electricityDomain from '../../public/resources/json/domains/electricity.json';
import plantDomain from '../../public/resources/json/domains/plant.json';
import lightDomain from '../../public/resources/json/domains/light.json';
import darknessDomain from '../../public/resources/json/domains/darkness.json';
import lifeDomain from '../../public/resources/json/domains/life.json';
import deathDomain from '../../public/resources/json/domains/death.json';
import timeDomain from '../../public/resources/json/domains/time.json';
import spaceDomain from '../../public/resources/json/domains/space.json';
import renforcementDomain from '../../public/resources/json/domains/renforcement.json';
import emissionDomain from '../../public/resources/json/domains/emission.json';

/**
 * Catalogue unique des 12 domaines pour l'affichage (grille des domaines de la
 * page magie + pages d'entrée de domaine + emblèmes de sorts).
 *
 * Source unique de vérité pour l'ICÔNE de chaque domaine : le champ `icon` du
 * fichier `domains/<slug>.json`. Changer une image se fait donc à un seul
 * endroit — le chemin dans le JSON — et se répercute partout (héros, grille,
 * sorts, combinaisons).
 *
 * Les libellés, sigils, couleurs et citations restent curatés ici car ils
 * diffèrent volontairement des champs `name`/`usage-quote` des JSON.
 */
export interface DomainMeta {
  /** Identifiant de route (`/magics/<slug>`) et clé de domaine. */
  slug: string;
  /** Nom affiché. */
  label: string;
  /** Sigil de repli, affiché quand le domaine n'a pas encore d'icône. */
  sigil: string;
  /** Couleur d'accent (dégradés de combinaison, etc.). */
  color: string;
  /** Classe CSS modificatrice appliquée sur `.domain-card`. */
  cssClass: string;
  /** Citation affichée sur la carte de la grille des domaines. */
  quote: string;
  /** Chemin de l'icône du domaine — provient du JSON, `''` si absente. */
  icon: string;
}

/** Icône de chaque domaine, tirée du JSON correspondant (source unique). */
const ICON_BY_SLUG: Record<string, string> = {
  fire: fireDomain.icon ?? '',
  water: waterDomain.icon ?? '',
  earth: earthDomain.icon ?? '',
  air: airDomain.icon ?? '',
  electricity: electricityDomain.icon ?? '',
  plant: plantDomain.icon ?? '',
  light: lightDomain.icon ?? '',
  darkness: darknessDomain.icon ?? '',
  life: lifeDomain.icon ?? '',
  death: deathDomain.icon ?? '',
  time: timeDomain.icon ?? '',
  space: spaceDomain.icon ?? '',
};

/** Présentation curatée (ordre, libellé, sigil, couleur, classe, citation). */
const PRESENTATION: Omit<DomainMeta, 'icon'>[] = [
  { slug: 'fire',        label: 'Feu',      sigil: '♨', color: '#b8482b', cssClass: 'domain-fire',      quote: 'Ne contrôle pas la flamme. Deviens la raison pour laquelle elle brûle.' },
  { slug: 'water',       label: 'Eau',      sigil: '≋', color: '#3d79a8', cssClass: 'domain-water',     quote: "L'eau n'a pas de forme propre. Si tu en as une, tu n'es pas encore l'eau." },
  { slug: 'earth',       label: 'Terre',    sigil: '△', color: '#9a7440', cssClass: 'domain-earth',     quote: "La précipitation est étrangère à ce domaine. Si tu es pressé, tu n'es pas prêt." },
  { slug: 'air',         label: 'Air',      sigil: '☲', color: '#8fb8aa', cssClass: 'domain-air',       quote: 'Sois léger dans ton intention. Tout ce qui pèse trop retombe.' },
  { slug: 'electricity', label: 'Foudre',   sigil: 'ϟ', color: '#d6a736', cssClass: 'domain-lightning', quote: "Laisse l'impulsion venir. Si tu la construis, tu arrives trop tard." },
  { slug: 'plant',       label: 'Plantes',  sigil: '✥', color: '#6f8f3d', cssClass: 'domain-plants',    quote: "La plante ne pousse pas vers la lumière par volonté. Elle pousse parce que c'est sa nature. Trouve la tienne." },
  { slug: 'light',       label: 'Lumière',  sigil: '☼', color: '#d8c17a', cssClass: 'domain-light',     quote: 'Ne projette pas la lumière. Sois la source, et laisse-la rayonner.' },
  { slug: 'darkness',    label: 'Ténèbres', sigil: '◉', color: '#7f559b', cssClass: 'domain-darkness',  quote: 'Dissimule d\'abord ta propre présence. Ce que tu ne peux pas cacher en toi, tu ne peux pas cacher ailleurs.' },
  { slug: 'life',        label: 'Vie',      sigil: '♧', color: '#77a356', cssClass: 'domain-life',      quote: 'Ne dirige pas la vie. Accompagne-la. Elle sait où elle va mieux que toi.' },
  { slug: 'death',       label: 'Mort',     sigil: '☠', color: '#3a3632', cssClass: 'domain-death',     quote: "Ce domaine exige que tu acceptes d'abord ta propre finitude. Sans ça, tu ne touches qu'à la surface." },
  { slug: 'time',        label: 'Temps',    sigil: '⌛', color: '#9b79ad', cssClass: 'domain-time',      quote: 'Cesse de penser au maintenant. Le temps ne vit pas dans l\'instant — il vit dans l\'écart.' },
  { slug: 'space',       label: 'Espace',   sigil: '✧', color: '#68a9b3', cssClass: 'domain-space',     quote: "Oublie la distance. Elle n'existe que parce que tu y crois." },
];

/** Les 12 domaines, présentation curatée + icône issue du JSON. */
export const DOMAINS: DomainMeta[] = PRESENTATION.map((p) => ({
  ...p,
  icon: ICON_BY_SLUG[p.slug] ?? '',
}));

/**
 * « Domaines » de la magie non polarisée (Renforcement, Émission). Volontairement
 * tenus HORS de `DOMAINS` : ils ont une page cliquable mais n'apparaissent pas
 * dans les grilles ni les bandeaux d'icônes, pour signifier qu'ils ne sont liés
 * à aucune des douze fréquences divines. Gris-blanchâtres — la mana brute.
 */
export const NONPOLAR_DOMAINS: DomainMeta[] = [
  { slug: 'renforcement', label: 'Renforcement', sigil: '◈', color: '#c7c4bb', cssClass: 'domain-renforcement', quote: "Je ne change pas ta nature. Je la rends plus difficile à briser.", icon: renforcementDomain.icon ?? '' },
  { slug: 'emission',     label: 'Émission',     sigil: '✵', color: '#c7c4bb', cssClass: 'domain-emission',     quote: "Je m'interpose, et je bois le coup à ta place.",                icon: emissionDomain.icon ?? '' },
];

/** Résolution par slug : les 12 domaines + les usages non polarisés. */
const DOMAIN_BY_SLUG = new Map(
  [...DOMAINS, ...NONPOLAR_DOMAINS].map((d) => [d.slug, d])
);

export const domainMeta  = (slug: string): DomainMeta | undefined => DOMAIN_BY_SLUG.get(slug);
export const domainIcon  = (slug: string): string => DOMAIN_BY_SLUG.get(slug)?.icon ?? '';
export const domainSigil = (slug: string): string => DOMAIN_BY_SLUG.get(slug)?.sigil ?? '◇';
export const domainLabel = (slug: string): string => DOMAIN_BY_SLUG.get(slug)?.label ?? slug;
export const domainColor = (slug: string): string => DOMAIN_BY_SLUG.get(slug)?.color ?? '#8b6b2f';
