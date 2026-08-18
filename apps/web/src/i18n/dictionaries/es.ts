import type { Dictionary } from "./fr";

export const es: Dictionary = {
  "chrome.defaultName": "Centro de ayuda",
  "chrome.submitRequest": "Enviar una solicitud",
  "chrome.submitShort": "Enviar",
  "chrome.myRequests": "Mis solicitudes",
  "chrome.signIn": "Iniciar sesión",
  "chrome.myOrganization": "Mi organización",
  "chrome.signOut": "Cerrar sesión",
  "chrome.poweredBy": "Con tecnología de {product}",
  "chrome.copyright": "© {year} {name}",

  "home.eyebrow": "Centro de ayuda",
  "home.title": "¿Cómo podemos ayudarte?",
  "home.subtitle":
    "Consulta las guías o ponte en contacto con nuestro equipo de lunes a viernes, de 9 a 18 h.",
  "home.categories": "Categorías",
  "home.popular": "Los más consultados",
  "home.views": { one: "{count} visita", other: "{count} visitas" },
  "home.ctaTitle": "¿No encuentras lo que buscas?",
  "home.ctaBody":
    "Nuestro equipo responde en 34 minutos de media durante el horario laboral.",

  "search.placeholder": "Buscar en el centro de ayuda…",
  "search.emptyTitle": "Ningún resultado para «{query}»",
  "search.emptyBody":
    "Prueba con términos más generales o describe tu situación a nuestro equipo.",
  "search.breadcrumb": "Búsqueda",
  "search.resultsTitle": "Resultados para «{query}»",

  "breadcrumb.help": "Ayuda",
  "category.otherCategories": "Otras categorías",
  "category.otherArticles": "Otros artículos",
  "category.articleCount": { one: "{count} artículo", other: "{count} artículos" },

  "article.meta": {
    one: "Actualizado el {date} · {count} min de lectura",
    other: "Actualizado el {date} · {count} min de lectura",
  },
  "article.related": "Artículos relacionados",
  "article.onThisPage": "En esta página",
  "vote.question": "¿Te ha resultado útil este artículo?",
  "vote.yes": "Sí",
  "vote.no": "No",
  "vote.thanks": "Gracias por tu comentario.",
  "vote.sorry":
    "Sentimos que este artículo no haya respondido a tu pregunta. ¿Quieres hablarlo con nuestro equipo?",
  "vote.prefill": "Crear una solicitud rellenada",
  "vote.prefillSubject": "Sobre el artículo «{title}»",

  "newRequest.title": "Enviar una solicitud",
  "newRequest.subtitle":
    "Describe tu situación. Respondemos en un plazo de 4 horas laborables.",
  "newRequest.type": "Tipo de solicitud",
  "newRequest.typeTechnical": "Soporte técnico",
  "newRequest.typeTechnicalDesc": "Comunicar un fallo",
  "newRequest.typeBilling": "Consulta de facturación",
  "newRequest.typeBillingDesc": "Facturas, pagos, suscripción",
  "newRequest.typeFeature": "Propuesta de mejora",
  "newRequest.typeFeatureDesc": "Sugerir una mejora",
  "newRequest.email": "Tu correo electrónico",
  "newRequest.subject": "Asunto",
  "newRequest.module": "Módulo afectado",
  "newRequest.urgency": "Urgencia",
  "newRequest.urgencyLow": "Baja",
  "newRequest.urgencyNormal": "Normal",
  "newRequest.urgencyHigh": "Alta",
  "newRequest.description": "Descripción",
  "newRequest.send": "Enviar la solicitud",
  "deflection.title": "Puede que estos artículos respondan a tu pregunta",
  "dropzone.title": "Suelta aquí tus archivos",
  "dropzone.hint": "PNG, JPG, PDF — 10 MB como máximo",
  "dropzone.selected": {
    one: "{count} archivo seleccionado",
    other: "{count} archivos seleccionados",
  },
  "attach.label": "Adjuntar un archivo",

  "submitted.title": "Solicitud registrada",
  "submitted.reference":
    "Tu solicitud tiene la referencia {ref}. Recibirás cada respuesta por correo electrónico.",
  "submitted.referenceUnknown":
    "Tu solicitud se ha registrado. Recibirás cada respuesta por correo electrónico.",
  "submitted.verify":
    "Hemos enviado un enlace de verificación a {email} para que puedas seguir tu solicitud.",
  "submitted.verifyNoEmail":
    "Te hemos enviado un enlace de verificación para que puedas seguir tu solicitud.",
  "submitted.track": "Seguir mi solicitud",
  "submitted.backToHelp": "Volver a la ayuda",

  "requests.title": "Mis solicitudes",
  "requests.new": "Nueva solicitud",
  "requests.tabOpen": "Abiertas",
  "requests.tabSolved": "Resueltas",
  "requests.tabAll": "Todas",
  "requests.tabOrg": "Solicitudes de mi organización",
  "requests.emptyTitle": "Ninguna solicitud",
  "requests.emptyBody":
    "Tus solicitudes de soporte aparecerán aquí, con su estado y el historial de los intercambios.",
  "requests.awaitingReply": "Respuesta pendiente",

  "status.open": "En curso",
  "status.waiting": "Esperando tu respuesta",
  "status.resolved": "Resuelta",
  "status.closed": "Cerrada",

  "activity.resolved": "Resuelta {when}",
  "activity.closed": "Cerrada {when}",
  "activity.waiting": "Esperando tu respuesta {since}",
  "activity.agentReplied": "Respuesta de {name} {when}",
  "activity.youReplied": "Respondiste {when}",
  "activity.created": "Creada {when}",

  "since.minutes": { one: "desde hace {count} min", other: "desde hace {count} min" },
  "since.hours": { one: "desde hace {count} h", other: "desde hace {count} h" },
  "since.days": { one: "desde ayer", other: "desde hace {count} días" },
  "since.date": "desde el {date}",

  "request.you": "Tú",
  "request.team": "El equipo",
  "request.agentAuthor": "{name} — {tenant}",
  "reply.placeholder": "Escribe una respuesta…",
  "reply.send": "Enviar",
  "csat.question": "¿Cómo valoras esta respuesta?",
  "csat.satisfied": "Satisfecho",
  "csat.unsatisfied": "No satisfecho",
  "csat.comment": "¿Quieres añadir un comentario? (opcional)",
  "csat.send": "Enviar el comentario",
  "meta.status": "Estado",
  "meta.created": "Creada el",
  "meta.reference": "Referencia",
  "request.markSolved": "Marcar como resuelta",
  "request.reopen": "Reabrir la solicitud",

  "login.title": "Sigue tus solicitudes",
  "login.magicIntro":
    "Introduce tu correo electrónico: te enviaremos un enlace de acceso. Ninguna contraseña que recordar.",
  "login.email": "Correo electrónico",
  "login.sendLink": "Recibir el enlace",
  "login.sentTitle": "Consulta tu bandeja de entrada",
  "login.sentBody":
    "Hemos enviado un enlace de acceso a {email}. Caduca en 15 minutos.",
  "login.sentBodyNoEmail":
    "Te hemos enviado un enlace de acceso. Caduca en 15 minutos.",
  "login.otherAddress": "Usar otra dirección",
  "login.expired": "Este enlace ha caducado o no es válido. Solicita uno nuevo.",
  "login.footer":
    "¿Aún no tienes solicitudes? Tu cuenta se crea automáticamente con la primera.",

  "org.intro": {
    one: "Eres administrador de esta organización. Lo que configures aquí se aplica a la persona de {org} que utiliza el soporte de {tenant}.",
    other:
      "Eres administrador de esta organización. Lo que configures aquí se aplica a las {count} personas de {org} que utilizan el soporte de {tenant}.",
  },
  "org.tabSso": "Acceso SSO",
  "org.tabDomains": "Dominios",
  "org.tabMembers": "Colaboradores",

  "sso.enterpriseLogin": "Acceso con cuenta corporativa",
  "sso.enterpriseLoginDesc":
    "Tus colaboradores introducen su correo profesional y se les redirige a tu proveedor de identidad. Ninguna contraseña que crear.",
  "sso.active": "Activo",
  "sso.inactive": "Inactivo",
  "sso.provider": "Tu proveedor de identidad",
  "sso.providerEntra": "Microsoft Entra ID",
  "sso.providerGoogle": "Google Workspace",
  "sso.providerOkta": "Okta",
  "sso.providerGeneric": "Otro proveedor",
  "sso.protoOidc3": "OpenID Connect — 3 campos",
  "sso.protoOktaBoth": "OpenID Connect o SAML 2.0",
  "sso.protoSamlXml": "SAML 2.0 — metadatos XML",
  "sso.settings": "Parámetros de conexión",
  "sso.clientId": "ID de cliente",
  "sso.clientSecret": "Secreto de cliente",
  "sso.clientSecretHint":
    "Se introduce una sola vez. Te avisaremos 30 días antes de que caduque.",
  "sso.idpTenant": "ID de inquilino",
  "sso.metadataUrl": "URL de metadatos",
  "sso.metadataUrlHint":
    "De este archivo leemos el emisor, la URL de acceso y el certificado.",
  "sso.certificate": "Certificado de firma",
  "sso.certificateLoaded": "Cargado desde los metadatos",
  "sso.certificateLoadedPending":
    "Cargado desde los metadatos — se lee en la primera prueba de conexión",
  "sso.copyToProvider": "Para copiar en tu proveedor",
  "sso.redirectUri": "URI de redirección",
  "sso.scopes": "Ámbitos solicitados",
  "sso.acsUrl": "URL de respuesta (ACS)",
  "sso.entityId": "Entity ID",
  "sso.copy": "Copiar",
  "sso.copied": "¡Copiado!",
  "sso.strict": "Exigir el SSO a mis colaboradores",
  "sso.strictDesc":
    "El enlace por correo se desactiva para las direcciones @{domain}. Tu propio acceso de administrador sigue garantizado.",
  "sso.strictDescNoDomain":
    "El enlace por correo se desactiva para las direcciones de tus dominios verificados. Tu propio acceso de administrador sigue garantizado.",
  "sso.strictWarning":
    "Si tu proveedor deja de estar disponible, tus colaboradores ya no podrán acceder a sus solicitudes. Siempre conservamos tu acceso de administrador mediante enlace por correo.",
  "sso.jit": "Crear las cuentas en el primer acceso",
  "sso.jitDesc":
    "Un colaborador desconocido que accede a través de tu proveedor se vincula automáticamente a {org}.",
  "sso.test": "Probar la conexión",
  "sso.testIdle":
    "Se abrirá una ventana hacia tu proveedor. No se activa nada mientras la prueba no tenga éxito.",

  "domains.intro":
    "Un dominio debe verificarse antes de poder sostener una conexión SSO. Esta verificación garantiza que nadie más pueda reclamar las cuentas de tus colaboradores.",
  "domains.verified": "Verificado",
  "domains.pending": "Por verificar",
  "domains.memberCount": {
    one: "{count} colaborador",
    other: "{count} colaboradores",
  },
  "domains.txtInstructions":
    "Añade este registro TXT a la zona DNS de {domain} y luego inicia la verificación.",
  "domains.verifyNow": "Verificar ahora",
  "domains.copyRecord": "Copiar el registro",
  "domains.add": "+ Añadir un dominio",
  "domains.addSubmit": "Añadir",
  "domains.notFound": "Registro no encontrado en la última verificación ({when}).",
  "domains.errorInvalid": "Formato de dominio no válido — se espera algo como empresa.es.",
  "domains.errorPublic":
    "Los dominios de correo para uso personal no pueden verificarse.",
  "domains.errorExists": "Este dominio ya está declarado en este espacio.",

  "members.shareTitle": "Solicitudes visibles para toda la organización",
  "members.shareDesc":
    "Cada colaborador ve las solicitudes de sus compañeros, no solo las suyas.",
  "members.colMember": "Colaborador",
  "members.colRole": "Rol",
  "members.colAuth": "Acceso",
  "members.colRequests": "Solicitudes",
  "members.roleAdmin": "Administrador",
  "members.roleMember": "Colaborador",
  "members.roleGuest": "Invitado",
  "members.authEmailLink": "Enlace por correo",
  "members.note":
    "Los colaboradores aparecen automáticamente en su primer acceso o su primera solicitud. Puedes designar a un segundo administrador para no ser el único punto de contacto.",

  "widget.defaultTitle": "¿Necesitas ayuda?",
  "widget.close": "Cerrar",
  "widget.messageLabel": "Tu mensaje",
  "widget.messagePlaceholder": "Escribe tu mensaje…",
  "widget.attach": "Adjuntar un archivo — 10 MB como máximo",
  "widget.sentBody": "Recibirás cada respuesta por correo electrónico.",
  "widget.another": "Enviar otra solicitud",
  "csatPage.title": "Tu opinión",
  "csatPage.invalidTitle": "Enlace no válido",
  "csatPage.invalidBody": "Este enlace de encuesta no es válido o ha caducado.",
  "csatPage.notFoundTitle": "Solicitud no encontrada",
  "csatPage.notFoundBody": "Esta solicitud ya no existe.",
  "csatPage.thanks": "Gracias por tu opinión",
  "csatPage.recorded": "Tu valoración de la solicitud {ref} se ha registrado.",
  "csatPage.recordedBad": "Tu valoración de la solicitud {ref} se ha registrado — sentimos que la respuesta no te haya servido.",
  "csatPage.commentPlaceholder": "¿Quieres añadir un comentario? (opcional)",
  "csatPage.doneTitle": "¡Gracias!",
  "csatPage.doneBody": "Tu comentario se ha transmitido al equipo.",
};
