# Écrans — Documentation (DOC)

> Version 1.2 — 16 août 2026. Nouvelle surface, non spécifiée en v1.
> `docs.open-helpdesk.com`, ou `www…/docs`.

## 1. Rôle

La documentation est la surface la plus lue après l'espace agent, et la seule que
consultent les prospects techniques avant de s'inscrire. Elle est publique, sans
authentification, et son contenu vit dans le dépôt : chaque page porte un lien
« Proposer une correction » vers le fichier Markdown correspondant.

Elle est **illustrée par des captures réelles de l'application**, pas par des schémas.
Quatorze figures numérotées et légendées jalonnent les quinze pages.

## 2. Gabarit

Trois colonnes, dans cet ordre de priorité quand la largeur manque :

| Zone | Largeur | Comportement |
|---|---|---|
| Sommaire général | 272 px fixe | Toujours visible, défile indépendamment |
| Corps de page | `flex: 1 1 440px`, `min-width: 0` | Prend toute la largeur disponible |
| Sommaire de page | `flex: 0 1 200px` | **Passe sous le corps** quand la largeur ne suffit plus |

> **Contrainte** : le sommaire de droite ne doit jamais être une piste de grille fixe. Une
> grille `minmax(0,1fr) 200px` écrase le corps à ~314 px sur un écran étroit, ce qui rend
> les blocs de code défilables horizontalement et les captures illisibles. Un conteneur
> flex avec repli est la seule mise en page acceptable ici.

En-tête propre à la documentation (62 px) : logo, badge DOCS, champ de recherche ⌘K,
lien vers le site, bouton GitHub.

## 3. Blocs de contenu

Le corps de page est une séquence de blocs typés. Un seul jeu de blocs sert les quinze
pages ; n'en ajoutez pas sans nécessité.

| Bloc | Rendu |
|---|---|
| `heading` | Titre de section, 25 px. Alimente le sommaire de droite. |
| `text` | Paragraphe, 16,5 px, `max-width: 72ch`, `text-wrap: pretty`. |
| `list` | Puces avec un fragment initial en gras. |
| `steps` | Étapes numérotées reliées par un filet vertical. |
| `shot` | Capture en cadre navigateur + légende numérotée. |
| `code` | Bloc monospace avec en-tête (langage + copier). |
| `note` | Encart coloré : `info`, `warn`, `danger`, `tip`. |
| `table` | Tableau à colonnes déclarées, défilable horizontalement. |
| `cards` | Grille de cartes cliquables vers d'autres pages. |

Chaque page se termine par une navigation précédent / suivant qui suit l'ordre du
sommaire général.

## 4. Arborescence — quinze pages

| Groupe | Page | Contenu clé |
|---|---|---|
| Démarrage | Vue d'ensemble | Les quatre surfaces, vocabulaire, cycle de vie du ticket |
| Démarrage | Premier ticket | Modes de réception, enregistrements DNS, email de test |
| Démarrage | Rôles et permissions | Quatre rôles produit, deux rôles portail, désactivation d'un agent |
| Espace agent | Inbox et vues | Lire une ligne, raccourcis clavier, vues, actions groupées |
| Espace agent | Traiter un ticket | Public vs interne, bouton scindé, macros, collision, fusion |
| Espace agent | Rapports | Les six indicateurs, médiane vs moyenne, lecture de la conformité |
| Portail client | Centre d'aide | Déflexion, vocabulaire client, partage d'organisation |
| Portail client | Base de connaissances | Structure, brouillon/publication, écrire un article utile |
| Configuration | Canal email | Adresses, diagnostic d'une réception cassée, signature |
| Configuration | Automatisations | Deux familles, ordre d'exécution, boucles, quatre règles à créer |
| Configuration | SLA et horaires | Trois échéances, ordre des politiques, calcul détaillé |
| Identité | SSO des agents | Prérequis, SAML pas à pas, SCIM |
| Identité | SSO des clients | Délégation, découverte par domaine, vérification, supervision |
| Développeurs | API et webhooks | Auth, création de ticket, limites, signature HMAC, événements |
| Développeurs | Auto-hébergement | Installation, variables, sauvegardes, mises à jour, /ee |

## 5. Règles rédactionnelles

- **Une page répond à une question**, pas à un écran. « Recevoir votre premier ticket »
  traverse trois écrans ; c'est voulu.
- **Dire ce qui casse.** Les encarts `danger` sont réservés aux erreurs irréversibles ou
  bloquantes : note interne confondue avec une réponse publique, SSO imposé sans compte de
  secours vérifié, domaine non vérifié, fusion de tickets.
- **Montrer le calcul.** Sur les SLA, un exemple chiffré du vendredi 17 h au lundi 11 h
  vaut mieux que trois paragraphes sur la suspension des compteurs.
- **Pas de conditionnel commercial.** La documentation décrit ce que le produit fait
  aujourd'hui ; les fonctions à venir n'y figurent pas.

## 6. Figures

Quatorze figures, numérotées en continu à travers les pages, chacune légendée par une
phrase qui dit **ce qu'il faut regarder** — pas ce que l'on voit.

Les captures sont prises à **924 × 540**, sur un jeu de données de démonstration
constant (workspace « Acme Support », contacts Nordfil, Vertigo, Halbran). Toute
recapture doit conserver ce jeu, sans quoi les figures se contredisent d'une page à
l'autre.

> **Piège de capture** : dans l'espace d'administration et la console, le code d'écran
> (`ST-07`, `CO-03`) est rendu dans un `<span>` à l'intérieur de la ligne cliquable. Un
> sélecteur qui cherche un `div` sans enfant dont le texte vaut exactement le code ne
> trouve rien, le clic ne part pas, et la capture enregistre silencieusement l'écran par
> défaut. Cibler le `<span>` puis remonter à son parent.

## 7. Reste à faire

- La recherche ⌘K est maquettée mais non fonctionnelle. Prévoir un index statique
  construit au build plutôt qu'une recherche serveur.
- Pas de versionnement de la documentation. À prévoir dès la première version majeure
  du produit auto-hébergé.
- Pas de version anglaise. Le site est bilingue, la documentation ne l'est pas encore.
