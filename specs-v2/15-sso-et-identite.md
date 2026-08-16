# Open HelpDesk — Identité & authentification (SSO)

> Spécification v1.1 — 16 août 2026. Complète les specs v1 : ajoute quatre écrans
> (ST-13, ST-14, PT-08) et révise PT-07. À lire avec
> [`02-design-system.md`](02-design-system.md).

## 1. Deux fonctionnalités distinctes, souvent confondues

Le produit doit authentifier deux populations qui n'ont ni la même échelle ni le même
propriétaire de configuration.

| | SSO agents | SSO organisations clientes |
|---|---|---|
| Qui se connecte | Les agents du tenant | Les contacts, sur le portail |
| Volume | 5 à 200 personnes | Des centaines d'organisations, des milliers de personnes |
| Nombre d'IdP | **1** par tenant | **1 par organisation cliente**, soit N par tenant |
| Qui configure | L'admin du tenant | **L'organisation cliente elle-même**, depuis le portail |
| Surface | `/app/settings/sso` (ST-13) | `/help/organization` (PT-08), supervisé en ST-14 |
| Protocoles | SAML 2.0 + SCIM 2.0 | OIDC en priorité, SAML 2.0 en repli |

Traiter le second cas avec le formulaire du premier ne passe pas l'échelle : à trois
cents organisations, l'admin du tenant deviendrait le support technique des annuaires de
ses propres clients.

## 2. Modèle du SSO client

### 2.1 Découverte par domaine (Home Realm Discovery)

Le contact ne choisit jamais son fournisseur. Il saisit son email ; le domaine est
rapproché des `Organization.email_domains` existants (voir AG-08) :

```
email saisi → extraction du domaine → VerifiedDomain actif ?
  ├─ oui + OrgSsoConnection active  → redirection vers l'IdP de l'organisation
  ├─ oui + connexion en erreur      → repli lien magique + alerte console (ST-14)
  └─ non                            → lien magique (comportement v1 inchangé)
```

La résolution doit se faire **avant** tout envoi d'email, en une seule requête indexée
sur le domaine.

### 2.2 Vérification de domaine obligatoire

Une organisation ne peut porter une connexion SSO sur un domaine qu'après preuve de
possession : enregistrement `TXT` de la forme `ohd-verify=<token>` sur la zone du
domaine. Sans cette barrière, n'importe quelle organisation revendiquant `client.com`
détournerait les comptes des contacts de ce domaine — c'est la faille classique de ce
type de fonctionnalité.

Règles :

- un domaine vérifié appartient à **une seule** organisation par tenant ;
- la vérification est revérifiée toutes les 24 h ; trois échecs consécutifs suspendent la
  connexion SSO et repassent le domaine en « à vérifier » ;
- les domaines grand public (`gmail.com`, `outlook.com`, liste noire maintenue) sont
  refusés.

### 2.3 Délégation

La configuration appartient à l'organisation cliente. Un contact reçoit le rôle
**Administrateur d'organisation** ; il accède alors à PT-08 depuis le menu compte du
portail. Le tenant garde trois leviers, et seulement ceux-là : autoriser ou non la
délégation globalement, superviser le parc (ST-14), désactiver une connexion.

Le tenant **ne peut pas** modifier la configuration d'une organisation : il n'a ni les
secrets ni la légitimité. En cas de panne, ST-14 propose « Prévenir l'admin », pas
« Corriger ».

### 2.4 Provisionnement à la première connexion

Un contact inconnu qui s'authentifie via l'IdP d'une organisation est créé et rattaché à
cette organisation (JIT), si l'option est active côté PT-08. Les attributs repris :
email, prénom, nom. Aucun rôle n'est déduit de l'IdP côté portail — le rôle
Administrateur d'organisation reste nommé manuellement.

### 2.5 Repli en cas de panne d'IdP

Par défaut, le lien magique reste disponible : un IdP indisponible ne doit pas couper
l'accès d'un client à ses demandes en cours. Une organisation peut choisir le mode strict
(SSO seul) ; son administrateur conserve alors un accès par lien email, sans quoi une
erreur de configuration l'enfermerait dehors.

> **À trancher** : le mode strict doit-il être limité, ou proposé librement ? Certains
> secteurs réglementés l'exigeront ; il augmente mécaniquement le volume de tickets
> « je ne peux plus me connecter » côté tenant.

## 3. Modèle de données (ajouts au schéma `app`)

