import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, macros } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { deleteMacro } from "./actions";

/**
 * ST-06 — Macros (specs/11) : liste groupée par catégorie. Les agents les appliquent
 * depuis l'éditeur de AG-04. Reste à venir : usage 30 j, macros personnelles, portée équipe.
 */
export default async function MacrosPage() {
  const { tenant } = await requireAgent();
  const rows = await db
    .select()
    .from(macros)
    .where(eq(macros.tenantId, tenant.id))
    .orderBy(asc(macros.category), asc(macros.name));

  const byCategory = new Map<string, typeof rows>();
  for (const m of rows) {
    const key = m.category ?? "Sans catégorie";
    byCategory.set(key, [...(byCategory.get(key) ?? []), m]);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Macros</h1>
        <span className="flex-1" />
        <Link
          href="/app/settings/macros/new"
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Nouvelle macro
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: "var(--mute)" }}>
          Aucune macro. Créez des réponses types pour vos demandes récurrentes.
        </p>
      ) : (
        [...byCategory.entries()].map(([category, list]) => (
          <div key={category} className="mb-5">
            <p
              className="mb-2 font-mono text-[11px] uppercase tracking-wider"
              style={{ color: "var(--mute)" }}
            >
              {category}
            </p>
            <ul className="flex flex-col gap-2">
              {list.map((m) => {
                const insert = (m.actions as { type: string; value?: unknown }[]).find(
                  (a) => a.type === "insert_text",
                );
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                    style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/app/settings/macros/${m.id}`}
                        className="block text-sm font-semibold"
                      >
                        {m.name}
                      </Link>
                      {insert && (
                        <p className="truncate text-xs" style={{ color: "var(--mute)" }}>
                          {String(insert.value ?? "").slice(0, 120)}
                        </p>
                      )}
                    </div>
                    <form action={deleteMacro}>
                      <input type="hidden" name="macroId" value={m.id} />
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--dang)", color: "var(--dang)" }}
                      >
                        Supprimer
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
