# Guide de composition d'un sort

Ce document décrit **tous les champs JSON** d'un sort de domaine (`domains/*.json`,
tableau `spells`) et de combinaison (`combinations.json`, tableau `spells`).
La source de vérité des types reste [`frontend/src/app/wiki.types.ts`](../frontend/src/app/wiki.types.ts) —
en cas de doute, c'est lui qui fait foi.

Chaque sort déclaré obtient automatiquement sa page `/magics/spell/<key>`. Aucun
enregistrement manuel n'est nécessaire.

---

## 1. Anatomie d'un sort

```
Sort (DomainSpellEntry)
├─ key, name, description, level, mana, subdomains, icon…
├─ usage           → utilité par défaut (combat / hors combat)
├─ requires         → sorts prérequis (map de déblocage)
└─ progression      → arbre d'amélioration
   ├─ root          → id du nœud de départ
   ├─ branches[]    → libellés des voies (après un point de scission)
   └─ nodes[]       → les paliers
      └─ Nœud (SpellNode)
         ├─ id, tier, name, description, branch, next[]
         ├─ usage    → surcharge l'usage du sort pour CE palier
         └─ stats    → toutes les valeurs chiffrées (SpellNodeStats)
```

Un sort **sans** `progression` = simple fiche descriptive.
Un sort **avec** `progression` = arbre interactif cliquable.

---

## 2. Le sort — `DomainSpellEntry`

| Champ         | Type                | Requis | Description |
|---------------|---------------------|:------:|-------------|
| `key`         | `string`            | ✅ | Slug **unique** = URL de la page (`/magics/spell/<key>`). Convention : `<domaine>-<nom-en-kebab>` (ex. `fire-embers`). |
| `name`        | `string`            | ✅ | Nom affiché (ex. « Braises »). |
| `description` | `string`            | ✅ | Description générale, affichée dans le hero. |
| `mana`        | `number`            | ✅ | Coût en mana « vitrine » (le coût réel par palier est dans `stats.mana`). |
| `level`       | `number`            | ✅ | Niveau requis pour débloquer le sort. Sert aussi au tri des sorts d'un domaine. |
| `subdomains`  | `string[]`          | ✅ | Sous-domaines auxquels le sort appartient (doivent correspondre à un `subdomains[].name` du domaine). |
| `icon`        | `string`            | — | Chemin d'icône. À défaut : l'icône du 1er sous-domaine, sinon celle du domaine. |
| `usage`       | `SpellUsage`        | — | Utilité par défaut (voir §3). |
| `requires`    | `string[]`          | — | `key` des sorts prérequis (voir §4). |
| `damageType`  | `string`            | — | Type de dégâts par défaut du sort (voir §8.2). À défaut : dérivé du domaine. |
| `weather`     | `string`            | — | Météo invoquée par défaut (voir §8.4). Surchargeable par nœud. |
| `progression` | `SpellProgression`  | — | Arbre d'amélioration (voir §5). |

---

## 3. `usage` — utilité selon le contexte

Tout sort n'a pas d'utilité en combat **et** hors combat. `usage` déclare les
deux contextes ; un champ absent = aucune utilité dans ce contexte.

```json
"usage": {
  "combat": "Projette des braises pour infliger des dégâts de feu.",
  "outOfCombat": "Permet d'allumer un feu de camp ou une torche."
}
```

| Champ         | Type     | Description |
|---------------|----------|-------------|
| `combat`      | `string` | Ce que fait le sort en combat. Absent = aucun effet notable en combat. |
| `outOfCombat` | `string` | Utilité hors combat (exploration, quotidien, RP). Absent = aucune. |