| Entité | Champs clés | Relations |
|---|---|---|
| `VerifiedDomain` | domaine, token de vérification, statut (à vérifier / vérifié / échec), dernière vérification, organisation | → Organization |
| `OrgSsoConnection` | protocole (oidc / saml), fournisseur (entra / google / okta / générique), état (active / à vérifier / erreur / désactivée), config chiffrée (client_id, client_secret, tenant_id **ou** metadata_url, certificat, entity_id), strict_mode, jit_enabled, dernière connexion réussie, dernière erreur | → Organization, → VerifiedDomain (n) |
| `OrgAdminGrant` | contact, organisation, accordé par, date | → Contact, → Organization |
| `SsoAuthEvent` | organisation, contact, résultat, motif d'échec, IP, horodatage | reporting ST-14, rétention 90 j |

Extensions d'entités existantes :

- `Tenant` : `sso_delegation_enabled` (bool), `agent_sso_*` (config SAML/SCIM de ST-13).
- `Contact` : `auth_method` (magic_link / sso), `external_id` (sub OIDC ou NameID SAML).
- `Organization` : les `email_domains` de la v1 deviennent la clé de rapprochement du
  HRD et se doublent d'un `VerifiedDomain` dès qu'un SSO est demandé.

Les secrets clients et certificats sont chiffrés au repos (KMS ou clé applicative) et
jamais renvoyés en clair par l'API — seul un suffixe masqué est affiché.

## 4. Rôles — ajouts à la matrice de la v1

| Surface | Rôle | Portée |
|---|---|---|
| Portail | **Administrateur d'organisation** | Tout ce que voit un Contact, plus : connexion SSO de son organisation, vérification de ses domaines, liste des collaborateurs, partage des demandes, désignation d'un autre administrateur |

Ce rôle est accordé par un agent depuis AG-08 (fiche organisation) ou par un
administrateur d'organisation déjà en place.

## 5. Écrans

### ST-13 — SSO des agents — `/app/settings/sso`

- **Objectif** : connecter l'annuaire de l'entreprise cliente pour ses propres agents.
- **Onglets** : SAML 2.0 · SCIM.
- **SAML** : activation (badge plan Pro) et statut de connexion ; choix de l'IdP (Okta,
  Entra ID, Google Workspace, OneLogin, SAML générique) ; Entity ID, URL de connexion,
  certificat X.509 avec date d'expiration et alerte à J-30 ; import des métadonnées XML ;
  bloc « à renseigner chez votre fournisseur » (ACS, Entity ID, métadonnées SP, format
  NameID) avec copie ; correspondance des attributs (email, prénom, nom requis ; rôle,
  équipe optionnels) ; option « piloter les rôles depuis l'IdP » qui rend les rôles en
  lecture seule dans ST-02 ; trois niveaux d'application (optionnel / imposé aux domaines
  vérifiés / imposé à tous) ; durée de session ; **compte de secours** toujours autorisé
  par mot de passe ; domaines vérifiés.
- **Test de connexion** : ouvre l'IdP et restitue le détail par étape — redirection,
  signature de l'assertion, audience et destinataire, attributs requis, résolution du
  compte. Aucun réglage n'est appliqué tant que le test n'a pas abouti.
- **États** : inactif ; connecté ; test réussi ; test en échec (attribut manquant) ;
  avertissement de verrouillage sur « imposé à tous ».
- **SCIM** : URL de base, jeton porteur affiché une seule fois, correspondance groupes
  IdP → équipe + rôle, journal de synchronisation (create / update / deactivate / sync)
  avec libération automatique du siège à la désactivation.

### ST-14 — SSO des organisations clientes — `/app/settings/customer-sso`

