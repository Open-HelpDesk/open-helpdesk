import type { Dictionary } from "./fr";

export const da: Dictionary = {
  "chrome.defaultName": "Hjælpecenter",
  "chrome.submitRequest": "Send en henvendelse",
  "chrome.submitShort": "Send",
  "chrome.myRequests": "Mine henvendelser",
  "chrome.signIn": "Log ind",
  "chrome.myOrganization": "Min organisation",
  "chrome.signOut": "Log ud",
  "chrome.poweredBy": "Leveret af {product}",
  "chrome.copyright": "© {year} {name}",

  "home.eyebrow": "Hjælpecenter",
  "home.title": "Hvordan kan vi hjælpe dig?",
  "home.subtitle":
    "Gennemse vejledningerne, eller kontakt vores team mandag til fredag kl. 9-18.",
  "home.categories": "Kategorier",
  "home.popular": "Mest læste",
  "home.views": { one: "{count} visning", other: "{count} visninger" },
  "home.ctaTitle": "Kan du ikke finde det, du søger?",
  "home.ctaBody":
    "Vores team svarer i gennemsnit inden for 34 minutter i åbningstiden.",

  "search.placeholder": "Søg i hjælpecenteret…",
  "search.emptyTitle": "Ingen resultater for »{query}«",
  "search.emptyBody":
    "Prøv bredere søgeord, eller beskriv din situation for vores team.",
  "search.breadcrumb": "Søgning",
  "search.resultsTitle": "Resultater for »{query}«",

  "breadcrumb.help": "Hjælp",
  "category.otherCategories": "Andre kategorier",
  "category.otherArticles": "Andre artikler",
  "category.articleCount": { one: "{count} artikel", other: "{count} artikler" },

  "article.meta": {
    one: "Opdateret den {date} · {count} min. læsning",
    other: "Opdateret den {date} · {count} min. læsning",
  },
  "article.related": "Relaterede artikler",
  "article.onThisPage": "På denne side",
  "vote.question": "Var denne artikel nyttig?",
  "vote.yes": "Ja",
  "vote.no": "Nej",
  "vote.thanks": "Tak for din tilbagemelding.",
  "vote.sorry":
    "Ærgerligt, at artiklen ikke besvarede dit spørgsmål. Vil du tale med vores team om det?",
  "vote.prefill": "Opret en forudfyldt henvendelse",
  "vote.prefillSubject": "Om artiklen »{title}«",

  "newRequest.title": "Send en henvendelse",
  "newRequest.subtitle": "Beskriv din situation. Vi svarer inden for 4 arbejdstimer.",
  "newRequest.type": "Type af henvendelse",
  "newRequest.typeTechnical": "Teknisk support",
  "newRequest.typeTechnicalDesc": "Meld en fejl",
  "newRequest.typeBilling": "Spørgsmål om fakturering",
  "newRequest.typeBillingDesc": "Fakturaer, betalinger, abonnement",
  "newRequest.typeFeature": "Ønske om forbedring",
  "newRequest.typeFeatureDesc": "Foreslå en forbedring",
  "newRequest.email": "Din e-mailadresse",
  "newRequest.subject": "Emne",
  "newRequest.module": "Berørt modul",
  "newRequest.urgency": "Hastegrad",
  "newRequest.urgencyLow": "Lav",
  "newRequest.urgencyNormal": "Normal",
  "newRequest.urgencyHigh": "Høj",
  "newRequest.description": "Beskrivelse",
  "newRequest.send": "Send henvendelsen",
  "deflection.title": "Disse artikler besvarer måske dit spørgsmål",
  "dropzone.title": "Slip dine filer her",
  "dropzone.hint": "PNG, JPG, PDF — højst 10 MB",
  "dropzone.selected": {
    one: "{count} fil valgt",
    other: "{count} filer valgt",
  },
  "attach.label": "Vedhæft en fil",

  "submitted.title": "Henvendelse modtaget",
  "submitted.reference":
    "Din henvendelse har referencen {ref}. Du modtager hvert svar via e-mail.",
  "submitted.referenceUnknown":
    "Din henvendelse er modtaget. Du modtager hvert svar via e-mail.",
  "submitted.verify":
    "Vi har sendt et bekræftelseslink til {email}, så du kan følge din henvendelse.",
  "submitted.verifyNoEmail":
    "Vi har sendt dig et bekræftelseslink, så du kan følge din henvendelse.",
  "submitted.track": "Følg min henvendelse",
  "submitted.backToHelp": "Tilbage til hjælpen",

  "requests.title": "Mine henvendelser",
  "requests.new": "Ny henvendelse",
  "requests.tabOpen": "Åbne",
  "requests.tabSolved": "Løste",
  "requests.tabAll": "Alle",
  "requests.tabOrg": "Min organisations henvendelser",
  "requests.emptyTitle": "Ingen henvendelser",
  "requests.emptyBody":
    "Dine supporthenvendelser vises her med deres status og hele historikken.",
  "requests.awaitingReply": "Svar forventes",

  "status.open": "I gang",
  "status.waiting": "Venter på dig",
  "status.resolved": "Løst",
  "status.closed": "Lukket",

  "activity.resolved": "Løst {when}",
  "activity.closed": "Lukket {when}",
  "activity.waiting": "Venter på dit svar {since}",
  "activity.agentReplied": "Svar fra {name} {when}",
  "activity.youReplied": "Du svarede {when}",
  "activity.created": "Oprettet {when}",

  "since.minutes": { one: "i {count} min.", other: "i {count} min." },
  "since.hours": { one: "i {count} t.", other: "i {count} t." },
  "since.days": { one: "siden i går", other: "i {count} dage" },
  "since.date": "siden den {date}",

  "request.you": "Dig",
  "request.team": "Teamet",
  "request.agentAuthor": "{name} — {tenant}",
  "reply.placeholder": "Skriv et svar…",
  "reply.send": "Send",
  "csat.question": "Hvordan vurderer du dette svar?",
  "csat.satisfied": "Tilfreds",
  "csat.unsatisfied": "Ikke tilfreds",
  "csat.comment": "Vil du tilføje en kommentar? (valgfrit)",
  "csat.send": "Send kommentaren",
  "meta.status": "Status",
  "meta.created": "Oprettet den",
  "meta.reference": "Reference",
  "request.markSolved": "Markér som løst",
  "request.reopen": "Genåbn henvendelsen",

  "login.title": "Følg dine henvendelser",
  "login.magicIntro":
    "Indtast din e-mailadresse, så sender vi dig et login-link. Ingen adgangskode at huske.",
  "login.email": "E-mail",
  "login.sendLink": "Send mig linket",
  "login.sentTitle": "Se i din indbakke",
  "login.sentBody":
    "Vi har sendt et login-link til {email}. Det udløber om 15 minutter.",
  "login.sentBodyNoEmail":
    "Vi har sendt dig et login-link. Det udløber om 15 minutter.",
  "login.otherAddress": "Brug en anden adresse",
  "login.expired": "Dette link er udløbet eller ugyldigt. Bed om et nyt.",
  "login.footer":
    "Ingen henvendelser endnu? Din konto oprettes automatisk ved den første.",

  "org.intro": {
    one: "Du er administrator for denne organisation. Det, du indstiller her, gælder den person hos {org}, der bruger supporten fra {tenant}.",
    other:
      "Du er administrator for denne organisation. Det, du indstiller her, gælder de {count} personer hos {org}, der bruger supporten fra {tenant}.",
  },
  "org.tabSso": "SSO-login",
  "org.tabDomains": "Domæner",
  "org.tabMembers": "Medarbejdere",

  "sso.enterpriseLogin": "Login med firmakonto",
  "sso.enterpriseLoginDesc":
    "Dine medarbejdere indtaster deres arbejdsmail og sendes videre til jeres identitetsudbyder. Ingen adgangskode at oprette.",
  "sso.active": "Aktiv",
  "sso.inactive": "Inaktiv",
  "sso.provider": "Jeres identitetsudbyder",
  "sso.providerEntra": "Microsoft Entra ID",
  "sso.providerGoogle": "Google Workspace",
  "sso.providerOkta": "Okta",
  "sso.providerGeneric": "Anden udbyder",
  "sso.protoOidc3": "OpenID Connect — 3 felter",
  "sso.protoOktaBoth": "OpenID Connect eller SAML 2.0",
  "sso.protoSamlXml": "SAML 2.0 — XML-metadata",
  "sso.settings": "Forbindelsesindstillinger",
  "sso.clientId": "Klient-id",
  "sso.clientSecret": "Klienthemmelighed",
  "sso.clientSecretHint":
    "Indtastes kun én gang. Vi giver besked 30 dage før den udløber.",
  "sso.idpTenant": "Tenant-id",
  "sso.metadataUrl": "Metadata-URL",
  "sso.metadataUrlHint":
    "Vi læser udstederen, login-URL'en og certifikatet fra denne fil.",
  "sso.certificate": "Signeringscertifikat",
  "sso.certificateLoaded": "Indlæst fra metadata",
  "sso.certificateLoadedPending":
    "Indlæst fra metadata — læses ved den første forbindelsestest",
  "sso.copyToProvider": "Til kopiering hos jeres udbyder",
  "sso.redirectUri": "Omdirigerings-URI",
  "sso.scopes": "Anmodede scopes",
  "sso.acsUrl": "Svar-URL (ACS)",
  "sso.entityId": "Entity-id",
  "sso.copy": "Kopiér",
  "sso.copied": "Kopieret!",
  "sso.strict": "Kræv SSO af mine medarbejdere",
  "sso.strictDesc":
    "E-maillinket slås fra for adresser på @{domain}. Din egen administratoradgang er fortsat sikret.",
  "sso.strictDescNoDomain":
    "E-maillinket slås fra for adresser på jeres bekræftede domæner. Din egen administratoradgang er fortsat sikret.",
  "sso.strictWarning":
    "Hvis jeres udbyder bliver utilgængelig, kan dine medarbejdere ikke længere nå deres henvendelser. Vi bevarer altid din administratoradgang via e-maillink.",
  "sso.jit": "Opret konti ved første login",
  "sso.jitDesc":
    "En ukendt medarbejder, der logger ind via jeres udbyder, knyttes automatisk til {org}.",
  "sso.test": "Test forbindelsen",
  "sso.testIdle":
    "Der åbnes et vindue til jeres udbyder. Intet aktiveres, før testen er lykkedes.",

  "domains.intro":
    "Et domæne skal bekræftes, før det kan bære en SSO-forbindelse. Kontrollen sikrer, at ingen andre kan gøre krav på dine medarbejderes konti.",
  "domains.verified": "Bekræftet",
  "domains.pending": "Skal bekræftes",
  "domains.memberCount": {
    one: "{count} medarbejder",
    other: "{count} medarbejdere",
  },
  "domains.txtInstructions":
    "Tilføj denne TXT-post til DNS-zonen for {domain}, og start derefter bekræftelsen.",
  "domains.verifyNow": "Bekræft nu",
  "domains.copyRecord": "Kopiér posten",
  "domains.add": "+ Tilføj et domæne",
  "domains.addSubmit": "Tilføj",
  "domains.notFound": "Posten blev ikke fundet ved den seneste kontrol ({when}).",
  "domains.errorInvalid": "Ugyldigt domæneformat — forventet f.eks. virksomhed.dk.",
  "domains.errorPublic": "Domæner for privat e-mail kan ikke bekræftes.",
  "domains.errorExists": "Dette domæne er allerede oprettet i dette arbejdsrum.",

  "members.shareTitle": "Henvendelser synlige for hele organisationen",
  "members.shareDesc":
    "Hver medarbejder ser kollegernes henvendelser, ikke kun sine egne.",
  "members.colMember": "Medarbejder",
  "members.colRole": "Rolle",
  "members.colAuth": "Login",
  "members.colRequests": "Henvendelser",
  "members.roleAdmin": "Administrator",
  "members.roleMember": "Medarbejder",
  "members.roleGuest": "Gæst",
  "members.authEmailLink": "E-maillink",
  "members.note":
    "Medarbejdere dukker automatisk op ved deres første login eller deres første henvendelse. Du kan udpege en anden administrator, så du ikke er eneste kontaktpunkt.",
};