**Affichage** : dans le détail d'un palier, une bascule `⚔ En combat` / `✦ Hors
combat` apparaît **si le sort sert dans les deux contextes**. Le mode combat
montre les mécaniques chiffrées ; le mode hors-combat montre le texte utilitaire.

### Surcharge par palier
Un nœud peut porter son propre `usage` (voir §6). Il **surcharge** celui du sort
pour ce palier ; si un champ y est absent, le texte du sort sert de repli. Cela
permet de montrer comment chaque contexte évolue palier par palier — l'un peut
évoluer sans l'autre.

> Ex. Braises garde le même effet hors-combat sur le tronc (hérité du sort),
> puis chaque branche fait diverger l'utilité (embrasement de zone vs flamme
> durable) via un `usage.outOfCombat` posé sur les nœuds de branche.

> ⚠️ **Sort hors-combat uniquement** : en mode hors-combat, la fiche affiche le
> texte de `usage.outOfCombat` (du nœud, sinon du sort) — **jamais** le
> `description` du nœud, réservé au flavor de la vue combat. Pour un texte qui
> **varie par palier** sur un sort purement utilitaire (ex. Purification de
> l'eau), écris-le dans `usage.outOfCombat` de **chaque nœud**, pas dans
> `description` (qui ne s'afficherait nulle part).

---

## 4. `requires` — map de déblocage

Chaîne les sorts d'un domaine entre eux. `requires` liste les `key` des sorts à
débloquer **avant** celui-ci. La relation inverse (« Débloque ») est dérivée
automatiquement — ne pas la déclarer.

```json
{ "key": "fire-fireball", "requires": ["fire-embers"], "name": "Boule de feu", … }
```

Résultat sur la page : section *Arbre de sorts* → `Requis pour débloquer` → `Ce
sort` → `Débloque`. Un sort de base n'a pas de `requires`. **Tous les domaines
doivent avoir cette map** (sinon la section reste vide).

---

## 5. `progression` — l'arbre d'amélioration

| Champ      | Type            | Requis | Description |
|------------|-----------------|:------:|-------------|
| `root`     | `string`        | ✅ | `id` du nœud de départ (palier 1). |
| `nodes`    | `SpellNode[]`   | ✅ | Tous les paliers de l'arbre. |
| `branches` | `SpellBranch[]` | — | Libellés des voies, pour la légende et la couleur. |

### `SpellBranch`
| Champ         | Type     | Description |
|---------------|----------|-------------|
| `id`          | `string` | Clé de branche, référencée par `node.branch`. Le tronc s'appelle toujours `trunk`. |
| `label`       | `string` | Nom affiché de la voie (ex. « Voie de l'incandescence »). |
| `description` | `string` | Résumé de la voie (infobulle de légende). |

Le **tronc** utilise la couleur du domaine ; chaque branche reçoit une couleur
d'accent distincte. Jusqu'à 4 branches colorées sont gérées.

---

## 6. Un nœud — `SpellNode`

| Champ         | Type              | Requis | Description |
|---------------|-------------------|:------:|-------------|
| `id`          | `string`          | ✅ | Identifiant **unique dans l'arbre** (ex. `e1`, `b4`). |
| `tier`        | `number`          | ✅ | Palier de progression (colonne dans l'arbre). 1 = sort de base. |
| `name`        | `string`          | ✅ | Nom du palier (voir convention §9). |
| `stats`       | `SpellNodeStats`  | ✅ | Toutes les valeurs chiffrées (voir §7). |
| `description` | `string`          | — | Texte d'ambiance / ce que le palier apporte. Affiché en tête des effets (combat). |
| `branch`      | `string`          | — | `id` de la branche du nœud (`trunk` par défaut). Pilote couleur et regroupement. |
| `next`        | `string[]`        | — | `id` des nœuds enfants. **Plusieurs enfants = point de scission** (l'arbre se sépare en branches). |
| `usage`       | `SpellUsage`      | — | Surcharge l'`usage` du sort pour ce palier (voir §3). |

La disposition est automatique : `tier` → colonne, et les rangées se calculent
par parcours de l'arbre. Tu n'as pas à positionner les nœuds.

---

## 7. `stats` — `SpellNodeStats`

Le cœur d'un palier. Seul `mana` est requis ; tout le reste est optionnel selon
le type de sort (offensif, soin, buff, utilitaire…).

### 7.1 Coût, portée, zone, cibles
| Champ      | Type             | Description |
|------------|------------------|-------------|
| `mana`     | `number` ✅      | Coût réel du sort à ce palier. |
| `range`    | `string`         | Portée, texte libre : `"8 m"`, `"Contact"`, `"Personnel"`. |
| `area`     | `string`         | Zone d'effet : `"Cible unique"`, `"Rayon 3 m"`, `"Soi-même"`. |
| `targets`  | `SpellTarget[]`  | Cibles possibles : `enemy`, `ally`, `self`, `everyone` (voir §8.5). |
| `duration` | `number`         | Durée de base en **tours** (buffs, altérations, DoT). |

> Le **sens** d'un effet (buff ou malus) se déduit de `targets` : ciblant
> `enemy` → malus (−) ; ciblant `self`/`ally` → bonus (+).

### 7.2 Dégâts — trois formes (mutuellement exclusives)

**a) Simple** (un seul type) :
```json
"damageMin": 4, "damageMax": 7
```

**b) Multi-composantes** (`damages[]`, ex. lumière + ténèbres) — prioritaire sur la forme simple :
```json
"damages": [
  { "min": 7, "max": 9, "type": "light", "scaling": [{ "source": "atk_mag", "ratio": 0.5 }] },
  { "min": 7, "max": 9, "type": "dark" }
]
```
Chaque `SpellDamage` : `min`, `max`, `type?` (défaut : type du sort/domaine), `scaling?` (propre à la composante).

**c) Pourcentage de PV** (ignore les défenses) — **deux formes distinctes**, cumulables :
```json
"damagePercentMaxHp":     { "min": 5, "max": 8 },   // % des PV MAX de la cible
"damagePercentCurrentHp": { "min": 3, "max": 5 }    // % des PV ACTUELS de la cible
```
Chaque forme (`SpellPercentDamage`) : `min`, `max?`. Un nœud peut porter l'une, l'autre, ou les deux (elles s'affichent séparément). Le `scaling` `affects:"damage"` du nœud ajoute des **points de %**.

| Champ            | Type     | Description |
|------------------|----------|-------------|
| `damageType`     | `string` | Type de dégâts **du nœud** (surcharge le sort et le domaine). Voir §8.2. |

> **Couleur** : chaque valeur de dégâts **et** son badge de type sont colorés
> d'après leur **type** (la source de vérité), pas d'après le domaine de la page
> — feu orange, foudre jaune, terre brun, ténèbres violet… Les types physiques
> (`bludgeoning`/`piercing`/`slashing`) ont des nuances d'acier distinctes des
> couleurs élémentaires. Sur une combinaison (ex. Éclipse = `light` + `dark`),
> chaque composante prend sa propre couleur.

### 7.3 Soin
```json
"heal": 11, "scaling": [{ "source": "sagesse", "ratio": 0.6, "affects": "heal" }]
```

### 7.4 Effets de stats (buffs / malus) — `effects[]`
Modifie une stat/attribut. `SpellStatEffect` :

| Champ       | Type                     | Description |
|-------------|--------------------------|-------------|
| `stat`      | `SpellScalingSource`     | Stat/attribut affecté (voir §8.1). |
| `value`     | `number`                 | Magnitude de base (toujours positive ; le signe vient de `targets`). |
| `scaling`   | `SpellScaling[]`         | Scaling propre à cet effet. |
| `magnitude` | `léger` / `modéré` / `fort` | Repli qualitatif si `value` n'est pas chiffré. |

```json
"effects": [
  { "stat": "speed", "value": 1, "scaling": [{ "source": "dexterite", "ratio": 0.5 }] },
  { "stat": "atk_phy", "value": 1 }
]
```

### 7.5 Statuts infligés — `inflicts[]`
`SpellStatusApplication` :

| Champ      | Type     | Description |
|------------|----------|-------------|
| `status`   | `string` | Clé du statut (voir §8.3). |
| `chance`   | `number` | Chance d'infliger à l'impact, 0–100 %. |
| `duration` | `number` | Durée en tours si différente de la durée par défaut du statut. **Négative = illimitée.** |

```json
"inflicts": [{ "status": "brulure", "chance": 50, "duration": 3 }]
```

**Affichage** : `chance < 100` → « **Peut appliquer** <statut> (X %) » ; `chance = 100` → « **Applique** <statut> » (sans pourcentage, l'effet est certain).

### 7.6 Durée qui scale — `durationScaling[]`
Ajoute des tours selon une source : `ratio × valeur(source)`.
```json
"duration": 3, "durationScaling": [{ "source": "constitution", "ratio": 0.2 }]
```

### 7.7 Contre-coup — `recoil`
Dégâts que le **lanceur** s'inflige. `SpellRecoil` :

| Champ       | Type             | Description |
|-------------|------------------|-------------|
| `damageMin` | `number` ✅      | Dégâts subis (min). |
| `damageMax` | `number`         | Max si différent du min. |
| `scaling`   | `SpellScaling[]` | Scaling du contre-coup. |
| `note`      | `string`         | Précision affichée (ex. « à la main »). |

```json
"recoil": { "damageMin": 2, "damageMax": 4, "note": "à la main" }
```

### 7.8 Scaling global du nœud — `scaling[]`
Contributions appliquées aux dégâts / soin / mana du nœud. `SpellScaling` :

| Champ     | Type                    | Description |
|-----------|-------------------------|-------------|
| `source`  | `SpellScalingSource`    | Stat ou attribut source (voir §8.1). |
| `ratio`   | `number`                | Multiplicateur appliqué à la valeur de la source. |
| `affects` | `damage` / `heal` / `mana` | Valeur cible. Défaut : `damage`. |

> **Affichage** : les décompositions au survol sont **symboliques** (`Base 4–7`
> puis `+ 0,5 × Attaque magique`) — aucune valeur n'est injectée, l'idée est de
> poser le calcul à la main.

### 7.9 Choix — `choices[]` (sorts à options)
Le lanceur en choisit **un** à l'incantation ; la liste s'étoffe souvent au fil
des paliers. **Chaque choix porte son propre jeu d'effets** — le mécanisme n'est
pas réservé aux « ordres » : Verbe d'autorité (choix → statut), mais aussi p. ex.
Symbiose végétale (une plante par choix, chacune à l'effet distinct).

`SpellChoice` : `name`, `description?`, et au besoin `mana?` (le coût peut
dépendre du choix), `damageMin`/`damageMax`, `damageType?`, `heal?`, `effects?`
(`SpellStatEffect[]`), `inflicts?` (`SpellStatusApplication[]`), `recoil?`
(`SpellRecoil` — contrecoup propre au choix), `duration?`.

```json
"choices": [
  { "name": "Halte !", "description": "La cible cesse tout mouvement.",
    "inflicts": [{ "status": "paralysie", "chance": 80 }] },
  { "name": "Liane étrangleuse", "description": "Une plante qui écrase la cible.",
    "damageMin": 6, "damageMax": 9, "inflicts": [{ "status": "enracinement", "chance": 60 }] },
  { "name": "Fleur de sève", "description": "Une plante qui soigne l'invocateur.",
    "heal": 8, "duration": 3 }
]
```

### 7.10 Bonus de classe — `classBonuses[]`
Bonus accordé selon la classe du personnage. `SpellClassBonus` :

| Champ         | Type                | Description |
|---------------|---------------------|-------------|
| `class`       | `string`            | Clé de classe (voir §8.6). |
| `description` | `string` ✅         | Description du bonus (indispensable pour un changement de fonctionnement). |
| `effects`     | `SpellStatEffect[]` | Modificateurs chiffrés éventuels (puce `+N Stat`). |
| `scaling`     | `SpellScaling[]`    | Scaling additionnel (puce `+ratio × source (dégâts/soin)`). |
| `manaFactor`  | `number`            | Facteur sur le coût en mana (`0.5` = mana ÷2 → puce `Mana −50 %`). |
| `bonusAction` | `boolean`           | Le sort se lance en **action bonus** au lieu de coûter l'action du tour. |
| `freeStrike`  | `boolean`           | Le lanceur porte aussitôt une attaque gratuite avec ce que le sort vient d'enchanter. |

Ces formes sont rendues en puces distinctes, en plus de la description.

**Le bonus Pugiliste des sorts « Poings »** prend l'une de trois formes, et une
seule à la fois :

| Forme | Domaines | Ce qu'elle donne |
|-------|----------|------------------|
| `bonusAction` | air, ténèbres, mort, feu, eau | Le sort se lance en **action bonus** : nimber ses poings ne coûte plus le tour, il reste l'action pour frapper. |
| `manaFactor` | électricité, espace, temps, eau (Brume) | Mana divisé par deux. |
| `scaling` | terre, vie, lumière, plante, eau (Glace) | Ratio de dégâts accru à chaque frappe. |

> Le créneau a remplacé l'ancienne « attaque directe », qui n'était qu'une
> phrase que le moteur ne résolvait pas — ou, dans un seul domaine, une frappe
> gratuite (`freeStrike`). Rendre le TOUR disponible se lit mieux qu'un coup
> offert une fois, et correspond mieux à ce qu'est un réflexe.

```json
"classBonuses": [
  { "class": "warrior", "description": "Votre discipline amplifie l'effet.",
    "effects": [{ "stat": "atk_phy", "value": 2 }] },
  { "class": "pugilist", "description": "Coût réduit à mains nues.", "manaFactor": 0.5 }
]
```

### 7.11 Météo invoquée — `weather`
Clé de météo (voir §8.4), surcharge celle du sort. Les effets de la météo
(statuts, dégâts aléatoires, modificateurs par domaine) s'affichent
automatiquement depuis `weathers.json`.
```json
"weather": "heatwave"
```

### 7.12 Déplacements instantanés — `teleport`, `swap`
Deux mécaniques distinctes, à ne pas confondre.

`teleport` emmène le lanceur sur une **case libre** ; il exige une ligne de vue,
et `teleportRange` chiffre le saut quand il diffère de la portée de l'effet.
Ce que le sort FAIT se produit à l'arrivée : l'effet suit son lanceur.

**Un piège à éviter** : `teleport` et `teleportRange` se déclarent sur CHAQUE
palier. Les oublier au palier II fait *perdre* la téléportation à qui améliore
son sort, alors que la fiche continue de la promettre.

`swap` **permute** le lanceur avec un **combattant**. Il ne vise donc pas un
point : ni ligne de vue, ni case libre à trouver. `swapMark` nomme le statut qui
donne prise, et il en faut **deux** : la cible doit le porter **et le lanceur
aussi**, l'un comme l'autre posés de sa main. `range` borne la distance.

```json
"stats": { "mana": 7, "range": "30 m", "area": "Cible unique",
           "targets": ["self", "ally", "enemy"],
           "swap": true, "swapMark": "marque-spatiale",
           "reaction": ["incoming-attack"] }
