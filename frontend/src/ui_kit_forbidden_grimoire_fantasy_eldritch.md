# UI Kit — Forbidden Grimoire
## Direction Artistique Fantasy / Eldritch

---

# Vision

Le wiki doit donner l’impression de consulter :

- un manuscrit interdit
- des archives oubliées
- un grimoire vivant
- une bibliothèque cosmique ancienne

L’ambiance repose sur :

- textures papier
- encre noire
- or ancien
- symboles occultes
- lumière faible
- contrastes doux
- minimalisme élégant

Le style doit rester lisible et moderne malgré l’esthétique sombre.

---

# Palette Principale

## Couleurs Fond

| Nom | Hex | Usage |
|---|---|---|
| Abyss Black | #0b0908 | fond global |
| Charcoal Ink | #151311 | surfaces sombres |
| Old Paper | #d9ccb8 | fond parchemin |
| Burned Paper | #bca98b | variations papier |
| Dust Brown | #5e4632 | détails anciens |

---

## Couleurs Accent

| Nom | Hex | Usage |
|---|---|---|
| Ancient Gold | #8b6b2f | bordures / accents |
| Ritual Red | #6b1f1f | danger / magie |
| Cosmic Violet | #4b2e59 | glow eldritch |
| Faded Ivory | #ede6d6 | texte clair |
| Dead Ink | #1c1a18 | texte sombre |

---

# Typography

## Fonts Principales

### Texte principal

Spectral

```css
font-family: 'Spectral', serif;
```

Usage :
- lore
- descriptions
- articles
- chronologies

---

### Titres

Cinzel

```css
font-family: 'Cinzel', serif;
```

Usage :
- grands titres
- catégories
- sections
- headers

---

### Occulte / Glyphes

UnifrakturCook

```css
font-family: 'UnifrakturCook';
```

Usage :
- citations interdites
- symboles
- rituels
- sceaux

IMPORTANT :
Ne jamais utiliser pour de longs paragraphes.

---

# Ressources Fonts

## Google Fonts

- https://fonts.google.com/specimen/Spectral
- https://fonts.google.com/specimen/Cinzel
- https://fonts.google.com/specimen/Cormorant+Garamond

## Fonts Occultes

- https://www.dafont.com/unifrakturcook.font
- https://metamythos.net/downloads/fonts/

---

# Tailwind Config

```js
export default {
  theme: {
    extend: {
      colors: {
        abyss: '#0b0908',
        ink: '#151311',
        paper: '#d9ccb8',
        parchment: '#bca98b',
        gold: '#8b6b2f',
        ritual: '#6b1f1f',
        cosmic: '#4b2e59'
      },

      fontFamily: {
        serif: ['Spectral', 'serif'],
        title: ['Cinzel', 'serif'],
        occult: ['UnifrakturCook', 'cursive']
      },

      boxShadow: {
        glow: '0 0 20px rgba(75,46,89,0.35)',
        paper: '0 10px 40px rgba(0,0,0,0.45)'
      },

      backgroundImage: {
        paper: "url('/textures/paper.jpg')",
        grain: "url('/textures/grain.png')"
      }
    }
  }
}
```

---

# Textures Recommandées

## Types de textures

### Papier ancien

Utilisation :
- fonds d’articles
- cartes
- panneaux

### Grain / poussière

Utilisation :
- overlay global
- vieillissement UI

### Encre

Utilisation :
- coins
- transitions
- illustrations

### Bruit subtil

Utilisation :
- éviter les aplats numériques

---

# Ressources Textures

## Sites utiles

### AmbientCG
https://ambientcg.com/

### Unsplash
https://unsplash.com/

### Textures.com
https://www.textures.com/

### Transparent Textures
https://www.transparenttextures.com/

---

# Structure UI

## Layout principal

```text
┌─────────────────────────────┐
│ HEADER                      │
├──────────────┬──────────────┤
│ SIDEBAR      │ ARTICLE      │
│              │              │
│ factions     │ lore         │
│ maps         │ history      │
│ magic        │ entities     │
│ bestiary     │ timeline     │
└──────────────┴──────────────┘
```

---

# Header

## Style

- très fin
- élégant
- bordure discrète
- symboles anciens

## Contenu

