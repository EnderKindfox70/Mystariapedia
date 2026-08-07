# La table de combat — règles et mécaniques

Ce document décrit **tout ce que le moteur de combat sait faire**, et pourquoi
chaque règle est ce qu'elle est. Il double la documentation qui vit dans le code :
si les deux divergent, c'est le code qui fait foi — les constantes citées ici
sont exportées et testées.

Le moteur vit dans [`frontend/src/app/combat/`](../frontend/src/app/combat/).
Il est en TypeScript pur : ni Angular, ni réseau, ni horloge. La vue
([`views/combat/`](../frontend/src/app/views/combat/)) n'est qu'un pilote.

---

## 1. Les principes

Quatre décisions structurent tout le reste.

**Le MJ pilote, le moteur calcule.** Aucune créature ne joue toute seule. Tu
déplaces, tu choisis les actions ; le moteur lance les dés, applique les dégâts,
les résistances, les statuts, décompte les durées, et **explique chaque calcul
au journal**. Rien ne bouge sans qu'on puisse dire pourquoi.

**Une seule porte d'entrée.** `applyAction(rencontre, action)` est la seule
fonction qui modifie une rencontre. La vue n'écrit jamais dans l'état : elle
envoie une action et reçoit l'état suivant. Toute modification passe donc
forcément par le journal — y compris les corrections manuelles du MJ.

**Une partie est rejouable.** Tout l'aléatoire passe par un couple
`(seed, rollCount)` sérialisé avec la rencontre. Recharger une sauvegarde
redonne exactement les mêmes jets ; rejouer un combat entier permet de vérifier
un calcul contesté.

**Les données du wiki font loi.** Portées, zones, statuts, sorts : le moteur les
lit, il ne les duplique pas. Le vocabulaire des fiches est régulier
(« 12 m », « Contact », « Rayon 5 m », « Cône 8 m ») et se laisse analyser. Une
formulation inconnue retombe sur un défaut sûr et n'empêche jamais de jouer.

---

## 2. La grille

**Une case vaut 1,5 m.** Les fiches du wiki écrivent leurs portées en mètres :
elles restent la référence, la grille n'est qu'une façon de les mesurer. Toutes
les comparaisons se font en mètres, jamais en cases — sinon un arrondi de
conversion ferait mentir la fiche du sort.

**Distance de Tchebychev** : la diagonale coûte comme la ligne droite. C'est la
règle usuelle sur grille carrée et elle évite d'arbitrer des demi-cases en pleine
partie.

**Empreinte au sol** selon la taille du bestiaire : `TP`/`P`/`M` → 1 case,
`G` → 2×2, `TG` → 3×3. La distance entre deux combattants est la plus courte
entre leurs cases occupées — un ogre est au contact dès qu'un de ses quatre
pieds l'est.

### Les décors

Un décor n'est pas seulement « passable ou non ». Trois propriétés indépendantes
suffisent à tout couvrir : **bloque le passage**, **bloque la vue**, **coûte plus
cher**. Les croiser donne des terrains tactiquement distincts — un fourré se
traverse mais cache, un gouffre se franchit du regard mais pas des pieds.

| Décor | Passage | Vue | Coût |
|---|---|---|---|
| Mur, Rocher, Arbre | bloqué | bloquée | — |
| Gouffre | bloqué | **libre** | — |
| Fourré | **libre** | bloquée | ×2 |
| Point d'eau, Boue, Ruines | libre | libre | ×2 |

Les combattants bloquent le passage mais pas la vue — on ne surcharge pas la
table de règles de couvert.

Le catalogue vit dans [`terrain.ts`](../frontend/src/app/combat/terrain.ts) :
ajouter un décor y tient en une entrée, sans toucher au moteur ni au CSS. Les
rencontres sauvegardées avant les types de décor restent lisibles — les anciens
murs deviennent des murs, les anciennes cases difficiles des ruines.

### Déplacement

```
mètres par tour = (4 + (vitesse − 10) × 0,3) cases × 1,5 m
```

| Vitesse | Déplacement |
|---|---|
| 10 | 6 m (4 cases) |
| 20 | 10,5 m (7 cases) |
| 30 | 13,5 m (9 cases) |

Volontairement bas : sur un plateau de 20 cases, traverser la moitié du terrain
en un tour rendrait le placement sans enjeu. Les portées et les zones ne pèsent
que si l'on ne peut pas tout rattraper.

Le chemin est calculé par Dijkstra : on contourne les murs et les corps, on paie
le terrain difficile. Le budget se décompte entre plusieurs déplacements d'un
même tour.

---

## 3. Le tour

### Ordre d'initiative — la Vitesse décide

**Pas de jet.** L'ordre est `vitesse effective`, décroissant, ex æquo départagés
sur la Dextérité puis sur le nom. Entièrement déterministe, donc reprendre une
sauvegarde retrouve exactement la même file, et un combattant rapide garde son
avantage d'un round à l'autre au lieu de le perdre sur un mauvais dé.

Les buffs de vitesse comptent : une hâte peut faire passer devant.

### Ce qui se passe à l'ouverture d'un tour

1. Déplacement et action remis à neuf, **réaction rechargée**
2. Récupération d'endurance
3. Effets par tour des statuts (dégâts, soins)
4. Jets de sauvegarde périodiques
5. Décompte des durées — statuts et effets qui expirent

Un combattant à terre est sauté. Boucler sur l'ordre incrémente le round et
redéclenche la météo.

### Ressources du tour

| Ressource | Règle |
|---|---|
| **Déplacement** | budget en mètres, décompté au fur et à mesure |
| **Action** | une par tour |
| **Réaction** | une par round, hors de son tour |

### Les cinq familles d'action

L'interface les range par nature, pour qu'un combattant chargé de sorts ne noie
pas ses options :

**Attaque de base** (arme, poing, morsure) · **Compétences** (classe) ·
**Magie** · **Objets** · **Garde**