```

### 7.13 Sort qui s'impose — `requiresHit`, `precisionPenalty`
Un sort sans dégâts porte d'office. `requiresHit` lui rend un jet de toucher —
**contre les cibles hostiles seulement** : sur soi ou sur un allié, rien à viser.
`precisionPenalty` retranche des points de précision au jet (5 points = un cran
de dé) : c'est ce qui rend un sceau ou une emprise difficile à placer.

```json
"stats": { "mana": 10, "range": "Contact", "requiresHit": true, "precisionPenalty": 25 }
```

### 7.14 Trait guidé — `homingMark`
Nomme le statut qui GUIDE le projectile. Contre une cible qui le porte — posé par
le lanceur lui-même — la capacité touche **à coup sûr** et se passe de ligne de
vue. Il lui faut en revanche un **chemin** : une cible scellée derrière du plein
(mur, rocher, arbre, porte close) sur tous ses côtés est hors d'atteinte. Sans
marque, le sort redevient un tir ordinaire.

```json
"stats": { "damageMin": 2, "damageMax": 4, "mana": 2, "range": "14 m",
           "area": "Cible unique", "targets": ["enemy"],
           "homingMark": "marque-spatiale" }
```

### 7.15 Cibler par la marque — `marksTargets`, `consumesMark`
Le sort agit sur **tous les porteurs** du statut nommé — posé par le lanceur —,
où qu'ils soient. À déclarer avec `area: "Tous les marqués"`, qui donne la forme
`marked` : ni portée, ni ligne de vue, ni jet de toucher, et aucune case à viser.
Refusé quand rien n'est marqué.

`consumesMark: true` dépense la marque après l'effet. À réserver à ce qui la
DÉTRUIT : un piège qui doit durer la laisse en place.

```json
"stats": { "damageMin": 3, "damageMax": 6, "mana": 5,
           "range": "Toutes vos marques", "area": "Tous les marqués",
           "targets": ["everyone"],
           "marksTargets": "marque-spatiale", "consumesMark": true }
