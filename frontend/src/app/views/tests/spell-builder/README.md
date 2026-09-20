# Spell builder — banc d'essai (`/tests`)

Banc d'essai de `mystaria_mecanique_personnalisation_sorts.md` (**WIP**, idée non
adoptée) : la personnalisation de sorts par budget de points, testée sur des
**copies** de sorts réels et un **joueur type** modifiable. Onglet « Spell
builder » de la page `/tests` (`ng serve` puis <http://localhost:4200/tests>).

Lien direct vers un cas : `/tests?player=brenn&spell=combo-coulee-de-lave`.

Rien ici n'est lu par le wiki : les copies de `data/spells/` sont des duplicatas,
les vrais sorts de `public/resources/json/domains/` ne sont jamais modifiés.

## Fichiers

| Fichier | Rôle |
|---|---|
| `combat/spell-customization.ts` | Moteur pur (sans Angular) — **toutes** les règles, partagé avec la fiche officielle |
| `engine.spec.ts` | Les règles du document une par une + fidélité des copies au wiki |
| `data.ts` | Imports des copies et joueurs types, contexte de référence |
| `data/spells/*.json` | 7 copies de sorts (Braises, Échauffement, Fils du marionnettiste, Étincelle vitale, Attire-métal, Coulée de lave, Toxine végétale) |
| `data/players/*.json` | Joueurs types (Ignis, Brenn, Sève) |
| `spell-builder.*` | Le composant |

Ajouter une copie : déposer le JSON dans `data/spells/` et l'importer dans `data.ts`.
Le spec vérifie que `baseStats` est le nœud racine réel à l'identique et que
chaque plafond ancré (`tier3`, `treeMin`, `treeMax`) vaut bien la valeur qu'il
cite : retoucher un sort du wiki fait échouer le spec tant que la copie n'a pas
suivi.

Lancer seulement ce spec : `npx vitest run src/app/views/tests/spell-builder/engine.spec.ts`
(depuis `frontend/`).

## Hypothèses prises là où le document ne tranche pas

Toutes réglables dans le panneau « Règles » du banc sauf mention contraire.

1. **Courbe d'XP** : seuil *cumulé* du niveau N = 10 × N (lecture littérale) ;
   une courbe croissante est proposée pour comparer.
2. **Points par niveau de sort** : 5, soit 25 points au plus par sort au niveau 5.
3. **Niveau de sort** : ne dépend QUE de l'XP du sort, jamais du niveau du
   personnage. Le niveau du personnage ne sert qu'à *apprendre* le sort
   (niveau requis de la fiche). **Tout sort plafonne au niveau 5** pour
   l'instant (règle `maxSpellLevel`) ; l'XP au-delà est gardée sans effet.
4. **Inspiration** : 1 point pour connaître un sort ; « domaine investi » (4ter)
   = le personnage connaît au moins un sort de ce domaine.
5. **Plafonds** ancrés sur le tier 3 réel du sort ; plancher de mana = minimum de l'arbre.
6. **Zone dégradée** : le k-ième cran excédentaire coûte `coût unitaire × k²`.
7. **Plafond dur** : l'interface bloque le ▲ ; le moteur compte les points
   excédentaires comme perdus (Option A) si un build importé les contient.
8. **Chance d'infliger** : 5 % par point ; **valeur d'effet** (buffs) : 1 par
   point, plafond dur comme dégâts/soin. Signalés « hyp. » à l'écran.
9. **Mode continu** : entretien de base = coût de lancement **de base** (pas
   celui déjà réduit en Famille 1).
10. **Mixage** : réparti sur les dés ; le scaling global se répartit dans la même
    proportion dans l'aperçu.
11. **Mécanique de domaine** : un statut gouverné (plante) bloque le swap ET le
    déblocage de statut ; la *chance* reste achetable.
12. **Ordre d'application** : swaps (F4) → magnitudes (F1) → déblocages (F2) →
    paliers (F3) → mixage, qui répartit le pool final.
