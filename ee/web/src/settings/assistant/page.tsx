/**
 * ST-15 — la gouvernance de l'assistant (spec 18 § 6).
 *
 * L'objectif de l'écran n'est pas de régler une IA : c'est qu'un client réponde
 * seul aux quatre questions que pose un service juridique — qu'est-ce qui est
 * envoyé, à qui, ce que fait l'IA, et comment l'éteindre. D'où l'ordre des
 * blocs : le fournisseur d'abord (un fait, en lecture seule), l'interrupteur
 * ensuite, puis les fonctions, ce qui est lu, ce que voient les clients, et
 * enfin la consommation et le journal.
 *
 * Deux choix qui se voient à l'écran et qui sont volontaires :
 *
 *  - une fonction dont l'entitlement manque **reste affichée**, avec son badge.
 *    C'est ainsi qu'on vend un palier ; la cacher laisserait croire qu'elle
 *    n'existe pas.
 *  - la déflexion a son propre bloc plutôt qu'un interrupteur parmi les autres,
 *    parce que c'est la seule sortie qu'un client final lit, et que ses
 *    garde-fous (langues, seuil, divulgation) n'ont de sens qu'ensemble.
 */
import { getEdition } from "@openhelpdesk/config";
import {
  AI_CAPABILITIES,
  getAiSettings,
  instanceProvider,
  monthlyUsage,
  recentAiCalls,
  deflectionsLeft,
} from "@openhelpdesk/ee-ai";
import type { AiCapability } from "@openhelpdesk/db";
import { Card, Field, Gauge, LockedScreen, PageHeader, PageShell, SaveBar, Select, TextInput, Toggle, EnterpriseBadge } from "@/components/settings-page";
import { entitlementsFor } from "@/lib/entitlements";
import { requireManager } from "@/lib/session";
import { LOCALES } from "@/i18n/locales";
import { getT, type Translate } from "@/i18n/server";
import { clearByoModel, saveAssistant, saveByoModel } from "./actions";

const LOG_GRID = "150px 150px minmax(120px,1fr) 90px 170px 110px 110px";

/** Le quota mensuel du palier — le même tableau que la page tarifs annonce. */
function quotaFor(planName: string | null): number {
  if (planName === "business") return 1000;
  if (planName === "team") return 200;
  return 50;
}

/** Libellé et description d'une capacité, plus l'entitlement qui la débloque. */
function capabilityMeta(
  t: Translate,
): Record<AiCapability, { label: string; hint: string; full: boolean }> {
  return {
    triage: {
      label: t("app.settings.assistant.capTriage"),
      hint: t("app.settings.assistant.capTriageHint"),
      full: false,
    },
    summary: {
      label: t("app.settings.assistant.capSummary"),
      hint: t("app.settings.assistant.capSummaryHint"),
      full: false,
    },
    macro_suggest: {
      label: t("app.settings.assistant.capMacroSuggest"),
      hint: t("app.settings.assistant.capMacroSuggestHint"),
      full: false,
    },
    kb_search: {
      label: t("app.settings.assistant.capKbSearch"),
      hint: t("app.settings.assistant.capKbSearchHint"),
      full: false,
    },
    reply_draft: {
      label: t("app.settings.assistant.capReplyDraft"),
      hint: t("app.settings.assistant.capReplyDraftHint"),
      full: true,
    },
    rewrite: {
      label: t("app.settings.assistant.capRewrite"),
      hint: t("app.settings.assistant.capRewriteHint"),
      full: true,
    },
    kb_article: {
      label: t("app.settings.assistant.capKbArticle"),
      hint: t("app.settings.assistant.capKbArticleHint"),
      full: true,
    },
    deflect: {
      label: t("app.settings.assistant.capDeflect"),
      hint: t("app.settings.assistant.capDeflectHint"),
      full: false,
    },
    /* Livrée plus tard (décision D3) : la capacité existe dans le modèle de
       données, pas sur l'écran, parce qu'un interrupteur qui n'allume rien est
       un mensonge. */
    auto_reply: { label: "", hint: "", full: true },
  };
}

function euros(micros: number): string {
  return (micros / 1_000_000).toFixed(2);
}

/**
 * L'aperçu flouté derrière le verrou : la silhouette de l'écran, sans une seule
 * donnée. On montre la forme de ce qu'on vend, pas un faux contenu qui laisserait
 * croire que quelque chose tourne déjà.
 */
