# Hors combat — le temps, la survie, les dépouilles

Ce document décrit **ce qui se passe entre les bagarres** : le temps qui s'écoule,
la faim et la soif qui montent, les corps qu'on fouille, ce que la séance
redescend sur les fiches.

Son pendant, [`combat.md`](combat.md), ne décrit que le combat lui-même — la
grille, le tour, les dégâts, les statuts. La séparation est volontaire : on ne
consulte pas les deux au même moment. Au milieu d'un round on cherche une règle
de portée ; au camp on cherche ce que coûte une nuit de marche.

Les deux partagent en revanche **le même moteur et la même rencontre** : tout
passe par `applyAction`, tout laisse une trace au journal, et tout se rejoue à
l'identique depuis la graine. Une nuit de marche se relit au journal au même
titre qu'un coup d'épée.

Le code vit dans [`frontend/src/app/combat/`](../frontend/src/app/combat/) —
`clock.ts`, `survival.ts`, `loot.ts`, `sheet-report.ts`. Comme pour le combat :
si ce document et le code divergent, **c'est le code qui fait foi**, et les
constantes citées ici sont exportées et testées
([`downtime.spec.ts`](../frontend/src/app/combat/downtime.spec.ts)).

---

## 1. Trois phases, une seule rencontre

`phase` vaut `setup`, `combat` ou `exploration`.

| Phase | Ce qu'on y fait | Colonne de gauche | Sous la grille |
|---|---|---|---|
| `setup` | **Le mode créatif** : tout mettre en place | Combattants | — |
| `combat` | Le tour par tour, l'initiative | Ordre d'initiative | Actions du combattant actif |
| `exploration` | **Les joueurs agissent** : le temps, le camp, la fouille | Groupe + jauges de survie | Fouille du corps ou de la porte |

### Chaque phase ne montre que ses outils

C'est une règle d'écran, pas une règle de jeu, mais elle compte autant : une
commande qui n'a plus cours **encombre** celles qu'on cherche, et l'on finit par
faire défiler la page à chaque geste.

| Commande | `setup` | `combat` | `exploration` |
|---|:---:|:---:|:---:|
| Palette de décor, cartes toutes faites | ✅ | — | — |
| Taille de la grille | ✅ | — | — |
| Déplacer un pion à la main | ✅ | — | ✅ |
| Changer de camp, retirer un pion | ✅ | — | ✅ |
| Ordre d'initiative, actions du tour | — | ✅ | — |
| Horloge, activités, camp, chasse | — | — | ✅ |
| Jauges de survie | — | — | ✅ |
| Fouille des corps | — | — | ✅ |
| Portes | — | ✅ | ✅ |
| Catalogues (fiches, bestiaire), météo, heure | ✅ | ✅ | ✅ |

Le décor ne se peint **qu'au montage** : une rencontre en cours ne voit pas les
murs pousser sous les pieds des combattants, et redimensionner le plateau
rapatrierait les pions qui en sortent.

Les portes font exception à la règle « le décor est créatif » : on les *pose* au
montage, mais on les *manipule* dès que la partie tourne. Poser et actionner sont
deux gestes différents (cf. [`combat.md`](combat.md)).

**Changer de phase range les outils de celle qu'on quitte** — pinceau de décor,
capacité armée, dépouille ouverte. Le rangement passe par un effet et non par le
bouton, parce que la table change aussi de phase toute seule : l'initiative
lancée, la dernière chute.

**La grille reste à l'écran dans les trois phases.** Les corps sont restés où ils
sont tombés : fouiller se fait *sur le cadavre*, à sa place, pas dans une liste à
côté.

Hors combat, **sélectionner désigne l'acteur du camp** — celui qui chasse, celui
qui ramasse — que le clic vienne du plateau ou de la colonne de gauche. Cliquer
un corps ouvre sa dépouille au lieu d'en faire un acteur.

### Marcher au camp a sa propre règle

Le hors-combat n'est **ni du combat au ralenti, ni le montage**. C'est le piège
dans lequel il est tombé d'abord : le camp empruntait le placement *libre* du
montage — où l'on pose un pion où l'on veut, parce qu'on dessine la scène — et
les personnages traversaient les murs.

| | Montage | Combat | Hors combat |
|---|---|---|---|
| Décor respecté | non — on dessine | oui | **oui** |
| Budget en mètres | — | oui | **non** |
| Endurance dépensée | — | oui | **non** |
| Attaque d'opportunité | — | oui | **non** |

