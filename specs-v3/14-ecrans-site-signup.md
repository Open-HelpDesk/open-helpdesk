# Écrans — Site public & signup (SM)

> Version 1.2 — 16 août 2026. La v1 ne spécifiait que le tunnel d'acquisition
> (SM-01, SM-02) et renvoyait le site vitrine à plus tard. Ce fichier le spécifie
> entièrement : quatre pages ajoutées, deux révisées.
>
> **Shell commun** : `www.open-helpdesk.com`. En-tête collant de 70 px sur **une seule
> ligne** — logo, navigation (Produit, Tarifs, vs Zendesk, Open source, Documentation),
> Connexion, bouton d'essai. La navigation défile horizontalement plutôt que de passer à
> la ligne : l'en-tête doit garder une hauteur fixe, plusieurs éléments collants s'y
> réfèrent. Sur fond sombre (accueil, open source), l'en-tête devient transparent-vert
> profond et inverse ses couleurs. Pied de page commun sur toutes les pages sauf SM-01.

---

## Direction artistique

Le site est la seule surface où le produit se vend ; il assume une esthétique plus
affirmée que l'application.

- **Fond sombre `#08281E`** pour les zones d'accroche (hero, bandeau de chiffres, page
  open source, colonne gauche du signup). Le reste en blanc.
- **Deux polices** : Inter pour toute l'interface, et **Instrument Serif en italique**
  pour un seul fragment du titre principal et pour la citation client. Nulle part ailleurs.
- **Titres** : 66 px en accroche, 50 px en tête de page, 38 px en section, avec
  `letter-spacing` négatif marqué (−.035 em) et `text-wrap: balance`.
- **Captures réelles** : chaque bloc de fonctionnalité montre une capture de l'application
  dans un cadre navigateur (barre de titre, trois pastilles, URL en monospace). Pas
  d'illustration abstraite, pas de pictogramme décoratif.
- **Contrainte technique** : les captures sont posées en `background-image` sur un `div`
  avec `aspect-ratio`, jamais en `<img src>` — voir la note d'implémentation en fin de
  fichier.

---

## SM-03 — Accueil — `www…/`

- **Objectif** : convertir en moins d'un écran et demi. Le visiteur doit comprendre ce
  qu'est le produit, pourquoi il est moins cher, et qu'il peut partir avec son instance.
