# Rapport d’équilibrage

_Généré par `frontend/src/app/combat/sim/balance.spec.ts` — 2784 combats joués par le moteur._

Ce rapport est **mesuré, pas estimé**. Le banc d’essai monte les vraies fiches
sauvegardées et les vraies bêtes du bestiaire, les fait s’affronter sur terrain nu,
et compte. Il n’applique aucune règle de son cru : il appelle `applyAction` comme
le fait la table de combat.

L’IA qui pilote les combattants est délibérément sommaire — elle frappe ce qui
rapporte le plus, tout de suite, sans économiser ses réserves. Les durées qu’elle
produit sont donc un **plancher** : un joueur qui temporise fera durer davantage.

## Vue d’ensemble

| Mesure | Valeur | Ce qu’on cherche |
| --- | --- | --- |
| Combats joués | 2784 | — |
| Tours médians | 2.0 | 5 à 10 |
| Premier sang au round | 1.0 | 1 à 2 |
| Tours de contact réel | 2.0 | 4 à 8 |
| Combats non conclus | 0 % | < 5 % |
| PV conservés par le vainqueur | 67 % | 20 à 50 % |
| Absorbé par les défenses | 37 % | 25 à 45 % |
| Encaissé / annoncé | 61 % | — |
| Tours d’approche par combattant | 0.5 | < 1,5 |
| Tours perdus par combattant | 0.0 | < 0,5 |
| Dont réserve vide | 0 % | 20 à 50 % |
| Dont souffle coupé | 0 % | — |

## 1. Duels entre personnages de même niveau

Chaque paire est jouée dans les deux sens, pour que la position et l’ordre
d’initiative ne comptent pas dans le résultat. « Victoires gauche » à 50 % =
affrontement équilibré ; à 100 % = une des deux fiches domine l’autre sans partage.

| Affrontement | Tours | dont contact | Non conclus | Victoires gauche | PV du vainqueur | Absorbé |
| --- | --- | --- | --- | --- | --- | --- |
| niv. 1 — Zoro vs Haru | 2.0 | 1.0 | 0 % | 4 % | 39 % | 26 % |
| niv. 1 — Zoro vs Aelloelle | 2.0 | 2.0 | 0 % | 0 % | 97 % | 34 % |
| niv. 1 — Zoro vs Flits | 1.0 | 1.0 | 0 % | 0 % | 76 % | 23 % |
| niv. 1 — Zoro vs Erza | 2.0 | 1.0 | 0 % | 21 % | 38 % | 25 % |
| niv. 1 — Zoro vs Bulma | 2.0 | 2.0 | 0 % | 13 % | 20 % | 18 % |
| niv. 1 — Haru vs Aelloelle | 2.0 | 2.0 | 0 % | 4 % | 96 % | 35 % |
| niv. 1 — Haru vs Flits | 3.0 | 2.0 | 0 % | 17 % | 31 % | 40 % |
| niv. 1 — Haru vs Erza | 3.0 | 2.0 | 0 % | 17 % | 37 % | 36 % |
| niv. 1 — Haru vs Bulma | 3.0 | 2.0 | 0 % | 21 % | 25 % | 19 % |
| niv. 1 — Aelloelle vs Flits | 2.0 | 2.0 | 0 % | 92 % | 79 % | 35 % |
| niv. 1 — Aelloelle vs Erza | 2.0 | 2.0 | 0 % | 96 % | 90 % | 39 % |
| niv. 1 — Aelloelle vs Bulma | 2.0 | 2.0 | 0 % | 96 % | 82 % | 21 % |
| niv. 1 — Flits vs Erza | 3.0 | 2.0 | 0 % | 88 % | 33 % | 42 % |
| niv. 1 — Flits vs Bulma | 2.0 | 2.0 | 0 % | 13 % | 25 % | 19 % |
| niv. 1 — Erza vs Bulma | 2.0 | 2.0 | 0 % | 17 % | 27 % | 19 % |
| niv. 3 — Ender Kindfox vs Vivi | 2.0 | 2.0 | 0 % | 17 % | 38 % | 33 % |
| niv. 3 — Ender Kindfox vs Derrieri | 2.0 | 2.0 | 0 % | 0 % | 59 % | 41 % |
| niv. 3 — Ender Kindfox vs C18 | 2.0 | 2.0 | 0 % | 0 % | 60 % | 31 % |
| niv. 3 — Vivi vs Derrieri | 2.0 | 2.0 | 0 % | 0 % | 48 % | 30 % |
| niv. 3 — Vivi vs C18 | 2.0 | 2.0 | 0 % | 0 % | 49 % | 25 % |
| niv. 3 — Derrieri vs C18 | 2.0 | 2.0 | 0 % | 17 % | 43 % | 30 % |