### La garde

Renoncer à frapper pour encaisser **et reprendre haleine** : **+10 en défense
physique et magique** jusqu'au début de son prochain tour, **et +5 de souffle**.
Elle ne coûte rien. Tout le monde l'a, créatures comprises.

Le gain défensif est franc parce que l'absorption est proportionnelle : +10 fait
passer une armure légère de 17 % à 37 %.

Mais c'est le souffle qui en fait le pivot du combat. La récupération passive
(1 à 5 par tour) ne couvre pas le coût d'une attaque : **se garder est le seul
geste qui refait vraiment la réserve**. Le combat y gagne son tempo — on frappe
tant qu'on tient, on se couvre pour souffler — et la garde cesse d'être le tour
qu'on subit faute de mieux.

---

## 4. Les ressources

### Points de vie

À 0, le combattant est **hors de combat** — il reste sur la grille et ne joue
plus. Un soin qui le repasse au-dessus de 0 le relève.

### Endurance

C'est la monnaie du corps : les armes, les compétences de classe **et le
déplacement** la consomment. Les sorts non — ceux-là se paient en mana.

```
récupération passive par tour = max(1, 1 + modificateur de Constitution)
GARDE                         = +5 de souffle
déplacement                   = 1 par 3 m, au-delà d'un pas gratuit
compétence de classe          = ×1,5 le prix écrit sur la fiche
```

**On récupère moins qu'une action ne coûte.** Une attaque vaut 1 à 5 selon
l'arme ; respirer en rend 1 à 5 selon la Constitution, et le plus souvent 2.
Frapper draine donc, tour après tour.

C'est un changement de fond : tant que la récupération couvrait la dépense, la
jauge *montait* pendant qu'on se battait. Le banc d'essai l'a établi sans appel
— **2 784 combats sans un seul tour perdu faute de souffle**, et des réserves
qui ne descendaient jamais sous 65 %. L'endurance n'était pas une ressource,
c'était une décoration.

| Constitution | Modificateur | Récupération |
|---|---|---|
| 18 | +4 | 5 |
| 10 | 0 | **1** |
| 6 | −2 | **1** (plancher) |

**Courir essouffle.** Le premier pas (1,5 m) est gratuit chaque tour ; au-delà,
chaque tranche de 3 m entamée coûte 1. C'est la pièce qui fait compter la
réserve même dans un combat court : les actions se choisissent, le déplacement
se subit — presque tout le monde bouge, presque tous les tours.

Le péage se calcule sur le **cumul du tour**, jamais sur chaque pas : fractionner
son trajet en trois petits bonds coûte exactement ce que coûte le même trajet
d'un trait. Et la surbrillance de la vue montre les cases que le *souffle*
permet, pas celles que les jambes permettraient — un combattant à bout voit sa
portée fondre à un pas, ce qui se lit d'un coup d'œil.

**Un grand geste se mérite.** Les fiches de classe chiffrent l'effort « à
froid » ; en combat il vaut une fois et demie ce prix. Une Frappe puissante
passe de 5 à 8 pour une réserve de 14 : on ne la place plus deux fois dans le
même échange, et le choix entre le grand coup et l'attaque ordinaire redevient
un choix.

**Reprendre haleine se mérite : c'est la garde.** Se couvrir ne coûte plus rien
et rend 5 de souffle — plusieurs tours de respiration en un geste. Le combat y
gagne son tempo : on frappe tant qu'on tient, on se couvre pour souffler. Et la
garde cesse d'être le tour qu'on subit faute de mieux.

### À bout de souffle

Tomber à zéro ne se paie pas seulement en actions refusées. On continue de se
battre, mais mal :

| | Effet |
|---|---|
| Précision | **−2 crans** (le seuil monte de 2) |
| Vitesse | **de moitié** — donc déplacement, initiative **et** esquive naturelle |
| Actions trop chères | refusées, comme avant |

La Vitesse portant trois métiers, la sanction se paie sur les trois à la fois.
C'est voulu : un combattant épuisé devient une proie.

**On ne s'en relève pas au premier point regagné.** Il faut avoir refait la
**moitié** de sa réserve — sans ce seuil de sortie, on oscillerait autour de zéro
en retrouvant sa pleine forme un tour sur deux. À respirer seul, cela prend
plusieurs tours ; en se gardant, deux ou trois.

### Mana

Ne se régénère pas en combat. La réserve de départ est la réserve du combat
entier — c'est ce qui fait des sorts une ressource finie.

---

## 5. Résoudre une attaque

### Le jet de toucher

**Deux axes, étanches.** La *précision* décide si le coup porte ; la *défense*
décide ce qu'il coûte. Ni l'une ni l'autre n'entre dans le calcul de la seconde
— sans quoi une armure lourde rendrait à la fois introuvable et inentamable, et
l'écart entre deux niveaux se compterait deux fois.

```
seuil = 8 − précision / 5                    borné 3 à 18
précision = modificateur d'attribut × 4
          + maîtrise × 2
          − esquive naturelle de la cible
          − gêne de tir
```

**Un d20 à seuil mobile.** Le dé se lance dans la main, ses vingt cases se
lisent d'un coup d'œil, et le 1 comme le 20 sont des repères que personne n'a
besoin qu'on lui explique. Ce qui bouge, c'est le **seuil**, pas le dé : des
seuils fixes auraient rendu la précision décorative, et un niveau 15 à la
rapière aurait touché comme un niveau 1 à la hache.

> **Le modificateur ne s'ajoute PAS au dé.** C'est l'inverse du d20 classique,
> et c'est la première question que se pose qui en vient. Le dé est lu tel
> qu'il tombe ; la précision **descend le seuil**. Faire 12 contre un seuil de
> 7+, c'est avoir fait 12 sur le dé — pas 9 plus 3. Le journal le répète à
> chaque jet, pour n'avoir jamais à l'expliquer en pleine partie :
>
> ```
> Attaquant touche Cible — Épée longue (dé 12 / 7+) : 9 dégâts [14 bruts] de Tranchant.
>    dé 12 brut (rien ne s’y ajoute) contre seuil 7+ — socle 8 − 1 : précision → touche
> ```

