"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Edition } from "@openhelpdesk/config";
import { useT } from "@/i18n/client";

/**
 * Shared primitives of the admin area (ST-01 → ST-14) — shared template from
 * The administration frame: page header (code chip + 20px/600 title +
 * 13.5px subtitle), segmented control, save bar, cards, toggles, gauges, empty
 * and locked states (EE plans).
 *
 * Client module: two client forms (ST-03) already import Field/Select/TextInput
 * from here, so the file lives in the browser graph. The shared labels (Save,
 * Cancel…) go through useT() rather than getT(), which would pull next/headers
 * and the eleven dictionaries in with it.
 */

export type PageTab = { label: string; href: string; active: boolean };

/**
 * Content column of an admin screen — 1040 px, centred.
 *
 * V1 pinned the column to the navigation and let each screen choose its own
 * width, so no two admin screens started at the same x. V2 gives all eighteen
 * one centred 1040 column, which is why `maxWidth` is no longer a prop: a width
 * per screen is exactly what the redesign removes.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex w-full flex-col"
      style={{ maxWidth: 1040, margin: "0 auto", padding: "26px 28px 44px", gap: 20 }}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  tabs,
  actions,
}: {
  title: string;
  subtitle: string;
  tabs?: PageTab[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start" style={{ gap: 16 }}>
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 5, minWidth: 280 }}>
        <h1
          style={{
            fontFamily: "var(--font-title)",
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-.015em",
            color: "var(--ink)",
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-2)", maxWidth: "64ch" }}>{subtitle}</p>
      </div>
      <div className="flex items-center" style={{ gap: 10 }}>
        {tabs && tabs.length > 0 && <SegTabs tabs={tabs} />}
        {actions}
      </div>
    </header>
  );
}

/** Segmented control — --sunk container, radius 7, padding 2, active segment panel background/600. */
export function SegTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <div
      className="inline-flex items-center"
      style={{ background: "var(--sunk)", borderRadius: 9, padding: 3, gap: 2 }}
    >
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="ohd-hover-edge-ink whitespace-nowrap"
          style={{
            padding: "8px 14px",
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: t.active ? 600 : 450,
            color: t.active ? "var(--ink)" : "var(--ink-3)",
            background: t.active ? "var(--panel)" : "transparent",
            boxShadow: t.active ? "0 1px 2px rgba(13,28,23,.08)" : "none",
          }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Footer bar "✓ Saved / Cancel / Save" — to be placed INSIDE a <form>.
 * "✓ Saved" shows when the server action has redirected with ?saved=1.
 */
export function SaveBar({
  saved,
  cancelHref,
  submitLabel,
  surface = "canvas",
}: {
  saved?: boolean;
  cancelHref: string;
  submitLabel?: string;
  /** "panel" when the bar lives INSIDE a card (white background), "canvas" at the page footer. */
  surface?: "canvas" | "panel";
}) {
  const t = useT();
  return (
    <div
      className="sticky bottom-0 z-10 flex items-center gap-2 border-t"
      style={{
        padding: "10px 0",
        borderColor: surface === "panel" ? "var(--line-2)" : "var(--line)",
        background: `var(--${surface})`,
        marginTop: 4,
      }}
    >
      {saved && (
        <span style={{ fontSize: 12.5, color: "var(--ok)" }}>{t("app.settings.shell.saved")}</span>
      )}
      <span className="flex-1" />
      <Link
        href={cancelHref}
        className="ohd-hover-edge-ink inline-flex items-center rounded-md border px-3 font-medium"
        style={{
          height: 38,
          borderRadius: 9,
          padding: "0 15px",
          fontSize: 13,
          borderColor: "var(--line)",
          background: "var(--panel)",
          color: "var(--ink)",
        }}
      >
        {t("app.settings.shell.cancel")}
      </Link>
      <button
        type="submit"
        className="inline-flex items-center font-semibold"
        style={{
          color: "var(--on-brand)",
          height: 38,
          borderRadius: 9,
          padding: "0 16px",
          fontSize: 13.5,
          background: "var(--brand)",
        }}
      >
        {submitLabel ?? t("app.settings.shell.save")}
      </button>
    </div>
  );
}

/**
 * Section card — panel, radius 14, padding 20, its children stacked 16 apart.
 * The stack is part of the card in V2: every screen was spelling its own gap,
 * and no two cards breathed the same.
 */
export function Card({
  title,
  action,
  children,
  style,
  danger,
}: {
  title?: string;
  /** Content aligned to the right of the title (status badge, link…). */
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  danger?: boolean;
}) {
  // "Flush" card (padding 0, full-width tables): the header keeps its inset.
  const flush = style?.padding === 0;
  return (
    <section
      className="flex flex-col"
      style={{
        background: "var(--panel)",
        border: `1px solid ${danger ? "var(--dang)" : "var(--line)"}`,
        borderRadius: 14,
        padding: 20,
        gap: 16,
        boxShadow: "0 1px 2px rgba(13,28,23,.03)",
        ...style,
      }}
    >
      {(title || action) && (
        <div
          className="flex items-center gap-2"
          style={flush ? { padding: "18px 20px 0" } : undefined}
        >
          {title && (
            <h2
              className="uppercase"
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: ".12em",
                color: danger ? "var(--dang)" : "var(--ink-3)",
              }}
            >
              {title}
            </h2>
          )}
          {action && (
            <>
              <span className="flex-1" />
              {action}
            </>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** Field label + 12px ink-3 hint. */
export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label className="flex flex-col" style={{ gap: 6, ...style }}>
      <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{hint}</span>
      )}
    </label>
  );
}

export const inputStyle: CSSProperties = {
  borderColor: "var(--line)",
  background: "var(--panel)",
  color: "var(--ink)",
};

/*
 * Input field: h40, 13.5 px, radius 9, padding 0 12px — the V2 measurement, up
 * from V1's h32/13/radius-6. Still a fixed height and not a padding: `py-1.5`
 * let the height follow the font, and two neighbouring fields did not land at
 * the same height.
 */
export const FIELD = "h-10 rounded-[9px] border px-3 text-[13.5px] ohd-field outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, style, ...rest } = props;
  return (
    <input {...rest} className={`${FIELD} ${className ?? ""}`} style={{ ...inputStyle, ...style }} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, style, ...rest } = props;
  return (
    <select
      {...rest}
      className={`${FIELD} ${className ?? ""}`}
      style={{ ...inputStyle, ...style }}
    />
  );
}