```

`targets` fait le tri : `["everyone"]` emporte aussi vos alliés marqués et
vous-même, `["enemy"]` épargnerait votre camp.

### 7.16 Écart d'un champ d'ancrage — `anchorGap`
Distance que le champ posé par ce palier impose entre les porteurs qu'il
gouverne (« 1,5 m », « 3 m »…). C'est ce qui fait progresser un piège : plus
l'écart est large, plus la ligne adverse se disloque. À défaut : 1,5 m.

Le palier ne dit que la **distance**. Qui le champ gouverne, et depuis quoi
l'écart se compte, se déclare sur le `sustain` du **statut** que le palier
inflige (`status_effects.json`) :

| Champ du `sustain` | Effet |
|--------------------|-------|
| `governs: "<clé>"`   | Ne gouverne que les porteurs de cette marque, posée par le même lanceur. |
| `governsMetal: true` | Gouverne quiconque **porte du métal** — armure, arme, ferraille au sac. Rien à marquer au préalable. |
| `repelsFromHolder: true` | L'écart se compte depuis **le porteur du statut**, et non entre les gouvernés. |

Ces deux dernières lignes séparent un **piège** d'un **bouclier**. Le piège
(`ancrage`) interdit à ses marqués de se toucher **entre eux** — c'est ainsi
qu'une ligne se disloque. Le bouclier (`repulsion-magnetique`) ne protège que
celui qui le tend : les autres restent libres de se serrer, mais aucun d'eux ne
l'approche. Un champ `repelsFromHolder` ne repousse jamais son propre porteur.

### 7.17 Saisir du métal — `pullsMetal`, `pullDc`

Le sort **arrache** un objet ferreux à sa cible et le verse au sac du lanceur.
Il ne se vise pas comme un trait : on désigne quelqu'un, le moteur regarde ce
qu'il porte réellement, et le joueur choisit sa prise dans la liste.

Viser une case **libre de tout corps** aimante le **sol** : la ferraille qui y
traîne vient au sac sans un pas. Une seule prise par incantation dans tous les
cas — désigner quelqu'un debout sur un tas de débris ne rapporte pas double.

Ce qui dort dans un **sac** vient sans que personne s'en aperçoive. Ce qui est
**tenu au poing** se dispute : la cible jette sa Force contre `pullDc` et garde
son arme si elle réussit. La perdre, c'est être désarmé — la capacité d'arme
quitte la cible pour de bon. Sans `pullDc`, rien ne se dispute.

L'arme volée reste une **arme** : elle atterrit au sac du lanceur, prête à être
empoignée. Et si sa main principale est **vide**, elle s'y loge d'office et
gratuitement — le champ l'amène jusqu'au poing, il serait absurde de demander un
second geste pour refermer les doigts dessus. La maîtrise est alors rejugée
contre ce que le VOLEUR a appris, jamais contre ce que savait le volé.

> ⚠️ **L'armure n'est jamais une prise.** Une cotte de mailles se lace et se
> sangle : un champ tire son homme avec, il ne la lui retire pas. Elle rend en
> revanche son porteur sensible aux champs (voir §7.18).

```json
"stats": { "mana": 3, "range": "10 m", "area": "Cible unique",
           "targets": ["enemy", "ally", "self"],
           "pullsMetal": true, "pullDc": 12 }
