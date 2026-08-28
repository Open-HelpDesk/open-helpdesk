import type { CSSProperties } from "react";
import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { getContact, listContacts } from "@/lib/directory";
import { getT } from "@/i18n/server";
import { Avatar, StatusChip } from "@/components/ticket-bits";
import { card, secondaryAction } from "@/components/v2-page";
import { toggleContactBlocked } from "./actions";
import { DeleteRgpdButton, MergeContactButton, NewContactButton } from "./contact-drawers";

/**
 * AG-07 — Contacts (agent space design): master-detail layout — toolbar, table grid
 * `minmax(200px,1fr) 240px 200px 90px 120px`, 340 px detail panel (selection via
 * ?selected=, first row by default) with Merge / Block / Delete
 * (GDPR) chips and Tickets / Infos / Activity tabs.
 */

const GRID = "minmax(200px,1fr) 240px 200px 90px 120px";
type Tab = "tickets" | "infos" | "activity";

/** Bordered toolbar button — h30, padding 0 11px, 12.5px ink-2. */
const TOOL_BTN: React.CSSProperties = {
  height: 30,
  padding: "0 11px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  fontSize: 12.5,
  color: "var(--ink-2)",
};

/** Detail panel chip — padding 4px 9px, radius 5, 12px ink-2. */
const PANEL_CHIP: React.CSSProperties = {
  padding: "4px 9px",
  border: "1px solid var(--line)",
  borderRadius: 5,
  fontSize: 12,
  color: "var(--ink-2)",
};

