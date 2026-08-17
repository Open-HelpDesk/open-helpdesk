import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * Primitives partagées de l'administration (ST-01 → ST-14) — gabarit commun de
 * design-notes/administration.md : en-tête de page (chip code + titre 20px/600 +
 * sous-titre 13.5px), segmented control, barre de sauvegarde, cartes, toggles,
 * jauges, états vides et verrouillés (plans EE).
 */

export type PageTab = { label: string; href: string; active: boolean };

export function PageShell({
  maxWidth,
  children,
}: {
  maxWidth: number;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full flex-col" style={{ maxWidth, gap: 22 }}>
      {children}
    </div>
  );
}

export function PageHeader({
  code,
  title,
  subtitle,
  tabs,
  actions,
}: {
  code: string;
  title: string;
  subtitle: string;
  tabs?: PageTab[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded border font-mono"
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 5,
              borderColor: "var(--line)",
              color: "var(--ink-3)",
              background: "var(--panel)",
            }}
          >
            {code}
          </span>
          <h1
            className="font-semibold"
            style={{ fontSize: 20, letterSpacing: "-0.02em", color: "var(--ink)" }}
          >
            {title}
          </h1>
        </div>
        <p className="mt-1" style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: "70ch" }}>
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {tabs && tabs.length > 0 && <SegTabs tabs={tabs} />}
        {actions}
      </div>
    </header>
  );
}

/** Segmented control — conteneur --sunk radius 7 padding 2, segment actif fond panel/600. */
export function SegTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <div
      className="inline-flex items-center"
      style={{ background: "var(--sunk)", borderRadius: 7, padding: 2 }}
    >
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="whitespace-nowrap"
          style={{
            padding: "6px 12px",
            borderRadius: 5,
            fontSize: 12.5,
            fontWeight: t.active ? 600 : 400,
            color: t.active ? "var(--ink)" : "var(--ink-2)",
            background: t.active ? "var(--panel)" : "transparent",
            boxShadow: t.active ? "0 1px 2px rgba(17,33,28,.08)" : "none",
          }}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Barre de pied « ✓ Enregistré / Annuler / Enregistrer » — à placer DANS un <form>.
 * « ✓ Enregistré » s'affiche quand la server action a redirigé avec ?saved=1.
 */
export function SaveBar({
  saved,
  cancelHref,
  submitLabel = "Enregistrer",
  surface = "canvas",
}: {
  saved?: boolean;
  cancelHref: string;
  submitLabel?: string;
  /** « panel » quand la barre vit DANS une carte (fond blanc), « canvas » en pied de page. */
  surface?: "canvas" | "panel";
}) {
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
        <span style={{ fontSize: 12.5, color: "var(--ok)" }}>✓ Enregistré</span>
      )}
      <span className="flex-1" />
      <Link
        href={cancelHref}
        className="inline-flex items-center rounded-md border px-3 font-medium"
        style={{ height: 32, fontSize: 13, borderColor: "var(--line)", background: "var(--panel)", color: "var(--ink)" }}
      >
        Annuler
      </Link>
      <button
        type="submit"
        className="inline-flex items-center rounded-md px-3.5 font-semibold text-white"
        style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
      >
        {submitLabel}
      </button>
    </div>
  );
}

/** Carte de section — panel, bordure --line, radius 10. */
export function Card({
  title,
  action,
  children,
  style,
  danger,
}: {
  title?: string;
  /** Contenu aligné à droite du titre (badge de statut, lien…). */
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  danger?: boolean;
}) {
  // Carte « flush » (padding 0, tables pleine largeur) : l'en-tête garde son retrait.
  const flush = style?.padding === 0;
  return (
    <section
      className="rounded-[10px] border"
      style={{
        background: "var(--panel)",
        borderColor: danger ? "var(--dang)" : "var(--line)",
        padding: 18,
        ...style,
      }}
    >
      {(title || action) && (
        <div
          className="flex items-center gap-2"
          style={flush ? { padding: "14px 14px 12px" } : { marginBottom: 12 }}
        >
          {title && (
            <h2
              className="font-mono font-bold uppercase"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.07em",
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

/** Libellé de champ + hint 12px ink-3. */
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
    <label className="flex flex-col gap-1.5" style={style}>
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
  background: "var(--bg)",
  color: "var(--ink)",
};

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, style, ...rest } = props;
  return (
    <input
      {...rest}
      className={`rounded-md border px-2.5 py-1.5 text-sm ${className ?? ""}`}
      style={{ ...inputStyle, ...style }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, style, ...rest } = props;
  return (
    <select
      {...rest}
      className={`rounded-md border px-2 py-1.5 text-sm ${className ?? ""}`}
      style={{ ...inputStyle, ...style }}
    />
  );
}

/** Toggle 34×20 pastille 16 (left 2→16) — CSS pur, classe .st-toggle du layout. */
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
      className="st-toggle flex items-start gap-3"
      style={{ opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
      />
      <span className="st-knob" aria-hidden />
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

/** Jauge — orange au-delà de 85 % (ST-11), 160×7 par défaut (ST-02). */
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

export function PlanProBadge({ label = "PLAN PRO" }: { label?: string }) {
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
      {label}
    </span>
  );
}

/** État verrouillé EE (ST-12/13/14) : voile blur(3px) + carte plan Pro. */
export function LockedScreen({
  title,
  text,
  ghost,
}: {
  title: string;
  text: string;
  ghost: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[10px]" style={{ minHeight: 380 }}>
      <div aria-hidden style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
        {ghost}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="rounded-[10px] border text-center"
          style={{
            width: 420,
            maxWidth: "90%",
            background: "var(--panel)",
            borderColor: "var(--line)",
            padding: "26px 28px",
            boxShadow: "0 12px 32px rgba(17,33,28,.14)",
          }}
        >
          <PlanProBadge />
          <h2 className="mt-3 font-semibold" style={{ fontSize: 16, color: "var(--ink)" }}>
            {title}
          </h2>
          <p className="mt-2" style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {text}
          </p>
          <Link
            href="/app/settings/billing"
            className="mt-4 inline-flex items-center rounded-md px-4 font-semibold text-white"
            style={{ height: 32, fontSize: 13, background: "var(--acc)" }}
          >
            Passer au plan Pro
          </Link>
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
      className="flex flex-col items-center rounded-[12px] border border-dashed text-center"
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
 * En-tête de table en grid — design : h34, fond --sunk, 11px/700 ink-3.
 * Le `gap-3` est conservé : les lignes de corps l'utilisent aussi, et c'est lui qui
 * garantit que les colonnes tombent au même endroit qu'en-tête.
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
      className="grid items-center gap-3 border-b font-bold"
      style={{
        gridTemplateColumns: template,
        minHeight: 34,
        fontSize: 11,
        letterSpacing: "0.03em",
        color: "var(--ink-3)",
        background: "var(--sunk)",
        borderColor: "var(--line)",
        padding: "0 14px",
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

/** Pastille de statut générique (Vérifiée, En attente, Actif…). */
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
      style={{ fontSize: 11.5, padding: "2px 8px", background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/** Pastille priorité (ST-07/ST-05) — Basse #8A9993 · Normale #1D4ED8 · Haute #E2711D · Urgente #C0342B. */
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