```

### 7.18 Projeter du métal — `throwsMetal`

Le sort **lance** un objet ferreux que le lanceur porte. N'écris **ni**
`damageMin` **ni** `damageType` : ils viennent de l'objet. Une lame arrachée
taille, une enclume écrase, une flèche perfore. Le `scaling` du nœud, lui,
s'ajoute normalement — c'est la poussée du lanceur, et elle appartient au sort.

L'objet **ne revient pas** dans le sac : il quitte l'inventaire, et une arme
projetée quitte la main. Sans rien de ferreux sur soi, le sort est indisponible
(le bouton est grisé, l'action n'est pas dépensée).

**Il ne disparaît pas pour autant — il tombe.** Si le coup porte, il retombe
aux pieds de la cible ; s'il manque, il file une à trois cases au-delà, dans le
prolongement du tir. Rater coûte donc deux fois : le coup, puis la marche pour
aller le reprendre. Un mur l'arrête à son pied plutôt que de l'avaler, et il ne
sort jamais du plateau. Il garde sa matière en tombant : un champ peut le
reprendre, et qui le ramasse peut le relancer.

N'importe qui peut ramasser ce qui traîne sur sa case ou une case voisine — un
geste qui coûte l'**action bonus** en combat, et rien hors combat.

```json
"stats": { "mana": 5, "range": "12 m", "area": "Cible unique",
           "targets": ["enemy"], "throwsMetal": true,
           "scaling": [{ "source": "atk_mag", "ratio": 0.08 }] }
