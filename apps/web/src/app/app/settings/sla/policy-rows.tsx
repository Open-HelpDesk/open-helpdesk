"use client";

/**
 * ST-07 — Liste des politiques dans une carte unique : ⠿ glisser-déposer réel
 * (« Faites glisser pour réordonner »), n° d'ordre mono, nom + conditions, calendrier,
 * badge PAR DÉFAUT. La ligne sélectionnée porte le fond --acc-t et pilote la grille
 * de cibles affichée dessous.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { reorderSlaPolicies } from "./actions";

export type PolicyRow = {
  id: string;
  name: string;
  conditions: string;
  calendar: string;
  locked: boolean;
};

export function PolicyRows({
  policies,
  selectedId,
}: {
  policies: PolicyRow[];
  selectedId: string;
}) {
  const t = useT();
  const router = useRouter();
  const [order, setOrder] = useState(policies);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Les politiques peuvent changer côté serveur (création, suppression) : resynchronise.
  const serverKey = policies.map((p) => p.id).join("|");
  const localKey = order.map((p) => p.id).join("|");
  if (serverKey.split("|").sort().join("|") !== localKey.split("|").sort().join("|")) {
    setOrder(policies);
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = order.findIndex((p) => p.id === dragId);
    const to = order.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setOrder(next);
    setDragId(null);
    startTransition(async () => {
      await reorderSlaPolicies(next.map((p) => p.id));
      router.refresh();
    });
  }

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--panel)",
        overflow: "hidden",
      }}
    >
      {order.map((p, index) => {
        const selected = p.id === selectedId;
        return (
          <div
            key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(p.id)}
            onDragEnd={() => setDragId(null)}
            onClick={() => router.push(`/app/settings/sla?policy=${p.id}`)}
            className="ohd-hover"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              padding: "13px 15px",
              borderBottom:
                index === order.length - 1 ? "none" : "1px solid var(--line-2)",
              background: selected ? "var(--acc-t)" : "transparent",
              opacity: dragId === p.id ? 0.45 : 1,
              cursor: "pointer",
            }}
          >
            <span
              style={{ color: "var(--ink-3)", fontSize: 12, cursor: "grab" }}
              title={t("app.settings.sla.dragToReorder")}
            >
              ⠿
            </span>
            <span
              className="font-mono tabular-nums"
              style={{ fontSize: 11, color: "var(--ink-3)", width: 18 }}
            >
              {index + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.conditions}
              </div>
            </div>
            <span
              style={{ fontSize: 12.5, color: "var(--ink-2)", whiteSpace: "nowrap" }}
            >
              {p.calendar}
            </span>
            {p.locked && (
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "var(--closed-t)",
                  color: "var(--closed)",
                  whiteSpace: "nowrap",
                }}
              >
                {t("app.settings.sla.defaultBadge")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
