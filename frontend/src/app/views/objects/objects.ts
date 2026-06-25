import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';

/** Une grande carte du hub Objets : un domaine, sa description, sa destination. */
interface HubEntry {
  id: string;
  label: string;
  blurb: string;
  /** Quelques exemples de ce que regroupe la catégorie. */
  examples: string[];
  glyph: string;
  link: string[];
  linkLabel: string;
}

@Component({
  selector: 'app-objects',
  imports: [RouterLink, Navbar],
  templateUrl: './objects.html',
  styleUrl: './objects.css',
})
export class Objects {
  /** Les grands ensembles d'objets de Mystaria. Ajouter un pôle = 1 entrée ici. */
  readonly entries: HubEntry[] = [
    {
      id: 'ressources-naturelles',
      label: 'Ressources naturelles',
      blurb: 'Les matières brutes du monde, récoltées puis transformées : ingrédients et réactifs de toute préparation.',
      examples: ['Flore', 'Minéraux', 'Liquides', 'Dépouilles'],
      glyph: '✦',
      link: ['/resources'],
      linkLabel: 'Explorer les ressources',
    },
    {
      id: 'artefacts',
      label: 'Artefacts & objets magiques',
      blurb: 'Objets façonnés, enchantés ou hérités des anciens, porteurs d’un pouvoir qui leur est propre.',
      examples: ['Reliques', 'Talismans', 'Grimoires'],
      glyph: '⚜',
      link: ['/artifacts'],
      linkLabel: 'Consulter les artefacts',
    },
    {
      id: 'armes-armures',
      label: 'Armes & armures',
      blurb: 'L’arsenal de Mystaria : lames forgées pour la guerre et protections qui sauvent ceux qui les portent.',
      examples: ['Armes de mêlée', 'Armes à distance', 'Armures & boucliers'],
      glyph: '⚔',
      link: ['/weapons'],
      linkLabel: 'Parcourir l’arsenal',
    },
    {
      id: 'potions',
      label: 'Potions',
      blurb: 'Le fruit de l’alchimie : élixirs, philtres et décoctions nés de l’assemblage des ressources.',
      examples: ['Élixirs', 'Philtres', 'Décoctions'],
      glyph: '⚗',
      link: ['/alchemy'],
      linkLabel: 'Ouvrir le catalogue d’alchimie',
    },
  ];
}
