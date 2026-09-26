/** The silhouette behind a locked ee/ tab: the shape of the screen, not one invented value. */
export function Ghost({ rows }: { rows: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[0, 1].map((card) => (
        <div key={card} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ width: 160, height: 9, borderRadius: 4, background: "var(--sunk)" }} />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", borderBottom: "1px solid var(--line-2)" }}>
              <div style={{ width: 140 + ((i * 37) % 90), height: 10, borderRadius: 4, background: "var(--sunk)" }} />
              <span style={{ flex: 1 }} />
              <div style={{ width: 180, height: 26, borderRadius: 8, background: "var(--sunk)" }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
