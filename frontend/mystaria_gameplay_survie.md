# MYSTARIA — Principes de gameplay pour un JDR orienté survie/aventure

> Document compagnon de `mystaria_recap.md`, `mystaria_races.md` et `mystaria_demographie.md`. Ne propose pas un système de règles complet, mais des principes de conception pour bâtir un gameplay de survie réaliste et équilibré, ancré dans les mécaniques déjà établies de l'univers (réserve/flux, épuisement, alchimie, géographie).

---

## 1. PHILOSOPHIE GÉNÉRALE

Votre univers a déjà une règle d'or implicite pour la magie : *"La magie ne refuse rien, elle facture."* C'est le principe le plus solide sur lequel construire un gameplay de survie cohérent. L'idée centrale : **le corps ne refuse rien non plus, il facture aussi.** Faim, soif, fatigue et épuisement magique doivent suivre la même logique narrative que la magie : pas d'interdits arbitraires, des coûts progressifs et lisibles.

Trois principes transversaux à garder en tête pendant toute la conception :

1. **Réalisme calibré, pas simulationniste.** Le but est de faire ressentir la survie (peur de manquer, arbitrages difficiles, tension), pas de faire calculer des calories. Des jauges abstraites battront toujours un tableur.
2. **Jamais de mort binaire.** Comme la règle déjà posée pour l'épuisement magique total (*"≠ coma/mort, perte de connaissance de durée variable"*), la faim et la soif doivent dégrader par paliers avant de tuer, jamais d'un coup.
3. **La survie doit nourrir le roleplay, pas le remplacer.** Chaque jauge basse devrait donner au MJ une carte à jouer narrativement (hallucination, tension de groupe, décision morale), pas juste un malus chiffré froid.

---

## 2. LES JAUGES DE SURVIE ET LEUR LIEN AVEC LA MANA

### Trois jauges corporelles, séparées de la Réserve de mana

