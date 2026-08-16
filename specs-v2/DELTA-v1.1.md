# Delta v1 → v1.1 — à appliquer aux specs existantes

> 16 août 2026. Trois écrans ajoutés (ST-13, ST-14, PT-08), un révisé (PT-07).
> Total : **43 → 46 écrans**.
>
> Fichiers entièrement régénérés dans ce dossier :
> [`12-ecrans-portail-client.md`](12-ecrans-portail-client.md) et le nouveau
> [`15-sso-et-identite.md`](15-sso-et-identite.md).
> Les modifications ponctuelles à reporter dans `01` et `11` sont listées ci-dessous.

---

## 1. `README.md`

Ligne de chapeau — remplacer :

```
Stack : TypeScript · Node.js · Next.js · React — 43 écrans spécifiés (16 août 2026).
```

par :

```
Stack : TypeScript · Node.js · Next.js · React — 46 écrans spécifiés (16 août 2026, v1.1).
```

Sommaire — ajouter une ligne après `14-ecrans-site-signup.md` :

```
| [15-sso-et-identite.md](15-sso-et-identite.md) | ST-13, ST-14, PT-08 : SSO agents (SAML/SCIM) et SSO des organisations clientes (OIDC/SAML délégué, vérification de domaine, découverte par domaine) |
```

Et corriger la description de `11` et `12` :

```
| [11-ecrans-administration.md](11-ecrans-administration.md) | ST-01 → ST-14 : général, équipe, email, champs, automatisations, macros, SLA, CSAT, portail, API, facturation, audit, SSO agents, SSO clients |
| [12-ecrans-portail-client.md](12-ecrans-portail-client.md) | PT-01 → PT-08 : centre d'aide, articles, soumission et suivi de demandes, administration d'organisation |
```

---

## 2. `01-produit-et-architecture.md`

### 2.1 § 5 — Modèle de données, schéma `app`

Ajouter quatre lignes au tableau des entités :

```
| VerifiedDomain | domaine, token de vérification, statut (à vérifier / vérifié / échec), dernière vérification | → Organization |
| OrgSsoConnection | protocole (oidc / saml), fournisseur, état (active / à vérifier / erreur / désactivée), config chiffrée, strict_mode, jit_enabled, dernière connexion réussie, dernière erreur | → Organization, → VerifiedDomain (n) |
| OrgAdminGrant | contact, organisation, accordé par, date | → Contact, → Organization |
| SsoAuthEvent | organisation, contact, résultat, motif d'échec, IP, horodatage (rétention 90 j) | → Organization |
```

Et compléter trois entités existantes :

- `Tenant` : ajouter `sso_delegation_enabled`, `agent_sso_config`.
- `Contact` : ajouter `auth_method` (magic_link / sso), `external_id` (sub OIDC ou NameID).
- `Organization` : les `domaines email (auto-rattachement)` de la v1 servent désormais de
  clé à la découverte par domaine et se doublent d'un `VerifiedDomain` dès qu'un SSO est
  demandé.

### 2.2 § 6 — Découpage open source vs Cloud

Remplacer la ligne `Auth` par deux lignes :

```
| Auth agents | Email + mot de passe, OAuth Google/Microsoft, 2FA | SAML SSO, SCIM, politiques de session |
| Auth portail | Lien magique, mot de passe optionnel | SSO par organisation cliente, délégation, vérification de domaine |
```

### 2.3 § 7 — Rôles & permissions

Ajouter une ligne après `Portail | Contact` :

```
| Portail | Administrateur d'organisation | Ses demandes + celles de son organisation, connexion SSO de son organisation, vérification de ses domaines, liste des collaborateurs, partage des demandes, désignation d'un autre administrateur |
```

### 2.4 § 8 — Parcours clés

Ajouter un cinquième parcours :

```
5. **Organisation cliente → SSO** : un agent accorde le rôle Administrateur
   d'organisation depuis AG-08 → le contact ouvre PT-08 → ajoute et vérifie son domaine
   (TXT DNS) → configure OIDC en trois champs → teste → active. Dès lors, tout
   collaborateur de ce domaine qui saisit son email en PT-07 est redirigé vers son
   fournisseur ; les comptes inconnus sont créés à la volée. En cas de certificat expiré
   ou de secret périmé, l'anomalie remonte en ST-14 côté tenant, qui peut prévenir
   l'administrateur mais pas corriger à sa place.
```

### 2.5 § 9 — Roadmap

