import { requireAgent } from "@/lib/session";
import { apiKeys, db, webhookDeliveries, webhooks } from "@openhelpdesk/db";
import { and, desc, eq } from "drizzle-orm";
import { relativeFr } from "@/lib/format";
import {
  Card,
  GridHead,
  PageHeader,
  PageShell,
  StatusPill,
} from "@/components/settings-page";
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

function scopesLabel(scopes: string[]): string {
  if (scopes.includes("write")) return "Lecture + écriture";
  if (scopes.includes("ticket:create")) return "Création de ticket";
  return "Lecture seule";
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
        <>
          <CreateKeyForm action={createApiKey} />

          <div
            className="overflow-x-auto rounded-[10px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <div style={{ minWidth: 820 }}>
              <GridHead
                template={KEYS_GRID}
                columns={["Nom", "Clé", "Portées", "Dernier usage", ""]}
              />
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
                    className="grid items-center gap-3 border-t"
                    style={{
                      gridTemplateColumns: KEYS_GRID,
                      padding: "10px 14px",
                      borderColor: "var(--line-2)",
                      opacity: revoked ? 0.55 : 1,
                    }}
                  >
                    <span className="truncate font-medium" style={{ fontSize: 13, color: "var(--ink)" }}>
                      {k.name}
                    </span>
                    <span className="font-mono" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {k.prefix}
                    </span>
                    <span>
                      <StatusPill tone={k.scopes.includes("write") ? "open" : "acc"}>
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
                          <button
                            className="rounded-md border px-2 py-1 font-medium"
                            style={{ fontSize: 12, borderColor: "var(--dang)", color: "var(--dang)" }}
                          >
                            Révoquer
                          </button>
                        </form>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
            La clé complète n'est jamais stockée — seul son empreinte SHA-256 l'est.
          </p>
        </>
      ) : (
        <>
          {/* Création de webhook */}
          <form
            action={createWebhook}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)", padding: 14 }}
          >
            <input
              name="url"
              required
              placeholder="https://hooks.votre-domaine.fr/ohd/tickets"
              className="min-w-0 flex-1 rounded-md border px-2.5 py-1.5 font-mono text-sm"
              style={{
                minWidth: 260,
                borderColor: "var(--line)",
                background: "var(--bg)",
                color: "var(--ink)",
              }}
            />
            {(["ticket.created", "ticket.updated", "ticket.solved"] as const).map((e) => (
              <label key={e} className="flex items-center gap-1.5 font-mono" style={{ fontSize: 12 }}>
                <input type="checkbox" name="events" value={e} defaultChecked={e === "ticket.created"} />
                {e}
              </label>
            ))}
            <button
              type="submit"
              className="rounded-md px-3.5 font-semibold text-white"
              style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
            >
              Ajouter
            </button>
          </form>

          {hooks.length === 0 && (
            <Card>
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Aucun endpoint webhook. Chaque livraison est signée HMAC-SHA256 avec le
                secret de l'endpoint.
              </p>
            </Card>
          )}

          {hooks.map((hook) => {
            const rows = deliveriesByHook.get(hook.id) ?? [];
            return (
              <Card key={hook.id} style={{ padding: 0 }}>
                {hook.disabledAt && (
                  <div
                    className="border-b px-4 py-2"
                    style={{
                      fontSize: 12.5,
                      background: "var(--dang-t)",
                      color: "var(--dang)",
                      borderColor: "var(--dang)",
                    }}
                  >
                    Désactivé automatiquement après 7 jours d'échecs consécutifs. Corrigez
                    l'endpoint puis réactivez.
                  </div>
                )}
                <div
                  className="flex flex-wrap items-center gap-2 border-b"
                  style={{ padding: "12px 14px", borderColor: "var(--line-2)" }}
                >
                  <span className="min-w-0 flex-1 truncate font-mono font-medium" style={{ fontSize: 13, color: "var(--ink)" }}>
                    {hook.url}
                  </span>
                  {hook.events.map((e) => (
                    <span
                      key={e}
                      className="rounded-full border font-mono"
                      style={{
                        fontSize: 10.5,
                        padding: "2px 8px",
                        borderColor: "var(--line)",
                        background: "var(--sunk)",
                        color: "var(--ink-2)",
                      }}
                    >
                      {e}
                    </span>
                  ))}
                  {hook.active ? (
                    <StatusPill tone="ok">Actif</StatusPill>
                  ) : (
                    <StatusPill tone="dang">Désactivé</StatusPill>
                  )}
                  <form action={toggleWebhook} className="inline">
                    <input type="hidden" name="webhookId" value={hook.id} />
                    <button
                      className="rounded-md border px-2 py-1 font-medium"
                      style={{ fontSize: 12, borderColor: "var(--line)", color: "var(--ink)" }}
                    >
                      {hook.active ? "Désactiver" : "Réactiver"}
                    </button>
                  </form>
                  <form action={deleteWebhook} className="inline">
                    <input type="hidden" name="webhookId" value={hook.id} />
                    <button
                      className="rounded-md border px-2 py-1 font-medium"
                      style={{ fontSize: 12, borderColor: "var(--dang)", color: "var(--dang)" }}
                    >
                      Supprimer
                    </button>
                  </form>
                </div>
                <div className="overflow-x-auto">
                  <div style={{ minWidth: 720 }}>
                    <GridHead
                      template={DELIVERY_GRID}
                      columns={["Date", "Événement", "Statut", "Latence", "Réponse", ""]}
                    />
                    {rows.length === 0 && (
                      <p style={{ padding: "14px", fontSize: 13, color: "var(--ink-2)" }}>
                        Aucune livraison
                      </p>
                    )}
                    {rows.map((d) => {
                      const ok = d.httpStatus != null && d.httpStatus >= 200 && d.httpStatus < 300;
                      return (
                        <div
                          key={d.id}
                          className="grid items-center gap-3 border-t"
                          style={{
                            gridTemplateColumns: DELIVERY_GRID,
                            padding: "8px 14px",
                            borderColor: "var(--line-2)",
                          }}
                        >
                          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                            {relativeFr(d.createdAt)}
                          </span>
                          <span className="font-mono" style={{ fontSize: 11.5, color: "var(--ink)" }}>
                            {d.event}
                          </span>
                          <span>
                            {ok ? (
                              <StatusPill tone="ok">{d.httpStatus}</StatusPill>
                            ) : (
                              <StatusPill tone="dang">{d.httpStatus ?? "Échec"}</StatusPill>
                            )}
                          </span>
                          <span
                            className="font-mono tabular-nums"
                            style={{ fontSize: 12, color: "var(--ink-2)" }}
                          >
                            {d.latencyMs != null ? `${d.latencyMs} ms` : "—"}
                          </span>
                          <span className="truncate" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                            {d.httpStatus != null ? `HTTP ${d.httpStatus}` : "Timeout / réseau"}
                          </span>
                          <span className="text-right">
                            <form action={resendDelivery} className="inline">
                              <input type="hidden" name="deliveryId" value={d.id} />
                              <button
                                className="rounded-md border px-2 py-1 font-medium"
                                style={{ fontSize: 12, borderColor: "var(--line)", color: "var(--ink)" }}
                              >
                                Renvoyer
                              </button>
                            </form>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </PageShell>
  );
}
