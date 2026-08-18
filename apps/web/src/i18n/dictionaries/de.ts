import type { Dictionary } from "./fr";

export const de: Dictionary = {
  "chrome.defaultName": "Hilfecenter",
  "chrome.submitRequest": "Anfrage stellen",
  "chrome.submitShort": "Anfrage",
  "chrome.myRequests": "Meine Anfragen",
  "chrome.signIn": "Anmelden",
  "chrome.myOrganization": "Meine Organisation",
  "chrome.signOut": "Abmelden",
  "chrome.poweredBy": "Bereitgestellt von {product}",
  "chrome.copyright": "© {year} {name}",

  "home.eyebrow": "Hilfecenter",
  "home.title": "Wie können wir Ihnen helfen?",
  "home.subtitle":
    "Durchsuchen Sie die Anleitungen oder wenden Sie sich montags bis freitags von 9 bis 18 Uhr an unser Team.",
  "home.categories": "Kategorien",
  "home.popular": "Meistgelesen",
  "home.views": { one: "{count} Aufruf", other: "{count} Aufrufe" },
  "home.ctaTitle": "Nicht gefunden, wonach Sie suchen?",
  "home.ctaBody":
    "Unser Team antwortet während der Geschäftszeiten im Schnitt in 34 Minuten.",

  "search.placeholder": "Hilfecenter durchsuchen…",
  "search.emptyTitle": "Keine Ergebnisse für „{query}“",
  "search.emptyBody":
    "Versuchen Sie allgemeinere Begriffe oder schildern Sie Ihr Anliegen unserem Team.",
  "search.breadcrumb": "Suche",
  "search.resultsTitle": "Ergebnisse für „{query}“",

  "breadcrumb.help": "Hilfe",
  "category.otherCategories": "Weitere Kategorien",
  "category.otherArticles": "Weitere Artikel",
  "category.articleCount": { one: "{count} Artikel", other: "{count} Artikel" },

  "article.meta": {
    one: "Aktualisiert am {date} · {count} Min. Lesezeit",
    other: "Aktualisiert am {date} · {count} Min. Lesezeit",
  },
  "article.related": "Verwandte Artikel",
  "article.onThisPage": "Auf dieser Seite",
  "vote.question": "War dieser Artikel hilfreich?",
  "vote.yes": "Ja",
  "vote.no": "Nein",
  "vote.thanks": "Danke für Ihre Rückmeldung.",
  "vote.sorry":
    "Schade, dass dieser Artikel Ihre Frage nicht beantwortet hat. Möchten Sie mit unserem Team sprechen?",
  "vote.prefill": "Vorausgefüllte Anfrage erstellen",
  "vote.prefillSubject": "Zum Artikel „{title}“",

  "newRequest.title": "Anfrage stellen",
  "newRequest.subtitle":
    "Schildern Sie Ihr Anliegen. Wir antworten innerhalb von 4 Arbeitsstunden.",
  "newRequest.type": "Art der Anfrage",
  "newRequest.typeTechnical": "Technischer Support",
  "newRequest.typeTechnicalDesc": "Eine Störung melden",
  "newRequest.typeBilling": "Frage zur Abrechnung",
  "newRequest.typeBillingDesc": "Rechnungen, Zahlungen, Abonnement",
  "newRequest.typeFeature": "Verbesserungsvorschlag",
  "newRequest.typeFeatureDesc": "Eine Verbesserung vorschlagen",
  "newRequest.email": "Ihre E-Mail-Adresse",
  "newRequest.subject": "Betreff",
  "newRequest.module": "Betroffener Bereich",
  "newRequest.urgency": "Dringlichkeit",
  "newRequest.urgencyLow": "Niedrig",
  "newRequest.urgencyNormal": "Normal",
  "newRequest.urgencyHigh": "Hoch",
  "newRequest.description": "Beschreibung",
  "newRequest.send": "Anfrage senden",
  "deflection.title": "Diese Artikel beantworten Ihre Frage vielleicht",
  "dropzone.title": "Dateien hier ablegen",
  "dropzone.hint": "PNG, JPG, PDF — maximal 10 MB",
  "dropzone.selected": {
    one: "{count} Datei ausgewählt",
    other: "{count} Dateien ausgewählt",
  },
  "attach.label": "Datei anhängen",

  "submitted.title": "Anfrage eingegangen",
  "submitted.reference":
    "Ihre Anfrage hat die Referenz {ref}. Jede Antwort erhalten Sie per E-Mail.",
  "submitted.referenceUnknown":
    "Ihre Anfrage ist eingegangen. Jede Antwort erhalten Sie per E-Mail.",
  "submitted.verify":
    "Wir haben einen Bestätigungslink an {email} geschickt, damit Sie Ihre Anfrage verfolgen können.",
  "submitted.verifyNoEmail":
    "Wir haben Ihnen einen Bestätigungslink geschickt, damit Sie Ihre Anfrage verfolgen können.",
  "submitted.track": "Anfrage verfolgen",
  "submitted.backToHelp": "Zurück zur Hilfe",

  "requests.title": "Meine Anfragen",
  "requests.new": "Neue Anfrage",
  "requests.tabOpen": "Offen",
  "requests.tabSolved": "Gelöst",
  "requests.tabAll": "Alle",
  "requests.tabOrg": "Anfragen meiner Organisation",
  "requests.emptyTitle": "Keine Anfragen",
  "requests.emptyBody":
    "Ihre Supportanfragen erscheinen hier — mit Status und dem gesamten Verlauf.",
  "requests.awaitingReply": "Antwort erwartet",

  "status.open": "In Bearbeitung",
  "status.waiting": "Wartet auf Sie",
  "status.resolved": "Gelöst",
  "status.closed": "Geschlossen",

  "activity.resolved": "Gelöst {when}",
  "activity.closed": "Geschlossen {when}",
  "activity.waiting": "Wartet {since} auf Ihre Antwort",
  "activity.agentReplied": "Antwort von {name} {when}",
  "activity.youReplied": "Sie haben {when} geantwortet",
  "activity.created": "Erstellt {when}",

  "since.minutes": { one: "seit {count} Min.", other: "seit {count} Min." },
  "since.hours": { one: "seit {count} Std.", other: "seit {count} Std." },
  "since.days": { one: "seit gestern", other: "seit {count} Tagen" },
  "since.date": "seit dem {date}",

  "request.you": "Sie",
  "request.team": "Das Team",
  "request.agentAuthor": "{name} — {tenant}",
  "reply.placeholder": "Antwort schreiben…",
  "reply.send": "Senden",
  "csat.question": "Wie bewerten Sie diese Antwort?",
  "csat.satisfied": "Zufrieden",
  "csat.unsatisfied": "Nicht zufrieden",
  "csat.comment": "Möchten Sie etwas ergänzen? (optional)",
  "csat.send": "Kommentar senden",
  "meta.status": "Status",
  "meta.created": "Erstellt am",
  "meta.reference": "Referenz",
  "request.markSolved": "Als gelöst markieren",
  "request.reopen": "Anfrage erneut öffnen",

  "login.title": "Ihre Anfragen verfolgen",
  "login.magicIntro":
    "Geben Sie Ihre E-Mail-Adresse ein: Wir schicken Ihnen einen Anmeldelink. Kein Passwort nötig.",
  "login.email": "E-Mail",
  "login.sendLink": "Link zusenden",
  "login.sentTitle": "Sehen Sie in Ihr Postfach",
  "login.sentBody":
    "Wir haben einen Anmeldelink an {email} geschickt. Er läuft in 15 Minuten ab.",
  "login.sentBodyNoEmail":
    "Wir haben Ihnen einen Anmeldelink geschickt. Er läuft in 15 Minuten ab.",
  "login.otherAddress": "Andere Adresse verwenden",
  "login.expired": "Dieser Link ist abgelaufen oder ungültig. Fordern Sie einen neuen an.",
  "login.footer":
    "Noch keine Anfrage? Ihr Konto wird bei der ersten Anfrage automatisch angelegt.",

  "org.intro": {
    one: "Sie sind Administrator dieser Organisation. Was Sie hier einstellen, gilt für die Person bei {org}, die den Support von {tenant} nutzt.",
    other:
      "Sie sind Administrator dieser Organisation. Was Sie hier einstellen, gilt für die {count} Personen bei {org}, die den Support von {tenant} nutzen.",
  },
  "org.tabSso": "SSO-Anmeldung",
  "org.tabDomains": "Domains",
  "org.tabMembers": "Mitarbeitende",

  "sso.enterpriseLogin": "Anmeldung mit Firmenkonto",
  "sso.enterpriseLoginDesc":
    "Ihre Mitarbeitenden geben ihre dienstliche E-Mail-Adresse ein und werden zu Ihrem Identitätsanbieter weitergeleitet. Kein Passwort nötig.",
  "sso.active": "Aktiv",
  "sso.inactive": "Inaktiv",
  "sso.provider": "Ihr Identitätsanbieter",
  "sso.providerEntra": "Microsoft Entra ID",
  "sso.providerGoogle": "Google Workspace",
  "sso.providerOkta": "Okta",
  "sso.providerGeneric": "Anderer Anbieter",
  "sso.protoOidc3": "OpenID Connect — 3 Felder",
  "sso.protoOktaBoth": "OpenID Connect oder SAML 2.0",
  "sso.protoSamlXml": "SAML 2.0 — XML-Metadaten",
  "sso.settings": "Verbindungseinstellungen",
  "sso.clientId": "Client-ID",
  "sso.clientSecret": "Client-Geheimnis",
  "sso.clientSecretHint":
    "Nur einmal einzugeben. Wir melden uns 30 Tage vor Ablauf.",
  "sso.idpTenant": "Mandanten-ID",
  "sso.metadataUrl": "Metadaten-URL",
  "sso.metadataUrlHint":
    "Aussteller, Anmelde-URL und Zertifikat lesen wir aus dieser Datei.",
  "sso.certificate": "Signaturzertifikat",
  "sso.certificateLoaded": "Aus den Metadaten geladen",
  "sso.certificateLoadedPending":
    "Aus den Metadaten geladen — wird beim ersten Verbindungstest gelesen",
  "sso.copyToProvider": "In Ihren Anbieter übertragen",
  "sso.redirectUri": "Weiterleitungs-URI",
  "sso.scopes": "Angeforderte Bereiche",
  "sso.acsUrl": "Antwort-URL (ACS)",
  "sso.entityId": "Entity-ID",
  "sso.copy": "Kopieren",
  "sso.copied": "Kopiert!",
  "sso.strict": "SSO für meine Mitarbeitenden verpflichtend machen",
  "sso.strictDesc":
    "Der E-Mail-Link ist für Adressen auf @{domain} deaktiviert. Ihr eigener Administratorzugang bleibt erhalten.",
  "sso.strictDescNoDomain":
    "Der E-Mail-Link ist für Adressen Ihrer bestätigten Domains deaktiviert. Ihr eigener Administratorzugang bleibt erhalten.",
  "sso.strictWarning":
    "Fällt Ihr Anbieter aus, erreichen Ihre Mitarbeitenden ihre Anfragen nicht mehr. Ihr Administratorzugang per E-Mail-Link bleibt immer bestehen.",
  "sso.jit": "Konten bei der ersten Anmeldung anlegen",
  "sso.jitDesc":
    "Eine unbekannte Person, die sich über Ihren Anbieter anmeldet, wird automatisch {org} zugeordnet.",
  "sso.test": "Verbindung testen",
  "sso.testIdle":
    "Es öffnet sich ein Fenster zu Ihrem Anbieter. Nichts wird aktiviert, solange der Test nicht erfolgreich war.",

  "domains.intro":
    "Eine Domain muss bestätigt sein, bevor sie eine SSO-Verbindung tragen kann. Diese Prüfung stellt sicher, dass niemand sonst die Konten Ihrer Mitarbeitenden beanspruchen kann.",
  "domains.verified": "Bestätigt",
  "domains.pending": "Zu bestätigen",
  "domains.memberCount": {
    one: "{count} Mitarbeitende:r",
    other: "{count} Mitarbeitende",
  },
  "domains.txtInstructions":
    "Fügen Sie diesen TXT-Eintrag in die DNS-Zone von {domain} ein und starten Sie dann die Prüfung.",
  "domains.verifyNow": "Jetzt prüfen",
  "domains.copyRecord": "Eintrag kopieren",
  "domains.add": "+ Domain hinzufügen",
  "domains.addSubmit": "Hinzufügen",
  "domains.notFound": "Eintrag bei der letzten Prüfung nicht gefunden ({when}).",
  "domains.errorInvalid": "Ungültiges Domainformat — erwartet wird etwa firma.de.",
  "domains.errorPublic": "Domains privater E-Mail-Anbieter können nicht bestätigt werden.",
  "domains.errorExists": "Diese Domain ist in diesem Bereich bereits eingetragen.",

  "members.shareTitle": "Anfragen für die gesamte Organisation sichtbar",
  "members.shareDesc":
    "Jede Person sieht die Anfragen ihrer Kolleginnen und Kollegen, nicht nur die eigenen.",
  "members.colMember": "Mitarbeitende",
  "members.colRole": "Rolle",
  "members.colAuth": "Anmeldung",
  "members.colRequests": "Anfragen",
  "members.roleAdmin": "Administrator",
  "members.roleMember": "Mitarbeitende:r",
  "members.roleGuest": "Gast",
  "members.authEmailLink": "E-Mail-Link",
  "members.note":
    "Mitarbeitende erscheinen automatisch bei ihrer ersten Anmeldung oder ihrer ersten Anfrage. Sie können eine zweite Person als Administrator benennen, um nicht alleiniger Ansprechpartner zu bleiben.",
};