Proposition : Faim, Soif, Fatigue, distinctes du système magique (Réserve/Flux) mais qui **communiquent** avec lui, exactement comme votre lore le suggère déjà (l'épuisement magique total provoque des symptômes physiques : "sueurs froides, nausées, confusion, faim").

- **Faim** : dégrade lentement (jours), affecte l'endurance physique et, à un stade avancé, la Réserve de mana elle-même (un corps affamé peine à soutenir un flux magique).
- **Soif** : dégrade plus vite (heures à un jour ou deux selon climat), première jauge critique en zone aride ou volcanique (Royaume Abandonné, Moku'ahi).
- **Fatigue/Sommeil** : dégrade au rythme du cycle jour/nuit (26h), affecte surtout le corps (précision physique, Endurance) avant d'affecter le Flux magique.

### Le point de conception clé : la réciprocité

Un personnage qui pousse sa magie à bout (épuisement volontaire, sort ancien) devrait voir ses jauges physiques chuter plus vite pendant les heures suivantes, pas seulement sa mana. Inversement, un personnage affamé/déshydraté devrait voir son flux magique devenir instable (ratés de sort, dérive légère) avant même que sa réserve ne soit touchée. Cette réciprocité est gratuite narrativement puisqu'elle découle directement de votre Loi d'ancrage et de votre système d'épuisement déjà écrits, elle n'ajoute aucune nouvelle mécanique à justifier.

### Implémentation chiffrée (résolu)

CON fait varier la **taille du réservoir**, pas la vitesse à laquelle il se vide (cohérent avec le rôle de CON ailleurs dans le système, plutôt gouverner un pool qu'une cadence) :

```
Jauge Faim (max) = 48 + modificateur CON × 6     (base : ~12 jours d'autonomie)
Jauge Soif (max)  = 16 + modificateur CON × 2     (base : ~4 jours, ratio 3:1 avec la Faim)

Consommation Soif : −1 point par segment de journée (4 segments/jour)
Consommation Faim : −1 point par segment + 1 point supplémentaire par
   tranche de 2 points de modificateur FOR au-dessus de +2
```

Un seul tick de base (`−1/segment`) pour les deux jauges ; le ratio 3:1 vient uniquement de la taille du réservoir, pas d'une cadence séparée à retenir. Volontairement moins extrême que le ratio réel (3 jours sans eau, 3 semaines sans nourriture) pour rester jouable sur une session.

**FOR sur la Faim uniquement, pas la Soif** : la masse musculaire coûte réellement plus de calories à entretenir (environ 5-10% de plus pour un personnage très costaud, cohérent avec la physiologie réelle), mais n'a pas d'effet notable sur le besoin en eau, qui suit plutôt la corpulence globale et le climat, déjà couverts par CON. Ça ne touche concrètement que les personnages FOR mod +3 et plus (Nains de Surface, Bêtes-Humaines Canin, builds Guerrier/Pugiliste optimisés FOR), la majorité des personnages n'y voit aucune différence.

**Paliers en pourcentage du max** (le CON allonge la durée de chaque palier sans changer leurs bornes) :

| Palier | Jauge restante | Effet mécanique |
|---|---|---|
| Léger | 75-50% | Aucun effet mécanique, purement narratif |
| Modéré | 50-25% | −1 cran de précision |
| Sévère | 25-0% | −2 crans de précision, Endurance maximum réduite de 25% |
| Critique | 0% | Perte de connaissance |

**Sortie du palier critique** :
```
Durée d'inconscience = 3 segments − modificateur CON, minimum 1 segment
```

Les malus de précision réutilisent directement le système de crans (section 13), la réduction d'Endurance touche directement le pool qui paie les compétences de classe (section 15), aucune nouvelle mécanique séparée nécessaire. La sauvegarde Vigueur (CON, section 13) peut servir d'option pour rester conscient de force au palier critique plutôt que de tomber.

### Fatigue (résolu) — une dette de sommeil, pas une pression constante

Comportement différent des deux autres jauges : elle ne s'accumule que si le sommeil est sauté ou interrompu, pas en continu. Phases comptées : aube, matinée, midi, après-midi, soirée (5 phases éveillées), la nuit ne compte pas dans le calcul puisqu'elle restaure au lieu de consommer.

```
Jauge Repos (max) = 15, identique pour tous les personnages (le besoin de sommeil
ne varie pas avec la Constitution, contrairement aux réserves de Faim/Soif)

Consommation : −3 points par phase éveillée
La phase "nuit" ne consomme rien si dormie normalement, et RECHARGE la jauge à
son maximum. Si sautée/interrompue : −3 comme n'importe quelle phase, aucune
récupération.
```

Sans repos du tout, un personnage traverse ses 5 phases éveillées (−15) et touche exactement 0 en une seule journée sans dormir : une vraie nuit blanche mène à l'épuisement en ~18-20h, cohérent avec la réalité. Sous un cycle normal (repos chaque nuit), la jauge ne bouge jamais dans la durée. **Repos partiel** (tours de garde) : récupération proportionnelle au temps réellement dormi.

**Paliers fixes** (mêmes bandes de 5 pour tout le monde, CON n'étire pas le réservoir) : la Fatigue touche le corps avant la magie (physique et Endurance en premier, magie en effet secondaire mineur).

| Palier | Bande | Effet mécanique |
|---|---|---|
| Léger | 15 → 10 | Aucun effet mécanique |
| Modéré | 10 → 5 | −1 cran de précision physique |
| Sévère | 5 → 0 | −2 crans de précision physique cumulés + Endurance maximum réduite + −1 cran de gêne d'incantation (effet magique secondaire, mineur) |
| Critique | 0 | Endormissement involontaire |

**Le rôle de CON ici est différent de Faim/Soif : il n'agit pas sur la taille du réservoir (le besoin de sommeil ne varie pas avec la corpulence), mais sur la sévérité des effets et la récupération** — un personnage costaud tombe en fatigue au même rythme qu'un frêle, mais fonctionne mieux une fois fatigué et récupère plus vite d'un effondrement :

```
Malus de précision (Modéré/Sévère) : réduit de 1 cran par tranche de +2 en
   modificateur CON, jamais en dessous de −1 cran tant que le palier s'applique

Réduction d'Endurance (Sévère) : −30% de base, −2% par point de modificateur
   CON, plancher à −15% (ne disparaît jamais totalement)

Durée d'endormissement forcé (Critique) = 2 segments − modificateur CON,
   minimum 1 segment
```

Première source concrète pour "gêne d'incantation", resté non chiffré depuis la section résolution des sorts (13).


---

## 3. RYTHME TEMPOREL : PROFITER DES JOURS DE 26H

Vos journées de 26h sont un détail qui peut devenir un vrai outil de gameplay plutôt qu'une simple curiosité de worldbuilding. Suggestion : découper la journée en **4 segments narratifs** plutôt qu'en heures précises (aube/matin, après-midi, soir, nuit profonde), chaque segment consommant approximativement une unité de Faim et une unité de Soif. Ça évite le suivi horaire fastidieux tout en gardant une cohérence avec votre calendrier.

La 2h supplémentaire par rapport à un jour terrestre peut se traduire simplement par une nuit légèrement plus longue (utile pour justifier une récupération de mana un peu plus généreuse qu'un système terrestre classique) sans complexifier le calcul.

---

## 4. ASYMÉTRIE RÉGIONALE : LA GÉOGRAPHIE COMME DIFFICULTÉ NATURELLE

Vous avez déjà une géographie très différenciée. Utilisez-la comme le principal levier d'équilibrage de la difficulté de survie, plutôt que d'ajuster des chiffres abstraits :

| Région | Ce qui rend la survie difficile | Ce qui l'allège |
|---|---|---|
| Royaume Abandonné (surface) | Semi-aride, mana ambiante corrompue (risque de dérive élémentaire si eau/nourriture contaminée) | Chamanes oraux, tribus expérimentées, Dents Grises cartographient les zones dangereuses |
| États Souterrains | Pas de lumière naturelle, agriculture limitée | Température stable 14-18°C, abondance d'éclats, société très organisée |
| Archipel de la Nuit | Isolement, tempêtes | Abondance alimentaire tropicale, Gardiens Tutélaires, rite de la Tour des Îles conçu justement pour tester la survie |
| Royaume elfique | Peu concerné (société riche, Guérisseurs Nés) | Magie de Vie omniprésente |
| Luxarion | Peu concerné en ville, dangereux en zone frontalière/rurale | Infrastructure d'État |

Principe d'équilibrage : **ne complexifiez pas la survie en ville.** Réservez la pression des jauges aux zones où le lore justifie déjà un danger (zones mortes, zones corrompues, mer, montagne). Une jauge de faim qui tourne en continu pendant une scène de cour à Luxarion tue l'intérêt du système.

---

## 5. MAGIE ET ALCHIMIE COMME OUTILS DE SURVIE, PAS COMME SOLUTIONS GRATUITES

Votre système d'alchimie donne déjà des outils parfaits pour la survie (Potion de Vigueur, Soin physique, Antidote généraliste). Le principe d'équilibrage à garder : **ces outils doivent rester coûteux ou rares, jamais un simple bouton "annuler la faim".**

- Une potion de Vigueur peut repousser l'échéance d'un palier de Faim/Fatigue, mais pas l'annuler : cohérent avec votre distinction Potion (effet court) vs Élixir (effet long, change la biologie).
- Les éclats non polarisés (conteneurs de mana brute) pourraient alimenter des objets utilitaires de survie (purificateurs d'eau, chaufferettes) chez les personnages liés aux États Souterrains, cohérent avec leur philosophie "magie = technologie externalisée".

Évitez que la magie remplace complètement la gestion de survie pour les personnages éveillés : gardez un coût réel (mana, matériaux rares, temps de préparation type "3 jours non-rushables" comme votre Élixir d'éveil forcé) pour que la survie reste pertinente même pour un groupe de mages compétents.

---

## 6. ESCALADE DES CONSÉQUENCES : DES PALIERS, JAMAIS UN COUPERET

Reprenez la logique déjà posée pour l'épuisement magique (symptômes progressifs avant la perte de connaissance) et appliquez-la identiquement à la faim et à la soif. Proposition de structure à 3-4 paliers par jauge :

1. **Palier léger** : pénalité purement narrative (le MJ décrit l'inconfort), aucun malus mécanique. Sert d'avertissement.
2. **Palier modéré** : désavantage mécanique léger sur les actions physiques ou magiques (précision de flux réduite, jets désavantagés).
3. **Palier sévère** : désavantage lourd, risque de conséquences narratives fortes (hallucinations, décisions impulsives, vulnérabilité à la corruption élémentaire si en zone à mana instable).
4. **Palier critique** : perte de connaissance ou dommage permanent limité (jamais mort instantanée), récupérable avec soin/repos adapté, dans l'esprit de votre règle existante sur l'épuisement total.

Cette structure évite le piège classique des jeux de survie mal calibrés : soit la faim ne compte jamais, soit elle tue en un tour sans préavis. Les deux cassent le roleplay.

---

## 7. VARIATIONS RACIALES : UN LEVIER D'ÉQUILIBRAGE GRATUIT

Vos fiches raciales donnent déjà des bases idéales pour différencier la survie sans inventer de nouvelles règles :

- **Elfes** : biologie liée à la Vie, dégradation des jauges plus lente mais pas nulle (cohérent avec l'absence de vieillissement mais pas d'invulnérabilité). Un elfe insulaire de l'Archipel, coupé de l'Arbre, pourrait avoir un rapport différent à l'effort physique intense de survie que ses cousins continentaux.
- **Nains souterrains** : parfaitement adaptés à leur environnement stable (température, obscurité), mais désorientés et plus vulnérables à la faim/soif en surface, en particulier sous un soleil ou une chaleur qu'ils ne maîtrisent pas culturellement.
- **Nains des montagnes** : l'inverse, à l'aise en extérieur/altitude, moins en milieu souterrain profond.
- **Bêtes-Humains** : variation par tribu plutôt que par race entière, cohérent avec votre lore (bias Terre/Feu au Royaume Abandonné = résistance à la chaleur et à l'aridité ; bias Eau/Air à l'Archipel = aisance en mer). C'est probablement la race la plus avantagée mécaniquement en survie pure, ce qui est cohérent avec leur statut culturel dans ces deux régions.
- **Humains** : le profil de référence neutre, sans bonus ni malus, cohérent avec leur rôle déjà établi de "race la plus neutre" pour vos statistiques.

Principe d'équilibrage : n'accordez pas de bonus de survie basés sur la race seule, mais sur la **combinaison race + origine régionale**, exactement comme vous l'avez déjà fait pour les affinités magiques. Un elfe insulaire et un elfe continental ne devraient pas avoir le même profil de survie.

---

## 8. OUTILS CONCRETS POUR LE MJ

Quelques mécaniques prêtes à décliner selon le système de dés que vous utilisez déjà (à adapter, pas à copier tel quel) :

- **Checks de survie peu fréquents, à fort enjeu narratif** plutôt que des jets répétitifs à chaque scène. Un jet par segment de journée (voir section 3) suffit largement.
- **Un seul jet couvre plusieurs jauges à la fois** (ex : un jet "d'endurance" qui influence Faim/Soif/Fatigue simultanément selon le contexte) pour éviter la lourdeur de gestion pendant une session.
- **Table de complications** liée aux zones dangereuses de votre lore plutôt qu'à un tableau générique : un personnage affamé en zone corrompue du Royaume Abandonné risque une complication différente (début de dérive élémentaire) qu'un personnage affamé à l'Archipel (simple épuisement).
- **Récupération liée aux rituels culturels déjà existants** : un repas partagé chez les tribus du Royaume Abandonné, un moment de méditation façon Tour des Îles à l'Archipel, un accès à un temple pour un elfe. Ça ancre la mécanique dans le roleplay plutôt que dans un simple "repos long" générique.

---

## 9. PRINCIPES ANTI-FRUSTRATION (résumé)

- Ne jamais faire mourir un personnage de faim ou de soif sans plusieurs paliers d'avertissement clairs et joués.
- Ne jamais faire porter la gestion de survie sur des scènes urbaines ou sociales où ça n'apporte rien.
- Toujours donner un coût réel à la solution magique, jamais une solution gratuite qui rend la mécanique de survie caduque pour les mages.
- Utiliser la géographie et les races déjà écrites comme source de variété plutôt que d'inventer un système de stats supplémentaire.
- Garder la faim/soif/fatigue lisibles en 3-4 paliers maximum : au-delà, le suivi devient un fardeau administratif plus qu'un outil de tension.

---

## 10. ATTRIBUTS CLASSIQUES ET SURVIE

Principe tranché : **CON et DEX restent totalement indépendants de la magie.** La Résonance/affinité magique reste fixée à la naissance et gouvernée par ses propres règles (Réserve, Flux), les attributs physiques n'influencent ni l'une ni l'autre. Ça garde une séparation nette entre "qui on est physiquement" et "à quel dieu on résonne", cohérent avec la Loi de résonance déjà écrite. Un guerrier baraqué et un archimage chétif peuvent avoir exactement la même Réserve et le même Flux, seule leur magie diverge.

Référence : score **10 = humain banal, sans entraînement particulier**. Modificateur classique `(score-10)/2` arrondi vers le bas.

### FOR (Force) — portage et effort brut

Aucun lien avec la magie dans votre lore, purement physique : portage, nage à contre-courant, dégâts de mêlée, défoncer un obstacle. Table de portage détaillée ci-dessous.

| STR | Mod | Port prolongé (sans pénalité) | Marche forcée (avec Fatigue) | Soulèvement bref (max) |
|---|---|---|---|---|
| 6 | -2 | ~9 kg | ~15 kg | ~50 kg |
| 8 | -1 | ~11 kg | ~18 kg | ~57 kg |
| **10** | **0** | **~13 kg** | **~23 kg** | **~70 kg** |
| 12 | +1 | ~15 kg | ~26 kg | ~80 kg |
| 14 | +2 | ~17 kg | ~30 kg | ~92 kg |
| 16 | +3 | ~20 kg | ~34 kg | ~105 kg |
| 18 | +4 | ~23 kg | ~40 kg | ~120 kg |
| 20 | +5 | ~26 kg | ~46 kg | ~140 kg |

Pour un score au-delà de 20 (rare, quasi surhumain), mieux vaut le justifier par un Don latent (Le Sismique, par exemple, pourrait avoir une synergie narrative avec la force brute sans que ce soit une règle mécanique automatique) ou une magie de Terre/renforcement, plutôt que par un score brut toujours plus haut. Ça garde le plafond réaliste tout en laissant une porte héroïque cohérente avec vos règles.

### CON (Constitution) — pivot de la survie

L'attribut le plus central du système de survie, et strictement indépendant de la Réserve magique. Un CON élevé :
- Ralentit la dégradation des jauges Faim/Soif/Fatigue (repousse le passage au palier suivant).
- Améliore la résistance aux maladies, poisons et à la mana ambiante corrompue du Royaume Abandonné.
- Réduit le risque de bascule vers la **corruption élémentaire** en cas d'exposition prolongée à une zone de mana instable.
- Conditionne la vitesse de récupération après un palier critique (proche de la logique déjà posée pour l'épuisement magique total : *"perte de connaissance de durée variable"*, un CON élevé raccourcit cette durée côté physique).

### DEX (Dextérité) — évitement et finesse

Également indépendante de la magie (donc pas de lien avec le Flux malgré la tentation narrative). Gouverne : évitement de danger physique (chute, faune, terrain difficile), discrétion (chasse, échapper à une patrouille ou un prédateur), précision au tir. C'est l'attribut naturel pour représenter le bonus culturel déjà écrit des elfes chasseurs-archers insulaires.

### INT (Intelligence) — savoir de survie

Identification de plantes/minéraux (comestible vs toxique), orientation, connaissance des zones déjà cartographiées par les Dents Grises ou les Chercheurs d'Ancien Art, théorie alchimique. Réduit concrètement le risque d'erreur sur une recette à préparation stricte comme l'Élixir d'éveil forcé (ordre des ingrédients, timing sur 3 jours).

### SAG (Sagesse) — instinct

Perception d'un danger avant qu'il ne se déclare, lecture d'un changement anormal de faune/météo, détection d'une zone morte ou d'un Réveil partiel avant d'y être exposé sans le savoir. Attribut naturel pour représenter une sensibilité à un Don latent non encore révélé chez soi ou un allié.

### CHA (Charisme) — cohésion et statut social

Gestion d'un groupe au bord du palier critique (éviter la panique collective), négociation avec une tribu ou une guilde marchande, influence sur les PNJ. Important : le Charisme ne doit jamais effacer un statut légal ou social déjà établi dans le lore (un Bête-Humain charismatique reste juridiquement esclave à Luxarion). Cette limite est volontairement une source de tension de jeu plutôt qu'un problème à corriger mécaniquement.

---

## 11. FICHES RACIALES OFFICIELLES (données de jeu)

Données de création de personnage transcrites depuis les fiches validées. Remplace la proposition spéculative de la version précédente de ce document.

### Nains

**Modificateurs d'attributs de base** : +1 FOR, +2 CON
**Bonus de départ** : +15 PV, +15 Endurance, +10 Attaque physique, +2 Attaque magique, +3 Mana, +5 Vitesse
**Aptitude raciale** : Robustesse (+5 Défense physique)

| Sous-race | Attributs | Traits additionnels |
|---|---|---|
| Nain des Profondeurs | -2 FOR, +1 INT, +1 SAG | Vision dans le noir (voit dans l'obscurité totale) |
| Nain de Surface | +1 FOR, +1 CON, -2 SAG | — |

### Elfes

**Modificateurs d'attributs de base** : +1 INT, +2 SAG
**Bonus de départ** : +8 PV, +4 Endurance, +3 Attaque physique, +12 Attaque magique, +15 Mana, +8 Vitesse
**Aptitudes raciales** : Affinité Arcanique (magies élémentaires débloquées au départ) + Protection Magique (+5 Défense magique)

| Sous-race | Attributs | Traits additionnels |
|---|---|---|
| Elfe Continental | -1 CON, +1 INT | — |
| Elfe des Îles | +1 DEX, -1 INT | — |

### Race 3 (identité à confirmer, "Amphibie")

**Modificateurs d'attributs de base** : non renseignés sur la fiche source (aucune section visible)
**Bonus de départ** : +8 PV, +11 Endurance, +8 Attaque physique, +8 Attaque magique, +8 Mana, +7 Vitesse
**Aptitude raciale** : Amphibie (respire sous l'eau et sur terre)

| Spécialisation | Attributs |
|---|---|
| Défensive | -1 DEX, +2 CON |
| Offensive | +1 FOR, +1 DEX, -1 SAG |
| Mobile | +2 DEX, -1 CON |
| Sensorielle | +2 SAG |
| Magique | -1 FOR, +1 INT, +1 SAG |

### Bêtes-Humains

**Modificateurs d'attributs de base** : +1 DEX, +1 CON
**Bonus de départ** : +8 PV, +14 Endurance, +14 Attaque physique, +2 Attaque magique, +2 Mana, +10 Vitesse
**Aptitude raciale** : aucune renseignée

| Sous-race (forme) | Attributs |
|---|---|
| Aviaire | +1 DEX, -1 CON, +1 SAG |
| Canin | +1 FOR |
| Félin | +1 DEX, -1 INT, +1 CHA |
| Reptilien | +1 CON |

### Humains

**Modificateurs d'attributs de base** : +1 FOR, +1 DEX, +1 CON, +1 INT, +1 SAG, +1 CHA
**Bonus de départ** : +9 PV, +8 Attaque physique, +8 Attaque magique, +9 Endurance, +8 Mana, +8 Vitesse
**Aptitude raciale** : aucune renseignée
**Sous-races** : aucune renseignée

---

## 12. AUDIT D'ÉQUILIBRAGE

### A. Budget "Bonus de départ" (PV/Endurance/AtqPhys/AtqMag/Mana/Vitesse)

| Race | Somme |
|---|---|
| Nains | 15+15+10+2+3+5 = **50** |
| Elfes | 8+4+3+12+15+8 = **50** |
| Race 3 (Amphibie) | 8+11+8+8+8+7 = **50** |
| Bêtes-Humains | 8+14+14+2+2+10 = **50** |
| Humains | 9+8+8+9+8+8 = **50** |

**Constat : cette partie est parfaitement équilibrée.** Budget fixe de 50 points respecté sur les 5 races, réparti différemment selon le profil (Nains = tank physique, Elfes = caster pur, Bêtes-Humains = DPS physique/endurance, Amphibie et Humains = profils plats). Aucun problème ici.

### B. Budget "Modificateurs d'attributs" (somme des 6 stats, base + sous-race/spécialisation)

| Build final | FOR | DEX | CON | INT | SAG | CHA | **Total** |
|---|---|---|---|---|---|---|---|
| Nain des Profondeurs | -1 | 0 | +2 | +1 | +1 | 0 | **3** |
| Nain de Surface | +2 | 0 | +3 | 0 | -2 | 0 | **3** |
| Elfe Continental | 0 | 0 | -1 | +2 | +2 | 0 | **3** |
| Elfe des Îles | 0 | +1 | 0 | 0 | +2 | 0 | **3** |
| Bête-Humaine Aviaire | 0 | +2 | 0 | 0 | +1 | 0 | **3** |
| Bête-Humaine Canin | +1 | +1 | +1 | 0 | 0 | 0 | **3** |
| Bête-Humaine Félin | 0 | +2 | +1 | -1 | 0 | +1 | **3** |
| Bête-Humaine Reptilien | 0 | +1 | +2 | 0 | 0 | 0 | **3** |
| Amphibie Défensive | 0 | -1 | +2 | 0 | 0 | 0 | **1** |
| Amphibie Offensive | +1 | +1 | 0 | 0 | -1 | 0 | **1** |
| Amphibie Mobile | 0 | +2 | -1 | 0 | 0 | 0 | **1** |
| Amphibie Sensorielle | 0 | 0 | 0 | 0 | +2 | 0 | **2** |
| Amphibie Magique | -1 | 0 | 0 | +1 | +1 | 0 | **1** |
| **Humains** | +1 | +1 | +1 | +1 | +1 | +1 | **6** |

**Constat : cette partie n'est pas équilibrée.** L'écart va de 1 à 6 selon la race, soit un facteur x6 entre le build le plus faible (Amphibie Défensive/Offensive/Mobile/Magique, +1) et le plus fort (Humains, +6). Elfe Continental est désormais corrigé (le +1 SAG en trop a été retiré), il suit le même total à somme nulle (3) que Nains et Bêtes-Humains, cette partie du problème est résolue.

### C. Aptitudes raciales (traits hors budget des 50 points)

| Race | Nombre de traits | Nature |
|---|---|---|
| Nains | 1 (+ 1 pour Profondeurs seulement) | Robustesse = +5 stat combat ; Vision dans le noir = utilitaire, réservé à une seule sous-race |
| Elfes | 2 | Affinité Arcanique = déblocage d'un système entier (magie élémentaire) ; Protection Magique = +5 stat combat |
| Amphibie | 1 | Utilitaire pur (respiration), aucun bonus combat |
| Bêtes-Humains | 0 | — |
| Humains | 0 | — |

---

## 13. SYSTÈME DE RÉSOLUTION (jets d'attaque)

Base : **d20 à seuil mobile**, pas un d20 classique où le modificateur s'ajoute au dé. Le dé se lit brut, c'est le **seuil à atteindre** qui descend avec la compétence.

### Formules

```
précision = modificateur d'attribut × 4 − esquive naturelle de la cible − gêne de tir
seuil = 8 − (précision / 5, arrondi une seule fois à la fin) − crans de maîtrise
         borné entre 3 et 18
```

- La maîtrise s'ajoute **directement en crans** (pas convertie via l'échelle /5) : un palier de maîtrise = 1 cran = 5 points de pourcentage, toujours.
- `atk_phy`/`atk_mag` (les stats raciales déjà fichées) n'entrent **pas** dans la précision, elles pilotent uniquement les dégâts.
- Défense (physique/magique) et précision sont étanches : la défense ne change jamais le seuil, elle réduit ce que le coup coûte une fois qu'il touche.

### Esquive naturelle (résolu)

```
esquive naturelle = Vitesse ÷ 10
```

Modeste par construction (2 points à Vitesse 20, 4 à Vitesse 40, soit moins d'un cran isolé). C'est pour ça qu'elle s'ajoute au terme fin de la précision avant l'arrondi unique : arrondie seule, elle ne pèserait jamais rien.

**Esquive accordée par un buff** (Camouflage 40%, Disparition 75%) : mécanique différente, un **effacement** plutôt qu'une gêne. Se teste *avant* le jet d'attaque et l'emporte dessus s'il réussit (la cible n'est simplement pas visée). Les buffs d'effacement ne se cumulent pas entre eux, seul le meilleur compte.

### Maîtrise

```
maîtrise = 2 + ⌊(niveau − 1) / 4⌋
```

| Niveau | 1-4 | 5-8 | 9-12 | 13-16 | 17-20 |
|---|---|---|---|---|---|
| Maîtrise | 2 | 3 | 4 | 5 | 6 |

Conditionnelle à la maîtrise de l'arme par la classe (`weaponProficiencies`/`extraWeaponProficiencies`). Ne s'applique jamais à une arme non maîtrisée. S'applique aussi aux jets de sauvegarde. Même courbe pour le bestiaire, indexée sur le FP : `2 + ⌊FP/4⌋`.

### Degrés de réussite (jet de d20 brut vs seuil)

| d20 | Résultat | Dégâts |
|---|---|---|
| 1 | Raté (toujours) | 0 |
| < seuil − 5 | Raté | 0 |
| seuil − 5 à seuil − 1 | Effleure | ÷4 |
| ≥ seuil | Touche | pleins |
| 20 | Critique (toujours) | ×1,5 |

### Attribut selon l'arme/capacité (`attackAttribute`)

| Arme/capacité | Vise à |
|---|---|
| Rapière, dague, katana, arcs, fouet | Dextérité |
| Hache de bataille, claymore, marteau | Force |
| Bâton | Sagesse |
| Sorts (règle générale) | Intelligence |
| Compétence physique (règle générale) | Force |

### Tir gêné (`gêne de tir`, résolu)

Une arme à projectile servie trop près de sa cible perd **25 points de précision (5 crans)** : seuil 8+ → 13+, environ moitié moins de dégâts espérés. Pénalité de précision plutôt que division des dégâts, délibérément : un DEX élevé (×4 dans le calcul) en éponge une partie, ce qu'une simple division fixe ne permettrait pas.

Zone minimale (distance en cases en-deçà de laquelle le malus s'applique) :

| Arme | Zone gênée |
|---|---|
| Arc court | 2 cases |
| Arc long | 3 cases |
| Arbalète | 1 case |
| Fronde | 1 case |

### Catégories d'armure

| Catégorie | Contenu | S'apprend ? |
|---|---|---|
| Vêtements | Toile, laine, soie | Non |
| Légère | Cuir souple, cuir bouilli, fourrure | Oui |
| Intermédiaire | Gambison, cuir clouté, écailles | Oui |
| Lourde | Cotte de mailles, plaques | Oui |
| Bouclier | Rondache, écu, pavois | Oui |

### Maîtrise d'armure (effet sur les jets)

Deux effets distincts pour une armure portée sans maîtrise, sans jamais toucher à la précision de l'attaquant qui vise le porteur (respecte l'étanchéité précision/défense déjà posée) :

**Défense réduite** (toutes catégories) :
```
Défense effective = Défense nominale × (1,0 si maîtrisée, 0,5 si non maîtrisée)
```

**Gêne de précision du porteur** (pénalise ses propres jets d'attaque, pas ceux dirigés contre lui), graduée par catégorie :

| Catégorie | Gêne si non maîtrisée |
|---|---|
| Vêtements | Aucune |
| Légère | −1 cran (−5%) |
| Intermédiaire | −2 crans (−10%) |
| Lourde | −3 crans (−15%) |
| Bouclier | −1 cran (−5%) |

Additif si plusieurs pièces non maîtrisées sont portées simultanément.

### Résolution des sorts (système actuel confirmé)

**Précision** : réutilise le moteur existant (section 13), sans nouvelle table.

```
précision_sort = modificateur d'Intelligence × 4 − résistance magique de la cible − gêne d'incantation
seuil = 8 − (précision_sort / 5, arrondi une fois) − maîtrise      borné 3 à 18
```

Maîtrise toujours pleine pour un sort (déjà écrit : *"ses propres sorts"* maîtrisés d'office). "Résistance magique de la cible" reste non chiffrée. "Gêne d'incantation" a désormais une première source concrète (paliers de Fatigue, section 2), mais pas encore de valeur de base hors circonstance (l'équivalent d'un "sans aucun malus" de départ, comme la portée l'est pour la gêne de tir).

**Coût** : payé au lancer, indépendamment du résultat du jet (cohérent avec *"la magie ne refuse rien, elle facture"*).

**Attaque magique** : pur multiplicateur de dégâts, comme Attaque physique. N'a aucun effet sur l'incantation, la précision ou la cadence de sort. Donnée par la classe (le Mage en reçoit plus, par exemple), pas un attribut calculé.

**Branches de sorts** : choix de build libre du joueur (ex : Braises Incandescentes = plus cher/plus fort, Braises Économes = moins cher/stagne), déconnectées de toute mécanique de Flux. Un arbre global par domaine débloque les sorts via points d'inspiration, chaque sort a ensuite son propre arbre de progression interne.

**Constat** : dans ce système tel qu'il existe, rien ne représente mécaniquement le Flux décrit dans le lore (*"petite réserve/grand flux = un coup dévastateur puis rien"*). Voir la piste alternative ci-dessous.

---

### PISTE ALTERNATIVE (exploration, non adoptée) : le Flux comme troisième statistique indépendante

Objectif : représenter mécaniquement le Flux sans toucher à Attaque magique (dégâts, intact) ni à Mana (réserve, intact) ni aux branches (build libre, intact). Rôle unique du Flux : plafonner le Mana dépensable en une seule action.

**Attribution** : profil choisi à la création, 3 archétypes fixes.

| Profil | Plafond de base (niveau 1) |
|---|---|
| Endurant (grande réserve, petit flux) | 20% de la Réserve max |
| Équilibré | 35% de la Réserve max |
| Explosif (petite réserve, grand flux) | 70% de la Réserve max |

**Progression** : deux canaux distincts, cohérents avec *"le Flux s'entraîne lentement, années/décennies"*.

1. **Croissance passive par niveau** : `+1% par niveau`, flat, identique pour les 3 profils (préserve l'écart relatif entre eux sur toute la carrière : 15 points d'écart Endurant/Équilibré, 35 points Équilibré/Explosif, constants du niveau 1 au niveau 20).
2. **Entraînement spécifique (déblocable, pas automatique)** : une formation dédiée (mentor, guilde, temple), disponible une fois par palier de maîtrise (donc jusqu'à 5 fois sur une carrière complète, aux mêmes seuils que la table de maîtrise : niveaux 1, 5, 9, 13, 17). Chaque formation réussie donne **+5% permanent**, cumulable, jusqu'à +25% en tout si le personnage poursuit les 5. Coûte du temps de jeu et un accès narratif (pas un simple point de compétence), cohérent avec le côté "années/décennies" du lore plutôt qu'une progression automatique.

**Exemple, personnage Explosif, niveau 20, ayant fait 3 formations sur 5** :
`70% (base) + 19% (croissance passive, +1%×19) + 15% (3 formations × 5%) = 104%`, borné à 100% (peut dépenser toute sa réserve en une action, plafond atteint).

**Exemple, personnage Endurant, même niveau, 0 formation** :
`20% + 19% = 39%` : toujours incapable de lancer un très gros sort d'un coup même en fin de carrière, sauf à investir dans les formations, ce qui est le levier de rattrapage volontaire.

**Statut** : ceci est une proposition de système alternatif, pas encore intégrée à votre implémentation actuelle. À valider avant de la brancher sur le reste (calibrage des coûts de branches, formule de croissance de Mana, etc.).

### Cast instantané vs canalisation (mécanique de résolution)

```
Pour un sort de coût plein C, personnage au plafond P (Flux) :

Si P ≥ C : cast instantané, 1 tour, 100% de l'effet, coût C.

Si P < C : le joueur engage la canalisation.
  - Chaque tour : investit jusqu'à P mana (payé immédiatement, non remboursable).
  - À tout moment, il peut choisir de LIBÉRER volontairement :
    ratio = mana total investi / C  →  effet à ce ratio (voir tableau ci-dessous).
  - S'il encaisse un coup AVANT d'avoir choisi de libérer :
    le sort est annulé, mana perdu, aucun effet.
  - S'il atteint C sans interruption : résolution automatique à 100%.
```

Crée une décision à chaque tour de canalisation (continuer = plus d'effet en jeu mais tout perdu si touché / libérer = moins d'effet mais garanti), plutôt qu'un simple compte à rebours passif.

**Généralisation par type de sort** : le ratio ne s'applique pas toujours aux dégâts, tous les sorts n'en infligent pas.

| Type de sort | Exemple | Ce que le ratio réduit |
|---|---|---|
| Dégâts | Boule de feu | % des dégâts |
| Statut opposé | Peur, Charme, Paralysie | % de la **sévérité** utilisée dans le jet de sauvegarde de la cible (`sévérité effective = sévérité nominale × ratio`) |
| Utilitaire scalable | Luciole (durée/rayon), Communication avec les morts (durée du contact) | % de la durée, portée ou rayon défini par le sort |
| Utilitaire binaire | Effet tout-ou-rien (ouvrir un passage précis) | Pas de version partielle : canalisation complète obligatoire, ou rien. L'interruption reste possible (perte totale). |

Chaque sort doit donc porter une donnée indiquant sa grandeur scalable (dégâts / sévérité / durée-portée / aucune), au même titre qu'il porte déjà un `attackAttribute`.

**Non résolu** : le déclencheur exact de l'interruption ("encaisser un coup") doit inclure ou non un Effleure (dégâts ÷4, techniquement une touche). Par défaut proposé : toute attaque infligeant des dégâts interrompt, Effleure inclus.


### Jets de sauvegarde

Même moteur que le jet de toucher, rôles inversés : le personnage qui subit l'effet lance le d20 contre un seuil qui descend avec son attribut pertinent et sa maîtrise.

```
résistance = modificateur d'attribut pertinent × 4 − sévérité de la source
seuil = 8 − (résistance / 5, arrondi une fois) − maîtrise      borné 3 à 18
```

| Catégorie | Attribut | Couvre |
|---|---|---|
| Vigueur | CON | Poison, maladie, épuisement, corruption élémentaire |
| Réflexes | DEX | Pièges, effets de zone, esquive physique d'un danger |
| Volonté | SAG | Peur, charme, illusion, domination mentale |

Sévérité de la source, calquée sur les paliers de coût de sort déjà établis :

| Sévérité | Valeur |
|---|---|
| Mineure | 4 |
| Intermédiaire | 8 |
| Majeure | 12 |
| Extrême | 16+ |

Degrés de résultat, table existante réutilisée sens inversé (le défenseur veut un résultat haut) :

| d20 | Résultat |
|---|---|
| 1 | Échec total (toujours) |
| < seuil − 5 | Échec, effet plein |
| seuil − 5 à seuil − 1 | Résistance partielle, effet à moitié |
| ≥ seuil | Résiste, effet négé |
| 20 | Résistance critique (toujours) |

**Non résolu** : valeurs de sévérité pas encore calibrées sur des cas réels de jeu (poisons/effets spécifiques de vos monstres/alchimie), seulement calées sur l'échelle de coût des sorts par cohérence de tiers.



### Points explicitement non résolus par le système actuel

- ~~La maîtrise d'armure ne pèse sur aucun jet~~ : résolu (Défense ×0,5 si non maîtrisée + gêne de précision graduée par catégorie, voir section 13).
- ~~"Gêne de tir"~~ et ~~"esquive naturelle"~~ : résolues (section 13). **La formule de précision physique est maintenant complète de bout en bout.** "Gêne d'incantation" a une première source (Fatigue, section 2) mais pas de valeur de base hors circonstance. "Résistance magique de la cible" reste entièrement non chiffrée.
- **Jets de sauvegarde** : formule posée (voir ci-dessus), mais les valeurs de sévérité par source concrète (poisons/effets d'alchimie/monstres) restent à calibrer cas par cas.
- **Formule de croissance par niveau pour Mana et Attaque magique** : les "Bonus de départ" raciaux sont des valeurs fixes de niveau 1, pas encore reliées à une progression. Nécessaire pour calibrer les branches de sorts et, si adoptée, la piste alternative du Flux.



## 14. PROGRESSION PAR NIVEAU (CLASSES)

Mécanisme confirmé (remplace le thread "formule de croissance" resté ouvert jusqu'ici) : à chaque niveau, **chaque stat gagne `1d(valeur de classe) + modificateur d'attribut correspondant`**. Le dé de classe s'applique dès le niveau 1 (base raciale + premier jet de classe), donc une carrière complète = 20 tirages par stat. Correspondances : FOR → atk_phy, CON → hp, DEX → vitesse, INT/SAG → atk_mag/mana (à préciser lequel gouverne quoi si les deux sont utilisés).

### Dés de classe (`stats` de `classes.json`)

| Classe | HP | Endurance | Atk phy | Atk mag | Mana | Vitesse |
|---|---|---|---|---|---|---|
| Guerrier | d10 | d7 | d8 | d2 | d3 | d5 |
| Mage | d5 | d5 | d3 | d8 | d8 | d6 |
| Ranger | d6 | d5 | d6 | d6 | d6 | d6 |
| Vagabond | d5 | d4 | d6 | d4 | d6 | d10 |
| Pugiliste | d8 | d6 | d10 | d2 | d2 | d7 |

### Filet de sécurité (décidé : rattrapage dynamique)

Trois briques, dans l'ordre où elles s'appliquent à chaque montée de niveau :

1. **Minimum garanti** : le résultat d'un jet ne peut jamais être inférieur à `⌈valeur de classe / 4⌉` (le plancher dur).
2. **Détection de retard** : à chaque montée de niveau, on compare le total cumulé du personnage à sa trajectoire attendue :
   ```
   attendu(niveau) = base raciale + (niveau − 1) × moyenne du dé de classe + attribut × niveau
   seuil de retard = attendu(niveau) − 1 écart-type cumulé
   ```
3. **Jet en avantage conditionnel** : si le total actuel est sous ce seuil, le jet de ce niveau se fait en avantage (2 dés, garde le meilleur, plancher dur toujours actif). Sinon, jet simple avec plancher dur seul (pas de relance systématique des 1, le plancher suffit).

**Validé par simulation** (Monte Carlo, 200 000 tirages, cas de test : Guerrier atk_phy d8, niveau 20) : le minimum et le maximum théoriques (108 et 228) restent strictement identiques quel que soit le système choisi, seule la moyenne bouge. Le système dynamique donne une moyenne quasi identique au filet simple (~169 contre ~167), contre ~185 pour un avantage permanent qui aurait demandé de tout recalibrer. Il ne s'écarte du système simple que pour les personnages qui décrochent réellement, ce qui est le comportement recherché.

**Paramètres à retester en jeu, pas encore validés empiriquement** : le seuil de déclenchement (1 écart-type, choisi comme point de départ raisonnable, pas démontré optimal) et la fréquence réelle de déclenchement à la table.

**Coût d'implémentation à noter** : contrairement à une règle calendaire (ex. "avantage tous les 5 niveaux"), ce système demande de garder en mémoire la trajectoire attendue et l'écart-type cumulé du personnage à chaque montée de niveau, pas juste son numéro de niveau actuel.

### Valeurs de référence pour le calibrage (moyenne avec filet de sécurité)

| Dé | Moyenne brute | Moyenne avec filet dynamique | Pire cas absolu (rare) |
|---|---|---|---|
| d2 | 1,5 | ~1,75 | 1 |
| d3 | 2,0 | ~2,3 | 1 |
| d4 | 2,5 | ~2,9 | 1 |
| d5 | 3,0 | ~3,4 | 2 |
| d6 | 3,5 | ~3,9 | 2 |
| d7 | 4,0 | ~4,4 | 2 |
| d8 | 4,5 | ~4,9 | 2 |
| d10 | 5,5 | ~6,0 | 3 |

**À utiliser pour tout calibrage désormais** : coût des branches de sorts, plafond de Flux (si adopté), sévérités de sauvegarde. Exemple : un Elfe Mage (base raciale Mana 15) atteint en moyenne ~15 + 20×4,9 ≈ 113 Mana en fin de carrière, avant même le modificateur d'attribut cumulé sur 20 niveaux. C'est cet ordre de grandeur qui doit servir de référence, pas les valeurs illustratives (~15-40) utilisées plus haut dans ce document avant que cette formule ne soit connue.

**Non résolu** : quel attribut gouverne précisément atk_mag vs mana (INT pour les deux ? un pour chaque ?), et si le modificateur d'attribut est recalculé à chaque niveau ou figé à la création.

## 15. COMPÉTENCES DE CLASSE (REWORK)

Principe directeur, tranché : les compétences de classe (coût Endurance) ne sont **jamais** de la magie elle-même, quelle que soit la classe. Elles manipulent des mécaniques déjà existantes dans ce document (maîtrise, gêne d'armure, Flux, Réserve, effacement, résonance) plutôt que de produire des ratios de dégâts génériques et redondants. La magie par domaine (coût Mana, arbre de sorts) reste un système entièrement séparé.

Diagnostic de départ sur les 40 capacités d'origine : ~10 sont un buff de stats sur soi interchangeable, le Vagabond a 3 versions quasi identiques d'esquive en pourcentage (dont une qui régresse par rapport à une capacité de niveau inférieur), et aucune capacité n'était ancrée dans le lore existant.

**Correction de méthode (important)** : une première tentative de faire scaler *toutes* les compétences sur un système de dés-par-palier (1 à 5 dés, façon maîtrise) s'est révélée mathématiquement insuffisante à la vérification : l'attaque de base grimpe chaque niveau via le dé de classe, un système à 5 paliers fixes ne peut pas suivre ce rythme sur 20 niveaux, même avec le plus gros dé standard. **Seules les compétences qui scalaient sur un attribut brut figé (tout le kit Vagabond, Second souffle, Méditation) ont réellement besoin d'un correctif** ; Guerrier, Ranger et la majorité du Pugiliste scalaient déjà sur atk_phy/atk_mag, qui grossit très bien seul, il ne fallait pas y toucher. Le correctif retenu : remplacer l'attribut brut par la **valeur attendue** de la stat correspondante à ce niveau (`attendu(niveau)`, la même formule déterministe déjà écrite pour le filet de sécurité dynamique section 14), en gardant une structure ratio × stat, pas un système de dés séparé. Vol à la tire et Transfusion de mana gardent leur système de dés-par-palier propre : ils ne sont pas en concurrence avec l'attaque de base, le problème ne les concerne pas.

### Mage — maîtrise du corps qui porte la magie, jamais un nouveau sort

| Niveau | Compétence | Remplace | Principe |
|---|---|---|---|
| 1 | Trait du bâton | Trait élémentaire | Technique de canalisation via le bâton, équivalent Mage de Frappe puissante |
| 3 | Absorption ambiante | Méditation | Puise la mana ambiante pour recharger plus vite (lore section 4, ne change pas la taille de la Réserve) |
| 5 | Chant des noms honorifiques | Incantation | Rituel vocal qui prime le prochain sort de l'arbre de domaine (pont Endurance → Mana) |
| 9 | Transfusion de mana | Mémoire arcanique | Voir formule dédiée ci-dessous |
| 14 | Discipline du Flux | Flux maîtrisé | Déclencheur narratif de l'entraînement spécifique déjà défini dans la piste Flux (+5% de plafond permanent) |
| 20 | Corps sans limite | Archimage | Capstone : canaliser au-delà du plafond de Flux sans jamais perdre le sort si interrompu |

**Transfusion de mana** (niveau 9, remplace Écho de canal) :

```
Coût : 10 Endurance (fixe, le geste) + montant brut transféré (en Mana, prélevé sur la Réserve du lanceur)
Montant brut = Σ(dés du palier de niveau, dé de base d6)
Montant reçu par la cible = montant brut × taux de transfert du palier (arrondi)
```

| Niveau | 1-4 | 5-8 | 9-12 | 13-16 | 17-20 |
|---|---|---|---|---|---|
| Dés (d6) | 1 | 2 | 3 | 4 | 5 |
| Taux de transfert | 50% | 60% | 70% | 80% | 90% |

Le montant brut part intégralement de la Réserve du lanceur, la perte en transit est la "facture" de la technique (cohérent avec *"la magie ne refuse rien, elle facture"*). **Si la piste Flux est adoptée**, le montant brut transférable par action devrait aussi respecter le plafond de Flux du lanceur, comme n'importe quelle dépense de Mana en une action.

### Ranger — fréquences résiduelles et faune du bestiaire

| Niveau | Compétence | Remplace | Principe |
|---|---|---|---|
| 1 | Tir précis | — (inchangé) | Technique de combat pure |
| 3 | Lecture des fréquences | Pister | Renommage seul : la mécanique ("mana résiduelle") était déjà juste, le nom manquait |
| 5 | Flèche empoisonnée | — (inchangé) | Technique d'alchimiste mondaine |
| 8 | Compagnon animal | — (à ancrer) | **Non résolu** : quelle créature du bestiaire (Vuhn, Sylvok, Spectre Lié, Manthrope, Gardien de Mahina) selon l'origine du Ranger ? Fiches non fournies. |
| 11 | Tir multiple | — (inchangé) | Technique de combat pure |
| 14 | Camouflage | — (inchangé) | Différent de la version Vagabond : exige terrain naturel + immobilité, camouflage physique pas Ténèbres |
| 17 | Écho lointain | Œil du faucon | Détecte à distance une zone morte / Réveil partiel / embuscade via résonance résiduelle (réutilise recap section 12), au lieu d'un buff DEX/SAG plat |
| 20 | Marque de résonance | Maître chasseur | Capstone : imprime une empreinte de résonance sur la cible (miniature des empreintes divines, recap section 2), impossible à semer |

### Vagabond — le mantra Ténèbres pris au sérieux

Trois esquives redondantes (Pas de l'ombre 50% niv.3, Disparition 75% niv.8, Esquive surnaturelle 60% niv.14, qui régressait par rapport à Disparition) fusionnées en **une seule compétence** accordée au niveau 3, dont la force suit ensuite la table de paliers standard plutôt que d'occuper trois lignes distinctes sur la fiche.

**Dissimulation** (remplace Pas de l'ombre + Disparition + Esquive surnaturelle) :

| Niveau | 1-4 | 5-8 | 9-12 | 13-16 | 17-20 |
|---|---|---|---|---|---|
| Effacement | — | 45% | 60% | 75% | 90% |

**Vol à la tire**, nouvelle compétence niveau 8 (emplacement libéré) : miroir inversé de la Transfusion de mana du Mage, même structure, ressource Endurance au lieu de Mana.

```
Coût : 8 Endurance (fixe, le geste)
Montant brut volé = Σ(dés du palier, dé de base d4), retiré de l'Endurance de la cible
Montant récupéré = montant brut × taux de recel du palier (arrondi)
+ 1 dé du palier (d6) + DEX mod en dégâts légers, une fois
```

| Niveau | 1-4 | 5-8 | 9-12 | 13-16 | 17-20 |
|---|---|---|---|---|---|
| Dés volés (d4) | 1 | 2 | 3 | 4 | 5 |
| Taux de recel | 50% | 60% | 70% | 80% | 90% |

La cible perd toujours le montant brut, le Vagabond n'en récupère qu'une fraction, même logique de "facture" que la Transfusion de mana.

| Niveau | Compétence | Remplace |
|---|---|---|
| 1 | Frappe depuis l'ombre | Attaque sournoise |
| 3 | Dissimulation (scale seule, 5 paliers) | Pas de l'ombre + Disparition + Esquive surnaturelle |
| 5 | Crochetage expert | — inchangé |
| 8 | Vol à la tire | — nouveau (emplacement libéré) |
| 11 | Lame empoisonnée | — inchangé |
| 14 | *(emplacement libre, non tranché)* | — |
| 17 | Coup fatal | — inchangé, restauré |
| 20 | Ombre parfaite | — inchangé, reformulé |

### Pugiliste et Guerrier

**Guerrier**

| Niveau | Compétence | Remplace |
|---|---|---|
| 1 | Frappe puissante | — inchangée |
| 3 | Hurlement de rupture | Cri de guerre (applique une gêne de précision au lieu d'un debuff plat) |
| 5 | Garde inébranlable | rework : ignore la gêne d'armure Lourde non maîtrisée + annule le malus ×0,5 sur la Défense |
| 8 | Maître d'armes | — inchangée |
| 11 | Brise-garde | — inchangée |
| 14 | Second souffle | rework du scaling seul : dés-par-palier + CON mod fixe au lieu de CON brut |
| 17 | Bastion | — inchangée, différenciée de Garde inébranlable (zone/alliés vs personnel/anti-armure) |
| 20 | Rupture totale | Fureur du champion : capstone, maîtrise maximale avec n'importe quelle arme pendant quelques tours |

**Pugiliste** (`armorProficiencies: []`, sa défense vient toujours du corps, jamais d'un tour d'armure, ce qui le différencie structurellement du Guerrier)

| Niveau | Compétence | Remplace |
|---|---|---|
| 1 | Combo rapide | — inchangée |
| 3 | Garde haute | — inchangée, justifiée par l'endurcissement corporel plutôt que l'armure |
| 5 | Coup étourdissant | — inchangée |
| 8 | Transe de combat | — inchangée, ancrage Royaume Abandonné ou Archipel au choix du joueur |
| 11 | Déferlante de coups | — inchangée |
| 14 | Contre | — inchangée, déjà bien calibrée (coût = risque, pas l'Endurance affichée) |
| 17 | Poing de fer | — inchangée |
| 20 | Corps sans limite | Avatar du combat : capstone, ignore une partie de la Défense adverse peu importe son origine, miroir de Brise-garde côté corps |

### Calibrage chiffré des compétences offensives

Référence : attaque de base par classe, à la fin de chaque palier (base raciale Humain 8, modificateur d'attribut +3 cumulatif par niveau, arme 1d8+attribut ≈ 7,5 fixe) :

| Classe | Niv 4 | Niv 8 | Niv 12 | Niv 16 | Niv 20 |
|---|---|---|---|---|---|
| Guerrier / Mage (d8) | 17,4 | 25,3 | 33,2 | 41,1 | 49,0 |
| Ranger / Vagabond (d6) | 16,4 | 23,3 | 30,2 | 37,1 | 44,0 |
| Pugiliste (d10) | 18,5 | 27,5 | 36,5 | 45,5 | 54,5 |

Ratios calibrés pour un rendement cible de 2,0 dégâts bonus par point d'Endurance (1,7 pour les compétences qui ajoutent aussi un effet de statut) :

| Classe | Compétence | Niv | Coût | Ratio calibré | DPE visé |
|---|---|---|---|---|---|
| Guerrier | Frappe puissante | 1 | 5 | 1,28 × stat attendue | 2,00 |
| Guerrier | Maître d'armes | 8 | 18 | 0,61 × stat attendue | 2,00 |
| Guerrier | Brise-garde | 11 | 20 | 0,69 × stat attendue | 2,00 |
| Guerrier | Rupture totale | 20 | 35 | 0,64 × stat attendue | 2,00 |
| Mage | Trait du bâton | 1 | 4 | 1,25 × stat attendue | 2,00 |
| Ranger | Tir précis | 1 | 4 | 1,20 × stat attendue | 2,00 |
| Ranger | Flèche empoisonnée | 5 | 9 | 0,80 × stat attendue | 1,70 |
| Ranger | Tir multiple | 11 | 16 | 0,68 × stat attendue | 2,00 |
| Ranger | Marque de résonance | 20 | 30 | 0,58 × stat attendue | 1,70 |
| Vagabond | Frappe depuis l'ombre | 1 | 5 | 1,30 × stat attendue | 2,00 |
| Vagabond | Lame empoisonnée | 11 | 12 | 0,51 × stat attendue | 1,70 |
| Vagabond | Coup fatal | 17 | 22 | 0,66 × stat attendue | 2,30 |
| Pugiliste | Coup étourdissant | 5 | 10 | 0,74 × stat attendue | 1,70 |

`stat attendue` = `base raciale + niveau × (moyenne du dé de classe avec filet + modificateur d'attribut)`, calculée au niveau d'obtention de la compétence, pas au palier. Pour le Vagabond, ça remplace le scaling DEX brut d'origine (ex. Coup fatal passait de DEX×0,7 à `stat attendue×0,66`), même ordre de grandeur de ratio mais une source qui grossit réellement avec le niveau.

**Non calibrées chiffrées ici** : Maître d'armes/Fureur (multi-hits, calibrage par hit à raffiner), Second souffle et Méditation (scaling attribut brut restant à corriger avec la même méthode mais sur un repère de rendement différent : soin/Endurance et restauration de Mana/Endurance plutôt que dégâts/Endurance), toutes les compétences de statut/buff/utilitaire (Cri de guerre, Garde inébranlable, Bastion, Camouflage, Dissimulation, etc., qui suivent une logique qualitative plutôt qu'un ratio dégâts/Endurance).

## 16. TRAITS (PASSIFS ACQUIS OU À LA CRÉATION)

Distincts des traits raciaux (section 11) : des passifs isolés façon Robustesse/Amphibie, indépendants de la race. Certains choisis à la création, d'autres débloqués en jouant.

### Catalogue (choisis à la création, ou via feat)

| Trait | Effet |
|---|---|
| Increvable | +3 Défense physique |
| Sang-froid tactique | +1 cran de précision quand un seul ennemi attaque à la fois |
| Dernier souffle | Une fois par combat, reste à 1 PV au lieu de tomber à 0 |
| Rechargé | Une fois par combat, relance un jet raté (attaque/compétence, pas sauvegarde) |
| Port naturel | Traite une catégorie d'armure de plus comme maîtrisée |
| Cuir dans le sang | Réduit de moitié la gêne de précision d'une armure non maîtrisée |
| Métabolisme de fer | Jauge Faim/Soif max +20%, s'ajoute par-dessus le bonus CON |
| Sommeil léger | Un tour de garde ne coûte aucune récupération de Fatigue perdue |
| Peau tannée | Aucun malus climatique en milieu extrême |
| Vision dans le noir | Voit dans l'obscurité totale (déjà écrit Nain des Profondeurs, réutilisable) |
| Instinct de traque | Avantage aux jets pour détecter une embuscade |
| Oreille aux fréquences | Détecte une zone morte/Réveil partiel à portée réduite, sans la compétence dédiée du Ranger |
| Canal stable | Coût en Mana d'un sort Mineur réduit de 10% |
| Peau dure à la corruption | +2 aux sauvegardes Vigueur contre la corruption élémentaire |
| Sensible au résiduel | Perçoit une fréquence de résonance active à vue |
| Visage reconnu | Avantage aux interactions avec une faction choisie à la création |
| Silence-tombeau | Résiste à être forcé de révéler une info par domination mentale légère |
| Amphibie | Respire sous l'eau et sur terre (déjà écrit, réutilisable hors race) |
| Sang épais | Résiste au froid extrême sans pénalité |
| Poumons d'altitude | Aucun malus en haute montagne |

### Ce que la fiche de personnage implémente

Catalogue : `frontend/public/resources/json/trait.json`, **source unique des traits du monde** — celle où le bestiaire pioche déjà par `traitIds`. Une ligne = un trait, jamais deux. Chaque ligne porte sa lecture créature (`name`, `description`) et, quand un personnage peut le porter, un bloc `character` : libellé et description en français, famille, effets chiffrés, plus deux champs qui décident de tout le reste.

- `acquisition` — **si le trait peut être obtenu, et à quelles conditions** :
  - `acquis` : ça s'apprend, donc n'importe qui peut le prendre à la création ou sur un slot de feat (Nageur, Entraînement martial, les traits de la section 16) ;
  - `biologique` : ça se naît avec, donc ça ne se prend jamais — seule une race l'accorde (Amphibie, Vision dans le noir, Robustesse naine, Affinité arcanique et Protection magique elfiques) ;
  - `regional` : ça vient d'une enfance passée quelque part, donc seule une origine l'accorde (Vision dans la pénombre).
  La condition est écrite en toutes lettres dans le champ `condition` et s'affiche sur la fiche.
- `grantedBy` — **qui l'accorde d'office**, en références `race:`, `subrace:`, `background:`, `origin:`. C'est le seul endroit où ce lien existe : `races.json`, `backgrounds.json` et `origins.json` ne déclarent plus aucun trait en propre. Nageur pointe vers `background:sailor` et `background:fisherman`, Amphibie vers `race:deep-walker`, Vision dans le noir vers `subrace:deep-dwarf`, Robustesse vers `race:nain`, et ainsi de suite.

Trente et un traits au total : les vingt de la section 16, les six rapatriés des races et des backgrounds, la vision régionale des États Souterrains, et les quatre traits de créature d'origine. Vingt et un sont prenables — Amphibie et Vision dans le noir en sortent, contrairement à ce que laissait entendre la mention « réutilisable » du tableau ci-dessus : ce sont des particularités biologiques, pas des entraînements.

- **Trait de création** : un trait du catalogue au choix, en plus de ceux qu'accordent race, sous-race et background. Le nombre n'était pas fixé ici : la fiche en donne **un**, réglé par la constante `CREATION_TRAIT_SLOTS` — la remonter suffit si la table en veut davantage.
- **Slots de feat** : un par palier (5, 10, 15, 20). Chaque slot achète **une** chose parmi trois, jamais deux :
  1. un point d'attribut (+1 à l'attribut choisi) ;
  2. un trait du catalogue ;
  3. un feat domanial (section 24) pris dans un domaine du personnage — ou dans une branche non polarisée si son background l'a ouverte (Soldat → Renforcement, Sage → Voile).
- Un trait déjà accordé par la race ou le background n'est pas reproposé, et aucun trait ne se prend deux fois. Un feat domanial déjà pris, ou exclu par un feat déjà pris, est refusé avec sa raison affichée.
- Redescendre le niveau d'un personnage **suspend** les paliers qu'il n'atteint plus (leurs gains cessent de compter) sans effacer les choix : les remonter les rend tels quels.

Non implémenté sur la fiche : le Contrecoup divin ci-dessous. C'est une marque imposée par le MJ (tier × domaine), pas un choix de joueur, et sa réduction d'apprentissage (−10 % à −30 % d'inspiration sur un domaine) demanderait des coûts d'inspiration fractionnaires que le système n'a pas.

### Contrecoup divin (trait acquis uniquement, jamais choisi à la création)

Réutilise directement section 9 du recap (*"sévérité ∝ durée × degré d'individualité"*), appliqué à un éveil accidentel par contact divin plutôt qu'au Regard classique. Toujours une facture en échange du don obtenu, cohérent avec *"la magie ne refuse rien, elle facture"*.

```
1. La nature de la source fixe un tier central, non négociable par le jet :
   - Individualité complète (Air, Terre, Mort...)      → central Mineure
   - Individualité partielle forcée (Lumière)           → central Modérée
   - Concept pur (Feu, Eau, Vie, Temps, Électricité...)→ central Sévère
   - Contact non filtré / nom originel                  → central Critique, fixe

2. Jet de sauvegarde Volonté (SAG), formule section 13 :
   résistance = SAG_mod × 4 − sévérité de la source
   seuil = 8 − (résistance/5, arrondi) − maîtrise

3. Le résultat déplace le tier central d'un cran maximum :
   1 (échec total) → central +1
   Échec           → central +1 (sauf si déjà Sévère/Critique)
   Partiel         → central inchangé
   Résiste         → central −1 (sauf Critique, qui ne descend jamais)
   20 (critique)   → central −1, + bénéfice narratif mineur au choix du joueur

4. Le MJ affine d'un cran supplémentaire selon la scène réelle
   (durée d'exposition, tentative de fuite, protection rituelle)
```

| Tier final | Effet négatif permanent | Contrepartie |
|---|---|---|
| Mineure | −1 cran de précision en environnement bruyant/surpeuplé | Affinité normale, rien d'exceptionnel |
| Modérée | Jauge Repos max −3 en permanence + tic comportemental fixe | **Aucune** : le pire des quatre tiers, un coût pur sans compensation |
| Sévère | −1 cran permanent aux sauvegardes Volonté + sévérité de sauvegarde +4 en zone corrompue | Voir table par domaine ci-dessous |
| Critique | Mutation physique visible + "voix" du dieu qui refait surface aléatoirement (contrôlée par le MJ) | Voir table par domaine ci-dessous |

Un contact avec un concept pur reste donc *"quasi-toujours fatal/transformateur"* comme déjà écrit : au mieux Modérée avec un jet parfait, jamais Mineure. Modérée devient de fait la zone la plus punitive du tableau (coût réel, aucun bénéfice), ce qui rend Sévère et Critique presque des paris volontaires plutôt que des accidents purs : tant qu'à souffrir, autant que ça rapporte.

### Contreparties par domaine (Sévère / Critique uniquement)

| Domaine | Contrepartie Sévère | Contrepartie Critique |
|---|---|---|
| Feu | Immunité aux dégâts de Feu | Sorts Feu ignorent le plafond de Flux, toujours castables à 100% en un tour |
| Eau | Respire sous l'eau en permanence, résistance aux dégâts Eau | Déplacement instantané entre deux plans d'eau reliés |
| Terre | Jamais ralenti par un terrain rocheux/montagneux, +Défense physique passive | Fusion brève avec la pierre (invulnérabilité totale, immobile) |
| Air | Vitesse accrue en extérieur/altitude, insensible aux effets de poussée | Contrôle total de la chute, aucun dégât de chute |
| Électricité | Perçoit à distance toute activité magique/mécanique "connectée" | Déplacement le long d'un chemin conducteur (métal, eau) sur courte distance |
| Plantes | Régénération passive de PV accrue en milieu naturel | Manipule la végétation à volonté, sans dépense de Mana |
| Lumière | Voit à travers les illusions/dissimulations mineures automatiquement | Ne peut plus jamais être pris par surprise |
| Ténèbres | Un palier de Dissimulation gratuit et permanent | Voyage bref à travers les ombres, courte téléportation entre zones sombres |
| Vie | Régénération passive légère chaque tour | Peut ramener quelqu'un de la mort une fois, au prix d'un sacrifice narratif lourd |
| Mort | Communique à volonté avec les morts récents à proximité | Immunité à la peur et aux effets nécrotiques, ignoré par défaut des morts-vivants |
| Temps | Agit toujours en premier à l'initiative | Peut rejouer une action ratée, une fois par session |
| Espace | Ignore en permanence la gêne de tir et la portée | Téléportation courte gratuite, une fois par combat |

### Complications signature par domaine (dès Modérée, s'aggrave avec le tier)

Différencie un contact avec le Dieu du Feu d'un contact avec la Déesse de l'Espace, au-delà du squelette mécanique générique ci-dessus. Chaque complication crée un hook de faction gratuit (quelqu'un dans le monde déjà écrit a une raison de s'intéresser à ce personnage précisément à cause de sa marque), plutôt qu'un simple malus de fiche isolé.

| Domaine | Modérée | Sévère | Critique | Impact d'aventure |
|---|---|---|---|---|
| Feu | S'échauffe sans pouvoir se refroidir complètement, dort mal en climat chaud | Risque d'embrasement involontaire près de matières inflammables (jet à chaque repos en environnement sec) | Prend feu spontanément sous stress extrême, incontrôlable | Dangereux à embarquer sur un navire si su (Compagnie des Trois Mâts) |
| Eau | Petits trous de mémoire récurrents, comme érodés | Désorientation sur terre ferme prolongée (mal des transports permanent) | Perd occasionnellement le fil de sa propre identité plusieurs minutes | Les Gardiens du Seuil (Archipel) croient reconnaître un signe |
| Terre | Attachement obsessionnel à un lieu précis, malaise à s'en éloigner | Doit y retourner régulièrement ou l'état empire (Repos ne récupère plus complètement ailleurs) | Devient littéralement plus lourd/dur à déplacer | Un lieu précis devient un point d'ancrage de campagne malgré lui |
| Air | Ne supporte plus les espaces clos longtemps sans malaise | Dissociation ponctuelle en situation stressante (perd un tour) | Distance émotionnelle permanente avec ses proches | Rend le personnage difficile à jouer en groupe soudé |
| Électricité | Le métal proche grésille/s'aimante légèrement en sa présence | Douleur/gêne sensorielle en foule dense | Décharge incontrôlée s'il est touché par surprise | La Confrérie des Runistes ou les Tisserands pourraient chercher à l'étudier/recruter |
| Plantes | Cicatrices qui ressemblent à de l'écorce plutôt qu'à de la peau | Malaise croissant en environnement stérile (ville dense, désert) | Provoque une croissance erratique autour de lui | Le Cercle des Druides Anciens s'y intéresse, ambigu |
| Lumière | Émet une faible lueur quand ses émotions débordent, ruine sa discrétion | Compulsion à révéler une vérité gênante au pire moment | Ne peut plus mentir du tout, même par omission | L'Inquisitorat le remarque vite |
| Ténèbres | Paranoïa légère d'être observé, même sans raison | Trahit involontairement sa position à ceux qui comptent vraiment pour lui | Devient intraçable pour ses propres alliés par moments | La Main Sans Ombre ou les Gardiens du Seuil remarquent un signe familier |
| Vie | Les plantes/animaux proches réagissent anormalement fort à sa présence | Risque d'affecter une grossesse/couvée à proximité sans le vouloir | Ne distingue plus toujours le vivant du mort-vivant/illusoire | Les Veilleurs de l'Arbre le surveillent de près |
| Mort | Perçoit les morts récentes alentour sans pouvoir couper cette perception | Le sommeil devient perturbé par cette perception constante (interagit avec la jauge Fatigue) | Les morts "s'attardent" un peu près de lui, visible par d'autres | Les Médiants le repèrent, les Chasseurs d'Âmes aussi, pour de mauvaises raisons |
| Temps | Déjà-vu fréquents, petites pertes de synchronisation avec l'instant présent | Vieillit de façon visible mais irrégulière | Devient sensible aux manipulations du Destinal | Les Chercheurs d'Ancien Art le traqueraient pour l'étudier |
| Espace | Ne se sent "chez lui" nulle part, malaise diffus permanent | Micro-téléportations involontaires de quelques centimètres sous stress | Risque de déplacement incontrôlé sur une vraie distance en cas de choc violent | Certaines actions de précision (escalade, combat rapproché) ponctuellement risquées |

### Réduction d'apprentissage (familiarité conceptuelle, bonus commun à tous les tiers)

Distincte des contreparties Sévère/Critique ci-dessus : une familiarité conceptuelle, pas une puissance de combat, donc compatible avec la règle "pas de bonus à Modérée" pour la puissance tout en donnant quand même quelque chose à ce tier. S'applique à **tout l'arbre du domaine touché** (pas seulement la lignée de dégâts principale, aussi les branches combo type Marque spatiale).

```
Réduction sur les points d'inspiration, uniquement pour le domaine du Contrecoup :
Mineure  : −10%
Modérée  : −15%
Sévère   : −20%
Critique : −30%
```

Impact sur la lignée complète chiffrée section 17 (78 points en tout-puissance, 64 en tout-économe) :

| Tier | Réduction | Lignée puissance | Lignée économe |
|---|---|---|---|
| Mineure | −10% | 70,2 | 57,6 |
| Modérée | −15% | 66,3 | 54,4 |
| Sévère | −20% | 62,4 | 51,2 |
| Critique | −30% | 54,6 | 44,8 |

Répond en partie au problème de budget identifié section 17 (branches triplées rendaient une lignée complète quasi hors de portée d'un Mage dédié) : un Contrecoup Sévère/Critique dans le domaine investi redonne une vraie marge, cohérent narrativement (l'éveil accidentel devient un raccourci vers la maîtrise de ce domaine précis).

## 17. SORTS DE DOMAINE (ARBRE PAR DOMAINE, HORS COMPÉTENCES DE CLASSE)

Distinct des compétences de classe (section 15, coût Endurance, jamais magique) : l'arbre de sorts par domaine, coût Mana, utilise `inspirationPerLevel` (déjà présent dans vos fiches de classe, jamais branché jusqu'ici).

### Gabarit commun de dégâts (12 domaines, 3 paliers)

| Palier | Niveau | Coût Mana | Dés (fixe) | Ratio × Attaque magique | Dégâts moyens | DPM |
|---|---|---|---|---|---|---|
| Mineur | 1 | 1 | 1d6 (3,5) | ×0,03 | ~4 | 4,0 |
| Majeur | 5 | 6 | 2d6 (7) | ×0,36 | ~24 | 4,0 |
| Expert | 15 | 10 | 3d6 (10,5) | ×0,23 | ~40 | 4,0 |

**Expert ≠ sort ancien.** Expert est le sommet normal de la progression par niveau. Sort ancien est une catégorie totalement séparée (usure de canal, section 4 du recap), débloquée uniquement par découverte narrative (parchemin, mentor, quête), jamais par montée de niveau pure, sans coût d'inspiration.

### Les 12 domaines (dégâts)

| Domaine | Mineur (niv.1) | Majeur (niv.5) | Expert (niv.15) | Dégâts | Accroche mécanique |
|---|---|---|---|---|---|
| Feu | Braises | Boule de feu | Inferno | Feu | Brûlure (DoT) sur Touche/Critique |
| Eau | Lame liquide | Étreinte de glace | Vapeur corrosive | Eau | Voir traitement à part (3 états) |
| Terre | Éclat de pierre | Poigne tellurique | Effondrement | Contondant | Renverse la cible (perd son mouvement) |
| Air | Lame de vent | Bourrasque tranchante | Tempête déchaînée | Tranchant | Repousse la cible d'une case par palier |
| Électricité | Étincelle | Arc électrique | Foudre en chaîne | Foudre | Touche une cible secondaire à portée, dégâts moitié en chaîne |
| Plantes | Épine | Étreinte végétale | Efflorescence toxique | Perforant/Poison | DoT qui s'aggrave à chaque tour |
| Lumière | Éclat révélateur | Rayon purificateur | Jugement | Radiant | Dégâts doublés contre cible dissimulée/invisible |
| Ténèbres | Morsure d'ombre | Étreinte nocturne | Éclipse | Ombre | Le lanceur gagne un palier de Dissimulation gratuit |
| Mort | Flétrissure | Poigne du seuil | Verdict | Nécrotique | Réduit le PV maximum de la cible pour la durée du combat |
| Temps | Instant volé | Rupture de cadence | Écart fatal | Vrai | Dégâts bonus proportionnels aux tours écoulés depuis la dernière action de la cible |
| Espace | Piqûre distante | Frappe sans distance | Effacement spatial | Vrai | Ignore complètement gêne de tir et portée |

**Vie** ne suit pas ce gabarit (domaine de création/soin, pas de combat, cohérent avec le lore) :

| Palier | Nom | Coût | Soin moyen | HPM | Effet ajouté |
|---|---|---|---|---|---|
| Mineur (niv.1) | Étincelle vitale | 1 Mana | ~4 PV | 4,0 | Soin simple |
| Majeur (niv.5) | Effusion de vie | 6 Mana | ~21 PV | 3,5 | + retire un statut mineur |
| Expert (niv.15) | Renaissance | 10 Mana | ~30 PV | 3,0 | + ramène un allié depuis un palier critique (Faim/Soif/Fatigue, section 2), retire des statuts lourds |

### Eau, traitement à part (un état par palier)

| Palier | Nom | État | Effet distinctif |
|---|---|---|---|
| Mineur | Lame liquide | Liquide | Dégâts standards |
| Majeur | Étreinte de glace | Solide | Immobilise la cible un tour en plus des dégâts |
| Expert | Vapeur corrosive | Gazeux | Dégâts en zone au lieu de cible unique |

### Branche Espace : Marque spatiale (racine de sous-arbre)

Marque spatiale (Mineur, 1 Mana, aucun dégât, se dissipe hors de portée du lanceur) sert de prérequis à toute une branche combo :

| Sort | Effet | Coût de la marque |
|---|---|---|
| Rayon à tête chercheuse | Dégâts, ligne droite normale sans marque, 100% de précision si cible marquée | — |
| Échange-place | Permute deux marqués, utilisable en réaction | Consomme les deux marques |
| Rappel | Le lanceur se téléporte à côté d'un marqué, peu importe la distance | Consomme la marque |
| Effondrement de marque | Détonation touchant tous les marqués simultanément, où qu'ils soient | Consomme toutes les marques actives |
| Piège d'ancrage | Sort à concentration : empêche les marqués de s'approcher entre eux, le lanceur peut se marquer lui-même | — |
| Substitution différée | Si le lanceur tombe sous un seuil critique de PV, échange automatiquement avec un allié marqué (réaction) | Consomme la marque |
| Poids de l'ancrage | Tire de force une cible marquée jusqu'au lanceur | Consomme la marque |
| Marque miroir | Lie lanceur et cible marquée, dégâts partagés dans les deux sens | — |
| Rupture de marque forcée | Détruit les marques posées par un ennemi | — |
| Marque fantôme | Marque invisible pour la cible, synergie avec Ténèbres | — |
| Sillage | Passif : perçoit les déplacements récents d'un marqué hors de vue | — |
| Œil au loin | Voit à travers la position d'un marqué à toute distance, aucun dégât | — |

### Coûts d'apprentissage (points d'inspiration, `inspirationPerLevel` déjà en fiche)

| Palier | Niveau requis | Déblocage | Rang 2 | Rang 3 (débloque branche) | Branche puissance | Branche économe |
|---|---|---|---|---|---|---|
| Mineur | 1 | 2 | 1 | 2 | 5 (total 10) | 3 (total 8) |
| Majeur | 5 | 5 | 2 | 5 | 12 (total 24) | 8 (total 20) |
| Expert | 15 | 9 | 4 | 9 | 22 (total 44) | 14 (total 36) |

Lignée complète tout-puissance : 78 points. Tout-économe : 64 points. Budget Mage sur 20 niveaux (inspiration 4/niveau) : 80 points, donc **une lignée complète en pousse la spécialisation vers un seul domaine dominant plutôt qu'un généraliste à 3 domaines**, à moins d'ajouter une fidélisation (remise progressive pour rester dans le même domaine, non implémentée, voir threads).

## 18. CATALOGUE DES STATUTS

Deux moteurs de résolution distincts, volontairement séparés : les jets de sauvegarde de combat (section 13, seuil mobile, `résistance = attribut×4 − sévérité`) régissent les effets déclenchés en jeu par une attaque/un sort. Les statuts ci-dessous utilisent un **système à part, DC classique** (d20 + attribut contre un DC fixe), propre aux effets de statut uniquement. Ne pas confondre les deux moteurs à l'implémentation.

### DoT (dégâts sur la durée)

| Statut | Dégâts/tour | Particularité | Durée | Fin |
|---|---|---|---|---|
| Brûlure | 3 (feu) | Soins reçus réduits de moitié | 3 | Expire, ou immersion dans l'eau |
| Poison | 2 (poison), partiellement vrai | Sauvegarde CON DC12 tous les 2 tours pour purger | Infinie | Sauvegarde réussie, antidote, soin purifiant |
| Saignement | 3 + atk_phy×0,2 (physique) | Dégâts doublés si la cible se déplace | 3 | Expire, soin, bandage |
| Nécrose | 3%/5%/7% des PV max (croissant), vrai | Soins totalement bloqués tant qu'active | 3 | Expire, soin purifiant, forte régénération |

### Contrôle (empêche agir/bouger/lancer)

| Statut | Bloque | Particularité | Durée | Fin |
|---|---|---|---|---|
| Paralysie | Action, mouvement, incantation | speed −3 (vulnérabilité accrue) | 2 | Expire |
| Sommeil | Action, mouvement, incantation | — | 4 | Expire, ou dégâts subis |
| Étourdissement | Action, mouvement, incantation | — | 1 | Expire |
| Gel | Action, mouvement, incantation | def_phy −4 | 2 | Expire, ou dégâts de feu (instantané) |
| Enracinement | Mouvement seul | speed −3 | 2 | Expire |
| Silence | Incantation seule | — | 2 | Expire |
| Contrôle | — (agit, mais dicté par le lanceur) | DC18 sagesse à chaque ordre pour refuser, 20 naturel = liberté définitive, coûte du Mana/tour au lanceur (double pour 2 cibles), concentration DC12 | Infinie | Sauvegarde critique, lanceur touché/à sec de Mana/à terre, cible hors de portée |

### Debuff

| Statut | Effet | Valeur | Durée |
|---|---|---|---|
| Aveuglement | Précision réduite | −2 crans (`precisionCrans`) | 2 |
| Ralentissement | Vitesse réduite | speed −4 | 3 |
| Affaiblissement | Attaque réduite | atk_phy −3, atk_mag −3 | 3 |
| Vulnérabilité | Défense réduite | def_phy −5, def_mag −5 | 3 |
| Trempé | Faiblesse/résistance élémentaire | Faible à la foudre, résiste au feu | 3 |

### Mental (sauvegarde Sagesse, DC classique)

| Statut | Effet | DC | Trigger | Fin |
|---|---|---|---|---|
| Peur | Fuit la source | 12 | action (approcher/attaquer) | Expire |
| Charme | Considère le lanceur comme allié | 12 | action (agir contre son intérêt) | Expire, ou dégâts du lanceur |
| Confusion | Cible/déplacement aléatoires | 12 | turn | Expire |
| Provocation | Contraint d'attaquer le provocateur | 10 | action (attaquer quelqu'un d'autre) | Expire |
| Berserk | Attaque le plus proche (allié ou ennemi), atk_phy +7, incantation bloquée | — (aucune sauvegarde, ne peut être dissipé) | — | Expire |

### Buff

| Statut | Effet | Durée |
|---|---|---|
| Régénération | Soigne 4 + CON×0,3/tour | 3 |
| Hâte | speed +5, action supplémentaire | 3 |
| Rage | atk_phy +5, def_phy −3 | 3 |

### Espace (branche Marque spatiale, section 17)

| Statut | Effet | Durée | Fin |
|---|---|---|---|
| Marque spatiale | Aucun effet seul, donne prise à Échange-place | Infinie | Hors de portée du lanceur, ou lanceur tombé |
| Piège d'ancrage | Tous les marqués du lanceur ne peuvent plus s'approcher entre eux, coûte du Mana/tour | Infinie | Concentration brisée, à sec de Mana, lanceur tombé |

### Manque (survie, statuts par palier — reprend section 2, unifié ici)

Faim, Soif et Fatigue s'épuisent avec le temps (segments de journée) ; Manque de mana s'épuise avec la dépense elle-même, réévalué à chaque sort lancé. Un seul palier actif à la fois par jauge (le plus sévère atteint), pas cumulable avec ses propres paliers inférieurs.

| Statut | Palier | Seuil | Effet |
|---|---|---|---|
| **Faim** | Léger | 75-50% | Aucun effet mécanique |
| | Modéré | 50-25% | −1 cran de précision physique |
| | Sévère | 25-0% | −2 crans de précision physique cumulés + Endurance max −25% |
| | Critique | 0% | Perte de connaissance, durée = 3 segments − CON mod, min 1 |
| **Soif** | (mêmes paliers/effets que Faim, réservoir plus petit — ratio 3:1, section 2) | | |
| **Fatigue** | Léger | 15 → 10 | Aucun effet mécanique |
| | Modéré | 10 → 5 | −1 cran de précision physique |
| | Sévère | 5 → 0 | −2 crans de précision physique cumulés + −1 cran de gêne d'incantation + Endurance max −30% (plancher −15% selon CON) |
| | Critique | 0 | Endormissement involontaire, durée = 2 segments − CON mod, min 1 |
| **Manque de mana** | Léger | 50-25% Réserve | Aucun effet mécanique |
| | Modéré | 25-10% Réserve | −1 cran de gêne d'incantation |
| | Sévère | 10-0% Réserve (>0) | −2 crans de gêne d'incantation cumulés + −1 cran de précision physique + Faim/Soif se dégradent au double du rythme ce jour-là |
| | Critique | 0% Réserve | Perte de connaissance, durée = 3 segments − CON mod, min 1 |

Manque de mana est construit en écho direct de Faim (cohérent avec le lore déjà écrit : l'épuisement magique donne des *"symptômes type manque : sueurs froides, nausées, confusion, faim"*), et son palier Sévère fait concrètement doubler la dégradation Faim/Soif, ce qui chiffre enfin la réciprocité mentionnée en principe section 2 sans jamais avoir été formalisée.



- **Fidélisation (remise de spécialisation domaine)** : discutée, chiffrée à titre d'exemple (-5%/tranche de 10 points, plafond -30%), mais pas adoptée pour tous les joueurs. La réduction de familiarité conceptuelle (section 16, Contrecoup divin) répond au même problème de budget mais uniquement pour les personnages ayant vécu un éveil accidentel, pas une solution générale pour tous les Mages.
- **Sort ancien, vraie catégorie séparée** : pas encore conçue (débloque narrativement, usure de canal, hors du système de points d'inspiration).
- **Matrice de faiblesses/résistances élémentaires** (section 18, Trempé) : identifiée comme système implicite (Gel/feu, Brûlure/eau), pas encore formalisée en table complète, remise à plus tard.

## 19. CATALOGUE MÉTÉO

Deux champs distincts par météo : `costModifiers` (coût en Mana pour lancer un sort de ce domaine, facteur multiplicatif) et `damageModifiers` (dégâts une fois le sort lancé), indépendants l'un de l'autre. Une météo peut toucher l'un, l'autre, les deux, ou aucun.

### Les 11 météos

| Météo | Statut appliqué | Dégâts aléatoires | Coût modifié | Dégâts modifiés | Durée |
|---|---|---|---|---|---|
| Tempête | Trempé | Foudre 3-6 (25%) | Eau ×0,5 | — | 3 |
| Blizzard | Aveuglement | Glace 3-6 (25%) | Eau ×0,5 | — | 3 |
| Pluie | Trempé | — | Eau ×0,75, Feu ×1,5 | — | 4 |
| Sécheresse | Affaiblissement | — | — | Feu ×1,5, Eau ×0,5 | 4 |
| Canicule | Affaiblissement | Feu 2-4 (20%) | — | Feu ×1,3 | 4 |
| Brouillard | Aveuglement | — | — | — | 4 |
| Vents violents | Gêne de tir longue portée | — | — | Air ×1,4 | 3 |
| Nuit magique | — | — | — | Ténèbres ×1,3, Lumière ×0,7 | 5 |
| Ciel radieux | — | — | — | Lumière ×1,3, Ténèbres ×0,7 | 5 |
| Grêle | — | Glace 3-6 (30%) | Eau ×0,5 | — | 3 |
| Tempête de sable | Aveuglement | Terre 2-4 (20%) | — | Terre ×1,2 | 3 |

### Impact sur les ressources du groupe

Branché sur les quatre jauges du catalogue de statuts (section 18) :

| Météo | Soif | Faim | Repos (Fatigue) | Mana |
|---|---|---|---|---|
| Tempête / Pluie | Jauge +4/segment passé dehors (eau potable gratuite) | — | Sans abri, la nuit ne récupère pas complètement (règle générale section 2) | `costModifiers` déjà listés ci-dessus |
| Blizzard | — | Consommation ×1,5 (lutte contre le froid) | Sans abri, récupération nulle + Fatigue démarre à Modéré au réveil sans feu | `costModifiers` déjà listés |
| Sécheresse / Canicule / Tempête de sable | Consommation ×1,5 à ×2 | Consommation ×1,5 | — | — |
| Brouillard / Vents violents / Nuit magique / Ciel radieux / Grêle | — | — | — | — |

Le trait **Peau tannée** (section 16, *"aucun malus climatique en milieu extrême"*) annule tous les multiplicateurs de cette table pour son porteur, ce qui lui donne enfin une vraie utilité mécanique plutôt qu'un bonus cosmétique.

## 20. CATALOGUE MOMENT DE LA JOURNÉE

Mêmes 6 phases que la Fatigue (section 2) : une seule horloge partagée entre les deux systèmes. Midi et Nuit sont les deux pics symétriques (magnitude forte, dégâts et coût touchés). Aube et Soirée sont les deux transitions symétriques (magnitude modérée, un seul coût touché). Matinée et Après-midi sont neutres (aucun bonus/malus), les deux paliers de calme entre les pics et les transitions.

| Moment | Dégâts modifiés | Coût modifié |
|---|---|---|
| Aube | Lumière ×1,15, Ténèbres ×0,9 | Lumière ×0,9 |
| Matinée | — | — |
| Midi | Lumière ×1,3, Ténèbres ×0,7 | Lumière ×0,75, Ténèbres ×1,25 |
| Après-midi | — | — |
| Soirée | Ténèbres ×1,15, Lumière ×0,9 | Ténèbres ×0,9 |
| Nuit | Ténèbres ×1,3, Lumière ×0,7 | Ténèbres ×0,75, Lumière ×1,25 |

## 21. CATALOGUE DES BACKGROUNDS

Chaque background donne : une fourchette d'argent de départ, plusieurs sous-backgrounds (arme + équipement de départ propres), deux compétences +1 (sauf Artisan, voir note), et parfois un trait spécial.

| Background | Argent | Sous-backgrounds (arme) | Compétences | Trait |
|---|---|---|---|---|
| Criminel | 0-50 | Voleur (dague), Espion (dague), Tueur à gages (dague), Vigilante (bâton) | Discrétion, Tromperie | — |
| Soldat | 15-30 | Fantassin (lance), Tireur de précision (arc long), Médecin d'armée (dague) | Athlétisme, Intimidation | Entraînement martial (accès branche Renforcement) |
| Sage | 0-20 | Érudit (bâton), Alchimiste (dague), Astronome (bâton) | Arcane, Histoire | Études magiques (accès branche Voile) |
| Artisan | 10-20 | Forgeron (masse d'armes), Runiste (bâton) | Artisanat (une seule) | Forgeron : Main experte (−15% coût en matériaux) ; Runiste : Lecture runique (identifie une rune à vue, sans jet) + peut tailler des runes sur un éclat domanial vierge |
| Nomade | 0-15 | Aventurier (épée longue), Récolteur-Vagabond (dague), Marchand ambulant (dague) | Survie, Nature | — |
| Noble | 40-80 | Héritier (rapière), Chevalier aspirant (épée longue), Marchand aristocratique (rapière) | Histoire, Religion | — |
| Marin | 15-40 | Matelot (dague), Navigateur (sabre), Pirate (sabre) | Athlétisme, Perception | Nageur (traverse les points d'eau) |
| Paysan | 0-10 | Fermier (bâton), Berger (fronde), Bûcheron (hache) | Athlétisme, Dressage | — |
| Chasseur | 15-50 | Traqueur (arc court), Trappeur (dague) | Discrétion, Nature | — |
| Pêcheur | 5-30 | Pêcheur des côtes (lance), Pêcheur des eaux douces (dague) | Perception, Nature | Nageur (traverse les points d'eau) |

### Branches non polarisées (accès hors background)

| Feat | Branche débloquée | Équivalent |
|---|---|---|
| Entraînement martial | Renforcement | Identique au trait Soldat |
| Études magiques | Voile | Identique au trait Sage |

## 22. ORIGINE GÉOGRAPHIQUE ET RELIGION (AXES DE CRÉATION)

Deux axes distincts de Race (biologie) et Background (métier) : l'Origine ancre le personnage dans une région, la Religion dans un domaine. Les deux évitent de recouvrir le même terrain que ce qui existe déjà.

### Origine géographique — pistes

- **Acclimatation climatique** : ignore les multiplicateurs de consommation Faim/Soif propres au climat d'origine (section 19), même levier que le trait Peau tannée mais gratuit par l'origine.
- **Résistance régionale** : Royaume Abandonné → résistance partielle à la corruption élémentaire dès la création ; États Souterrains → vision dans la pénombre même hors race adaptée.
- **Réputation de faction gratuite** : attitude de départ améliorée avec une faction régionale (Pierre de Taille, Dents Grises, Arc Brisé), sans jet ni feat.
- **Langue/savoir régional automatique** : langue locale et usages/tabous connus sans investissement de compétence.
- **Accès facilité aux branches non polarisées** pour un natif de l'Archipel (recap section 11, pratique instinctive), sans passer par un feat.

### Religion — pistes retenues

**Marqueur social**, réaction par domaine selon la région :

| Domaine | Favorable | Suspect/méfiant |
|---|---|---|
| Lumière | Luxarion (Clergé Solaire) | Royaume elfique (hors culte de la Vie) |
| Vie | Royaume elfique | Peu ailleurs, culte périphérique hors Aldenmoor |
| Ténèbres | Archipel (Gardiens du Seuil) | Luxarion (associé à la Main Sans Ombre) |
| Mort | Luxarion (légitimé depuis Caelar, toujours stigmatisé) | Royaume elfique : hostilité, pas simple malaise. La Mort y est théologiquement *"l'Ennemi"* dans le mythe des Enfants de la Sève (recap dieux/religions section 9, faux en réalité, Necrovh accueille, mais c'est le mythe qui compte socialement) : un dévot de Mort y est perçu comme un adversaire du Cycle, pas juste un original |
| Feu/Terre/Eau/Air/Électricité/Plantes | Neutre partout | — |
| Temps/Espace | Curiosité chez les Chercheurs d'Ancien Art | Méfiance diffuse, domaines trop rares |

**Rituel de préparation** : avant une exposition connue à risque (Réveil partiel, site divin), un rite propre au domaine donne la sauvegarde Volonté contre le Contrecoup divin (section 16) en avantage conditionnel (mécanisme déjà posé section 14).

**Confession/absolution et rites de prière, par religion précise** (remplace la table générique par domaine posée plus tôt : ancré sur les religions réellement écrites dans `mystaria_recap_dieux_religions.md`, pas une formule uniforme plaquée sur les 12 domaines).

| Religion | Domaine | Confession/absolution | Rite de prière (buff, lieu de culte requis) |
|---|---|---|---|
| Zénithisme (Luxarion) | Lumière | Rite au Luminarium : retire tous les statuts négatifs actifs, y compris sans expiration naturelle (Poison, Nécrose, Contrôle). Coût réel : révèle une vérité cachée au clergé (peut alimenter Chambre des Registres/Inquisitorat) | Ferveur : +2 crans de précision, durée courte |
| Enfants de la Sève (Royaume elfique) | Vie | Rite funéraire au pied de l'Arbre : retire Nécrose en priorité + statuts mentaux liés au deuil (Peur, Confusion), en enterrant symboliquement un objet. Effet caché : nourrit imperceptiblement le sceau de la Déesse endormie, jamais révélé au joueur, purement cosmologique pour l'instant | Régénération (catalogue section 18, 4 PV + CON×0,3/tour, durée 3) |
| Culte de Lun'a (Archipel, pas encore nommé formellement) | Ténèbres | *(non défini, religion pas encore rédigée)* | Voile de Mahina : effacement 25% (evadeChance), durée courte. Doublé à 50% pendant une Conjonction lunaire |

Chaque rite de prière : accompli uniquement dans un lieu de culte reconnu, aucun jet, aucun coût de ressource, une seule fois par repos complet. Chaque confession/absolution demande une scène jouée, pas un simple jet.

**Prière-pari (Piété, jauge B — confirmée)** : gate par une jauge de Piété invisible sur la fiche, qui n'avance que par de vrais actes de dévotion joués en session (rituel accompli, quête pour la foi, offrande), jamais par le niveau. Permet de construire des archétypes façon Clerc/Paladin sans classe dédiée, une fois le seuil atteint. Le pari lui-même : sacrifie l'action complète du tour, jet de Volonté contre une sévérité élevée fixe, degrés de réussite déjà connus (Raté = rien, Partiel = effet mineur, Touche = effet notable propre au domaine, Critique = un vrai miracle).

### Ce que la fiche de personnage implémente

Datasets : `frontend/public/resources/json/characters/origins.json` et `.../religions.json`. Les clés de région sont celles de `materials.json > regions`, les traits accordés sont référencés par leur id dans `trait.json` (source unique, aucun trait n'est réécrit ailleurs).

- **Origine** : cinquième champ d'identité, à côté de race, background et classe. Cinq origines, une par région. Chacune porte son climat, son acclimatation, son savoir régional, sa ou ses factions à réputation gratuite, et ce qu'elle accorde en dur :
  - Royaume Abandonné → trait *Peau dure à la corruption* (id 22, celui du catalogue) ;
  - États Souterrains → trait *Vision dans la pénombre* (id 25, accordé seulement : il ne figure pas dans la liste des traits qu'on prend sur un slot, pour ne pas doubler *Vision dans le noir*) ;
  - Archipel de la Nuit → Renforcement et Émission ouverts sans feat ni background, exactement comme le trait Soldat ou Sage les ouvre.
- Les traits d'origine entrent dans les traits accordés : ils comptent pour les stats, la fiche imprimée, le PDF et le simulateur de combat, au même titre qu'un trait racial.
- **Religion** : sixième champ d'identité. Les trois religions rédigées (Zénithisme, Enfants de la Sève, Culte de Lun'a) portent leur domaine, leur clergé, leur rite de préparation, leur rite de prière et leur confession quand elle existe — Lun'a affiche sa réserve plutôt qu'une règle inventée.
- **Marqueur social** : la table par domaine est tenue à part (`standing`), donc elle s'applique même à un personnage sans religion déclarée — c'est le domaine servi qui se voit. La fiche affiche les lignes du domaine de la religion et des domaines d'affinité.

Non implémenté : la **Prière-pari** et la jauge de Piété. Le doc les laisse explicitement ouvertes (seuil, rythme, effets Touche/Critique par domaine) et pose la jauge comme invisible sur la fiche — la coder reviendrait à inventer les valeurs manquantes. L'**acclimatation climatique** est pour l'instant déclarative : le moteur de survie module la consommation par activité, pas encore par climat, donc il n'y a aucun multiplicateur à annuler.

**Non résolu** : seuil exact de la jauge de Piété, rythme de progression, et effets précis par domaine pour le palier Touche/Critique de Prière-pari. Culte de Lun'a pas encore rédigé comme religion complète (structure/clergé), seul le rite de prière est posé.

## 23. MATÉRIAUX DE TERRE (MANIPULATION VS EX-NIHILO)

Système spécifique au domaine Terre : au lieu de multiplier les sorts/branches par matériau, un seul sort par famille (Pierre, Métal, Cristal) pioche sa saveur selon trois paliers, ancrés sur les Lois de magie déjà écrites (recap section 3).

### Les trois paliers

```
PALIER 1 — Manipulation (sans étude, matériau réellement présent) :
   Façonne les sédiments/roches VRAIMENT présents autour du lanceur (Loi de
   manipulation : stable, permanent selon les conditions physiques). Coût en
   Mana réduit (rien à créer, juste à façonner). Limité à ce que la géologie
   locale offre vraiment.

PALIER 2 — Ex-nihilo étudié (matériau appris) :
   Conjure le matériau n'importe où, même absent localement (Loi de
   l'esquisse : temporaire, se décompose sans énergie de soutien continue).
   Coût en Mana plus élevé. Universellement disponible.
   Devient permanent via Transmutation/Substitution (recap section 7,
   sacrifice de matière compatible), palier optionnel au-delà.

PALIER 3 — Improvisation de mémoire (ni local, ni étudié, mais déjà vu ET
   touché au moins une fois) :
   - Coût en Mana : +50% par rapport au coût normal
   - Effet mécanique : moitié de l'effet normal du matériau (arrondi en dessous)
   - Instabilité doublée : se décompose deux fois plus vite qu'un ex-nihilo étudié
   - −2 crans supplémentaires sur le jet du sort
   Impossible pour un matériau jamais vu ET touché. Un simple contact visuel
   ne suffit pas.
```

*"Un simple mage soldat économise sa Mana en utilisant ce qui l'entoure, un érudit de la Terre a un arsenal pour toute situation"* : Palier 1 = gratuit mais dépendant du terrain, Palier 2 = cher mais universel, Palier 3 = filet de secours cher et fragile pour un cas extrême (en mer, sans étude).

### Étude d'un matériau

Séparée de l'arbre de sorts (aucun point d'inspiration dépensé), activité de repos long avec accès à un échantillon et idéalement un mentor/une guilde (Confrérie des Runistes, Griffes de Pierre pour du rare/volé). Plafonnée à une fois par palier de maîtrise (jusqu'à 5 matériaux sur une carrière complète, niveaux 1/5/9/13/17).

**Bronze** exige d'avoir étudié Cuivre ET Étain séparément avant de pouvoir le conjurer ex-nihilo : ce n'est pas un minerai natif, un alliage, cohérent avec la vraie métallurgie.

### Matériau équipé, changé hors combat

```
Un seul matériau étudié "actif" à la fois, choisi pendant un repos (comme un
équipement). Tant que le lanceur n'est pas en zone native d'un AUTRE
matériau, tous ses sorts Terre produisent le matériau équipé (Palier 2,
stable).

En zone native d'un matériau différent : le sort produit automatiquement le
matériau LOCAL à la place de l'équipé (le sol impose sa nature), mais reste
stable si ce matériau est étudié. S'il ne l'est pas, ça retombe au Palier 1
(manipulation) ou au Palier 3 (improvisation) selon le cas.

Forcer un matériau étudié différent de l'équipé en plein combat : coûte une
action bonus + un surcoût de Mana fixe (même logique que la canalisation
forcée, section 13), pas gratuit.
```

### Géologie réelle (calibrage de vraisemblance)

| Famille | Formation | Exemples | Propriété dominante |
|---|---|---|---|
| Sédimentaire | Dépôts compactés | Calcaire, grès, argile, schiste | Tendre, parfois friable, réagit chimiquement |
| Ignée | Magma/lave refroidie | Granite (lente), basalte/andésite/obsidienne (rapide) | Dure à très dure ; obsidienne tranchante mais cassante |
| Métamorphique | Roche transformée (chaleur/pression) | Marbre (depuis calcaire), ardoise, gneiss | Feuilletée/clivée, souvent plus dure que l'originale |

**Sable**, sédiment non consolidé, distinct des roches :

| Origine | Composition | Effet mécanique |
|---|---|---|
| Désertique (Royaume Abandonné) | Quartz érodé | Faible Défense, efficace en zone (écho Tempête de sable, section 19) |
| Volcanique (Archipel) | Basalte broyé | Même principe, teinté Feu |
| Corallien (Archipel, plages) | Carbonate de calcium | Vulnérable à un effet acide si existant dans le catalogue |
| Côtier (Luxarion) | Silice | Neutre, le plus générique |

### Répartition régionale

| Région | Géologie plausible | Cohérence avec le lore |
|---|---|---|
| Aldenmoor/Luxarion | Granite (montagne), calcaire (bassin) | Luxarion=calcaire déjà posé, Dorsale=granite elfique |
| Royaume Abandonné | Grès, sédiments arides | Cohérent semi-aride ; zones corrompues = géologie anormale possible |
| États Souterrains | Granite profond, métamorphique, veines concentrées | Cohérent *"abondance d'éclats, saturation géologique"* |
| Archipel | Basalte, andésite, obsidienne, pierre ponce | Chaîne volcanique déjà établie, colonnes de Moku Mauna |

### Propriétés mécaniques par matériau

| Matériau | Propriété réelle | Effet mécanique |
|---|---|---|
| Granite | Très dur | Défense élevée, standard |
| Grès | Tendre, poreux | Faible Défense, coût réduit |
| Calcaire | Se dissout à l'acide | Défense modeste, vulnérable à l'acide/poison |
| Basalte | Dense | Bonne Défense, lourd |
| Obsidienne | Tranchante, cassante | Dégâts tranchants élevés, Défense la plus basse |
| Andésite | Intermédiaire | Équilibré |
| Ardoise/Schiste | Se clive en feuillets | Léger, armure souple |
| Marbre | Poli | Faible en combat, valeur sociale |
| Cuivre | Mou, conducteur | Faible Défense, vulnérabilité Foudre réelle |
| Fer | Robuste | Standard équilibré |
| Bronze | Alliage (nécessite Cuivre + Étain étudiés) | Supérieur au Fer, coût d'étude double |
| Or | Mou, pur | Faible Défense, bonus social/anti-corruption |
| Quartz | Piézoélectrique | Synergie possible avec Électricité |
| Améthyste | Quartz teinté | Résistance mineure Peur/Charme |
| Rubis | Résiste à la chaleur | Bon avec Feu, Défense élevée |
| Diamant | Le plus dur | Meilleure Défense absolue, étude la plus chère |

## 24. PASSIFS DE DOMAINE (PRINCIPE GÉNÉRAL + LUMIÈRE)

Sept économies de progression existent déjà dans ce système (Endurance, Mana, points d'inspiration, points d'attribut, feats, créneaux d'étude, Piété). Un nouveau passif ne doit **jamais** créer une huitième économie : il se classe dans une des catégories existantes selon sa portée.

### Grille de classement

| Nature du passif | Catégorie | Coût |
|---|---|---|
| Extension de puissance rivalisant avec une lignée de sorts | Nœud d'arbre de domaine (section 17) | Points d'inspiration |
| Connaissance/capacité rare, pas un pouvoir de combat direct | Créneau d'étude (section 23) | Aucun (une fois par palier de maîtrise) |
| Ambiant/conditionnel, modeste, symétrique (bonus quelque part = malus ailleurs) | Résonance domaniale | Gratuit dès investissement dans le domaine |
| Modifie tous les sorts offensifs d'un domaine, ou débloque une branche entière (portée large) | **Feat domanial** | Slot de feat (niveaux 5/10/15/20), souvent avec prérequis |
| Universel, pas lié à un domaine précis | Feat existant | Slot de feat (niveaux 5/10/15/20) |

### Feats domaniaux (catégorie formalisée)

Se prennent aux mêmes paliers que n'importe quel feat (5/10/15/20, en concurrence avec le point d'attribut). Exigent souvent un prérequis : un vécu compatible (background) qui le rend gratuit, ou un investissement minimal déjà fait dans le domaine concerné (une spécialisation qui modifie des sorts existants n'a pas de sens sans avoir déjà quelque chose à modifier).

**Source unique** : le catalogue complet vit désormais dans les fiches de domaine — champ `feats` de `frontend/public/resources/json/domains/<domaine>.json`, affiché sur la page du domaine (section « Feats domaniaux », groupée par palier). Quatre feats par domaine, les douze domaines plus Renforcement et Émission. Chaque entrée déclare son palier (`level`), sa nature mécanique (`kind`), son prérequis, le background qui le rend gratuit s'il y en a un (`freeWith`), ses exclusions mutuelles (`excludes`) et le détail chiffré ligne par ligne (`effects`, chaque ligne marquée `boon` ou `cost`).

`kind` dit OÙ le feat s'applique, conformément au mécanisme ci-dessous : `multiplier` (un facteur de plus dans la chaîne météo × moment), `override` (propriété structurelle vérifiée à la résolution), `unlock` (une possibilité qui n'existait pas).

Extrait de référence (Lumière) :

| Feat domanial | Palier | Prérequis | Effet |
|---|---|---|---|
| Lumière focale | 5 | Palier Mineur Lumière débloqué | +25% dégâts sorts offensifs Lumière, cible unique verrouillée |
| Lumière diffuse | 5 | Palier Mineur Lumière débloqué | Sorts offensifs Lumière touchent une zone (rayon 3m), −20% dégâts |
| Force Zénith | 10 | Palier Median Lumière débloqué | Midi : +2 Force / Nuit : −2 Force |
| Verbe impératif | 15 | Palier Majeur Lumière + Verbe d'autorité | +1 cible sur un sort de commandement, le lanceur ne peut plus mentir pendant sa durée |

Règle d'écriture tenue dans tout le catalogue : aucun feat n'est un bonus pur. Chacun paie son gain par une contrepartie chiffrée ou structurelle (coût en mana, dégâts réduits, ciblage verrouillé, exposition du lanceur), en plus du slot dépensé.

### Implémentation des spécialisations de domaine (mécanisme)

Ne jamais éditer chaque sort individuellement. Réutilise la chaîne de multiplicateurs déjà posée pour météo/moment de la journée (sections 19-20) :

```
Numérique pur (dégâts, coût) → multiplicateur de plus dans la chaîne existante :
   dégâts_finaux = dégâts_de_base × modificateur_météo × modificateur_moment
                   × modificateur_spécialisation_domaine

Structurel (ciblage, portée, type d'effet) → override vérifié à la résolution,
   pas un multiplicateur (même logique que attackAttribute consulté au
   moment du jet, section 13, pas stocké dans chaque sort).
```

### Lumière — passifs proposés

**Force zénith** (Résonance domaniale, gratuite dès investissement) :
```
Midi : +2 Strength
Nuit : −2 Strength
```
Symétrique sur les deux pics déjà chiffrés section 20, jamais un bonus pur sans contrepartie.

**Lumière focale / Lumière diffuse** : voir table des feats domaniaux ci-dessus, mutuellement exclusifs.

## 25. THREADS OUVERTS

- **Météo (section 19)** : impact ressources chiffré à titre de départ, pas encore testé en jeu.

- **Compétences de classe** : les 5 classes sont reworkées (section 15), 13 compétences offensives calibrées chiffrées. Reste ouvert : emplacement niveau 14 du Vagabond (libre, non tranché), créature de bestiaire pour Compagnon animal (Ranger, fiches non fournies), Second souffle/Méditation (même correctif "stat attendue" mais benchmark soin/mana à définir), multi-hits (Maître d'armes, Fureur/Rupture totale, Ombre parfaite) à raffiner par frappe, et toutes les compétences non-offensives (statut/buff/utilitaire) qui suivent une logique qualitative distincte.

- Résolution des sorts (précision/coût) confirmée conforme au système actuel (section 13). Attaque magique = pur dégâts, branches = build libre, aucun des deux ne représente le Flux. Piste alternative pour le Flux détaillée séparément (statut : proposition, pas adoptée), à valider avant intégration.
- Jets de sauvegarde : formule posée (Vigueur/Réflexes/Volonté sur CON/DEX/SAG), sévérités calées sur les tiers de coût de sort, à recalibrer une fois testées en jeu.
- ~~Formule de croissance par niveau~~ : résolue (section 14, dé de classe + modificateur d'attribut, filet de sécurité posé). Reste à préciser quel attribut gouverne atk_mag vs mana.
- Valeurs numériques précises (combien de segments avant le palier suivant, etc.) volontairement non fixées : à caler selon la durée de vos sessions et le rythme de jeu souhaité (survie pure vs aventure ponctuée de survie).
- Interaction chiffrée précise entre Réserve/Flux et les jauges physiques (quel malus exact sur quel palier) à définir maintenant que le système de résolution est posé.
- Identité de la "Race 3" (fiche Amphibie) à confirmer : nouvelle 5e race, ou sous-type de Bête-Humaine propre à l'Archipel/aux zones aquatiques ?
- Déséquilibre du budget "Modificateurs d'attributs" (section 12.B) et du nombre d'aptitudes raciales (section 12.C) à corriger ou à justifier explicitement.
- Cas des Bêtes-Humains de Luxarion et des Nés du Cataclysme, non traités dans les fiches raciales fournies faute d'un profil régional unique.
- ~~Formule CON/jauges de survie~~ : résolue (section 2, réservoir Faim/Soif scalé par CON, paliers en %, malus de précision et Endurance connectés aux systèmes déjà écrits).
- **Traits (section 16)** : catalogue posé, à tester en jeu pour le calibrage fin (certains chiffres comme "Métabolisme de fer +20%" sont des points de départ raisonnables, pas vérifiés par calcul comme les compétences de classe). Contrecoup divin : les sévérités numériques exactes par source (quelle valeur précise pour chaque dieu/situation) restent à cas par cas plutôt qu'en table exhaustive.
- **Économie d'action** : action bonus définie (self-buff ou coût réduit), canalisation immobilise totalement, arme secondaire calculée sans le terme atk_phy. Seuil précis pour l'éligibilité des compétences/sorts en action bonus encore en discussion (option seuil absolu vs option "version rapide" en branche).
- **Cumul météo/moment de la journée** (section 19/20) : Nuit (moment) et Nuit magique (météo), ou Midi et Ciel radieux, ont des valeurs identiques (×1,3/×0,7). Cumul multiplicatif ou plafonné non tranché.