**La précision s'accumule fin, s'arrondit une fois.** Ses termes n'ont pas le
même ordre de grandeur : la maîtrise pèse des dizaines de points, l'esquive
naturelle un à quatre. On les additionne sur une échelle fine, *puis* on
convertit en crans de dé (5 points = 1 cran). Arrondir chaque terme séparément
aurait effacé les petits.

**L'attribut vient de l'outil, pas du personnage.** Chaque capacité porte le
sien (`attackAttribute`), renseigné à la source : une arme hérite de celui de sa
catégorie (`weapon_category.json`), une compétence physique vise à la Force, un
sort à l'Intelligence.

| Arme | Vise à |
|---|---|
| Rapière, dague, katana, arcs, fouet | Dextérité |
| Hache de bataille, claymore, marteau | Force |
| Bâton | Sagesse |

`atk_phy` et `atk_mag` n'entrent **pas** dans la précision : elles pilotent déjà
les dégâts.

### Les degrés de réussite

| d20 | Résultat | Dégâts |
|---|---|---|
| **1** | **Raté**, toujours | rien |
| < seuil − 5 | Raté | rien |
| seuil − 5 … seuil − 1 | **Effleure** | ÷ 4 |
| ≥ seuil | **Touche** | pleins |
| **20** | **Critique**, toujours | ×1,5 |

Le 1 et le 20 priment sur le seuil, si haut ou si bas soit-il. C'est ce qui
empêche un affrontement d'être joué d'avance, et ce qui fait les histoires qu'on
raconte après la partie.

Le socle est délibérément **sévère** : sans entraînement ni arme qui lui
convienne, on ne touche pas si aisément. Un combattant seulement compétent
(précision +10) retombe sur 6+, et c'est déjà un professionnel.

| Combattant | Seuil | Raté | Effleure | Touche | Espérance |
|---|---|---|---|---|---|
| Précision nulle | 8+ | 10 % | 25 % | 60 % | 0,74 |
| Compétent (+10) | 6+ | 5 % | 20 % | 70 % | 0,83 |
| Aguerri (+20) | 4+ | 5 % | 10 % | 80 % | 0,90 |
| Virtuose (plancher) | 3+ | 5 % | 5 % | 85 % | 0,94 |
| Tir gêné | 13+ | 35 % | 25 % | 35 % | 0,49 |

**La bande d'effleurement suit le socle.** Durcir l'un sans l'autre ferait
tripler les tours secs — or ce qu'on veut d'un barème sévère, c'est que les
coups portent mal, pas qu'ils volent le tour d'un joueur qui n'en a qu'un. Au
seuil de référence, un mauvais jet écorne donc deux fois et demie plus souvent
qu'il ne rate franchement.

Le plancher à 3 laisse au virtuose une marge d'échec qui ne se réduit pas à la
seule face fatidique : même parfaitement armé, il lui reste un cran où le coup
passe mal.

Un coup manqué s'arrête net — ni dégâts, ni statut, ni riposte. Il n'a pas eu lieu.

Les jets de **sauvegarde** partagent le même dé : ils relèvent des statuts, pas
du toucher, mais il n'y a désormais qu'un seul dé dans tout le jeu.

### Qui jette les dés

**C'est la forme qui décide, pas la nature.** Un trait d'ombre peut manquer ; un
souffle qui remplit un cône ne le peut pas — il n'a rien à ajuster, il occupe
l'espace. Ce qui s'oppose à une zone, ce sont les jets de sauvegarde.

| Forme | Jet |
|---|---|
| Cible unique (arme, poing, crocs, sort ciblé) | **oui** |
| Rayon, cône, ligne | non |

### Esquive

Deux choses différentes portent ce nom, et elles ne se résolvent pas au même
endroit.

**L'esquive naturelle** — `vitesse ÷ 10` — s'oppose à la précision dans la
formule. Être vif rend plus dur à atteindre. Modeste par construction : 2 points
à vitesse 20, 4 à vitesse 40 — soit moins d'un cran de dé. C'est justement
pourquoi la précision s'additionne avant d'être convertie : arrondie seule,
l'esquive naturelle ne pèserait jamais rien.

**L'esquive accordée par un buff** (Camouflage 40 %, Disparition 75 %) est un
**effacement**, pas une gêne : elle ne rend pas difficile à viser, elle fait
qu'il n'y a plus rien à viser. Elle se teste donc *avant* le jet et l'emporte sur
lui. Les buffs ne se cumulent pas entre eux — on retient le meilleur.

### Tir gêné

Une arme à projectile servie trop près de sa cible perd **25 points de
précision**, soit cinq crans : le seuil passe de 8+ à 13+, à peu près moitié
moins de dégâts espérés. Zones : 2 cases pour l'arc court, 3 pour l'arc long, 1
pour l'arbalète et la fronde. Un tireur adroit en compense une partie — ce
qu'une division des dégâts ne permettait pas.

### L'érosion du scaling

Les dégâts d'un sort valent `dés + ratio × attaque du lanceur`. Cette seconde
part **s'érode** à mesure que le lanceur dépasse le niveau auquel le sort
s'apprend :

```
part restante = 1 / (1 + (niveau du lanceur − niveau du sort) / 10)
```