function AssistantGhost({ t }: { t: Translate }) {
  const rows = [
    t("app.settings.assistant.capTriage"),
    t("app.settings.assistant.capSummary"),
    t("app.settings.assistant.capReplyDraft"),
    t("app.settings.assistant.capRewrite"),
    t("app.settings.assistant.capDeflect"),
  ];
  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <Card title={t("app.settings.assistant.providerCard")}>
        <div style={{ height: 12, width: 220, borderRadius: 4, background: "var(--sunk)" }} />
        <div style={{ height: 12, width: 320, borderRadius: 4, background: "var(--sunk)" }} />
      </Card>
      <Card title={t("app.settings.assistant.capabilitiesCard")}>
        {rows.map((label) => (
          <div key={label} className="flex items-center gap-3">
            <span
              style={{ width: 34, height: 20, borderRadius: 999, background: "var(--sunk)" }}
            />
            <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{label}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireManager();
  const ent = entitlementsFor(tenant);
  const { saved, error } = await searchParams;

  const header = (
    <PageHeader
      title={t("app.settings.assistant.title")}
      subtitle={t("app.settings.assistant.subtitle")}
    />
  );

  if (!ent.aiBasic && !ent.aiFull) {
    const edition = getEdition();
    return (
      <PageShell>
        {header}
        <LockedScreen
          variant={edition}
          title={t(
            edition === "cloud"
              ? "app.settings.assistant.lockedTitle"
              : "app.settings.shell.eeSelfHostedTitle",
          )}
          text={t("app.settings.assistant.lockedText")}
          ghost={<AssistantGhost t={t} />}
        />
      </PageShell>
    );
  }

  const settings = await getAiSettings(tenant.id);
  const instance = instanceProvider();
  const byo = settings.byo;
  const configured = Boolean(byo ?? instance);
  const quota = quotaFor(tenant.planName);
  const [usage, left, calls] = await Promise.all([
    monthlyUsage(tenant.id),
    byo ? Promise.resolve(Number.POSITIVE_INFINITY) : deflectionsLeft(tenant.id, quota),
    recentAiCalls(tenant.id, 50),
  ]);
  const meta = capabilityMeta(t);
  const served = usage.deflections.provisional + usage.deflections.confirmed;

  return (
    <PageShell>
      {header}

      {/* Le message d'erreur de l'action BYO. Rediriger avec un motif que
          l'écran n'affiche pas, c'est un formulaire qui échoue en silence. */}
      {error && (
        <Card danger>
          <p style={{ fontSize: 13, color: "var(--dang)", margin: 0 }}>
            {t(
              error === "insecure"
                ? "app.settings.assistant.errInsecure"
                : "app.settings.assistant.errEndpoint",
            )}
          </p>
        </Card>
      )}

      {!configured && (
        <Card>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--wait)" }}>
            {t("app.settings.assistant.unconfiguredTitle")}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: 0 }}>
            {t("app.settings.assistant.unconfiguredText")}
          </p>
        </Card>
      )}

      {/* 1 — Le fournisseur. Un fait, pas un réglage. */}
      <Card title={t("app.settings.assistant.providerCard")}>
        <dl className="grid gap-3" style={{ gridTemplateColumns: "180px 1fr", margin: 0 }}>
          <dt style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            {t("app.settings.assistant.providerName")}
          </dt>
          <dd style={{ fontSize: 13.5, color: "var(--ink)", margin: 0 }}>
            {byo ? t("app.settings.assistant.providerOwn") : (instance?.label ?? "—")}
          </dd>
          <dt style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            {t("app.settings.assistant.providerModel")}
          </dt>
          <dd style={{ fontSize: 13.5, color: "var(--ink)", margin: 0 }}>
            {byo?.model ?? instance?.model ?? "—"}
          </dd>
        </dl>
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: 0 }}>
          {t("app.settings.assistant.noTraining")}
        </p>
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
          {t("app.settings.assistant.redactionNote")}
        </p>
      </Card>

      <form action={saveAssistant} className="flex flex-col" style={{ gap: 16 }}>
        {/* 2 — L'interrupteur général. */}
        <Card title={t("app.settings.assistant.masterCard")}>
          <Toggle
            name="enabled"
            defaultChecked={settings.enabled}
            label={t("app.settings.assistant.enabled")}
            hint={t("app.settings.assistant.enabledHint")}
          />
        </Card>

        {/* 3 — Les fonctions, une ligne chacune, badge quand l'offre manque. */}
        <Card title={t("app.settings.assistant.capabilitiesCard")}>
          {AI_CAPABILITIES.filter((cap) => cap !== "auto_reply" && cap !== "deflect").map((cap) => {
            const m = meta[cap];
            const locked = m.full && !ent.aiFull;
            return (
              <div key={cap} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Toggle
                    name={`cap.${cap}`}
                    defaultChecked={settings.capabilities[cap] !== false && !locked}
                    disabled={locked}
                    label={m.label}
                    hint={m.hint}
                  />
                </div>
                {locked && (
                  <EnterpriseBadge label={t("app.settings.assistant.businessOnly")} />
                )}
              </div>
            );
          })}
        </Card>

        {/* 4 — Ce qu'il lit. */}
        <Card title={t("app.settings.assistant.sourcesCard")}>
          <Toggle
            name="source.kb"
            defaultChecked={settings.sources.kb}
            label={t("app.settings.assistant.sourceKb")}
          />
          <Toggle
            name="source.macros"
            defaultChecked={settings.sources.macros}
            label={t("app.settings.assistant.sourceMacros")}
          />
          <Toggle
            name="source.resolvedTickets"
            defaultChecked={settings.sources.resolvedTickets}
            label={t("app.settings.assistant.sourceResolved")}
            hint={t("app.settings.assistant.sourceResolvedHint")}
          />
          <Toggle
            name="source.internalNotes"
            defaultChecked={settings.sources.internalNotes}
            label={t("app.settings.assistant.sourceNotes")}
            hint={t("app.settings.assistant.sourceNotesHint")}
          />
        </Card>

        {/* 5 — Ce que voient les clients : la seule sortie sans relecture. */}
        <Card title={t("app.settings.assistant.deflectionCard")}>
          <Toggle
            name="cap.deflect"
            defaultChecked={settings.capabilities.deflect !== false}
            label={meta.deflect.label}
            hint={meta.deflect.hint}
          />
          <Field
            label={t("app.settings.assistant.deflectionLocales")}
            hint={t("app.settings.assistant.deflectionLocalesHint")}
          >
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}
            >
              {LOCALES.map((locale) => (
                <label key={locale.code} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="locale"
                    value={locale.code}
                    defaultChecked={settings.deflectionLocales.includes(locale.code)}
                  />
                  <span style={{ fontSize: 13 }}>{locale.nativeName}</span>
                </label>
              ))}
            </div>
          </Field>
          {settings.deflectionLocales.length === 0 && (
            <p style={{ fontSize: 12.5, color: "var(--wait)", margin: 0 }}>
              {t("app.settings.assistant.deflectionNoLocale")}
            </p>
          )}
          <Field
            label={t("app.settings.assistant.deflectionThreshold")}
            hint={t("app.settings.assistant.deflectionThresholdHint")}
            style={{ maxWidth: 200 }}
          >
            <Select name="threshold" defaultValue={String(settings.deflectionThreshold)}>
              {[50, 60, 70, 80, 90].map((v) => (
                <option key={v} value={v}>
                  {v} %
                </option>
              ))}
            </Select>
          </Field>
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
            {t("app.settings.assistant.disclosureNote")}
          </p>
        </Card>

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/assistant" />
      </form>

      {/* 6 — Le modèle apporté par l'espace. Son propre formulaire : l'effacer
              est une décision, pas un champ vidé par distraction. */}
      <Card title={t("app.settings.assistant.byoCard")}>
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: 0 }}>
          {t("app.settings.assistant.byoHint")}
        </p>
        <form action={saveByoModel} className="flex flex-col" style={{ gap: 12 }}>
          <Field label={t("app.settings.assistant.byoEndpoint")}>
            <TextInput
              name="byoEndpoint"
              defaultValue={byo?.endpoint ?? ""}
              placeholder="https://api.scaleway.ai/v1"
            />
          </Field>
          <Field label={t("app.settings.assistant.byoModel")}>
            <TextInput
              name="byoModel"
              defaultValue={byo?.model ?? ""}
              placeholder="gemma-4-26b-a4b-it"
            />
          </Field>
          <Field
            label={t("app.settings.assistant.byoSecret")}
            hint={byo ? t("app.settings.assistant.byoSecretSet") : undefined}
          >
            <TextInput name="byoSecret" type="password" autoComplete="off" />
          </Field>
          <SaveBar saved={false} cancelHref="/app/settings/assistant" surface="panel" />
        </form>
        {byo && (
          <form action={clearByoModel}>
            <button
              type="submit"
              className="font-medium"
              style={{ fontSize: 12.5, color: "var(--ink-2)", background: "none", border: 0 }}
            >
              {t("app.settings.assistant.byoClear")}
            </button>
          </form>
        )}
      </Card>

      {/* 7 — Ce que ça consomme, et ce que ça coûte. */}
      <Card title={t("app.settings.assistant.usageCard")}>
        {byo ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: 0 }}>
            {t("app.settings.assistant.usageNoQuota")}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 12.5, color: "var(--ink-2)", minWidth: 180 }}>
                {t("app.settings.assistant.usageQuota")}
              </span>
              <Gauge value={served} max={quota} />
              <span style={{ fontSize: 13, color: "var(--ink)" }}>
                {served} / {quota}
              </span>
            </div>
            {/* Étiquette puis nombre, dans la même liste de définitions que le
                reste : accoler un mot à un chiffre fabrique une phrase, et une
                phrase assemblée n'est pas traduisible — c'est une des règles
                du README d'i18n. */}
            <dl
              className="grid gap-2"
              style={{ gridTemplateColumns: "180px 1fr", margin: 0, fontSize: 12 }}
            >
              <dt style={{ color: "var(--ink-3)" }}>
                {t("app.settings.assistant.usageProvisional")}
              </dt>
              <dd style={{ color: "var(--ink-2)", margin: 0 }}>
                {usage.deflections.provisional}
              </dd>
              <dt style={{ color: "var(--ink-3)" }}>
                {t("app.settings.assistant.usageReturned")}
              </dt>
              <dd style={{ color: "var(--ink-2)", margin: 0 }}>
                {usage.deflections.returned}
              </dd>
            </dl>
            <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
              {t("app.settings.assistant.usageReturnedHint")}
            </p>
            {left <= 0 && (
              <p style={{ fontSize: 12.5, color: "var(--wait)", margin: 0 }}>
                {t("app.settings.assistant.usageQuotaReached")}
              </p>
            )}
          </>
        )}
        <dl className="grid gap-3" style={{ gridTemplateColumns: "180px 1fr", margin: 0 }}>
          <dt style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            {t("app.settings.assistant.usageCalls")}
          </dt>
          <dd style={{ fontSize: 13.5, margin: 0 }}>{usage.calls}</dd>
          {!byo && (
            <>
              <dt style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                {t("app.settings.assistant.usageCost")}
              </dt>
              <dd style={{ fontSize: 13.5, margin: 0 }}>{euros(usage.costMicros)} €</dd>
            </>
          )}
        </dl>
      </Card>

      {/* 8 — Le journal. La pièce qu'un registre des traitements réclamera. */}
      <Card title={t("app.settings.assistant.logCard")} style={{ padding: 0 }}>
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0, padding: "0 20px" }}>
          {t("app.settings.assistant.logHint")}
        </p>
        {calls.length === 0 ? (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--ink-3)",
              margin: 0,
              padding: "18px 20px 20px",
            }}
          >
            {t("app.settings.assistant.logEmpty")}
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div
              className="grid items-center gap-3 border-b uppercase"
              style={{
                gridTemplateColumns: LOG_GRID,
                minHeight: 40,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".09em",
                color: "var(--ink-3)",
                background: "var(--canvas)",
                borderColor: "var(--line)",
                padding: "0 18px",
              }}
            >
              <span>{t("app.settings.assistant.colWhen")}</span>
              <span>{t("app.settings.assistant.colFunction")}</span>
              <span>{t("app.settings.assistant.colWho")}</span>
              <span>{t("app.settings.assistant.colTicket")}</span>
              <span>{t("app.settings.assistant.colModel")}</span>
              <span>{t("app.settings.assistant.colTokens")}</span>
              <span className="text-right">{t("app.settings.assistant.colOutcome")}</span>
            </div>
            {calls.map((call) => (
              <div
                key={call.id}
                className="grid items-center gap-3 border-b"
                style={{
                  gridTemplateColumns: LOG_GRID,
                  minHeight: 44,
                  fontSize: 12.5,
                  borderColor: "var(--line-2)",
                  padding: "0 18px",
                }}
              >
                <span style={{ color: "var(--ink-2)" }}>
                  {call.createdAt?.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <span>{meta[call.capability as AiCapability]?.label || call.capability}</span>
                <span className="truncate" style={{ color: "var(--ink-2)" }}>
                  {call.actorName ?? "—"}
                </span>
                <span style={{ color: "var(--ink-2)" }}>
                  {call.ticketNumber ? `#${call.ticketNumber}` : "—"}
                </span>
                <span className="truncate" style={{ color: "var(--ink-2)" }}>
                  {call.model}
                </span>
                <span style={{ color: "var(--ink-2)" }}>
                  {call.inputTokens + call.outputTokens}
                </span>
                <span
                  className="text-right"
                  style={{
                    color:
                      call.status === "failed"
                        ? "var(--dang)"
                        : call.status === "refused"
                          ? "var(--wait)"
                          : "var(--ok)",
                  }}
                >
                  {t(
                    call.status === "failed"
                      ? "app.settings.assistant.outcomeFailed"
                      : call.status === "refused"
                        ? "app.settings.assistant.outcomeRefused"
                        : "app.settings.assistant.outcomeOk",
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