- **Objectif** : superviser des centaines de connexions que le tenant ne configure pas.
- **Composants** :
  - interrupteur global de délégation (badge plan Pro) ;
  - quatre compteurs : connexions actives, en attente de vérification, en erreur, secrets
    expirant sous 30 jours ;
  - table dense : pastille de santé, organisation, domaines, protocole, statut (active /
    à vérifier / erreur / désactivée / sans SSO), membres, administrateur côté client.
    Recherche par organisation ou domaine, filtres rapides, export CSV ;
  - bloc **Attention requise** : une ligne par anomalie actionnable (certificat expiré,
    domaine non vérifié depuis n jours, secret expirant, taux d'échec anormal), avec le
    nombre de personnes impactées et l'action « Prévenir l'admin » ;
  - drawer de détail : statut, protocole, domaines, administrateur côté client, échecs sur
    24 h, comportement de repli. Aucune action de configuration — seulement désactiver.
- **États** : parc sain ; connexion en erreur (ligne surlignée rouge) ; délégation
  désactivée (la table passe en lecture seule et le tenant configure lui-même).

### PT-07 — Connexion portail — `/help/login` *(révisé)*

Ajout de la découverte par domaine. Le contact saisit son email ; si le domaine porte une
connexion SSO active, l'écran affiche « {Organisation} utilise la connexion par compte
d'entreprise » et un bouton unique vers le fournisseur, avec un lien discret « Vous ne
parvenez pas à vous connecter ? Recevoir un lien par email » (masqué en mode strict).

- **États** : lien magique (défaut v1) ; lien envoyé ; **SSO détecté** ; mot de passe
  (option ST-09) ; IdP indisponible → repli explicite avec message.

### PT-08 — Administration de mon organisation — `/help/organization`

- **Objectif** : permettre à un client de brancher son annuaire sans passer par le
  support du tenant. Écran le plus technique du portail — il doit rester lisible par un
  responsable informatique non spécialiste.
- **Accès** : contacts portant `OrgAdminGrant`, via le menu compte.
- **Onglet Connexion SSO** : activation et statut ; choix du fournisseur sous forme de
  cartes (Entra ID, Google Workspace, Okta, autre) qui annoncent le nombre de champs
  attendus ; formulaire adapté au protocole — OIDC : identifiant client, secret,
  identifiant de locataire ; SAML : URL de métadonnées, certificat lu automatiquement ;
  valeurs à recopier chez le fournisseur (URI de redirection ou ACS, portées, Entity ID)
  avec copie ; deux options — imposer le SSO aux collaborateurs, créer les comptes à la
  première connexion ; test de connexion.
- **Onglet Domaines** : un bloc par domaine avec statut, nombre de collaborateurs, et pour
  les domaines en attente l'enregistrement TXT à publier plus le bouton de vérification.
- **Onglet Collaborateurs** : partage des demandes à l'échelle de l'organisation, table
  des membres (rôle, moyen de connexion utilisé, nombre de demandes), invitation d'un
  second administrateur.
- **États** : SSO inactif ; actif ; test réussi ; test en échec (portée `email` non
  accordée) ; domaine en attente de vérification ; avertissement du mode strict.

## 6. Sécurité — invariants à ne pas contourner

1. Pas de SSO sur un domaine non vérifié.
2. Un domaine vérifié n'appartient qu'à une organisation.
3. Le compte de secours du tenant (ST-13) et l'administrateur d'organisation (PT-08)
   gardent toujours une voie d'accès hors SSO.
4. Secrets et certificats chiffrés au repos, jamais relus par l'API.
5. Toute activation, désactivation ou modification de connexion est journalisée —
   audit tenant (ST-12) pour ST-13/ST-14, journal d'organisation pour PT-08.
6. Le SSO authentifie ; il n'autorise pas. La visibilité des demandes reste gouvernée par
   le partage d'organisation (AG-08 / PT-08).

## 7. Découpage open source vs Cloud

| Bloc | Open source (AGPL) | Cloud / EE |
|---|---|---|
| Auth agents | Email + mot de passe, OAuth Google/Microsoft, 2FA | SAML SSO, SCIM, politiques de session (ST-13) |
| Auth portail | Lien magique, mot de passe optionnel | **SSO par organisation cliente, délégation, vérification de domaine (ST-14, PT-08)** |

## 8. Impact roadmap

Le Lot 5 (EE & IA) se scinde :

| Lot | Contenu | Écrans |
|---|---|---|
| Lot 5a — Identité entreprise | SAML/SCIM agents, audit log | ST-12, ST-13 |
| Lot 5b — Identité clients | Vérification de domaine, OIDC puis SAML par organisation, HRD, délégation, supervision | ST-14, PT-07 (révisé), PT-08 |
| Lot 5c — IA | Triage, suggestions, résumé | extensions |

Le Lot 5b dépend du Lot 3 (portail) et n'a de sens qu'en cloud ou en auto-hébergé
multi-organisations. Commencer par OIDC : trois champs contre une douzaine en SAML, et il
couvre Microsoft et Google, soit l'essentiel du parc.

## 9. Questions ouvertes

- **Mode strict** : librement activable par l'organisation, ou soumis à validation du
  tenant ?
- **Modèle commercial** : inclus au plan Pro, facturé à la connexion, ou option à part ?
  Chaque connexion a un coût de support réel, y compris quand le tenant ne peut pas la
  réparer.
- **SCIM côté portail** : synchroniser aussi les contacts depuis l'annuaire du client, ou
  s'en tenir au provisionnement à la première connexion ?
