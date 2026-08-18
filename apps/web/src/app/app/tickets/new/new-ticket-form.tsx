"use client";

/**
 * AG-05 — Formulaire « Nouveau ticket » : combobox contact réelle (recherche
 * /api/search, « + Créer le contact »), grille Sujet/Formulaire, description avec
 * toolbar, 4 selects, encart email, pied sunk.
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

/** Champ pleine largeur du design : h36, padding 0 10px, 13.5px. */
const inputStyle = {
  height: 36,
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--bg)",
  color: "var(--ink)",
  fontSize: 13.5,
  padding: "0 10px",
  width: "100%",
} as const;

/** Selects de la grille 4 colonnes : h34, padding 0 9px, 13px. */
const selectStyle = { ...inputStyle, height: 34, fontSize: 13, padding: "0 9px" } as const;

/** Libellé de champ : 12px/600 ink-2. */
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--ink-2)" } as const;

function Req() {
  return <span style={{ color: "var(--dang)" }}>*</span>;
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
        /* requête annulée */
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
      <div className="flex flex-col" style={{ padding: 18, gap: 15 }}>
        {/* Contact — combobox */}
        <div ref={boxRef} className="relative flex flex-col" style={{ gap: 6 }}>
          <label style={labelStyle}>
            {t("app.newTicket.contact")} <Req />
          </label>
          {chosen ? (
            <div
              className="flex items-center gap-2"
              style={{ ...inputStyle, display: "flex", padding: "0 10px" }}
            >
              <Avatar name={chosen.name ?? chosen.email} size={20} tone={1} />
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13.5 }}>
                {chosen.name ?? chosen.email}
                <span style={{ color: "var(--ink-3)" }}> · {chosen.email}</span>
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
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateMode(false);
              }}
              onFocus={() => hits.length > 0 && setOpen(true)}
              placeholder={t("app.newTicket.contactPlaceholder")}
              style={inputStyle}
              autoComplete="off"
            />
          )}
          {open && !chosen && query.trim().length >= 2 && (
            <div
              className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col overflow-hidden shadow-lg"
              style={{
                padding: 4,
                borderRadius: 6,
                background: "var(--panel)",
                border: "1px solid var(--line)",
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
                  className="flex items-center text-left"
                  style={{ gap: 8, padding: "7px 9px", borderRadius: 5 }}
                >
                  <Avatar name={c.name ?? c.email} size={22} tone={1} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 13 }}>
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
                className="text-left"
                style={{
                  padding: "7px 9px",
                  borderRadius: 5,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--acc-2)",
                }}
              >
                {t("app.newTicket.createContact", { name: query.trim() })}
              </button>
            </div>
          )}
          {createMode && !chosen && (
            <div className="mt-1 grid grid-cols-2" style={{ gap: 12 }}>
              <label className="flex flex-col" style={{ gap: 6 }}>
                <span style={labelStyle}>
                  {t("app.newTicket.newContactEmail")} <Req />
                </span>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={query.includes("@") ? query.trim() : ""}
                  style={inputStyle}
                />
              </label>
              <label className="flex flex-col" style={{ gap: 6 }}>
                <span style={labelStyle}>{t("app.newTicket.newContactName")}</span>
                <input
                  name="name"
                  defaultValue={query.includes("@") ? "" : query.trim()}
                  style={inputStyle}
                />
              </label>
            </div>
          )}
          {!createMode && <input type="hidden" name="email" value={emailValue} />}
        </div>

        {/* Sujet / Formulaire — grille 1fr 220px */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
          <label className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>
              {t("app.newTicket.subject")} <Req />
            </span>
            <input name="subject" required style={inputStyle} />
          </label>
          <label className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("app.newTicket.form")}</span>
            <select name="formId" defaultValue={forms[0]?.id ?? ""} style={inputStyle}>
              {forms.length === 0 && <option value="">—</option>}
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Description : toolbar + corps dans une seule boîte bordée */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <label style={labelStyle}>{t("app.newTicket.description")}</label>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--bg)",
            }}
          >
            <div
              className="flex"
              style={{ gap: 1, padding: "5px 6px", borderBottom: "1px solid var(--line)" }}
            >
              {TOOLBAR.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  title={b.title}
                  onClick={b.run}
                  className="grid place-items-center hover:opacity-70"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    color: "var(--ink-2)",
                    fontSize: 11.5,
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
                padding: 11,
                minHeight: 100,
                fontSize: 13.5,
                lineHeight: 1.55,
                background: "transparent",
                color: "var(--ink)",
              }}
            />
          </div>
        </div>

        {/* 4 selects — repeat(4,1fr) gap 10 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <label className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("app.newTicket.status")}</span>
            <select name="status" defaultValue="new" style={selectStyle}>
              <option value="new">{t("app.newTicket.statusNew")}</option>
              <option value="open">{t("app.newTicket.statusOpen")}</option>
              <option value="waiting">{t("app.newTicket.statusWaiting")}</option>
              <option value="on_hold">{t("app.newTicket.statusOnHold")}</option>
            </select>
          </label>
          <label className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("app.newTicket.priority")}</span>
            <select name="priority" defaultValue="normal" style={selectStyle}>
              {Object.entries(PRIORITY_KEYS).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("app.newTicket.assignee")}</span>
            <select name="assigneeId" defaultValue="me" style={selectStyle}>
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
          </label>
          <label className="flex flex-col" style={{ gap: 6 }}>
            <span style={labelStyle}>{t("app.newTicket.tags")}</span>
            <select name="tag" defaultValue="" style={selectStyle}>
              <option value="">{t("app.newTicket.tagNone")}</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Encart email */}
        <label
          className="flex cursor-pointer items-center"
          style={{
            gap: 8,
            padding: "9px 11px",
            borderRadius: 7,
            fontSize: 13,
            background: "var(--acc-t)",
            border: "1px solid var(--acc-b)",
          }}
        >
          <input
            type="checkbox"
            name="sendEmail"
            defaultChecked
            style={{ width: 15, height: 15, borderRadius: 4, accentColor: "var(--acc)" }}
          />
          {t("app.newTicket.sendEmail")}
        </label>
      </div>

      {/* Pied sunk */}
      <div
        className="flex justify-end border-t"
        style={{
          gap: 8,
          padding: "12px 18px",
          background: "var(--sunk)",
          borderColor: "var(--line)",
        }}
      >
        <Link
          href="/app/tickets"
          className="grid place-items-center"
          style={{
            height: 34,
            padding: "0 14px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            fontSize: 13,
            background: "var(--panel)",
          }}
        >
          {t("app.newTicket.cancel")}
        </Link>
        <button
          type="submit"
          className="grid place-items-center font-semibold text-white"
          style={{ height: 34, padding: "0 16px", borderRadius: 6, background: "var(--acc)", fontSize: 13 }}
        >
          {t("app.newTicket.submit")}
        </button>
      </div>
    </form>
  );
}
