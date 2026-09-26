/**
 * SD-A5 — people: the directory and one person's profile (spec 19 §6) —
 * title, department, manager, dates, applications with their cost and last
 * use, hardware, request history.
 *
 * "Last used" is shown only when a connector reported it; otherwise it reads
 * "unknown", never "never" (doctrine rule 5: what is displayed is true).
 */
import Link from "next/link";
import type { MessageKey } from "@/i18n/dictionaries/en";
import { getT, type Translate } from "@/i18n/server";
import { requireAgent } from "@/lib/session";
import { grantableApps, peopleDirectory, personProfile, type PersonProfile } from "@/lib/desk/it-data";
import { AppIcon } from "@/components/desk/app-icon";
import { PeopleList } from "./people-list";
import { GrantRevokeButton, PersonActions } from "./person-actions";
import { money } from "./requests-screen";
import { Avatar, Pill, StatePill } from "./ui";
import { card, dateOnly, HW_TONE, sectionLabel } from "./styles";

export async function PeopleScreen({ selectedId }: { selectedId: string | null }) {
  const { tenant } = await requireAgent();
  const t = await getT();
  const people = await peopleDirectory(tenant.id);
  const targetId = selectedId ?? people[0]?.id ?? null;
  const [profile, apps] = await Promise.all([targetId ? personProfile(tenant.id, targetId) : Promise.resolve(null), grantableApps(tenant.id)]);

  return (
    <div className="flex min-h-0 flex-1" data-screen-label="SD-A5">
      <PeopleList people={people} selectedId={targetId} />
      <div className="min-w-0 flex-1 overflow-auto">
        {profile ? (
          <Profile p={profile} t={t} apps={apps} />
        ) : (
          <p style={{ padding: 26, fontSize: 13.5, color: "var(--ink-3)" }}>
            {selectedId ? t("desk.it.people.notFound") : people.length ? t("desk.it.people.pick") : t("desk.it.people.empty")}
          </p>
        )}
      </div>
    </div>
  );
}

/** "3 Feb" this year, "3 February 2024" before: a short date must not hide its year. */
function sinceDate(iso: string, t: Translate): string {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? t.fmt.dateCompact(d) : t.fmt.dateLong(d);
}

