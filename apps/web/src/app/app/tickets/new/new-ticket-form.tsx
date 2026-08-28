"use client";

/**
 * AG-05 — "New ticket" form (V2): fields 42 px tall on radius 10, labels
 * 12.5/600, the description in a bordered box, and the canvas footer.
 *
 * The mockup asks for four fields (requester, type, priority, subject) plus a
 * description. The form carries five more that the ticket really has — status,
 * assignee, tag, the form template, and "send the reply by email" — so those sit
 * in a metadata row under the description instead of being dropped: the mockup
 * does not draw them, but it does not say the ticket has no assignee either.
 *
 * The mockup's "📎 Attach" in the footer IS dropped: nothing on this route
 * uploads a file, and a control that does nothing is worse than a missing one.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ticket-bits";
import { PRIORITY_KEYS } from "@/lib/format";
import { useT } from "@/i18n/client";
import { createTicket } from "../actions";

type ContactHit = {
  id: string;
  name: string | null;
  email: string;
  organizationName?: string | null;
};

/** V2 field: h42, padding 0 12px, radius 10, 13.5px. */
const fieldStyle = {
  height: 42,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--panel)",
  color: "var(--ink)",
  fontSize: 13.5,
  padding: "0 12px",
  width: "100%",
} as const;

/** Field label: 12.5px/600 ink-2. */
const labelStyle = { fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" } as const;

function Req() {
  return <span style={{ color: "var(--dang)" }}>*</span>;
}

function Field({ label, required, children }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col" style={{ gap: 6 }}>
      <span style={labelStyle}>
        {label} {required && <Req />}
      </span>
      {children}
    </label>
  );
}

