import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../../components/navbar/navbar';
import { DOMAIN_DISTRIBUTION_CHARTS } from '../../magics/domain-distribution';

interface DetailItem {
  title: string;
  text: string;
}

interface ValueItem {
  label: string;
  value: string;
}

interface DomainNavLink {
  label: string;
  path: string;
  sigil: string;
}

@Component({
  selector: 'app-fire',
  imports: [CommonModule, RouterLink, Navbar],
  templateUrl: './fire.html',
  styleUrl: './fire.css',
})
export class Fire {
  readonly previousDomain: DomainNavLink = {
    label: 'Espace',
    path: '/magics/space',
    sigil: '✧',
  };

  readonly nextDomain: DomainNavLink = {
    label: 'Eau',
    path: '/magics/water',
    sigil: '≋',
  };

  readonly fireRaceDistribution = DOMAIN_DISTRIBUTION_CHARTS.map((chart) => ({
    race: chart.title,
    value: chart.slices.find((slice) => slice.key === 'fire')?.value ?? 0,
  }));

  readonly fireShardImage = '/resources/media/pictures/primordial-shards/primordial_fire_shard.png';

  readonly identity: ValueItem[] = [
    { label: 'Rareté', value: 'Commun' },
    { label: 'Divinité', value: 'Dieu du Feu' },
    { label: 'Totem', value: 'Salamandre géante' },
  ];

  readonly symbols = ['Forge', 'Passion', 'Destruction créatrice', 'Guerre', 'Impulsivité'];

  readonly presenceEffects: DetailItem[] = [
    {
      title: 'Présence physique',
      text: "Chaleur anormale venue de l'intérieur, matériaux inflammables qui prennent feu spontanément, air vibrant comme au-dessus d'une forge.",
    },
    {
      title: 'Effet mental',
      text: "Rage, désir et exaltation débordent sans objet précis. Après exposition prolongée, le filtre entre l'impulsion et l'acte semble brûlé.",
    },
    {
      title: 'Regard',
      text: "Vision simultanée du feu sous toutes ses formes : combustion stellaire, chaleur du noyau de Mystaria, chaque flamme ayant existé.",
    },
    {
      title: 'Prières',
      text: "Il perçoit vaguement les prières comme une chaleur lointaine. Une prière sincère en lieu volcanique peut produire des effets involontaires.",
    },
  ];

  readonly minerals: DetailItem[] = [
    {
      title: 'Obsidienne',
      text: "Roche volcanique par excellence, née du feu de la terre. Transformation naturelle, abondante en zone volcanique, éclat standard.",
    },
    {
      title: 'Grenat',
      text: 'Cristal rouge profond associé à la chaleur et à la passion. Retient très bien les fréquences thermiques, éclat de bonne qualité.',
    },
    {
      title: 'Cinabre',
      text: "Minerai de mercure rouge vif, instable et réactif. Éclat inférieur mais commun en activité géothermique, difficile à travailler.",
    },
  ];

  readonly metals: DetailItem[] = [
    { title: 'Fer', text: 'Métal commun le plus réceptif aux fréquences du Feu. Chauffe vite et retient longtemps la chaleur.' },
    { title: 'Acier', text: 'Produit par Terre + Feu. Plus stable que le fer pour les runes de Feu et les canalisations précises.' },
    { title: 'Lave solidifiée', text: 'Roche plutôt que métal, mais parfaite pour les objets à haute température et les artefacts volcaniques.' },
    { title: 'Or', text: 'Conducteur thermique exceptionnel, trop mou pour les armes mais idéal pour les mécanismes runiques fins.' },
  ];

