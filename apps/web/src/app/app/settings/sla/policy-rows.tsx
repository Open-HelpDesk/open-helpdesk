"use client";

/**
 * ST-07 — Policy list, exactly the shape of the V2 mock-up: one card per policy
 * (r14, its own border and shadow), a header carrying the drag handle, the mono
 * order number, name and scope, a status pill and a caret, and — for the open
 * one — the targets folded out underneath.
 *
 * Two things the mock-up decides, and that a list of rows could not express:
 *
 *  · The open policy is a **state of its card**, not a selected row. The border
 *    turns --brand-b, the header takes --canvas, the caret flips. Nothing lives
 *    below the list any more, so nothing scrolls out of view when you open the
 *    third policy.
 *  · One at a time. Clicking the open one closes it, as in the mock-up, and the
 *    first is open on arrival.
 *
 * The body is rendered on the server (it is a form bound to a server action) and
 * handed over as `body`. Every card's body is in the DOM: hiding the closed ones
 * keeps the toggle instant, and keeps each form's defaults intact — mounting a
 * form on expand would reset whatever had been typed into it.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { reorderSlaPolicies } from "./actions";

export type PolicyRow = {
  id: string;
  name: string;
  /** Who the policy applies to — the mock-up's second header line. */
  scope: string;
  /** The mock-up's pill — a switch for a normal policy, a badge for the default one. */
  status: ReactNode;
  /**
   * Saves the targets. It lives in the header rather than under the grid: the
   * bar is already where the policy's state is read, and a card that grows with
   * its content pushed the button further down the longer the policy got.
   * Only rendered on the open card — there is nothing to save on a closed one.
   */
  save: ReactNode;
  /**
   * Opens the policy editor. The mock-up has no such control — it only ever
   * draws the creation screen — but the name, the conditions, the calendar and
   * the reminder have to be reachable somewhere. It sits next to the caret and
   * borrows its box, so the header keeps the two-button rhythm it was drawn with.
   */
  edit: ReactNode;
  body: ReactNode;
};

export function PolicyRows({ policies }: { policies: PolicyRow[] }) {
  const t = useT();
  const router = useRouter();
  const [order, setOrder] = useState(policies);
  const [openId, setOpenId] = useState(policies[0]?.id ?? "");
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Policies can change server-side (creation, deletion): resynchronize.
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
    <div className="flex flex-col" style={{ gap: 14 }}>
      {order.map((p, index) => {
        const open = p.id === openId;
        return (
          <div
            key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(p.id)}
            onDragEnd={() => setDragId(null)}
            style={{
              border: `1px solid ${open ? "var(--brand-b)" : "var(--line)"}`,
              borderRadius: 14,
              background: "var(--panel)",
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(13,28,23,.03)",
              opacity: dragId === p.id ? 0.45 : 1,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                background: open ? "var(--canvas)" : "transparent",
              }}
            >
              <span
                style={{ color: "var(--ink-3)", cursor: "grab", fontSize: 14 }}
                title={t("app.settings.sla.dragToReorder")}
              >
                ⠿
              </span>
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: 11, color: "var(--ink-3)" }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{p.name}</div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.scope}
                </div>
              </div>
              {p.status}
              {open && p.save}
              {p.edit}
              {/* The caret is the control, so it is a real button: the header
                  itself stays draggable, and a drag never toggles the card. */}
              <button
                type="button"
                onClick={() => setOpenId(open ? "" : p.id)}
                aria-expanded={open}
                aria-label={p.name}
                style={{
                  width: 32,
                  height: 32,
                  flex: "none",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "var(--panel)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 10,
                  color: "var(--brand)",
                  cursor: "pointer",
                }}
              >
                {open ? "▲" : "▼"}
              </button>
            </div>
            <div hidden={!open}>{p.body}</div>
          </div>
        );
      })}
    </div>
  );
}