/** 34×20 toggle, 16 knob (left 2→16) — pure CSS, .ohd-toggle class from the layout. */
export function Toggle({
  name,
  defaultChecked,
  label,
  hint,
  disabled,
  value = "on",
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
  hint?: string;
  disabled?: boolean;
  value?: string;
}) {
  return (
    <label
      className="ohd-toggle flex items-start gap-3"
      style={{ opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
      />
      <span className="ohd-knob" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium" style={{ fontSize: 13.5, color: "var(--ink)" }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{hint}</span>
        )}
      </span>
    </label>
  );
}

/** Gauge — orange beyond 85% (ST-11), 160×7 by default (ST-02). */
export function Gauge({
  value,
  max,
  width = 160,
}: {
  value: number;
  max: number;
  width?: number | string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span
      className="inline-block overflow-hidden align-middle"
      style={{ width, height: 7, borderRadius: 4, background: "var(--sunk)" }}
    >
      <span
        className="block h-full"
        style={{
          width: `${pct}%`,
          borderRadius: 4,
          background: pct > 85 ? "var(--wait)" : "var(--acc)",
        }}
      />
    </span>
  );
}

export function EnterpriseBadge({ label }: { label?: string }) {
  const t = useT();
  return (
    <span
      className="rounded-full font-bold uppercase"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.05em",
        padding: "2px 8px",
        background: "var(--new-t)",
        color: "var(--new)",
      }}
    >
      {label ?? t("app.settings.shell.enterpriseEdition")}
    </span>
  );
}

