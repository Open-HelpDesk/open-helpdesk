# Smoke test de bout en bout

Rejoue les parcours du produit sur une instance qui tourne vraiment — sa base,
son SMTP, ses sessions. Il ne remplace pas des tests unitaires : il attrape la
classe de défaut qui coûte le plus cher ici, celle qu'aucun typage ne voit.

Les quatre défauts qui ont motivé cette suite, tous réels, tous invisibles à la
compilation :

| Défaut | Ce que le test vérifie désormais |
|---|---|
| Un réglage enregistré que personne ne lit (`portalEnabled`, `kbPublished`, `tenants.locale`) | Couper l'interrupteur coupe vraiment le portail |
| Une redirection qui perd le sous-domaine du tenant | Le lien magique ouvre bien une session |
| Une garde de rôle qui n'existe que dans l'interface | Un agent est refusé par l'URL directe et par l'API |
| Une traduction manquante ou un format perdu | L'allemand s'affiche, et « 4.182 » garde son séparateur |
| Une forme de pluriel absente d'une langue qui en compte quatre | Le polonais choisit `few` ou `many` quand il le doit |
| Un contrôle dessiné mais inerte | Le champ du logo est un vrai `input[type=file]`, et le fichier déposé s'affiche |
| Deux statuts traduits par le même mot | Aucun libellé en double dans un jeu, sur 24 langues |
| Un libellé écrit en dur dans un composant | Aucun texte accentué hors du dictionnaire |

## Avant de lancer

```bash
# 1. Les services
docker compose -f docker/docker-compose.yml up -d      # Postgres, Mailpit, MinIO

# 2. La base
pnpm db:migrate && pnpm db:seed && pnpm db:seed:auth

# 3. L'application — BASE_DOMAIN DOIT correspondre au port
pnpm --filter @openhelpdesk/web build
BASE_DOMAIN=localhost:3006 pnpm --filter @openhelpdesk/web exec next start --port 3006
```

Sans la correspondance `BASE_DOMAIN` ↔ port, le middleware ne résout aucun tenant
et **tout répond 404** : c'est le premier piège de l'environnement local.

## Lancer

```bash
pnpm --filter @openhelpdesk/smoke smoke          # la suite
pnpm --filter @openhelpdesk/smoke smoke:ui       # mode interactif
SMOKE_HEADED=1 pnpm --filter @openhelpdesk/smoke smoke   # navigateur visible
```

Variables : `SMOKE_PORT` (3006), `SMOKE_BASE_URL`, `SMOKE_TENANT` (acme),
`SMOKE_MAILPIT_URL` (http://localhost:8026).

Le navigateur est le Chrome installé sur la machine (`channel: "chrome"`) : aucun
binaire à télécharger.

## Ce qui est couvert

| Fichier | Parcours |
|---|---|
| `request-lifecycle` | Dépôt d'une demande → lien magique → réponse de l'agent → lecture par le client |
| `portal-public` | Accueil, typeahead, catégorie, article, vote, recherche, état vide |
| `agent-workflow` | Connexion, inbox, vues, ticket, priorité, palette ⌘K, déconnexion |
| `kb-permissions` | Agent en lecture seule vs Admin en écriture, sur les écrans **et** l'API |
| `settings-toggles` | Les interrupteurs ST-09 coupent le portail et la base |
| `branding` | Dépôt du logo et du favicon, affichage dans les deux shells, isolation entre tenants |
| `i18n` | Bascule allemand/polonais/français, séparateurs de milliers, sélection de pluriel, contenu du tenant non traduit |
| `i18n-source` | Tables de pluriel et jeux de vocabulaire des 24 dictionnaires — **sans navigateur** |
| `i18n-source-francais` | Aucun texte français ne vit hors de `i18n/` — **sans navigateur** |

## Les contrôles statiques

`i18n-source` est la seule vérification du dossier qui ne lance pas de
navigateur : elle lit les 24 dictionnaires comme du texte. Deux familles de
défauts y sont couvertes.

**Les tables de pluriel.** Elle compare les formes fournies à celles que
`Intl.PluralRules` peut sélectionner dans la langue.

Elle existe parce que le typage ne peut pas la remplacer. `Message` n'exige
qu'une forme `other` — toutes les autres sont optionnelles, puisque aucune langue
n'utilise le même jeu. Un dictionnaire polonais amputé de sa forme `many`
compile donc sans un mot, et affiche une phrase fausse dès qu'un compteur passe
à 5.

Deux catégories sont volontairement hors périmètre, et le test le dit dans son
code : le `many` du tchèque, du slovaque et du lituanien, qui ne concerne que les
nombres décimaux — aucun `{count}` du produit n'en reçoit ; et le `many` du
français, de l'espagnol, de l'italien et du portugais, qui se déclenche au
million exact.

**Les jeux de vocabulaire** — statuts, priorités, urgences, canaux. Ces libellés
vivent dans des tables de correspondance, à l'écart des écrans qui les affichent,
et le risque propre à un jeu est la collision : deux statuts traduits par le même
mot donnent un filtre où deux entrées sont identiques, sans que rien ne plante.
Le français ne peut pas révéler ce défaut, puisque c'est lui la source.

Le contrôle statique ne prouve pas pour autant que le produit *choisit* la bonne
forme : c'est le rôle du test polonais d'`i18n`, qui lit le nombre affiché par
l'accueil du portail, en déduit la catégorie avec `Intl.PluralRules` et exige la
phrase correspondante. Le polonais est choisi parce qu'aucun nombre entier n'y
sélectionne `other` : une sélection cassée ne peut pas s'y cacher derrière le
repli.

## Règles de rédaction

Trois pièges rencontrés en écrivant cette suite, qui valent d'être connus avant
d'ajouter un test :

1. **N'attendez jamais une durée**, attendez un signal du produit : une URL, un
   élément, un code HTTP. Pour ce qui prend du temps, `expect(...).toPass()`.
2. **`getByText` matche aussi le contenu d'un `<textarea>`** — React y rend la
   valeur comme nœud texte. Une assertion sur le texte qu'on vient de saisir
   passe au vert sans que rien n'ait été envoyé. Vérifiez le résultat là où il
   compte, jamais l'état du champ de saisie.
3. **Le tenant est partagé.** Tout ce qu'un test modifie dans les réglages, il le
   remet — `try/finally` ou `afterEach`. Les workers valent 1 pour cette raison.

## Limites connues

- La suite **écrit** dans la base de développement : elle y laisse les demandes
  qu'elle dépose et un fichier image orphelin dans MinIO. À lancer sur une base
  jetable, pas sur des données auxquelles vous tenez.
- Better Auth plafonne la connexion à trois tentatives par dizaine de secondes et
  par IP. `signInAgent` réessaie, ce qui suffit — mais deux exécutions
  simultanées de la suite se gêneront.
- `i18n` et `settings-toggles` basculent des réglages du tenant partagé. Ils les
  remettent en `afterEach`, mais une exécution interrompue en plein milieu peut
  laisser le workspace dans une autre langue ou son portail coupé.
