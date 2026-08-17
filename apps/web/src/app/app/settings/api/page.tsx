import { requireAgent } from "@/lib/session";
import { apiKeys, db, webhookDeliveries, webhooks } from "@openhelpdesk/db";
import { and, desc, eq } from "drizzle-orm";
import { relativeFr } from "@/lib/format";
import { PageHeader, PageShell, StatusPill } from "@/components/settings-page";
import { CreateKeyForm } from "./create-key-form";
import {
  createApiKey,
  createWebhook,
  deleteWebhook,
  resendDelivery,
  revokeApiKey,
  toggleWebhook,
} from "./actions";

const KEYS_GRID = "minmax(180px,1fr) 220px 180px 140px 90px";
const DELIVERY_GRID = "150px 110px 90px 90px 1fr 90px";

/** Bouton d'action en texte seul (Révoquer, Renvoyer…) — 12 px, sans cadre. */
const LINK_BTN = (color: string): React.CSSProperties => ({ fontSize: 12, color });

function scopesLabel(scopes: string[]): string {
  if (scopes.includes("write")) return "Lecture + écriture";
  if (scopes.includes("ticket:create")) return "Création de ticket";
  return "Lecture seule";
}

/** Réponse lisible d'une livraison — phrase canonique du code HTTP. */
const HTTP_REASON: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  408: "Request Timeout",
  410: "Gone",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** « Aujourd'hui 14:02 », « Hier 22:11 », « 14 août 09:03 ». */
function dayTimeFr(date: Date, now: Date = new Date()): string {
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) return `Aujourd'hui ${time}`;
  if (day === today - 24 * 3600 * 1000) return `Hier ${time}`;
  return `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} ${time}`;
}

/**
 * ST-10 — API & webhooks (1040 px). Clés API réelles (création avec affichage
 * unique, hash SHA-256, révocation) ; webhooks CRUD avec livraisons réelles et
 * bandeau rouge en cas de désactivation automatique.
 */
