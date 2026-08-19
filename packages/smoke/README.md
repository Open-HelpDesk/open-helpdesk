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
| `i18n` | Bascule allemand/français, séparateurs de milliers, contenu du tenant non traduit |

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
- `kb-permissions` porte un `test.fixme` : un agent voit aujourd'hui le titre des
  brouillons dans la liste `/app/kb`, alors que la recherche les lui cache. Le
  test documente le comportement actuel et porte l'attente correcte à côté.