```

Un `inflicts` posé sur le nœud s'applique quel que soit le projectile : c'est
ainsi que Projette-métal III survolte ce qu'il lance.

**De quoi un objet est fait** se déclare au catalogue par une clé `material`
(fiche d'arme, set d'armure, munition, ou entrée d'`equipment/index.json`), qui
pointe sur `materials.json`. Le magnétisme s'en **déduit** : seuls le fer
et l'acier sont ferromagnétiques. Le plomb d'une bille de fronde, le bronze d'un
astrolabe et l'or d'une chevalière sont des métaux sans être saisissables — la
physique le dit, on ne l'écrit plus objet par objet.

### 7.19 Façonner de la matière — `shapesMaterial` (domaine de la Terre)

Le domaine de la Terre n'a **pas un sort par pierre** : il a un sort par
**famille**, dont la saveur vient de ce qu'on façonne réellement. `shapesMaterial`
nomme la famille — `stone`, `metal` ou `crystal` — et se déclare sur le **sort**,
pas sur chaque palier : une lame de pierre reste de la pierre en montant en
puissance.

N'écris **ni** le matériau, **ni** ses chiffres : ils viennent du catalogue
[`materials.json`](../frontend/public/resources/json/materials.json)
et se résolvent au lancer. Le même « Mur de pierre » est du granite bon marché
aux Dorsales, de l'obsidienne tranchante à l'Archipel, et une improvisation
coûteuse en pleine mer.

```json
{ "key": "earth-mur-de-pierre", "shapesMaterial": "stone", … }
```

**Trois paliers**, essayés dans cet ordre :

| Palier | Condition | Prix et qualité |
|--------|-----------|-----------------|
| **Manipulation** | La matière est là, sous les pieds (géologie de la scène) | Mana ×0,6. Stable. Aucune étude requise — mais on ne choisit pas, le sol impose. |
| **Ex-nihilo étudié** | La matière est **étudiée** | Prix plein. Universel, mais la forme se décompose sans soutien. |
| **Improvisation** | Ni là, ni étudiée, mais **vue ET touchée** | Mana ×1,5, effet ÷2, −2 crans de précision. Un filet de secours. |

Rien des trois → le sort est **refusé** (bouton grisé, aucune action dépensée).

> **Le sol l'emporte sur ce qu'on porte en tête.** En zone native d'un matériau
> de la bonne famille, c'est lui qui sort. Forcer son matériau équipé reste
> possible et coûte un surcoût fixe de mana.

> ⚠️ **Spécificité du domaine : c'est la MATIÈRE qui dit les chiffres.**
> Un sort de Terre n'écrit ni ses dégâts, ni sa défense, ni son type. Il écrit
> seulement `materialScale` — **combien** de matière le palier façonne — et le
> catalogue fournit le reste (`damage`, `defense`, `damageType`).
>
> Ailleurs, le palier donne un nombre que le contexte module de quelques points.
> Ici, changer de pierre change vraiment d'arme : une lame d'obsidienne fait
> 16–27 **tranchants** là où le granite fait 12–20 **contondants**. C'était la
> seule façon de rendre le choix de matière lisible — en pourcentage, l'arrondi
> écrasait tout écart sur les petites valeurs.

`manaFactor` reste un multiplicateur et entre dans la même chaîne que la météo
et le moment de la journée. La matière transmet aussi ses faiblesses, ses
résistances et ses purges (améthyste → peur, charme).

Ce que la matière fournit, selon la forme que le sort lui donne :

| Le sort… | prend de la matière | à l'échelle |
|----------|---------------------|-------------|
| inflige (`damageMin`) | `damage` + `damageType` | `materialScale` |
| protège physiquement (`effects` def_phy) | `defense` | `materialScale` |
| protège magiquement (`effects` def_mag) | `magicDefense` — **facultatif** | `materialScale` |
| nimbe (revêtement poings/arme) | `damage` × `ENCHANT_SHARE` | `materialScale` |
| dresse un mur (`raisesWall`) | `defense` × `WALL_THICKNESS` | `materialScale` |
| **alourdit** (`recoil` sur `speed`) | `speedPenalty` | `materialScale` |

**Les deux défenses sont distinctes.** La dureté arrête les coups, la
résonance arrête les sorts — et `magicDefense` est **facultatif** : la plupart
des pierres ne l'ont pas. Un sort qui accorde `def_mag` n'en accorde donc
**aucune** s'il est taillé dans du grès ; la ligne disparaît, au lieu de prêter
silencieusement à la paroi la valeur de sa dureté. Cela donne à chaque famille
son identité : la **pierre** encaisse, le **métal** encaisse et blinde un peu,
le **cristal** résonne.

Le **malus de vitesse** est le contrepoids de la défense : sans lui, on
prendrait toujours la pierre la plus dure. Le sort dit seulement « ceci
alourdit » ; la matière dit de combien. Une armure de basalte protège mieux
qu'une d'ardoise mais pèse trois fois plus, et une armure d'**or** protège mal
tout en écrasant son porteur — un mauvais choix assumé, pas un oubli.

`ENCHANT_SHARE` et `WALL_THICKNESS` sont exportées par `rules.ts` : la fiche de
sort les importe au lieu de les recopier, pour que l'affichage ne puisse pas
diverger du moteur.

**Côté personnage** : l'étude s'ouvre une fois par palier de maîtrise (niveaux
1, 5, 9, 13, 17), soit cinq matériaux au maximum sur une carrière. Un alliage
exige ses composants — le bronze demande le cuivre **et** l'étain.

**Côté scène** : la géologie se règle dans le simulateur (bandeau d'ambiance,
bouton △), par préréglage régional ou matériau par matériau.

### 7.20 Dresser un mur — `raisesWall` (domaine de la Terre)

Le sort **dresse un obstacle réel** sur la case visée, au lieu de frapper ou
d'accorder une défense abstraite.

```json
"stats": { "mana": 5, "range": "14 m", "area": "Ligne 4 cases",
           "targets": ["everyone"], "duration": 3,
           "raisesWall": { "length": 4, "hp": 20 } }
