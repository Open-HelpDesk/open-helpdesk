import type { Dictionary } from "./fr";

export const sv: Dictionary = {
  "chrome.defaultName": "Hjälpcenter",
  "chrome.submitRequest": "Skicka en förfrågan",
  "chrome.submitShort": "Skicka",
  "chrome.myRequests": "Mina ärenden",
  "chrome.signIn": "Logga in",
  "chrome.myOrganization": "Min organisation",
  "chrome.signOut": "Logga ut",
  "chrome.poweredBy": "Drivs av {product}",
  "chrome.copyright": "© {year} {name}",

  "home.eyebrow": "Hjälpcenter",
  "home.title": "Hur kan vi hjälpa dig?",
  "home.subtitle":
    "Bläddra bland guiderna eller kontakta vårt team måndag till fredag, kl. 9–18.",
  "home.categories": "Kategorier",
  "home.popular": "Mest lästa",
  "home.views": { one: "{count} visning", other: "{count} visningar" },
  "home.ctaTitle": "Hittar du inte det du söker?",
  "home.ctaBody": "Vårt team svarar i snitt inom 34 minuter under kontorstid.",

  "search.placeholder": "Sök i hjälpcentret…",
  "search.emptyTitle": "Inga träffar för ”{query}”",
  "search.emptyBody":
    "Prova bredare sökord, eller beskriv din situation för vårt team.",
  "search.breadcrumb": "Sökning",
  "search.resultsTitle": "Resultat för ”{query}”",

  "breadcrumb.help": "Hjälp",
  "category.otherCategories": "Andra kategorier",
  "category.otherArticles": "Andra artiklar",
  "category.articleCount": { one: "{count} artikel", other: "{count} artiklar" },

  "article.meta": {
    one: "Uppdaterad {date} · {count} min läsning",
    other: "Uppdaterad {date} · {count} min läsning",
  },
  "article.related": "Relaterade artiklar",
  "article.onThisPage": "På den här sidan",
  "vote.question": "Var artikeln till hjälp?",
  "vote.yes": "Ja",
  "vote.no": "Nej",
  "vote.thanks": "Tack för din återkoppling.",
  "vote.sorry":
    "Tråkigt att artikeln inte besvarade din fråga. Vill du prata med vårt team om den?",
  "vote.prefill": "Skapa en förifylld förfrågan",
  "vote.prefillSubject": "Om artikeln ”{title}”",

  "newRequest.title": "Skicka en förfrågan",
  "newRequest.subtitle": "Beskriv din situation. Vi svarar inom 4 arbetstimmar.",
  "newRequest.type": "Typ av förfrågan",
  "newRequest.typeTechnical": "Teknisk support",
  "newRequest.typeTechnicalDesc": "Anmäla ett fel",
  "newRequest.typeBilling": "Fråga om fakturering",
  "newRequest.typeBillingDesc": "Fakturor, betalningar, abonnemang",
  "newRequest.typeFeature": "Önskemål om förbättring",
  "newRequest.typeFeatureDesc": "Föreslå en förbättring",
  "newRequest.email": "Din e-postadress",
  "newRequest.subject": "Ämne",
  "newRequest.module": "Berörd modul",
  "newRequest.urgency": "Brådska",
  "newRequest.urgencyLow": "Låg",
  "newRequest.urgencyNormal": "Normal",
  "newRequest.urgencyHigh": "Hög",
  "newRequest.description": "Beskrivning",
  "newRequest.send": "Skicka förfrågan",
  "deflection.title": "De här artiklarna kanske besvarar din fråga",
  "dropzone.title": "Släpp dina filer här",
  "dropzone.hint": "PNG, JPG, PDF — högst 10 MB",
  "dropzone.selected": {
    one: "{count} fil vald",
    other: "{count} filer valda",
  },
  "attach.label": "Bifoga en fil",

  "submitted.title": "Förfrågan mottagen",
  "submitted.reference":
    "Din förfrågan har referensen {ref}. Du får varje svar via e-post.",
  "submitted.referenceUnknown":
    "Din förfrågan har registrerats. Du får varje svar via e-post.",
  "submitted.verify":
    "Vi har skickat en verifieringslänk till {email} så att du kan följa din förfrågan.",
  "submitted.verifyNoEmail":
    "Vi har skickat dig en verifieringslänk så att du kan följa din förfrågan.",
  "submitted.track": "Följ min förfrågan",
  "submitted.backToHelp": "Tillbaka till hjälpen",

  "requests.title": "Mina ärenden",
  "requests.new": "Nytt ärende",
  "requests.tabOpen": "Öppna",
  "requests.tabSolved": "Lösta",
  "requests.tabAll": "Alla",
  "requests.tabOrg": "Min organisations ärenden",
  "requests.emptyTitle": "Inga ärenden",
  "requests.emptyBody":
    "Dina supportärenden visas här, med status och hela historiken.",
  "requests.awaitingReply": "Svar väntas",

  "status.open": "Pågår",
  "status.waiting": "Väntar på dig",
  "status.resolved": "Löst",
  "status.closed": "Avslutat",

  "activity.resolved": "Löst {when}",
  "activity.closed": "Avslutat {when}",
  "activity.waiting": "Väntar på ditt svar {since}",
  "activity.agentReplied": "Svar från {name} {when}",
  "activity.youReplied": "Du svarade {when}",
  "activity.created": "Skapat {when}",

  "since.minutes": { one: "sedan {count} min", other: "sedan {count} min" },
  "since.hours": { one: "sedan {count} tim", other: "sedan {count} tim" },
  "since.days": { one: "sedan i går", other: "sedan {count} dagar" },
  "since.date": "sedan {date}",

  "request.you": "Du",
  "request.team": "Teamet",
  "request.agentAuthor": "{name} — {tenant}",
  "reply.placeholder": "Skriv ett svar…",
  "reply.send": "Skicka",
  "csat.question": "Hur bedömer du det här svaret?",
  "csat.satisfied": "Nöjd",
  "csat.unsatisfied": "Inte nöjd",
  "csat.comment": "Vill du lägga till något? (frivilligt)",
  "csat.send": "Skicka kommentaren",
  "meta.status": "Status",
  "meta.created": "Skapat",
  "meta.reference": "Referens",
  "request.markSolved": "Markera som löst",
  "request.reopen": "Öppna ärendet igen",

  "login.title": "Följ dina ärenden",
  "login.magicIntro":
    "Ange din e-postadress så skickar vi en inloggningslänk. Inget lösenord att komma ihåg.",
  "login.email": "E-post",
  "login.sendLink": "Skicka länken",
  "login.sentTitle": "Kolla din inkorg",
  "login.sentBody":
    "Vi har skickat en inloggningslänk till {email}. Den går ut om 15 minuter.",
  "login.sentBodyNoEmail":
    "Vi har skickat dig en inloggningslänk. Den går ut om 15 minuter.",
  "login.otherAddress": "Använd en annan adress",
  "login.expired": "Länken har gått ut eller är ogiltig. Begär en ny.",
  "login.footer":
    "Inga ärenden än? Ditt konto skapas automatiskt vid första förfrågan.",

  "org.intro": {
    one: "Du är administratör för den här organisationen. Det du ställer in här gäller den person på {org} som använder supporten från {tenant}.",
    other:
      "Du är administratör för den här organisationen. Det du ställer in här gäller de {count} personer på {org} som använder supporten från {tenant}.",
  },
  "org.tabSso": "SSO-inloggning",
  "org.tabDomains": "Domäner",
  "org.tabMembers": "Medarbetare",

  "sso.enterpriseLogin": "Inloggning med företagskonto",
  "sso.enterpriseLoginDesc":
    "Dina medarbetare anger sin jobbadress och skickas vidare till din identitetsleverantör. Inget lösenord att skapa.",
  "sso.active": "Aktiv",
  "sso.inactive": "Inaktiv",
  "sso.provider": "Din identitetsleverantör",
  "sso.providerEntra": "Microsoft Entra ID",
  "sso.providerGoogle": "Google Workspace",
  "sso.providerOkta": "Okta",
  "sso.providerGeneric": "Annan leverantör",
  "sso.protoOidc3": "OpenID Connect — 3 fält",
  "sso.protoOktaBoth": "OpenID Connect eller SAML 2.0",
  "sso.protoSamlXml": "SAML 2.0 — XML-metadata",
  "sso.settings": "Anslutningsinställningar",
  "sso.clientId": "Klient-ID",
  "sso.clientSecret": "Klienthemlighet",
  "sso.clientSecretHint":
    "Anges en enda gång. Vi hör av oss 30 dagar innan den går ut.",
  "sso.idpTenant": "Tenant-ID",
  "sso.metadataUrl": "Metadata-URL",
  "sso.metadataUrlHint":
    "Ur den här filen läser vi utfärdaren, inloggnings-URL:en och certifikatet.",
  "sso.certificate": "Signeringscertifikat",
  "sso.certificateLoaded": "Hämtat ur metadata",
  "sso.certificateLoadedPending":
    "Hämtat ur metadata — läses vid första anslutningstestet",
  "sso.copyToProvider": "Att kopiera in hos din leverantör",
  "sso.redirectUri": "Omdirigerings-URI",
  "sso.scopes": "Begärda scopes",
  "sso.acsUrl": "Svars-URL (ACS)",
  "sso.entityId": "Entity ID",
  "sso.copy": "Kopiera",
  "sso.copied": "Kopierat!",
  "sso.strict": "Kräv SSO för mina medarbetare",
  "sso.strictDesc":
    "E-postlänken stängs av för adresser på @{domain}. Din egen administratörsåtkomst är fortsatt garanterad.",
  "sso.strictDescNoDomain":
    "E-postlänken stängs av för adresser på dina verifierade domäner. Din egen administratörsåtkomst är fortsatt garanterad.",
  "sso.strictWarning":
    "Om din leverantör blir otillgänglig kommer dina medarbetare inte längre åt sina ärenden. Vi behåller alltid din administratörsåtkomst via e-postlänk.",
  "sso.jit": "Skapa konton vid första inloggningen",
  "sso.jitDesc":
    "En okänd medarbetare som loggar in via din leverantör kopplas automatiskt till {org}.",
  "sso.test": "Testa anslutningen",
  "sso.testIdle":
    "Ett fönster öppnas mot din leverantör. Inget aktiveras förrän testet har lyckats.",

  "domains.intro":
    "En domän måste verifieras innan den kan bära en SSO-anslutning. Kontrollen garanterar att ingen annan kan göra anspråk på dina medarbetares konton.",
  "domains.verified": "Verifierad",
  "domains.pending": "Att verifiera",
  "domains.memberCount": {
    one: "{count} medarbetare",
    other: "{count} medarbetare",
  },
  "domains.txtInstructions":
    "Lägg till den här TXT-posten i DNS-zonen för {domain} och starta sedan verifieringen.",
  "domains.verifyNow": "Verifiera nu",
  "domains.copyRecord": "Kopiera posten",
  "domains.add": "+ Lägg till en domän",
  "domains.addSubmit": "Lägg till",
  "domains.notFound": "Posten hittades inte vid den senaste kontrollen ({when}).",
  "domains.errorInvalid": "Ogiltigt domänformat — förväntat exempel: foretag.se.",
  "domains.errorPublic": "Domäner för privat e-post kan inte verifieras.",
  "domains.errorExists": "Domänen är redan registrerad i den här arbetsytan.",

  "members.shareTitle": "Ärenden synliga för hela organisationen",
  "members.shareDesc":
    "Varje medarbetare ser kollegornas ärenden, inte bara sina egna.",
  "members.colMember": "Medarbetare",
  "members.colRole": "Roll",
  "members.colAuth": "Inloggning",
  "members.colRequests": "Ärenden",
  "members.roleAdmin": "Administratör",
  "members.roleMember": "Medarbetare",
  "members.roleGuest": "Gäst",
  "members.authEmailLink": "E-postlänk",
  "members.note":
    "Medarbetare dyker upp automatiskt vid sin första inloggning eller sitt första ärende. Du kan utse en andra administratör så att du inte förblir enda kontaktpunkt.",

  "widget.defaultTitle": "Behöver du hjälp?",
  "widget.close": "Stäng",
  "widget.messageLabel": "Ditt meddelande",
  "widget.messagePlaceholder": "Skriv ditt meddelande…",
  "widget.attach": "Bifoga en fil — högst 10 MB",
  "widget.sentBody": "Du får varje svar via e-post.",
  "widget.another": "Skicka en till förfrågan",
  "csatPage.title": "Din återkoppling",
  "csatPage.invalidTitle": "Ogiltig länk",
  "csatPage.invalidBody": "Den här enkätlänken är ogiltig eller har gått ut.",
  "csatPage.notFoundTitle": "Ärendet hittades inte",
  "csatPage.notFoundBody": "Det här ärendet finns inte längre.",
  "csatPage.thanks": "Tack för din återkoppling",
  "csatPage.recorded": "Ditt omdöme om ärende {ref} har registrerats.",
  "csatPage.recordedBad": "Ditt omdöme om ärende {ref} har registrerats — vi beklagar att svaret inte hjälpte.",
  "csatPage.commentPlaceholder": "Vill du lägga till något? (frivilligt)",
  "csatPage.doneTitle": "Tack!",
  "csatPage.doneBody": "Din kommentar har vidarebefordrats till teamet.",
};