export default async function ApiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { tab } = await searchParams;
  const activeTab = tab === "webhooks" ? "webhooks" : "keys";

  const [keys, hooks] = await Promise.all([
    db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenant.id))
      .orderBy(desc(apiKeys.createdAt)),
    db
      .select()
      .from(webhooks)
      .where(eq(webhooks.tenantId, tenant.id))
      .orderBy(desc(webhooks.createdAt)),
  ]);

  const deliveriesByHook = new Map<string, (typeof webhookDeliveries.$inferSelect)[]>();
  for (const hook of hooks) {
    const rows = await db
      .select()
      .from(webhookDeliveries)
      .where(
        and(eq(webhookDeliveries.tenantId, tenant.id), eq(webhookDeliveries.webhookId, hook.id)),
      )
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(5);
    deliveriesByHook.set(hook.id, rows);
  }

  const tabs = [
    { label: "Clés API", href: "/app/settings/api", active: activeTab === "keys" },
    { label: "Webhooks", href: "/app/settings/api?tab=webhooks", active: activeTab === "webhooks" },
  ];

  return (
    <PageShell maxWidth={1040}>
      <PageHeader
        code="ST-10"
        title="API & webhooks"
        subtitle="Clés d'API scopées et endpoints webhook signés HMAC."
        tabs={tabs}
      />

      {activeTab === "keys" ? (
        <div className="st-rise flex flex-col" style={{ gap: 14 }}>
          <div
            className="overflow-x-auto border"
            style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <div style={{ minWidth: 820 }}>
              <div
                className="grid items-center border-b font-bold"
                style={{
                  gridTemplateColumns: KEYS_GRID,
                  height: 34,
                  padding: "0 14px",
                  background: "var(--sunk)",
                  borderColor: "var(--line)",
                  fontSize: 11,
                  color: "var(--ink-3)",
                }}
              >
                <span>Nom</span>
                <span>Clé</span>
                <span>Portées</span>
                <span>Dernier usage</span>
                <span className="text-right" />
              </div>
              {keys.length === 0 && (
                <p style={{ padding: "18px 14px", fontSize: 13, color: "var(--ink-2)" }}>
                  Aucune clé API. Créez la première pour vos intégrations.
                </p>
              )}
              {keys.map((k) => {
                const revoked = Boolean(k.revokedAt);
                return (
                  <div
                    key={k.id}
                    className="grid items-center border-b"
                    style={{
                      gridTemplateColumns: KEYS_GRID,
                      minHeight: 46,
                      padding: "0 14px",
                      borderColor: "var(--line-2)",
                      fontSize: 13,
                      opacity: revoked ? 0.55 : 1,
                    }}
                  >
                    <span
                      className="truncate font-medium"
                      style={{ paddingRight: 10, color: "var(--ink)" }}
                    >
                      {k.name}
                    </span>
                    <span className="font-mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
                      {k.prefix}
                    </span>
                    <span>
                      <StatusPill tone={k.scopes.includes("write") ? "open" : "closed"}>
                        {scopesLabel(k.scopes)}
                      </StatusPill>
                    </span>
                    <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      {k.lastUsedAt ? relativeFr(k.lastUsedAt) : "Jamais"}
                    </span>
                    <span className="text-right">
                      {revoked ? (
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Révoquée</span>
                      ) : (
                        <form action={revokeApiKey} className="inline">
                          <input type="hidden" name="keyId" value={k.id} />
                          <button style={LINK_BTN("var(--dang)")}>Révoquer</button>
                        </form>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <CreateKeyForm action={createApiKey} />
        </div>
      ) : (
        <div className="st-rise flex flex-col" style={{ gap: 16 }}>
          {hooks.length === 0 && (
            <div
              className="border"
              style={{
                borderRadius: 10,
                padding: "18px 15px",
                background: "var(--panel)",
                borderColor: "var(--line)",
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              Aucun endpoint webhook. Chaque livraison est signée HMAC-SHA256 avec le secret
              de l'endpoint.
            </div>
          )}

          {hooks.map((hook) => {
            const rows = deliveriesByHook.get(hook.id) ?? [];
            const failed = Boolean(hook.disabledAt) || !hook.active;
            return (
              <div
                key={hook.id}
                className="overflow-hidden border"
                style={{
                  borderRadius: 10,
                  background: "var(--panel)",
                  borderColor: failed ? "var(--dang)" : "var(--line)",
                }}
              >
                <div
                  className="flex flex-wrap items-center border-b"
                  style={{
                    padding: "13px 15px",
                    gap: 12,
                    borderColor: "var(--line-2)",
                    background: failed ? "var(--dang-t)" : "transparent",
                  }}
                >
                  <span
                    className="inline-block shrink-0 rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      background: failed ? "var(--dang)" : "var(--ok)",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                      {hook.url}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      {hook.events.join(" · ")}
                    </div>
                  </div>
                  {failed ? (
                    <StatusPill tone="dang">Désactivé</StatusPill>
                  ) : (
                    <StatusPill tone="ok">Actif</StatusPill>
                  )}
                  <form action={toggleWebhook} className="inline">
                    <input type="hidden" name="webhookId" value={hook.id} />
                    <button style={LINK_BTN("var(--acc-2)")}>
                      {hook.active ? "Désactiver" : "Réactiver"}
                    </button>
                  </form>
                  <form action={deleteWebhook} className="inline">
                    <input type="hidden" name="webhookId" value={hook.id} />
                    <button style={LINK_BTN("var(--dang)")}>Supprimer</button>
                  </form>
                </div>

                {hook.disabledAt && (
                  <div
                    className="border-b"
                    style={{
                      padding: "9px 15px",
                      background: "var(--dang-t)",
                      color: "var(--dang)",
                      fontSize: 12.5,
                      borderColor: "var(--line-2)",
                    }}
                  >
                    Désactivé automatiquement après 7 jours d'échecs consécutifs. Corrigez
                    l'endpoint puis réactivez.
                  </div>
                )}

                <div className="overflow-x-auto">
                  <div style={{ minWidth: 700 }}>
                    <div
                      className="grid items-center border-b font-bold"
                      style={{
                        gridTemplateColumns: DELIVERY_GRID,
                        height: 30,
                        padding: "0 15px",
                        background: "var(--sunk)",
                        borderColor: "var(--line-2)",
                        fontSize: 10.5,
                        color: "var(--ink-3)",
                      }}
                    >
                      <span>Date</span>
                      <span>Événement</span>
                      <span>Statut</span>
                      <span>Latence</span>
                      <span>Réponse</span>
                      <span className="text-right" />
                    </div>
                    {rows.length === 0 && (
                      <p style={{ padding: "14px 15px", fontSize: 12.5, color: "var(--ink-2)" }}>
                        Aucune livraison
                      </p>
                    )}
                    {rows.map((d) => {
                      const ok = d.httpStatus != null && d.httpStatus >= 200 && d.httpStatus < 300;
                      return (
                        <div
                          key={d.id}
                          className="grid items-center border-b"
                          style={{
                            gridTemplateColumns: DELIVERY_GRID,
                            height: 38,
                            padding: "0 15px",
                            borderColor: "var(--line-2)",
                            fontSize: 12.5,
                          }}
                        >
                          <span className="tabular-nums" style={{ color: "var(--ink-3)" }}>
                            {dayTimeFr(d.createdAt)}
                          </span>
                          <span className="font-mono" style={{ fontSize: 11.5, color: "var(--ink)" }}>
                            {d.event}
                          </span>
                          <span
                            className="font-semibold tabular-nums"
                            style={{ color: ok ? "var(--ok)" : "var(--dang)" }}
                          >
                            {d.httpStatus ?? "—"}
                          </span>
                          <span className="tabular-nums" style={{ color: "var(--ink-2)" }}>
                            {d.latencyMs != null ? `${d.latencyMs} ms` : "—"}
                          </span>
                          <span
                            className="truncate"
                            style={{ paddingRight: 10, color: "var(--ink-3)" }}
                          >
                            {d.httpStatus != null
                              ? (HTTP_REASON[d.httpStatus] ?? `HTTP ${d.httpStatus}`)
                              : "Timeout / réseau"}
                          </span>
                          <span className="text-right">
                            <form action={resendDelivery} className="inline">
                              <input type="hidden" name="deliveryId" value={d.id} />
                              <button style={LINK_BTN("var(--acc-2)")}>Renvoyer</button>
                            </form>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Ajout d'un endpoint — bouton en pied, aligné à gauche */}
          <form
            action={createWebhook}
            className="flex flex-wrap items-center self-start"
            style={{ gap: 9 }}
          >
            <input
              name="url"
              required
              placeholder="https://hooks.votre-domaine.fr/ohd/tickets"
              className="min-w-0 border font-mono"
              style={{
                minWidth: 280,
                height: 32,
                padding: "0 11px",
                borderRadius: 6,
                fontSize: 12.5,
                borderColor: "var(--line)",
                background: "var(--bg)",
                color: "var(--ink)",
              }}
            />
            {(["ticket.created", "ticket.updated", "ticket.solved"] as const).map((e) => (
              <label
                key={e}
                className="flex items-center font-mono"
                style={{ gap: 6, fontSize: 11.5, color: "var(--ink-2)" }}
              >
                <input type="checkbox" name="events" value={e} defaultChecked={e === "ticket.created"} />
                {e}
              </label>
            ))}
            <button
              type="submit"
              className="grid place-items-center border font-semibold"
              style={{
                height: 32,
                padding: "0 13px",
                borderRadius: 6,
                fontSize: 13,
                borderColor: "var(--line)",
                background: "var(--panel)",
                color: "var(--ink-2)",
              }}
            >
              + Ajouter un endpoint
            </button>
          </form>
        </div>
      )}
    </PageShell>
  );
}