- logo sigil
- nom du wiki
- navigation
- recherche

---

# Sidebar

## Ambiance

Doit ressembler à :

- index de bibliothèque
- table des matières interdite

## Sections

- Lore
- Factions
- Royaumes
- Bestiaire
- Entités
- Artefacts
- Chronologie
- Magie
- Religions

---

# Composants

# Boutons

## Bouton principal

```css
background: #1c1a18;
border: 1px solid rgba(139,107,47,0.4);
color: #ede6d6;
```

Hover :

```css
box-shadow: 0 0 12px rgba(139,107,47,0.25);
transform: translateY(-1px);
```

---

# Cards

## Style

- texture papier
- bordures fines
- ombres profondes
- coins légèrement usés

```css
background: rgba(217,204,184,0.95);
border: 1px solid rgba(139,107,47,0.25);
box-shadow: 0 10px 40px rgba(0,0,0,0.4);
```

---

# Citations

## Style

```css
border-left: 2px solid #8b6b2f;
font-style: italic;
opacity: 0.9;
```

Exemple :

“Les étoiles ne meurent jamais.
Elles attendent.”

---

# Article Layout

## Structure

- titre massif
- sous-titre
- metadata
- illustration
- sections aérées
- citations anciennes

---

# Metadata Box

```text
Nature : Entité cosmique
Origine : Avant le temps
Danger : Oméga
État : Dormant
```

Style :

- petite typo
- capitales fines
- séparateurs dorés

---

# Animations

IMPORTANT :
Très subtiles.

Le site doit sembler ancien.
Pas futuriste.

---

## Recommandations

### Hover lent

```css
transition: all 0.25s ease;
```

### Glow léger

```css
box-shadow: 0 0 20px rgba(75,46,89,0.15);
```

### Parallax léger

Utiliser seulement sur la home page.

---

# Effets Visuels

## Recommandés

- poussière animée
- grain cinéma
- fumée subtile
- scintillement faible
- bougies / lumière chaude

---

# Iconographie

## Style

- gravures
- géométrie sacrée
- sceaux
- astrolabes
- yeux occultes
- runes

---

# Ressources Icônes

## Lucide Icons
https://lucide.dev/

## SVG Repo
https://www.svgrepo.com/

## Game Icons
https://game-icons.net/

---

# Illustrations

## Style recommandé

- gravure noire
- monochrome
- lavis encre
- dark fantasy
- cosmic horror

---

# Inspirations Visuelles

## Jeux

- Bloodborne
- Dark Souls
- Sunless Sea
- Darkest Dungeon
- Cultist Simulator

## Films

- The Ninth Gate
- The Lighthouse
- Annihilation
- Sleepy Hollow

---

# UI Patterns

## Ce qui fonctionne bien

### Articles longs

Avec :
- colonnes aérées
- illustrations intégrées
- annotations marginales

### Encyclopédie

Avec :
- tags
- catégories
- metadata
- références croisées

### Home page

Avec :
- hero massif
- phrase mystérieuse
- catégories illustrées

---

# Effets CSS Utiles

## Papier ancien

```css
background:
linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15)),
url('/textures/paper.jpg');
```

---

## Vignette

```css
box-shadow: inset 0 0 120px rgba(0,0,0,0.5);
```

---

## Bordure magique

```css
border-image: linear-gradient(
  to bottom,
  rgba(139,107,47,0.6),
  rgba(75,46,89,0.2)
) 1;
```

---

# Organisation des Pages

```text
/
/lore
/history
/factions
/entities
/locations
/bestiary
/magic
/religions
/artifacts
/timeline
/maps
```

---

# Stack Recommandée

## Frontend

- React
- Tailwind CSS
- Vite

## Animations

- Framer Motion

## Icons

- Lucide

## Markdown / Wiki

- MDX
- Contentlayer

---

# Direction Finale Recommandée

## Mood

Le site doit évoquer :

“un livre qui ne devrait pas exister.”

## Equilibre

70% : élégance fantasy
30% : étrangeté eldritch

Le bizarre doit apparaître progressivement.

Pas immédiatement.

---

# Priorité Absolue

Toujours privilégier :

- lisibilité
- ambiance
- cohérence
- immersion

Avant les effets spectaculaires.