```

`length` en cases, `hp` la santé de base. Le mur se pose **perpendiculairement
à la visée** du lanceur — on ne dresse pas une barricade dans son propre axe de
tir — et il n'occupe jamais une case où quelqu'un se tient.

Il **arrête les pas et les regards** comme n'importe quel mur (il entre dans le
décor effectif, donc déplacement, calcul de chemin et ligne de vue le
respectent), et il **s'attaque** : viser sa case lui inflige les dégâts, il
n'esquive pas et ne pare pas. À zéro, il s'effondre.

**Le palier de façonnage décide de sa vie**, ce qui est la première conséquence
vraiment visible du système de matériaux (§7.19) :

| Palier | Solidité | Durée |
|--------|----------|-------|
| Manipulation (matière sur place) | `hp` × facteur de la matière | **Permanent** |
| Ex-nihilo (matière étudiée) | idem | `duration` tours |
| Improvisation (matière connue) | moitié | moitié, minimum 1 tour |

**Toute paroi cède au contondant** : un mur ne se tranche pas et ne brûle pas,
il se brise. Le contondant compte donc double contre n'importe quel mur — c'est
ce qui empêche un mage de Terre de bloquer indéfiniment une escouade d'épéistes.
La matière ajoute ses propres failles (le poison contre le calcaire, la foudre
contre le cuivre), mais **les deux ne se cumulent pas** : c'est la meilleure des
deux qui compte, pas leur produit.

Sur le plateau, le mur porte la **teinte de sa matière** (`color` au catalogue)
et se clique pour lire sa santé, sa tenue et ses failles.

### 7.21 Ancrage d'un statut — `tetherRange`
Donne une **laisse** aux statuts que le palier pose : au-delà de cette distance
de celui qui les a posés, ils se rompent d'eux-mêmes (et se rompent aussi si
l'ancre tombe). C'est ce qui permet une marque de durée illimitée sans qu'elle
suive son porteur au bout du monde.

```json
"stats": { "mana": 2, "range": "Contact", "tetherRange": "15 m",
           "inflicts": [{ "status": "marque-spatiale", "chance": 100, "duration": -1 }] }
