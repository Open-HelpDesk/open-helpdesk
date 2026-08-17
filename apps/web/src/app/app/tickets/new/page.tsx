import Link from "next/link";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db, ticketForms, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { NewTicketForm } from "./new-ticket-form";

/**
 * AG-05 — Nouveau ticket (design espace-agent) : carte centrée 720 px radius 12,
 * combobox contact réelle, grille Sujet/Formulaire, description avec toolbar,
 * 4 selects, encart « Envoyer la réponse par email », pied sunk.
 */
export default async function NewTicketPage() {
  const { tenant, agent } = await requireAgent();

  const [forms, agents, tagRows] = await Promise.all([
    db
      .select({ id: ticketForms.id, name: ticketForms.name })
      .from(ticketForms)
      .where(eq(ticketForms.tenantId, tenant.id))
      .orderBy(asc(ticketForms.position), asc(ticketForms.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.status, "disabled")))
      .orderBy(asc(users.name)),
    db.execute(
      sql`select distinct unnest(tags) as tag from app.tickets where tenant_id = ${tenant.id} order by tag limit 20`,
    ) as unknown as Promise<{ tag: string }[]>,
  ]);

  return (
    <div className="h-full overflow-y-auto py-8">
      <div
        className="ohd-rise mx-auto w-full border shadow-sm"
        style={{
          maxWidth: 720,
          borderRadius: 12,
          background: "var(--panel)",
          borderColor: "var(--line)",
        }}
      >
        {/* En-tête de la carte */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--line)" }}
        >
          <h1 className="text-[15px] font-semibold">Nouveau ticket</h1>
          <Link
            href="/app/tickets"
            title="Fermer"
            className="flex items-center justify-center rounded-md"
            style={{ width: 26, height: 26, color: "var(--ink-3)" }}
          >
            ✕
          </Link>
        </div>

        <NewTicketForm
          forms={forms}
          agents={agents}
          tags={tagRows.map((r) => String(r.tag))}
          meId={agent.id}
        />
      </div>
    </div>
  );
}