export function NewTicketForm({
  forms,
  agents,
  tags,
  meId,
}: {
  forms: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  tags: string[];
  meId: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ContactHit | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [body, setBody] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chosen || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { contacts: ContactHit[] };
          setHits(data.contacts ?? []);
          setOpen(true);
        }
      } catch {
        /* request cancelled */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, chosen]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function insertMd(before: string, after = "", placeholder = "") {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const sel = body.slice(start, end) || placeholder;
    setBody(body.slice(0, start) + before + sel + after + body.slice(end));
    requestAnimationFrame(() => el.focus());
  }

  const mdText = t("app.newTicket.placeholderText");
  const TOOLBAR: { label: string; title: string; run: () => void }[] = [
    { label: "B", title: t("app.newTicket.bold"), run: () => insertMd("**", "**", mdText) },
    { label: "I", title: t("app.newTicket.italic"), run: () => insertMd("*", "*", mdText) },
    { label: "U", title: t("app.newTicket.underline"), run: () => insertMd("<u>", "</u>", mdText) },
    { label: "S", title: t("app.newTicket.strike"), run: () => insertMd("~~", "~~", mdText) },
    {
      label: "≔",
      title: t("app.newTicket.list"),
      run: () => insertMd("\n- ", "", t("app.newTicket.placeholderItem")),
    },
    { label: "⛓", title: t("app.newTicket.link"), run: () => insertMd("[", "](https://)", mdText) },
    {
      label: "❝",
      title: t("app.newTicket.quote"),
      run: () => insertMd("\n> ", "", t("app.newTicket.placeholderQuote")),
    },
    {
      label: "‹›",
      title: t("app.newTicket.code"),
      run: () => insertMd("`", "`", t("app.newTicket.placeholderCode")),
    },
  ];

  const emailValue = chosen ? chosen.email : createMode ? query.trim() : "";

  return (
    <form action={createTicket} className="flex flex-col">
      <div className="flex flex-col" style={{ padding: 20, gap: 14 }}>
        {/* Requester — combobox */}
        <div ref={boxRef} className="relative flex flex-col" style={{ gap: 6 }}>
          <span style={labelStyle}>
            {t("app.newTicket.contact")} <Req />
          </span>
          {chosen ? (
            <div className="flex items-center" style={{ ...fieldStyle, gap: 9 }}>
              <Avatar name={chosen.name ?? chosen.email} size={24} fontSize={9} tone={1} />
              <span className="min-w-0 flex-1 truncate">
                {chosen.name ?? chosen.email}
                <span style={{ color: "var(--ink-3)" }}> — {chosen.email}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setChosen(null);
                  setQuery("");
                }}
                style={{ color: "var(--ink-3)" }}
                title={t("app.newTicket.changeContact")}
              >
                ✕
              </button>
            </div>
          ) : (
            <input
              className="ohd-field outline-none"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateMode(false);
              }}
              onFocus={() => hits.length > 0 && setOpen(true)}
              placeholder={t("app.newTicket.contactPlaceholder")}
              style={fieldStyle}
              autoComplete="off"
            />
          )}
          {open && !chosen && query.trim().length >= 2 && (
            <div
              className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col overflow-hidden"
              style={{
                padding: 5,
                borderRadius: 12,
                background: "var(--panel)",
                border: "1px solid var(--line)",
                boxShadow: "0 12px 32px rgba(0,0,0,.14)",
              }}
            >
              {hits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChosen(c);
                    setOpen(false);
                  }}
                  className="ohd-hover flex items-center text-left"
                  style={{ gap: 9, padding: "8px 10px", borderRadius: 9 }}
                >
                  <Avatar name={c.name ?? c.email} size={24} fontSize={9} tone={1} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 13.5 }}>
                      {c.name ?? c.email}
                    </span>
                    <span
                      className="block truncate"
                      style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                    >
                      {c.email}
                      {c.organizationName ? ` · ${c.organizationName}` : ""}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCreateMode(true);
                  setOpen(false);
                }}
                className="ohd-hover text-left"
                style={{
                  padding: "8px 10px",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--brand)",
                }}
              >
                {t("app.newTicket.createContact", { name: query.trim() })}
              </button>
            </div>
          )}
          {createMode && !chosen && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 2 }}>
              <Field label={t("app.newTicket.newContactEmail")} required>
                <input
                  className="ohd-field outline-none"
                  name="email"
                  type="email"
                  required
                  defaultValue={query.includes("@") ? query.trim() : ""}
                  style={fieldStyle}
                />
              </Field>
              <Field label={t("app.newTicket.newContactName")}>
                <input
                  className="ohd-field outline-none"
                  name="name"
                  defaultValue={query.includes("@") ? "" : query.trim()}
                  style={fieldStyle}
                />
              </Field>
            </div>
          )}
          {!createMode && <input type="hidden" name="email" value={emailValue} />}
        </div>

        {/* Type (form template) · Priority */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("app.newTicket.form")}>
            <select
              className="ohd-field outline-none"
              name="formId"
              defaultValue={forms[0]?.id ?? ""}
              style={fieldStyle}
            >
              {forms.length === 0 && <option value="">—</option>}
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("app.newTicket.priority")}>
            <select
              className="ohd-field outline-none"
              name="priority"
              defaultValue="normal"
              style={fieldStyle}
            >
              {Object.entries(PRIORITY_KEYS).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t("app.newTicket.subject")} required>
          <input className="ohd-field outline-none" name="subject" required style={fieldStyle} />
        </Field>

        {/* Description: toolbar + body in a single bordered box */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span style={labelStyle}>{t("app.newTicket.description")}</span>
          <div
            className="ohd-field"
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: "var(--panel)",
            }}
          >
            <div
              className="flex"
              style={{ gap: 1, padding: "6px 8px", borderBottom: "1px solid var(--line)" }}
            >
              {TOOLBAR.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  title={b.title}
                  onClick={b.run}
                  className="ohd-hover grid place-items-center"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    color: "var(--ink-2)",
                    fontSize: 12,
                    fontWeight: b.label === "B" ? 700 : 400,
                    fontStyle: b.label === "I" ? "italic" : undefined,
                    textDecoration:
                      b.label === "U" ? "underline" : b.label === "S" ? "line-through" : undefined,
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              name="body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full resize-y border-0 outline-none"
              style={{
                padding: 12,
                minHeight: 96,
                fontSize: 13.5,
                lineHeight: 1.6,
                background: "transparent",
                color: "var(--ink)",
              }}
            />
          </div>
        </div>

        {/* Where the ticket lands: status, owner, tag */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <Field label={t("app.newTicket.status")}>
            <select
              className="ohd-field outline-none"
              name="status"
              defaultValue="new"
              style={fieldStyle}
            >
              <option value="new">{t("app.newTicket.statusNew")}</option>
              <option value="open">{t("app.newTicket.statusOpen")}</option>
              <option value="waiting">{t("app.newTicket.statusWaiting")}</option>
              <option value="on_hold">{t("app.newTicket.statusOnHold")}</option>
            </select>
          </Field>
          <Field label={t("app.newTicket.assignee")}>
            <select
              className="ohd-field outline-none"
              name="assigneeId"
              defaultValue="me"
              style={fieldStyle}
            >
              <option value="me">{t("app.newTicket.assigneeMe")}</option>
              <option value="">{t("app.newTicket.assigneeNone")}</option>
              {agents
                .filter((a) => a.id !== meId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t("app.newTicket.tags")}>
            <select className="ohd-field outline-none" name="tag" defaultValue="" style={fieldStyle}>
              <option value="">{t("app.newTicket.tagNone")}</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Email callout */}
        <label
          className="flex cursor-pointer items-center"
          style={{
            gap: 9,
            padding: "11px 13px",
            borderRadius: 10,
            fontSize: 13,
            background: "var(--brand-t)",
            border: "1px solid var(--brand-b)",
          }}
        >
          <input
            type="checkbox"
            name="sendEmail"
            defaultChecked
            style={{ width: 15, height: 15, borderRadius: 4, accentColor: "var(--brand)" }}
          />
          {t("app.newTicket.sendEmail")}
        </label>
      </div>

      {/* Canvas footer */}
      <div
        className="flex items-center justify-end"
        style={{
          gap: 10,
          padding: "13px 20px",
          background: "var(--canvas)",
          borderTop: "1px solid var(--line)",
        }}
      >
        <Link
          href="/app/tickets"
          className="ohd-hover-edge-ink grid place-items-center"
          style={{
            height: 36,
            padding: "0 15px",
            border: "1px solid var(--line)",
            borderRadius: 9,
            background: "var(--panel)",
            fontSize: 13,
          }}
        >
          {t("app.newTicket.cancel")}
        </Link>
        <button
          type="submit"
          className="grid place-items-center font-semibold text-white"
          style={{
            height: 36,
            padding: "0 17px",
            borderRadius: 9,
            background: "var(--brand)",
            fontSize: 13,
          }}
        >
          {t("app.newTicket.submit")}
        </button>
      </div>
    </form>
  );
}