Remplacer la ligne `Lot 5` par trois lignes :

```
| Lot 5a — Identité entreprise | SAML/SCIM agents, audit log | ST-12, ST-13 |
| Lot 5b — Identité clients | Vérification de domaine, OIDC puis SAML par organisation, découverte par domaine, délégation, supervision | ST-14, PT-07 (révisé), PT-08 |
| Lot 5c — EE & IA | Domaines custom, multi-marques, IA (triage, suggestions, résumé) | extensions |
```

---

## 3. `11-ecrans-administration.md`

### 3.1 Encadré « Shell commun »

La navigation secondaire gagne un groupe. Remplacer l'énumération des groupes par :

```
*Espace de travail* (Général, Agents & équipes), *Canaux* (Email, Portail, Widget),
*Productivité* (Champs & formulaires, Automatisations, Macros, SLA, Satisfaction),
*Sécurité* (SSO des agents, SSO clients, Audit log), *Développeurs* (API & webhooks),
*Compte* (Abonnement)
```

`ST-12 — Audit log` change de groupe : il passe de *Compte* à *Sécurité*. Sa carte est
inchangée par ailleurs.

### 3.2 Deux cartes à ajouter en fin de fichier

Le détail complet est dans [`15-sso-et-identite.md`](15-sso-et-identite.md) § 5 ; voici
les cartes au format du fichier.

```markdown
## ST-13 — SSO des agents (EE) — `/app/settings/sso`

- **Objectif** : connecter l'annuaire de l'entreprise pour ses propres agents. Un seul
  IdP par tenant.
- **Onglets** : SAML 2.0 · SCIM.
- **Composants (SAML)** : activation + statut ; sélection de l'IdP (Okta, Entra ID,
  Google Workspace, OneLogin, générique) ; Entity ID, URL de connexion, certificat X.509
  avec expiration et alerte J-30 ; import des métadonnées XML ; valeurs SP à copier (ACS,
  Entity ID, métadonnées, format NameID) ; correspondance des attributs (email, prénom,
  nom requis) ; option « piloter les rôles depuis l'IdP » (rend les rôles en lecture seule
  dans ST-02) ; application : optionnel / imposé aux domaines vérifiés / imposé à tous ;
  durée de session ; compte de secours ; domaines vérifiés ; test de connexion détaillé
  par étape.
- **Composants (SCIM)** : URL de base, jeton porteur affiché une seule fois,
  correspondance groupes IdP → équipe + rôle, journal de synchronisation avec libération
  automatique des sièges.
- **États** : inactif ; connecté ; test réussi ; test en échec (attribut manquant) ;
  avertissement de verrouillage sur « imposé à tous » ; plan Standard → écran verrouillé
  avec CTA upgrade.

## ST-14 — SSO des organisations clientes (EE) — `/app/settings/customer-sso`

- **Objectif** : superviser des centaines de connexions SSO que le tenant ne configure
  pas lui-même — chaque organisation cliente branche son propre annuaire depuis PT-08.
- **Composants** : interrupteur global de délégation ; quatre compteurs (actives, à
  vérifier, en erreur, secrets expirant sous 30 j) ; table dense (santé, organisation,
  domaines, protocole, statut, membres, administrateur côté client) avec recherche,
  filtres et export CSV ; bloc **Attention requise** listant les anomalies actionnables
  avec le nombre de personnes impactées et l'action « Prévenir l'admin » ; drawer de
  détail en lecture seule, dont la seule action destructive est la désactivation.
- **États** : parc sain ; connexion en erreur (ligne surlignée) ; délégation désactivée
  (le tenant configure lui-même, la table passe en édition).
- **Contrainte** : le tenant ne détient ni les secrets ni la légitimité pour corriger la
  configuration d'un client. L'écran informe et alerte ; il ne répare pas.
```

---

## 4. Invariants de sécurité à respecter à l'implémentation

1. Pas de SSO sur un domaine non vérifié (`TXT` `ohd-verify=<token>`).
2. Un domaine vérifié n'appartient qu'à une organisation par tenant ; domaines grand
   public sur liste noire.
3. Compte de secours du tenant et administrateur d'organisation gardent toujours une voie
   hors SSO.
4. Secrets et certificats chiffrés au repos, jamais relus en clair par l'API.
5. Toute activation ou désactivation de connexion est journalisée.
6. Le SSO authentifie, il n'autorise pas : la visibilité des demandes reste gouvernée par
   le partage d'organisation.
