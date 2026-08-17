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

/** Bouton de toolbar bordé — h30, padding 0 11px, 12.5px ink-2. */
const TOOL_BTN: React.CSSProperties = {
  height: 30,
  padding: "0 11px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  fontSize: 12.5,
  color: "var(--ink-2)",
};

/** Chip du panneau détail — padding 4px 9px, radius 5, 12px ink-2. */
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
  const { tenant } = await requireAgent();
  const { q, selected: selectedParam, tab: tabParam } = await searchParams;
  const query = q?.trim() || undefined;
  const rows = await listContacts(tenant.id, query);

  const selectedId = rows.find((c) => c.id === selectedParam)?.id ?? rows[0]?.id;
  const detail = selectedId ? await getContact(tenant.id, selectedId) : null;
  const tab: Tab = tabParam === "infos" ? "infos" : tabParam === "activite" ? "activite" : "tickets";

  return (
    <div className="flex h-full" style={{ background: "var(--bg)" }}>
      {/* Colonne table */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex shrink-0 items-center border-b"
          style={{ gap: 8, padding: "10px 16px", borderColor: "var(--line)" }}
        >
          <form className="min-w-0 flex-1" style={{ maxWidth: 280 }}>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Rechercher un contact…"
              className="w-full outline-none"
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 6,
                border: "1px solid var(--line)",
                background: "var(--bg)",
                fontSize: 12.5,
              }}
            />
          </form>
          <span className="flex-1" />
          <button type="button" className="grid place-items-center" style={TOOL_BTN}>
            Importer CSV
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
              Aucun contact{query ? ` pour « ${query} »` : ""}.
            </p>
          ) : (
            <div style={{ minWidth: 880 }}>
              <div
                className="sticky top-0 z-10 grid items-center border-b font-semibold"
                style={{
                  gridTemplateColumns: GRID,
                  height: 32,
                  padding: "0 16px",
                  fontSize: 11,
                  background: "var(--sunk)",
                  borderColor: "var(--line)",
                  color: "var(--ink-3)",
                }}
              >
                <span>Nom</span>
                <span>Email</span>
                <span>Organisation</span>
                <span className="text-right">Tickets</span>
                <span className="text-right">Dernier</span>
              </div>
              {rows.map((c, i) => {
                const active = c.id === selectedId;
                return (
                  <Link
                    key={c.id}
                    href={buildUrl(query, c.id, tab)}
                    className="grid items-center border-b"
                    style={{
                      gridTemplateColumns: GRID,
                      height: 42,
                      padding: "0 16px",
                      borderColor: "var(--line-2)",
                      background: active ? "var(--acc-t)" : "transparent",
                    }}
                  >
                    <span className="flex min-w-0 items-center" style={{ gap: 9 }}>
                      <Avatar name={c.name ?? c.email} size={24} fontSize={9.5} tone={i} />
                      <span className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>
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
                          BLOQUÉ
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
                      BLOQUÉ
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
                  {detail.contact.blocked ? "Débloquer" : "Bloquer"}
                </button>
              </form>
              <DeleteRgpdButton contactId={detail.contact.id} />
            </div>
          </div>

          {/* Onglets */}
          <div
            className="flex border-b"
            style={{ gap: 2, padding: "0 16px", borderColor: "var(--line)" }}
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
              <div className="flex flex-col" style={{ gap: 10 }}>
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
