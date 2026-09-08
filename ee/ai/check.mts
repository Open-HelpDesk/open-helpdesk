import { redact } from "./src/redact";
import { costMicros } from "./src/provider";

let ok = 0, ko = 0;
const t = (name: string, cond: boolean, got?: unknown) => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { ko++; console.log(`  ✗ ${name}${got !== undefined ? ` — obtenu: ${JSON.stringify(got)}` : ""}`); }
};

console.log("\nRédaction");
const secret = redact("Ma clé est ohd_live_abcdef1234567890 et mon mot de passe: hunter2");
t("clé API masquée", secret.text.includes("[secret]"), secret.text);
t("mot de passe masqué", secret.text.includes("[redacted]"), secret.text);

const card = redact("Ma carte 4242 4242 4242 4242 a été refusée, commande 1234567890123456");
t("vraie carte (Luhn) masquée", card.text.includes("[card]"), card.text);
t("numéro de commande non masqué", card.text.includes("1234567890123456"), card.text);

const mail = redact("Je n'arrive pas à me connecter avec julien@nordfil.fr, ni depuis 192.168.1.4");
t("email masqué par défaut", mail.text.includes("[email]"), mail.text);
t("IP masquée", mail.text.includes("[ip]"), mail.text);

const kept = redact("Je n'arrive pas à me connecter avec julien@nordfil.fr", ["julien@nordfil.fr"]);
t("adresse du fil conservée", kept.text.includes("julien@nordfil.fr"), kept.text);
t("aucun masquage compté quand conservée", (kept.counts.email ?? 0) === 0, kept.counts);

const phone = redact("Appelez-moi au +33 6 12 34 56 78, référence 12345");
t("téléphone masqué", phone.text.includes("[phone]"), phone.text);
t("référence courte non masquée", phone.text.includes("12345"), phone.text);

const counted = redact("a@b.fr, c@d.fr et 10.0.0.1");
t("décompte par type", counted.counts.email === 2 && counted.counts.ip === 1, counted.counts);

console.log("\nCoût (grille Scaleway du 08/09/2026, en millionièmes d'euro)");
t("triage 800/60 = 230 µ€ (0,00023 €)", costMicros("gemma-4-26b-a4b-it", 800, 60) === 230,
  costMicros("gemma-4-26b-a4b-it", 800, 60));
t("résumé 3000/250 = 875 µ€", costMicros("gemma-4-26b-a4b-it", 3000, 250) === 875,
  costMicros("gemma-4-26b-a4b-it", 3000, 250));
t("réponse RAG 6000/400 = 1700 µ€", costMicros("gemma-4-26b-a4b-it", 6000, 400) === 1700,
  costMicros("gemma-4-26b-a4b-it", 6000, 400));
t("déflexion 6000/300 = 1650 µ€", costMicros("gemma-4-26b-a4b-it", 6000, 300) === 1650,
  costMicros("gemma-4-26b-a4b-it", 6000, 300));
t("embedding 1500 = 150 µ€", costMicros("qwen3-embedding-8b", 1500, 0) === 150,
  costMicros("qwen3-embedding-8b", 1500, 0));
t("modèle inconnu = 0 plutôt qu'une erreur", costMicros("inexistant", 9999, 9999) === 0);

console.log(`\n${ok} vérifications passées, ${ko} échouées`);
process.exit(ko === 0 ? 0 : 1);