## 2. Miroirs

La même fiche des deux côtés. Le vainqueur ne doit rien qu’à l’initiative et aux
dés : ces lignes mesurent donc la **létalité pure** d’une fiche contre elle-même,
et c’est le meilleur indicateur du rythme d’un combat à ce niveau.

| Affrontement | Tours | dont contact | Non conclus | Victoires gauche | PV du vainqueur | Absorbé |
| --- | --- | --- | --- | --- | --- | --- |
| Ambre Crimson (niv. 15, Mage) | 1.0 | 1.0 | 0 % | 50 % | 100 % | 85 % |
| Ender Kindfox (niv. 3, Vagabond) | 1.0 | 1.0 | 0 % | 46 % | 68 % | 21 % |
| Neeko (niv. 2, Mage) | 2.0 | 2.0 | 0 % | 42 % | 42 % | 30 % |
| Vivi (niv. 3, Ranger) | 2.0 | 2.0 | 0 % | 38 % | 41 % | 24 % |
| Zoro (niv. 1, Vagabond) | 1.0 | 1.0 | 0 % | 58 % | 87 % | 14 % |
| Merlin (niv. 7, Mage) | 2.0 | 2.0 | 0 % | 54 % | 41 % | 46 % |
| Derrieri (niv. 3, Pugiliste) | 2.0 | 2.0 | 0 % | 54 % | 50 % | 30 % |
| Haru (niv. 1, Guerrier) | 3.0 | 2.0 | 0 % | 46 % | 36 % | 39 % |
| Aelloelle (niv. 1, Ranger) | 2.0 | 2.0 | 0 % | 42 % | 34 % | 38 % |
| Flits (niv. 1, Guerrier) | 2.0 | 2.0 | 0 % | 54 % | 34 % | 41 % |
| Erza (niv. 1, Guerrier) | 3.0 | 2.0 | 0 % | 50 % | 33 % | 40 % |
| C18 (niv. 3, Pugiliste) | 2.0 | 2.0 | 0 % | 46 % | 51 % | 30 % |
| Bulma (niv. 1, Pugiliste) | 3.0 | 3.0 | 0 % | 46 % | 31 % | 20 % |
| Ryuuko matoi (niv. 20, Guerrier) | 5.0 | 5.0 | 0 % | 63 % | 23 % | 44 % |

## 3. Personnages contre bestiaire

Un contre un, sur terrain nu. Sert à vérifier que l’indice de menace (FP) annoncé
sur les fiches correspond à ce qu’on ressent en jeu.