/**
 * EE locked state (ST-12/13/14): blur(3px) veil + Pro plan card.
 * When self-hosted the "Upgrade to the Pro plan" CTA has no destination
 * (ST-11 is invisible): EE badge and no button.
 */
export function LockedScreen({
  title,
  text,
  ghost,
  variant = "cloud",
}: {
  title: string;
  text: string;
  ghost: ReactNode;
  variant?: Edition;
}) {
  const t = useT();
  return (
    <div className="relative overflow-hidden rounded-[14px]" style={{ minHeight: 380 }}>
      <div aria-hidden style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
        {ghost}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="rounded-[14px] border text-center"
          style={{
            width: 420,
            maxWidth: "90%",
            background: "var(--panel)",
            borderColor: "var(--line)",
            padding: "26px 28px",
            boxShadow: "0 12px 32px rgba(17,33,28,.14)",
          }}
        >
          <EnterpriseBadge label={variant === "self-hosted" ? "EE" : undefined} />
          <h2 className="mt-3 font-semibold" style={{ fontSize: 16, color: "var(--ink)" }}>
            {title}
          </h2>
          <p className="mt-2" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {text}
          </p>
          {variant === "cloud" && (
            <Link
              href="/app/settings/billing"
              className="mt-4 inline-flex items-center font-semibold"
              style={{
                color: "var(--on-brand)",
                height: 38,
                borderRadius: 9,
                padding: "0 16px",
                fontSize: 13.5,
                background: "var(--brand)",
              }}
            >
              {t("app.settings.shell.manageSubscription")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-[14px] border border-dashed text-center"
      style={{
        borderColor: "var(--line)",
        padding: "40px 24px",
        gap: 15,
        background: "var(--panel)",
      }}
    >
      <p className="font-semibold" style={{ fontSize: 16, color: "var(--ink)" }}>
        {title}
      </p>
      {text && (
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: 420 }}>{text}</p>
      )}
      {children}
    </div>
  );
}

/**
 * Grid table header — V2: h40, --canvas background, 11px/600 spaced .09em.
 * The `gap-3` is kept: body rows use it too, and it is what guarantees that the
 * columns land in the same place as in the header.
 */
export function GridHead({
  columns,
  template,
}: {
  columns: string[];
  template: string;
}) {
  return (
    <div
      className="grid items-center gap-3 border-b uppercase"
      style={{
        gridTemplateColumns: template,
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
      {columns.map((c, i) => (
        <span key={i} className={i === columns.length - 1 ? "text-right" : ""}>
          {c}
        </span>
      ))}
    </div>
  );
}

/** Generic status pill (Verified, Pending, Active…). */
export function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "wait" | "dang" | "closed" | "open" | "new" | "acc";
  children: ReactNode;
}) {
  const bg = tone === "acc" ? "var(--acc-t)" : `var(--${tone}-t)`;
  const fg = tone === "acc" ? "var(--acc)" : `var(--${tone})`;
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full font-semibold"
      style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/** Priority dot (ST-07/ST-05) — Low #8A9993 · Normal #1D4ED8 · High #E2711D · Urgent #C0342B. */
export const PRIORITY_DOT_COLORS: Record<string, string> = {
  low: "#8A9993",
  normal: "#1D4ED8",
  high: "#E2711D",
  urgent: "#C0342B",
};

export function PriorityPill({ priority, label }: { priority: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 13, color: "var(--ink)" }}>
      <span
        className="inline-block rounded-full"
        style={{ width: 8, height: 8, background: PRIORITY_DOT_COLORS[priority] ?? "#8A9993" }}
      />
      {label}
    </span>
  );
}