function Profile({ p, t, apps }: { p: PersonProfile; t: Translate; apps: Awaited<ReturnType<typeof grantableApps>> }) {
  const monthly = p.grants.reduce((sum, g) => sum + g.monthlyCostCents, 0);
  const leaving = p.leavesOn && p.status !== "departed" ? t("desk.it.people.leaving", { date: t.fmt.dateShort(dateOnly(p.leavesOn)) }) : null;
  const meta = [p.manager ? t("desk.it.people.manager", { name: p.manager.name }) : t("desk.it.people.noManager"), p.startsOn ? t("desk.it.people.joined", { date: t.fmt.dateLong(dateOnly(p.startsOn)) }) : null]
    .filter(Boolean)
    .join(" · ");
  const provName = (k: string) => t(`desk.it.provisioning.${k}` as MessageKey);
  const stats: Array<[MessageKey, string]> = [
    ["desk.it.people.statApps", t.fmt.number(p.grants.length)],
    ["desk.it.people.statCost", t("desk.it.perMonth", { amount: money(monthly, t) })],
    ["desk.it.people.statDevices", t.fmt.number(p.hardware.length)],
  ];
  const cols = "minmax(0,1.4fr) minmax(0,1.1fr) minmax(0,.8fr) minmax(0,.9fr) minmax(0,.9fr) minmax(0,.6fr) auto";

  return (
    <div className="flex flex-col" style={{ padding: "24px 28px 60px", gap: 16, maxWidth: 1000 }}>
      <div className="flex flex-wrap items-center" style={{ ...card, borderRadius: 16, padding: "20px 22px", gap: 16 }}>
        <Avatar name={p.name} size={56} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
            <h2 style={{ fontFamily: "var(--font-title)", fontSize: 22, fontWeight: 600, letterSpacing: "-.015em" }}>{p.name}</h2>
            {leaving && <Pill label={leaving} c="var(--dang)" t="var(--dang-t)" dot={false} size="md" />}
            {p.status === "departed" && <Pill label={t("desk.it.people.departed")} c="var(--ink-3)" t="var(--sunk)" dot={false} size="md" />}
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{[p.title, p.department].filter(Boolean).join(" · ") || p.email}</p>
          <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{meta}</p>
        </div>
        <PersonActions personId={p.id} personName={p.name} apps={apps} heldAppIds={p.grants.map((g) => g.appId)} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t(k)}</div>
            <div style={{ fontFamily: "var(--font-title)", fontSize: 24, fontWeight: 600, letterSpacing: "-.015em", marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      <section style={{ ...card, overflowX: "auto" }}>
        <h3 className="border-b" style={{ ...sectionLabel, padding: "12px 16px", borderColor: "var(--line)", minWidth: 720 }}>{t("desk.it.people.appsTitle")}</h3>
        {p.grants.length === 0 && <p style={{ padding: "14px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.people.appsEmpty")}</p>}
        {p.grants.map((g) => (
          <div key={g.id} className="grid items-center border-b" style={{ gridTemplateColumns: cols, gap: 12, minWidth: 720, padding: "10px 16px", borderColor: "var(--line-2)", fontSize: 13 }}>
            <span className="flex min-w-0 items-center" style={{ gap: 9 }}>
              <AppIcon name={g.appName} iconKey={g.appIconKey} logoUrl={g.appLogoUrl} color={g.appColor} size={28} />
              <span className="truncate" style={{ fontWeight: 600 }}>{g.appName}</span>
            </span>
            <span style={{ color: "var(--ink-2)" }}>
              {g.expiresOn ? `${g.tierName} · ${t("desk.it.people.expires", { date: t.fmt.dateShort(dateOnly(g.expiresOn)) })}` : g.tierName}
            </span>
            <span style={{ color: "var(--ink-3)" }}>{t("desk.it.people.since", { date: sinceDate(g.grantedAt, t) })}</span>
            <span style={{ color: g.lastSeenAt ? "var(--ink-2)" : "var(--ink-3)" }} title={g.lastSeenAt ? undefined : t("desk.it.people.lastUsedHint")}>
              {g.lastSeenAt ? t.fmt.relative(new Date(g.lastSeenAt)) : t("desk.it.people.lastUsedUnknown")}
            </span>
            <span style={{ color: "var(--ink-3)" }}>{provName(g.provisioning)}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{g.monthlyCostCents ? money(g.monthlyCostCents, t) : t("desk.it.free")}</span>
            <GrantRevokeButton grantId={g.id} appName={g.appName} personName={p.name} connector={g.provisioning === "manual" ? null : provName(g.provisioning)} />
          </div>
        ))}
      </section>

      <div className="grid items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <section style={{ ...card, overflow: "hidden" }}>
          <h3 className="border-b" style={{ ...sectionLabel, padding: "12px 16px", borderColor: "var(--line)" }}>{t("desk.it.people.hwTitle")}</h3>
          {p.hardware.length === 0 && <p style={{ padding: "14px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.people.hwEmpty")}</p>}
          {p.hardware.map((h) => (
            <div key={h.id} className="flex items-center border-b" style={{ gap: 10, padding: "11px 16px", borderColor: "var(--line-2)" }}>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.model}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{h.tag}</span> · {h.type}
                </div>
              </div>
              <Pill label={t(`desk.it.hw.status.${h.status}` as MessageKey)} c={HW_TONE[h.status].c} t={HW_TONE[h.status].t} dot={false} />
            </div>
          ))}
        </section>
        <section style={{ ...card, overflow: "hidden" }}>
          <h3 className="border-b" style={{ ...sectionLabel, padding: "12px 16px", borderColor: "var(--line)" }}>{t("desk.it.people.reqTitle")}</h3>
          {p.requests.length === 0 && <p style={{ padding: "14px 16px", fontSize: 13, color: "var(--ink-3)" }}>{t("desk.it.people.reqEmpty")}</p>}
          {p.requests.map((r) => (
            <Link key={r.id} href={`/app/desk/requests/${r.id}`} className="ohd-row flex items-center border-b" style={{ gap: 10, padding: "11px 16px", borderColor: "var(--line-2)" }}>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{t("desk.it.queue.rowTitle", { app: r.appName, tier: r.tierName })}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{t("desk.it.ref", { number: String(r.ticketNumber) })}</span> · {t.fmt.messageTime(new Date(r.createdAt))}
                </div>
              </div>
              <StatePill state={r.state} />
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
