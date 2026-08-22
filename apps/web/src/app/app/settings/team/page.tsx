import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { businessHours, db, teamMembers, teams, users } from "@openhelpdesk/db";
import { asc, eq, sql } from "drizzle-orm";
import { initialsOf } from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import { Avatar } from "@/components/ticket-bits";
import { seatLimitFor } from "@/lib/entitlements";
import {
  Field,
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

const AGENT_GRID = "minmax(190px,1.4fr) 150px 180px 130px 110px 80px";
/** Avatar tone rotation (open, new, acc, wait, pause) — by row index. */
const AV_TONES = [
  ["var(--open-t)", "var(--open)"],
  ["var(--new-t)", "var(--new)"],
  ["var(--acc-t)", "var(--acc)"],
  ["var(--wait-t)", "var(--wait)"],
  ["var(--pause-t)", "var(--pause)"],
] as const;

/**
 * ST-02 — Agents, teams & roles (1100 px): seats card with a 160×7 gauge and an
 * action button, agents table (inline role), invitation bar below the table,
 * Teams tab (header/body cards + teams/teamMembers CRUD drawer).
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const t = await getT();
  const { tenant, agent: me } = await requireAgent();
  const ROLE_LABELS: Record<string, string> = {
    owner: t("app.settings.workspace.roleOwner"),
    admin: t("app.settings.workspace.roleAdmin"),
    agent: t("app.settings.workspace.roleAgent"),
    viewer: t("app.settings.workspace.roleViewer"),
  };
  const { tab, saved, error } = await searchParams;
  const activeTab = tab === "teams" ? "teams" : "agents";

  const [agents, teamRows, memberRows, calendars] = await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenant.id))
      // Design order: most recent activity first, invited users (no access) last.
      .orderBy(sql`${users.lastSeenAt} desc nulls last`, asc(users.name)),
    db.select().from(teams).where(eq(teams.tenantId, tenant.id)).orderBy(asc(teams.name)),
    db.select().from(teamMembers).where(eq(teamMembers.tenantId, tenant.id)),
    db
      .select({ id: businessHours.id, name: businessHours.name })
      .from(businessHours)
      .where(eq(businessHours.tenantId, tenant.id))
      .orderBy(asc(businessHours.name)),
  ]);

  // An invitation reserves its seat: otherwise the quota would be exceeded as soon
  // as it is accepted. Self-hosted has a null limit: no gauge, no cap.
  const seats = agents.filter((a) => a.status !== "disabled" && a.role !== "viewer").length;
  const quota = seatLimitFor(tenant);
  const seatFull = quota !== null && seats >= quota;
  const seatPct = quota !== null && quota > 0 ? Math.min(100, Math.round((seats / quota) * 100)) : 0;

  const teamsByUser = new Map<string, string[]>();
  const usersByTeam = new Map<string, string[]>();
  const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
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
    {
      label: t("app.settings.workspace.tabAgents"),
      href: "/app/settings/team",
      active: activeTab === "agents",
    },
    {
      label: t("app.settings.workspace.tabTeams"),
      href: "/app/settings/team?tab=teams",
      active: activeTab === "teams",
    },
  ];

  return (
    <PageShell maxWidth={1100}>
      <PageHeader
        title={t("app.settings.workspace.teamTitle")}
        subtitle={t("app.settings.workspace.teamSubtitle")}
        tabs={tabs}
      />

      {saved === "1" && (
        <p style={{ fontSize: 12.5, color: "var(--ok)" }}>{t("app.settings.workspace.saved")}</p>
      )}
      {error === "seats" && quota !== null && (
        <p style={{ fontSize: 12.5, color: "var(--dang)" }}>
          {t("app.settings.workspace.seatLimitReached", { quota })}
        </p>
      )}

      {activeTab === "agents" ? (
        <div className="st-rise flex flex-col" style={{ gap: 16 }}>
          {/* Seats card — 160×7, --wait border/background when the limit is reached.
              Hidden in self-hosted: no quota, and its CTA leads to ST-11. */}
          {quota !== null && (
          <div
            className="flex flex-wrap items-center rounded-[10px] border"
            style={{
              padding: "13px 15px",
              gap: 14,
              borderColor: seatFull ? "var(--wait)" : "var(--line)",
              background: seatFull ? "var(--wait-t)" : "var(--panel)",
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold" style={{ fontSize: 13.5, color: "var(--ink)" }}>
                {seatFull
                  ? t("app.settings.workspace.seatsUsedFull", { count: seats, quota })
                  : t("app.settings.workspace.seatsUsed", { count: seats, quota })}
              </p>
              <p style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                {seatFull
                  ? t("app.settings.workspace.seatsAddHint")
                  : t("app.settings.workspace.seatsFreeHint")}
              </p>
            </div>
            <span
              className="overflow-hidden"
              style={{ width: 160, height: 7, borderRadius: 4, background: "var(--sunk)" }}
            >
              <span
                className="block h-full"
                style={{
                  width: `${seatPct}%`,
                  borderRadius: 4,
                  background: seatFull ? "var(--wait)" : "var(--acc)",
                }}
              />
            </span>
            <Link
              href="/app/settings/billing"
              className="ohd-hover-edge-ink inline-flex items-center justify-center rounded-md border font-semibold"
              style={{
                height: 32,
                padding: "0 13px",
                fontSize: 13,
                borderColor: seatFull ? "var(--acc)" : "var(--line)",
                background: seatFull ? "var(--acc)" : "var(--panel)",
                color: seatFull ? "#fff" : "var(--ink-2)",
              }}
            >
              {seatFull
                ? t("app.settings.workspace.seatsAddAction")
                : t("app.settings.workspace.seatsManage")}
            </Link>
          </div>
          )}

          {/* Agents table */}
          <div
            className="overflow-x-auto rounded-[10px] border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <div
              className="grid items-center border-b"
              style={{
                gridTemplateColumns: AGENT_GRID,
                minWidth: 880,
                padding: "0 14px",
                height: 34,
                background: "var(--sunk)",
                borderColor: "var(--line)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: "var(--ink-3)",
              }}
            >
              <span>{t("app.settings.workspace.roleAgent")}</span>
              <span>{t("app.settings.workspace.colRole")}</span>
              <span>{t("app.settings.workspace.tabTeams")}</span>
              <span>{t("app.settings.workspace.colLastSeen")}</span>
              <span>{t("app.settings.workspace.colStatus")}</span>
              <span className="text-right" />
            </div>
            {agents.map((a, i) => {
              const isSelf = a.id === me.id;
              const canManage = !isSelf && (me.role === "owner" || a.role !== "owner");
              const teamNames = (teamsByUser.get(a.id) ?? []).filter(Boolean);
              return (
                <div
                  key={a.id}
                  className="grid items-center border-b"
                  style={{
                    gridTemplateColumns: AGENT_GRID,
                    minWidth: 880,
                    padding: "0 14px",
                    minHeight: 46,
                    borderColor: "var(--line-2)",
                    fontSize: 13,
                  }}
                >
                  <span
                    className="flex min-w-0 items-center"
                    style={{ gap: 9, paddingRight: 10 }}
                  >
                    <Avatar name={a.name} size={24} tone={i} fontSize={9.5} />
                    <span className="min-w-0">
                      <span className="block truncate" style={{ color: "var(--ink)" }}>
                        {a.name}
                        {isSelf && (
                          <span style={{ color: "var(--ink-3)" }}>
                            {" "}
                            {t("app.settings.workspace.selfSuffix")}
                          </span>
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
                  <span style={{ paddingRight: 10 }}>
                    {canManage ? (
                      <form action={updateAgentRole}>
                        <input type="hidden" name="userId" value={a.id} />
                        <AutoSubmitSelect
                          name="role"
                          defaultValue={a.role}
                          options={[
                            ...(me.role === "owner"
                              ? [{ value: "owner", label: t("app.settings.workspace.roleOwner") }]
                              : []),
                            { value: "admin", label: t("app.settings.workspace.roleAdmin") },
                            { value: "agent", label: t("app.settings.workspace.roleAgent") },
                            { value: "viewer", label: t("app.settings.workspace.roleViewer") },
                          ]}
                          style={{ width: "100%", height: 28, padding: "0 9px", borderRadius: 6 }}
                        />
                      </form>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--ink)" }}>
                        {ROLE_LABELS[a.role]}
                      </span>
                    )}
                  </span>
                  <span
                    className="truncate"
                    style={{ fontSize: 12.5, color: "var(--ink-2)", paddingRight: 10 }}
                  >
                    {teamNames.length > 0 ? teamNames.join(", ") : "—"}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {a.lastSeenAt ? t.fmt.relative(a.lastSeenAt) : "—"}
                  </span>
                  <span>
                    {a.status === "active" ? (
                      <StatusPill tone="ok">{t("app.settings.workspace.statusActive")}</StatusPill>
                    ) : a.status === "invited" ? (
                      <StatusPill tone="wait">
                        {t("app.settings.workspace.statusInvited")}
                      </StatusPill>
                    ) : (
                      <StatusPill tone="closed">
                        {t("app.settings.workspace.statusDisabled")}
                      </StatusPill>
                    )}
                  </span>
                  <span className="text-right">
                    {canManage &&
                      (a.status === "invited" ? (
                        <form action={resendInvite} className="inline">
                          <input type="hidden" name="userId" value={a.id} />
                          <button style={{ fontSize: 12, color: "var(--acc-2)" }}>
                            {t("app.settings.workspace.resend")}
                          </button>
                        </form>
                      ) : (
                        <form action={toggleAgentActive} className="inline">
                          <input type="hidden" name="userId" value={a.id} />
                          <button
                            style={{
                              fontSize: 12,
                              color:
                                a.status === "disabled" ? "var(--acc-2)" : "var(--ink-3)",
                            }}
                          >
                            {a.status === "disabled"
                              ? t("app.settings.workspace.reactivate")
                              : t("app.settings.workspace.deactivate")}
                          </button>
                        </form>
                      ))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Invitation bar — below the table (design order) */}
          <form action={inviteAgents} className="flex flex-wrap items-center" style={{ gap: 9 }}>
            <TextInput
              name="emails"
              required
              placeholder={t("app.settings.workspace.invitePlaceholder")}
              className="min-w-0 flex-1"
              style={{ minWidth: 240, minHeight: 36, padding: "7px 11px", fontSize: 13.5 }}
            />
            <Select
              name="role"
              defaultValue="agent"
              style={{ width: 140, minHeight: 36, padding: "7px 11px", fontSize: 13.5 }}
            >
              <option value="admin">{t("app.settings.workspace.roleAdmin")}</option>
              <option value="agent">{t("app.settings.workspace.roleAgent")}</option>
              <option value="viewer">{t("app.settings.workspace.roleViewer")}</option>
            </Select>
            <button
              type="submit"
              className="rounded-md font-semibold text-white"
              style={{ height: 36, padding: "0 16px", fontSize: 13, background: "var(--acc)" }}
            >
              {t("app.settings.workspace.inviteAction")}
            </button>
          </form>

          <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {t("app.settings.workspace.deactivateHint")}
          </p>
        </div>
      ) : (
        <div className="st-rise flex flex-col" style={{ gap: 14 }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 13 }}
          >
            {teamRows.length === 0 && (
              <div
                className="rounded-[10px] border"
                style={{ background: "var(--panel)", borderColor: "var(--line)", padding: 15 }}
              >
                <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {t("app.settings.workspace.teamsEmpty")}
                </p>
              </div>
            )}
            {teamRows.map((team) => {
              const memberIds = usersByTeam.get(team.id) ?? [];
              const members = memberIds
                .map((id) => agentById.get(id))
                .filter((a): a is NonNullable<typeof a> => Boolean(a));
              const calName = team.businessHoursId
                ? (calendarNameById.get(team.businessHoursId) ?? "—")
                : t("app.settings.workspace.onCall");
              return (
                <div
                  key={team.id}
                  className="overflow-hidden rounded-[10px] border"
                  style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                >
                  <div
                    className="flex items-center border-b"
                    style={{ padding: "14px 15px", gap: 10, borderColor: "var(--line-2)" }}
                  >
                    <p
                      className="min-w-0 flex-1 truncate font-semibold"
                      style={{ fontSize: 14.5, color: "var(--ink)" }}
                    >
                      {team.name}
                    </p>
                    <Drawer
                      title={t("app.settings.workspace.teamEditTitle")}
                      trigger={<>{t("app.settings.workspace.teamEditAction")}</>}
                      triggerClassName="inline-flex items-center justify-center rounded-md border font-semibold"
                      triggerStyle={{
                        height: 28,
                        padding: "0 11px",
                        fontSize: 12.5,
                        borderColor: "var(--line)",
                        color: "var(--ink-2)",
                        background: "var(--panel)",
                      }}
                    >
                      <TeamForm
                        t={t}
                        action={updateTeam}
                        teamId={team.id}
                        name={team.name}
                        businessHoursId={team.businessHoursId}
                        calendars={calendars}
                        agents={activeAgents}
                        memberIds={memberIds}
                      />
                    </Drawer>
                  </div>
                  <div
                    className="flex flex-col"
                    style={{ padding: "13px 15px", gap: 9 }}
                  >
                    <div className="flex">
                      {members.length === 0 && (
                        <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                          {t("app.settings.workspace.teamNoMembers")}
                        </span>
                      )}
                      {members.map((m, j) => {
                        const [bg, ink] = AV_TONES[j % AV_TONES.length]!;
                        return (
                          <span
                            key={m.id}
                            title={m.name}
                            className="flex items-center justify-center rounded-full font-bold"
                            style={{
                              width: 26,
                              height: 26,
                              flex: "none",
                              marginLeft: j ? -7 : 0,
                              border: "2px solid var(--panel)",
                              background: bg,
                              color: ink,
                              fontSize: 9,
                            }}
                          >
                            {initialsOf(m.name)}
                          </span>
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                      {t("app.settings.workspace.teamMembersLine", {
                        count: members.length,
                        calendar: calName,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <Drawer
            title={t("app.settings.workspace.teamEditTitle")}
            trigger={<>{t("app.settings.workspace.teamCreate")}</>}
            triggerClassName="inline-flex items-center justify-center self-start rounded-md border font-semibold"
            triggerStyle={{
              height: 32,
              padding: "0 13px",
              fontSize: 13,
              borderColor: "var(--line)",
              background: "var(--panel)",
              color: "var(--ink-2)",
            }}
          >
            <TeamForm
              t={t}
              action={createTeam}
              calendars={calendars}
              agents={activeAgents}
              memberIds={[]}
            />
          </Drawer>
        </div>
      )}
    </PageShell>
  );
}

/** Team form (420 px drawer) — creation and editing share the same body. */
function TeamForm({
  action,
  t,
  teamId,
  name,
  businessHoursId,
  calendars,
  agents,
  memberIds,
}: {
  action: (formData: FormData) => Promise<void>;
  t: Translate;
  teamId?: string;
  name?: string;
  businessHoursId?: string | null;
  calendars: { id: string; name: string }[];
  agents: { id: string; name: string; email: string }[];
  memberIds: string[];
}) {
  return (
    <form action={action} className="flex h-full flex-col" style={{ gap: 14 }}>
      {teamId && <input type="hidden" name="teamId" value={teamId} />}
      <Field label={t("app.settings.workspace.teamNameLabel")}>
        <TextInput
          name="name"
          required
          defaultValue={name ?? ""}
          placeholder={t("app.settings.workspace.teamNamePlaceholder")}
          style={{ minHeight: 36, padding: "7px 11px", fontSize: 13.5 }}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {t("app.settings.workspace.teamMembersLabel")}
        </span>
        <div
          className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border"
          style={{ borderColor: "var(--line)", background: "var(--bg)", padding: "10px 11px" }}
        >
          {agents.map((a) => (
            <label key={a.id} className="flex items-center gap-2" style={{ fontSize: 13.5 }}>
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
      <Field
        label={t("app.settings.workspace.teamHoursLabel")}
        hint={t("app.settings.workspace.teamHoursHint")}
      >
        <Select
          name="businessHoursId"
          defaultValue={businessHoursId ?? ""}
          style={{ minHeight: 36, padding: "7px 11px", fontSize: 13.5 }}
        >
          <option value="">{t("app.settings.workspace.onCall")}</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div
        className="mt-auto flex items-center gap-2 border-t pt-3"
        style={{ borderColor: "var(--line)" }}
      >
        {teamId && (
          <button
            type="submit"
            formAction={deleteTeam}
            className="ohd-hover-edge-ink rounded-md border font-medium"
            style={{
              height: 34,
              padding: "0 14px",
              fontSize: 13,
              borderColor: "var(--dang)",
              color: "var(--dang)",
              background: "var(--panel)",
            }}
          >
            {t("app.settings.workspace.delete")}
          </button>
        )}
        <span className="flex-1" />
        <button
          type="submit"
          className="rounded-md font-semibold text-white"
          style={{ height: 34, padding: "0 16px", fontSize: 13, background: "var(--acc)" }}
        >
          {t("app.settings.workspace.save")}
        </button>
      </div>
    </form>
  );
}
