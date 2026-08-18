import type { Dictionary } from "./fr";

export const fi: Dictionary = {
  "chrome.defaultName": "Ohjekeskus",
  "chrome.submitRequest": "Lähetä pyyntö",
  "chrome.submitShort": "Lähetä",
  "chrome.myRequests": "Omat pyyntöni",
  "chrome.signIn": "Kirjaudu sisään",
  "chrome.myOrganization": "Oma organisaationi",
  "chrome.signOut": "Kirjaudu ulos",
  "chrome.poweredBy": "Palvelun tarjoaa {product}",
  "chrome.copyright": "© {year} {name}",

  "home.eyebrow": "Ohjekeskus",
  "home.title": "Miten voimme auttaa?",
  "home.subtitle":
    "Selaa ohjeita tai ota yhteyttä tiimiimme maanantaista perjantaihin klo 9–18.",
  "home.categories": "Luokat",
  "home.popular": "Luetuimmat",
  "home.views": { one: "{count} katselu", other: "{count} katselua" },
  "home.ctaTitle": "Etkö löydä etsimääsi?",
  "home.ctaBody": "Tiimimme vastaa työaikana keskimäärin 34 minuutissa.",

  "search.placeholder": "Hae ohjekeskuksesta…",
  "search.emptyTitle": "Ei tuloksia haulle ”{query}”",
  "search.emptyBody":
    "Kokeile yleisempiä hakusanoja tai kuvaile tilanteesi tiimillemme.",
  "search.breadcrumb": "Haku",
  "search.resultsTitle": "Tulokset haulle ”{query}”",

  "breadcrumb.help": "Ohjeet",
  "category.otherCategories": "Muut luokat",
  "category.otherArticles": "Muut artikkelit",
  "category.articleCount": { one: "{count} artikkeli", other: "{count} artikkelia" },

  "article.meta": {
    one: "Päivitetty {date} · lukuaika {count} min",
    other: "Päivitetty {date} · lukuaika {count} min",
  },
  "article.related": "Aiheeseen liittyvät artikkelit",
  "article.onThisPage": "Tällä sivulla",
  "vote.question": "Oliko artikkelista hyötyä?",
  "vote.yes": "Kyllä",
  "vote.no": "Ei",
  "vote.thanks": "Kiitos palautteestasi.",
  "vote.sorry":
    "Harmi, ettei artikkeli vastannut kysymykseesi. Haluatko keskustella siitä tiimimme kanssa?",
  "vote.prefill": "Luo esitäytetty pyyntö",
  "vote.prefillSubject": "Artikkelista ”{title}”",

  "newRequest.title": "Lähetä pyyntö",
  "newRequest.subtitle": "Kuvaile tilanteesi. Vastaamme 4 työtunnin kuluessa.",
  "newRequest.type": "Pyynnön tyyppi",
  "newRequest.typeTechnical": "Tekninen tuki",
  "newRequest.typeTechnicalDesc": "Ilmoita häiriöstä",
  "newRequest.typeBilling": "Laskutuskysymys",
  "newRequest.typeBillingDesc": "Laskut, maksut, tilaus",
  "newRequest.typeFeature": "Kehitysehdotus",
  "newRequest.typeFeatureDesc": "Ehdota parannusta",
  "newRequest.email": "Sähköpostiosoitteesi",
  "newRequest.subject": "Aihe",
  "newRequest.module": "Kyseessä oleva osio",
  "newRequest.urgency": "Kiireellisyys",
  "newRequest.urgencyLow": "Matala",
  "newRequest.urgencyNormal": "Normaali",
  "newRequest.urgencyHigh": "Korkea",
  "newRequest.description": "Kuvaus",
  "newRequest.send": "Lähetä pyyntö",
  "deflection.title": "Nämä artikkelit saattavat vastata kysymykseesi",
  "dropzone.title": "Pudota tiedostot tähän",
  "dropzone.hint": "PNG, JPG, PDF — enintään 10 Mt",
  "dropzone.selected": {
    one: "{count} tiedosto valittu",
    other: "{count} tiedostoa valittu",
  },
  "attach.label": "Liitä tiedosto",

  "submitted.title": "Pyyntö vastaanotettu",
  "submitted.reference":
    "Pyyntösi viite on {ref}. Saat jokaisen vastauksen sähköpostitse.",
  "submitted.referenceUnknown":
    "Pyyntösi on vastaanotettu. Saat jokaisen vastauksen sähköpostitse.",
  "submitted.verify":
    "Lähetimme vahvistuslinkin osoitteeseen {email}, jotta voit seurata pyyntöäsi.",
  "submitted.verifyNoEmail":
    "Lähetimme sinulle vahvistuslinkin, jotta voit seurata pyyntöäsi.",
  "submitted.track": "Seuraa pyyntöäni",
  "submitted.backToHelp": "Takaisin ohjeisiin",

  "requests.title": "Omat pyyntöni",
  "requests.new": "Uusi pyyntö",
  "requests.tabOpen": "Avoimet",
  "requests.tabSolved": "Ratkaistut",
  "requests.tabAll": "Kaikki",
  "requests.tabOrg": "Organisaationi pyynnöt",
  "requests.emptyTitle": "Ei pyyntöjä",
  "requests.emptyBody":
    "Tukipyyntösi näkyvät tässä tilatietoineen ja koko viestihistorioineen.",
  "requests.awaitingReply": "Vastausta odotetaan",

  "status.open": "Käsittelyssä",
  "status.waiting": "Odottaa sinua",
  "status.resolved": "Ratkaistu",
  "status.closed": "Suljettu",

  "activity.resolved": "Ratkaistu {when}",
  "activity.closed": "Suljettu {when}",
  "activity.waiting": "Odottaa vastaustasi {since}",
  "activity.agentReplied": "{name} vastasi {when}",
  "activity.youReplied": "Vastasit {when}",
  "activity.created": "Luotu {when}",

  "since.minutes": { one: "{count} minuutin ajan", other: "{count} minuutin ajan" },
  "since.hours": { one: "{count} tunnin ajan", other: "{count} tunnin ajan" },
  "since.days": { one: "eilisestä lähtien", other: "{count} päivän ajan" },
  "since.date": "{date} lähtien",

  "request.you": "Sinä",
  "request.team": "Tiimi",
  "request.agentAuthor": "{name} — {tenant}",
  "reply.placeholder": "Kirjoita vastaus…",
  "reply.send": "Lähetä",
  "csat.question": "Miten arvioit tämän vastauksen?",
  "csat.satisfied": "Tyytyväinen",
  "csat.unsatisfied": "Tyytymätön",
  "csat.comment": "Haluatko lisätä kommentin? (vapaaehtoinen)",
  "csat.send": "Lähetä kommentti",
  "meta.status": "Tila",
  "meta.created": "Luotu",
  "meta.reference": "Viite",
  "request.markSolved": "Merkitse ratkaistuksi",
  "request.reopen": "Avaa pyyntö uudelleen",

  "login.title": "Seuraa pyyntöjäsi",
  "login.magicIntro":
    "Anna sähköpostiosoitteesi, niin lähetämme kirjautumislinkin. Salasanaa ei tarvitse muistaa.",
  "login.email": "Sähköposti",
  "login.sendLink": "Lähetä linkki",
  "login.sentTitle": "Tarkista sähköpostisi",
  "login.sentBody":
    "Lähetimme kirjautumislinkin osoitteeseen {email}. Se vanhenee 15 minuutissa.",
  "login.sentBodyNoEmail":
    "Lähetimme sinulle kirjautumislinkin. Se vanhenee 15 minuutissa.",
  "login.otherAddress": "Käytä toista osoitetta",
  "login.expired": "Linkki on vanhentunut tai virheellinen. Pyydä uusi.",
  "login.footer":
    "Ei vielä pyyntöjä? Tilisi luodaan automaattisesti ensimmäisen pyynnön yhteydessä.",

  "org.intro": {
    one: "Olet tämän organisaation järjestelmänvalvoja. Tässä tekemäsi asetukset koskevat sitä {org}-organisaation henkilöä, joka käyttää {tenant}-tukea.",
    other:
      "Olet tämän organisaation järjestelmänvalvoja. Tässä tekemäsi asetukset koskevat niitä {count} {org}-organisaation henkilöä, jotka käyttävät {tenant}-tukea.",
  },
  "org.tabSso": "SSO-kirjautuminen",
  "org.tabDomains": "Verkkotunnukset",
  "org.tabMembers": "Työntekijät",

  "sso.enterpriseLogin": "Kirjautuminen yritystilillä",
  "sso.enterpriseLoginDesc":
    "Työntekijäsi syöttävät työsähköpostinsa ja heidät ohjataan identiteetintarjoajallesi. Salasanaa ei tarvitse luoda.",
  "sso.active": "Aktiivinen",
  "sso.inactive": "Ei käytössä",
  "sso.provider": "Identiteetintarjoajasi",
  "sso.providerEntra": "Microsoft Entra ID",
  "sso.providerGoogle": "Google Workspace",
  "sso.providerOkta": "Okta",
  "sso.providerGeneric": "Muu tarjoaja",
  "sso.protoOidc3": "OpenID Connect — 3 kenttää",
  "sso.protoOktaBoth": "OpenID Connect tai SAML 2.0",
  "sso.protoSamlXml": "SAML 2.0 — XML-metatiedot",
  "sso.settings": "Yhteysasetukset",
  "sso.clientId": "Asiakastunnus",
  "sso.clientSecret": "Asiakassalaisuus",
  "sso.clientSecretHint":
    "Syötetään vain kerran. Ilmoitamme 30 päivää ennen sen vanhenemista.",
  "sso.idpTenant": "Vuokralaistunnus",
  "sso.metadataUrl": "Metatietojen URL",
  "sso.metadataUrlHint":
    "Luemme tästä tiedostosta myöntäjän, kirjautumisosoitteen ja varmenteen.",
  "sso.certificate": "Allekirjoitusvarmenne",
  "sso.certificateLoaded": "Ladattu metatiedoista",
  "sso.certificateLoadedPending":
    "Ladattu metatiedoista — luetaan ensimmäisessä yhteystestissä",
  "sso.copyToProvider": "Kopioitavaksi tarjoajallesi",
  "sso.redirectUri": "Uudelleenohjaus-URI",
  "sso.scopes": "Pyydetyt oikeudet",
  "sso.acsUrl": "Vastausosoite (ACS)",
  "sso.entityId": "Entity ID",
  "sso.copy": "Kopioi",
  "sso.copied": "Kopioitu!",
  "sso.strict": "Vaadi SSO työntekijöiltäni",
  "sso.strictDesc":
    "Sähköpostilinkki poistetaan käytöstä @{domain}-osoitteilta. Oma järjestelmänvalvojan pääsysi säilyy aina.",
  "sso.strictDescNoDomain":
    "Sähköpostilinkki poistetaan käytöstä vahvistettujen verkkotunnustesi osoitteilta. Oma järjestelmänvalvojan pääsysi säilyy aina.",
  "sso.strictWarning":
    "Jos tarjoajasi ei ole käytettävissä, työntekijäsi eivät enää pääse pyyntöihinsä. Säilytämme aina järjestelmänvalvojan pääsysi sähköpostilinkin kautta.",
  "sso.jit": "Luo tilit ensimmäisellä kirjautumisella",
  "sso.jitDesc":
    "Tuntematon työntekijä, joka kirjautuu tarjoajasi kautta, liitetään automaattisesti organisaatioon {org}.",
  "sso.test": "Testaa yhteys",
  "sso.testIdle":
    "Tarjoajallesi avautuu ikkuna. Mitään ei oteta käyttöön ennen kuin testi on onnistunut.",

  "domains.intro":
    "Verkkotunnus on vahvistettava, ennen kuin se voi kantaa SSO-yhteyden. Vahvistus takaa, ettei kukaan muu voi lunastaa työntekijöidesi tilejä.",
  "domains.verified": "Vahvistettu",
  "domains.pending": "Vahvistettava",
  "domains.memberCount": {
    one: "{count} työntekijä",
    other: "{count} työntekijää",
  },
  "domains.txtInstructions":
    "Lisää tämä TXT-tietue verkkotunnuksen {domain} DNS-vyöhykkeelle ja käynnistä sitten vahvistus.",
  "domains.verifyNow": "Vahvista nyt",
  "domains.copyRecord": "Kopioi tietue",
  "domains.add": "+ Lisää verkkotunnus",
  "domains.addSubmit": "Lisää",
  "domains.notFound": "Tietuetta ei löytynyt viimeisimmässä tarkistuksessa ({when}).",
  "domains.errorInvalid": "Virheellinen verkkotunnuksen muoto — odotettu esimerkki: yritys.fi.",
  "domains.errorPublic": "Kuluttajasähköpostin verkkotunnuksia ei voi vahvistaa.",
  "domains.errorExists": "Tämä verkkotunnus on jo ilmoitettu tässä työtilassa.",

  "members.shareTitle": "Pyynnöt näkyvät koko organisaatiolle",
  "members.shareDesc":
    "Jokainen työntekijä näkee kollegoidensa pyynnöt, ei vain omiaan.",
  "members.colMember": "Työntekijä",
  "members.colRole": "Rooli",
  "members.colAuth": "Kirjautuminen",
  "members.colRequests": "Pyynnöt",
  "members.roleAdmin": "Järjestelmänvalvoja",
  "members.roleMember": "Työntekijä",
  "members.roleGuest": "Vieras",
  "members.authEmailLink": "Sähköpostilinkki",
  "members.note":
    "Työntekijät ilmestyvät automaattisesti ensimmäisellä kirjautumisellaan tai ensimmäisellä pyynnöllään. Voit nimetä toisen järjestelmänvalvojan, jotta et jää ainoaksi yhteyshenkilöksi.",

  "widget.defaultTitle": "Tarvitsetko apua?",
  "widget.close": "Sulje",
  "widget.messageLabel": "Viestisi",
  "widget.messagePlaceholder": "Kirjoita viestisi…",
  "widget.attach": "Liitä tiedosto — enintään 10 Mt",
  "widget.sentBody": "Saat jokaisen vastauksen sähköpostitse.",
  "widget.another": "Lähetä uusi pyyntö",
  "csatPage.title": "Palautteesi",
  "csatPage.invalidTitle": "Virheellinen linkki",
  "csatPage.invalidBody": "Tämä kyselylinkki ei kelpaa tai on vanhentunut.",
  "csatPage.notFoundTitle": "Pyyntöä ei löydy",
  "csatPage.notFoundBody": "Tätä pyyntöä ei ole enää olemassa.",
  "csatPage.thanks": "Kiitos palautteestasi",
  "csatPage.recorded": "Arviosi pyynnöstä {ref} on tallennettu.",
  "csatPage.recordedBad": "Arviosi pyynnöstä {ref} on tallennettu — pahoittelemme, ettei vastaus auttanut.",
  "csatPage.commentPlaceholder": "Haluatko lisätä kommentin? (vapaaehtoinen)",
  "csatPage.doneTitle": "Kiitos!",
  "csatPage.doneBody": "Kommenttisi on välitetty tiimille.",
};
