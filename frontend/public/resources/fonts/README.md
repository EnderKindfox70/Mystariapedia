# Polices embarquées dans le PDF

Ces fichiers ne servent **pas** à l'affichage du site — celui-ci charge Cinzel et
Spectral depuis Google Fonts (cf. l'`@import` en tête de `src/styles.css`). Ils
sont récupérés à la volée par l'export PDF (`views/character-sheet/sheet-pdf.ts`)
et embarqués dans le document : sans eux, la fiche exportée retomberait sur les
polices standard du PDF et perdrait la typographie du site.

jsPDF n'embarque que les glyphes réellement utilisés (sous-ensemble Identity-H),
donc ces ~240 ko de TTF ne pèsent que quelques kilo-octets dans le PDF produit.
Ils ne sont pas non plus dans le bundle : le navigateur ne les télécharge qu'au
premier export.

| Fichier | Famille | Usage sur la fiche |
| --- | --- | --- |
| `Cinzel-Regular.ttf` | Cinzel | intertitres, libellés d'emplacements |
| `Cinzel-Bold.ttf` | Cinzel | bandeaux de bloc |
| `Spectral-Regular.ttf` | Spectral | texte courant |
| `Spectral-Bold.ttf` | Spectral | valeurs, intitulés |
| `Spectral-Italic.ttf` | Spectral | mentions vides (« Aucun trait »…) |

## Licences

Les deux familles sont publiées sous **SIL Open Font License 1.1**, qui autorise
la redistribution et l'embarquement dans un document.

- Cinzel — Natanael Gama, <https://fonts.google.com/specimen/Cinzel>
- Spectral — Production Type, <https://fonts.google.com/specimen/Spectral>

Texte de la licence : <https://openfontlicense.org/>

## Mise à jour

Les fichiers proviennent de l'API Google Fonts en version TTF (jsPDF ne sait pas
lire le WOFF2) :

```sh
curl -A "Mozilla/5.0 (Windows NT 6.1)" \
  "https://fonts.googleapis.com/css?family=Cinzel:400,700|Spectral:400,400i,700"
```

La réponse liste les URL `.ttf` à télécharger.