  readonly subdomains: DetailItem[] = [
    { title: 'Combustion', text: 'Générer, diriger et éteindre les flammes. Base du domaine, simple à déclencher, difficile à nuancer.' },
    { title: 'Chaleur', text: 'Manipuler la température sans flamme visible. Utile pour survivre, cuisiner, soigner ou tuer lentement.' },
    { title: 'Lumière-feu', text: 'Lumière issue de combustion, brute et instable. Elle ne révèle ni ne purifie comme la vraie Lumière.' },
    { title: 'Destruction', text: 'Amplifie la nature consumante du feu contre structures magiques et protections enchantées. Avancé et dangereux.' },
    { title: 'Passion & Rage', text: "Extension émotionnelle du feu. Puissant, rare, mais reflète l'état psychologique du mage autant qu'il le contrôle." },
  ];

  readonly combinations: DetailItem[] = [
    { title: 'Lave (Feu + Terre)', text: 'Lave et volcans. Matière géologique et thermique, destructrice autant que créatrice de terres nouvelles.' },
    { title: 'Vapeur (Feu + Eau)', text: "Vapeur brûlante. Frontière instable entre brûlure thermique et pression fluidique, difficile à maîtriser." },
    { title: 'Forge (Feu + Terre)', text: 'Forge magique. Raffiner l’acier et les alliages impossibles, base de la métallurgie souterraine.' },
  ];

  readonly objects: DetailItem[] = [
    { title: 'Éclat de Feu brut', text: 'Chaud au toucher, effet passif faible. Base des lampes thermiques et chauffages rudimentaires.' },
    { title: 'Éclat de Feu runé', text: 'Flamme directionnelle, chaleur concentrée, combustion déclenchée ou résistance thermique selon les runes.' },
    { title: 'Lance de Koa Ahi', text: "Artefact unique forgé de lave solidifiée par Mahina Lun'a, brûlant sans se consumer." },
    { title: 'Amulettes thermiques', text: 'Objets communs dans les États Souterrains pour les travailleurs proches des forges et éclats instables.' },
  ];

  readonly regions: DetailItem[] = [
    { title: 'Royaume de la Lumière', text: "Mages orientés vers l'armée ou les guildes de forge après l'Examen de la Flamme." },
    { title: 'États Souterrains', text: "L'Étincelle de Forge, éveil accidentel par surcharge d'éclat, est le mode d'éveil le plus commun." },
    { title: 'Archipel de la Nuit', text: "Moku'ahi déclenche souvent les éveils au Feu lors du Tour des Îles, entre volcan et mer agitée." },
    { title: 'Royaume Abandonné', text: "Les chamanes conservent des techniques rudimentaires et parfois des fragments de titres divins." },
  ];

  readonly speciesList: { title: string; description: string }[] = [
    { title: 'Salamandre géante', description: 'Créature vivante de feu, résistante aux températures élevées et capable de générer des flammes.' },
    { title: 'Dragon de feu', description: 'Reptile mythique de grande taille, capable de souffler des flammes destructrices.' },
    { title: 'Phénix', description: 'Oiseau légendaire qui se régénère à partir de ses cendres après avoir été consumé par le feu.' },
    { title: 'Golem de lave', description: 'Créature artificielle fabriquée à partir de lave solidifiée, utilisée comme gardien ou soldat.' },
    { title: 'Esprit de flamme', description: 'Entité spirituelle liée au feu, souvent associée à des sorts d\'incantation et à la manipulation thermique.' }
  ];

  readonly floraList: { title: string; description: string }[] = [
    { title: 'Fleur de feu', description: 'Plante rare qui pousse dans les zones volcaniques, capable de résister à des températures extrêmes.' },
    { title: 'Arbre de braise', description: 'Arbre dont les feuilles dégagent une chaleur intense, utilisé pour le bois de chauffage et les rituels de feu.' },
    { title: 'Champignon incandescent', description: 'Champignon luminescent qui émet une lumière chaude, souvent utilisé dans les potions et les enchantements.' },
    { title: 'Liane de flamme', description: 'Plante grimpante qui s’enroule autour des structures, produisant des étincelles lorsqu’elle est frottée.' },
    { title: 'Herbe brûlante', description: 'Plante médicinale utilisée pour traiter les brûlures, connue pour sa capacité à refroidir la peau rapidement.' }
  ];
}
