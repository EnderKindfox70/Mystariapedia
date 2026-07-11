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
| `duration` | `number` | Durée en tours si différente de la durée par défaut du statut. |

```json
"inflicts": [{ "status": "brulure", "chance": 50, "duration": 3 }]
```

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

Ces trois formes sont rendues en puces distinctes, en plus de la description.
Exemple d'usage : le bonus Pugiliste des sorts « Poings » varie entre une attaque
directe (description seule), un mana divisé par deux (`manaFactor`) et un ratio de
dégâts accru (`scaling`).

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
`charme`, `confusion`, `provocation`, `regeneration`, `hate`, `wet`.

### 8.4 Météos (`weathers.json`)
`storm`, `blizzard`, `rain`, `drought`, `heatwave`, `fog`, `gale`,
`magical-night`, `radiant-sky`, `hail`, `sandstorm`.

### 8.5 Cibles — `SpellTarget`
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
- [ ] JSON valide : `node -e "require('./domaine.json')"` puis un `ng build`.
