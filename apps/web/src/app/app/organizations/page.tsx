import Link from "next/link";
import { X } from "lucide-react";
import { requireAgent } from "@/lib/session";
import { getOrganization, listOrganizations } from "@/lib/directory";
import { relativeFr } from "@/lib/format";
import { Avatar, StatusChip } from "@/components/ticket-bits";
import {
  addOrgDomain,
  removeOrgDomain,
  toggleOrgSharedTickets,
  updateOrgNotes,
} from "./actions";

/**
 * AG-08 — Organisations (design espace-agent) : layout maître-détail — table grid
 * `minmax(180px,1fr) 260px 110px 120px` (tickets ouverts en rouge si > 8), panneau
 * détail 340 px avec domaines en chips ✕/+, toggle « Partage des demandes », onglets
 * Contacts / Tickets / Notes.
 */

const GRID = "minmax(180px,1fr) 260px 110px 120px";
type Tab = "contacts" | "tickets" | "notes";

function buildUrl(q: string | undefined, selected: string, tab?: Tab) {
  const parts = [
    q ? `q=${encodeURIComponent(q)}` : "",
    `selected=${selected}`,
    tab ? `tab=${tab}` : "",
  ].filter(Boolean);
  return `/app/organizations?${parts.join("&")}`;
}

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; selected?: string; tab?: string; error?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { q, selected: selectedParam, tab: tabParam, error } = await searchParams;
  const query = q?.trim() || undefined;
  const rows = await listOrganizations(tenant.id, query);

  const selectedId = rows.find((o) => o.id === selectedParam)?.id ?? rows[0]?.id;
  const detail = selectedId ? await getOrganization(tenant.id, selectedId) : null;
  const tab: Tab = tabParam === "tickets" ? "tickets" : tabParam === "notes" ? "notes" : "contacts";
  const openCount = rows.find((o) => o.id === selectedId)?.openTickets ?? 0;

  return (
    <div className="flex h-full">
      {/* Colonne table */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4"
          style={{ height: 48, background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <form className="min-w-0">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Rechercher une organisation…"
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
        </div>

        <div className="min-h-0 flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
          {rows.length === 0 ? (
            <p className="py-24 text-center text-sm" style={{ color: "var(--ink-3)" }}>
              Aucune organisation{query ? ` pour « ${query} »` : ""}.
            </p>
          ) : (
            <div style={{ minWidth: 680 }}>
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
                <span className="pl-4">Organisation</span>
                <span>Domaines</span>
                <span className="text-right">Contacts</span>
                <span className="pr-4 text-right">Tickets ouverts</span>
              </div>
              {rows.map((o) => {
                const active = o.id === selectedId;
                return (
                  <Link
                    key={o.id}
                    href={buildUrl(query, o.id, tab)}
                    className="grid items-center border-b"
                    style={{
                      gridTemplateColumns: GRID,
                      height: 42,
                      borderColor: "var(--line-2)",
                      background: active ? "var(--acc-t)" : "var(--bg)",
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2 pl-4">
                      <span
                        className="flex shrink-0 items-center justify-center font-semibold"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          fontSize: 10,
                          background: "var(--acc-t)",
                          color: "var(--acc)",
                          border: "1px solid var(--acc-b)",
                        }}
                      >
                        {o.name[0]?.toUpperCase()}
                      </span>
                      <span className="truncate text-[13px] font-medium">{o.name}</span>
                    </span>
                    <span className="flex min-w-0 flex-wrap gap-1 overflow-hidden pr-3">
                      {o.emailDomains.slice(0, 2).map((d) => (
                        <span
                          key={d}
                          className="rounded border px-1.5 py-0.5"
                          style={{
                            fontSize: 10.5,
                            fontFamily: "var(--font-mono)",
                            background: "var(--sunk)",
                            borderColor: "var(--line)",
                          }}
                        >
                          {d}
                        </span>
                      ))}
                      {o.emailDomains.length > 2 && (
                        <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                          +{o.emailDomains.length - 2}
                        </span>
                      )}
                    </span>
                    <span className="text-right tabular-nums" style={{ fontSize: 12.5 }}>
                      {o.contactCount}
                    </span>
                    <span
                      className="pr-4 text-right font-semibold tabular-nums"
                      style={{
                        fontSize: 12.5,
                        color: o.openTickets > 8 ? "var(--dang)" : "var(--ink)",
                      }}
                    >
                      {o.openTickets}
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
              <span
                className="flex shrink-0 items-center justify-center font-bold"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 9,
                  fontSize: 16,
                  background: "var(--acc-t)",
                  color: "var(--acc)",
                  border: "1px solid var(--acc-b)",
                }}
              >
                {detail.org.name[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{detail.org.name}</p>
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {detail.members.length} contact{detail.members.length > 1 ? "s" : ""} ·{" "}
                  {openCount} ticket{openCount > 1 ? "s" : ""} ouvert
                  {openCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Domaines de rattachement */}
            <p
              className="mb-1.5 mt-4 font-semibold uppercase tracking-wider"
              style={{ fontSize: 11, color: "var(--ink-3)" }}
            >
              Domaines de rattachement
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {detail.org.emailDomains.map((d) => (
                <form key={d} action={removeOrgDomain} className="inline-flex">
                  <input type="hidden" name="organizationId" value={detail.org.id} />
                  <input type="hidden" name="domain" value={d} />
                  <span
                    className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      background: "var(--sunk)",
                      borderColor: "var(--line)",
                    }}
                  >
                    {d}
                    <button type="submit" title={`Retirer ${d}`} style={{ color: "var(--ink-3)" }}>
                      <X size={11} />
                    </button>
                  </span>
                </form>
              ))}
              <form action={addOrgDomain} className="inline-flex items-center gap-1">
                <input type="hidden" name="organizationId" value={detail.org.id} />
                <input
                  name="domain"
                  placeholder="+ ajouter"
                  className="border px-1.5 py-0.5 outline-none"
                  style={{
                    width: 92,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    borderRadius: 4,
                    borderColor: "var(--line)",
                    background: "var(--bg)",
                  }}
                />
              </form>
            </div>
            {error === "invalid-domain" && (
              <p className="mt-1.5" style={{ fontSize: 11.5, color: "var(--dang)" }}>
                Domaine invalide, grand public, ou déjà rattaché à une autre organisation.
              </p>
            )}

            {/* Partage des demandes */}
            <form
              action={toggleOrgSharedTickets}
              className="mt-4 flex items-start gap-2.5 rounded-lg border p-2.5"
              style={{ borderColor: "var(--line)", background: "var(--sunk)" }}
            >
              <input type="hidden" name="organizationId" value={detail.org.id} />
              <button
                type="submit"
                role="switch"
                aria-checked={detail.org.sharedTickets}
                className="relative mt-0.5 shrink-0 rounded-full transition-colors"
                style={{
                  width: 34,
                  height: 20,
                  background: detail.org.sharedTickets ? "var(--acc)" : "var(--line)",
                }}
                title="Basculer"
              >
                <span
                  className="absolute top-0.5 rounded-full bg-white transition-all"
                  style={{ width: 16, height: 16, left: detail.org.sharedTickets ? 16 : 2 }}
                />
              </button>
              <span>
                <span className="block text-[12.5px] font-medium">Partage des demandes</span>
                <span className="block" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  Les contacts peuvent voir les tickets de leur organisation sur le portail.
                </span>
              </span>
            </form>
          </div>

          {/* Onglets */}
          <div className="flex gap-1 border-b px-3 pt-2" style={{ borderColor: "var(--line)" }}>
            {(
              [
                ["contacts", "Contacts"],
                ["tickets", "Tickets"],
                ["notes", "Notes"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <Link
                key={key}
                href={buildUrl(query, detail.org.id, key)}
                className="rounded-t-md px-3 pb-2 pt-1 text-[13px] font-medium"
                style={
                  tab === key
                    ? { color: "var(--acc)", boxShadow: "inset 0 -2px 0 var(--acc)" }
                    : { color: "var(--ink-3)" }
                }
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex-1 p-4">
            {tab === "contacts" &&
              (detail.members.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Aucun contact rattaché.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.members.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/app/contacts?selected=${m.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5"
                        style={{ fontSize: 12.5 }}
                      >
                        <Avatar name={m.name ?? m.email} size={22} />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {m.name ?? m.email}
                        </span>
                        <span
                          className="tabular-nums"
                          style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                        >
                          {m.ticketCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}

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
                        <span
                          className="hidden whitespace-nowrap tabular-nums xl:inline"
                          style={{ fontSize: 11, color: "var(--ink-3)" }}
                        >
                          {relativeFr(t.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === "notes" && (
              <form action={updateOrgNotes} className="flex flex-col gap-2">
                <input type="hidden" name="organizationId" value={detail.org.id} />
                <textarea
                  name="notes"
                  rows={8}
                  defaultValue={detail.org.notes ?? ""}
                  placeholder="Notes internes sur cette organisation…"
                  className="w-full resize-y rounded-md border p-2.5 text-[13px] outline-none"
                  style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                />
                <button
                  type="submit"
                  className="self-end rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-white"
                  style={{ background: "var(--acc)" }}
                >
                  Enregistrer les notes
                </button>
              </form>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
