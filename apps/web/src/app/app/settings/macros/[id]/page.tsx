import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, macros, teams } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell, SubCrumb } from "@/components/settings-page";
import { MacroForm, type MacroRow } from "../macro-form";

/**
 * ST-06b — One macro, or a new one; the mockup uses the same screen for both.
 *
 * Promoted from a 420 px drawer: the inserted text is the substance of a macro,
 * and it was being written in a box six lines tall against the edge of the
 * screen.
 */
export default async function MacroDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { id } = await params;
  const isNew = id === "new";

  const [macro, teamRows] = await Promise.all([
    isNew
      ? Promise.resolve(undefined)
      : db
          .select()
          .from(macros)
          .where(and(eq(macros.tenantId, tenant.id), eq(macros.id, id)))
          .then((rows) => rows[0]),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tenantId, tenant.id))
      .orderBy(asc(teams.name)),
  ]);

  if (!isNew && !macro) notFound();

  const title = isNew ? t("app.settings.rules.macroCreateTitle") : macro!.name;

  return (
    <PageShell>
      <SubCrumb
        parent={t("app.settings.rules.macrosTitle")}
        href="/app/settings/macros"
        current={title}
      />
      <PageHeader title={title} subtitle={t("app.settings.rules.macrosSubtitle")} />
      <div className="st-rise">
        <MacroForm macro={macro as MacroRow | undefined} teams={teamRows} t={t} />
      </div>
    </PageShell>
  );
}