| Écart | Scaling restant |
|---|---|
| 0 (on vient de l'apprendre) | 100 % |
| 5 niveaux | 67 % |
| 10 niveaux | **50 %** |
| 20 niveaux | 33 % |

**Un sort de bas niveau ne doit pas rester redoutable pour toujours.** Sans
cette règle, le premier nœud de Boule de feu — un sort de niveau 5 — infligeait
34 dégâts à qui venait de l'apprendre et **86** à une archimage de niveau 15.
Le même sort, deux fois et demie plus fort, sans avoir été amélioré : c'est ce
qui permettait de tuer un guerrier de niveau 20 en deux coups avec un sort
d'apprenti.

**Les dés ne s'érodent jamais.** C'est la puissance propre du sort, celle que la
fiche annonce. Seule décroît la part qu'il emprunte à son lanceur. Monter en
puissance passe donc par les **paliers** du sort — les acheter, les améliorer —
et non par le simple fait de vieillir.

Les armes et les compétences de classe ne sont pas concernées : elles n'ont pas
de niveau d'accès.

### Chaîne de calcul des dégâts

Pour chaque composante de dégâts, dans cet ordre :

```
dés (min–max)
  + scaling (ratio × stat de l'attaquant)
  + enchantements actifs        ← composantes séparées, avec leur propre type
  × ambiance (météo + heure)    ← selon le domaine du sort
  × gêne de tir                 ← si la cible est trop proche pour l'arme
  → affinité de la cible        ← immunité / résistance / faiblesse / absorption
  − absorption de l'armure      ← en pourcentage
  = dégâts appliqués (plancher 1 si le coup porte)
```

### Affinités

| Affinité | Effet |
|---|---|
| Immunité | 0 dégât |
| Résistance | ×0,5 |
| Faiblesse | ×1,5 |
| **Absorption** | soigne au lieu de blesser |

### La défense réduit, elle ne bloque pas

```
absorption = défense ÷ (défense + 25)
```

| Défense | Absorbe |
|---|---|
| 2 | 7 % |
| 5 | 17 % |
| 10 | 29 % |
| 20 | 44 % |
| 40 | 62 % |

**Un pourcentage, pas une soustraction.** C'est essentiel : les dégâts vont de 5
(un poing) à 80 (une frappe de niveau 20). Une soustraction fixe de 5 annulerait
entièrement le poing sans rien peser sur l'ultime. Le pourcentage retire la même
*part* aux deux.

Elle **n'atteint jamais 100 %**, et un plancher d'un point garantit qu'un coup
qui porte fait toujours quelque chose. Une immunité, elle, annule toujours tout.

La défense opposée dépend du type : `def_phy` contre les dégâts physiques,
`def_mag` contre les magiques, rien contre les dégâts absolus (`true`). Chaque
composante est parée par la défense de **son** type — une flèche enflammée bute
sur l'armure pour sa part perforante et sur la résistance magique pour son feu.

**Ce que l'armure n'arrête pas** : les effets par tour (un poison est déjà dans
les veines), la météo, le contre-coup, les dégâts proportionnels, les
ajustements manuels du MJ.

---

## 6. Les attaques de base

### Armes

```
dégâts = dégâts de l'arme + 25 % de l'attaque physique (+ projectile)
```

Les armes du wiki sont chiffrées bas (3–7 pour un bâton) parce qu'elles décrivent
l'outil, pas le bras. Sans la part d'attaque, une arme resterait aussi mortelle
au niveau 1 qu'au 20.

Le **projectile** forme une composante *séparée*, avec son propre type : les
résistances s'appliquent correctement à chacun, et le journal montre les deux
lignes. Il est apparié automatiquement d'après `compatibleWith` du catalogue de
munitions — carreaux pour les arbalètes, flèches pour les arcs, billes pour la
fronde.

### Portées et zone de gêne

Le catalogue ne dit que « Mêlée » ou « Distance » : on chiffre ici ce qu'il
laisse implicite.

| Arme | Portée | Zone de gêne |
|---|---|---|
| Fronde | 12 m | 1 case |
| Arbalète de poing | 9 m | 1 case |
| Arbalète | 24 m | 1 case |
| Arc court | 18 m | 2 cases |
| Arc long | 30 m | 3 cases |
| Mêlée | 1,5 m | — |
| Mêlée (allonge) | 3 m | — |

**La zone de gêne** : tirer sur quelqu'un qui vous colle est malcommode, d'autant
plus que l'arme est encombrante. Une cible à l'intérieur rend le tir
**désavantagé — dégâts ×0,5**. Le tir part quand même, mais mal servi.

> Le « désavantage » a dû être traduit : sans jet de toucher, « relancer et
> prendre le pire » n'a plus de sens. C'est une perte de puissance.

### Attaque au poing

**Tout le monde l'a**, armé ou non. Entièrement dérivée de l'attaque, contondante,
**sans dé de base** — un poing vaut exactement ce que vaut le bras qui le lance.

```
commun    : 25 % de l'attaque physique
pugiliste : 45 %
```

### Munitions

Décomptées pour de vrai. Tirer retire une flèche ; carquois vide, le tir est
refusé (`Plus de flèches (0/1)`). Une ligne épuisée reste affichée, barrée : elle
dit qu'il faut refaire le plein.

L'inventaire d'une fiche étant du texte libre, un carquois de 20 est accordé
d'office quand la fiche ne mentionne pas de munition — sinon beaucoup d'archers
seraient incapables de tirer.

### Créatures

Le bestiaire ne chiffre aucune attaque nommée, seulement une puissance brute.
Deux attaques en sont dérivées :

- **Morsure** — 25 % de l'attaque physique, perforant, au contact
- **Prise au sol** — 10 % de l'attaque, et surtout **60 % d'`enracinement`** : la
  cible ne peut plus se déplacer

Aucune créature n'a d'attaque à distance d'office. Un loup ne projette rien, et
son attaque magique résiduelle (2 points sur sa fiche) ne suffit pas à en faire
un lanceur de sorts.

---

## 7. Les sorts

Un personnage joue ses sorts **équipés**, au palier le plus avancé qu'il ait
débloqué. Un arbre qui se scinde donne plusieurs versions du sort : elles sont
toutes proposées.

### Lecture des fiches

| Champ de la fiche | Lecture |
|---|---|
| `« Personnel »` | portée 0, sur soi |
| `« Contact »`, `« Autour de soi »` | 1 case |
| `« 12 m »` | 12 m |
| `« Rayon 5 m »` | disque autour de la case visée |
| `« Cône 8 m »` | ouverture 90° depuis le lanceur |
| `« Ligne 10 m »` | droite du lanceur vers la cible |
| `« 3 cibles »` | désignées une à une |
| `« ≈ 50 L »`, `« Bassin / source »` | cible unique — rien à mesurer sur une grille |

### Sorts de revêtement — les enchantements

`*-revetement-poings` (14 sorts) et `*-revetement-arme` (14 sorts) **n'infligent
rien à l'incantation** : ils nimbent les poings ou l'arme pour la durée, et
ajoutent une composante de dégâts **à chaque coup porté**.

C'est une vraie composante, avec son propre type : des Poings d'ombre ajoutent
`dark` à un coup `bludgeoning`, et les deux sont encaissés séparément.

**Un revêtement chasse le précédent** — on ne nimbe pas ses poings deux fois. Le
remplacement est **ciblé** (enchanter ses poings ne désenchante pas son arme) et
**partiel** : seul l'enchantement est remplacé. Une Transe de combat qui donnait
aussi de la vitesse garde sa vitesse.

Un enchaînement en profite à chaque coup : Combo rapide sous Poings d'ombre fait
3 coups + 3 nimbes.

### Téléportation

`teleport` déplace le lanceur sur la case visée, sans se soucier du terrain ni
des corps. La distance du saut est `teleportRange` quand elle diffère de la
portée de l'effet — indispensable dès que le sort agit à l'arrivée (l'Évasion
enflammée a une portée « Autour de soi » qui décrit son *brasier*, pas son bond).

### Bonus de classe

Un même sort ne vaut pas la même chose dans toutes les mains. Les quatre formes
sont appliquées :

| Forme | Traitement |
|---|---|
| `scaling` | ajouté au scaling des dégâts (et de l'enchantement) |
| `manaFactor` | multiplie le coût — pugiliste + Poings foudroyants : coût ÷ 2 |
| `effects` | ajouté aux modificateurs de stats posés |
| `freeStrike` | **frappe gratuite** offerte au lanceur |
| `description` | affichée au journal quand elle n'est pas chiffrable |

**La frappe gratuite** n'est pas portée d'office : elle est **offerte**. Le
joueur désigne sa cible parmi celles à portée, ou passe. Elle ne coûte ni action,
ni endurance, ni munition, elle profite de l'enchantement qui vient d'être posé,
et **ne survit pas à la fin du tour**.

---

## 8. Compétences de classe

Débloquées selon le niveau, elles coûtent leur endurance et consomment l'action.

Les 38 compétences de `classes.json` portent un bloc `combat` chiffré, aux mêmes
noms de champs qu'un nœud de sort — **elles se règlent en éditant le JSON, jamais
le code**.

Deux exceptions volontaires : **Pister** et **Crochetage expert** sont
explicitement hors combat. Elles restent déclarables, leur description tient lieu
de règle, et le MJ tranche.

### Le pugiliste et ses poings

Ses enchaînements ne portent **pas de dégâts propres** : ils répètent l'attaque
au poing.

| Compétence | Coups | Part d'attaque par coup |
|---|---|---|
| Combo rapide | 3 | 24 % |
| Déferlante de coups | 4 | 20 % |

> Pourquoi moins que les 45 % d'un poing isolé ? Parce que **dans cet univers
> l'attaque dépasse les points de vie à niveau égal** (au niveau 10 : 89
> d'attaque contre 84 PV). Trois poings pleins tueraient mécaniquement un pair,
> quel que soit le réglage. Le coup isolé et l'enchaînement ont donc deux
> curseurs séparés.

Ses buffs de poing sont des **enchantements** : ils ne profitent qu'aux mains
nues. Nimber ses poings ne rend pas une épée plus tranchante.

| Compétence | Enchantement |
|---|---|
| Transe de combat | +2–4 contondant |
| Poing de fer | +4–7 contondant |
| Avatar du combat | +5–9 contondant |

---

## 9. Statuts et effets

Deux mécanismes distincts.

**Les statuts** viennent du catalogue `status_effects.json` : brûlure, poison,
paralysie… Ils ont une clé, une durée, des effets par tour, des jets de
sauvegarde, et peuvent empêcher d'agir, de bouger ou d'incanter.

**Les effets** sont posés par les capacités : modificateurs de stats chiffrés,
esquive, riposte, enchantement, purge. Ils n'ont pas de clé.

### Points d'attention

**Le catalogue porte des valeurs déjà signées.** La Rage est un buff (+5 atk_phy)
qui coûte quand même de la défense (−3 def_phy) : le signe ne peut pas se déduire
de la catégorie. Les effets de *sorts*, eux, portent une magnitude positive dont
le sens vient de la cible — hostile ou alliée.

**La puissance du lanceur est figée à l'application.** Le poison d'un mage mort
ne faiblit pas, et un buff obtenu après coup ne ravive pas une vieille brûlure.

**Une durée négative est illimitée.** Seul un jet de sauvegarde réussi, un soin
ou le MJ y met fin.

**Un effet ne s'empile jamais sur lui-même.** Relancer un buff déjà porté le fait
repartir pour sa durée pleine, avec les valeurs de la nouvelle incantation — il
ne s'y ajoute pas. Sans quoi la parade la plus terne deviendrait imprenable à
force d'être répétée (trois Durcissements vaudraient +30 de défense) et le
contre-coup qui devait en être le prix se diluerait dans le lot. L'identité d'un
effet, c'est la capacité qui l'a posé **et** qui le porte : le même sort tenu sur
deux alliés reste deux effets, et deux sorts différents qui haussent la même stat
se cumulent normalement.

### La riposte

Un buff peut punir qui frappe son porteur (`retaliate`). Son champ `trigger` dit
contre quoi :

| `trigger` | Ce qui la déclenche |
| --- | --- |
| `melee` (défaut) | Tout coup porté depuis une case adjacente (≤ 1,5 m), arme comprise — y compris un sort lancé à bout portant. |
| `unarmed` | Seulement ce qui touche **à même la chair** : poings, crocs, serres. Une lame, une pique, une flèche n'y laissent rien. |
| `any` | N'importe quelle attaque, à n'importe quelle portée. |

Dans les trois cas elle ne répond qu'à ce qui **blesse** : un malus ou un buff
posé au contact ne « saisit » personne.

`unarmed` est le déclencheur des défenses passives — épines, carapaces. Il donne
son contre-jeu au décor de la règle : une arme d'allonge tient son porteur hors
de portée, et frapper un lézard rocailleux durci avec une lance plutôt qu'au
poing est une décision tactique qui se paie ailleurs.

**Le mouvement rouvre les plaies** : le saignement inflige ses dégâts une seconde
fois quand la cible se déplace, comme sa fiche l'annonce.

### Incohérence connue dans les données

`status_effects.json` nomme ses dégâts en français (`feu`, `physique`) là où
`damage_type.json` fait foi en anglais (`fire`, `bludgeoning`). Le moteur
réconcilie les alias, sans quoi une brûlure ignorerait la résistance au feu d'une
créature.

**`poison` n'existe pas dans `damage_type.json`** alors que le statut du même nom
en inflige. Conséquence : personne ne peut y être résistant. À ajouter au
catalogue si tu veux que ce soit le cas.

---

## 10. Réactions et attaques d'opportunité

Une réaction se joue **hors de son tour**, en réponse à ce que fait quelqu'un
d'autre. Une par round, rechargée au début de son propre tour.

### Comment le moteur interrompt une action

C'est le point technique le plus délicat, et il rend possible tout le reste.

```
1. Tu attaques        → le moteur détecte une cible capable de réagir
2. Il RANGE ton action dans `encounter.suspended` — rien n'est encore payé
3. Le défenseur choisit : réagir, ou laisser passer
4. L'action est REJOUÉE depuis le début — dans un monde qui a pu changer
```

Trois conséquences :

**L'esquive n'a pas besoin d'être codée.** Le Pas dimensionnel téléporte, puis
l'attaque reprend et vise une case désormais vide → « Aucune cible valide ».
L'esquive *émerge* de la géométrie. Et l'attaquant a quand même dépensé son
action : se dérober n'est pas gratuit pour lui.

**Ça survit à une sauvegarde.** L'action interrompue est dans la rencontre, pas
dans une variable de la vue.

**Rien n'est payé avant la fenêtre.** Mana, endurance, munitions et jets de
sauvegarde sont tous prélevés *après* le point d'interruption — sinon une reprise
paierait deux fois.

### Voir le coup venir

Une parade demande d'abord de **réagir à temps**. Le jet se fait à la Dextérité,
et il se fait **avant** que le menu n'apparaisse : un combattant pris de court ne
se voit pas proposer un choix qu'il n'a pas le temps de faire.

```
réflexe = mod(Dextérité) × 4 + maîtrise × 2 − vivacité de l'assaillant
seuil   = 8 − réflexe / 5                       borné 3 à 18
```

Même grammaire que le jet de toucher — mêmes coefficients, même conversion en
crans, mêmes bornes, mêmes 1 et 20 souverains. Il n'y a qu'un seul barème à
retenir dans tout le jeu.

**Pourquoi la Dextérité et pas la Vitesse.** La Vitesse fait déjà trois métiers
(déplacement, initiative, esquive naturelle) ; la Dextérité n'en avait presque
aucun. Ce qui *s'oppose* au jet, en revanche, c'est bien la vivacité de
l'assaillant : parer un fulgurant est plus dur. Même échelle que l'esquive
naturelle — un adversaire rapide est difficile des deux côtés.

| Défenseur | Seuil | Réagit à temps |
|---|---|---|
| DEX 16, maîtrise 2 | 5+ | 80 % |
| DEX 10, maîtrise 2 | 7+ | 70 % |
| DEX 8, maîtrise 0 | 9+ | 60 % |

**Un échec ne coûte que l'occasion.** Ni réaction dépensée, ni mana, ni
endurance : rien n'a été tenté, il n'y a pas eu le temps. Le coup passe, et la
réaction reste disponible pour la prochaine attaque du round.

Le journal l'annonce toujours, réussite comme échec :

```
Réaction de Mage — dé 9 / 7+ → à temps.
Réaction de Mage — dé 4 / 7+ → trop tard.
```

### Les deux déclencheurs

| Déclencheur | Qui répond | Avec quoi | Jet de réflexe |
|---|---|---|---|
| `leave-reach` — on quitte ton allonge | l'ennemi menaçant | toute arme **de contact** (pas un arc) | non |
| `incoming-attack` — tu es visé | la cible | sorts marqués `reaction` dans le wiki | **oui** |

L'attaque d'opportunité n'en demande pas : elle porte déjà son propre jet de
toucher, et l'ennemi se dégage sous ton nez — tu n'es pas surpris. Deux verrous
sur le même événement l'auraient rendue anecdotique.

L'**attaque d'opportunité** ne se déclenche que sur ce qui *sort* de l'allonge —
se rapprocher ou tourner autour ne provoque rien. C'est cette règle qui donne un
prix au désengagement, et donc du poids au placement.

**Renoncer ne dépense pas la réaction** ; seul un usage réel la consomme. Et
réagir **ne coûte pas l'action** de son propre tour.

### Sorts réactifs

`"reaction": ["incoming-attack"]` sur un palier suffit — **aucun code à écrire**.

Marqués aujourd'hui :

| Sort | Effet en réaction |
|---|---|
| Pas dimensionnel (5 paliers) | se téléporte hors de portée |
| Barrière spatiale (3 paliers) | lève ses défenses avant l'impact |
| Évasion enflammée (3 paliers) | se téléporte **et** laisse un brasier à l'arrivée |

---

## 11. Ambiance — météo et heure du jour

Les deux inclinent le monde de la même façon : elles rendent certains domaines
plus forts ou moins chers. **Leurs facteurs se multiplient** — une tempête de
nuit penche deux fois dans le même sens.

### Moments de la journée

Aube · Matinée · Midi · Après-midi · Soirée · Nuit
([`daytime.json`](../frontend/public/resources/json/daytime.json))

| | Ténèbres | Lumière |
|---|---|---|
| Midi | ×0,7 dégâts, ×1,25 coût | ×1,3 dégâts, ×0,75 coût |
| Nuit | ×1,3 dégâts, ×0,75 coût | ×0,7 dégâts, ×1,25 coût |
| Matinée | — | — |

### Météo

`weathers.json` — tempête, blizzard, sécheresse… Elle applique des statuts à tous
les combattants debout au début de chaque round, peut infliger des dégâts
aléatoires, et modifie coût et puissance par domaine.

Le coût affiché sur les boutons suit : un sort de ténèbres montre `8 mana` la
nuit au lieu de `10`.

---

## 12. Objets et inventaire

Le sac est décompté pour de vrai. Une capacité déclare ce qu'elle retire, et le
moteur **refuse l'action quand le stock est vide**.

Les **potions** reconnues dans le sac deviennent des actions au contact. Leurs
fiches décrivent leurs effets en français : le moteur lit ce qui est régulier —
l'expression de dés (`2d4 + 2` → 7, une moyenne fiable plutôt qu'un second
tirage), la cible (`points de vie` vs `mana`), les purges (`Met fin au statut
Poison`) — et **affiche le reste au journal**.

Aucun effet n'est inventé, aucune ligne n'est perdue.

---

## 13. L'économie des sorts

C'est le cadre qui rend l'équilibrage **permanent** plutôt que ponctuel.
Voir [`spell-economy.ts`](../frontend/src/app/combat/spell-economy.ts).

### Le défaut d'origine

| Palier | Puissance moy. | Mana moy. | Efficacité |
|---|---|---|---|
| 1 | 45 | 4,4 | 10,2 |
| 5 | 163 | 8,4 | **19,4** |

La puissance ×3,6 du palier 1 au 5, le coût seulement ×1,9. **Monter en palier
rendait chaque point de mana deux fois plus rentable** — il n'existait aucune
raison de lancer autre chose que son meilleur sort. Écart de **39×** entre le
meilleur et le pire sort du catalogue.

### La loi

Tout est ramené à une unité commune, le « point de dégât », contre un **lanceur
de référence** (niveau 10, attaque 80, attributs 14–16) :

```
puissance = ( dégâts + soin + statuts + effets + utilité )
            × zone × portée × tir fratricide
            − contre-coup

prix attendu = puissance ÷ 10
```

**Les poids** — chacun est une constante documentée :

| Poste | Valeur | Pourquoi |
|---|---|---|
| Soin | ×1 | rendre 20 PV pèse autant qu'en retirer 20 |
| Contrôle | 45 | priver d'un tour est la ressource la plus chère |
| Mental | 35 | |
| Malus / buff | 20 | |
| Dégâts sur la durée | 18 | |
| Point de stat | 0,75 / tour | calé sur ce qu'un point d'armure évite réellement |
| Esquive | 0,5 / point / tour | |
| Purge | 15 | |
| Météo | 70 | l'effet le plus large qu'un sort puisse avoir |
| Téléportation | 25 + distance | la mobilité la plus chère sur une grille |
| Dégâts en % des PV | ×3 | ignorent l'armure et grandissent avec la cible |
| Revêtement | ×4 coups | ses dégâts accompagnent chaque frappe |
| Durée | plafonnée à 5 tours | le combat finira avant |
| **Tir fratricide** | **×0,65** | on ne lance pas un Inferno au milieu des siens |

**Zone et portée.** La zone est le facteur le plus lourd (toucher trois
adversaires démultiplie) ; la portée ne fait qu'éviter la riposte. Un sort de
**contact n'est pas pénalisé** : il paie déjà son risque en se plaçant.

### Deux garde-fous

**Plafond de prix** — 55 % de la réserve de référence, soit **44 mana**. Au-delà,
un sort ne peut plus s'acheter en mana : il doit se payer **en sang**. Sept sorts
ont reçu un contre-coup à ce titre — le Déluge emporte son lanceur, la
Singularité se referme sur lui, l'Inferno brûle sans discernement.

**Plancher anti-bradage** — la loi ne descend jamais sous la moitié du prix voulu
par l'auteur. Elle corrige ce qui est trop bon marché ; elle ne brade pas ce qu'on
a voulu cher, car un prix élevé peut avoir des raisons qu'elle ne voit pas. Ces
paliers reçoivent le verdict `protege`, qui n'est **pas** une faute.

### Le résultat

| Palier | Mana moy. | Efficacité |
|---|---|---|
| 1 | 6,0 | 7,5 |
| 5 | **15,4** | 10,5 |

L'efficacité est plate d'un palier à l'autre. Un sort de niveau 5 coûte 15 mana
sur une réserve de 80 : **5 incantations par combat au lieu de 16**. C'est ça,
les combats qui durent.

### Le garde-fou permanent

[`spell-economy.spec.ts`](../frontend/src/app/combat/spell-economy.spec.ts)
confronte les 464 paliers à la loi et **fait échouer `npm test`** si l'un sort
des bornes (tolérance 0,4× à 2,5×). On ne peut plus ajouter un sort déséquilibré
sans que la suite le dise.

Quand il proteste, deux issues légitimes :

1. corriger le palier — coût, effet, ou lui donner un contre-coup ;
2. l'inscrire dans `DEROGATIONS` **avec sa raison**. Un choix assumé reste un
   choix, mais il doit être écrit.

---

## 14. Ce qui n'est pas automatisé

Le moteur préfère **montrer** ce qu'il ne sait pas résoudre plutôt que d'inventer
des chiffres. Tout ce qui suit apparaît au journal, à charge pour le MJ de
trancher :

- **Les traits du bestiaire** (`trait.json`) n'ont aucun effet chiffré, seulement
  des descriptions. Affichés en note sur le combattant.
- **Les bonus de classe non chiffrables** — « le pugiliste porte aussitôt une
  attaque gratuite » est automatisé, mais les changements de fonctionnement
  décrits en toutes lettres ne le sont pas.
- **Les effets de potions non chiffrés** — « amertume violente et haut-le-cœur ».
- **7 sorts sans effet de combat** : Luciole, Purification de l'eau, Vision
  temporelle, Voile du secret, Écho de la pierre, Contact spectral, Relève les
  morts. Hors combat par nature ; la loi économique les ignore volontairement.

---

## 15. Où régler quoi

| Réglage | Fichier |
|---|---|
| Taille de case, déplacement | [`grid.ts`](../frontend/src/app/combat/grid.ts) |
| Décors (passage, vue, coût) | [`terrain.ts`](../frontend/src/app/combat/terrain.ts) |
| Défense, affinités, endurance, esquive, désavantage | [`rules.ts`](../frontend/src/app/combat/rules.ts) |
| Ratios d'attaque, portées d'armes, zones de gêne | [`abilities.ts`](../frontend/src/app/combat/abilities.ts) |
| Loi économique, poids, plafonds | [`spell-economy.ts`](../frontend/src/app/combat/spell-economy.ts) |
| Compétences de classe | `characters/classes.json` → bloc `combat` |
| Sorts, réactions, téléportations | `domains/*.json` |
| Moments de la journée | `daytime.json` |
| Météos | `weathers.json` |
| Statuts | `status_effects.json` |

---

## 16. Pistes discutées, pas encore faites

Dans l'ordre où je les recommanderais :

1. **Le rapport PV / dégâts.** C'est le vrai levier du rythme, et le banc d'essai
   l'a démontré : le jet de toucher a retiré un cinquième de la cadence brute
   sans allonger les combats d'un seul tour. Il ne pouvait pas — les degrés se
   compensent (un critique rend ce qu'un effleurement retire), et un combat de
   trois tours reste un combat de trois tours quand les deux camps ralentissent
   ensemble. Tant que les dégâts par tour resteront du même ordre que les points
   de vie, tout se jouera en deux échanges. Doubler les PV coûte une colonne ;
   rééquilibrer toutes les attaques coûte le jeu entier.

2. **Action rapide.** Un troisième créneau pour les objets, l'arme secondaire, se
   relever, viser. Aujourd'hui boire une potion coûte ton attaque, donc on ne
   boit jamais. La **garde** occupe déjà le créneau « je n'ai rien de mieux à
   faire » ; l'action rapide, elle, débloquerait le reste.

3. **Endurance comme monnaie universelle.** Le mana ne limite plus grand-chose
   une fois les prix corrigés ; l'endurance, elle, est serrée et a déjà sa règle
   de régénération. Faire coûter un peu de souffle à chaque action donnerait au
   tour une texture propre à cet univers.

4. **La Vitesse fait trois métiers** — déplacement, ordre du tour, esquive
   naturelle. C'est beaucoup pour une stat. Soit on l'assume, soit on déplace
   l'esquive vers la Dextérité, qui ne sert presque à rien en combat aujourd'hui.

---

## 17. Le banc d'essai

L'équilibrage ne se lit pas sur les fiches : il se mesure. `frontend/src/app/combat/sim/`
monte les **vraies** fiches sauvegardées et les **vraies** bêtes du bestiaire, les fait
s'affronter sur terrain nu, et compte. Il n'applique aucune règle de son cru — il appelle
`applyAction` comme le fait la table de combat, donc ce qu'il mesure est ce qui se passera
à table.

```
BALANCE_REPORT=1 npm test        # rejoue ~2 600 combats et réécrit docs/balance-report.md
```

Un test de fumée reste allumé en permanence dans la suite ordinaire, pour que le banc ne
pourrisse pas en silence entre deux campagnes de mesure.

### Les cibles

Ce sont les valeurs vers lesquelles on travaille. Elles n'ont rien d'automatique : aucun
test ne les impose, sans quoi le moindre ajustement de fiche ferait échouer la suite.

| Mesure | Cible | Pourquoi |
| --- | --- | --- |
| Tours médians | 5 à 10 | En dessous, personne n'a le temps de jouer sa fiche ; au-dessus, on s'ennuie. |
| Tours de contact réel | 4 à 8 | Ce qui reste une fois l'approche déduite. C'est le vrai combat. |
| PV conservés par le vainqueur | 20 à 50 % | Une victoire doit coûter. À 70 %, un camp domine sans avoir été inquiété. |
| Absorbé par les défenses | 25 à 45 % | Assez pour que l'armure compte, pas assez pour annuler un type de dégâts. |
| Combats non conclus | < 5 % | Au-delà, deux fiches s'annulent : quelqu'un ne peut pas blesser l'autre. |
| Tours perdus par combattant | < 0,5 | Un tour où l'on ne peut rien faire est un tour de jeu volé au joueur. |

### Ce que l'IA du banc n'est pas

Un joueur. Elle frappe ce qui rapporte le plus, tout de suite, sans plan ni économie de
réserves. Les durées qu'elle produit sont donc un **plancher** : un combat qu'elle rend
déjà intéressant le restera joué finement. À l'inverse, un déséquilibre qu'elle trouve,
un joueur le trouvera aussi.

Corollaire à garder en tête en lisant le rapport : elle sur-représente la course à
l'attaque brute. Tout ce qui demande de la patience — user une défense, préparer un
enchaînement, temporiser pour récupérer de l'endurance — est sous-évalué chez elle.