Marcher au camp cherche donc un **chemin**, exactement comme en combat : un mur
reste un mur, une porte fermée reste fermée, l'eau profonde arrête qui ne sait
pas nager, et l'on ne marche pas à travers quelqu'un. Ce qui disparaît, c'est le
COÛT : traverser le camp ne se compte pas en mètres, puisque personne ne se bat.

Une case hors d'atteinte est refusée avec sa raison au journal, plutôt que
d'être franchie en silence.

L'**initiative disparaît** hors combat — elle n'y veut rien dire. La colonne de
gauche garde les mêmes lignes, mais elles portent alors les jauges de survie à la
place du score de vitesse.

Elles partagent **la même rencontre** : mêmes combattants, même journal, même
horloge, même sauvegarde. Ce n'est pas un autre écran — ce qui vient de se passer
en combat est précisément ce dont on s'occupe après.

## 2. Remanier la composition

Hors combat — en `setup` comme en `exploration` — un pion **change de camp sur
place** : trois créneaux dans son panneau, ou un **clic droit** sur lui, sur la
grille comme dans la liste.

Retirer puis rajouter marchait, mais coûtait cher : le pion revenait *neuf*, donc
sans ses blessures, ses jauges de survie, sa bourse ni sa dépouille déjà
fouillée. Changer le camp sur place garde tout cela — c'est ce qu'il faut pour un
prisonnier qui rejoint le groupe ou un mercenaire qui tourne casaque.

**Pas pendant un round.** Changer de camp en plein combat retournerait l'ordre
d'initiative sous les pieds du MJ, et rendrait alliés des gens qu'on visait trois
secondes plus tôt.

Le menu contextuel est un **chemin rapide**, pas le seul : les mêmes commandes
restent dans le panneau du combattant sélectionné. Un menu caché derrière un clic
droit ne doit jamais être le seul endroit où l'on peut faire quelque chose.

Le passage se fait tout seul aux deux moments qui comptent : lancer l'initiative
entre en `combat`, la dernière chute fait sortir en `exploration`. Les trois
boutons du bandeau servent à y revenir — une embuscade qui reprend, un montage à
retoucher.

**Une séance n'a pas un combat, elle en a plusieurs.** On relance donc
l'initiative depuis le camp : le groupe voyage, rencontre, se bat, repart.
Refuser le second combat ferait du hors-combat une fin de partie déguisée, alors
qu'il est l'état ORDINAIRE d'une séance — le combat n'en est que la ponctuation.

Une rencontre sauvegardée **avant** les phases n'en porte pas : elle en reçoit
une déduite (`started` et le nombre de camps encore debout). Elle reste jouable.

## 3. L'horloge

`clock` porte `{ day, seconds }` — le jour de campagne et l'heure dans ce jour.
**Une journée de Mystaria dure 26 h** (`HOURS_PER_DAY`, `DAY`) : l'horloge
affiche donc « 24h30 » ou « 25h59 » avant de passer au jour suivant.
Tout est compté en **secondes entières** : un round de six secondes ne peut pas
se perdre dans l'arrondi d'une minute, et cent rounds ne dérivent pas d'un
cheveu.

Elle avance de deux façons :

- **en combat**, de `ROUND_SECONDS` (6 s) à chaque round bouclé, en silence — le
  journal dirait « 6 s se passent » à chaque tour de table ;
- **hors combat**, de ce que le MJ décide : `+10 min`, `+30 min`, `+1 h`, `+4 h`,
  `+8 h`, ou une durée sur mesure en minutes.

**Le moment de la journée en est déduit.** Il n'est plus un réglage indépendant :
une seule source de vérité, donc pas deux valeurs à tenir en accord.

| Moment | De |
|---|---|
| Nuit | 21 h → 5 h (via 24 h et 25 h : **dix heures**) |
| Aube | 5 h |
| Matinée | 7 h |
| Midi | 11 h |
| Après-midi | 14 h |
| Soirée | 18 h |

Les deux heures de plus qu'un jour terrestre vont toutes à la **nuit**
(`mystaria_gameplay_survie.md`, section 3) : les phases éveillées gardent leurs
longueurs (16 h), la nuit passe de 8 à 10 h. C'est aussi la durée d'une « Nuit
complète », celle qui rembourse toute la dette de sommeil.

Choisir un moment à la main **règle l'horloge** sur son entrée (« Nuit » pose
21 h, l'heure où elle tombe, pas minuit où elle est à moitié passée).

