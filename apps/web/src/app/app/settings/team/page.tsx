import { requireAgent } from "@/lib/session";
import { businessHours, db, teamMembers, teams, users } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { relativeFr } from "@/lib/format";
import { Avatar } from "@/components/ticket-bits";
import { entitlementsFor, seatQuota } from "@/lib/entitlements";
import {
  Card,
  Field,
  Gauge,
  GridHead,
  PageHeader,
  PageShell,
  Select,
  StatusPill,
  TextInput,
} from "@/components/settings-page";
import { AutoSubmitSelect, Drawer } from "@/components/settings-overlays";
import {
  createTeam,
  deleteTeam,
  inviteAgents,
  resendInvite,
  toggleAgentActive,
  updateAgentRole,
  updateTeam,
} from "./actions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  agent: "Agent",
  viewer: "Viewer",
};

const AGENT_GRID = "minmax(190px,1.4fr) 150px 180px 130px 110px 80px";

/**
 * ST-02 — Agents, équipes & rôles (1100 px) : carte sièges avec jauge, invitation
 * multi-emails, table des agents (rôle inline), onglet Équipes fonctionnel
 * (cartes + drawer CRUD teams/teamMembers).
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { tenant, agent: me } = await requireAgent();
  const { tab, saved } = await searchParams;
  const activeTab = tab === "teams" ? "teams" : "agents";

  const [agents, teamRows, memberRows, calendars] = await Promise.all([
    db.select().from(users).where(eq(users.tenantId, tenant.id)).orderBy(asc(users.name)),
    db.select().from(teams).where(eq(teams.tenantId, tenant.id)).orderBy(asc(teams.name)),
    db.select().from(teamMembers).where(eq(teamMembers.tenantId, tenant.id)),
    db
      .select({ id: businessHours.id, name: businessHours.name })
      .from(businessHours)
      .where(eq(businessHours.tenantId, tenant.id))
      .orderBy(asc(businessHours.name)),
  ]);

  const seats = agents.filter((a) => a.status === "active" && a.role !== "viewer").length;
  const quota = seatQuota(entitlementsFor(tenant.plan));

  const teamsByUser = new Map<string, string[]>();
  const usersByTeam = new Map<string, string[]>();
  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));
  for (const m of memberRows) {
    teamsByUser.set(m.userId, [
      ...(teamsByUser.get(m.userId) ?? []),
      teamNameById.get(m.teamId) ?? "",
    ]);
    usersByTeam.set(m.teamId, [...(usersByTeam.get(m.teamId) ?? []), m.userId]);
  }
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const calendarNameById = new Map(calendars.map((c) => [c.id, c.name]));
  const activeAgents = agents.filter((a) => a.status !== "disabled");

  const tabs = [
    { label: "Agents", href: "/app/settings/team", active: activeTab === "agents" },
    { label: "Équipes", href: "/app/settings/team?tab=teams", active: activeTab === "teams" },
  ];

  return (
    <PageShell maxWidth={1100}>
      <PageHeader
        code="ST-02"
        title="Agents, équipes & rôles"
        subtitle="Gérez les accès, les rôles et la répartition des agents en équipes."
        tabs={tabs}
      />

      {saved === "1" && (
        <p style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</p>
      )}

      {activeTab === "agents" ? (
        <>
          {/* Carte sièges */}
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold" style={{ fontSize: 14, color: "var(--ink)" }}>
                  {seats} / {quota} sièges utilisés
                </p>
                <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  Les rôles Viewer sont gratuits et illimités.
                </p>
              </div>
              <Gauge value={seats} max={quota} width={160} />
            </div>
          </Card>

          {/* Barre d'invitation */}
          <form
            action={inviteAgents}
            className="flex flex-wrap items-center gap-2 rounded-[10px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)", padding: 14 }}
          >
            <TextInput
              name="emails"
              required
              placeholder="email@entreprise.fr, autre@entreprise.fr"
              className="min-w-0 flex-1"
              style={{ minWidth: 240 }}
            />
            <Select name="role" defaultValue="agent" style={{ width: 140 }}>
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
              <option value="viewer">Viewer</option>
            </Select>
            <button
              type="submit"
              className="rounded-md px-3.5 font-semibold text-white"
              style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
            >
              Inviter
            </button>
          </form>

          {/* Table des agents */}
          <div
            className="overflow-x-auto rounded-[10px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <div style={{ minWidth: 880 }}>
              <GridHead
                template={AGENT_GRID}
                columns={["Agent", "Rôle", "Équipes", "Dernier accès", "Statut", ""]}
              />
              {agents.map((a) => {
                const isSelf = a.id === me.id;
                const canManage = !isSelf && (me.role === "owner" || a.role !== "owner");
                const teamNames = (teamsByUser.get(a.id) ?? []).filter(Boolean);
                return (
                  <div
                    key={a.id}
                    className="grid items-center gap-3 border-t"
                    style={{
                      gridTemplateColumns: AGENT_GRID,
                      padding: "10px 14px",
                      borderColor: "var(--line-2)",
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={a.name} size={26} />
                      <span className="min-w-0">
                        <span
                          className="block truncate font-medium"
                          style={{ fontSize: 13, color: "var(--ink)" }}
                        >
                          {a.name}
                          {isSelf && (
                            <span style={{ color: "var(--ink-3)", fontWeight: 400 }}> (vous)</span>
                          )}
                        </span>
                        <span
                          className="block truncate"
                          style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                        >
                          {a.email}
                        </span>
                      </span>
                    </span>
                    <span>
                      {canManage ? (
                        <form action={updateAgentRole}>
                          <input type="hidden" name="userId" value={a.id} />
                          <AutoSubmitSelect
                            name="role"
                            defaultValue={a.role}
                            options={[
                              ...(me.role === "owner" ? [{ value: "owner", label: "Owner" }] : []),
                              { value: "admin", label: "Admin" },
                              { value: "agent", label: "Agent" },
                              { value: "viewer", label: "Viewer" },
                            ]}
                            style={{ width: 110 }}
                          />
                        </form>
                      ) : (
                        <span style={{ fontSize: 13, color: "var(--ink)" }}>
                          {ROLE_LABELS[a.role]}
                        </span>
                      )}
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: 12.5, color: teamNames.length ? "var(--ink)" : "var(--ink-3)" }}
                    >
                      {teamNames.length > 0 ? teamNames.join(", ") : "—"}
                    </span>
                    <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      {a.lastSeenAt ? relativeFr(a.lastSeenAt) : "—"}
                    </span>
                    <span>
                      {a.status === "active" ? (
                        <StatusPill tone="ok">Actif</StatusPill>
                      ) : a.status === "invited" ? (
                        <StatusPill tone="wait">Invité</StatusPill>
                      ) : (
                        <StatusPill tone="closed">Désactivé</StatusPill>
                      )}
                    </span>
                    <span className="text-right">
                      {canManage &&
                        (a.status === "invited" ? (
                          <form action={resendInvite} className="inline">
                            <input type="hidden" name="userId" value={a.id} />
                            <button
                              className="rounded-md border px-2 py-1 font-medium"
                              style={{
                                fontSize: 12,
                                borderColor: "var(--line)",
                                color: "var(--ink)",
                              }}
                            >
                              Renvoyer
                            </button>
                          </form>
                        ) : (
                          <form action={toggleAgentActive} className="inline">
                            <input type="hidden" name="userId" value={a.id} />
                            <button
                              className="rounded-md border px-2 py-1 font-medium"
                              style={
                                a.status === "disabled"
                                  ? { fontSize: 12, borderColor: "var(--line)", color: "var(--ink)" }
                                  : { fontSize: 12, borderColor: "var(--dang)", color: "var(--dang)" }
                              }
                            >
                              {a.status === "disabled" ? "Réactiver" : "Désactiver"}
                            </button>
                          </form>
                        ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Désactiver un agent repasse ses tickets ouverts en non-assignés.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center">
            <span className="flex-1" />
            <Drawer
              title="Nouvelle équipe"
              trigger={<>Nouvelle équipe</>}
              triggerClassName="rounded-md px-3.5 font-semibold text-white"
              triggerStyle={{ height: 32, fontSize: 13, background: "var(--acc)" }}
            >
              <TeamForm
                action={createTeam}
                calendars={calendars}
                agents={activeAgents}
                memberIds={[]}
              />
            </Drawer>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {teamRows.length === 0 && (
              <Card>
                <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  Aucune équipe. Créez la première pour répartir les tickets.
                </p>
              </Card>
            )}
            {teamRows.map((t) => {
              const memberIds = usersByTeam.get(t.id) ?? [];
              const members = memberIds
                .map((id) => agentById.get(id))
                .filter((a): a is NonNullable<typeof a> => Boolean(a));
              const calName = t.businessHoursId
                ? (calendarNameById.get(t.businessHoursId) ?? "—")
                : "Astreinte 24/7";
              return (
                <Card key={t.id}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold" style={{ fontSize: 14, color: "var(--ink)" }}>
                        {t.name}
                      </p>
                      <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                        {members.length} membre{members.length > 1 ? "s" : ""} · {calName}
                      </p>
                    </div>
                    <Drawer
                      title={`Modifier « ${t.name} »`}
                      trigger={<>Modifier</>}
                      triggerClassName="rounded-md border px-2 py-1 font-medium"
                      triggerStyle={{
                        fontSize: 12,
                        borderColor: "var(--line)",
                        color: "var(--ink)",
                        background: "var(--panel)",
                      }}
                    >
                      <TeamForm
                        action={updateTeam}
                        teamId={t.id}
                        name={t.name}
                        businessHoursId={t.businessHoursId}
                        calendars={calendars}
                        agents={activeAgents}
                        memberIds={memberIds}
                      />
                    </Drawer>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {members.length === 0 && (
                      <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Aucun membre.</span>
                    )}
                    {members.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 rounded-full border"
                        style={{
                          fontSize: 12,
                          padding: "2px 8px 2px 3px",
                          borderColor: "var(--line)",
                          background: "var(--sunk)",
                          color: "var(--ink)",
                        }}
                      >
                        <Avatar name={m.name} size={18} />
                        {m.name}
                      </span>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}

/** Formulaire d'équipe (drawer) — création et édition partagent le même corps. */
function TeamForm({
  action,
  teamId,
  name,
  businessHoursId,
  calendars,
  agents,
  memberIds,
}: {
  action: (formData: FormData) => Promise<void>;
  teamId?: string;
  name?: string;
  businessHoursId?: string | null;
  calendars: { id: string; name: string }[];
  agents: { id: string; name: string; email: string }[];
  memberIds: string[];
}) {
  return (
    <form action={action} className="flex h-full flex-col gap-4">
      {teamId && <input type="hidden" name="teamId" value={teamId} />}
      <Field label="Nom de l'équipe">
        <TextInput name="name" required defaultValue={name ?? ""} placeholder="Support N1" />
      </Field>
      <Field label="Horaires ouvrés" hint="Les calendriers se gèrent dans SLA & horaires ouvrés.">
        <Select name="businessHoursId" defaultValue={businessHoursId ?? ""}>
          <option value="">Astreinte 24/7</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          Membres
        </span>
        <div
          className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border p-2"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        >
          {agents.map((a) => (
            <label key={a.id} className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                name="memberIds"
                value={a.id}
                defaultChecked={memberIds.includes(a.id)}
              />
              <span style={{ color: "var(--ink)" }}>{a.name}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{a.email}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        {teamId && (
          <button
            type="submit"
            formAction={deleteTeam}
            className="rounded-md border px-3 font-medium"
            style={{
              height: 32,
              fontSize: 13,
              borderColor: "var(--dang)",
              color: "var(--dang)",
              background: "var(--panel)",
            }}
          >
            Supprimer
          </button>
        )}
        <span className="flex-1" />
        <button
          type="submit"
          className="rounded-md px-3.5 font-semibold text-white"
          style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
        >
          Enregistrer
        </button>
      </div>
    </form>
  );
}