function buildUrl(q: string | undefined, selected: string, tab?: Tab) {
  const parts = [
    q ? `q=${encodeURIComponent(q)}` : "",
    `selected=${selected}`,
    tab ? `tab=${tab}` : "",
  ].filter(Boolean);
  return `/app/contacts?${parts.join("&")}`;
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; selected?: string; tab?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { q, selected: selectedParam, tab: tabParam } = await searchParams;
  const query = q?.trim() || undefined;
  const rows = await listContacts(tenant.id, query);

  const selectedId = rows.find((c) => c.id === selectedParam)?.id ?? rows[0]?.id;
  const detail = selectedId ? await getContact(tenant.id, selectedId) : null;
  const tab: Tab = tabParam === "infos" ? "infos" : tabParam === "activity" ? "activity" : "tickets";

  return (
    <div className="flex h-full" style={{ background: "var(--bg)" }}>
      {/* Table column */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* V2 header: the screen says what it is and what it holds, then its
            actions. It replaces a toolbar whose search box sat where a title
            belongs. */}
        <div className="flex flex-wrap items-center" style={{ gap: 14, padding: "20px 22px 14px" }}>
          <div className="flex flex-col" style={{ gap: 4, flex: 1, minWidth: 200 }}>
            <h1
              style={{
                fontFamily: "var(--font-title)",
                fontSize: 23,
                fontWeight: 600,
                letterSpacing: "-.015em",
              }}
            >
              {t("app.shell.contacts")}
            </h1>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
              {t("app.contacts.subtitle", { count: rows.length })}
            </p>
          </div>
          <form className="min-w-0" style={{ maxWidth: 260, flex: 1 }}>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder={t("app.contacts.searchPlaceholder")}
              className="w-full outline-none"
              style={{
                height: 38,
                padding: "0 12px",
                borderRadius: 9,
                border: "1px solid var(--line)",
                background: "var(--panel)",
                fontSize: 13,
              }}
            />
          </form>
          <button type="button" style={secondaryAction}>
            {t("app.contacts.importCsv")}
          </button>
          <NewContactButton />
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p
              className="text-center"
              style={{ padding: "96px 0", fontSize: 13, color: "var(--ink-3)" }}
            >
              {query ? t("app.contacts.emptyQuery", { query }) : t("app.contacts.empty")}
            </p>
          ) : (
            <div style={{ ...card, margin: "0 22px 22px", overflowX: "auto" }}>
              <div
                className="grid items-center border-b"
                style={{
                  gridTemplateColumns: GRID,
                  minWidth: 880,
                  height: 40,
                  padding: "0 18px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".09em",
                  textTransform: "uppercase",
                  background: "var(--canvas)",
                  borderColor: "var(--line)",
                  color: "var(--ink-3)",
                }}
              >
                <span>{t("app.contacts.name")}</span>
                <span>{t("app.contacts.email")}</span>
                <span>{t("app.contacts.organization")}</span>
                <span className="text-right">{t("app.contacts.tickets")}</span>
                <span className="text-right">{t("app.contacts.lastTicket")}</span>
              </div>
              {rows.map((c, i) => {
                const active = c.id === selectedId;
                return (
                  <Link
                    key={c.id}
                    href={buildUrl(query, c.id, tab)}
                    className="ohd-row grid items-center border-b"
                    style={{
                      gridTemplateColumns: GRID,
                      minWidth: 880,
                      minHeight: 54,
                      padding: "0 18px",
                      borderColor: "var(--line-2)",
                      fontSize: 13.5,
                      "--row-bg": active ? "var(--brand-t)" : "transparent",
                    } as CSSProperties}
                  >
                    <span className="flex min-w-0 items-center" style={{ gap: 9 }}>
                      <Avatar name={c.name ?? c.email} size={32} fontSize={11} tone={i} />
                      <span className="truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {c.name ?? "—"}
                      </span>
                      {c.blocked && (
                        <span
                          className="shrink-0"
                          style={{
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            background: "var(--dang-t)",
                            color: "var(--dang)",
                          }}
                        >
                          {t("app.contacts.blockedBadge")}
                        </span>
                      )}
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: 12.5, color: "var(--ink-2)", paddingRight: 12 }}
                    >
                      {c.email}
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: 12.5, color: "var(--ink-2)", paddingRight: 12 }}
                    >
                      {c.organizationName ?? "—"}
                    </span>
                    <span className="text-right tabular-nums" style={{ fontSize: 12.5 }}>
                      {c.ticketCount}
                    </span>
                    <span
                      className="text-right tabular-nums"
                      style={{ fontSize: 12.5, color: "var(--ink-3)" }}
                    >
                      {c.lastTicketAt ? t.fmt.relative(new Date(c.lastTicketAt)) : "—"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Detail panel — 340 px */}
      {detail && (
        <aside
          className="hidden shrink-0 flex-col overflow-y-auto border-l lg:flex"
          style={{ width: 340, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div
            className="flex flex-col border-b"
            style={{ padding: "18px 16px", gap: 11, borderColor: "var(--line)" }}
          >
            <div className="flex items-center" style={{ gap: 11 }}>
              <Avatar
                name={detail.contact.name ?? detail.contact.email}
                size={44}
                fontSize={15}
                tone={0}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="flex items-center gap-2 truncate"
                  style={{ fontSize: 15, fontWeight: 600 }}
                >
                  {detail.contact.name ?? detail.contact.email}
                  {detail.contact.blocked && (
                    <span
                      className="shrink-0"
                      style={{
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background: "var(--dang-t)",
                        color: "var(--dang)",
                      }}
                    >
                      {t("app.contacts.blockedBadge")}
                    </span>
                  )}
                </p>
                <p className="truncate" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {detail.contact.email}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
              <MergeContactButton
                keepId={detail.contact.id}
                keepLabel={detail.contact.name ?? detail.contact.email}
                candidates={rows
                  .filter((c) => c.id !== detail.contact.id)
                  .map((c) => ({ id: c.id, label: c.name ? `${c.name} — ${c.email}` : c.email }))}
              />
              <form action={toggleContactBlocked}>
                <input type="hidden" name="contactId" value={detail.contact.id} />
                <button type="submit" style={PANEL_CHIP}>
                  {detail.contact.blocked
                    ? t("app.contacts.unblock")
                    : t("app.contacts.block")}
                </button>
              </form>
              <DeleteRgpdButton contactId={detail.contact.id} />
            </div>
          </div>

          {/* Tabs */}
          <div
            className="flex border-b"
            style={{ gap: 2, padding: "0 16px", borderColor: "var(--line)" }}
          >
            {(
              [
                ["tickets", t("app.contacts.tickets")],
                ["infos", t("app.contacts.tabInfos")],
                ["activity", t("app.contacts.tabActivity")],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <Link
                className="ohd-hover-edge-ink"
                key={key}
                href={buildUrl(query, detail.contact.id, key)}
                style={{
                  padding: "9px 10px",
                  marginBottom: -1,
                  fontSize: 13,
                  fontWeight: tab === key ? 600 : 450,
                  color: tab === key ? "var(--ink)" : "var(--ink-3)",
                  borderBottom: `2px solid ${tab === key ? "var(--acc)" : "transparent"}`,
                }}
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex-1" style={{ padding: "14px 16px" }}>
            {tab === "tickets" &&
              (detail.tickets.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  {t("app.contacts.noTickets")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.tickets.map((ticket) => (
                    <li key={ticket.number}>
                      <Link
                        href={`/app/tickets/${ticket.number}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5"
                        style={{ fontSize: 12.5 }}
                      >
                        <span
                          className="shrink-0"
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--ink-3)",
                          }}
                        >
                          #{ticket.number}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{ticket.subject}</span>
                        <StatusChip status={ticket.status} t={t} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === "infos" && (
              <div className="flex flex-col" style={{ gap: 10 }}>
                {[
                  [
                    t("app.contacts.infoLocale"),
                    detail.contact.locale === "en"
                      ? t("app.contacts.localeEn")
                      : t("app.contacts.localeFr"),
                  ],
                  [t("app.contacts.infoTimezone"), tenant.timezone],
                  [t("app.contacts.infoCreatedAt"), t.fmt.dateLong(detail.contact.createdAt)],
                  [t("app.contacts.infoPhone"), detail.contact.phone ?? "—"],
                  [
                    t("app.contacts.infoOrganizations"),
                    detail.orgs.length > 0 ? detail.orgs.map((o) => o.name).join(", ") : "—",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr",
                      gap: 8,
                      alignItems: "baseline",
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ color: "var(--ink-3)" }}>{label}</span>
                    <span className="min-w-0 break-words" style={{ fontWeight: 500 }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tab === "activity" &&
              (detail.tickets.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  {t("app.contacts.noActivity")}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.tickets.slice(0, 10).map((ticket) => {
                    const [before, after] = t.parts("app.contacts.activityOn", "ticket", {
                      subject: ticket.subject,
                    });
                    return (
                      <li
                        key={ticket.number}
                        className="flex items-baseline gap-2"
                        style={{ fontSize: 12.5 }}
                      >
                        <span
                          className="shrink-0"
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--ink-3)",
                          }}
                        >
                          {t.fmt.relative(ticket.updatedAt)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {before}
                          <Link href={`/app/tickets/${ticket.number}`} className="underline">
                            #{ticket.number}
                          </Link>
                          {after}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </div>
        </aside>
      )}
    </div>
  );
}