- **Séquence** :
  1. **Hero sombre** : pastille AGPL-3.0 + « données hébergées en Europe » ; titre sur
     deux lignes dont la seconde en serif italique ; sous-titre ; deux boutons (« Créer mon
     workspace », « Héberger moi-même ») ; trois garanties en ligne (gratuit ≤ 3 agents,
     sans carte, prêt en moins d'une minute) ; **capture de l'inbox agent en cadre
     navigateur, débordant sur la section suivante**.
  2. **Bandeau de confiance** : cinq noms de clients en gris, sans logo inventé.
  3. **Trois blocs de fonctionnalité alternés** (texte/capture, puis capture/texte) :
     espace agent, automatisations & SLA, portail & base de connaissances. Chacun : sur-titre,
     titre, paragraphe, trois puces avec un fragment en gras.
  4. **Grille de huit capacités** : email managé, clavier d'abord, rapports, API-first,
     SSO et conformité, horaires ouvrés, satisfaction, auto-hébergement.
  5. **Bandeau de chiffres sur fond sombre** : 4× moins cher, < 60 s, 100 % du cœur
     publié, UE.
  6. **Citation client** en serif, centrée, avec attribution.
  7. **Carte d'appel final** sur fond vert clair.
- **États** : aucun état conditionnel. La page est statique.

## SM-04 — Produit — `www…/product`

- **Objectif** : montrer les quatre surfaces sans forcer le visiteur à ouvrir quatre pages.
- **Layout** : en-tête de page, puis une **barre de sélection de surface** (Espace agent,
  Portail client, Administration, Console cloud) qui remplace le contenu en dessous.
  Cette barre **ne doit pas être collante** : son conteneur a la hauteur de la barre
  elle-même, donc `position: sticky` n'aurait aucune amplitude de défilement.
- **Contenu par surface** : titre, introduction, **capture pleine largeur en cadre
  navigateur**, trois blocs de texte courts, puis une à deux **vignettes légendées**.
- **Note éditoriale** : la surface « Console cloud » est présentée comme inaccessible au
  client. L'assumer est un argument de transparence, pas une faiblesse.

## SM-05 — Comparateur — `www…/vs-zendesk`

- **Objectif** : traiter frontalement la comparaison, y compris là où le produit perd.
  Une page de comparaison qui ne concède rien n'est pas crue.
- **Composants** :
  - trois cartes de positionnement (Zendesk Suite, Freshservice, Open HelpDesk) avec
    fourchette de prix et une phrase de posture ;
  - **tableau capacité par capacité** sur quatre colonnes : capacité, Zendesk,
    Freshservice, Open HelpDesk. La colonne produit est en vert quand elle gagne, **en
    gris quand elle perd** (CMDB, ITIL changement/problème) ;
  - deux encarts en vis-à-vis : « Choisissez Open HelpDesk si » (cinq cas) et
    « Restez chez eux si » (quatre cas, formulés sans ironie).
- **Ton** : factuel, aucune superlative. Les fourchettes de prix concurrentes doivent être
  datées et sourçables.

## SM-06 — Open source — `www…/open-source`

- **Objectif** : convaincre un profil technique que le dépôt est réel et complet.
- **Composants** :
  - hero sombre avec le badge de licence et le chemin GitHub en monospace ;
  - bloc **trois commandes** dans un terminal sombre (clone, cp .env, docker compose up)
    avec la ligne de résultat ;
  - **deux colonnes en vis-à-vis** : « Dans le cœur AGPL » (six entrées) et « Dans /ee,
    sous licence commerciale » (cinq entrées) — la seconde explicite le modèle open-core ;
  - **grille de la pile technique** : six cartes clé / choix / justification en une phrase ;
  - carte de bascule vers le cloud, formulée sans dévaloriser l'auto-hébergement.

## SM-02 — Tarifs — `www…/pricing` *(révisé)*

Inchangé sur le fond ; la mise en forme est reprise.

- Bascule mensuel / annuel (−20 %) au-dessus des trois cartes ; la carte Standard est
  mise en avant par un fond teinté, une bordure d'accent, une ombre et une étiquette
  « LE PLUS CHOISI » débordant du bord supérieur.
- Deux blocs côte à côte : **carte open source** (avec la commande docker) et **FAQ en
  accordéon** (quatre questions).
- **Tableau comparatif détaillé** en cinq groupes : Ticketing, Canaux, Productivité,
  **Identité** (nouveau : SAML/SCIM agents, SSO délégué clients), Analyse et conformité.
  L'en-tête du tableau est collant sous l'en-tête du site — l'offset dépend de la hauteur
  fixe de celui-ci.

## SM-01 — Inscription cloud — `www…/signup` *(révisé)*

Inchangé sur le parcours ; deux corrections de mise en page.

- **Deux colonnes qui se replient** : colonne gauche sombre (accroche, quatre arguments,
  citation), colonne droite blanche (formulaire). En dessous d'environ 800 px, les deux
  colonnes s'empilent.
- Étape 1 : SSO Google/Microsoft, puis email et mot de passe avec jauge de robustesse.
- Étape 2 : nom d'entreprise, **sous-domaine avec vérification en direct** (état
  disponible / pris, suggestions cliquables), taille d'équipe en segments, consentement.
- Étape 3 : **écran de provisioning** à quatre étapes animées, avec l'état « lent
  (> 30 s) » qui bascule sur un message d'attente asynchrone.
- Pas de pied de page sur cette page.

---

## Note d'implémentation — captures et rendu progressif

Le rendu progressif effectue une passe où les valeurs dynamiques ne sont pas encore
résolues. Un `<img src="{{ … }}">` déclenche alors une requête vers une URL littérale
invalide : l'élément `<img>` charge son `src` inconditionnellement, et aucune garde
conditionnelle n'est évaluée à cette passe.

**Règle** : toute capture pilotée par une valeur dynamique se pose en fond CSS.

```html
<div role="img" aria-label="…"
     style="width:100%;aspect-ratio:924/540;
            background-image:url('…');background-size:cover;
            background-position:top center;background-color:var(--sunk)"></div>
```

Les captures de référence font 924 × 540. Une capture posée en `<img>` avec une source
littérale (le hero de l'accueil) ne pose pas ce problème.
