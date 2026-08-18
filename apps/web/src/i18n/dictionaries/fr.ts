/**
 * Français — dictionnaire source du portail client (PT-01 → PT-08).
 *
 * C'est cette table qui définit l'ensemble des clés : les autres langues sont
 * typées dessus, si bien qu'une clé oubliée est une erreur de compilation.
 *
 * Conventions de rédaction :
 *  - une clé = une phrase complète. Rien n'est assemblé par concaténation :
 *    l'ordre des mots change d'une langue à l'autre.
 *  - les paramètres sont nommés ({count}, {name}) et jamais positionnels.
 *  - les formes de pluriel sont celles d'Intl.PluralRules pour la langue.
 */

import type { Message } from "../dictionary";

export const fr = {
  /* ---------- Chrome ---------- */
  "chrome.defaultName": "Centre d'aide",
  "chrome.submitRequest": "Soumettre une demande",
  "chrome.submitShort": "Soumettre",
  "chrome.myRequests": "Mes demandes",
  "chrome.signIn": "Se connecter",
  "chrome.myOrganization": "Mon organisation",
  "chrome.signOut": "Se déconnecter",
  "chrome.poweredBy": "Propulsé par {product}",
  "chrome.copyright": "© {year} {name}",

  /* ---------- PT-01 Accueil ---------- */
  "home.eyebrow": "Centre d'aide",
  "home.title": "Comment pouvons-nous vous aider ?",
  "home.subtitle":
    "Parcourez les guides, ou contactez notre équipe du lundi au vendredi, de 9 h à 18 h.",
  "home.categories": "Catégories",
  "home.popular": "Les plus consultés",
  "home.views": { one: "{count} vue", other: "{count} vues" },
  "home.ctaTitle": "Vous ne trouvez pas ce que vous cherchez ?",
  "home.ctaBody":
    "Notre équipe répond en moyenne en 34 minutes pendant les heures ouvrées.",

  /* ---------- Recherche ---------- */
  "search.placeholder": "Rechercher dans l'aide…",
  "search.emptyTitle": "Aucun résultat pour « {query} »",
  "search.emptyBody":
    "Essayez des termes plus généraux, ou décrivez votre situation à notre équipe.",
  "search.breadcrumb": "Recherche",
  "search.resultsTitle": "Résultats pour « {query} »",

  /* ---------- PT-02 Catégorie ---------- */
  "breadcrumb.help": "Aide",
  "category.otherCategories": "Autres catégories",
  "category.otherArticles": "Autres articles",
  "category.articleCount": { one: "{count} article", other: "{count} articles" },

  /* ---------- PT-03 Article ---------- */
  "article.meta": {
    one: "Mis à jour le {date} · {count} min de lecture",
    other: "Mis à jour le {date} · {count} min de lecture",
  },
  "article.related": "Articles liés",
  "article.onThisPage": "Sur cette page",
  "vote.question": "Cet article vous a-t-il aidé ?",
  "vote.yes": "Oui",
  "vote.no": "Non",
  "vote.thanks": "Merci pour votre retour.",
  "vote.sorry":
    "Désolé que cet article n'ait pas répondu à votre question. Voulez-vous en parler à notre équipe ?",
  "vote.prefill": "Créer une demande pré-remplie",
  "vote.prefillSubject": "Au sujet de l'article « {title} »",

  /* ---------- PT-04 Soumettre ---------- */
  "newRequest.title": "Soumettre une demande",
  "newRequest.subtitle":
    "Décrivez votre situation. Nous répondons sous 4 heures ouvrées.",
  "newRequest.type": "Type de demande",
  "newRequest.typeTechnical": "Support technique",
  "newRequest.typeTechnicalDesc": "Un dysfonctionnement à signaler",
  "newRequest.typeBilling": "Question facturation",
  "newRequest.typeBillingDesc": "Factures, paiements, abonnement",
  "newRequest.typeFeature": "Demande d'évolution",
  "newRequest.typeFeatureDesc": "Suggérer une amélioration",
  "newRequest.email": "Votre email",
  "newRequest.subject": "Sujet",
  "newRequest.module": "Module concerné",
  "newRequest.urgency": "Urgence",
  "newRequest.urgencyLow": "Basse",
  "newRequest.urgencyNormal": "Normale",
  "newRequest.urgencyHigh": "Haute",
  "newRequest.description": "Description",
  "newRequest.send": "Envoyer la demande",
  "deflection.title": "Ces articles répondent peut-être à votre question",
  "dropzone.title": "Déposez vos fichiers ici",
  "dropzone.hint": "PNG, JPG, PDF — 10 Mo maximum",
  "dropzone.selected": {
    one: "{count} fichier sélectionné",
    other: "{count} fichiers sélectionnés",
  },
  "attach.label": "Joindre un fichier",

  /* ---------- PT-04 Confirmation ---------- */
  "submitted.title": "Demande enregistrée",
  "submitted.reference":
    "Votre demande porte la référence {ref}. Vous recevrez chaque réponse par email.",
  "submitted.referenceUnknown":
    "Votre demande a bien été enregistrée. Vous recevrez chaque réponse par email.",
  "submitted.verify":
    "Nous vous avons envoyé un lien de vérification à {email} pour accéder au suivi de votre demande.",
  "submitted.verifyNoEmail":
    "Nous vous avons envoyé un lien de vérification pour accéder au suivi de votre demande.",
  "submitted.track": "Suivre ma demande",
  "submitted.backToHelp": "Retour à l'aide",

  /* ---------- PT-05 Mes demandes ---------- */
  "requests.title": "Mes demandes",
  "requests.new": "Nouvelle demande",
  "requests.tabOpen": "Ouvertes",
  "requests.tabSolved": "Résolues",
  "requests.tabAll": "Toutes",
  "requests.tabOrg": "Demandes de mon organisation",
  "requests.emptyTitle": "Aucune demande",
  "requests.emptyBody":
    "Vos demandes de support apparaîtront ici, avec leur statut et l'historique des échanges.",
  "requests.awaitingReply": "Réponse attendue",

  /* Statuts, vocabulaire client (PORTAL_STATUS_LABELS). */
  "status.open": "En cours",
  "status.waiting": "En attente de votre réponse",
  "status.resolved": "Résolue",
  "status.closed": "Fermée",

  /* Dernière activité d'une demande. */
  "activity.resolved": "Résolue {when}",
  "activity.closed": "Fermée {when}",
  "activity.waiting": "En attente de votre réponse {since}",
  "activity.agentReplied": "Réponse de {name} {when}",
  "activity.youReplied": "Vous avez répondu {when}",
  "activity.created": "Créée {when}",

  /* « depuis … » — l'anglais dit « for 3 days », le français « depuis 3 jours ». */
  "since.minutes": { one: "depuis {count} min", other: "depuis {count} min" },
  "since.hours": { one: "depuis {count} h", other: "depuis {count} h" },
  "since.days": { one: "depuis hier", other: "depuis {count} jours" },
  "since.date": "depuis le {date}",

  /* ---------- PT-06 Détail ---------- */
  "request.you": "Vous",
  "request.team": "L'équipe",
  "request.agentAuthor": "{name} — {tenant}",
  "reply.placeholder": "Écrire une réponse…",
  "reply.send": "Envoyer",
  "csat.question": "Comment évaluez-vous cette réponse ?",
  "csat.satisfied": "Satisfait",
  "csat.unsatisfied": "Insatisfait",
  "csat.comment": "Un commentaire à ajouter ? (facultatif)",
  "csat.send": "Envoyer le commentaire",
  "meta.status": "Statut",
  "meta.created": "Créée le",
  "meta.reference": "Référence",
  "request.markSolved": "Marquer comme résolue",
  "request.reopen": "Rouvrir la demande",

  /* ---------- PT-07 Connexion ---------- */
  "login.title": "Suivre vos demandes",
  "login.magicIntro":
    "Saisissez votre email : nous vous enverrons un lien de connexion. Aucun mot de passe à retenir.",
  "login.email": "Email",
  "login.sendLink": "Recevoir le lien",
  "login.sentTitle": "Consultez votre boîte de réception",
  "login.sentBody":
    "Nous avons envoyé un lien de connexion à {email}. Il expire dans 15 minutes.",
  "login.sentBodyNoEmail":
    "Nous avons envoyé un lien de connexion. Il expire dans 15 minutes.",
  "login.otherAddress": "Utiliser une autre adresse",
  "login.expired": "Ce lien est expiré ou invalide. Demandez-en un nouveau.",
  "login.footer":
    "Pas encore de demande ? Votre compte est créé automatiquement au premier envoi.",

  /* ---------- PT-08 Mon organisation ---------- */
  "org.intro": {
    one: "Vous êtes administrateur de cette organisation. Ce que vous réglez ici s'applique à la personne de {org} qui utilise le support {tenant}.",
    other:
      "Vous êtes administrateur de cette organisation. Ce que vous réglez ici s'applique aux {count} personnes de {org} qui utilisent le support {tenant}.",
  },
  "org.tabSso": "Connexion SSO",
  "org.tabDomains": "Domaines",
  "org.tabMembers": "Collaborateurs",

  "sso.enterpriseLogin": "Connexion par compte d'entreprise",
  "sso.enterpriseLoginDesc":
    "Vos collaborateurs saisissent leur email professionnel et sont redirigés vers votre fournisseur d'identité. Aucun mot de passe à créer.",
  "sso.active": "Active",
  "sso.inactive": "Inactive",
  "sso.provider": "Votre fournisseur d'identité",
  "sso.providerEntra": "Microsoft Entra ID",
  "sso.providerGoogle": "Google Workspace",
  "sso.providerOkta": "Okta",
  "sso.providerGeneric": "Autre fournisseur",
  "sso.protoOidc3": "OpenID Connect — 3 champs",
  "sso.protoOktaBoth": "OpenID Connect ou SAML 2.0",
  "sso.protoSamlXml": "SAML 2.0 — métadonnées XML",
  "sso.settings": "Paramètres de connexion",
  "sso.clientId": "Identifiant client",
  "sso.clientSecret": "Secret client",
  "sso.clientSecretHint":
    "Saisi une seule fois. Nous vous préviendrons 30 jours avant son expiration.",
  "sso.idpTenant": "Identifiant de locataire",
  "sso.metadataUrl": "URL de métadonnées",
  "sso.metadataUrlHint":
    "Nous lisons l'émetteur, l'URL de connexion et le certificat depuis ce fichier.",
  "sso.certificate": "Certificat de signature",
  "sso.certificateLoaded": "Chargé depuis les métadonnées",
  "sso.certificateLoadedPending": "Chargé depuis les métadonnées — lu au premier test de connexion",
  "sso.copyToProvider": "À copier dans votre fournisseur",
  "sso.redirectUri": "URI de redirection",
  "sso.scopes": "Portées demandées",
  "sso.acsUrl": "URL de réponse (ACS)",
  "sso.entityId": "Entity ID",
  "sso.copy": "Copier",
  "sso.copied": "Copié !",
  "sso.strict": "Imposer le SSO à mes collaborateurs",
  "sso.strictDesc":
    "Le lien par email est désactivé pour les adresses en @{domain}. Votre propre accès administrateur reste garanti.",
  "sso.strictDescNoDomain":
    "Le lien par email est désactivé pour les adresses de vos domaines vérifiés. Votre propre accès administrateur reste garanti.",
  "sso.strictWarning":
    "Si votre fournisseur devient indisponible, vos collaborateurs ne pourront plus accéder à leurs demandes. Nous conservons toujours votre accès administrateur par lien email.",
  "sso.jit": "Créer les comptes à la première connexion",
  "sso.jitDesc":
    "Un collaborateur inconnu qui se connecte via votre fournisseur est rattaché automatiquement à {org}.",
  "sso.test": "Tester la connexion",
  "sso.testIdle":
    "Une fenêtre s'ouvrira vers votre fournisseur. Rien n'est activé tant que le test n'a pas abouti.",

  "domains.intro":
    "Un domaine doit être vérifié avant de pouvoir porter une connexion SSO. Cette vérification garantit que personne d'autre ne peut revendiquer les comptes de vos collaborateurs.",
  "domains.verified": "Vérifié",
  "domains.pending": "À vérifier",
  "domains.memberCount": {
    one: "{count} collaborateur",
    other: "{count} collaborateurs",
  },
  "domains.txtInstructions":
    "Ajoutez cet enregistrement TXT à la zone DNS de {domain}, puis lancez la vérification.",
  "domains.verifyNow": "Vérifier maintenant",
  "domains.copyRecord": "Copier l'enregistrement",
  "domains.add": "+ Ajouter un domaine",
  "domains.addSubmit": "Ajouter",
  "domains.notFound":
    "Enregistrement introuvable lors de la dernière vérification ({when}).",
  "domains.errorInvalid": "Format de domaine invalide — exemple attendu : entreprise.fr.",
  "domains.errorPublic":
    "Les domaines d'email grand public ne peuvent pas être vérifiés.",
  "domains.errorExists": "Ce domaine est déjà déclaré sur cet espace.",

  "members.shareTitle": "Demandes visibles par toute l'organisation",
  "members.shareDesc":
    "Chaque collaborateur voit les demandes de ses collègues, pas seulement les siennes.",
  "members.colMember": "Collaborateur",
  "members.colRole": "Rôle",
  "members.colAuth": "Connexion",
  "members.colRequests": "Demandes",
  "members.roleAdmin": "Administrateur",
  "members.roleMember": "Collaborateur",
  "members.roleGuest": "Invité",
  "members.authEmailLink": "Lien email",
  "members.note":
    "Les collaborateurs apparaissent automatiquement à leur première connexion ou à leur première demande. Vous pouvez désigner un second administrateur pour ne pas rester seul point de contact.",
} as const satisfies Record<string, Message>;

/** L'ensemble des clés du produit — les autres langues sont typées dessus. */
export type MessageKey = keyof typeof fr;

/** Un dictionnaire complet : toutes les clés, aucune en trop. */
export type Dictionary = Record<MessageKey, Message>;