**Le verrou.** Un souterrain reste noir à midi. `daytimeLocked` fige le moment de
la journée : l'horloge continue de tourner, mais ne le change plus. Le lever le
raccroche aussitôt à l'heure. C'est le seul endroit où les deux se découplent, et
il faut le demander.

## 4. Faim, soif, fatigue

Les règles viennent de [`mystaria_gameplay_survie.md`](../frontend/mystaria_gameplay_survie.md),
sections 2 (chiffrage) et 18 (« Manque », les paliers unifiés). Trois jauges
corporelles, séparées de la Réserve de mana mais qui **communiquent** avec elle.

**La Constitution fait la taille du réservoir, pas sa vitesse.**

| Jauge | Maximum | Usure |
|---|---|---|
| Faim | 48 + mod. CON × 6 (~12 jours) | −1 par segment, +1 par tranche de 2 de mod. FOR au-delà de +2 |
| Soif | 16 + mod. CON × 2 (~4 jours) | −1 par segment |
| Fatigue (Repos) | 15, pour tout le monde | une **dette** : voir plus bas |

Un **segment** est un quart de journée (`SEGMENT_SECONDS`, soit 6 h 30 sur une
journée de 26 h). Le ratio 3:1 entre Faim et Soif vient uniquement de la taille
des réservoirs. La Force ne touche que la Faim : un personnage à FOR +3/+4 perd
2 points par segment, +5/+6 en perd 3.

La rencontre stocke les **points manquants**, en flottants : l'usure court en
continu, et deux heures d'affilée coûtent exactement ce que coûtent douze fois
dix minutes. Un point ne se raye qu'une fois son segment écoulé (on annonce
`⌈max − manque⌉`). La fiche garde elle aussi le creux (`survivalLoss`), comme pour
les réserves : un changement de CON redimensionne le réservoir sans rien fausser.
Une fiche ou une partie d'avant la refonte (crans restants, secondes écoulées)
est relue en gardant sa **proportion**.

**La Fatigue est une dette de sommeil, pas une pression constante.** Une journée
normale ne coûte rien. Rester éveillé pendant la nuit ouvre la dette (−3 pour la
nuit sautée) ; tant qu'elle est ouverte, chaque phase éveillée (aube, matinée,
midi, après-midi, soirée) coûte 3 points, au prorata du temps passé dans la
phase. Le sommeil rembourse au prorata du temps dormi : une nuit complète (10 h)
remet la jauge à 15, cinq heures en rendent la moitié. Une nuit blanche mène
donc à l'effondrement vers 18 h le lendemain.

**L'activité module la Faim et la Soif** (le tick de base est ×1) :

| Activité | Faim | Soif | Fatigue |
|---|---|---|---|
| Marche | ×1 | ×1 | éveillé |
| Effort soutenu | ×1,5 | ×2 | éveillé |
| Repos au camp | ×1 | ×1 | éveillé — on ne récupère qu'en dormant |
| Veille | ×1 | ×1 | éveillé |
| Sommeil | ×1 | ×1 | **rembourse** |
| Combat *(appliqué seul)* | ×2 | ×3 | éveillé |

Une jauge ne s'enfonce pas sous zéro et ne déborde pas au-dessus du plein.

**Un corps à terre fige ses jauges.** Les faire courir pendant qu'il saigne au sol
le punirait deux fois.

**Les créatures n'en tiennent aucune.** Une bête est ce qu'elle est le jour où on
la rencontre.

## 5. Ce que le manque coûte

Un seul palier actif par jauge — le plus sévère atteint —, mais les jauges se
cumulent entre elles. Tout se paie en **crans de dé** (un cran = 5 points de
précision, cf. [`combat.md`](combat.md)) et en **Endurance maximum**, le pool qui
paie les compétences de classe.

| Palier | Faim / Soif (% du max) | Fatigue (points) |
|---|---|---|
| Léger | ≤ 75 % — aucun effet | < 15 — aucun effet |
| Modéré | ≤ 50 % — −1 cran | ≤ 10 — −1 cran physique |
| Sévère | ≤ 25 % — −2 crans, Endurance max −25 % | ≤ 5 — −2 crans physiques, −1 cran d'incantation, Endurance max −30 % |
| Critique | 0 — perte de connaissance | 0 — endormissement forcé |

**Chaque besoin frappe où il fait mal :**

- la **Faim** gêne la précision **physique** (armes, capacités hors sorts) ;
- la **Soif** gêne l'**incantation** (les jets de sorts) ;
- la **Fatigue** prend le corps d'abord, la magie ensuite. Une CON robuste
  l'adoucit : −1 cran par tranche de +2 en mod. CON (jamais sous −1 cran), et
  l'Endurance ne perd que 30 % − 2 % par point de mod. CON (plancher −15 %).