```

---

## 8. Tables de référence

### 8.1 Sources de scaling — `SpellScalingSource`
Stats de combat : `atk_mag`, `atk_phy`, `def_mag`, `def_phy`, `hp`, `mana`,
`endurance`, `speed`.
Attributs : `force`, `dexterite`, `constitution`, `intelligence`, `sagesse`,
`charisme`.

### 8.2 Types de dégâts (`damage_type.json` → `specific_damage_types`)
`bludgeoning`, `piercing`, `slashing` (physiques) · `fire`, `ice`, `lightning`,
`water`, `earth`, `wind`, `plant`, `dark`, `light`, `life`, `death`, `space`,
`time` (magiques).

**Type par défaut selon le domaine** (si `damageType` absent) :

| Domaine | Type | Domaine | Type | Domaine | Type |
|---------|------|---------|------|---------|------|
| fire | `fire` | plant | `plant` | time | `time` |
| water | `water` | light | `light` | space | `space` |
| earth | `earth` | darkness | `dark` | | |
| air | `wind` | life | `life` | | |
| electricity | `lightning` | death | `death` | | |

### 8.3 Statuts (`status_effects.json`)
`brulure`, `poison`, `necrose`, `saignement`, `paralysie`, `sommeil`,
`etourdissement`, `gel`, `enracinement`, `silence`, `aveuglement`,
`ralentissement`, `affaiblissement`, `vulnerabilite`, `rage`, `berserk`, `peur`,
`ancrage`, `charme`, `confusion`, `controle`, `marque-spatiale`,
`provocation`, `regeneration`, `hate`, `wet`, `repulsion-magnetique`.

### 8.4 Météos (`weathers.json`)
`storm`, `blizzard`, `rain`, `drought`, `heatwave`, `fog`, `gale`,
`magical-night`, `radiant-sky`, `hail`, `sandstorm`.

### 8.5 Zones — `area`
`"Soi-même"` · `"Cible unique"` · `"N cibles"` · `"Rayon N m"` · `"Cône N m"` ·
`"Ligne N m"` · `"Tous les marqués"` (voir §7.15).

### 8.6 Cibles — `SpellTarget`
`enemy` (Ennemis) · `ally` (Alliés) · `self` (Soi-même) · `everyone` (Tout le monde).

### 8.6 Classes
`warrior` (Guerrier) · `mage` (Mage) · `ranger` (Ranger) · `rogue` (Vagabond) ·
`pugilist` (Pugiliste).

---

## 9. Convention de nommage des paliers

Un sort **évolue en propriétés, jamais en un autre sort** : une braise ne
devient pas une boule de feu, elle reste une braise aux propriétés évoluées.

- **Tronc** : `<Nom du sort> I`, `<Nom> II`, `<Nom> III` (ex. « Braises I »).
- **Branche** : `<Nom du sort> <Qualificatif de branche> I/II`, la numérotation
  **repart à I** pour chaque branche (ex. « Braises Incandescente I », « Braises
  Economes I »).

Le qualificatif de branche est un adjectif dérivé du thème de la voie
(Incandescente, Économe, Déflagrante, Focalisée…).

---

## 10. Motif récurrent : revêtement d'arme / de poings

Un même sort de base est décliné dans **les 12 domaines** : enchanter son arme
(ou ses poings) pour ajouter des dégâts élémentaires à chaque coup, le temps de
l'enchantement.

- **Deux sorts séparés** par domaine — pour dissocier le bonus de classe :
  - `<domaine>-revetement-poings` (**niveau 2**, mains nues) → bonus **Pugiliste**.
  - `<domaine>-revetement-arme` (**niveau 3**, arme) → `requires` le poing, plus
    un bonus d'une classe martiale thématique (Guerrier / Ranger / Vagabond).
- **Élément** = type du domaine (`damageType` au niveau du sort) ; `scaling` sur
  `atk_phy` (arme) ou `force` (poings).
- **Nom thématique** par domaine (ex. Feu → « Lame ardente » / « Poings ardents »).
- Le **bonus Pugiliste varie** entre trois formes (§7.10) : attaque directe
  (description seule), mana ÷2 (`manaFactor`), ou ratio de dégâts accru (`scaling`).
- Des **variantes** dans un domaine changent l'élément et/ou le statut infligé
  (ex. Eau : *Glace* → `ice` + ralentissement ; *Brume* → `water` + aveuglement),
  chacune restant une paire poings (nv 2) → arme (nv 3).

---

## 11. Exemple annoté complet

```json
{
  "key": "fire-embers",                          // slug = /magics/spell/fire-embers
  "name": "Braises",
  "description": "Émet de multiples braises qui brûlent ce qu'elles touchent.",
  "usage": {                                     // utilité par défaut (héritée par les paliers)
    "combat": "Projette des braises pour infliger des dégâts de feu.",
    "outOfCombat": "Permet d'allumer un feu de camp ou une torche."
  },
  "mana": 2,
  "level": 1,
  "icon": "/resources/media/icons/domains/fire/combustion_icon.png",
  "subdomains": ["Combustion"],
  "progression": {
    "root": "e1",
    "branches": [
      { "id": "brasier",     "label": "Voie de l'incandescence", "description": "Dégâts et brûlure croissants." },
      { "id": "persistante", "label": "Voie de l'économe",       "description": "Coût de mana en chute libre." }
    ],
    "nodes": [
      {
        "id": "e1", "tier": 1, "branch": "trunk", "name": "Braises I",
        "description": "Projette une poignée de braises sur une cible proche.",
        "next": ["e2"],
        "stats": {
          "damageMin": 2, "damageMax": 4, "mana": 2,
          "range": "8 m", "area": "Cible unique", "targets": ["enemy"],
          "inflicts": [{ "status": "brulure", "chance": 10 }],
          "scaling": [{ "source": "atk_mag", "ratio": 0.3 }]
        }
      },
      {
        "id": "e3", "tier": 3, "branch": "trunk", "name": "Braises III",
        "description": "Point de scission : le foyer peut évoluer selon deux voies.",
        "next": ["b4", "p4"],                    // 2 enfants → l'arbre se scinde ici
        "stats": { "damageMin": 7, "damageMax": 11, "mana": 4, "range": "10 m",
                   "area": "Cible unique", "targets": ["enemy"],
                   "inflicts": [{ "status": "brulure", "chance": 20 }],
                   "scaling": [{ "source": "atk_mag", "ratio": 0.5 }] }
      },
      {
        "id": "b4", "tier": 4, "branch": "brasier", "name": "Braises Incandescente I",
        "description": "Les braises embrasent une petite zone autour de l'impact.",
        "usage": { "outOfCombat": "L'embrasement gagne en ampleur : de quoi défricher des broussailles." },
        "next": ["b5"],
        "stats": { "damageMin": 12, "damageMax": 18, "mana": 6, "range": "12 m",
                   "area": "Cible unique", "targets": ["enemy"],
                   "inflicts": [{ "status": "brulure", "chance": 50 }],
                   "scaling": [{ "source": "atk_mag", "ratio": 0.7 }] }
      }
    ]
  }
}
```

---

## 12. Checklist avant d'ajouter un sort

- [ ] `key` unique et en `kebab-case`, préfixée par le domaine.
- [ ] `subdomains` correspondent à des sous-domaines existants du fichier.
- [ ] `requires` renseigné si le sort n'est pas un sort de base (map de déblocage).
- [ ] Chaque `node.id` unique dans l'arbre ; `progression.root` pointe un nœud existant.
- [ ] Tout `id` cité dans `next[]` existe.
- [ ] Chaque nœud a un `stats.mana`.
- [ ] Noms des paliers conformes à la convention (§9).
- [ ] Sort hors-combat uniquement : texte par palier dans `node.usage.outOfCombat`, pas dans `description` (§3).
- [ ] Clés de `status` / `weather` / `damageType` / `class` valides (§8).
- [ ] Sort qui saisit ou projette du métal : les objets visés portent bien
      `metallic: true` au catalogue (§7.18) — sans quoi le sort n'a aucune prise.
- [ ] Sort de Terre qui produit de la matière : `shapesMaterial` déclaré, et
      AUCUN chiffre de matériau écrit sur les paliers (§7.19).
- [ ] JSON valide : `node -e "require('./domaine.json')"` puis un `ng build`.
