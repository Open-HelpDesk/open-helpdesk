import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { getContact, listContacts } from "@/lib/directory";
import { relativeFr } from "@/lib/format";
import { Avatar, StatusChip } from "@/components/ticket-bits";
import { toggleContactBlocked } from "./actions";
import { DeleteRgpdButton, MergeContactButton, NewContactButton } from "./contact-drawers";

/**
 * AG-07 — Contacts (design espace-agent) : layout maître-détail — toolbar, table grid
 * `minmax(200px,1fr) 240px 200px 90px 120px`, panneau détail 340 px (sélection via
 * ?selected=, première ligne par défaut) avec chips Fusionner / Bloquer / Supprimer
 * (RGPD) et onglets Tickets / Infos / Activité.
 */

const GRID = "minmax(200px,1fr) 240px 200px 90px 120px";
type Tab = "tickets" | "infos" | "activite";

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
  const { tenant } = await requireAgent();
  const { q, selected: selectedParam, tab: tabParam } = await searchParams;
  const query = q?.trim() || undefined;
  const rows = await listContacts(tenant.id, query);

  const selectedId = rows.find((c) => c.id === selectedParam)?.id ?? rows[0]?.id;
  const detail = selectedId ? await getContact(tenant.id, selectedId) : null;
  const tab: Tab = tabParam === "infos" ? "infos" : tabParam === "activite" ? "activite" : "tickets";

  return (
    <div className="flex h-full">
      {/* Colonne table */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4"
          style={{ height: 48, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <form className="min-w-0">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Rechercher un contact…"
              className="border px-3 text-[13px] outline-none"
              style={{
                height: 30,
                maxWidth: 280,
                width: "100%",
                borderRadius: 6,
                borderColor: "var(--line)",
                background: "var(--bg)",
              }}
            />
          </form>
          <span className="flex-1" />
          <button
            type="button"
            className="rounded-md border px-3 font-medium"
            style={{
              height: 30,
              borderColor: "var(--line)",
              background: "var(--bg)",
              color: "var(--ink-2)",
              fontSize: 13,
            }}
          >
            Importer CSV
          </button>
          <NewContactButton />
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
          {rows.length === 0 ? (
            <p className="py-24 text-center text-sm" style={{ color: "var(--ink-3)" }}>
              Aucun contact{query ? ` pour « ${query} »` : ""}.
            </p>
          ) : (
            <div style={{ minWidth: 860 }}>
              <div
                className="sticky top-0 z-10 grid items-center border-b font-semibold uppercase tracking-wide"
                style={{
                  gridTemplateColumns: GRID,
                  height: 32,
                  fontSize: 11,
                  background: "var(--sunk)",
                  borderColor: "var(--line)",
                  color: "var(--ink-3)",
                }}
              >
                <span className="pl-4">Nom</span>
                <span>Email</span>
                <span>Organisation</span>
                <span className="text-right">Tickets</span>
                <span className="pr-4 text-right">Dernier</span>
              </div>
              {rows.map((c) => {
                const active = c.id === selectedId;
                return (
                  <Link
                    key={c.id}
                    href={buildUrl(query, c.id, tab)}
                    className="grid items-center border-b"
                    style={{
                      gridTemplateColumns: GRID,
                      height: 42,
                      borderColor: "var(--line-2)",
                      background: active ? "var(--acc-t)" : "var(--bg)",
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2 pl-4">
                      <Avatar name={c.name ?? c.email} size={22} />
                      <span className="truncate text-[13px] font-medium">
                        {c.name ?? "—"}
                      </span>
                      {c.blocked && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 font-bold"
                          style={{
                            fontSize: 9.5,
                            background: "var(--dang-t)",
                            color: "var(--dang)",
                            letterSpacing: "0.04em",
                          }}
                        >
                          BLOQUÉ
                        </span>
                      )}
                    </span>
                    <span
                      className="truncate pr-3"
                      style={{ fontSize: 12.5, color: "var(--ink-2)" }}
                    >
                      {c.email}
                    </span>
                    <span className="truncate pr-3" style={{ fontSize: 12.5 }}>
                      {c.organizationName ?? "—"}
                    </span>
                    <span className="text-right tabular-nums" style={{ fontSize: 12.5 }}>
                      {c.ticketCount}
                    </span>
                    <span
                      className="pr-4 text-right tabular-nums"
                      style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                    >
                      {c.lastTicketAt ? relativeFr(new Date(c.lastTicketAt)) : "—"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Panneau détail — 340 px */}
      {detail && (
        <aside
          className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l lg:flex"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <div className="border-b p-4" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-3">
              <Avatar name={detail.contact.name ?? detail.contact.email} size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[14px] font-semibold">
                  {detail.contact.name ?? detail.contact.email}
                  {detail.contact.blocked && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 font-bold"
                      style={{
                        fontSize: 9.5,
                        background: "var(--dang-t)",
                        color: "var(--dang)",
                      }}
                    >
                      BLOQUÉ
                    </span>
                  )}
                </p>
                <p className="truncate" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {detail.contact.email}
                  {detail.orgs[0] ? ` · ${detail.orgs[0].name}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <MergeContactButton
                keepId={detail.contact.id}
                keepLabel={detail.contact.name ?? detail.contact.email}
                candidates={rows
                  .filter((c) => c.id !== detail.contact.id)
                  .map((c) => ({ id: c.id, label: c.name ? `${c.name} — ${c.email}` : c.email }))}
              />
              <form action={toggleContactBlocked}>
                <input type="hidden" name="contactId" value={detail.contact.id} />
                <button
                  type="submit"
                  className="rounded-md border px-2.5 font-medium"
                  style={{
                    height: 28,
                    fontSize: 12,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                    color: "var(--ink-2)",
                  }}
                >
                  {detail.contact.blocked ? "Débloquer" : "Bloquer"}
                </button>
              </form>
              <DeleteRgpdButton contactId={detail.contact.id} />
            </div>
          </div>

          {/* Onglets */}
          <div
            className="flex gap-1 border-b px-3 pt-2"
            style={{ borderColor: "var(--line)" }}
          >
            {(
              [
                ["tickets", "Tickets"],
                ["infos", "Infos"],
                ["activite", "Activité"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <Link
                key={key}
                href={buildUrl(query, detail.contact.id, key)}
                className="rounded-t-md px-3 pb-2 pt-1 text-[13px] font-medium"
                style={
                  tab === key
                    ? {
                        color: "var(--acc)",
                        boxShadow: "inset 0 -2px 0 var(--acc)",
                      }
                    : { color: "var(--ink-3)" }
                }
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex-1 p-4">
            {tab === "tickets" &&
              (detail.tickets.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Aucun ticket.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.tickets.map((t) => (
                    <li key={t.number}>
                      <Link
                        href={`/app/tickets/${t.number}`}
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
                          #{t.number}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                        <StatusChip status={t.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === "infos" && (
              <div className="flex flex-col gap-2.5">
                {[
                  [
                    "Langue",
                    detail.contact.locale === "en"
                      ? "Anglais (en-US)"
                      : "Français (fr-FR)",
                  ],
                  ["Fuseau", tenant.timezone],
                  [
                    "Créé le",
                    detail.contact.createdAt.toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }),
                  ],
                  ["Téléphone", detail.contact.phone ?? "—"],
                  [
                    "Organisations",
                    detail.orgs.length > 0 ? detail.orgs.map((o) => o.name).join(", ") : "—",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr",
                      gap: 8,
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{label}</span>
                    <span className="min-w-0 break-words">{value}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === "activite" &&
              (detail.tickets.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  Aucune activité récente.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.tickets.slice(0, 10).map((t) => (
                    <li
                      key={t.number}
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
                        {relativeFr(t.updatedAt)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        Activité sur{" "}
                        <Link href={`/app/tickets/${t.number}`} className="underline">
                          #{t.number}
                        </Link>{" "}
                        {t.subject}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </aside>
      )}
    </div>
  );
}
