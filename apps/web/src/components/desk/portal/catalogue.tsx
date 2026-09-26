"use client";

/**
 * SD-E1 — the catalogue: personalised title, full-text search (name,
 * description, category), category chips, the card grid with its effective
 * circuit badge, the request drawer, and "request a new tool".
 */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { AppIcon } from "@/components/desk/app-icon";
import type { CatalogueApp } from "@/lib/desk/portal-data";
import { requestToolAction } from "@/app/desk/actions";
import { RequestDrawer, errorMessage, type ExpiryPolicy } from "./request-drawer";
import { useToast } from "./shell";
import { Modal } from "./modal";

const BADGES = [
  { key: "desk.portal.badge.immediate", c: "var(--ok)", bg: "var(--ok-t)" },
  { key: "desk.portal.badge.one", c: "var(--open)", bg: "var(--open-t)" },
  { key: "desk.portal.badge.two", c: "var(--viol)", bg: "var(--viol-t)" },
] as const;

export function Catalogue({
  firstName,
  apps,
  expiry,
}: {
  firstName: string;
  apps: CatalogueApp[];
  expiry: ExpiryPolicy;
}) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<CatalogueApp | null>(null);
  const [toolOpen, setToolOpen] = useState(false);

  const categories = useMemo(() => [...new Set(apps.map((a) => a.category))], [apps]);
  const needle = q.trim().toLocaleLowerCase(t.locale.tag);
  const shown = apps.filter(
    (a) =>
      (!cat || a.category === cat) &&
      (!needle || `${a.name} ${a.description} ${a.category}`.toLocaleLowerCase(t.locale.tag).includes(needle)),
  );

  return (
    <div className="sd-rise flex flex-col gap-[22px]">
      <div className="flex flex-col gap-2">
        <h1 className="sd-title text-[28px] leading-[1.2] max-sm:text-[23px]">
          {t("desk.portal.catalogue.title", { name: firstName })}
        </h1>
        <p className="max-w-[660px] text-[14.5px]" style={{ color: "var(--ink-2)", textWrap: "pretty" }}>
          {t("desk.portal.catalogue.intro")}
        </p>
      </div>

      <label
        className="flex h-[46px] max-w-[660px] items-center gap-2.5 rounded-xl px-3.5"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="sr-only">{t("desk.portal.catalogue.searchLabel")}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("desk.portal.catalogue.search")}
          className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none"
          style={{ color: "var(--ink)" }}
        />
      </label>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "*"}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className="sd-chip rounded-full px-[13px] py-1.5 text-[13px] font-semibold"
            >
              {c ?? t("desk.portal.catalogue.all")}
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
          {shown.map((a) => {
            const badge = a.held
              ? { label: t("desk.portal.badge.held"), c: "var(--ink-2)", bg: "var(--sunk)" }
              : { label: t(BADGES[Math.min(a.levels, 2)]!.key), c: BADGES[Math.min(a.levels, 2)]!.c, bg: BADGES[Math.min(a.levels, 2)]!.bg };
            const cta = a.held
              ? { label: t("desk.portal.catalogue.ctaHeld"), c: "var(--ink-2)" }
              : a.pending
                ? { label: t("desk.portal.catalogue.ctaPending"), c: "var(--wait)" }
                : { label: t("desk.portal.catalogue.ctaRequest"), c: "var(--brand-2)" };
            const onClick = () => {
              if (a.held || a.pending) router.push("/desk/mine");
              else if (a.tiers.length > 0) setOpen(a);
            };
            return (
              <button
                key={a.id}
                type="button"
                onClick={onClick}
                className="sd-card sd-app-card flex flex-col gap-3 p-4"
              >
                <span className="flex items-center gap-3">
                  <AppIcon name={a.name} iconKey={a.iconKey} logoUrl={a.logoUrl} color={a.color} size={42} />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{a.name}</span>
                    <span className="block text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      {a.category}
                    </span>
                  </span>
                </span>
                <span className="flex-1 text-[13px] leading-[1.45]" style={{ color: "var(--ink-2)" }}>
                  {a.description}
                </span>
                <span className="flex w-full items-center gap-2">
                  <span
                    className="whitespace-nowrap rounded-full px-[9px] py-[2.5px] text-[11.5px] font-semibold"
                    style={{ background: badge.bg, color: badge.c }}
                  >
                    {badge.label}
                  </span>
                  <span className="flex-1" />
                  <span className="whitespace-nowrap text-[13px] font-semibold" style={{ color: cta.c }}>
                    {cta.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 && (
        <div className="p-7 text-center text-[14px]" style={{ color: "var(--ink-3)" }}>
          {apps.length === 0 ? t("desk.portal.catalogue.emptyCatalogue") : t("desk.portal.catalogue.noMatch")}
        </div>
      )}

      <button type="button" onClick={() => setToolOpen(true)} className="sd-link self-start py-1 text-left text-[13.5px]">
        {t("desk.portal.catalogue.newTool")}
      </button>

      {open && <RequestDrawer app={open} expiry={expiry} onClose={() => setOpen(null)} />}
      {toolOpen && <NewToolModal initialName={q.trim()} onClose={() => setToolOpen(false)} />}
    </div>
  );
}

function NewToolModal({ initialName, onClose }: { initialName: string; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await requestToolAction(name, why);
      if (!res.ok) return setError(errorMessage(t, res.error));
      toast(t("desk.portal.newTool.sent", { number: String(res.ticketNumber) }));
      onClose();
    });
  };
  return (
    <Modal title={t("desk.portal.newTool.title")} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
          {t("desk.portal.newTool.intro")}
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
            {t("desk.portal.newTool.name")}
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="sd-input h-[42px] px-[13px] text-[14px]" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
            {t("desk.portal.newTool.why")}
          </span>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            required
            placeholder={t("desk.portal.newTool.whyPlaceholder")}
            className="sd-input min-h-[96px] resize-none px-[13px] py-[11px] text-[14px]"
          />
        </label>
        {error && (
          <p className="text-[13px] font-medium" style={{ color: "var(--dang)" }} role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="sd-btn sd-btn-ghost">
            {t("desk.portal.drawer.cancel")}
          </button>
          <button type="submit" disabled={pending} className="sd-btn sd-btn-primary">
            {t("desk.portal.newTool.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
