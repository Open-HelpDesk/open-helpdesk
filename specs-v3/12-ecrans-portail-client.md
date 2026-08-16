# Écrans — Portail client (PT)

> Version 1.1 — 16 août 2026. Ajoute PT-08 et révise PT-07.
>
> **Shell commun** : surface publique aux couleurs du tenant (logo, accent),
> volontairement simple et aérée — c'est le seul écran que voient les clients finaux.
> Header : logo, recherche, « Soumettre une demande », « Mes demandes », menu compte.
> Footer discret « Propulsé par Open HelpDesk » (masquable en Pro). Base :
> `{slug}.open-helpdesk.com/help`. Responsive mobile prioritaire.

---

## PT-01 — Accueil du centre d'aide — `/help`

- **Composants** : bandeau titre + grande barre de recherche avec suggestions
  instantanées (typeahead sur les articles), grille des catégories (icône, nom, nb
  d'articles), articles les plus consultés, carte « Vous ne trouvez pas ? Soumettre une
  demande ».
- **États** : KB désactivée → redirection directe vers PT-04 ; recherche sans résultat →
  CTA de contact.

## PT-02 — Catégorie — `/help/categories/[slug]`

- **Composants** : fil d'Ariane, description de la catégorie, sections repliables listant
  les articles (titre + extrait), navigation latérale des autres catégories.

## PT-03 — Article — `/help/articles/[slug]`

- **Composants** : corps riche max 68ch avec sommaire latéral (h2), date de mise à jour,
  bloc de vote « Cet article vous a aidé ? 👍 👎 » (le 👎 propose de créer une demande
  pré-remplie avec le contexte), articles liés.

## PT-04 — Soumettre une demande — `/help/requests/new`

- **Objectif** : formulaire de création de ticket, dynamique selon le formulaire
  configuré (ST-04).
- **Composants** : sélecteur de type de demande (si plusieurs formulaires publics), email
  (pré-rempli si connecté), sujet — avec **suggestion d'articles KB en direct pendant la
  saisie du sujet** (déflexion) —, champs du formulaire, description riche, pièces
  jointes (drag & drop, 10 Mo), envoi.
- **États** : confirmation avec numéro de demande + lien de suivi ; si non connecté,
  email de vérification avec lien magique vers la demande.

## PT-05 — Mes demandes — `/help/requests`

- **Composants** : table simple : n°, sujet, statut (libellés client : « En cours », « En
  attente de votre réponse » — jamais le vocabulaire interne), dernière activité.
  Filtres : ouvertes / résolues. Onglet « Demandes de mon organisation » si le droit est
  accordé (AG-08 ou PT-08).
- **États** : vide → « Aucune demande » + CTA. Badge sur les demandes qui attendent une
  réponse du client.

## PT-06 — Détail d'une demande — `/help/requests/[id]`

- **Composants** : fil chronologique épuré (messages publics uniquement — jamais les
  notes internes), zone de réponse avec pièces jointes, bouton « Marquer comme résolue » /
  « Rouvrir », panneau latéral : statut, créée le, référence. Après résolution : bloc CSAT
  inline (Bon/Mauvais + commentaire).

## PT-07 — Connexion portail — `/help/login` *(révisé v1.1)*

- **Objectif** : une seule saisie — l'email — quel que soit le mode d'authentification de
  l'organisation du contact.
- **Composants** : champ email. À la saisie, le domaine est rapproché des domaines
  vérifiés (voir [`15-sso-et-identite.md`](15-sso-et-identite.md) § 2.1) :
  - domaine porteur d'une connexion SSO active → carte « {Organisation} utilise la
    connexion par compte d'entreprise » + bouton unique vers le fournisseur, et lien
    discret « Vous ne parvenez pas à vous connecter ? Recevoir un lien par email »
    (masqué si l'organisation a choisi le mode strict) ;
  - sinon → lien magique (« Consultez votre boîte de réception »), comportement v1.
  Mode mot de passe optionnel selon ST-09. Création de compte implicite au premier ticket
  ou à la première connexion SSO.
- **États** : lien magique ; lien envoyé ; **SSO détecté** ; mot de passe ; IdP
  indisponible → repli explicite avec message.
- **Ne jamais** faire choisir son fournisseur au contact : la découverte se fait sur le
  domaine, pas sur une liste déroulante.

## PT-08 — Administration de mon organisation — `/help/organization` *(nouveau v1.1)*

- **Objectif** : permettre à une organisation cliente de brancher son annuaire
  d'entreprise sans passer par le support du tenant. C'est ce qui rend le SSO client
  viable à l'échelle de plusieurs centaines d'organisations.
- **Accès** : contacts portant le rôle **Administrateur d'organisation**, via le menu
  compte. Invisible pour les autres.
- **En-tête** : nom et logo de l'organisation, phrase de portée (« ce que vous réglez ici
  s'applique aux n personnes de {Organisation} »).
- **Onglet Connexion SSO** :
  - interrupteur d'activation + chip de statut ;
  - choix du fournisseur en cartes : Microsoft Entra ID, Google Workspace, Okta, Autre —
    chaque carte annonce le protocole et le nombre de champs attendus ;
  - formulaire adapté : **OIDC** = identifiant client, secret client (saisi une fois,
    alerte d'expiration à J-30), identifiant de locataire ; **SAML** = URL de métadonnées,
    certificat lu automatiquement avec sa date d'expiration ;
  - bloc « à copier dans votre fournisseur » : URI de redirection (ou ACS), portées
    demandées (ou Entity ID) ;
  - deux options : imposer le SSO aux collaborateurs (mode strict) ; créer les comptes à
    la première connexion (JIT) ;
  - bouton de test qui ouvre le fournisseur et restitue un message explicite.
- **Onglet Domaines** : un bloc par domaine — statut, nombre de collaborateurs ; pour les
  domaines en attente, l'enregistrement `TXT` à publier, le bouton « Vérifier maintenant »
  et « Copier l'enregistrement ». Un domaine non vérifié ne peut pas porter de SSO.
- **Onglet Collaborateurs** : toggle « demandes visibles par toute l'organisation » ;
  table des membres (nom, email, rôle, moyen de connexion utilisé, nombre de demandes) ;
  invitation d'un second administrateur — insister sur ce point, une organisation avec un
  seul administrateur devient un point de blocage.
- **États** : SSO inactif ; actif ; test réussi ; test en échec (portée `email` non
  accordée par le fournisseur) ; domaine en attente ; avertissement du mode strict
  (« si votre fournisseur devient indisponible, vos collaborateurs ne pourront plus
  accéder à leurs demandes »).
- **Ton** : le lecteur est un responsable informatique chez le client, pas un
  administrateur Open HelpDesk. Éviter le vocabulaire interne du produit ; parler de
  « collaborateurs » et de « demandes », jamais de « contacts » ni de « tickets ».