| Affrontement | Tours | dont contact | Non conclus | Victoires gauche | PV du vainqueur | Absorbé |
| --- | --- | --- | --- | --- | --- | --- |
| Haru (niv. 1) vs Bélier des cimes (FP 1) | 4.0 | 3.0 | 0 % | 0 % | 42 % | 29 % |
| Erza (niv. 1) vs Bélier des cimes (FP 1) | 3.5 | 2.5 | 0 % | 0 % | 69 % | 26 % |
| Aelloelle (niv. 1) vs Bélier des cimes (FP 1) | 3.0 | 3.0 | 0 % | 92 % | 80 % | 29 % |
| Ender Kindfox (niv. 3) vs Bélier des cimes (FP 1) | 2.0 | 2.0 | 0 % | 17 % | 26 % | 30 % |
| Derrieri (niv. 3) vs Bélier des cimes (FP 1) | 5.0 | 5.0 | 0 % | 71 % | 26 % | 34 % |
| Merlin (niv. 7) vs Bélier des cimes (FP 1) | 2.0 | 2.0 | 0 % | 92 % | 62 % | 36 % |
| Haru (niv. 1) vs Chien de troupeau (FP 1) | 3.0 | 2.0 | 0 % | 100 % | 60 % | 32 % |
| Erza (niv. 1) vs Chien de troupeau (FP 1) | 3.0 | 2.0 | 0 % | 100 % | 62 % | 30 % |
| Aelloelle (niv. 1) vs Chien de troupeau (FP 1) | 3.0 | 3.0 | 0 % | 100 % | 80 % | 31 % |
| Ender Kindfox (niv. 3) vs Chien de troupeau (FP 1) | 2.0 | 2.0 | 0 % | 100 % | 76 % | 30 % |
| Derrieri (niv. 3) vs Chien de troupeau (FP 1) | 2.0 | 2.0 | 0 % | 100 % | 91 % | 26 % |
| Merlin (niv. 7) vs Chien de troupeau (FP 1) | 1.0 | 1.0 | 0 % | 100 % | 97 % | 32 % |
| Haru (niv. 1) vs Lézard rocailleux (FP 1) | 6.5 | 5.5 | 0 % | 96 % | 45 % | 36 % |
| Erza (niv. 1) vs Lézard rocailleux (FP 1) | 8.5 | 7.5 | 0 % | 79 % | 36 % | 38 % |
| Aelloelle (niv. 1) vs Lézard rocailleux (FP 1) | 4.0 | 4.0 | 0 % | 100 % | 99 % | 42 % |
| Ender Kindfox (niv. 3) vs Lézard rocailleux (FP 1) | 3.0 | 3.0 | 0 % | 100 % | 79 % | 35 % |
| Derrieri (niv. 3) vs Lézard rocailleux (FP 1) | 4.0 | 4.0 | 0 % | 100 % | 83 % | 41 % |
| Merlin (niv. 7) vs Lézard rocailleux (FP 1) | 2.0 | 2.0 | 0 % | 100 % | 98 % | 42 % |
| Haru (niv. 1) vs Loup Gris (FP 1) | 5.0 | 4.0 | 0 % | 38 % | 23 % | 27 % |
| Erza (niv. 1) vs Loup Gris (FP 1) | 5.0 | 5.0 | 0 % | 0 % | 49 % | 23 % |
| Aelloelle (niv. 1) vs Loup Gris (FP 1) | 3.0 | 3.0 | 0 % | 79 % | 34 % | 26 % |
| Ender Kindfox (niv. 3) vs Loup Gris (FP 1) | 3.0 | 3.0 | 0 % | 63 % | 28 % | 29 % |
| Derrieri (niv. 3) vs Loup Gris (FP 1) | 4.5 | 4.5 | 0 % | 100 % | 52 % | 27 % |
| Merlin (niv. 7) vs Loup Gris (FP 1) | 2.5 | 2.5 | 0 % | 100 % | 76 % | 39 % |
| Haru (niv. 1) vs Poule des chaumes (FP 0) | 2.0 | 1.0 | 0 % | 100 % | 95 % | 43 % |
| Erza (niv. 1) vs Poule des chaumes (FP 0) | 2.0 | 1.0 | 0 % | 100 % | 100 % | 39 % |
| Aelloelle (niv. 1) vs Poule des chaumes (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 33 % |
| Ender Kindfox (niv. 3) vs Poule des chaumes (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 37 % |
| Derrieri (niv. 3) vs Poule des chaumes (FP 0) | 2.0 | 2.0 | 0 % | 100 % | 97 % | 46 % |
| Merlin (niv. 7) vs Poule des chaumes (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 72 % |
| Haru (niv. 1) vs Scarabée pollinisateur géant (FP 0) | 2.0 | 1.0 | 0 % | 100 % | 96 % | 48 % |
| Erza (niv. 1) vs Scarabée pollinisateur géant (FP 0) | 2.0 | 1.0 | 0 % | 100 % | 95 % | 46 % |
| Aelloelle (niv. 1) vs Scarabée pollinisateur géant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 39 % |
| Ender Kindfox (niv. 3) vs Scarabée pollinisateur géant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 44 % |
| Derrieri (niv. 3) vs Scarabée pollinisateur géant (FP 0) | 2.0 | 2.0 | 0 % | 100 % | 98 % | 48 % |
| Merlin (niv. 7) vs Scarabée pollinisateur géant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 75 % |
| Haru (niv. 1) vs Serpent des marais (FP 1) | 3.0 | 2.0 | 0 % | 96 % | 64 % | 38 % |
| Erza (niv. 1) vs Serpent des marais (FP 1) | 3.0 | 2.0 | 0 % | 96 % | 57 % | 42 % |
| Aelloelle (niv. 1) vs Serpent des marais (FP 1) | 3.0 | 3.0 | 0 % | 83 % | 67 % | 43 % |
| Ender Kindfox (niv. 3) vs Serpent des marais (FP 1) | 2.0 | 2.0 | 0 % | 71 % | 61 % | 38 % |
| Derrieri (niv. 3) vs Serpent des marais (FP 1) | 2.0 | 2.0 | 0 % | 100 % | 88 % | 23 % |
| Merlin (niv. 7) vs Serpent des marais (FP 1) | 2.0 | 2.0 | 0 % | 100 % | 85 % | 50 % |
| Haru (niv. 1) vs Truite de courant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 58 % |
| Erza (niv. 1) vs Truite de courant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 54 % |
| Aelloelle (niv. 1) vs Truite de courant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 99 % | 42 % |
| Ender Kindfox (niv. 3) vs Truite de courant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 53 % |
| Derrieri (niv. 3) vs Truite de courant (FP 0) | 2.0 | 2.0 | 0 % | 100 % | 97 % | 59 % |
| Merlin (niv. 7) vs Truite de courant (FP 0) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 78 % |
| Haru (niv. 1) vs Vache des vallons (FP 0) | 6.5 | 5.0 | 0 % | 29 % | 63 % | 30 % |
| Erza (niv. 1) vs Vache des vallons (FP 0) | 7.0 | 6.0 | 0 % | 0 % | 71 % | 30 % |
| Aelloelle (niv. 1) vs Vache des vallons (FP 0) | 6.0 | 6.0 | 0 % | 92 % | 64 % | 27 % |
| Ender Kindfox (niv. 3) vs Vache des vallons (FP 0) | 5.0 | 5.0 | 0 % | 67 % | 26 % | 24 % |
| Derrieri (niv. 3) vs Vache des vallons (FP 0) | 6.0 | 6.0 | 0 % | 100 % | 52 % | 30 % |
| Merlin (niv. 7) vs Vache des vallons (FP 0) | 2.0 | 2.0 | 0 % | 100 % | 84 % | 33 % |
| Haru (niv. 1) vs Corneille Funeste (FP 2) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 78 % |
| Erza (niv. 1) vs Corneille Funeste (FP 2) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 77 % |
| Aelloelle (niv. 1) vs Corneille Funeste (FP 2) | 1.0 | 1.0 | 0 % | 100 % | 98 % | 70 % |
| Ender Kindfox (niv. 3) vs Corneille Funeste (FP 2) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 76 % |
| Derrieri (niv. 3) vs Corneille Funeste (FP 2) | 2.0 | 2.0 | 0 % | 100 % | 92 % | 69 % |
| Merlin (niv. 7) vs Corneille Funeste (FP 2) | 1.0 | 1.0 | 0 % | 100 % | 100 % | 89 % |
| Haru (niv. 1) vs Hurle-Vent (FP 2) | 3.0 | 2.0 | 0 % | 0 % | 100 % | 28 % |
| Erza (niv. 1) vs Hurle-Vent (FP 2) | 2.5 | 1.5 | 0 % | 0 % | 100 % | 26 % |
| Aelloelle (niv. 1) vs Hurle-Vent (FP 2) | 2.5 | 1.5 | 0 % | 0 % | 99 % | 28 % |
| Ender Kindfox (niv. 3) vs Hurle-Vent (FP 2) | 2.0 | 2.0 | 0 % | 0 % | 87 % | 31 % |
| Derrieri (niv. 3) vs Hurle-Vent (FP 2) | 4.0 | 4.0 | 0 % | 0 % | 100 % | 29 % |
| Merlin (niv. 7) vs Hurle-Vent (FP 2) | 2.0 | 2.0 | 0 % | 92 % | 57 % | 31 % |
| Haru (niv. 1) vs Serpent Fantôme (FP 2) | 4.0 | 3.0 | 0 % | 38 % | 39 % | 35 % |
| Erza (niv. 1) vs Serpent Fantôme (FP 2) | 4.0 | 3.0 | 0 % | 25 % | 41 % | 35 % |
| Aelloelle (niv. 1) vs Serpent Fantôme (FP 2) | 4.0 | 4.0 | 0 % | 46 % | 57 % | 32 % |
| Ender Kindfox (niv. 3) vs Serpent Fantôme (FP 2) | 3.0 | 3.0 | 0 % | 38 % | 57 % | 34 % |
| Derrieri (niv. 3) vs Serpent Fantôme (FP 2) | 4.0 | 3.5 | 0 % | 92 % | 61 % | 43 % |
| Merlin (niv. 7) vs Serpent Fantôme (FP 2) | 2.0 | 1.5 | 0 % | 92 % | 86 % | 29 % |

## 4. Économie d’action : un contre plusieurs

Le nombre est la variable la plus brutale d’un jeu au tour par tour : chaque bête
en plus est un tour d’actions en plus par round. Ces lignes disent à partir de
combien d’adversaires un personnage seul décroche.

| Affrontement | Tours | dont contact | Non conclus | Victoires gauche | PV du vainqueur | Absorbé |
| --- | --- | --- | --- | --- | --- | --- |
| Haru (niv. 1) vs 1 loup | 5.0 | 4.0 | 0 % | 38 % | 23 % | 27 % |
| Haru (niv. 1) vs 2 loups | 3.0 | 2.0 | 0 % | 0 % | 78 % | 30 % |
| Haru (niv. 1) vs 3 loups | 3.0 | 2.0 | 0 % | 0 % | 94 % | 32 % |
| Ender Kindfox (niv. 3) vs 1 loup | 3.0 | 3.0 | 0 % | 63 % | 28 % | 29 % |
| Ender Kindfox (niv. 3) vs 2 loups | 2.0 | 2.0 | 0 % | 0 % | 70 % | 30 % |
| Ender Kindfox (niv. 3) vs 3 loups | 1.5 | 1.5 | 0 % | 0 % | 85 % | 32 % |
| Merlin (niv. 7) vs 1 loup | 2.5 | 2.5 | 0 % | 100 % | 76 % | 39 % |
| Merlin (niv. 7) vs 2 loups | 4.0 | 4.0 | 0 % | 25 % | 25 % | 32 % |
| Merlin (niv. 7) vs 3 loups | 3.0 | 3.0 | 0 % | 4 % | 49 % | 29 % |

## 5. Fiche par fiche

« Tient (tours) » = combien de tours le combattant survit au rythme où on l’entame,
toutes séries confondues. « Mana brûlé » = part de la réserve dépensée dans un
combat moyen : au-delà de 100 %, la réserve n’est pas la contrainte qu’elle devrait être.

| Combattant | Niv. | PV | Dégâts / tour | Tient (tours) | Sorts | Compétences | Perdus | Mana brûlé | End. max | Souffle / tour | Réserve au plus bas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vache des vallons (Bestial) | 0 | 45 | 2.0 | 7.0 | 0 % | 0 % | 0 % | — | 16 | 1.7 | 84 % |
| Scarabée pollinisateur géant (Bestial) | 0 | 7 | 0.2 | 1.6 | 0 % | 0 % | 0 % | 9 % | 6 | 1.1 | 74 % |
| Poule des chaumes (Bestial) | 0 | 8 | 0.2 | 1.8 | 0 % | 0 % | 0 % | — | 8 | 1.0 | 82 % |
| Truite de courant (Bestial) | 0 | 6 | 0.1 | 1.4 | 0 % | 0 % | 0 % | — | 8 | 2.4 | 61 % |
| Aelloelle (Ranger) | 1 | 14 | 5.7 | 8.7 | 5 % | 65 % | 1 % | 10 % | 19 | 4.2 | 48 % |
| Flits (Guerrier) | 1 | 15 | 5.2 | 3.1 | 0 % | 70 % | 0 % | — | 19 | 5.3 | 47 % |
| Bulma (Pugiliste) | 1 | 18 | 5.1 | 3.0 | 47 % | 36 % | 0 % | 71 % | 15 | 3.2 | 59 % |
| Bélier des cimes (Bestial) | 1 | 38 | 4.0 | 4.7 | 0 % | 0 % | 0 % | — | 16 | 3.3 | 71 % |
| Zoro (Vagabond) | 1 | 13 | 4.0 | 2.3 | 0 % | 70 % | 0 % | — | 11 | 4.5 | 28 % |
| Haru (Guerrier) | 1 | 16 | 3.7 | 4.8 | 0 % | 0 % | 4 % | — | 14 | 2.8 | 58 % |
| Loup Gris (Bestial) | 1 | 40 | 3.1 | 4.6 | 0 % | 0 % | 0 % | — | 12 | 1.4 | 77 % |
| Loup Gris 2 (Bestial) | 1 | 40 | 2.9 | 12.7 | 0 % | 0 % | 0 % | — | 12 | 1.5 | 75 % |
| Erza (Guerrier) | 1 | 14 | 2.9 | 4.9 | 0 % | 0 % | 4 % | — | 16 | 2.5 | 61 % |
| Loup Gris 3 (Bestial) | 1 | 40 | 2.4 | 31.2 | 0 % | 0 % | 0 % | — | 12 | 1.7 | 72 % |
| Chien de troupeau (Bestial) | 1 | 22 | 1.3 | 2.7 | 0 % | 0 % | 0 % | — | 12 | 1.5 | 78 % |
| Serpent des marais (Bestial) | 1 | 14 | 1.2 | 2.8 | 0 % | 0 % | 0 % | — | 10 | 1.9 | 63 % |
| Lézard rocailleux (Bestial) | 1 | 26 | 0.9 | 4.9 | 0 % | 0 % | 0 % | — | 14 | 1.5 | 81 % |
| Neeko (Mage) | 2 | 18 | 6.2 | 2.9 | 0 % | 100 % | 0 % | — | 22 | 5.6 | 54 % |
| Hurle-Vent (Bestial) | 2 | 35 | 4.8 | 15.7 | 0 % | 0 % | 0 % | 38 % | 10 | 3.7 | 13 % |
| Serpent Fantôme (Bestial) | 2 | 25 | 2.1 | 4.5 | 0 % | 0 % | 0 % | 43 % | 10 | 2.2 | 44 % |
| Corneille Funeste (Bestial) | 2 | 3 | 0.4 | 1.2 | 0 % | 0 % | 0 % | — | 6 | 2.5 | 49 % |
| C18 (Pugiliste) | 3 | 32 | 9.8 | 3.7 | 0 % | 94 % | 0 % | — | 30 | 7.0 | 62 % |
| Vivi (Ranger) | 3 | 18 | 6.8 | 2.6 | 0 % | 99 % | 0 % | — | 17 | 5.5 | 35 % |
| Ender Kindfox (Vagabond) | 3 | 13 | 6.8 | 3.7 | 72 % | 20 % | 1 % | 23 % | 14 | 2.8 | 59 % |
| Derrieri (Pugiliste) | 3 | 33 | 5.3 | 7.5 | 0 % | 59 % | 1 % | — | 27 | 5.0 | 58 % |
| Merlin (Mage) | 7 | 35 | 11.3 | 6.8 | 0 % | 92 % | 1 % | — | 39 | 7.2 | 65 % |
| Ambre Crimson (Mage) | 15 | 69 | 11.5 | 2.0 | 100 % | 0 % | 0 % | 18 % | 69 | 0.0 | 100 % |
| Ryuuko matoi (Guerrier) | 20 | 174 | 31.6 | 5.5 | 0 % | 85 % | 0 % | — | 129 | 22.5 | 18 % |

## 6. Courbe de puissance

Ce que chaque personnage encaisse, et ce qu’un même sort inflige dans ses mains.

**Braises** s’apprend au niveau 1 ; **Boule de feu** exige Braises et le niveau 5.
Les deux colonnes montrent donc le PREMIER nœud de chacune — et ce que le scaling en
fait entre les mains d’un lanceur bien plus avancé que le sort. Un sort de bas niveau
ne cesse jamais de croître avec l’attaque de qui le lance : c’est là qu’il faut regarder.

« Coups pour le tuer » = ses points de vie divisés par ce que Boule de feu I lui ferait,
lancée par lui-même. En dessous de 3, l’initiative décide du combat ; au-dessus de 8,
on s’ennuie.

| Personnage | Niv. | PV | atk phy | atk mag | Braises I | Boule de feu I | Coups pour le tuer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Zoro | 1 | 13 | 12 | 12 | 4.0 | 20.0 | 0.7 |
| Haru | 1 | 16 | 16 | 10 | 4.0 | 19.0 | 0.8 |
| Aelloelle | 1 | 14 | 15 | 6 | 4.0 | 17.0 | 0.8 |
| Flits | 1 | 15 | 20 | 5 | 4.0 | 16.0 | 0.9 |
| Erza | 1 | 14 | 18 | 10 | 4.0 | 19.0 | 0.7 |
| Bulma | 1 | 18 | 13 | 13 | 4.0 | 21.0 | 0.9 |
| Neeko | 2 | 18 | 17 | 17 | 5.0 | 23.0 | 0.8 |
| Ender Kindfox | 3 | 13 | 14 | 21 | 5.0 | 26.0 | 0.5 |
| Vivi | 3 | 18 | 12 | 26 | 5.0 | 29.0 | 0.6 |
| Derrieri | 3 | 33 | 38 | 13 | 4.0 | 21.0 | 1.6 |
| C18 | 3 | 32 | 28 | 8 | 4.0 | 18.0 | 1.8 |
| Merlin | 7 | 35 | 21 | 67 | 7.0 | 47.0 | 0.7 |
| Ambre Crimson | 15 | 69 | 23 | 121 | 8.0 | 49.0 | 1.4 |
| Ryuuko matoi | 20 | 174 | 152 | 38 | 4.0 | 22.0 | 7.9 |