Les crans entrent dans le seuil par `precisionOf`, et s'annoncent dans ses
causes (« manque », « gêne d'incantation »). La part d'Endurance passe par
`effectiveStat` ; les parts s'additionnent, plafonnées à −90 %.

**Le palier critique ne tue jamais.** Une jauge qui *tombe* à zéro fait perdre
connaissance (statut « Évanouissement », ou « Sommeil » pour la Fatigue) pendant
`3 − mod. CON` segments (`2 − mod. CON` pour l'endormissement), minimum 1 —
**sauf sauvegarde de Vigueur**. Pendant l'endormissement forcé, la dette de
sommeil se rembourse. Un coup (ou des sels) qui lève le statut réveille aussi le
moteur.

**La sauvegarde de Vigueur** (section 13 du document de survie) se jette
automatiquement, au dé de la rencontre, à l'instant exact où la jauge touche
zéro. C'est le jet de toucher, rôles inversés :

```
résistance = mod. CON × 4 − sévérité
seuil      = 8 − (résistance / 5, arrondi une fois) − maîtrise     borné 3 à 18
```

La maîtrise compte en crans au-dessus du socle (maîtrise − 2), comme au toucher.

| Manque | Sévérité | Seuil à CON 10, niveau 1 |
|---|---|---|
| Faim, Fatigue | 8 (intermédiaire) | 10+ |
| Soif, vide de mana | 12 (majeure) | 10+ |

| Degré | Effet |
|---|---|
| Réussite (≥ seuil, ou 20) | reste conscient **un segment** de plus |
| Résistance partielle (seuil − 5 à seuil − 1) | tombe, mais **moitié moins longtemps** (arrondi au-dessus, 1 segment minimum) |
| Échec (ou 1) | tombe pour la durée pleine |

Tant que la jauge reste à zéro, **on rejoue à chaque segment** : on peut tenir,
pas indéfiniment. Au réveil (toujours à vide), un segment de répit précède le
jet suivant. Pour le vide de mana, le jet a lieu au sort qui vide la Réserve.
Les sévérités sont dans `VIGOR_SEVERITY` ([`rules.ts`](../frontend/src/app/combat/rules.ts)).

### Le lien avec la mana : la réciprocité

Le **Manque de mana** se lit sur la Réserve elle-même et se réévalue à chaque
sort lancé. Il ne concerne que les personnages tirés d'une fiche et dotés d'une
Réserve.

| Palier | Réserve | Effet |
|---|---|---|
| Léger | ≤ 50 % | aucun |
| Modéré | ≤ 25 % | −1 cran d'incantation |
| Sévère | ≤ 10 % | −2 crans d'incantation, −1 cran physique, **Faim et Soif ×2 jusqu'à la fin du jour** |
| Critique | 0 | perte de connaissance, `3 − mod. CON` segments |

C'est la réciprocité de la section 2, enfin chiffrée : pousser sa magie à bout se
paie dans le corps (la faim et la soif s'emballent), et un corps assoiffé tient
mal son flux (la Soif gêne l'incantation).

## 6. Remplir les jauges

Deux familles de gestes, qui ne coûtent pas la même chose.

**Sur les vivres** — « Repas » et « Boire aux outres ». Chacun sort de son sac de
quoi combler la jauge, et **ce qu'il y prend en disparaît**. Qui n'a rien reste
sur sa faim, et le journal le nomme. C'est ce qui donne un prix au ravitaillement :
sans consommation réelle, tenir des jauges ne veut rien dire.

Au repas de groupe, chacun entame **sa plus grosse ration d'abord** : on ouvre le
cuissot avant de grignoter les restes.

| Vivre | Comble | Vaut | Devient |
|---|---|---|---|
| Petite ration | 2 points | ½ journée | *(disparaît)* |
| Rations de voyage | 4 points | **1 journée** | *(disparaît)* |
| Grande ration | 8 points | 2 journées | *(disparaît)* |
| Outre en peau | Soif, 4 points | 1 journée d'eau | **Outre vide** |

**Le barème suit les fiches du wiki, pas l'inverse.** « Une ration par jour » y est
écrit noir sur blanc, et une journée vaut quatre segments, donc quatre points de
Faim : une ration de voyage rend une journée. Les deux autres tailles en
découlent : la demi-journée qu'on tire d'un collet, les deux jours qu'on tire
d'un cuissot.

L'outre n'est pas mangée : elle se **vide**. La faire disparaître ferait perdre le
récipient à qui boit ; la garder pleine donnerait de l'eau à l'infini. Elle
devient donc une ligne « Outre vide » visible dans le sac, que « Remplir les
outres » retourne à l'état plein.

**La chasse se jette.** « Chasser » lance un **d100 + bonus de Nature**, et la
prise revient à **celui qui a lancé la battue** — c'est son sac qui la porte, et
son poids qu'elle grève.

| Résultat | Issue | Rapporte |
|---|---|---|
| 1–25 | Bredouille — 25 % | rien |
| 26–80 | Petit gibier — 55 % | Petite ration (2 points) |
| 81 et + | Gibier médian — 20 % | Rations de voyage (4 points) |

**C'est la Nature qui décide, pas la Survie.** Lire une empreinte, reconnaître une
coulée, savoir quel buisson porte des baies comestibles : c'est du savoir sur le
vivant. La Survie dit qu'on tient le coup dehors ; la Nature dit qu'on sait où
chercher.

Le bonus **pousse le résultat vers le haut de la table** : un chasseur à +4 ne
rentre bredouille que sur 1–21, soit 21 % au lieu de 25 %, et gagne autant sur la
bande du gibier médian. Un dépassement de 100 reste sur la meilleure issue — on
ne sort pas de la table. Le bonus est celui de la fiche : modificateur
d'Intelligence, apport du background, et maîtrise si la compétence est choisie.

**Une battue sur quatre ne rend rien.** C'est ce qui empêche la chasse de
remplacer purement et simplement les rations : un groupe qui part la besace vide
en se disant qu'on trouvera bien quelque chose se trompe une fois sur quatre, et
deux fois de suite une fois sur seize.

La table penche largement vers le petit gibier — on ramène un lièvre bien plus
souvent qu'un chevreuil. Les chances sont **affichées à côté du bouton** : on doit
savoir ce qu'on risque avant de lancer les dés, pas le découvrir au journal. Le
jet lui-même y figure (« d100 : 73 »), comme tous les jets du moteur, et il passe
par le `Rng` de la rencontre — une partie rechargée redonne la même chasse.

La **grande ration** n'est pas sur cette table : elle ne se chasse pas au collet.
Elle vient d'une créature dépecée, d'une ferme au moment de l'abattage, ou d'un
achat.

**Sans jet** — « Ravitailler » ajoute des vivres à la main (achat à l'étape, don,
correction du MJ) ; « À la source » et « Nuit complète » ne touchent pas au sac.
Il n'y a rien à hasarder : c'est au MJ de dire qu'il y avait une rivière ou un
marchand.

Les gestes de groupe ne servent **que le camp désigné** : le repas du soir ne
nourrit pas les adversaires assis en face.

Enfin, **à la main** : les boutons − / + de chaque jauge corrigent d'un point, comme sur la fiche.

Le moteur ne devine pas ce qui se mange à partir d'un nom — la liste des vivres
reconnus tient dans [`NOURISHMENTS`](../frontend/src/app/combat/survival.ts).

## 7. Fouiller les corps

Le bestiaire portait déjà ce que rendent les bêtes (`loot` : une référence, une
chance, une fourchette) ; personne ne s'en servait à table. La table de butin
**voyage désormais avec le combattant**, non jetée — le moteur est du TypeScript
pur, il ne peut pas relire un JSON au milieu d'une action.

Deux gestes distincts, à dessein :

- **Fouiller** — on jette les dés, **une seule fois par corps**. Ce qui n'est pas
  tombé n'y est pas, et refouiller ne le fera pas apparaître.
- **Prendre** — on transfère de la pile vers un sac. Rien n'atterrit tout seul
  dans l'inventaire de qui que ce soit : un sac a un poids et un propriétaire.

Un corps encore debout ne se fouille pas — c'est ce qui empêche de vider les
poches d'un adversaire au milieu du combat.

**Le porteur** est celui qui empochera : le groupe d'abord, et à défaut quiconque
tient encore debout. Une table qui joue des mercenaires neutres ou une bande
adverse doit pouvoir ramasser aussi — sans ce repli, la fouille viderait le corps
sans que rien n'entre nulle part, et le butin resterait par terre. Le panneau
affiche toujours vers qui va ce qu'on prend.

Une dépouille rend **trois choses** : sa table de butin, **son sac entier**
(munitions et potions comprises — c'est ce qu'un survivant ramasse en premier) et
**sa bourse**. Le sac est la moitié du butin d'une embuscade de bandits, et le
bestiaire ne le dira jamais puisqu'il vient de leur fiche, pas de leur espèce.

Le tirage passe par le `Rng` de la rencontre : une partie rechargée redonne
exactement le même butin.

## 8. Reporter la séance sur les fiches

Pendant de **Rafraîchir les fiches** : là, la fiche remonte vers la table ; ici,
la table redescend vers la fiche.

**Rien ne part sans un clic.** Une séance rejouée, un combat annulé, un essai ne
doivent pas saccager les fiches dans le dos du MJ. L'écart se lit avant d'être
écrit, ligne par ligne, et les fiches sont **relues** au moment de l'aperçu : une
fiche modifiée ailleurs entre-temps ne doit pas être écrasée par un instantané
périmé.

| Redescend | Ne redescend pas |
|---|---|
| Jauges de survie | Statuts, effets temporaires |
| **Les réserves** (points de vie, endurance, mana) | Position, initiative |
| Le sac (munitions dépensées, butin ramassé) | Le maximum des réserves (il se recalcule) |
| La bourse | |

Les **réserves** redescendent sous la forme du **creux** (`poolLoss`) : ce qui
manque au maximum, jamais un total. Le maximum, lui, reste calculé (race, classe,
niveau, équipement) ; garder le creux fait qu'une montée de niveau n'efface pas
une blessure, et qu'une fiche à plein n'a rien à retenir. Le maximum de référence
est celui du **pion** (`base`), figé quand il a été posé sur la table : c'est
contre lui que les coups ont été comptés.

La boucle est fermée dans les deux sens : un personnage blessé **arrive** blessé
à la table suivante (cf. `fromSheet`). Les points de vie ne descendent toutefois
jamais sous 1 à l'arrivée — on pose un personnage qui joue, pas un corps ; ce
qu'il advient d'un pion tombé se tranche à la table, pas dans le moteur.

La bourse redescend sous la forme de l'**écart au tirage** du background
(`goldDelta`), jamais d'un montant absolu : garder le lien avec le tirage permet
de changer de background plus tard sans effacer les gains de la campagne. Un pion
monté à la main, sans `purseBase`, n'annonce aucun écart — mieux vaut ne rien
dire que dire faux.

Une dépouille qui entre dans un sac emporte le poids que sa fiche annonce ; un
objet inconnu au catalogue entre à 0 et se corrige sur la fiche, plutôt que de se
voir refuser.

---

---

## 9. Ce qui n'est pas automatisé

Comme en combat, le moteur préfère **montrer** ce qu'il ne sait pas résoudre
plutôt que d'inventer des chiffres :

- **Ce qui se mange**, au-delà de la courte liste des vivres reconnus. Le moteur
  ne devine pas la valeur nutritive d'un nom d'objet : les gestes du camp
  remplissent les jauges, et le MJ décide de ce qui les justifie.
- **Où trouver de l'eau.** L'outre se vide et se remplit pour de vrai, mais savoir
  s'il y avait une source sur le chemin est une affaire de MJ.
- **Ce que coûte une battue en temps.** La chasse tire sa table, mais n'avance pas
  l'horloge toute seule : c'est au MJ de dire si l'affût a pris l'après-midi.
- **La récupération entre deux séances.** Le report écrit les réserves telles que
  la séance les a laissées ; combien une nuit, une semaine de convalescence ou
  les soins d'un temple en rendent reste au MJ — la fiche a son bouton
  « Pleine forme » et ses pas de ±1 / ±5 pour le dire.

---

## 10. Où régler quoi

| Réglage | Fichier |
|---|---|
| Découpage horaire de la journée, pas de temps | [`clock.ts`](../frontend/src/app/combat/clock.ts) |
| Rythme des jauges, activités, malus de survie | [`survival.ts`](../frontend/src/app/combat/survival.ts) |
| Vivres reconnus, table de chasse | [`survival.ts`](../frontend/src/app/combat/survival.ts) |
| Tirage et transfert du butin | [`loot.ts`](../frontend/src/app/combat/loot.ts) |
| Ce qui redescend sur les fiches | [`sheet-report.ts`](../frontend/src/app/combat/sheet-report.ts) |
| Tables de butin des créatures | `bestiary/*.json` → bloc `loot` |
| Fiches des vivres | `equipment/*.json` |
| Moments de la journée (effets sur la magie) | `daytime.json` |
