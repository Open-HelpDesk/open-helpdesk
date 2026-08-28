/**
 * Shared V2 furniture for the list screens (contacts, organisations, knowledge
 * base, reports).
 *
 * The design gives all four the same shape: a 1080 px column, a title in the
 * display face with a sentence under it, actions on the right, then content in
 * cards. Writing that four times by hand is four places for the padding to
 * drift, which is what the V1 screens had — three different table paddings and
 * two different header sizes across screens that are the same screen.
 *
 * Server components: nothing here has state.
 */
import type { CSSProperties, ReactNode } from "react";

/**
 * The centred column every V2 list screen sits in.
 *
 * `h-full` and not only `flex-1`: the shell hands the page a block with
 * `overflow-hidden`, so a column sized by its content is clipped instead of
 * scrolling — the scroll has to happen here, against a height it can measure.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full min-w-0 flex-1 overflow-auto">
      <div
        className="flex flex-col"
        style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 26px 40px", gap: 18 }}
      >
        {children}
      </div>
    </div>
  );
}

/** Title, one explanatory sentence, and the screen's actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 14 }}>
      <div className="flex flex-col" style={{ gap: 4, flex: 1, minWidth: 240 }}>
        <h1
          style={{
            fontFamily: "var(--font-title)",
            fontSize: 23,
            fontWeight: 600,
            letterSpacing: "-.015em",
          }}
        >
          {title}
        </h1>
        {subtitle && <p style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Secondary action of a page header — outlined, 38 px. */
export const secondaryAction: CSSProperties = {
  height: 38,
  padding: "0 15px",
  border: "1px solid var(--line)",
  borderRadius: 9,
  background: "var(--panel)",
  display: "flex",
  alignItems: "center",
  fontSize: 13,
};

/** Primary action of a page header — filled, 38 px. */
export const primaryAction: CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 9,
  background: "var(--brand)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  fontSize: 13.5,
  fontWeight: 600,
};

/** A card: the surface every V2 block sits on. */
export const card: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 14,
  background: "var(--panel)",
  boxShadow: "0 1px 2px rgba(13,28,23,.03)",
};

/** Uppercase group label used inside cards and panels. */
export const groupLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

/**
 * A table drawn as a card: one grid template shared by the header and the rows,
 * so a column cannot be wide in the header and narrow in the body — which is
 * exactly what happens when the two are written separately.
 */
export function DataTable({
  columns,
  minWidth,
  head,
  children,
}: {
  /** CSS grid-template-columns, e.g. "minmax(220px,1.4fr) 120px 80px". */
  columns: string;
  minWidth: number;
  /** Header cells; the last one is right-aligned by the caller if needed. */
  head: ReactNode[];
  children: ReactNode;
}) {
  return (
    <div style={{ ...card, overflowX: "auto" }}>
      <div
        className="grid items-center border-b"
        style={{
          gridTemplateColumns: columns,
          minWidth,
          padding: "0 18px",
          height: 40,
          background: "var(--canvas)",
          borderColor: "var(--line)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--ink-3)",
          letterSpacing: ".09em",
          textTransform: "uppercase",
        }}
      >
        {head.map((cell, i) => (
          <div key={i}>{cell}</div>
        ))}
      </div>
      {children}
    </div>
  );
}

/** One row of a DataTable. Same template as the header, by construction. */
export function DataRow({
  columns,
  minWidth,
  children,
}: {
  columns: string;
  minWidth: number;
  children: ReactNode;
}) {
  return (
    <div
      className="ohd-row grid items-center border-b"
      style={{
        gridTemplateColumns: columns,
        minWidth,
        padding: "0 18px",
        minHeight: 54,
        borderColor: "var(--line-2)",
        fontSize: 13.5,
      }}
    >
      {children}
    </div>
  );
}
