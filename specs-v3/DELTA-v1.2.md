# Delta v1.1 → v1.2 — à appliquer aux specs existantes

> 16 août 2026. Le site vitrine, jusque-là renvoyé à plus tard, est spécifié
> entièrement ; une surface de documentation apparaît.
> Total : **46 → 51 écrans**.
>
> Fichiers régénérés dans ce dossier :
> [`14-ecrans-site-signup.md`](14-ecrans-site-signup.md) (SM-01 → SM-06) et le nouveau
> [`16-documentation.md`](16-documentation.md).

---

## 1. Ce qui change

| Écran | État | Contenu |
|---|---|---|
| SM-01 Inscription | Révisé | Colonnes qui se replient, provisioning inchangé |
| SM-02 Tarifs | Révisé | Groupe **Identité** ajouté au comparatif, mise en forme reprise |
| SM-03 Accueil | **Nouveau** | Hero sombre, trois blocs illustrés, capacités, chiffres, citation |
| SM-04 Produit | **Nouveau** | Sélecteur de surface, captures pleine largeur, vignettes |
| SM-05 vs Zendesk | **Nouveau** | Trois cartes, tableau de douze capacités, deux encarts |
| SM-06 Open source | **Nouveau** | Terminal, AGPL vs /ee, pile technique |
| DOC Documentation | **Nouveau** | Quinze pages, quatorze figures, trois colonnes |

---

## 2. `README.md`

Ligne de chapeau :

```
Stack : TypeScript · Node.js · Next.js · React — 51 écrans spécifiés (16 août 2026, v1.2).
```

Sommaire — remplacer la ligne `14-…` et ajouter la ligne `16-…` :

```
| [14-ecrans-site-signup.md](14-ecrans-site-signup.md) | SM-01 → SM-06 : accueil, produit, comparateur, open source, tarifs, inscription cloud |
| [16-documentation.md](16-documentation.md) | DOC : gabarit, blocs de contenu, arborescence des quinze pages, règles rédactionnelles |
```

Retirer de la description du fichier 14 la mention « le site vitrine complet sera
spécifié à part » : il l'est désormais.

---

## 3. `01-produit-et-architecture.md`

### 3.1 § 3 — Architecture, monorepo

L'application `www` héberge maintenant deux surfaces distinctes. Remplacer sa ligne :

```
│   ├── www/          # Site marketing, comparateurs, signup cloud (Next.js, statique)
│   ├── docs/         # Documentation publique (Next.js, MDX, index de recherche au build)
```

La documentation peut rester dans `www` sous `/docs` si vous préférez un seul
déploiement ; dans ce cas, conservez un routage et un gabarit séparés — l'en-tête, la
navigation et la densité typographique ne sont pas les mêmes.

### 3.2 § 9 — Roadmap

Ajouter une ligne :

```
| Lot 6 — Acquisition | Site vitrine complet, comparateurs, documentation publique | SM-03 → SM-06, DOC |
```

Le Lot 6 dépend du Lot 3 : les captures qui illustrent le site et la documentation
supposent un produit fonctionnel et un jeu de données de démonstration stable.

---

## 4. Contraintes d'implémentation issues du design

Trois pièges rencontrés en maquettant, qui coûteront du temps s'ils sont redécouverts
en développement.

### 4.1 Ne pas poser une capture dynamique dans un `<img src>`

Le rendu progressif effectue une passe où les valeurs ne sont pas encore résolues. Un
`<img>` charge son `src` inconditionnellement à cette passe, y compris caché, y compris
retiré du DOM 200 ms plus tard — d'où une requête vers une URL littérale invalide. Ni une
garde conditionnelle ni un ajustement du rendu squelette n'y changent quoi que ce soit :
la garde n'est pas évaluée à cette passe.

Poser la capture en fond CSS. Un `url()` non résolu est un token invalide, qui ne
déclenche aucune requête.

```html
<div role="img" aria-label="…"
     style="width:100%;aspect-ratio:924/540;
            background-image:url('…');background-size:cover;
            background-position:top center"></div>
```

### 4.2 Ne pas caler un élément collant sur un en-tête qui peut passer à la ligne

L'en-tête du site était `min-height: 70px` avec `flex-wrap: wrap` ; à certaines largeurs
il passait à 110 px, et l'en-tête collant du tableau comparatif, calé sur `top: 70px`, se
retrouvait à moitié masqué. Fixer la hauteur de l'en-tête (`height: 70px`,
`flex-wrap: nowrap`, navigation en défilement horizontal) et n'y caler les offsets qu'après.

Corollaire : un élément `position: sticky` dont le conteneur a exactement sa hauteur n'a
aucune amplitude et ne collera jamais. C'était le cas de la barre de surfaces de SM-04.

### 4.3 Ne pas laisser une piste de grille fixe écraser le contenu

Une grille `minmax(0,1fr) 200px` ne fait pas céder la piste fixe : sur écran étroit, le
corps de la documentation tombait à 314 px, les blocs de code débordaient de 147 px et les
captures devenaient illisibles. Utiliser un conteneur flex où le rail secondaire se replie
sous le contenu.

---

## 5. Jeu de données de démonstration

Le site et la documentation partagent les mêmes captures ; elles supposent un jeu de
données constant. À figer dans un seed dédié.

| Élément | Valeur |
|---|---|
| Workspace | Acme Support, slug `acme`, accent `#0B5F46` |
| Agents | Marie Dupont (Admin), Thomas Roux, Claire Bonnet (Owner), Sofiane Amrani, Élise Chabot |
| Organisations | Nordfil SAS, Vertigo Media, Groupe Halbran, Studio Kaori, Delta Logistique |
| Ticket de référence | #4821 — « Impossible d'exporter les factures en PDF », Julien Lambert, SLA dépassé |
| Résolution de capture | 924 × 540 |

Toute recapture partielle doit conserver ce jeu : les figures se référencent entre elles
d'une page à l'autre de la documentation.
